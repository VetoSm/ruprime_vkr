import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function PlayerRequests() {
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    coreApi.get('/matchmaking/requests/my').then((r) => setRequests(r.data)).catch(() => {});
  }, []);

  const cancel = async (id: number) => {
    await coreApi.patch(`/matchmaking/requests/${id}`, { action: 'CANCEL' });
    setRequests(requests.map(r => r.id === id ? { ...r, status: 'CANCELLED' } : r));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Мои запросы</h1>
        <p>Просмотр и управление запросами на тренировки</p>
      </div>

      {requests.length === 0 ? (
        <div className="card"><p className="text-muted">Запросов пока нет.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Позиция</th>
                <th>Фокус</th>
                <th>Статус</th>
                <th>Коучи</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.desired_role || '-'}</td>
                  <td>{r.focus_area || '-'}</td>
                  <td>
                    <span className={`badge ${r.status === 'CANCELLED' ? 'badge-danger' : r.status === 'ACCEPTED' ? 'badge-accent' : 'badge-warning'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.recommended_coaches?.length || 0}</td>
                  <td>
                    {!['CANCELLED', 'ACCEPTED', 'REJECTED'].includes(r.status) && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancel(r.id)}>Отменить</button>
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
