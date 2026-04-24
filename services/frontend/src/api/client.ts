import axios from 'axios';
import { trackEvent } from '../utils/telemetry';

const AUTH_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001';
const CORE_URL = import.meta.env.VITE_CORE_API_URL || 'http://localhost:8002';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
let refreshPromise: Promise<string | null> | null = null;
const TOKEN_REFRESH_BUFFER_SEC = 120;

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function shouldSkipAuth(config: any) {
  const url = String(config?.url || '');
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/steam/login') ||
    url.includes('/auth/steam/callback')
  );
}

function parseJwtPayload(token: string): any | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string, bufferSec = TOKEN_REFRESH_BUFFER_SEC) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp - now <= bufferSec;
}

function redirectToLogin() {
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    try {
      const resp = await axios.post(`${AUTH_URL}/auth/refresh`, { refresh_token: refreshToken });
      const { access_token, refresh_token: newRefresh } = resp.data;
      if (!access_token || !newRefresh) return null;
      saveTokens(access_token, newRefresh);
      return access_token as string;
    } catch {
      clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function createClient(baseURL: string) {
  const client = axios.create({ baseURL });
  client.interceptors.request.use(async (config) => {
    if (shouldSkipAuth(config)) return config;

    let token = getAccessToken();
    const hasRefresh = Boolean(getRefreshToken());
    if ((!token || isTokenExpiringSoon(token)) && hasRefresh) {
      token = await refreshAccessToken();
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      const path = error?.config?.url || 'unknown';
      const status = error?.response?.status;
      if (status && status >= 500) {
        trackEvent('api_server_error', { baseURL, path, status });
      }

      const originalRequest = error.config;
      if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !shouldSkipAuth(originalRequest)) {
        originalRequest._retry = true;
        const newToken = await refreshAccessToken();
        if (newToken) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return client(originalRequest);
        }
        clearTokens();
        redirectToLogin();
      }
      return Promise.reject(error);
    }
  );
  return client;
}

export const authApi = createClient(AUTH_URL);
export const coreApi = createClient(CORE_URL);
// NB: ml is internal-only; frontend talks to core which proxies to ml.
