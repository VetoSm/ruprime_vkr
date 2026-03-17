import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

const NAV_ICONS: Record<string, string> = {
  '/dashboard': '🏠',
  '/profile/player': '⚔',
  '/stats': '📊',
  '/coaches': '🎓',
  '/matchmaking': '🔍',
  '/requests': '📋',
  '/schedule': '📅',
  '/ai-chat': '🤖',
  '/coach/dashboard': '🎯',
  '/coach/profile': '👤',
  '/coach/schedule': '📅',
  '/coach/reviews': '⭐',
  '/admin/dashboard': '🛡',
  '/admin/users': '👥',
  '/admin/logs': '📜',
  '/admin/ml-import': '💾',
  '/admin/ml-data': '📈',
};

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
          <h2>RUPRIME</h2>
          <span>{user?.login} • {user?.role}</span>
        </div>
        <ul className="sidebar-nav">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={({ isActive }) => isActive ? 'active' : ''}>
                <span style={{ fontSize: '1.1rem', width: 24, textAlign: 'center' }}>
                  {NAV_ICONS[link.to] || '•'}
                </span>
                {link.label}
              </NavLink>
            </li>
          ))}
          <li>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}
              style={{ color: 'var(--danger)' }}>
              <span style={{ fontSize: '1.1rem', width: 24, textAlign: 'center' }}>🚪</span>
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
