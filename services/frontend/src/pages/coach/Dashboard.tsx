import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { InfoTooltip } from '../../ui/GameComponents';

export default function CoachDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    coreApi.get('/me/overview').then((r) => setOverview(r.data)).catch(() => {});
    coreApi.get('/training-sessions/my').then((r) => setSessions(r.data || [])).catch(() => {});
  }, []);

  const stats = overview?.stats || {};
  const profile = overview?.profile || {};
  const plannedSessions = sessions.filter((s) => s.status === 'PLANNED').length;
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED').length;
  const cancelledSessions = sessions.filter((s) => s.status === 'CANCELLED').length;

  return (
    <div>
      <div className="page-header">
        <h1>Панель тренера</h1>
        <p>С возвращением, {user?.login}! Обзор метрик и записей учеников.</p>
      </div>

      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-card-label">Предстоящие сессии <InfoTooltip text="Количество ваших тренировок в статусе PLANNED." /></div>
          <div className="stat-card-value">{plannedSessions || stats.upcoming_sessions || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Средний рейтинг <InfoTooltip text="Средняя оценка по отзывам учеников." /></div>
          <div className="stat-card-value text-accent">{stats.avg_rating || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Оценка MMR <InfoTooltip text="Ваша заявленная/сохраненная MMR-оценка." /></div>
          <div className="stat-card-value">{profile.mmr_estimate || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Завершено сессий <InfoTooltip text="Количество тренировок со статусом COMPLETED." /></div>
          <div className="stat-card-value text-accent">{completedSessions}</div>
        </div>
      </div>

      <div className="grid-3 mb-30">
        <div className="stat-card">
          <div className="stat-card-label">Всего записей <InfoTooltip text="Суммарно все сессии в вашем расписании." /></div>
          <div className="stat-card-value">{sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Отменено <InfoTooltip text="Сессии в статусе CANCELLED." /></div>
          <div className="stat-card-value">{cancelledSessions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Статус профиля <InfoTooltip text="Верификация влияет на доверие игроков к профилю тренера." /></div>
          <div className="stat-card-value">{profile.is_verified ? 'Верифицирован' : 'Не верифицирован'}</div>
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
