import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import SessionsCalendar from '../../ui/SessionsCalendar';
import { InfoTooltip } from '../../ui/GameComponents';

export default function AdminSessions() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [newDateTime, setNewDateTime] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    const res = await coreApi.get('/training-sessions/my');
    setSessions(res.data || []);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const filtered = sessions.filter((s) => statusFilter ? s.status === statusFilter : true);

  const patchStatus = async (id: number, action: 'CANCEL' | 'COMPLETE') => {
    await coreApi.patch(`/training-sessions/${id}`, { action });
    await load();
  };

  const reschedule = async () => {
    if (!rescheduleId || !newDateTime) return;
    await coreApi.patch(`/training-sessions/${rescheduleId}`, {
      action: 'RESCHEDULE',
      scheduled_at: new Date(newDateTime).toISOString(),
    });
    await load();
    setRescheduleId(null);
    setNewDateTime('');
  };

  return (
    <div>
      <div className="page-header">
        <h1>Записи и календарь</h1>
        <p>Кто и на какое время записан. Можно корректировать расписание.</p>
      </div>

      <div className="card mb-20">
        <div className="grid-4">
          <div className="stat-card">
            <div className="stat-card-label">Всего сессий <InfoTooltip text="Все записи на тренировки в системе." /></div>
            <div className="stat-card-value">{sessions.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Запланировано <InfoTooltip text="Сессии со статусом PLANNED." /></div>
            <div className="stat-card-value">{sessions.filter((s) => s.status === 'PLANNED').length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Завершено <InfoTooltip text="Сессии со статусом COMPLETED." /></div>
            <div className="stat-card-value">{sessions.filter((s) => s.status === 'COMPLETED').length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Отменено <InfoTooltip text="Сессии со статусом CANCELLED." /></div>
            <div className="stat-card-value">{sessions.filter((s) => s.status === 'CANCELLED').length}</div>
          </div>
        </div>
      </div>

      <SessionsCalendar sessions={filtered} />

      <div className="card mb-20">
        <div className="flex-between">
          <h3 className="card-title">Список записей</h3>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
            <label>Фильтр статуса</label>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="PLANNED">PLANNED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="RESCHEDULED">RESCHEDULED</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Игрок</th>
                <th>Тренер</th>
                <th>Заявка</th>
                <th>Дата</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.player_label || `Игрок #${s.player_profile_id || '-'}`}</td>
                  <td>{s.coach_label || `Тренер #${s.coach_profile_id}`}</td>
                  <td>#{s.training_request_id}</td>
                  <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('ru-RU') : '-'}</td>
                  <td>
                    <span className={`badge ${s.status === 'COMPLETED' ? 'badge-accent' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setRescheduleId(s.id)}>Перенести</button>
                      {s.status !== 'CANCELLED' && (
                        <button className="btn btn-danger btn-sm" onClick={() => patchStatus(s.id, 'CANCEL')}>Отменить</button>
                      )}
                      {s.status === 'PLANNED' && (
                        <button className="btn btn-primary btn-sm" onClick={() => patchStatus(s.id, 'COMPLETE')}>Завершить</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rescheduleId && (
        <div className="card mb-20">
          <h3 className="card-title">Корректировка времени сессии #{rescheduleId}</h3>
          <div className="flex gap-10" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Новая дата и время</label>
              <input
                type="datetime-local"
                className="form-input"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={reschedule}>Сохранить</button>
            <button className="btn btn-outline" onClick={() => setRescheduleId(null)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
