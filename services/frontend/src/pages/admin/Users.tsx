import { useCallback, useEffect, useMemo, useState } from 'react';
import { coreApi } from '../../api/client';

type Tab = 'all' | 'players' | 'coaches' | 'applications';

interface CoachApplication {
  id: number;
  login: string;
  email: string;
  role: string;
  coach_application_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  coach_application_requested_at: string | null;
  coach_approved_at: string | null;
}

interface FullUser {
  auth_user_id: number;
  login: string;
  email: string;
  role: 'PLAYER' | 'COACH' | 'ADMIN';
  is_active: boolean;
  coach_application_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  coach_application_requested_at: string | null;
  created_at: string | null;
  steam_id: string | null;
  steam_id_in_profile: string | null;
  steam_linked: boolean;
  dota_account_id: string | null;
  dota_personaname: string | null;
  dota_rank_name: string | null;
  lifetime_games: number | null;
  parsed_games_n: number | null;
  core_user_id: number | null;
  player_profile_id: number | null;
  player_desired_rank: string | null;
  coach_profile_id: number | null;
  coach_is_verified: boolean | null;
  coach_hourly_rate: number | null;
  coach_mmr_estimate: number | null;
  sessions_as_player: number;
  sessions_as_coach: number;
}

const ROLE_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  ADMIN:  { bg: 'var(--danger-bg)',  border: 'var(--danger)',  color: 'var(--danger)' },
  COACH:  { bg: 'var(--purple-bg)',  border: 'var(--purple)',  color: 'var(--purple)' },
  PLAYER: { bg: 'var(--accent-bg)',  border: 'var(--accent)',  color: 'var(--accent)' },
};

