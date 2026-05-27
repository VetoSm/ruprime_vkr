import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/client';
import { heroIcon, heroName, loadHeroes } from '../api/heroes';
import LandingSkillRing from '../ui/LandingSkillRing';
import { Badge } from '../ui/Primitives';

const AUTH_URL = (authApi.defaults.baseURL as string) || 'http://localhost:8001';

const WORKFLOW = [
  {
    title: 'Сбор данных',
    text: 'Подключаем Steam и автоматически загружаем ranked-матчи. Для точной картины берём не менее 200 последних игр.',
    tags: ['Steam', 'OpenDota', 'STRATZ'],
  },
  {
    title: 'Аналитика и слабые стороны',
    text: 'Сервис собирает показатели по ролям, героям и паттернам — и выделяет зоны, которые тянут винрейт вниз.',
    tags: ['Роли', 'Радар', 'Слабые места'],
  },
  {
    title: 'Советы AI',
    text: 'Оракул Древних отвечает по вашим данным: что улучшить на текущей роли, с конкретными героями и задачами.',
    tags: ['Оракул', 'План на игры', 'KDA / GPM'],
  },
];

const PROOF = [
  { value: '200+', label: 'Матчей для базовой аналитики' },
  { value: 'Роли', label: 'Керри, мид, оффлейн и саппорты отдельно' },
  { value: 'Оракул AI', label: 'Разбор по матчевым признакам' },
];

const PREVIEW_RINGS = [
  { label: 'Farm', value: 7.4 },
  { label: 'Vision', value: 6.5 },
  { label: 'Fights', value: 8.1 },
];

const PERSONAL_FEATURES = [
  { label: 'Единый профиль', text: 'MMR, винрейт, роль и динамика по последним матчам в одном экране.' },
  { label: 'Роли и герои', text: 'Керри, мид, оффлейн и саппорты — отдельные срезы без смешения статистики.' },
  { label: 'Слабые зоны', text: 'Радар, тепловая карта и приоритеты — видно, что прокачивать в первую очередь.' },
];

const DASHBOARD_METRICS = [
  { label: 'Винрейт', value: '56%', tone: 'cyan' },
  { label: 'KDA', value: '3.8', tone: 'purple' },
  { label: 'GPM', value: '+42', tone: 'gold' },
  { label: 'Роль', value: 'Мид', tone: 'cyan' },
];

const HERO_CARDS = [
  { heroId: 11, role: 'Мид', games: 18, wr: '58%' },
  { heroId: 8, role: 'Керри', games: 14, wr: '52%' },
  { heroId: 129, role: 'Оффлейн', games: 11, wr: '55%' },
  { heroId: 5, role: 'Хард-саппорт', games: 9, wr: '49%' },
];

const PLAYER_CARDS = [
  { name: 'NightPulse', role: 'Мид', mmr: '4 850', wr: '54%', focus: 'Темп и фарм', heroes: [11, 74, 106] },
  { name: 'WardSoul', role: 'Саппорт', mmr: '3 920', wr: '51%', focus: 'Вижн и роум', heroes: [5, 26, 86] },
  { name: 'OfflaneX', role: 'Оффлейн', mmr: '4 120', wr: '53%', focus: 'Драки и инициация', heroes: [129, 99, 60] },
];

const DAILY_TASKS = [
  { title: 'Vision score выше среднего', role: 'Хард-саппорт', weak: 'Вижн', status: '2/3 игры' },
  { title: 'Last hits до 10 минуты', role: 'Мид', weak: 'Фарм', status: 'Сегодня' },
  { title: 'Меньше смертей на линии', role: 'Оффлейн', weak: 'Выживание', status: 'Завтра' },
];

const COACH_CARDS = [
  { name: 'Coach Atlas', focus: 'Мид и темп карты', stat: '+8% WR учеников', heroes: [11, 74, 106] },
  { name: 'Silent Ward', focus: 'Саппорты и вижн', stat: 'разборы replay', heroes: [5, 26, 86] },
  { name: 'Offlane Lab', focus: 'Оффлейн и драки', stat: 'план на 10 игр', heroes: [129, 99, 60] },
];

