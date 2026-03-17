import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import {
  IconHome, IconSword, IconChart, IconGraduate, IconSearch,
  IconClipboard, IconCalendar, IconBot, IconTarget, IconUser,
  IconStar, IconShield, IconUsers, IconScroll, IconDatabase,
  IconTrendUp, IconLogout, IconZap,
} from './Icons';

const NAV_CONFIG: Record<string, { icon: (p: any) => JSX.Element }> = {
  '/dashboard':       { icon: IconHome },
  '/profile/player':  { icon: IconSword },
  '/stats':           { icon: IconChart },
  '/coaches':         { icon: IconGraduate },
  '/matchmaking':     { icon: IconSearch },
  '/requests':        { icon: IconClipboard },
  '/schedule':        { icon: IconCalendar },
  '/ai-chat':         { icon: IconBot },
  '/coach/dashboard': { icon: IconTarget },
  '/coach/profile':   { icon: IconUser },
  '/coach/schedule':  { icon: IconCalendar },
  '/coach/reviews':   { icon: IconStar },
  '/admin/dashboard': { icon: IconShield },
  '/admin/users':     { icon: IconUsers },
  '/admin/logs':      { icon: IconScroll },
  '/admin/ml-import': { icon: IconDatabase },
  '/admin/ml-data':   { icon: IconTrendUp },
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <IconZap size={22} color="var(--accent)" />
            <h2>RUPRIME</h2>
          </div>
          <span>{user?.login} • {user?.role}</span>
        </div>
        <ul className="sidebar-nav">
          {links.map((link) => {
            const cfg = NAV_CONFIG[link.to];
            const Icon = cfg?.icon || IconHome;
            return (
              <li key={link.to}>
                <NavLink to={link.to} className={({ isActive }) => isActive ? 'active' : ''}>
                  <span style={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} />
                  </span>
                  {link.label}
                </NavLink>
              </li>
            );
          })}
          <li>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}
              style={{ color: 'var(--danger)' }}>
              <span style={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                <IconLogout size={16} />
              </span>
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
