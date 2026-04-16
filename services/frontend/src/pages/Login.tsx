import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { IconEye, IconEyeOff } from '../ui/Icons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
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
      setError(err.response?.data?.detail || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2><span>Вход</span></h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
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
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: '0 auto' }}
            disabled={loading}
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>

        <div style={{ margin: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          или
        </div>
        <a
          href={`${import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001'}/auth/steam/login`}
          className="btn btn-outline"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          Войти через Steam
        </a>
        <p className="text-center mt-12 text-muted" style={{ fontSize: '0.78rem' }}>
          Через Steam профиль и матчи подтягиваются автоматически.
        </p>

        <p className="text-center mt-20 text-muted">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
}
