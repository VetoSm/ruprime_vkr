import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function AdminUsers() {
  const [players, setPlayers] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [tab, setTab] = useState<'players' | 'coaches'>('players');

  useEffect(() => {
    coreApi.get('/admin/profiles').then((r) => {
      setPlayers(r.data?.players || []);
      setCoaches(r.data?.coaches || []);
    }).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Профили игроков и тренеров</h1>
        <p>Админский обзор профилей и активности по сессиям</p>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>
          Игроки ({players.length})
        </div>
        <div className={`tab ${tab === 'coaches' ? 'active' : ''}`} onClick={() => setTab('coaches')}>
          Тренеры ({coaches.length})
        </div>
      </div>

      {tab === 'players' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID профиля</th>
                <th>Core user</th>
                <th>Ранг</th>
                <th>Роли</th>
                <th>Сессий</th>
                <th>Завершено</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.core_user_id}</td>
                  <td>{p.rank_or_mmr || '—'}</td>
                  <td>{Array.isArray(p.roles) ? p.roles.join(', ') : (p.roles ? JSON.stringify(p.roles) : '—')}</td>
                  <td>{p.sessions_total || 0}</td>
                  <td>{p.sessions_completed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID профиля</th>
                <th>Core user</th>
                <th>MMR/ранг</th>
                <th>Роли</th>
                <th>Сессий</th>
                <th>Завершено</th>
              </tr>
            </thead>
            <tbody>
              {coaches.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.core_user_id}</td>
                  <td>{c.rank_or_mmr || '—'}</td>
                  <td>{Array.isArray(c.roles) ? c.roles.join(', ') : '—'}</td>
                  <td>{c.sessions_total || 0}</td>
                  <td>{c.sessions_completed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
