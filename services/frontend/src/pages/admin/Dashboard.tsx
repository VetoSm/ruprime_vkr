import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    coreApi.get('/admin/stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Панель администратора</h1>
        <p>Обзор системы и метрики</p>
      </div>

      <div className="grid-4 mb-30">
        <div className="stat-card">
          <div className="stat-card-label">Всего пользователей</div>
          <div className="stat-card-value">{stats?.total_users || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Игроков</div>
          <div className="stat-card-value">{stats?.players || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Тренеров</div>
          <div className="stat-card-value">{stats?.coaches || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Средний рейтинг тренеров</div>
          <div className="stat-card-value text-accent">{stats?.avg_coach_rating || 'N/A'}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="stat-card">
          <div className="stat-card-label">Активных заявок</div>
          <div className="stat-card-value">{stats?.active_requests || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Всего сессий</div>
          <div className="stat-card-value">{stats?.total_sessions || 0}</div>
        </div>
      </div>
    </div>
  );
}
