import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import SessionsCalendar from '../../ui/SessionsCalendar';

interface Session {
  id: number;
  coach_profile_id?: number;
  coach_label?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  status: string;
  review_given?: boolean;
}

export default function PlayerSchedule() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reviewFor, setReviewFor] = useState<Session | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = () => {
    coreApi.get('/training-sessions/my').then((r) => setSessions(r.data)).catch(() => {});
  };

  useEffect(() => { reload(); }, []);

  const cancel = async (id: number) => {
    if (!window.confirm('Отменить сессию? Действие обратимо только через тренера.')) return;
    setErr(null); setMsg(null);
    try {
      await coreApi.patch(`/training-sessions/${id}`, { action: 'CANCEL' });
      setSessions((prev) => prev.map(s => s.id === id ? { ...s, status: 'CANCELLED' } : s));
      setMsg('Сессия отменена.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось отменить сессию');
    }
  };

  const submitReview = async () => {
    if (!reviewFor) return;
    setSaving(true); setErr(null); setMsg(null);
    try {
      await coreApi.post('/coach-reviews', {
        training_session_id: reviewFor.id,
        rating,
        comment: comment || undefined,
      });
      setMsg('Спасибо! Отзыв сохранён.');
      setReviewFor(null);
      setComment(''); setRating(5);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось сохранить отзыв');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Расписание</h1>
        <p>Ваши записи на тренировки и календарь занятий</p>
      </div>

      {msg && <div className="alert alert-success mb-20">{msg}</div>}
      {err && <div className="alert alert-error mb-20">{err}</div>}

      {sessions.length === 0 ? (
        <div className="card"><p className="text-muted">Сессий пока не запланировано.</p></div>
      ) : (
        <>
          <SessionsCalendar sessions={sessions} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Тренер</th>
                  <th>Дата и время</th>
                  <th>Длительность</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.coach_label || `Тренер #${s.coach_profile_id}`}</td>
                    <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('ru-RU') : '—'}</td>
                    <td>{s.duration_minutes ? `${s.duration_minutes} мин` : '—'}</td>
                    <td>
                      <span className={`badge ${s.status === 'COMPLETED' ? 'badge-accent' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
                        {s.status === 'PLANNED' && (
                          <button className="btn btn-danger btn-sm" onClick={() => cancel(s.id)}>Отменить</button>
                        )}
                        {s.status === 'COMPLETED' && (
                          <button className="btn btn-primary btn-sm" onClick={() => setReviewFor(s)}>
                            Оставить отзыв
                          </button>
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

      {reviewFor && (
        <div
          onClick={() => (!saving ? setReviewFor(null) : null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(4,10,24,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420 }}>
            <div className="section-header">
              <h3 style={{ margin: 0 }}>Отзыв о сессии #{reviewFor.id}</h3>
              <div className="section-line" />
            </div>
            <div className="form-group">
              <label>Оценка</label>
              <div className="flex gap-10" style={{ fontSize: '1.4rem' }}>
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRating(r)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: r <= rating ? 'var(--accent)' : 'var(--text-muted)', padding: 0,
                    }}
                    aria-label={`Оценка ${r}`}
                  >
                    &#9733;
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Комментарий (опционально)</label>
              <textarea
                className="form-input"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Что помогло, что стоит улучшить в тренировке"
              />
            </div>
            <div className="flex gap-10" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={() => setReviewFor(null)} disabled={saving}>Отмена</button>
              <button className="btn btn-primary" onClick={submitReview} disabled={saving}>
                {saving ? 'Сохраняем...' : 'Оставить отзыв'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
