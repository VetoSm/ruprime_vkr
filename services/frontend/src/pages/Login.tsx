import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { authApi } from '../api/client';
import { IconEye, IconEyeOff } from '../ui/Icons';
import { BrandLogo, SteamLoginButton } from '../ui/Primitives';

const AUTH_URL = (authApi.defaults.baseURL as string) || 'http://localhost:8001';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const coachPending = searchParams.get('coach_pending') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setError('Логин или пароль введены неверно');
      } else if (status === 429) {
        setError('Слишком много попыток входа. Попробуйте позже.');
      } else {
        setError(err.response?.data?.detail || 'Ошибка входа. Попробуйте ещё раз.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-glow-left"  aria-hidden />
      <div className="auth-glow-right" aria-hidden />
      <div className="auth-card">
        <BrandLogo size="lg" />

        <h2 style={{ textAlign: 'center', marginTop: 4, marginBottom: 6, fontSize: '1.55rem', fontWeight: 800 }}>
          Вход в RuPrime
        </h2>
        <p className="text-center text-muted" style={{ marginTop: 0, marginBottom: 24, fontSize: '0.88rem' }}>
          С возвращением
        </p>

        {coachPending && (
          <div className="alert" style={{
            background: 'var(--purple-bg)',
            border: '1px solid var(--purple)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            marginBottom: 14,
          }}>
            Заявка на роль тренера отправлена. До подтверждения админом вы пользуетесь сервисом как игрок.
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="on">
          <div className="form-group">
            <label htmlFor="login-email">EMAIL</label>
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Введите email"
            />
          </div>
          <div className="form-group">
            <label>ПАРОЛЬ</label>
            <div className="input-with-icon">
              <input
                id="login-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Введите пароль"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
                aria-label={showPwd ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPwd ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>
          <Link to="/contacts" className="auth-forgot">Забыли пароль?</Link>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? 'Входим...' : 'Войти →'}
          </button>
        </form>

        <div className="auth-divider">или войти через</div>

        <SteamLoginButton variant="outline" href={`${AUTH_URL}/auth/steam/login`}>
          {null}
        </SteamLoginButton>

        <p className="text-center mt-20 text-muted" style={{ fontSize: '0.88rem' }}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
}
