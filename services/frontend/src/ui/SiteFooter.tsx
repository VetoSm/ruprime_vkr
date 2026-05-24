import { Link } from 'react-router-dom';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <strong>RuPrime</strong>
          <span>Dota 2 coaching platform</span>
        </div>
        <nav className="site-footer-links" aria-label="Информационные ссылки">
          <Link to="/coach-landing">Для тренеров</Link>
          <Link to="/about">О проекте</Link>
          <Link to="/contacts">Контакты</Link>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/terms">Пользовательское соглашение</Link>
        </nav>
      </div>
    </footer>
  );
}
