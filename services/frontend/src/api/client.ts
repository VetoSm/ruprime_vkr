import axios from 'axios';

const AUTH_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001';
const CORE_URL = import.meta.env.VITE_CORE_API_URL || 'http://localhost:8002';
const ML_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:8003';

function createClient(baseURL: string) {
  const client = axios.create({ baseURL });
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (error.response?.status === 401) {
        // Try refresh
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken && !error.config._retry) {
          error.config._retry = true;
          try {
            const resp = await authApi.post('/auth/refresh', { refresh_token: refreshToken });
            const { access_token, refresh_token } = resp.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            error.config.headers.Authorization = `Bearer ${access_token}`;
            return client(error.config);
          } catch {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login';
          }
        }
      }
      return Promise.reject(error);
    }
  );
  return client;
}

export const authApi = createClient(AUTH_URL);
export const coreApi = createClient(CORE_URL);
export const mlApi = createClient(ML_URL);
