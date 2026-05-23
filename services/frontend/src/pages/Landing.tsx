import { Link } from 'react-router-dom';
import { authApi } from '../api/client';
import LandingSkillRing from '../ui/LandingSkillRing';
import { Badge } from '../ui/Primitives';
import { SteamLoginButton } from '../ui/Primitives';

const AUTH_URL = (authApi.defaults.baseURL as string) || 'http://localhost:8001';

const STEPS = [
  { title: 'Анализируем', text: 'AI разбирает твои матчи, находит ошибки и точки роста.' },
  { title: 'Обучаем',    text: 'Персональные планы, разборы с тренерами и AI-рекомендации.' },
  { title: 'Побеждаем',  text: 'Закрепляем навыки, растим MMR и достигаем новых рангов.' },
];

const PROOF = [
  { value: 'Last 50', label: 'Окно ranked-матчей, не lifetime-шум' },
  { value: 'POS-aware', label: 'Сравнение по твоей реальной позиции' },
  { value: 'Оракул AI', label: 'Разбор по матчевым признакам' },
];

const PREVIEW_RINGS = [
  { label: 'Farm', value: 7.4 },
  { label: 'Vision', value: 6.5 },
  { label: 'Fights', value: 8.1 },
];

export default function Landing() {
  return (
    <div className="landing-page">

      <section className="landing-hero">
        <div className="landing-hero-panel">
          <Badge tone="cyan">AI-аналитика Dota 2</Badge>
          <h1 className="landing-title" style={{ marginTop: 14 }}>
            Стань <span>Immortal</span>.<br />
            С AI-аналитикой и тренерами Tier-1.
          </h1>
          <p className="landing-subtitle">
            Персональные инсайты, разборы матчей и прогресс под контролем
            искусственного интеллекта и про-игроков.
          </p>
          <div className="landing-cta">
            <a href={`${AUTH_URL}/auth/steam/login`} className="btn btn-primary">
              Попробовать через Steam →
            </a>
            <Link to="/coach-landing" className="btn btn-outline">Я тренер</Link>
          </div>
          <div className="landing-social-proof">
            {PROOF.map(p => (
              <div key={p.label} className="landing-proof-card">
                <div className="landing-proof-value">{p.value}</div>
                <div className="landing-proof-label">{p.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-hero-mock" aria-hidden>
          <div className="landing-mock-header">Боевой профиль</div>
          <div className="landing-mock-shell">
            <aside className="landing-mock-sidebar">
              <div className="landing-mock-logo">RUPRIME</div>
              {['Обзор', 'Аналитика', 'Тренеры', 'Сессии', 'Оракул'].map((item, i) => (
                <div key={item} className={`landing-mock-nav-item ${i === 0 ? 'landing-mock-nav-item--active' : ''}`}>
                  {item}
                </div>
              ))}
            </aside>
            <div className="landing-mock-main">
              <div className="landing-mock-grid">
                <div className="landing-mock-tile"><div className="text-muted">MMR</div><strong>4 200</strong></div>
                <div className="landing-mock-tile"><div className="text-muted">Винрейт</div><strong>52%</strong></div>
                <div className="landing-mock-tile"><div className="text-muted">Роль</div><strong>POS2</strong></div>
                <div className="landing-mock-tile"><div className="text-muted">Балл</div><strong>7.4</strong></div>
              </div>
              <div className="landing-skill-rings">
                {PREVIEW_RINGS.map(r => <LandingSkillRing key={r.label} label={r.label} value={r.value} />)}
              </div>
            </div>
          </div>
          <div className="landing-sparkline" aria-hidden />
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">Как это работает</h2>
        <p className="landing-section-subtitle">Три шага от первого матча до Immortal.</p>
        <div className="steps-row">
          {STEPS.map((s, i) => (
            <div key={s.title} className="step-card">
              <div className="step-card-index">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-final-cta">
        <h2 className="landing-section-title" style={{ marginBottom: 8 }}>
          Готов поднять свой скилл на новый уровень?
        </h2>
        <p className="landing-section-subtitle">
          Присоединяйся к RuPrime и начни побеждать уже сегодня.
        </p>
        <div className="landing-cta" style={{ justifyContent: 'center' }}>
          <a href={`${AUTH_URL}/auth/steam/login`} className="btn btn-primary">
            Попробовать через Steam →
          </a>
          <Link to="/coach-landing" className="btn btn-outline">Стать тренером</Link>
        </div>
      </section>

    </div>
  );
}
