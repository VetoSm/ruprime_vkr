import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { coreApi } from '../api/client';
import { useAuth } from '../store/AuthContext';
import {
  IconHome, IconChart, IconUsers, IconClipboard, IconCalendar,
  IconMessageCircle, IconSettings, IconLogout,
  IconChevronLeft, IconChevronRight, IconChevronDown,
  IconBell, IconMenu, IconShield, IconScroll, IconDatabase, IconTrendUp, IconUser,
  IconStar,
} from './Icons';
import { BrandLogo } from './Primitives';
import { rankTierToName, rankMedalIcon } from '../api/heroes';
import ConsentGate from './ConsentGate';
import SiteFooter from './SiteFooter';
import TechStatusPanel from './TechStatusPanel';

type NavItem = { to: string; label: string; icon: (p: any) => JSX.Element };

const PLAYER_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Обзор',      icon: IconHome },
  { to: '/stats',     label: 'Аналитика',  icon: IconChart },
  { to: '/coaches',   label: 'Тренеры',    icon: IconUsers },
  { to: '/requests',  label: 'Сессии',     icon: IconClipboard },
  { to: '/schedule',  label: 'Расписание', icon: IconCalendar },
  { to: '/ai-chat',   label: 'Оракул',     icon: IconMessageCircle },
  { to: '/settings',  label: 'Настройки',  icon: IconSettings },
];

const COACH_NAV: NavItem[] = [
  { to: '/coach/dashboard', label: 'Обзор',       icon: IconHome },
  { to: '/coach/profile',   label: 'Профиль',     icon: IconUser },
  { to: '/coach/schedule',  label: 'Расписание',  icon: IconCalendar },
  { to: '/coach/reviews',   label: 'Отзывы',      icon: IconStar },
  { to: '/stats',           label: 'Мой разбор',  icon: IconChart },
  { to: '/ai-chat',         label: 'Оракул',      icon: IconMessageCircle },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/dashboard', label: 'Обзор',        icon: IconShield },
  { to: '/admin/users',     label: 'Профили',      icon: IconUsers },
  { to: '/admin/sessions',  label: 'Сессии',       icon: IconCalendar },
  { to: '/admin/logs',      label: 'Логи',         icon: IconScroll },
  { to: '/admin/ml-import', label: 'Импорт',       icon: IconDatabase },
  { to: '/admin/ml-data',   label: 'Данные ML',    icon: IconTrendUp },
];

// Короткие подписи маршрутов для крошки в topbar
const BREADCRUMB_LABEL: Record<string, string> = {
  '/dashboard':       'Обзор',
  '/stats':           'Аналитика',
  '/coaches':         'Тренеры',
  '/requests':        'Сессии',
  '/schedule':        'Расписание',
  '/ai-chat':         'Оракул',
  '/settings':        'Настройки',
  '/coach/dashboard': 'Обзор тренера',
  '/coach/profile':   'Профиль тренера',
  '/coach/schedule':  'Расписание тренера',
  '/coach/reviews':   'Отзывы',
  '/admin/dashboard': 'Админ-обзор',
  '/admin/users':     'Профили пользователей',
  '/admin/sessions':  'Сессии',
  '/admin/logs':      'Логи',
  '/admin/ml-import': 'Импорт ML',
  '/admin/ml-data':   'Данные ML',
};

function getBreadcrumb(pathname: string): string {
  return BREADCRUMB_LABEL[pathname] || 'RuPrime';
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.replace(/[_\-.]/g, ' ').trim().split(/\s+/);
  const a = parts[0]?.[0] || '';
  const b = parts[1]?.[0] || '';
  return (a + b).toUpperCase() || a.toUpperCase() || '?';
}

