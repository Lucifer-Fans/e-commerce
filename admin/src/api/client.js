import axios from 'axios';
import { getSocketId } from '../realtime/socket';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const TOKEN_KEY = 'ps_admin_token';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 60000, // uploads can be slow on poor connections
  headers: { 'Content-Type': 'application/json' },
});

let accessToken = localStorage.getItem(TOKEN_KEY) || null;

export const setAccessToken = (token) => {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};
export const getAccessToken = () => accessToken;

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Let the browser set the multipart boundary itself.
  if (config.data instanceof FormData) delete config.headers['Content-Type'];
  // Lets the server tag its broadcast as originating here, so this tab can skip the
  // echo of a change it already applied.
  const socketId = getSocketId();
  if (socketId) config.headers['X-Socket-Id'] = socketId;
  // Names this front-end on the login-session record, so an admin console sign-in is
  // recognisable as one on the account's devices screen.
  config.headers['X-Client'] = 'admin';
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { config, response } = error;

    if (!response) {
      return Promise.reject({
        message:
          error.code === 'ECONNABORTED'
            ? 'The request timed out. Please try again.'
            : 'Cannot reach the API server. Is it running?',
        status: 0,
      });
    }

    const isAuthCall = config?.url?.includes('/auth/');

    if (response.status === 401 && !config._retried && !isAuthCall) {
      config._retried = true;
      try {
        refreshPromise = refreshPromise || api.post('/auth/refresh');
        const result = await refreshPromise;
        refreshPromise = null;
        setAccessToken(result.data.accessToken);
        return api(config);
      } catch {
        refreshPromise = null;
        setAccessToken(null);
        window.dispatchEvent(new CustomEvent('admin:auth-expired'));
        return Promise.reject({ message: 'Your session expired. Please log in again.', status: 401 });
      }
    }

    return Promise.reject({
      message: response.data?.message || 'Something went wrong',
      // Set only on the failures a screen renders specially rather than as a plain
      // error alert — the sign-in lockout warning is the one that reads it today.
      code: response.data?.code || null,
      errors: response.data?.errors || null,
      status: response.status,
    });
  }
);

export default api;
