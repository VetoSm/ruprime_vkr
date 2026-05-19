import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';

export default function PlayerRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState('');
  const [focus, setFocus] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    coreApi.get('/matchmaking/requests/my').then((r) => setRequests(r.data)).catch(() => {});
  }, []);

  const primaryCoach = (request: any) => {
    if (request.coach_profile_id) return request;
    return (request.recommended_coaches || []).find((coach: any) => coach?.coach_profile_id);
  };

  const cancel = async (id: number) => {
    await coreApi.patch(`/matchmaking/requests/${id}`, { action: 'CANCEL' });
    setRequests(requests.map(r => r.id === id ? { ...r, status: 'CANCELLED' } : r));
  };

  const createRequest = async () => {
    setLoading(true); setMsg(null); setErr(null);
    try {
      const res = await coreApi.post('/matchmaking/requests', {
        desired_role: role || undefined,
        focus_area: focus || undefined,
        use_ai_coach: useAi,
      });
      setRequests([res.data, ...requests]);
      setMsg(
        res.data?.recommended_coaches?.length
          ? `Заявка создана. Подобрано рекомендаций: ${res.data.recommended_coaches.length}.`
          : 'Заявка создана. Рекомендации появятся в течение минуты.'
      );
      setCreating(false);
      setRole(''); setFocus(''); setUseAi(false);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось создать заявку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Мои заявки</h1>
          <p>Создавайте заявки на подбор тренера и следите за их статусом</p>
        </div>
        <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
          <Link to="/coaches" className="btn btn-outline">Открыть каталог тренеров</Link>
          <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Скрыть форму' : 'Новая заявка'}
          </button>
        </div>
      </div>

      {msg && <div className="alert alert-success mb-20">{msg}</div>}
      {err && <div className="alert alert-error mb-20">{err}</div>}

      {creating && (
        <div className="card mb-20">
          <div className="section-header">
            <h3>Новая заявка на подбор</h3>
            <div className="section-line" />
          </div>
          <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: 12 }}>
            Система подберёт подходящих тренеров под вашу статистику и цели. Если хотите записаться к конкретному — откройте каталог и нажмите «Записаться» на карточке.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label>Желаемая позиция</label>
              <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Любая</option>
                <option value="POS1">Carry</option>
                <option value="POS2">Mid</option>
                <option value="POS3">Offlane</option>
                <option value="POS4">Soft Support</option>
                <option value="POS5">Hard Support</option>
              </select>
            </div>
            <div className="form-group">
              <label>Область фокуса</label>
              <select className="form-select" value={focus} onChange={(e) => setFocus(e.target.value)}>
                <option value="">Общее</option>
                <option value="lane_control">Контроль линии</option>
                <option value="macro">Макро / движение по карте</option>
                <option value="hero_pool">Пул героев</option>
                <option value="teamfight">Позиционирование в тимфайтах</option>
                <option value="communication">Коммуникация</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />{' '}
              Также получить рекомендации ИИ-коуча
            </label>
          </div>
          <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={createRequest} disabled={loading}>
              {loading ? 'Создаём...' : 'Создать заявку'}
            </button>
            <button className="btn btn-outline" onClick={() => setCreating(false)} disabled={loading}>Отмена</button>
          </div>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="text-muted" style={{ marginBottom: 14 }}>Пока нет ни одной заявки. Создайте первую — мы подберём тренеров под вашу статистику.</p>
          <div className="flex gap-10" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>Новая заявка</button>
            <Link to="/coaches" className="btn btn-outline">Каталог тренеров</Link>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Позиция</th>
                <th>Фокус</th>
                <th>Статус</th>
                <th>Тренер</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const coach = primaryCoach(r);
                const coachId = coach?.coach_profile_id || coach?.id;
                const coachLabel = coach?.coach_label || (coachId ? `Тренер #${coachId}` : null);
                return (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.desired_role || '—'}</td>
                    <td>{r.focus_area || '—'}</td>
                    <td>
                      <span className={`badge ${r.status === 'CANCELLED' || r.status === 'REJECTED' ? 'badge-danger' : r.status === 'ACCEPTED' ? 'badge-accent' : 'badge-warning'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {coachId ? (
                        <div>
                          <Link to={`/coaches#coach-${coachId}`}>{coachLabel}</Link>
                          <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                            ID #{coachId}
                            {coach?.rank_tier || r.coach_rank_tier ? ` · ${coach?.rank_tier || r.coach_rank_tier}` : ''}
                            {coach?.mmr_estimate || r.coach_mmr_estimate ? ` · MMR ${(coach?.mmr_estimate || r.coach_mmr_estimate).toLocaleString()}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">
                          {r.recommended_coaches?.length ? `Рекомендаций: ${r.recommended_coaches.length}` : '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      {!['CANCELLED', 'ACCEPTED', 'REJECTED'].includes(r.status) && (
                        <button className="btn btn-danger btn-sm" onClick={() => cancel(r.id)}>Отменить</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
