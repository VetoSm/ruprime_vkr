import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './store/AuthContext';
import Landing from './pages/Landing';
import CoachLanding from './pages/CoachLanding';
import Login from './pages/Login';
import Register from './pages/Register';
import SteamAuthCallback from './pages/SteamAuthCallback';
import NotFound from './pages/NotFound';
import About from './pages/About';
import Contacts from './pages/Contacts';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import PlayerDashboard from './pages/player/Dashboard';
import PlayerSettings from './pages/player/Profile';
import PlayerStats from './pages/player/Stats';
import MatchDetail from './pages/player/MatchDetail';
import PlayerCoaches from './pages/player/Coaches';
import PlayerRequests from './pages/player/Requests';
import PlayerSchedule from './pages/player/Schedule';
import PlayerAiChat from './pages/player/AiChat';
import CoachDashboard from './pages/coach/Dashboard';
import CoachProfilePage from './pages/coach/Profile';
import CoachSchedule from './pages/coach/Schedule';
import CoachReviews from './pages/coach/Reviews';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminUserDetail from './pages/admin/UserDetail';
import AdminLogs from './pages/admin/Logs';
import AdminImport from './pages/admin/Import';
import AdminMlData from './pages/admin/MlData';
import AdminSessions from './pages/admin/Sessions';
import AppLayout from './ui/AppLayout';
import PublicLayout from './ui/PublicLayout';
import { trackEvent } from './utils/telemetry';

function defaultRouteForRole(role?: string) {
  if (role === 'ADMIN') return '/admin/dashboard';
  if (role === 'COACH') return '/coach/dashboard';
  return '/dashboard';
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Загрузка</h2>
          <p className="text-muted">Проверяем сессию...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to={defaultRouteForRole(user.role)} />;
  return <>{children}</>;
}

const TITLES: Record<string, string> = {
  '/': 'RuPrime — Dota 2 Coaching Platform',
  '/login': 'Вход — RuPrime',
  '/register': 'Регистрация — RuPrime',
  '/about': 'О проекте — RuPrime',
  '/contacts': 'Контакты — RuPrime',
  '/coach-landing': 'Для тренеров — RuPrime',
  '/privacy': 'Политика конфиденциальности — RuPrime',
  '/terms': 'Пользовательское соглашение — RuPrime',
  '/dashboard': 'Дашборд — RuPrime',
  '/settings': 'Настройки — RuPrime',
  '/stats': 'Статистика — RuPrime',
  '/match': 'Разбор матча — RuPrime',
  '/coaches': 'Тренеры — RuPrime',
  '/requests': 'Заявки — RuPrime',
  '/schedule': 'Расписание — RuPrime',
  '/ai-chat': 'Оракул Древних — RuPrime',
  '/coach/dashboard': 'Панель тренера — RuPrime',
  '/coach/profile': 'Профиль тренера — RuPrime',
  '/coach/schedule': 'Расписание тренера — RuPrime',
  '/coach/reviews': 'Отзывы тренера — RuPrime',
  '/admin/dashboard': 'Админ-панель — RuPrime',
  '/admin/users': 'Профили пользователей — RuPrime',
  '/admin/sessions': 'Записи и календарь — RuPrime',
  '/admin/logs': 'Логи системы — RuPrime',
};

function RouteTelemetry() {
  const location = useLocation();

  useEffect(() => {
    document.title = TITLES[location.pathname] || 'RuPrime';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', 'RuPrime — аналитика матчей Dota 2 и подбор тренеров.');
    }
    trackEvent('page_view', { path: location.pathname });
  }, [location.pathname]);

  return null;
}

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();
  const defaultRoute = defaultRouteForRole(user?.role);

  if (location.pathname === '/landing' || location.pathname === '/landing/') {
    return (
      <>
        <RouteTelemetry />
        <PublicLayout><Landing /></PublicLayout>
      </>
    );
  }

  return (
    <>
      <RouteTelemetry />
      <Routes>
        <Route path="/" element={user ? <Navigate to={defaultRoute} /> : <PublicLayout><Landing /></PublicLayout>} />
          <Route path="/landing" element={<PublicLayout><Landing /></PublicLayout>} />
        <Route path="/login" element={user ? <Navigate to={defaultRoute} /> : <PublicLayout><Login /></PublicLayout>} />
        <Route path="/register" element={user ? <Navigate to={defaultRoute} /> : <PublicLayout><Register /></PublicLayout>} />
        <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
        <Route path="/contacts" element={<PublicLayout><Contacts /></PublicLayout>} />
        <Route path="/coach-landing" element={<PublicLayout><CoachLanding /></PublicLayout>} />
        <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
        <Route path="/terms" element={<PublicLayout><Terms /></PublicLayout>} />
        <Route path="/auth/steam-callback" element={<SteamAuthCallback />} />

        {/* Player routes */}
        <Route path="/dashboard" element={<ProtectedRoute roles={['PLAYER']}><AppLayout><PlayerDashboard /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={['PLAYER', 'COACH']}><AppLayout><PlayerSettings /></AppLayout></ProtectedRoute>} />
        <Route path="/stats" element={<ProtectedRoute roles={['PLAYER', 'COACH']}><AppLayout><PlayerStats /></AppLayout></ProtectedRoute>} />
        <Route path="/match/:matchId" element={<ProtectedRoute roles={['PLAYER', 'COACH']}><AppLayout><MatchDetail /></AppLayout></ProtectedRoute>} />
        <Route path="/coaches" element={<ProtectedRoute roles={['PLAYER']}><AppLayout><PlayerCoaches /></AppLayout></ProtectedRoute>} />
        <Route path="/requests" element={<ProtectedRoute roles={['PLAYER']}><AppLayout><PlayerRequests /></AppLayout></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute roles={['PLAYER']}><AppLayout><PlayerSchedule /></AppLayout></ProtectedRoute>} />
        <Route path="/ai-chat" element={<ProtectedRoute roles={['PLAYER', 'COACH']}><AppLayout><PlayerAiChat /></AppLayout></ProtectedRoute>} />

        {/* Legacy redirects */}
        <Route path="/profile/player" element={<Navigate to="/settings" />} />
        <Route path="/matchmaking" element={<Navigate to="/coaches" />} />

        {/* Coach routes */}
        <Route path="/coach/dashboard" element={<ProtectedRoute roles={['COACH']}><AppLayout><CoachDashboard /></AppLayout></ProtectedRoute>} />
        <Route path="/coach/profile" element={<ProtectedRoute roles={['COACH']}><AppLayout><CoachProfilePage /></AppLayout></ProtectedRoute>} />
        <Route path="/coach/schedule" element={<ProtectedRoute roles={['COACH']}><AppLayout><CoachSchedule /></AppLayout></ProtectedRoute>} />
        <Route path="/coach/reviews" element={<ProtectedRoute roles={['COACH']}><AppLayout><CoachReviews /></AppLayout></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin/dashboard" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminDashboard /></AppLayout></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminUsers /></AppLayout></ProtectedRoute>} />
        <Route path="/admin/users/:id" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminUserDetail /></AppLayout></ProtectedRoute>} />
        <Route path="/admin/sessions" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminSessions /></AppLayout></ProtectedRoute>} />
        <Route path="/admin/logs" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminLogs /></AppLayout></ProtectedRoute>} />
        <Route path="/admin/ml-import" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminImport /></AppLayout></ProtectedRoute>} />
        <Route path="/admin/ml-data" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminMlData /></AppLayout></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