export default function AdminUsers() {
  const [players, setPlayers] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [applications, setApplications] = useState<CoachApplication[]>([]);
  const [allUsers, setAllUsers] = useState<FullUser[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'PLAYER' | 'COACH' | 'ADMIN'>('');
  const [steamFilter, setSteamFilter] = useState<'' | 'linked' | 'unlinked'>('');

  const loadAll = useCallback(() => {
    coreApi.get('/admin/users-full').then((r) => setAllUsers(r.data?.items || [])).catch(() => setAllUsers([]));
    coreApi.get('/admin/coach-applications').then((r) => setApplications(r.data?.items || [])).catch(() => setApplications([]));
    coreApi.get('/admin/profiles').then((r) => {
      setPlayers(r.data?.players || []);
      setCoaches(r.data?.coaches || []);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const approve = async (authUserId: number) => {
    setBusyId(authUserId); setMsg(null); setErr(null);
    try {
      await coreApi.post(`/admin/coaches/${authUserId}/verify`);
      setMsg(`Пользователь ${authUserId} подтверждён как тренер.`);
      loadAll();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось подтвердить');
    } finally { setBusyId(null); }
  };

  const reject = async (authUserId: number) => {
    setBusyId(authUserId); setMsg(null); setErr(null);
    try {
      await coreApi.post(`/admin/coaches/${authUserId}/reject`);
      setMsg(`Заявка ${authUserId} отклонена.`);
      loadAll();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось отклонить');
    } finally { setBusyId(null); }
  };

  const unverify = async (authUserId: number) => {
    setBusyId(authUserId); setMsg(null); setErr(null);
    try {
      await coreApi.post(`/admin/coaches/${authUserId}/unverify`);
      setMsg(`Тренер ${authUserId} скрыт из каталога.`);
      loadAll();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось скрыть');
    } finally { setBusyId(null); }
  };

  const changeRole = async (u: FullUser, newRole: 'PLAYER' | 'COACH' | 'ADMIN') => {
    if (newRole === u.role) return;
    const warn =
      newRole === 'ADMIN' ? `Дать ADMIN-доступ пользователю ${u.login}?` :
      newRole === 'COACH' ? `Назначить ${u.login} тренером? Будет создан CoachProfile с is_verified=true.` :
      `Снять роль ${u.role} с ${u.login} и сделать игроком?`;
    if (!window.confirm(warn)) return;
    setBusyId(u.auth_user_id); setMsg(null); setErr(null);
    try {
      await coreApi.post(`/admin/users/${u.auth_user_id}/role`, { role: newRole });
      setMsg(`Роль ${u.login} → ${newRole}.`);
      loadAll();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось сменить роль');
    } finally { setBusyId(null); }
  };

  const pendingCount = applications.filter((a) => a.coach_application_status === 'PENDING').length;

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (steamFilter === 'linked' && !u.steam_linked) return false;
      if (steamFilter === 'unlinked' && u.steam_linked) return false;
      if (!q) return true;
      const hay = [u.login, u.email, u.dota_personaname, u.steam_id, String(u.auth_user_id), String(u.dota_account_id || '')]
        .filter(Boolean).map((s) => String(s).toLowerCase());
      return hay.some((s) => s.includes(q));
    });
  }, [allUsers, query, roleFilter, steamFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>Профили и заявки</h1>
        <p>Админский обзор пользователей, ролей и тренеров</p>
      </div>

      {msg && <div className="alert alert-success mb-20">{msg}</div>}
      {err && <div className="alert alert-error mb-20">{err}</div>}

      <div className="tabs">
        <div className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          Все пользователи ({allUsers.length})
        </div>
        <div className={`tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>
          Игроки ({players.length})
        </div>
        <div className={`tab ${tab === 'coaches' ? 'active' : ''}`} onClick={() => setTab('coaches')}>
          Тренеры ({coaches.length})
        </div>
        <div className={`tab ${tab === 'applications' ? 'active' : ''}`} onClick={() => setTab('applications')}>
          Заявки в тренеры ({pendingCount})
        </div>
      </div>

      {tab === 'all' && (
        <>
          <div className="card mb-20" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 240px' }}>
              <label>Поиск</label>
              <input
                className="form-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Логин, email, Steam ID, ник в Dota, account_id..."
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Роль</label>
              <select className="form-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)}>
                <option value="">Все</option>
                <option value="PLAYER">PLAYER</option>
                <option value="COACH">COACH</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Steam</label>
              <select className="form-select" value={steamFilter} onChange={(e) => setSteamFilter(e.target.value as any)}>
                <option value="">Любой</option>
                <option value="linked">Привязан</option>
                <option value="unlinked">Не привязан</option>
              </select>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: 'auto' }}>
              Показано: {filteredAll.length} из {allUsers.length}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Логин / Email</th>
                  <th>Роль</th>
                  <th>Steam</th>
                  <th>Dota-ник / Ранг</th>
                  <th>Игр</th>
                  <th>Сессий (P/C)</th>
                  <th>Заявка</th>
                  <th>Сменить роль</th>
                </tr>
              </thead>
              <tbody>
                {filteredAll.map((u) => {
                  const badge = ROLE_BADGE[u.role] || ROLE_BADGE.PLAYER;
                  return (
                    <tr key={u.auth_user_id}>
                      <td>{u.auth_user_id}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.login}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                      </td>
                      <td>
                        <span className="badge" style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        {u.steam_linked ? (
                          <div>
                            <div style={{ fontSize: '0.82rem' }}>{u.steam_id}</div>
                            {u.dota_account_id && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>acc #{u.dota_account_id}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {u.dota_personaname ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{u.dota_personaname}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {u.dota_rank_name || 'без ранга'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>{u.lifetime_games?.toLocaleString('ru-RU') ?? '—'}</td>
                      <td>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                          {u.sessions_as_player} / {u.sessions_as_coach}
                        </span>
                      </td>
                      <td>
                        {u.coach_application_status === 'PENDING' && <span className="badge badge-warning">PENDING</span>}
                        {u.coach_application_status === 'APPROVED' && <span className="badge badge-accent">APPROVED</span>}
                        {u.coach_application_status === 'REJECTED' && <span className="badge" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>REJECTED</span>}
                        {u.coach_application_status === 'NONE' && <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <select
                          className="form-select"
                          value={u.role}
                          disabled={busyId === u.auth_user_id}
                          onChange={(e) => changeRole(u, e.target.value as 'PLAYER' | 'COACH' | 'ADMIN')}
                          style={{ minWidth: 110 }}
                        >
                          <option value="PLAYER">PLAYER</option>
                          <option value="COACH">COACH</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {filteredAll.length === 0 && (
                  <tr><td colSpan={9} className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Никого не нашлось по фильтрам</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'players' && (
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
      )}

      {tab === 'coaches' && (
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
                <th>Верифицирован</th>
                <th>Действия</th>
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
                  <td>{c.is_verified ? 'Да' : '—'}</td>
                  <td>
                    {c.auth_user_id && c.is_verified && (
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={busyId === c.auth_user_id}
                        onClick={() => unverify(c.auth_user_id)}
                      >
                        Скрыть из каталога
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'applications' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Auth ID</th>
                <th>Логин</th>
                <th>Email</th>
                <th>Статус</th>
                <th>Подана</th>
                <th>Одобрена</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 && (
                <tr><td colSpan={7} className="text-muted">Заявок нет</td></tr>
              )}
              {applications.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.login}</td>
                  <td>{a.email}</td>
                  <td>
                    {a.coach_application_status === 'PENDING' && <span className="badge badge-accent">PENDING</span>}
                    {a.coach_application_status === 'APPROVED' && <span className="badge badge-accent">APPROVED</span>}
                    {a.coach_application_status === 'REJECTED' && <span className="badge" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>REJECTED</span>}
                  </td>
                  <td>{a.coach_application_requested_at ? new Date(a.coach_application_requested_at).toLocaleString('ru-RU') : '—'}</td>
                  <td>{a.coach_approved_at ? new Date(a.coach_approved_at).toLocaleString('ru-RU') : '—'}</td>
                  <td>
                    {a.coach_application_status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-primary btn-sm" disabled={busyId === a.id} onClick={() => approve(a.id)}>
                          Подтвердить
                        </button>
                        <button className="btn btn-outline btn-sm" disabled={busyId === a.id} onClick={() => reject(a.id)}>
                          Отклонить
                        </button>
                      </div>
                    )}
                    {a.coach_application_status === 'APPROVED' && (
                      <button className="btn btn-outline btn-sm" disabled={busyId === a.id} onClick={() => unverify(a.id)}>
                        Скрыть из каталога
                      </button>
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
