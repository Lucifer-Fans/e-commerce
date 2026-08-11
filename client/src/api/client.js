import axios from 'axios';
import i18n from '../i18n';
import { getSocketId } from '../realtime/socket';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // carries the refresh cookie
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

/* ---------------- Retry policy for transient failures ---------------- */
/**
 * A read that fails because nothing answered is retried here rather than handed
 * to the screen as an error.
 *
 * This is the difference between "the backend was still waking up" and "the page
 * is broken". A cold or briefly saturated API drops the *first* request of a
 * visit and answers every one after it — which is exactly the shape of the bug
 * this policy exists for: the storefront used to paint a red retry panel that a
 * manual browser refresh always cleared, because by then the server was warm.
 *
 * Only idempotent methods qualify. A POST that timed out may well have been
 * received and acted on, so re-sending it could place a second order.
 */
const RETRY_METHODS = new Set(['get', 'head', 'options']);
/** Gateway-shaped statuses only: the request never reached a handler that decided anything. */
const RETRY_STATUSES = new Set([502, 503, 504]);

/**
 * A timeout has already cost the caller the full 30s, so it gets one more go and
 * no more; a refused connection or a 502 failed in milliseconds and can afford two.
 * Nothing here raises the per-attempt deadline — a slow request is still a failed
 * request, it is simply no longer a *terminal* one.
 */
const maxAttemptsFor = (code) => (code === 'ECONNABORTED' ? 2 : 3);

/** 400ms, then 1200ms, each ±25% so a crowd of boot requests doesn't retry in lockstep. */
const backoffMs = (attempt) => {
  const base = 400 * 3 ** (attempt - 1);
  return Math.round(base * (0.75 + Math.random() * 0.5));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shouldRetry(error) {
  const { config, response } = error;
  // `_noRetry` is the per-call opt-out for a read whose caller would rather fail fast.
  if (!config || config._noRetry) return false;
  if (!RETRY_METHODS.has((config.method || 'get').toLowerCase())) return false;

  if (response) {
    // A response that arrived and said something other than "I couldn't route this"
    // is an answer, not a blip — retrying it would just repeat the same answer.
    if (!RETRY_STATUSES.has(response.status)) return false;
    /*
     * …with one exception inside the retryable set. The API's own backstop
     * (server/src/middleware/requestTimeout.js) answers a stalled handler with a
     * 503 at 25s. That is not a blip the network dropped, it is the server saying
     * a handler is stuck — and asking it again just buys another 25s of skeleton
     * before the same answer. Report it and let the shopper decide.
     */
    if (response.data?.code === 'REQUEST_TIMEOUT') return false;
  }

  const attempts = config._attempt || 1;
  return attempts < maxAttemptsFor(error.code);
}

/* ---------------- Access token (memory + localStorage mirror) ---------------- */
const TOKEN_KEY = 'ps_access_token';
let accessToken = localStorage.getItem(TOKEN_KEY) || null;

export const setAccessToken = (token) => {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};
export const getAccessToken = () => accessToken;

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  const isRead = method === 'get' || method === 'head';

  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;

  /*
   * Keep reads inside the CORS "simple request" rules, so the browser sends them
   * straight out instead of preceding each one with an OPTIONS preflight.
   *
   * `application/json` is not a safelisted Content-Type value, and the instance
   * default above applied it to every call — including bodyless GETs, where it
   * describes nothing. That alone doubled the round trips the storefront's boot
   * burst had to survive (session, settings, categories, banners, home feed), and
   * the API sends no Access-Control-Max-Age, so browsers re-ran the preflight
   * every few seconds rather than reusing one. Against a cold backend that was
   * the difference between the home page loading and the home page timing out.
   *
   * Writes keep the header: they carry a body, and their preflight is one
   * round trip on a deliberate user action rather than five on every page view.
   */
  if (isRead || config.data === undefined || config.data === null) {
    delete config.headers['Content-Type'];
  }
  // Let the browser set the multipart boundary itself — with the JSON default left in
  // place axios serialises the FormData to JSON and the file never reaches the server.
  if (config.data instanceof FormData) delete config.headers['Content-Type'];

  // Lets the server tag its broadcast as originating here, so this tab can skip the
  // echo of a change it already applied. Only writes are broadcast, so only writes
  // need to be attributable — and this header is the other thing that would drag a
  // read back into preflight territory.
  if (!isRead) {
    const socketId = getSocketId();
    if (socketId) config.headers['X-Socket-Id'] = socketId;
  }

  // Which language the catalogue should come back in. Read per request rather than
  // captured at module load, so a switch applies to the very next call.
  // (`Accept-Language` is CORS-safelisted, so it costs no preflight.)
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

/* ---------------- Silent refresh with request queueing ---------------- */
let refreshPromise = null;
const AUTH_FREE_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-otp',
  '/auth/google',
  '/auth/refresh',
  '/auth/admin/login',
];

