import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { EmptyState } from '../../ui/Primitives';
import { IconChevronRight, IconCalendar, IconClose, IconStar } from '../../ui/Icons';

type TabId = 'all' | 'active' | 'pending' | 'done';

interface SessionItem {
  kind: 'session';
  id: number;
  status: string;        // PLANNED / COMPLETED / CANCELLED / RESCHEDULED
  scheduled_at?: string;
  duration_minutes?: number;
  coach_label?: string;
  coach_profile_id?: number;
  topic?: string;
  review_given?: boolean;
}

interface RequestItem {
  kind: 'request';
  id: number;
  status: string;        // NEW / MATCHING / WAITING_CONFIRMATION / ACCEPTED / REJECTED / CANCELLED
  desired_role?: string;
  focus_area?: string;
  coach_label?: string;
  coach_profile_id?: number;
  created_at?: string;
}

type Item = SessionItem | RequestItem;

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'all',     label: 'Все' },
  { id: 'active',  label: 'Активные' },
  { id: 'pending', label: 'Ожидают' },
  { id: 'done',    label: 'Завершённые' },
];

const SESSION_STATUS: Record<string, { label: string; tone: 'cyan' | 'success' | 'danger' | 'muted' }> = {
  PLANNED:     { label: 'Подтверждена', tone: 'cyan' },
  COMPLETED:   { label: 'Завершена',    tone: 'success' },
  CANCELLED:   { label: 'Отменена',     tone: 'danger' },
  RESCHEDULED: { label: 'Перенесена',   tone: 'muted' },
};

const REQUEST_STATUS: Record<string, { label: string; tone: 'cyan' | 'warning' | 'success' | 'danger' | 'muted' }> = {
  NEW:                  { label: 'Новая',              tone: 'cyan' },
  MATCHING:             { label: 'Подбираем',          tone: 'warning' },
  WAITING_CONFIRMATION: { label: 'Ждёт подтверждения', tone: 'warning' },
  ACCEPTED:             { label: 'Принята',            tone: 'success' },
  REJECTED:             { label: 'Отклонена',          tone: 'muted' },
  CANCELLED:            { label: 'Отменена',           tone: 'danger' },
};

function isActive(item: Item): boolean {
  if (item.kind === 'session') return item.status === 'PLANNED' || item.status === 'RESCHEDULED';
  return ['NEW', 'MATCHING', 'WAITING_CONFIRMATION'].includes(item.status);
}
function isPending(item: Item): boolean {
  if (item.kind === 'request') return ['NEW', 'MATCHING', 'WAITING_CONFIRMATION'].includes(item.status);
  return false;
}
function isDone(item: Item): boolean {
  if (item.kind === 'session') return item.status === 'COMPLETED' || item.status === 'CANCELLED';
  return ['ACCEPTED', 'REJECTED', 'CANCELLED'].includes(item.status);
}

