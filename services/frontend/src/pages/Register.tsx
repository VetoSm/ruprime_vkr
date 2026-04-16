import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { IconEye, IconEyeOff } from '../ui/Icons';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [loginVal, setLoginVal] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [role, setRole] = useState('PLAYER');
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
      await register(loginVal, email, password, confirmPassword, role);
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2><span>Регистрация</span></h2>
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
              <button type="button" className="input-icon-btn" onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1} aria-label={showPwd ? 'Скрыть пароль' : 'Показать пароль'}>
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
              <button type="button" className="input-icon-btn" onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1} aria-label={showConfirm ? 'Скрыть пароль' : 'Показать пароль'}>
                {showConfirm ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Роль</label>
            <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="PLAYER">Игрок</option>
              <option value="COACH">Тренер</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Создаём...' : 'Зарегистрироваться'}
          </button>
        </form>

        {role === 'PLAYER' && (
          <>
            <div style={{ margin: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              или
            </div>
            <a
              href={`${import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001'}/auth/steam/login`}
              className="btn btn-outline"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Игрок: войти через Steam
            </a>
            <p className="text-center mt-12 text-muted" style={{ fontSize: '0.78rem' }}>
              Аккаунт создаётся автоматически, данные Dota подгружаются сразу.
            </p>
          </>
        )}

        <p className="text-center mt-20 text-muted">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
        {role === 'COACH' && (
          <p className="text-center mt-12 text-muted" style={{ fontSize: '0.82rem' }}>
            Хотите посмотреть презентацию для тренеров? <Link to="/coach-landing">Открыть</Link>
          </p>
        )}
      </div>
    </div>
  );
}