/**
 * What actually went wrong, in the console, while the caller still gets the one
 * clean sentence it renders.
 *
 * Every rejection below is a plain object, and a rejected *object* is not an
 * Error — the browser prints it as an uncaught value at best and, once a thunk
 * catches it, not at all. That is why a request that timed out used to paint a
 * red banner over an empty console with nothing to debug from: the failure was
 * handled correctly and reported nowhere. The user-facing copy is untouched;
 * this only writes the parts a developer needs beside it.
 */
const logFailure = (error, summary) => {
  const { config, response } = error;
  const route = `${config?.method?.toUpperCase() || 'REQUEST'} ${config?.baseURL || ''}${config?.url || ''}`;
  console.error(`[api] ${route} → ${summary}`, {
    status: response?.status ?? 0,
    code: error.code || response?.data?.code || null,
    serverMessage: response?.data?.message || null,
    timeoutMs: config?.timeout,
    // How many times this was tried before giving up — a failure that got here
    // after three attempts is a different problem from one that never retried.
    attempts: config?._attempt || 1,
    error,
  });
};

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { config, response } = error;

    /*
     * Ride out a blip before anyone is told about it. Placed ahead of every branch
     * below so a retried request that succeeds never reaches the logging or the
     * rejection at all — the screen simply gets its data, a beat later.
     */
    if (shouldRetry(error)) {
      const attempt = config._attempt || 1;
      config._attempt = attempt + 1;
      await wait(backoffMs(attempt));
      return api(config);
    }

    if (!response) {
      const timedOut = error.code === 'ECONNABORTED';
      logFailure(
        error,
        timedOut
          ? `no response within ${config?.timeout ?? '?'}ms — the server accepted the request but ` +
            `never answered. Check the API logs for a stalled handler.`
          : 'no response — server unreachable, CORS-blocked, or the API is not running.'
      );

      return Promise.reject({
        message: timedOut
          ? 'The request timed out. Please try again.'
          : 'Cannot reach the server. Check your connection and try again.',
        status: 0,
        code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      });
    }

    const isAuthCall = AUTH_FREE_PATHS.some((p) => config?.url?.includes(p));

    if (response.status === 401 && !config._retried && !isAuthCall) {
      config._retried = true;
      try {
        // Concurrent 401s share one refresh round trip instead of stampeding.
        refreshPromise = refreshPromise || api.post('/auth/refresh');
        const result = await refreshPromise;
        refreshPromise = null;
        setAccessToken(result.data.accessToken);
        return api(config);
      } catch {
        refreshPromise = null;
        setAccessToken(null);
        window.dispatchEvent(new CustomEvent('auth:expired'));
        return Promise.reject({ message: 'Your session expired. Please log in again.', status: 401 });
      }
    }

    // 4xx is the API answering as designed (a duplicate email, a wrong code) and
    // the screen already shows it; 5xx is the API breaking, which is worth a line
    // in the console next to whatever the shopper is being shown.
    if (response.status >= 500) {
      logFailure(error, `server error ${response.status}`);
    }

    return Promise.reject({
      message: response.data?.message || 'Something went wrong. Please try again.',
      // Set only on the failures a screen renders specially rather than as plain
      // red text — the login lockout warning is the one that reads it today.
      code: response.data?.code || null,
      errors: response.data?.errors || null,
      status: response.status,
    });
  }
);

export default api;
