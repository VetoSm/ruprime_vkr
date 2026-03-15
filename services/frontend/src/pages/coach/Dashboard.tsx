import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';

export default function CoachDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);

  useEffect(() => {
    coreApi.get('/me/overview').then((r) => setOverview(r.data)).catch(() => {});
  }, []);

  const stats = overview?.stats || {};
  const profile = overview?.profile || {};

  return (
    <div>
      <div className="page-header">
        <h1>Панель тренера</h1>
        <p>С возвращением, {user?.login}!</p>
      </div>

      <div className="grid-3 mb-30">
        <div className="stat-card">
          <div className="stat-card-label">Предстоящие сессии</div>
          <div className="stat-card-value">{stats.upcoming_sessions || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Средний рейтинг</div>
          <div className="stat-card-value text-accent">{stats.avg_rating || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Оценка MMR</div>
          <div className="stat-card-value">{profile.mmr_estimate || 'N/A'}</div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Быстрые действия</h3>
        <div className="flex gap-10">
          <a href="/coach/profile" className="btn btn-outline">Редактировать профиль</a>
          <a href="/coach/schedule" className="btn btn-outline">Расписание</a>
          <a href="/coach/reviews" className="btn btn-outline">Отзывы</a>
        </div>
      </div>
    </div>
  );
}
