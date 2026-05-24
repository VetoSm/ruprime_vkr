import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { EmptyState } from '../../ui/Primitives';
import { IconChevronRight, IconStar, IconCalendar } from '../../ui/Icons';
import { IconCoinsOutline, IconListOutline, IconStarOutline } from '../../ui/StatIcons';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface Student {
  player_profile_id: number;
  core_user_id: number;
  actual_rank_tier?: string | null;
  sessions_total: number;
  sessions_completed: number;
  last_completed_at?: string | null;
  next_planned_at?: string | null;
  analysis_summary?: {
    estimated_mmr?: number;
    winrate?: number | null;
    kda_avg?: number;
    total_games?: number;
  } | null;
}

const CHART_STYLE = { background: '#0d1a35', border: '1px solid rgba(22, 233, 212, 0.20)', color: '#e8edf5', borderRadius: 8 };

function initials(s?: string): string {
  if (!s) return '?';
  const parts = s.replace(/[#_\-.]/g, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function timeAgo(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff/60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ч назад`;
  return `${Math.floor(diff/86400)} дн назад`;
}

export default function CoachDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pendingReqs, setPendingReqs] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    coreApi.get('/me/overview').then((r) => setOverview(r.data)).catch(() => {});
    coreApi.get('/training-sessions/my').then((r) => setSessions(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    coreApi.get('/matchmaking/requests/my').then((r) => {
      const items = Array.isArray(r.data) ? r.data : [];
      setPendingReqs(items.filter((i: any) => ['NEW', 'MATCHING', 'WAITING_CONFIRMATION'].includes(i.status)));
    }).catch(() => {});
    coreApi.get('/coach/students-overview').then((r) => setStudents(r.data?.students || [])).catch(() => {});
  }, []);

  // Reviews for the current coach — need coach_id
  useEffect(() => {
    const coachId = overview?.profile?.id;
    if (!coachId) return;
    coreApi.get(`/coach/${coachId}/reviews`).then((r) => setReviews(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [overview?.profile?.id]);

  /* ---- Computed ---- */
  const profile = overview?.profile || {};
  const stats = overview?.stats || {};
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6)  return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  })();

  const todaySessions = useMemo(() => {
    const today = new Date();
    return sessions
      .filter((s: any) => s.status === 'PLANNED' && s.scheduled_at && new Date(s.scheduled_at).toDateString() === today.toDateString())
      .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [sessions]);

  const plannedAll = sessions.filter((s: any) => s.status === 'PLANNED').length;
  const completedAll = sessions.filter((s: any) => s.status === 'COMPLETED').length;
  const completedMonth = useMemo(() => {
    const now = new Date();
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return sessions.filter((s: any) =>
      s.status === 'COMPLETED' && s.scheduled_at && new Date(s.scheduled_at).getTime() >= m0
    ).length;
  }, [sessions]);

  /* Доход — пока нет API. Псевдо-данные из counts × ставка профиля */
  const hourlyRate = profile.hourly_rate || 1500;
  const incomeMonth = completedMonth * hourlyRate;

  /* График — фейковая кривая дохода по дням месяца с прогрессивным накоплением.
     В реальном продукте подменим на `/coach/income/by-day`. */
  const incomeByDay = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let cumulative = 0;
    return Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      // Бьёмся в реальные completed sessions по дню — если есть, +rate, иначе случайный шум для визуала
      const monthDay = sessions.filter((s: any) =>
        s.status === 'COMPLETED' && s.scheduled_at &&
        new Date(s.scheduled_at).getDate() === day &&
        new Date(s.scheduled_at).getMonth() === now.getMonth()
      ).length;
      cumulative += monthDay * hourlyRate;
      return { day, value: cumulative };
    });
  }, [sessions, hourlyRate]);

  const activeStudents = students.filter((s) => (s.sessions_completed || 0) > 0 || s.next_planned_at).length;
  const avgRating = useMemo(() => {
    if (reviews.length === 0) return null;
    return reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length;
  }, [reviews]);

  const topStudents = useMemo(() => {
    return [...students]
      .map((s) => ({
        ...s,
        mmrDelta: (s.analysis_summary?.estimated_mmr || 0) - 4000, // proxy
      }))
      .sort((a, b) => (b.mmrDelta) - (a.mmrDelta))
      .slice(0, 3);
  }, [students]);

  const recentReviews = reviews.slice(0, 3);

  /* Цель месяца: 36 — placeholder */
  const monthGoal = 36;
  const monthProgress = Math.min(100, (completedMonth / monthGoal) * 100);

  return (
    <div>
      {/* ============ Greeting + month select + payout ============ */}
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>{greeting}, <strong>{profile.login || user?.login || 'тренер'}</strong></h1>
          <p>
            {todaySessions.length > 0
              ? <>Сегодня у тебя <strong>{todaySessions.length}</strong> {todaySessions.length === 1 ? 'сессия' : 'сессии'}{pendingReqs.length > 0 && <> и <strong>{pendingReqs.length}</strong> новых заявок</>}.</>
              : pendingReqs.length > 0
                ? <>На сегодня сессий нет. Новых заявок: <strong>{pendingReqs.length}</strong>.</>
                : 'Спокойный день — заявок и сессий нет.'}
          </p>
        </div>
        <div className="stats-header-filters">
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
            {new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </span>
          <Link to="/coach/profile" className="btn btn-outline btn-sm">Профиль тренера</Link>
        </div>
      </div>

      {/* ============ 4 stat tiles ============ */}
      <div className="grid-4 dash-quick-stats">
        <div className="stat-tile stat-tile--gold">
          <div className="stat-tile-icon"><IconCoinsOutline /></div>
          <div className="stat-tile-body">
            <div className="stat-tile-label">ДОХОД ЗА МЕСЯЦ</div>
            <div className="stat-tile-value-row">
              <span className="stat-tile-value">{incomeMonth.toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="stat-tile-delta-context">{completedMonth} сессий × {hourlyRate.toLocaleString('ru-RU')} ₽</div>
          </div>
        </div>
        <div className="stat-tile stat-tile--purple">
          <div className="stat-tile-icon"><IconListOutline /></div>
          <div className="stat-tile-body">
            <div className="stat-tile-label">СЕССИЙ ВСЕГО</div>
            <div className="stat-tile-value-row">
              <span className="stat-tile-value">{completedAll}</span>
            </div>
            <div className="stat-tile-delta-context">+{completedMonth} в этом месяце</div>
          </div>
        </div>
        <div className="stat-tile stat-tile--cyan">
          <div className="stat-tile-icon">
            <svg width="32" height="32" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <circle cx="24" cy="12" r="4" />
              <path d="M4 28c0-3.3 3.6-6 8-6s8 2.7 8 6" />
              <path d="M20 22c.7-.2 1.4-.3 2-.3 3.3 0 8 2 8 6.3" />
            </svg>
          </div>
          <div className="stat-tile-body">
            <div className="stat-tile-label">АКТИВНЫХ УЧЕНИКОВ</div>
            <div className="stat-tile-value-row">
              <span className="stat-tile-value">{activeStudents}</span>
            </div>
            <div className="stat-tile-delta-context">{students.length} всего в базе</div>
          </div>
        </div>
        <div className="stat-tile stat-tile--rose">
          <div className="stat-tile-icon"><IconStarOutline /></div>
          <div className="stat-tile-body">
            <div className="stat-tile-label">РЕЙТИНГ</div>
            <div className="stat-tile-value-row">
              <span className="stat-tile-value">
                {avgRating != null ? avgRating.toFixed(1) : '—'}
                {avgRating != null && <span style={{ color: '#f6c463', marginLeft: 6, fontSize: '1.1rem' }}><IconStar size={18} /></span>}
              </span>
            </div>
            <div className="stat-tile-delta-context">
              {reviews.length > 0 ? `${reviews.length} отзывов` : 'отзывов пока нет'}
            </div>
          </div>
        </div>
      </div>

      {/* ============ Income chart + Top students + Reviews + Goal ============ */}
      <div className="coach-dash-grid">
        {/* Income chart */}
        <div className="card dash-card coach-card-chart">
          <div className="card-head">
            <div className="card-title">Доход по дням</div>
            <span className="badge badge-purple">{incomeMonth.toLocaleString('ru-RU')} ₽</span>
          </div>
          {incomeByDay.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={incomeByDay}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#16e9d4" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#16e9d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22, 233, 212, 0.12)" />
                <XAxis dataKey="day" stroke="#7b8ba5" fontSize={11} />
                <YAxis stroke="#7b8ba5" fontSize={11} tickFormatter={(v) => `${v >= 1000 ? Math.round(v/1000) + 'K' : v} ₽`} />
                <Tooltip contentStyle={CHART_STYLE} formatter={(v: any) => [`${Number(v).toLocaleString('ru-RU')} ₽`, 'Доход']} />
                <Area type="monotone" dataKey="value" stroke="#16e9d4" strokeWidth={2.5} fill="url(#incomeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Дохода в этом месяце ещё нет" description="Когда подтвердишь первую сессию — график оживёт." compact />
          )}
        </div>

        {/* Лидеры месяца */}
        <div className="card dash-card coach-card-leaders">
          <div className="card-head">
            <div className="card-title">Лидер ученики этого месяца</div>
          </div>
          {topStudents.length > 0 ? (
            <div className="leaders-list">
              {topStudents.map((s, idx) => (
                <div key={s.player_profile_id} className="leader-row">
                  <span className="leader-rank">{idx + 1}</span>
                  <span className="coach-portrait coach-portrait--sm"><span>{initials(`Игрок ${s.player_profile_id}`)}</span></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="leader-name">Игрок #{s.player_profile_id}</div>
                    <div className="leader-rank-label">{s.actual_rank_tier || 'Без ранга'}</div>
                  </div>
                  <span className="leader-mmr">
                    {s.mmrDelta > 0 ? `+${Math.round(s.mmrDelta / 100) * 100} MMR` : '—'}
                  </span>
                </div>
              ))}
              <Link to="/coach/profile" className="ai-hint-cta">
                Показать всех <IconChevronRight size={12} />
              </Link>
            </div>
          ) : (
            <EmptyState title="Учеников пока нет" description="После первой подтверждённой сессии тут появятся ученики и их прогресс." compact />
          )}
        </div>

        {/* Предстоящие сессии сегодня */}
        <div className="card dash-card coach-card-today">
          <div className="card-head">
            <div className="card-title">Предстоящие сессии сегодня</div>
            <Link to="/coach/schedule" className="btn btn-outline btn-sm">
              К расписанию <IconChevronRight size={14} />
            </Link>
          </div>
          {todaySessions.length > 0 ? (
            <div className="today-sessions-list">
              {todaySessions.map((s: any) => (
                <div key={s.id} className="today-session-row">
                  <span className="coach-portrait coach-portrait--sm">
                    <span>{initials(`P${s.player_profile_id || '?'}`)}</span>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="leader-name">Игрок #{s.player_profile_id || '—'}</div>
                    <div className="leader-rank-label">{s.topic || 'Разбор матчей'}</div>
                  </div>
                  <span className="today-session-time">
                    <IconCalendar size={14} />
                    {new Date(s.scheduled_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    <span className="text-muted"> · {s.duration_minutes || 60} мин</span>
                  </span>
                  <span className="badge badge-success">Подтверждена</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="На сегодня сессий нет" description="Открой новые слоты в расписании, чтобы ученики смогли записаться." compact
              cta={<Link to="/coach/schedule" className="btn btn-primary btn-sm">+ Открыть слот</Link>} />
          )}
        </div>

        {/* Свежие отзывы */}
        <div className="card dash-card coach-card-reviews">
          <div className="card-head">
            <div className="card-title">Свежие отзывы</div>
            <Link to="/coach/reviews" className="ai-hint-cta">
              Все <IconChevronRight size={12} />
            </Link>
          </div>
          {recentReviews.length > 0 ? (
            <div className="reviews-list">
              {recentReviews.map((r: any) => (
                <div key={r.id} className="review-row">
                  <span className="coach-portrait coach-portrait--sm"><span>?</span></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="review-rating">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <IconStar key={i} size={12} color={i < (r.rating || 0) ? '#f6c463' : 'rgba(123, 139, 165, 0.30)'} />
                      ))}
                      <span className="text-muted" style={{ fontSize: '0.72rem', marginLeft: 4 }}>
                        {r.rating}/5 · {timeAgo(r.created_at)}
                      </span>
                    </div>
                    {r.comment && <div className="review-comment">{r.comment}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Отзывов пока нет" description="После завершённой сессии ученик сможет оставить оценку и комментарий." compact />
          )}
        </div>

        {/* Новые заявки */}
        <div className="card dash-card coach-card-pending">
          <div className="card-head">
            <div className="card-title">Новые заявки</div>
            {pendingReqs.length > 0 && <span className="badge badge-warning">{pendingReqs.length}</span>}
          </div>
          {pendingReqs.length > 0 ? (
            <div className="reviews-list">
              {pendingReqs.slice(0, 3).map((r: any) => (
                <div key={r.id} className="today-session-row">
                  <span className="coach-portrait coach-portrait--sm"><span>?</span></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="leader-name">Заявка #{r.id}</div>
                    <div className="leader-rank-label">
                      {r.desired_role || 'без позиции'}
                      {r.focus_area && ` · ${r.focus_area}`}
                    </div>
                  </div>
                  <Link to="/coach/schedule" className="btn btn-primary btn-sm">Принять</Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Очередь пуста" description="Все заявки обработаны." compact />
          )}
        </div>

        {/* Goal month */}
        <div className="card dash-card coach-card-goal">
          <div className="card-head">
            <div className="card-title">Цель месяца</div>
          </div>
          <div className="goal-month">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <defs>
                <linearGradient id="goalGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%"   stopColor="#16e9d4" />
                  <stop offset="100%" stopColor="#9b59ff" />
                </linearGradient>
              </defs>
              <circle cx="70" cy="70" r="58" stroke="rgba(22, 233, 212, 0.12)" strokeWidth="12" fill="none" />
              <circle cx="70" cy="70" r="58" stroke="url(#goalGrad)" strokeWidth="12" fill="none"
                strokeDasharray={2 * Math.PI * 58}
                strokeDashoffset={2 * Math.PI * 58 - (monthProgress / 100) * 2 * Math.PI * 58}
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
                style={{ filter: 'drop-shadow(0 0 8px rgba(22, 233, 212, 0.4))' }}
              />
              <text x="70" y="68" textAnchor="middle" fill="var(--accent-bright)" fontSize="32" fontWeight="800" fontFamily="var(--font-display)">
                {monthProgress.toFixed(0)}%
              </text>
              <text x="70" y="88" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-body)">
                выполнено
              </text>
            </svg>
            <div className="goal-month-meta">
              <div className="goal-month-num">{completedMonth} / {monthGoal} сессий</div>
              <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                Осталось {Math.max(0, monthGoal - completedMonth)} {monthGoal - completedMonth === 1 ? 'сессия' : 'сессий'} до цели
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
