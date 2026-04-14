import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { coreApi } from '../api/client';

const ERRORS: Record<string, string> = {
  steam_auth_failed: 'Не удалось подтвердить вход через Steam.',
  steam_disabled: 'Вход через Steam отключён на сервере.',
  steam_failed: 'Ошибка Steam.',
};

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
          try {
            await coreApi.post('/player/link-steam', { steam_id: steamId });
          } catch {
            /* ML/OpenDota могут ответить позже — пользователь обновит данные в настройках */
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
