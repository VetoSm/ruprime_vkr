import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import SteamAuthCallback from './pages/SteamAuthCallback';
import PlayerDashboard from './pages/player/Dashboard';
import PlayerSettings from './pages/player/Profile';
import PlayerStats from './pages/player/Stats';
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
import AdminLogs from './pages/admin/Logs';
import AdminImport from './pages/admin/Import';
import AdminMlData from './pages/admin/MlData';
import AppLayout from './ui/AppLayout';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page"><p>Loading...</p></div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />
      <Route path="/auth/steam-callback" element={<SteamAuthCallback />} />

      {/* Player routes */}
      <Route path="/dashboard" element={<ProtectedRoute><AppLayout><PlayerDashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppLayout><PlayerSettings /></AppLayout></ProtectedRoute>} />
      <Route path="/stats" element={<ProtectedRoute><AppLayout><PlayerStats /></AppLayout></ProtectedRoute>} />
      <Route path="/coaches" element={<ProtectedRoute><AppLayout><PlayerCoaches /></AppLayout></ProtectedRoute>} />
      <Route path="/requests" element={<ProtectedRoute><AppLayout><PlayerRequests /></AppLayout></ProtectedRoute>} />
      <Route path="/schedule" element={<ProtectedRoute><AppLayout><PlayerSchedule /></AppLayout></ProtectedRoute>} />
      <Route path="/ai-chat" element={<ProtectedRoute><AppLayout><PlayerAiChat /></AppLayout></ProtectedRoute>} />

      {/* Legacy redirects */}
      <Route path="/profile/player" element={<Navigate to="/settings" />} />
      <Route path="/matchmaking" element={<Navigate to="/coaches" />} />

      {/* Coach routes */}
      <Route path="/coach/dashboard" element={<ProtectedRoute roles={['COACH','ADMIN']}><AppLayout><CoachDashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/coach/profile" element={<ProtectedRoute roles={['COACH','ADMIN']}><AppLayout><CoachProfilePage /></AppLayout></ProtectedRoute>} />
      <Route path="/coach/schedule" element={<ProtectedRoute roles={['COACH','ADMIN']}><AppLayout><CoachSchedule /></AppLayout></ProtectedRoute>} />
      <Route path="/coach/reviews" element={<ProtectedRoute roles={['COACH','ADMIN']}><AppLayout><CoachReviews /></AppLayout></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin/dashboard" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminDashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminUsers /></AppLayout></ProtectedRoute>} />
      <Route path="/admin/logs" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminLogs /></AppLayout></ProtectedRoute>} />
      <Route path="/admin/ml-import" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminImport /></AppLayout></ProtectedRoute>} />
      <Route path="/admin/ml-data" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><AdminMlData /></AppLayout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
