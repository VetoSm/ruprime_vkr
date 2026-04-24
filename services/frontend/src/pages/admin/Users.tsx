import { useCallback, useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

type Tab = 'players' | 'coaches' | 'applications';

interface CoachApplication {
  id: number;
  login: string;
  email: string;
  role: string;
  coach_application_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  coach_application_requested_at: string | null;
  coach_approved_at: string | null;
}

export default function AdminUsers() {
  const [players, setPlayers] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [applications, setApplications] = useState<CoachApplication[]>([]);
  const [tab, setTab] = useState<Tab>('players');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadApplications = useCallback(() => {
    coreApi.get('/admin/coach-applications').then((r) => {
      setApplications(r.data?.items || []);
    }).catch(() => setApplications([]));
  }, []);

  useEffect(() => {
    coreApi.get('/admin/profiles').then((r) => {
      setPlayers(r.data?.players || []);
      setCoaches(r.data?.coaches || []);
    }).catch(() => {});
    loadApplications();
  }, [loadApplications]);

  const approve = async (authUserId: number) => {
    setBusyId(authUserId); setMsg(null); setErr(null);
    try {
      await coreApi.post(`/admin/coaches/${authUserId}/verify`);
      setMsg(`Пользователь ${authUserId} подтверждён как тренер.`);
      loadApplications();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось подтвердить');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (authUserId: number) => {
    setBusyId(authUserId); setMsg(null); setErr(null);
    try {
      await coreApi.post(`/admin/coaches/${authUserId}/reject`);
      setMsg(`Заявка ${authUserId} отклонена.`);
      loadApplications();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось отклонить');
    } finally {
      setBusyId(null);
    }
  };

  const unverify = async (authUserId: number) => {
    setBusyId(authUserId); setMsg(null); setErr(null);
    try {
      await coreApi.post(`/admin/coaches/${authUserId}/unverify`);
      setMsg(`Тренер ${authUserId} скрыт из каталога.`);
      loadApplications();
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось скрыть');
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = applications.filter((a) => a.coach_application_status === 'PENDING').length;

  return (
    <div>
      <div className="page-header">
        <h1>Профили и заявки</h1>
        <p>Админский обзор и подтверждение тренеров</p>
      </div>

      {msg && <div className="alert alert-success mb-20">{msg}</div>}
      {err && <div className="alert alert-error mb-20">{err}</div>}

      <div className="tabs">
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
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busyId === a.id}
                          onClick={() => approve(a.id)}
                        >
                          Подтвердить
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={busyId === a.id}
                          onClick={() => reject(a.id)}
                        >
                          Отклонить
                        </button>
                      </div>
                    )}
                    {a.coach_application_status === 'APPROVED' && (
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={busyId === a.id}
                        onClick={() => unverify(a.id)}
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
    </div>
  );
}
