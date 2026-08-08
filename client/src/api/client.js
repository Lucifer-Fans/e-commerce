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

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { config, response } = error;

    if (!response) {
      return Promise.reject({
        message: error.code === 'ECONNABORTED'
          ? 'The request timed out. Please try again.'
          : 'Cannot reach the server. Check your connection and try again.',
        status: 0,
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
