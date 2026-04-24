import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { coreApi } from '../api/client';

const ERRORS: Record<string, string> = {
  steam_auth_failed: 'Не удалось подтвердить вход через Steam.',
  steam_disabled: 'Вход через Steam отключён на сервере.',
  steam_failed: 'Ошибка Steam.',
};
const STEAM_PENDING_KEY = 'steam_pending_link_id';

export default function SteamAuthCallback() {
  const [msg, setMsg] = useState('Завершение входа через Steam...');
  const [err, setErr] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { applySteamSession } = useAuth();

  useEffect(() => {
    const qErr = searchParams.get('error');
    if (qErr) {
      setErr(ERRORS[qErr] || 'Ошибка входа');
      setMsg('');
      return;
    }

    const raw = window.location.hash || '';
    const hash = raw.startsWith('#') ? raw.slice(1) : raw;
    if (!hash) {
      setErr('Нет данных авторизации. Войдите снова через кнопку «Войти через Steam».');
      setMsg('');
      return;
    }

    const p = new URLSearchParams(hash);
    const access = p.get('access_token');
    const refresh = p.get('refresh_token');
    const steamId = p.get('steam_id');
    const linked = p.get('linked') === '1';

    // Two distinct callback shapes:
    //   1. Sign-in / sign-up — fragment has access_token + refresh_token.
    //   2. OpenID link flow (user was already authed) — fragment has
    //      steam_id + linked=1 and NO tokens; we just trigger the trusted
    //      link-steam call and go back to /settings.
    if (linked && steamId && !access) {
      let cancelled = false;
      (async () => {
        try {
          await coreApi.post('/player/link-steam', { steam_id: steamId, trusted: true });
        } catch {
          /* ignore; user will see empty stats and can retry from settings */
        }
        if (!cancelled) {
          window.history.replaceState(null, '', '/settings');
          navigate('/settings?linked=1', { replace: true });
        }
      })();
      return () => { cancelled = true; };
    }

    if (!access || !refresh) {
      setErr('Некорректный ответ авторизации.');
      setMsg('');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await applySteamSession(access, refresh);
        if (cancelled) return;
        if (steamId) {
          localStorage.setItem(STEAM_PENDING_KEY, steamId);
          try {
            await coreApi.post('/player/link-steam', { steam_id: steamId, trusted: true });
            localStorage.removeItem(STEAM_PENDING_KEY);
          } catch {
            /* Привяжем автоматически на Dashboard/Settings повторно */
          }
        }
        window.history.replaceState(null, '', '/auth/steam-callback');
        navigate('/dashboard', { replace: true });
      } catch {
        if (!cancelled) {
          setErr('Не удалось загрузить профиль. Попробуйте войти снова.');
          setMsg('');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, navigate, applySteamSession]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        {err && <div className="alert alert-error">{err}</div>}
        {msg && !err && <p className="text-muted">{msg}</p>}
        {err && (
          <p className="mt-20">
            <Link to="/login" className="btn btn-primary">На страницу входа</Link>
          </p>
        )}
      </div>
    </div>
  );
}
