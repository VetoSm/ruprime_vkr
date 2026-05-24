import { Link } from 'react-router-dom';
import LandingSkillRing from '../ui/LandingSkillRing';

export default function CoachLanding() {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-panel">
          <div className="landing-badge">Для тренеров Dota 2</div>
          <h1 className="landing-title">
            Монетизируйте экспертизу в <span>RuPrime</span> и ведите учеников в одном месте
          </h1>
          <p className="landing-subtitle">
            Получайте входящие заявки от подходящих игроков, управляйте расписанием,
            отслеживайте прогресс учеников и повышайте доверие через отзывы.
          </p>
          <div className="landing-cta">
            <Link to="/register" className="btn btn-primary">Стать тренером</Link>
            <Link to="/login" className="btn btn-outline">У меня уже есть профиль</Link>
          </div>
          <div className="landing-social-proof">
            <div className="landing-proof-card">
              <div className="landing-proof-value">Top-5</div>
              <div className="landing-proof-label">Совпадений на игрока по навыкам</div>
            </div>
            <div className="landing-proof-card">
              <div className="landing-proof-value">1 панель</div>
              <div className="landing-proof-label">Записи, отзывы и сессии</div>
            </div>
            <div className="landing-proof-card">
              <div className="landing-proof-value">0 хаоса</div>
              <div className="landing-proof-label">Календарь и переносы внутри сервиса</div>
            </div>
          </div>
        </div>

        <div className="landing-hero-mock">
          <div className="landing-mock-header">Панель тренера</div>
          <div className="landing-mock-shell">
            <aside className="landing-mock-sidebar">
              <div className="landing-mock-logo">RUPRIME</div>
              <div className="landing-mock-nav-item landing-mock-nav-item--active">Штаб</div>
              <div className="landing-mock-nav-item">Ученики</div>
              <div className="landing-mock-nav-item">Расписание</div>
              <div className="landing-mock-nav-item">Доход</div>
              <div className="landing-mock-nav-item">Настройки</div>
            </aside>
            <div className="landing-mock-main">
              <div className="landing-mock-grid">
                <div className="landing-mock-tile">
                  <div className="text-muted">Новых заявок</div>
                  <strong>12</strong>
                </div>
                <div className="landing-mock-tile">
                  <div className="text-muted">Сессий в месяце</div>
                  <strong>48</strong>
                </div>
                <div className="landing-mock-tile">
                  <div className="text-muted">Средний рейтинг</div>
                  <strong>4.7 / 5</strong>
                </div>
                <div className="landing-mock-tile">
                  <div className="text-muted">Доход</div>
                  <strong>72 000 ₽</strong>
                </div>
              </div>
              <div className="landing-skill-rings">
                <LandingSkillRing label="Ученики" value={7.6} />
                <LandingSkillRing label="Сессии" value={8.2} />
                <LandingSkillRing label="Рейтинг" value={9.4} />
              </div>
            </div>
          </div>
          <div className="landing-sparkline" aria-hidden="true" />
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">Что получает тренер</h2>
        <div className="grid-3">
          <div className="card">
            <div className="card-title">Целевые заявки</div>
            <p className="text-muted">Игроки приходят с уже проанализированными метриками и целями.</p>
          </div>
          <div className="card">
            <div className="card-title">Прозрачное расписание</div>
            <p className="text-muted">Календарь занятий, переносы и статусы сессий без лишних чатов.</p>
          </div>
          <div className="card">
            <div className="card-title">Репутация и рост</div>
            <p className="text-muted">Отзывы, рейтинг и портфолио результатов ваших учеников.</p>
          </div>
        </div>

        <div className="landing-screen">
          <div className="landing-screen-top">
            <div className="landing-screen-dots"><i /><i /><i /></div>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>Тренерский штаб</span>
          </div>
          <div className="landing-screen-body">
            <div className="grid-3">
              <div className="stat-card"><div className="stat-card-label">Новые заявки</div><div className="stat-card-value">12</div></div>
              <div className="stat-card"><div className="stat-card-label">Запланировано</div><div className="stat-card-value">18</div></div>
              <div className="stat-card"><div className="stat-card-label">Рейтинг</div><div className="stat-card-value text-accent">4.7</div></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
