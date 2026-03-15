import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function CoachSchedule() {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    coreApi.get('/training-sessions/my').then((r) => setSessions(r.data)).catch(() => {});
  }, []);

  const complete = async (id: number) => {
    await coreApi.patch(`/training-sessions/${id}`, { action: 'COMPLETE' });
    setSessions(sessions.map(s => s.id === id ? { ...s, status: 'COMPLETED' } : s));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Расписание тренера</h1>
        <p>Ваши тренировочные сессии</p>
      </div>

      {sessions.length === 0 ? (
        <div className="card"><p className="text-muted">Нет сессий.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Заявка</th>
                <th>Дата</th>
                <th>Длительность</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>#{s.training_request_id}</td>
                  <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : '-'}</td>
                  <td>{s.duration_minutes} min</td>
                  <td><span className={`badge ${s.status === 'COMPLETED' ? 'badge-accent' : 'badge-warning'}`}>{s.status}</span></td>
                  <td>
                    {s.status === 'PLANNED' && (
                      <button className="btn btn-primary btn-sm" onClick={() => complete(s.id)}>Завершить</button>
                    )}
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
