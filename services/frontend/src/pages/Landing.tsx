import { useState } from 'react';
import { Link } from 'react-router-dom';
import LandingSkillRing from '../ui/LandingSkillRing';

type Persona = 'player' | 'coach';

type PersonaContent = {
  badge: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  proofCards: Array<{ value: string; label: string }>;
  mockHeader: string;
  mockNav: string[];
  mockTiles: Array<{ label: string; value: string }>;
  rings: Array<{ label: string; value: number }>;
  valueTitle: string;
  valueSubtitle: string;
  valueCards: Array<{ title: string; text: string }>;
  previewLabel: string;
  previewStats: Array<{ label: string; value: string; accent?: boolean }>;
  flowTitle: string;
  flowSteps: Array<{ title: string; text: string }>;
  finalTitle: string;
  finalSubtitle: string;
  finalPrimaryCta: string;
};

const PERSONA_CONTENT: Record<Persona, PersonaContent> = {
  player: {
    badge: 'AI + Dota Analytics',
    title: 'RuPrime — вырасти в рейтинге с персональной аналитикой и тренером',
    subtitle:
      'Подтягиваем матчи из OpenDota, находим слабые места, показываем прогресс и подбираем тренеров, которые подходят по вашему профилю.',
    primaryCta: 'Начать бесплатно',
    secondaryCta: 'У меня уже есть аккаунт',
    proofCards: [
      { value: '6+', label: 'Ключевых метрик навыков' },
      { value: 'Top-5', label: 'Лучших тренеров по мэтчингу' },
      { value: '24/7', label: 'AI-коуч для быстрых советов' },
    ],
    mockHeader: 'Пример экрана прогресса игрока',
    mockNav: ['Dashboard', 'Coaches', 'Sessions', 'Progress', 'Profile'],
    mockTiles: [
      { label: 'MMR (оценка)', value: '4200' },
      { label: 'Винрейт', value: '52%' },
      { label: 'Часы', value: '3200' },
      { label: 'Progress', value: '74%' },
    ],
    rings: [
      { label: 'Farm', value: 7.2 },
      { label: 'Combat', value: 5.8 },
      { label: 'Survival', value: 5.8 },
      { label: 'Vision', value: 7.2 },
      { label: 'Objectives', value: 5.8 },
      { label: 'Mechanics', value: 5.8 },
    ],
    valueTitle: 'Что получает игрок',
    valueSubtitle: 'Дизайн и логика платформы заточены под быстрый рост в соревновательной Dota 2.',
    valueCards: [
      {
        title: 'Умная аналитика',
        text: 'Сравнение с эталонами по роли и рангу: GPM, XPM, KDA, объектам, вижену и стабильности по матчам.',
      },
      {
        title: 'Подбор тренера',
        text: 'Алгоритм ранжирует коучей и показывает до 5 лучших мэтчей, а также пул остальных тренеров.',
      },
      {
        title: 'AI Тренер',
        text: 'Персональные рекомендации по слабым местам и быстрые планы улучшения на ближайшие игры.',
      },
    ],
    previewLabel: 'RuPrime Dashboard Preview',
    previewStats: [
      { label: 'MMR', value: '4200' },
      { label: 'Winrate', value: '52%' },
      { label: 'Sessions', value: '12' },
      { label: 'Skill score', value: '7.2', accent: true },
    ],
    flowTitle: 'Как это работает для игрока',
    flowSteps: [
      { title: 'Подключите Steam', text: 'Платформа автоматически подтянет матчевую статистику и роли.' },
      { title: 'Получите анализ', text: 'Увидите метрики, навыки и зоны роста до желаемого ранга.' },
      { title: 'Выберите тренера', text: 'Запишитесь на сессию и отслеживайте прогресс в календаре.' },
    ],
    finalTitle: 'Готовы сделать следующий шаг к новому рангу?',
    finalSubtitle: 'Присоединяйтесь к RuPrime и начните с персонального анализа уже сегодня.',
    finalPrimaryCta: 'Создать аккаунт игрока',
  },
  coach: {
    badge: 'For Dota Coaches',
    title: 'Монетизируйте экспертизу в RuPrime и ведите учеников в одном месте',
    subtitle:
      'Получайте входящие заявки от подходящих игроков, управляйте расписанием, отслеживайте прогресс учеников и повышайте доверие через отзывы.',
    primaryCta: 'Стать тренером',
    secondaryCta: 'У меня уже есть профиль',
    proofCards: [
      { value: 'Top-5', label: 'Мэтчей на игрока по навыкам' },
      { value: '1 панель', label: 'Заявки, сессии, отзывы и календарь' },
      { value: '0 хаоса', label: 'Все процессы внутри одного интерфейса' },
    ],
    mockHeader: 'Панель тренера',
    mockNav: ['Dashboard', 'Students', 'Schedule', 'Reviews', 'Settings'],
    mockTiles: [
      { label: 'Новых заявок', value: '12' },
      { label: 'Сессий в месяце', value: '48' },
      { label: 'Средний рейтинг', value: '4.7 / 5' },
      { label: 'Доход', value: '72 000 ₽' },
    ],
    rings: [
      { label: 'Students', value: 7.6 },
      { label: 'Sessions', value: 8.2 },
      { label: 'Rating', value: 9.4 },
    ],
    valueTitle: 'Что получает тренер',
    valueSubtitle: 'RuPrime помогает выстроить стабильный поток учеников и прозрачный операционный процесс.',
    valueCards: [
      { title: 'Целевые заявки', text: 'Игроки приходят уже с метриками и целями обучения, а не с размытым запросом.' },
      { title: 'Прозрачное расписание', text: 'Календарь занятий, переносы и статусы сессий без бесконечных чатов.' },
      { title: 'Репутация и рост', text: 'Отзывы, рейтинг и портфолио результатов для повышения доверия и конверсии.' },
    ],
    previewLabel: 'Coach Workspace',
    previewStats: [
      { label: 'Новые заявки', value: '12' },
      { label: 'Запланировано', value: '18' },
      { label: 'Рейтинг', value: '4.7', accent: true },
      { label: 'Повторные клиенты', value: '64%' },
    ],
    flowTitle: 'Как это работает для тренера',
    flowSteps: [
      { title: 'Заполните профиль', text: 'Добавьте специализацию, формат занятий и подтвержденный опыт.' },
      { title: 'Получайте релевантные заявки', text: 'Система подбирает учеников по целям, рангу и динамике метрик.' },
      { title: 'Ведите учеников в сервисе', text: 'Сессии, обратная связь и прогресс фиксируются в одном рабочем месте.' },
    ],
    finalTitle: 'Готовы масштабировать тренерскую практику?',
    finalSubtitle: 'Подключайтесь к RuPrime и получайте игроков, которым действительно подходит ваш профиль.',
    finalPrimaryCta: 'Стать тренером в RuPrime',
  },
};

