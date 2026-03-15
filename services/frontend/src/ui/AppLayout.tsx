import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  const playerLinks = [
    { to: '/dashboard', label: 'Обзор' },
    { to: '/profile/player', label: 'Профиль' },
    { to: '/stats', label: 'Статистика' },
    { to: '/coaches', label: 'Тренеры' },
    { to: '/matchmaking', label: 'Подбор тренера' },
    { to: '/requests', label: 'Мои заявки' },
    { to: '/schedule', label: 'Расписание' },
    { to: '/ai-chat', label: 'AI Тренер' },
  ];

  const coachLinks = [
    { to: '/coach/dashboard', label: 'Панель тренера' },
    { to: '/coach/profile', label: 'Профиль тренера' },
    { to: '/coach/schedule', label: 'Расписание' },
    { to: '/coach/reviews', label: 'Отзывы' },
  ];

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Панель админа' },
    { to: '/admin/users', label: 'Пользователи' },
    { to: '/admin/logs', label: 'Логи' },
    { to: '/admin/ml-import', label: 'Импорт данных' },
    { to: '/admin/ml-data', label: 'Данные ML' },
  ];

  let links = playerLinks;
  if (user?.role === 'COACH') links = [...coachLinks, ...playerLinks];
  if (user?.role === 'ADMIN') links = [...adminLinks, ...coachLinks, ...playerLinks];

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>DOTA 2 COACH</h2>
          <span>{user?.login} ({user?.role})</span>
        </div>
        <ul className="sidebar-nav">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={({ isActive }) => isActive ? 'active' : ''}>
                {link.label}
              </NavLink>
            </li>
          ))}
          <li>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{ color: 'var(--danger)' }}>
              Выйти
            </a>
          </li>
        </ul>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
