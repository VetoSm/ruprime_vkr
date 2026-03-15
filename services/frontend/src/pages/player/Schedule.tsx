import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function PlayerSchedule() {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    coreApi.get('/training-sessions/my').then((r) => setSessions(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Расписание</h1>
        <p>Предстоящие и прошедшие тренировки</p>
      </div>

      {sessions.length === 0 ? (
        <div className="card"><p className="text-muted">Сессий пока не запланировано.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Коуч</th>
                <th>Запланировано</th>
                <th>Длительность</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>Коуч №{s.coach_profile_id}</td>
                  <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : '-'}</td>
                  <td>{s.duration_minutes ? `${s.duration_minutes} мин` : '-'}</td>
                  <td>
                    <span className={`badge ${s.status === 'COMPLETED' ? 'badge-accent' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
