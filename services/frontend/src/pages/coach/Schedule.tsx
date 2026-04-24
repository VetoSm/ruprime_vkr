import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import SessionsCalendar from '../../ui/SessionsCalendar';

export default function CoachSchedule() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [newDateTime, setNewDateTime] = useState('');

  useEffect(() => {
    coreApi.get('/training-sessions/my').then((r) => setSessions(r.data)).catch(() => {});
  }, []);

  const complete = async (id: number) => {
    await coreApi.patch(`/training-sessions/${id}`, { action: 'COMPLETE' });
    setSessions(sessions.map(s => s.id === id ? { ...s, status: 'COMPLETED' } : s));
  };

  const cancel = async (id: number) => {
    if (!window.confirm('Отменить эту сессию? Ученик увидит статус CANCELLED.')) return;
    await coreApi.patch(`/training-sessions/${id}`, { action: 'CANCEL' });
    setSessions(sessions.map(s => s.id === id ? { ...s, status: 'CANCELLED' } : s));
  };

  const reschedule = async () => {
    if (!rescheduleId || !newDateTime) return;
    await coreApi.patch(`/training-sessions/${rescheduleId}`, {
      action: 'RESCHEDULE',
      scheduled_at: new Date(newDateTime).toISOString(),
    });
    const res = await coreApi.get('/training-sessions/my');
    setSessions(res.data);
    setRescheduleId(null);
    setNewDateTime('');
  };

  return (
    <div>
      <div className="page-header">
        <h1>Расписание тренера</h1>
        <p>Ваши записи учеников и календарь тренировок</p>
      </div>

      {sessions.length === 0 ? (
        <div className="card"><p className="text-muted">Нет сессий.</p></div>
      ) : (
        <>
          <SessionsCalendar sessions={sessions} />

          {rescheduleId && (
            <div className="card mb-20">
              <h3 className="card-title">Перенос сессии #{rescheduleId}</h3>
              <div className="flex gap-10" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Новая дата и время</label>
                  <input type="datetime-local" className="form-input" value={newDateTime} onChange={(e) => setNewDateTime(e.target.value)} />
                </div>
                <button className="btn btn-primary" onClick={reschedule}>Сохранить</button>
                <button className="btn btn-outline" onClick={() => setRescheduleId(null)}>Отмена</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Игрок</th>
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
                    <td>{s.player_label || `Игрок #${s.player_profile_id || '-'}`}</td>
                    <td>#{s.training_request_id}</td>
                    <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('ru-RU') : '-'}</td>
                    <td>{s.duration_minutes ? `${s.duration_minutes} мин` : '-'}</td>
                    <td><span className={`badge ${s.status === 'COMPLETED' ? 'badge-accent' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}`}>{s.status}</span></td>
                    <td>
                      <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
                        {s.status === 'PLANNED' && (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => complete(s.id)}>Завершить</button>
                            <button className="btn btn-outline btn-sm" onClick={() => setRescheduleId(s.id)}>Перенести</button>
                            <button className="btn btn-danger btn-sm" onClick={() => cancel(s.id)}>Отменить</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
