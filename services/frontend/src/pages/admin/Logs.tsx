import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const params: any = {};
    if (filter) params.action_type = filter;
    coreApi.get('/admin/logs', { params }).then((r) => setLogs(r.data)).catch(() => {});
  }, [filter]);

  return (
    <div>
      <div className="page-header">
        <h1>Логи действий</h1>
        <p>Журнал действий в системе</p>
      </div>

      <div className="form-group" style={{ maxWidth: 300 }}>
        <label>Фильтр по типу действия</label>
        <input
          className="form-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="e.g. CREATE_REQUEST"
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>Действие</th>
              <th>Объект</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{log.core_user_id || '-'}</td>
                <td>{log.role || '-'}</td>
                <td><span className="badge badge-accent">{log.action_type}</span></td>
                <td>{log.entity_type ? `${log.entity_type} #${log.entity_id}` : '-'}</td>
                <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
