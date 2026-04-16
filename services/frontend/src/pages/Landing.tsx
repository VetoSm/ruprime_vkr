import { Link } from 'react-router-dom';
import LandingSkillRing from '../ui/LandingSkillRing';

export default function Landing() {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-panel">
          <div className="landing-badge">AI + Dota Analytics</div>
          <h1 className="landing-title">
            <span>RuPrime</span> — вырасти в рейтинге с персональной аналитикой и тренером
          </h1>
          <p className="landing-subtitle">
            Подтягиваем матчи из OpenDota, находим слабые места, показываем прогресс
            и подбираем тренеров, которые подходят по вашему профилю.
          </p>
          <div className="landing-cta">
            <Link to="/register" className="btn btn-primary">Начать бесплатно</Link>
            <Link to="/login" className="btn btn-outline">У меня уже есть аккаунт</Link>
          </div>
          <div className="landing-social-proof">
            <div className="landing-proof-card">
              <div className="landing-proof-value">6+</div>
              <div className="landing-proof-label">Ключевых метрик навыков</div>
            </div>
            <div className="landing-proof-card">
              <div className="landing-proof-value">Top-5</div>
              <div className="landing-proof-label">Лучших тренеров по мэтчингу</div>
            </div>
            <div className="landing-proof-card">
              <div className="landing-proof-value">24/7</div>
              <div className="landing-proof-label">AI-коуч для быстрых советов</div>
            </div>
          </div>
        </div>

        <div className="landing-hero-mock">
          <div className="landing-mock-header">Пример экрана прогресса</div>
          <div className="landing-mock-shell">
            <aside className="landing-mock-sidebar">
              <div className="landing-mock-logo">RUPRIME</div>
              <div className="landing-mock-nav-item landing-mock-nav-item--active">Dashboard</div>
              <div className="landing-mock-nav-item">Coaches</div>
              <div className="landing-mock-nav-item">Sessions</div>
              <div className="landing-mock-nav-item">Progress</div>
              <div className="landing-mock-nav-item">Profile</div>
            </aside>
            <div className="landing-mock-main">
              <div className="landing-mock-grid">
                <div className="landing-mock-tile">
                  <div className="text-muted">MMR (оценка)</div>
                  <strong>4200</strong>
                </div>
                <div className="landing-mock-tile">
                  <div className="text-muted">Винрейт</div>
                  <strong>52%</strong>
                </div>
                <div className="landing-mock-tile">
                  <div className="text-muted">Часы</div>
                  <strong>3200</strong>
                </div>
                <div className="landing-mock-tile">
                  <div className="text-muted">Progress</div>
                  <strong>74%</strong>
                </div>
              </div>
              <div className="landing-skill-rings">
                <LandingSkillRing label="Farm" value={7.2} />
                <LandingSkillRing label="Combat" value={5.8} />
                <LandingSkillRing label="Survival" value={5.8} />
                <LandingSkillRing label="Vision" value={7.2} />
                <LandingSkillRing label="Objectives" value={5.8} />
                <LandingSkillRing label="Mechanics" value={5.8} />
              </div>
            </div>
          </div>
          <div className="landing-sparkline" aria-hidden="true" />
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">Hero-варианты визуала</h2>
        <p className="landing-section-subtitle">Вариант A — основной (наверху). Ниже — быстрые альтернативы B и C.</p>
        <div className="grid-3 mb-20">
          <div className="card">
            <div className="card-title">A (основной)</div>
            <p className="text-muted">Акцент на аналитике и демонстрации интерфейса c skill-rings.</p>
          </div>
          <div className="card">
            <div className="card-title">B (коучинг-first)</div>
            <p className="text-muted">Фокус на подборе тренеров и конверсии в запись.</p>
          </div>
          <div className="card">
            <div className="card-title">C (результат-first)</div>
            <p className="text-muted">Сильный упор на рост MMR и личный прогресс по неделям.</p>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">Что вы получите</h2>
        <p className="landing-section-subtitle">
          Дизайн и логика платформы заточены под быстрый рост в соревновательной Dota 2.
        </p>
        <div className="grid-3">
          <div className="card">
            <div className="card-title">Умная аналитика</div>
            <p className="text-muted">
              Сравнение с эталонами по роли и рангу: GPM, XPM, KDA,
              объектам, вижену и стабильности по матчам.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Подбор тренера</div>
            <p className="text-muted">
              Алгоритм ранжирует коучей и показывает до 5 лучших мэтчей,
              а также пул остальных тренеров.
            </p>
          </div>
          <div className="card">
            <div className="card-title">AI Тренер</div>
            <p className="text-muted">
              Персональные рекомендации по слабым местам и быстрые планы
              улучшения на ближайшие игры.
            </p>
          </div>
        </div>

        <div className="landing-screen">
          <div className="landing-screen-top">
            <div className="landing-screen-dots"><i /><i /><i /></div>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>RuPrime Dashboard Preview</span>
          </div>
          <div className="landing-screen-body">
            <div className="grid-4">
              <div className="stat-card"><div className="stat-card-label">MMR</div><div className="stat-card-value">4200</div></div>
              <div className="stat-card"><div className="stat-card-label">Winrate</div><div className="stat-card-value">52%</div></div>
              <div className="stat-card"><div className="stat-card-label">Sessions</div><div className="stat-card-value">12</div></div>
              <div className="stat-card"><div className="stat-card-label">Skill score</div><div className="stat-card-value">7.2</div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">Как это работает</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-index">1</div>
            <div className="card-title">Подключите Steam</div>
            <p className="text-muted">Платформа автоматически подтянет матчевую статистику и роли.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-index">2</div>
            <div className="card-title">Получите анализ</div>
            <p className="text-muted">Увидите метрики, навыки и зоны роста до желаемого ранга.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-index">3</div>
            <div className="card-title">Выберите тренера</div>
            <p className="text-muted">Запишитесь на сессию и отслеживайте прогресс в календаре.</p>
          </div>
        </div>
      </section>

      <section className="landing-final-cta">
        <h2 className="landing-section-title" style={{ marginBottom: 8 }}>
          Готовы сделать следующий шаг к новому рангу?
        </h2>
        <p className="landing-section-subtitle">
          Присоединяйтесь к RuPrime и начните с персонального анализа уже сегодня.
        </p>
        <div className="landing-cta" style={{ justifyContent: 'center' }}>
          <Link to="/register" className="btn btn-primary">Создать аккаунт</Link>
          <Link to="/login" className="btn btn-outline">Войти</Link>
        </div>
      </section>
    </div>
  );
}
