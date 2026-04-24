import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { IconEye, IconEyeOff } from '../ui/Icons';

type Persona = 'PLAYER' | 'COACH';

const AUTH_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [persona, setPersona] = useState<Persona>('PLAYER');
  const [loginVal, setLoginVal] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      // Even when persona is COACH we send 'COACH' to the API; the backend
      // always creates the account as PLAYER and records a PENDING coach
      // application that the tech account must approve.
      await register(loginVal, email, password, confirmPassword, persona);
      if (persona === 'COACH') {
        navigate('/login?coach_pending=1');
      } else {
        navigate('/login');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const steamHref =
    persona === 'COACH'
      ? `${AUTH_URL}/auth/steam/login?signup=coach`
      : `${AUTH_URL}/auth/steam/login`;

  const steamLabel =
    persona === 'COACH' ? 'Тренер: войти через Steam' : 'Игрок: войти через Steam';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2><span>Регистрация</span></h2>

        <div
          className="landing-persona-switch"
          role="tablist"
          aria-label="Тип аккаунта"
          style={{ margin: '0 auto 14px', display: 'flex' }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={persona === 'PLAYER'}
            className={`landing-persona-btn ${persona === 'PLAYER' ? 'active' : ''}`}
            onClick={() => setPersona('PLAYER')}
          >
            Игрок
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={persona === 'COACH'}
            className={`landing-persona-btn ${persona === 'COACH' ? 'active' : ''}`}
            onClick={() => setPersona('COACH')}
          >
            Тренер
          </button>
        </div>

        {persona === 'COACH' && (
          <div
            className="alert"
            style={{
              background: 'var(--purple-bg)',
              border: '1px solid var(--purple)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              marginBottom: 14,
            }}
          >
            Аккаунт тренера попадает в каталог только после подтверждения с тех-аккаунта. До подтверждения вы продолжаете пользоваться сервисом как игрок — со своей статистикой и анализом.
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Логин</label>
            <input
              type="text"
              className="form-input"
              value={loginVal}
              onChange={(e) => setLoginVal(e.target.value)}
              required
              placeholder="Ваш никнейм"
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <div className="input-with-icon">
              <input
                type={showPwd ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Минимум 8 символов"
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
          <div className="form-group">
            <label>Подтвердите пароль</label>
            <div className="input-with-icon">
              <input
                type={showConfirm ? 'text' : 'password'}
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Повторите пароль"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
                aria-label={showConfirm ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showConfirm ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading
              ? 'Создаём...'
              : persona === 'COACH'
                ? 'Подать заявку тренера'
                : 'Зарегистрироваться'}
          </button>
        </form>

        <div style={{ margin: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          или
        </div>
        <a
          href={steamHref}
          className="btn btn-outline"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {steamLabel}
        </a>
        <p className="text-center mt-12 text-muted" style={{ fontSize: '0.78rem' }}>
          {persona === 'COACH'
            ? 'Через Steam создаётся аккаунт с заявкой на роль тренера. Статус станет «подтверждён» после одобрения тех-аккаунтом.'
            : 'Аккаунт создаётся автоматически, данные Dota подгружаются сразу.'}
        </p>

        <p className="text-center mt-20 text-muted">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
        {persona === 'COACH' && (
          <p className="text-center mt-12 text-muted" style={{ fontSize: '0.82rem' }}>
            Хотите посмотреть презентацию для тренеров? <Link to="/coach-landing">Открыть</Link>
          </p>
        )}
      </div>
    </div>
  );
}
