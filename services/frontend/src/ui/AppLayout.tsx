import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import {
  IconHome, IconChart, IconGraduate,
  IconClipboard, IconCalendar, IconTarget, IconUser,
  IconStar, IconShield, IconUsers, IconScroll, IconDatabase,
  IconTrendUp, IconLogout, IconZap, IconSettings,
  IconChevronLeft, IconChevronRight, IconMessageCircle,
} from './Icons';
import SiteFooter from './SiteFooter';

const NAV_CONFIG: Record<string, { icon: (p: any) => JSX.Element }> = {
  '/dashboard':       { icon: IconHome },
  '/settings':        { icon: IconSettings },
  '/stats':           { icon: IconChart },
  '/coaches':         { icon: IconGraduate },
  '/requests':        { icon: IconClipboard },
  '/schedule':        { icon: IconCalendar },
  '/ai-chat':         { icon: IconMessageCircle },
  '/coach/dashboard': { icon: IconTarget },
  '/coach/profile':   { icon: IconUser },
  '/coach/schedule':  { icon: IconCalendar },
  '/coach/reviews':   { icon: IconStar },
  '/admin/dashboard': { icon: IconShield },
  '/admin/users':     { icon: IconUsers },
  '/admin/sessions':  { icon: IconCalendar },
  '/admin/logs':      { icon: IconScroll },
  '/admin/ml-import': { icon: IconDatabase },
  '/admin/ml-data':   { icon: IconTrendUp },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);

  const playerLinks = [
    { to: '/dashboard', label: 'Профиль' },
    { to: '/stats', label: 'Статистика' },
    { to: '/coaches', label: 'Тренеры' },
    { to: '/requests', label: 'Мои заявки' },
    { to: '/schedule', label: 'Расписание' },
  ];

  const coachLinks = [
    { to: '/coach/dashboard', label: 'Панель тренера' },
    { to: '/coach/profile', label: 'Профиль тренера' },
    { to: '/coach/schedule', label: 'Расписание' },
    { to: '/coach/reviews', label: 'Отзывы' },
  ];

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Панель админа' },
    { to: '/admin/users', label: 'Профили' },
    { to: '/admin/sessions', label: 'Записи и календарь' },
    { to: '/admin/logs', label: 'Логи' },
    { to: '/admin/ml-import', label: 'Импорт данных' },
    { to: '/admin/ml-data', label: 'Данные ML' },
  ];

  let links = playerLinks;
  if (user?.role === 'COACH') links = coachLinks;
  if (user?.role === 'ADMIN') links = adminLinks;

  const settingsPath = user?.role === 'COACH'
    ? '/coach/profile'
    : user?.role === 'ADMIN'
      ? '/admin/users'
      : '/settings';
  const showAiFab = user?.role === 'PLAYER';

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <IconZap size={22} color="var(--accent)" />
            {!collapsed && <h2>RUPRIME</h2>}
          </div>
          {!collapsed && <span>{user?.login} • {user?.role}</span>}
        </div>
        <ul className="sidebar-nav">
          {links.map((link) => {
            const cfg = NAV_CONFIG[link.to];
            const Icon = cfg?.icon || IconHome;
            return (
              <li key={link.to}>
                <NavLink to={link.to} className={({ isActive }) => isActive ? 'active' : ''}
                  title={collapsed ? link.label : undefined}>
                  <span style={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} />
                  </span>
                  {!collapsed && link.label}
                </NavLink>
              </li>
            );
          })}
          <li>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}
              aria-label="Выйти из аккаунта"
              style={{ color: 'var(--danger)' }} title={collapsed ? 'Выйти' : undefined}>
              <span style={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                <IconLogout size={16} />
              </span>
              {!collapsed && 'Выйти'}
            </a>
          </li>
        </ul>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}>
          {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <div />
          <div className="topbar-actions">
            <button className="topbar-btn" onClick={() => navigate(settingsPath)}
              aria-label="Открыть настройки"
              title="Настройки">
              <IconSettings size={18} />
            </button>
          </div>
        </div>
        {children}
        <SiteFooter />
      </main>

      {/* AI Coach FAB */}
      {showAiFab && (
        <button className="ai-fab" onClick={() => {
          setShowAiChat(!showAiChat);
          if (!showAiChat) navigate('/ai-chat');
        }} aria-label="Открыть AI тренера" title="AI Тренер">
          <IconMessageCircle size={24} color="#fff" />
          <span className="ai-fab-badge">AI</span>
        </button>
      )}
    </div>
  );
}
