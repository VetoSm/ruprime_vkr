import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="landing-page">
      <section className="landing-hero-panel" style={{ marginBottom: 20 }}>
        <div className="landing-badge">О проекте</div>
        <h1 className="landing-title">
          <span>RuPrime</span> — аналитика и коучинг Dota 2 в одном месте
        </h1>
        <p className="landing-subtitle">
          RuPrime помогает русскоязычным игрокам Dota 2 расти быстрее: мы собираем матчевую статистику,
          сравниваем её с эталонами для вашего ранга и роли, находим слабые стороны — и подбираем
          тренера, который закроет именно их.
        </p>
        <div className="landing-cta">
          <Link to="/register" className="btn btn-primary">Начать</Link>
          <Link to="/coach-landing" className="btn btn-outline">Я тренер</Link>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">Как это работает</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-index">1</div>
            <div className="card-title">Подключаете Steam</div>
            <p className="text-muted">
              Через официальный Steam OpenID — мы не просим пароль. Автоматически подтягиваем последние матчи и профиль из OpenDota.
            </p>
          </div>
          <div className="landing-step">
            <div className="landing-step-index">2</div>
            <div className="card-title">Получаете разбор по 8 категориям</div>
            <p className="text-muted">
              Фарм, бой, выживаемость, вижн, объекты, механика, стабильность, контроль — каждая со своей оценкой, целью для желаемого ранга и разрывом.
            </p>
          </div>
          <div className="landing-step">
            <div className="landing-step-index">3</div>
            <div className="card-title">Выбираете тренера под данные</div>
            <p className="text-muted">
              Алгоритм рекомендует до 5 тренеров по вашему рангу, ролям и зонам роста. Или записываетесь напрямую на того, кто понравился.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">Что отличает RuPrime</h2>
        <div className="grid-3">
          <div className="card">
            <div className="card-title">Только ранговые игры</div>
            <p className="text-muted">
              Метрики считаются по рейтинговым матчам — турбо и 1v1 не искажают средние.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Эталоны по рангу и роли</div>
            <p className="text-muted">
              Сравниваем ваш GPM, KDA, выживаемость с перцентилями (p25/p50/p75/p90/p95) игроков вашего уровня, а не с «общим средним».
            </p>
          </div>
          <div className="card">
            <div className="card-title">Верифицированные тренеры</div>
            <p className="text-muted">
              В каталоге — только тренеры, прошедшие ручную проверку тех-аккаунтом. Никаких фейковых «иммортал-коучей».
            </p>
          </div>
          <div className="card">
            <div className="card-title">Оракул Древних</div>
            <p className="text-muted">
              Быстрые вопросы о билдах, пулах героев и решениях на линии — с учётом вашего профиля и слабых зон.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Прозрачные сессии и отзывы</div>
            <p className="text-muted">
              Календарь, переносы, отчёт тренера и отзыв игрока — всё внутри сервиса, без сторонних мессенджеров.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Для тренеров — рабочее место</div>
            <p className="text-muted">
              Панель с учениками и их метриками, заявки с контекстом («игрок хочет подтянуть лейн»), репутация по отзывам.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-final-cta">
        <h2 className="landing-section-title" style={{ marginBottom: 8 }}>
          Данные уже есть — осталось ими воспользоваться
        </h2>
        <p className="landing-section-subtitle">
          Попробуйте аналитический разбор бесплатно и посмотрите, где вы теряете MMR.
        </p>
        <div className="landing-cta" style={{ justifyContent: 'center' }}>
          <Link to="/register" className="btn btn-primary">Зарегистрироваться</Link>
          <Link to="/login" className="btn btn-outline">Войти</Link>
        </div>
      </section>
    </div>
  );
}
