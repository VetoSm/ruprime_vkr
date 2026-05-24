import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { authApi } from '../api/client';
import { IconEye, IconEyeOff, IconPlayerMask, IconCoachWhistle, IconClose } from '../ui/Icons';
import { BrandLogo, SteamLoginButton } from '../ui/Primitives';
import { TERMS_VERSION } from './Terms';

type Persona = 'PLAYER' | 'COACH';

const AUTH_URL = (authApi.defaults.baseURL as string) || 'http://localhost:8001';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [persona, setPersona] = useState<Persona>('PLAYER');
  const [loginVal, setLoginVal] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [steamIdInput, setSteamIdInput] = useState('');
  const [consent, setConsent] = useState(false);
  const [coachNoticeOpen, setCoachNoticeOpen] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!consent) { setError('Примите условия и политику конфиденциальности'); return; }
    setLoading(true);
    try {
      await register(loginVal, email, password, password, persona, {
        consent_accepted: true,
        consent_version: TERMS_VERSION,
      });
      // Запомним введённый Steam ID — подтянем при первом входе на странице настроек.
      if (steamIdInput.trim()) {
        try { localStorage.setItem('pending_steam_link', steamIdInput.trim()); } catch {}
      }
      navigate(persona === 'COACH' ? '/login?coach_pending=1' : '/login');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const consentQs = `consent=${encodeURIComponent(TERMS_VERSION)}`;
  const steamHref = persona === 'COACH'
    ? `${AUTH_URL}/auth/steam/login?signup=coach&${consentQs}`
    : `${AUTH_URL}/auth/steam/login?${consentQs}`;

  return (
    <div className="auth-page">
      <div className="auth-glow-left"  aria-hidden />
      <div className="auth-glow-right" aria-hidden />
      <div className="auth-card">
        <BrandLogo size="lg" />

        <h2 style={{ textAlign: 'center', marginTop: 4, marginBottom: 22, fontSize: '1.55rem', fontWeight: 800 }}>
          Регистрация
        </h2>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>НИКНЕЙМ</label>
            <input
              type="text"
              className="form-input"
              value={loginVal}
              onChange={e => setLoginVal(e.target.value)}
              required minLength={3}
              placeholder="Введите никнейм"
            />
          </div>

          <div className="form-group">
            <label>EMAIL</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="Введите email"
            />
          </div>

          <div className="form-group">
            <label>ПАРОЛЬ</label>
            <div className="input-with-icon">
              <input
                type={showPwd ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required minLength={8}
                placeholder="Введите пароль"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
                aria-label={showPwd ? 'Скрыть' : 'Показать'}
              >
                {showPwd ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>STEAM ID (ОПЦИОНАЛЬНО)</label>
            <input
              type="text"
              className="form-input"
              value={steamIdInput}
              onChange={e => setSteamIdInput(e.target.value)}
              placeholder="Ваш Steam ID или профильная ссылка"
            />
          </div>

          <div className="form-group">
            <label>ВАША РОЛЬ</label>
            <div className="role-toggle" role="tablist" aria-label="Тип аккаунта">
              <button
                type="button"
                role="tab"
                aria-selected={persona === 'PLAYER'}
                className={`role-toggle-btn ${persona === 'PLAYER' ? 'active' : ''}`}
                onClick={() => { setPersona('PLAYER'); }}
              >
                <IconPlayerMask size={16} /> Я игрок
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={persona === 'COACH'}
                className={`role-toggle-btn ${persona === 'COACH' ? 'active' : ''}`}
                onClick={() => { setPersona('COACH'); setCoachNoticeOpen(true); }}
              >
                <IconCoachWhistle size={16} /> Я тренер
              </button>
            </div>

            {persona === 'COACH' && coachNoticeOpen && (
              <div className="coach-notice" role="status">
                <button
                  type="button"
                  className="coach-notice-close"
                  onClick={() => setCoachNoticeOpen(false)}
                  aria-label="Закрыть уведомление"
                >
                  <IconClose size={14} />
                </button>
                <span>
                  <strong>Заявка уйдёт в админ-штаб RuPrime.</strong> До подтверждения вы пользуетесь сервисом как игрок: профиль, матчи, статистика и AI-разбор.
                </span>
              </div>
            )}
          </div>

          <label className="auth-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
            />
            <span>
              Согласен с <Link to="/terms" target="_blank" rel="noreferrer">условиями</Link>
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            disabled={loading || !consent}
          >
            {loading ? 'Создаём профиль...' : (persona === 'COACH' ? 'Подать заявку тренера →' : 'Создать аккаунт →')}
          </button>
        </form>

        <div className="auth-divider">или войти через</div>

        <SteamLoginButton
          variant="outline"
          href={consent ? steamHref : '#'}
          onClick={() => {
            if (!consent) setError('Чтобы войти через Steam, примите условия и политику');
          }}
        >
          {null}
        </SteamLoginButton>

        <p className="text-center mt-20 text-muted" style={{ fontSize: '0.88rem' }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
