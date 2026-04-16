import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Страница не найдена</h2>
        <p className="text-muted mb-20">
          Похоже, такой страницы не существует или ссылка устарела.
        </p>
        <div className="flex gap-10">
          <Link to="/" className="btn btn-primary">На главную</Link>
          <button className="btn btn-outline" onClick={() => window.history.back()}>
            Назад
          </button>
        </div>
      </div>
    </div>
  );
}
