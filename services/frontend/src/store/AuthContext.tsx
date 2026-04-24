import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '../api/client';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const REFRESH_BUFFER_SEC = 120;
const REFRESH_FALLBACK_MS = 5 * 60 * 1000;

interface User {
  id: number;
  email: string;
  login: string;
  role: string;
  is_active: boolean;
  is_verified?: boolean;
  coach_application_status?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    login: string,
    email: string,
    password: string,
    confirmPassword: string,
    role: string,
    extras?: { consent_accepted?: boolean; consent_version?: string },
  ) => Promise<void>;
  logout: () => void;
  applySteamSession: (accessToken: string, refreshToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
let refreshTimerId: number | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const scheduleSilentRefresh = useCallback(() => {
    if (refreshTimerId) {
      window.clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return;

    const parseExpFromJwt = (token: string): number | null => {
      try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const parsed = JSON.parse(atob(normalized));
        const exp = Number(parsed?.exp || 0);
        return exp > 0 ? exp : null;
      } catch {
        return null;
      }
    };

    const runRefresh = async () => {
      const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!rt) return;
      try {
        const resp = await authApi.post('/auth/refresh', { refresh_token: rt });
        const { access_token, refresh_token } = resp.data || {};
        if (access_token && refresh_token) {
          localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
          localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
          // After a silent refresh, re-read /auth/me so role/verification
          // changes (e.g. admin just approved this user as a coach) land
          // in React state without requiring a manual page reload.
          try {
            const me = await authApi.get('/auth/me');
            setUser(me.data);
          } catch {
            /* non-fatal; next page navigation will re-fetch anyway */
          }
          scheduleSilentRefresh();
        }
      } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setUser(null);
      }
    };

    const currentAccess = localStorage.getItem(ACCESS_TOKEN_KEY);
    const exp = currentAccess ? parseExpFromJwt(currentAccess) : null;
    const now = Math.floor(Date.now() / 1000);
    const msUntilRefresh = exp
      ? Math.max((exp - now - REFRESH_BUFFER_SEC) * 1000, 5_000)
      : REFRESH_FALLBACK_MS;

    refreshTimerId = window.setTimeout(() => {
      runRefresh().catch(() => {});
    }, msUntilRefresh);
  }, []);

  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!accessToken && !refreshToken) {
      setLoading(false);
      return;
    }

    authApi.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setUser(null);
      })
      .finally(() => {
        scheduleSilentRefresh();
        setLoading(false);
      });
  }, [scheduleSilentRefresh]);

  const login = async (email: string, password: string) => {
    const res = await authApi.post('/auth/login', { email, password });
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, res.data.refresh_token);
    const me = await authApi.get('/auth/me');
    setUser(me.data);
    scheduleSilentRefresh();
  };

  const register = async (
    loginVal: string,
    email: string,
    password: string,
    confirmPassword: string,
    role: string,
    extras?: { consent_accepted?: boolean; consent_version?: string },
  ) => {
    await authApi.post('/auth/register', {
      login: loginVal,
      email,
      password,
      confirm_password: confirmPassword,
      role,
      consent_accepted: Boolean(extras?.consent_accepted),
      consent_version: extras?.consent_version || '',
    });
  };

  const logout = () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      authApi.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    if (refreshTimerId) {
      window.clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }
    setUser(null);
  };

  const applySteamSession = useCallback(async (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    const me = await authApi.get('/auth/me');
    setUser(me.data);
    scheduleSilentRefresh();
  }, [scheduleSilentRefresh]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, applySteamSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
