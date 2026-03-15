import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    coreApi.get('/admin/users').then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Управление пользователями</h1>
        <p>Просмотр и управление пользователями</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Auth User ID</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.auth_user_id}</td>
                <td>
                  <button className="btn btn-outline btn-sm">Просмотр</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
