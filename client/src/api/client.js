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
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Let the browser set the multipart boundary itself — with the JSON default left in
  // place axios serialises the FormData to JSON and the file never reaches the server.
  if (config.data instanceof FormData) delete config.headers['Content-Type'];
  // Lets the server tag its broadcast as originating here, so this tab can skip the
  // echo of a change it already applied.
  const socketId = getSocketId();
  if (socketId) config.headers['X-Socket-Id'] = socketId;
  // Which language the catalogue should come back in. Read per request rather than
  // captured at module load, so a switch applies to the very next call.
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
    error,
  });
};

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { config, response } = error;

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