export default function Landing() {
  const [, setHeroesReady] = useState(false);

  useEffect(() => {
    loadHeroes().then(() => setHeroesReady(true));
  }, []);

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
            Сбор матчей, персональная аналитика, ежедневные задания и советы Оракула —
            всё в одном сервисе для игроков Dota 2.
          </p>
          <div className="landing-cta">
            <a href={`${AUTH_URL}/auth/steam/login`} className="btn btn-primary">
              Попробовать через Steam →
            </a>
            <Link to="/register" className="btn btn-outline">Регистрация</Link>
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
                <div className="landing-mock-tile"><div className="text-muted">Роль</div><strong>Мид</strong></div>
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
        <Badge tone="cyan">Цепочка сервиса</Badge>
        <h2 className="landing-section-title">От матчей до конкретных советов</h2>
        <p className="landing-section-subtitle">
          Три этапа: собираем данные, находим слабые стороны на срезе 200+ матчей, даём рекомендации AI.
        </p>
        <div className="landing-workflow">
          {WORKFLOW.map((step, i) => (
            <div key={step.title} className="landing-workflow-step">
              <div className="landing-workflow-index">{i + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <div className="landing-workflow-tags">
                {step.tags.map(tag => <span key={tag}>{tag}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <Badge tone="purple">Персональная аналитика</Badge>
        <h2 className="landing-section-title">Вся статистика — в одном профиле</h2>
        <p className="landing-section-subtitle">
          Не разрозненные таблицы, а единый дашборд: роли, герои, динамика и слабые зоны текущего среза.
        </p>
        <div className="landing-personal-grid">
          <div className="landing-feature-list">
            {PERSONAL_FEATURES.map((feature) => (
              <div key={feature.label} className="landing-feature-card">
                <strong>{feature.label}</strong>
                <p>{feature.text}</p>
              </div>
            ))}
          </div>

          <div className="landing-dashboard-showcase landing-dashboard-showcase--stacked">
            <div className="landing-dashboard-screen">
              <div className="landing-preview-browser">
                <span />
                <span />
                <span />
                <strong>Dashboard</strong>
              </div>
              <div className="landing-dashboard-metrics">
                {DASHBOARD_METRICS.map((metric) => (
                  <div key={metric.label} className={`landing-dashboard-metric landing-dashboard-metric--${metric.tone}`}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
              <div className="landing-dashboard-chart">
                <div className="landing-dashboard-chart-line" />
              </div>
            </div>

            <div className="landing-hero-cards">
              {HERO_CARDS.map((hero) => (
                <div key={hero.heroId} className="landing-hero-card">
                  <img src={heroIcon(hero.heroId)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div>
                    <strong>{heroName(hero.heroId)}</strong>
                    <span>{hero.role} · {hero.games} матчей · WR {hero.wr}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-player-cards">
          {PLAYER_CARDS.map((player) => (
            <div key={player.name} className="landing-player-card">
              <div className="landing-player-card-head">
                <div>
                  <strong>{player.name}</strong>
                  <span>{player.role} · MMR {player.mmr} · WR {player.wr}</span>
                </div>
                <em>{player.focus}</em>
              </div>
              <div className="landing-coach-heroes">
                {player.heroes.map((heroId) => (
                  <img key={heroId} src={heroIcon(heroId)} alt={heroName(heroId)} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-daily-section">
        <Badge tone="warning">Ежедневные задания</Badge>
        <h2 className="landing-section-title">Прокачка слабой стороны по шагам</h2>
        <p className="landing-section-subtitle">
          После аналитики сервис предлагает короткие задачи на игры — чтобы закрепить один аспект, а не распыляться.
        </p>
        <div className="landing-daily-grid">
          {DAILY_TASKS.map((task) => (
            <div key={task.title} className="landing-daily-task">
              <div className="landing-daily-task-top">
                <span className="landing-daily-task-weak">{task.weak}</span>
                <em>{task.status}</em>
              </div>
              <strong>{task.title}</strong>
              <p>Роль: {task.role}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-coach-search">
        <div>
          <Badge tone="purple">Тренеры и комьюнити</Badge>
          <h2 className="landing-section-title">Найди тренера и стань частью комьюнити</h2>
          <p className="landing-section-subtitle">
            Если AI показал просадку — можно перейти к тренеру под твою роль и пул героев.
            Регистрация открыта для игроков и тренеров.
          </p>
          <div className="landing-cta landing-cta--compact">
            <Link to="/register" className="btn btn-primary">Зарегистрироваться</Link>
            <Link to="/coach-landing" className="btn btn-outline">Стать тренером</Link>
          </div>
        </div>
        <div className="landing-coach-grid">
          {COACH_CARDS.map((coach) => (
            <div key={coach.name} className="landing-coach-card">
              <div className="landing-coach-card-head">
                <div>
                  <strong>{coach.name}</strong>
                  <span>{coach.focus}</span>
                </div>
                <em>{coach.stat}</em>
              </div>
              <div className="landing-coach-heroes">
                {coach.heroes.map((heroId) => (
                  <img key={heroId} src={heroIcon(heroId)} alt={heroName(heroId)} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-final-cta">
        <h2 className="landing-section-title" style={{ marginBottom: 8 }}>
          Готов поднять свой скилл на новый уровень?
        </h2>
        <p className="landing-section-subtitle">
          Подключи Steam, получи аналитику по 200+ матчам и первый совет Оракула — бесплатно.
        </p>
        <div className="landing-cta" style={{ justifyContent: 'center' }}>
          <a href={`${AUTH_URL}/auth/steam/login`} className="btn btn-primary">
            Попробовать через Steam →
          </a>
          <Link to="/register" className="btn btn-outline">Регистрация</Link>
        </div>
      </section>

    </div>
  );
}