function userRoleLabel(role?: string): string {
  if (role === 'COACH') return 'Тренер';
  if (role === 'ADMIN') return 'Админ';
  return 'Игрок';
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Мини-оракул FAB (оставляем — лучше иметь чем не иметь, пока не переписан /ai-chat)
  const [showAiChat, setShowAiChat] = useState(false);
  const [miniAiInput, setMiniAiInput] = useState('');
  const [miniAiMessages, setMiniAiMessages] = useState<Array<{ type: 'user' | 'ai'; text: string }>>([]);
  const [miniAiLoading, setMiniAiLoading] = useState(false);

  // Подтягиваем steam-данные один раз для топбара (аватар/ник из стима + ранг).
  // Тихо игнорируем 401/500 и preview — топбар деградирует до login + роли.
  const [topbarMeta, setTopbarMeta] = useState<{
    avatar?: string; nick?: string; rank?: string; medal?: string;
  }>({});
  useEffect(() => {
    if (!user || user.role !== 'PLAYER') return;
    let cancelled = false;
    coreApi.get('/player/steam-data').then((r) => {
      if (cancelled) return;
      const d = r.data || {};
      setTopbarMeta({
        avatar: d.avatar_url || undefined,
        nick: d.personaname || undefined,
        rank: d.rank_tier ? rankTierToName(d.rank_tier) : undefined,
        // Medal icon URL is computed from the same rank_tier — keep it
        // alongside the text label so the topbar can render the medal
        // next to the rank name without an extra prop drill.
        medal: d.rank_tier ? rankMedalIcon(d.rank_tier) : undefined,
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  // Клик вне user-меню — закрыть
  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [userMenuOpen]);

  const nav = user?.role === 'ADMIN' ? ADMIN_NAV : user?.role === 'COACH' ? COACH_NAV : PLAYER_NAV;
  const showAiFab = user?.role === 'PLAYER' || user?.role === 'COACH';
  const breadcrumb = location.pathname === '/stats' && user?.role === 'COACH'
    ? 'Мой разбор'
    : getBreadcrumb(location.pathname);
  const isPreview = (() => {
    try { return !!localStorage.getItem('__ruprime_preview'); } catch { return false; }
  })();

  const exitPreview = () => {
    try { localStorage.removeItem('__ruprime_preview'); } catch {}
    window.location.assign('/login');
  };

  const sendMiniAi = async () => {
    const text = miniAiInput.trim();
    if (!text) return;
    setMiniAiMessages((prev) => [...prev, { type: 'user', text }]);
    setMiniAiInput('');
    setMiniAiLoading(true);
    try {
      const res = await coreApi.post('/ai/chat', { message: text, context_mode: 'AUTO' });
      setMiniAiMessages((prev) => [...prev, { type: 'ai', text: res.data.advice_summary || res.data.advice_full || 'Нет ответа' }]);
    } catch {
      setMiniAiMessages((prev) => [...prev, { type: 'ai', text: 'Оракул временно недоступен.' }]);
    } finally {
      setMiniAiLoading(false);
    }
  };

  return (
    <ConsentGate>
      <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* ============ Sidebar ============ */}
        <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
          <div className="app-sidebar-brand">
            {collapsed
              ? <span className="app-sidebar-brand-mini">R</span>
              : <BrandLogo size="md" align="left" />
            }
          </div>

          <nav className="app-sidebar-nav" aria-label="Главная навигация">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `app-sidebar-link ${isActive ? 'active' : ''}`}
                title={collapsed ? label : undefined}
              >
                <span className="app-sidebar-link-icon"><Icon size={18} /></span>
                {!collapsed && <span className="app-sidebar-link-label">{label}</span>}
              </NavLink>
            ))}
          </nav>

          <TechStatusPanel collapsed={collapsed} role={user?.role} />

          <button
            className="app-sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {collapsed
              ? <IconChevronRight size={16} />
              : <><IconChevronLeft size={16} /><span>Свернуть</span></>
            }
          </button>
        </aside>

        {/* ============ Main: topbar + content ============ */}
        <div className="app-main">
          <header className="app-topbar">
            <div className="app-topbar-left">
              <button
                type="button"
                className="app-topbar-icon-btn"
                onClick={() => setCollapsed(!collapsed)}
                aria-label="Переключить меню"
              >
                <IconMenu size={18} />
              </button>
              <div className="app-breadcrumb" aria-label="Хлебные крошки">
                <IconHome size={14} />
                <span className="app-breadcrumb-sep">/</span>
                <span className="app-breadcrumb-current">{breadcrumb}</span>
              </div>
            </div>

            <div className="app-topbar-right">
              <button type="button" className="app-topbar-icon-btn app-topbar-icon-btn--bell" aria-label="Уведомления" title="Уведомления">
                <IconBell size={18} />
                {/* TODO: красная точка появляется при /me/notifications?unread=1 */}
              </button>

              <div ref={userMenuRef} className="app-user-pill-wrap">
                <button
                  type="button"
                  className="app-user-pill"
                  onClick={() => setUserMenuOpen(v => !v)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  {topbarMeta.avatar
                    ? <img src={topbarMeta.avatar} alt="" className="app-user-avatar app-user-avatar--img" />
                    : <span className="app-user-avatar">{getInitials(topbarMeta.nick || user?.login)}</span>
                  }
                  <span className="app-user-meta">
                    <span className="app-user-name">{topbarMeta.nick || user?.login || '—'}</span>
                    <span className="app-user-role">
                      {/* Show the rank medal icon inline with the label
                          so the role line communicates "Divine" both
                          visually and textually. Falls back to plain
                          role text for unranked / non-PLAYER users. */}
                      {topbarMeta.medal && (
                        <img
                          src={topbarMeta.medal}
                          alt=""
                          className="app-user-rank-medal"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      {topbarMeta.rank || userRoleLabel(user?.role)}
                    </span>
                  </span>
                  <IconChevronDown size={14} />
                </button>

                {userMenuOpen && (
                  <div className="app-user-menu" role="menu">
                    <button
                      type="button"
                      className="app-user-menu-item"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                    >
                      <IconSettings size={14} /> Настройки
                    </button>
                    <div className="app-user-menu-sep" />
                    <button
                      type="button"
                      className="app-user-menu-item app-user-menu-item--danger"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                    >
                      <IconLogout size={14} /> Выйти
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {isPreview && (
            <div className="dev-preview-banner" role="status">
              <span><strong>DEV PREVIEW</strong> — синтетический {userRoleLabel(user?.role)}. Данные с бэка не подтягиваются.</span>
              <button type="button" onClick={exitPreview}>Выйти из preview</button>
            </div>
          )}

          <main className="app-content">
            {children}
          </main>
          <SiteFooter />
        </div>

        {/* Oracle FAB + mini-chat — FAB теперь круглая аватарка Оракула */}
        {showAiFab && (
          <button
            className="ai-fab ai-fab--oracle"
            onClick={() => setShowAiChat(!showAiChat)}
            aria-label="Открыть Оракула"
            title="Оракул Древних"
          >
            <img src="/decor/oracle-avatar.png" alt="" className="ai-fab-avatar" />
          </button>
        )}
        {showAiFab && showAiChat && (
          <div className="mini-ai-chat">
            <div className="mini-ai-head">
              <strong>Оракул</strong>
              <div className="flex gap-10">
                <button className="btn btn-outline btn-sm" onClick={() => setMiniAiMessages([])}>Очистить</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/ai-chat')}>Открыть</button>
              </div>
            </div>
            <div className="mini-ai-body">
              {miniAiMessages.length === 0 && (
                <p className="text-muted">Спросите про конкретный тайминг, роль или слабую зону в последних ranked.</p>
              )}
              {miniAiMessages.map((m, idx) => (
                <div key={idx} className={`mini-ai-msg ${m.type}`}>{m.text}</div>
              ))}
              {miniAiLoading && <div className="mini-ai-msg ai">Сверяю матчи и роль...</div>}
            </div>
            <div className="mini-ai-input">
              <input
                className="form-input"
                value={miniAiInput}
                onChange={(e) => setMiniAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMiniAi()}
                placeholder="Например: почему просел vision?"
              />
              <button className="btn btn-primary btn-sm" onClick={() => sendMiniAi()} disabled={miniAiLoading}>→</button>
            </div>
          </div>
        )}
      </div>
    </ConsentGate>
  );
}