function highlightBrand(title: string) {
  const [before, ...rest] = title.split('RuPrime');
  if (rest.length === 0) {
    return title;
  }
  return (
    <>
      {before}
      <span>RuPrime</span>
      {rest.join('RuPrime')}
    </>
  );
}

export default function Landing() {
  const [persona, setPersona] = useState<Persona>('player');
  const content = PERSONA_CONTENT[persona];

  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-panel">
          <div className="landing-persona-switch" role="tablist" aria-label="Режим лендинга">
            <button
              type="button"
              className={`landing-persona-btn ${persona === 'player' ? 'active' : ''}`}
              onClick={() => setPersona('player')}
              role="tab"
              aria-selected={persona === 'player'}
            >
              Игрок
            </button>
            <button
              type="button"
              className={`landing-persona-btn ${persona === 'coach' ? 'active' : ''}`}
              onClick={() => setPersona('coach')}
              role="tab"
              aria-selected={persona === 'coach'}
            >
              Тренер
            </button>
          </div>
          <div className="landing-persona-hint">
            На лендинге выбираете фокус, в сервисе интерфейс открывается по вашей роли автоматически.
          </div>
          <div className="landing-badge">{content.badge}</div>
          <h1 className="landing-title">
            {highlightBrand(content.title)}
          </h1>
          <p className="landing-subtitle">{content.subtitle}</p>
          <div className="landing-cta">
            <Link to="/register" className="btn btn-primary">{content.primaryCta}</Link>
            <Link to="/login" className="btn btn-outline">{content.secondaryCta}</Link>
          </div>
          <div className="landing-social-proof">
            {content.proofCards.map((card) => (
              <div key={card.label} className="landing-proof-card">
                <div className="landing-proof-value">{card.value}</div>
                <div className="landing-proof-label">{card.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-hero-mock">
          <div className="landing-mock-header">{content.mockHeader}</div>
          <div className="landing-mock-shell">
            <aside className="landing-mock-sidebar">
              <div className="landing-mock-logo">RUPRIME</div>
              {content.mockNav.map((item, index) => (
                <div
                  key={item}
                  className={`landing-mock-nav-item ${index === 0 ? 'landing-mock-nav-item--active' : ''}`}
                >
                  {item}
                </div>
              ))}
            </aside>
            <div className="landing-mock-main">
              <div className="landing-mock-grid">
                {content.mockTiles.map((tile) => (
                  <div key={tile.label} className="landing-mock-tile">
                    <div className="text-muted">{tile.label}</div>
                    <strong>{tile.value}</strong>
                  </div>
                ))}
              </div>
              <div className="landing-skill-rings">
                {content.rings.map((ring) => (
                  <LandingSkillRing key={ring.label} label={ring.label} value={ring.value} />
                ))}
              </div>
            </div>
          </div>
          <div className="landing-sparkline" aria-hidden="true" />
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">{content.valueTitle}</h2>
        <p className="landing-section-subtitle">{content.valueSubtitle}</p>
        <div className="grid-3">
          {content.valueCards.map((card) => (
            <div key={card.title} className="card">
              <div className="card-title">{card.title}</div>
              <p className="text-muted">{card.text}</p>
            </div>
          ))}
        </div>

        <div className="landing-screen">
          <div className="landing-screen-top">
            <div className="landing-screen-dots"><i /><i /><i /></div>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>{content.previewLabel}</span>
          </div>
          <div className="landing-screen-body">
            <div className="grid-4">
              {content.previewStats.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <div className="stat-card-label">{stat.label}</div>
                  <div className={`stat-card-value ${stat.accent ? 'text-accent' : ''}`}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">{content.flowTitle}</h2>
        <div className="landing-steps">
          {content.flowSteps.map((step, index) => (
            <div key={step.title} className="landing-step">
              <div className="landing-step-index">{index + 1}</div>
              <div className="card-title">{step.title}</div>
              <p className="text-muted">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-final-cta">
        <h2 className="landing-section-title" style={{ marginBottom: 8 }}>
          {content.finalTitle}
        </h2>
        <p className="landing-section-subtitle">{content.finalSubtitle}</p>
        <div className="landing-cta" style={{ justifyContent: 'center' }}>
          <Link to="/register" className="btn btn-primary">{content.finalPrimaryCta}</Link>
          <Link to="/login" className="btn btn-outline">Войти</Link>
        </div>
      </section>
    </div>
  );
}