function initials(s?: string): string {
  if (!s) return '?';
  const parts = s.replace(/[#_\-.]/g, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function PlayerRequests() {
  const [tab, setTab] = useState<TabId>('all');
  const [sessions, setSessions] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Review modal
  const [reviewFor, setReviewFor] = useState<SessionItem | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      coreApi.get('/training-sessions/my').then((r) => setSessions(Array.isArray(r.data) ? r.data : [])).catch(() => {}),
      coreApi.get('/matchmaking/requests/my').then((r) => setReqs(Array.isArray(r.data) ? r.data : [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const items: Item[] = useMemo(() => {
    const fromSessions: SessionItem[] = sessions.map((s: any) => ({
      kind: 'session',
      id: s.id,
      status: s.status,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      coach_label: s.coach_label || (s.coach_profile_id ? `Тренер #${s.coach_profile_id}` : 'Тренер'),
      coach_profile_id: s.coach_profile_id,
      topic: s.topic || 'Разбор матчей',
      review_given: Boolean(s.review_given),
    }));
    const fromReqs: RequestItem[] = reqs.map((r: any) => ({
      kind: 'request',
      id: r.id,
      status: r.status,
      desired_role: r.desired_role,
      focus_area: r.focus_area,
      coach_label: r.coach_label || (r.coach_profile_id ? `Тренер #${r.coach_profile_id}` : null) || (r.recommended_coaches?.length ? `${r.recommended_coaches.length} рекомендаций` : 'Подбор тренера'),
      coach_profile_id: r.coach_profile_id || r.recommended_coaches?.[0]?.coach_profile_id,
      created_at: r.created_at,
    }));
    return [...fromSessions, ...fromReqs].sort((a, b) => {
      const ta = a.kind === 'session' ? (a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0)
                                       : (a.created_at ? new Date(a.created_at).getTime() : 0);
      const tb = b.kind === 'session' ? (b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0)
                                       : (b.created_at ? new Date(b.created_at).getTime() : 0);
      return tb - ta;
    });
  }, [sessions, reqs]);

  const counts = useMemo(() => ({
    all:     items.length,
    active:  items.filter(isActive).length,
    pending: items.filter(isPending).length,
    done:    items.filter(isDone).length,
  }), [items]);

  const filteredItems = useMemo(() => {
    if (tab === 'all') return items;
    if (tab === 'active')  return items.filter(isActive);
    if (tab === 'pending') return items.filter(isPending);
    return items.filter(isDone);
  }, [items, tab]);

  /* Ближайшая сессия — PLANNED + future */
  const upcoming = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((s) => s.status === 'PLANNED' && s.scheduled_at && new Date(s.scheduled_at).getTime() > now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
  }, [sessions]);

  const cancelSession = async (id: number) => {
    if (!window.confirm('Отменить сессию? Действие необратимо через интерфейс — отмена идёт тренеру.')) return;
    try {
      await coreApi.patch(`/training-sessions/${id}`, { action: 'CANCEL' });
      setSessions((prev) => prev.map((s) => s.id === id ? { ...s, status: 'CANCELLED' } : s));
      setMsg('Сессия отменена.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось отменить сессию');
    }
  };

  const cancelRequest = async (id: number) => {
    if (!window.confirm('Отменить заявку?')) return;
    try {
      await coreApi.patch(`/matchmaking/requests/${id}`, { action: 'CANCEL' });
      setReqs((prev) => prev.map((r) => r.id === id ? { ...r, status: 'CANCELLED' } : r));
      setMsg('Заявка отменена.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось отменить заявку');
    }
  };

  const submitReview = async () => {
    if (!reviewFor) return;
    setReviewSaving(true);
    setMsg(null); setErr(null);
    try {
      await coreApi.post('/coach-reviews', {
        training_session_id: reviewFor.id,
        rating: reviewRating,
        comment: reviewComment || undefined,
      });
      setSessions((prev) => prev.map((s) => s.id === reviewFor.id ? { ...s, review_given: true } : s));
      setMsg('Спасибо за отзыв.');
      setReviewFor(null);
      setReviewComment('');
      setReviewRating(5);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось сохранить отзыв');
    } finally {
      setReviewSaving(false);
    }
  };

  /* Статистика месяца — простая (всего сессий + завершённых) */
  const monthStats = useMemo(() => {
    const now = new Date();
    const month0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const inMonth = (s: any) => s.scheduled_at && new Date(s.scheduled_at).getTime() >= month0;
    const completed = sessions.filter((s) => inMonth(s) && s.status === 'COMPLETED').length;
    const planned   = sessions.filter((s) => inMonth(s) && s.status === 'PLANNED').length;
    const total     = completed + planned;
    const wrCompleted = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, planned, total, wrCompleted };
  }, [sessions]);

  return (
    <div>
      {/* ============ Header ============ */}
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>Сессии и заявки</h1>
          <p>Управляйте своими сессиями и заявками на тренировки</p>
        </div>
        <div className="stats-header-filters">
          <Link to="/coaches" className="btn btn-outline btn-sm">Каталог тренеров</Link>
          <Link to="/coaches" className="btn btn-primary btn-sm">+ Новая заявка</Link>
        </div>
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 14 }}>{msg}</div>}
      {err && <div className="alert alert-error"   style={{ marginBottom: 14 }}>{err}</div>}

      {/* ============ Tabs ============ */}
      <div className="seg-control" style={{ marginBottom: 18 }}>
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`seg-control-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>· {counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="schedule-layout">
        {/* ============ Items list ============ */}
        <div className="card dash-card">
          {loading ? (
            <p className="text-muted text-center" style={{ padding: 30 }}>Загружаем…</p>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="Пока пусто"
              description="Выбери тренера и оставь заявку — сессии и заявки будут здесь."
              cta={<Link to="/coaches" className="btn btn-primary btn-sm">Найти тренера</Link>}
              compact
            />
          ) : (
            <div className="reqs-list">
              {filteredItems.map((it) => (
                <RequestRow
                  key={`${it.kind}-${it.id}`}
                  item={it}
                  onCancel={(item) => item.kind === 'session' ? cancelSession(item.id) : cancelRequest(item.id)}
                  onReview={(item) => {
                    if (item.kind === 'session') {
                      setReviewFor(item);
                      setReviewRating(5);
                      setReviewComment('');
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ============ Side panel ============ */}
        <aside className="schedule-side">
          {upcoming && (
            <div className="card dash-card">
              <div className="card-head">
                <div className="card-title"><IconCalendar size={16} /> Ближайшая сессия</div>
              </div>
              <div className="upcoming-session">
                <div className="upcoming-session-head">
                  <span className="coach-portrait coach-portrait--sm">
                    <span>{initials(upcoming.coach_label || 'Т')}</span>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="upcoming-session-title">{upcoming.coach_label || `Тренер #${upcoming.coach_profile_id}`}</div>
                    <div className="upcoming-session-meta">
                      {new Date(upcoming.scheduled_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{upcoming.duration_minutes || 60} мин
                    </div>
                  </div>
                </div>
                <Link to="/schedule" className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
                  Открыть в расписании
                </Link>
              </div>
            </div>
          )}

          <div className="card dash-card">
            <div className="card-head"><div className="card-title">Статистика месяца</div></div>
            <PlanRow label="Сессий запланировано" current={monthStats.planned}   target={Math.max(4, monthStats.total)} />
            <PlanRow label="Сессий завершено"     current={monthStats.completed} target={Math.max(4, monthStats.total)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>Завершённость</span>
              <span className="text-muted" style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>{monthStats.wrCompleted}%</span>
            </div>
          </div>
        </aside>
      </div>

      {/* ============ Review modal ============ */}
      {reviewFor && (
        <div className="modal-backdrop" onClick={() => !reviewSaving && setReviewFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Отзыв о сессии</h3>
              <button type="button" className="modal-close" onClick={() => !reviewSaving && setReviewFor(null)}>
                <IconClose size={16} />
              </button>
            </div>

            <div className="modal-coach-row">
              <span className="coach-portrait coach-portrait--sm"><span>{initials(reviewFor.coach_label)}</span></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="coach-name">{reviewFor.coach_label}</div>
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                  {reviewFor.scheduled_at && new Date(reviewFor.scheduled_at).toLocaleString('ru-RU')}
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 14 }}>
              <label>Оценка</label>
              <div className="review-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`review-star ${reviewRating >= n ? 'active' : ''}`}
                    onClick={() => setReviewRating(n)}
                    aria-label={`${n} звезды`}
                  >
                    <IconStar size={28} />
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Комментарий</label>
              <textarea
                className="form-input"
                rows={4}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Что зашло, что бы улучшить, что забрали с сессии…"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" disabled={reviewSaving} onClick={() => setReviewFor(null)}>Отмена</button>
              <button className="btn btn-primary btn-sm" disabled={reviewSaving} onClick={submitReview}>
                {reviewSaving ? 'Сохраняем…' : 'Оставить отзыв'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ Row ============ */
function RequestRow({
  item, onCancel, onReview,
}: {
  item: Item;
  onCancel: (item: Item) => void;
  onReview: (item: Item) => void;
}) {
  const isSession = item.kind === 'session';
  const status = isSession ? SESSION_STATUS[item.status] : REQUEST_STATUS[item.status];
  const statusLabel = status?.label || item.status;
  const statusTone = status?.tone || 'muted';

  const dateLabel = isSession
    ? (item.scheduled_at
        ? new Date(item.scheduled_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '—')
    : (item.created_at
        ? `создана ${new Date(item.created_at).toLocaleDateString('ru-RU')}`
        : '');

  const topic = isSession
    ? (item.topic || 'Разбор матчей')
    : (item.desired_role
        ? `Заявка на ${item.desired_role}`
        : 'Заявка на подбор');

  return (
    <div className="reqs-row">
      <span className="coach-portrait coach-portrait--sm">
        <span>{initials(item.coach_label)}</span>
      </span>

      <div className="reqs-row-main">
        <div className="reqs-row-coach">{item.coach_label}</div>
        <div className="reqs-row-topic">{topic}</div>
      </div>

      <div className="reqs-row-meta">
        <IconCalendar size={14} />
        <span>{dateLabel}</span>
        {isSession && item.duration_minutes && <span className="text-muted">· {item.duration_minutes} мин</span>}
      </div>

      <div className="reqs-row-status">
        <span className={`badge badge-${statusTone === 'cyan' ? 'accent' : statusTone === 'success' ? 'success' : statusTone === 'warning' ? 'warning' : statusTone === 'danger' ? 'danger' : 'muted'}`}>
          {statusLabel}
        </span>
      </div>

      <div className="reqs-row-actions">
        {isSession && item.status === 'PLANNED' && (
          <button className="btn btn-outline btn-sm" onClick={() => onCancel(item)}>Отменить</button>
        )}
        {isSession && item.status === 'COMPLETED' && !item.review_given && (
          <button className="btn btn-primary btn-sm" onClick={() => onReview(item)}>
            Отзыв <IconChevronRight size={12} />
          </button>
        )}
        {isSession && item.review_given && (
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>отзыв оставлен</span>
        )}
        {!isSession && ['NEW', 'MATCHING', 'WAITING_CONFIRMATION'].includes(item.status) && (
          <button className="btn btn-outline btn-sm" onClick={() => onCancel(item)}>Отменить</button>
        )}
      </div>
    </div>
  );
}

/* Plan row reused */
function PlanRow({ label, current, target }: { label: string; current: number; target: number }) {
  const pct = Math.min(100, Math.max(0, (current / Math.max(target, 1)) * 100));
  return (
    <div className="plan-row">
      <span className="plan-row-label">{label}</span>
      <div className="plan-row-bar"><span style={{ width: `${pct}%` }} /></div>
      <span className="plan-row-value">{current} / {target}</span>
    </div>
  );
}
