import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div>
      <div className="landing-hero">
        <h1>
          <span>RuPrime</span> — прокачай свою игру в Dota 2
        </h1>
        <p>
          AI-аналитика, персональный подбор тренера и детальный анализ
          эффективности для роста в рейтинге.
        </p>
        <div className="landing-cta">
          <Link to="/register" className="btn btn-primary">Начать</Link>
          <Link to="/login" className="btn btn-outline">Войти</Link>
        </div>
      </div>

      <div className="landing-features">
        <div className="grid-3">
          <div className="card">
            <div className="card-title">Умная аналитика</div>
            <p className="text-muted">
              Глубокий анализ ваших матчей по бенчмаркам профессиональных игроков.
              GPM, XPM, KDA и другие метрики в динамике.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Подбор тренера</div>
            <p className="text-muted">
              ML-алгоритм подберёт идеального тренера под ваш стиль игры,
              роли и цели развития.
            </p>
          </div>
          <div className="card">
            <div className="card-title">AI Тренер</div>
            <p className="text-muted">
              Персональные советы от AI-коуча на основе реальных
              данных ваших матчей и слабых сторон.
            </p>
          </div>
        </div>

        <div className="grid-3 mt-30">
          <div className="card">
            <div className="card-title">Система навыков</div>
            <p className="text-muted">
              Отслеживайте 6 категорий навыков: Фарм, Бой, Выживание,
              Вижн, Инициация и Ранняя игра.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Оценка MMR</div>
            <p className="text-muted">
              Точная оценка MMR по вашим игровым метрикам
              в сравнении с профессиональными игроками.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Отслеживание прогресса</div>
            <p className="text-muted">
              Ставьте цели, следите за прогрессом и видьте,
              сколько осталось до желаемого ранга.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
