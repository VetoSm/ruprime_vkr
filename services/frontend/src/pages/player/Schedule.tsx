import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { EmptyState } from '../../ui/Primitives';
import { IconChevronLeft, IconChevronRight, IconCalendar, IconClose, IconTarget } from '../../ui/Icons';

const ORACLE_AVATAR = '/decor/oracle-avatar.png';

// Event taxonomy was previously {session, training, tournament, rest},
// but "tournament" and "rest" weren't tied to any feature — no API
// surface, no real workflow — and they cluttered the legend / add-event
// modal. Trimmed to the two we actually drive from data: coach sessions
// (server) and self-training (localStorage).
type EventType = 'session' | 'training';

interface ScheduleEvent {
  id: string;
  type: EventType;
  title: string;
  subtitle?: string;
  start: Date;
  end: Date;
  sourceId?: number;     // session id from API
  coachLabel?: string;
}

const TYPE_LABEL: Record<EventType, string> = {
  session:    'Сессия',
  training:   'Тренировка',
};

const TYPE_TONE: Record<EventType, 'cyan' | 'purple'> = {
  session:    'cyan',
  training:   'purple',
};

const SELF_TRAINING_KEY = 'self_training_events_v1';

const ORACLE_TIPS = [
  'Баланс — путь к победе. Не забывай про отдых и анализ своих игр. Маленькие улучшения каждый день ведут к великим победам.',
  'Лучше 3 разобранные игры, чем 10 безмолвно сыгранных. Качество > количество.',
  'Перед сложной катой — короткая разминка и повтор слабого таймпоинта прошлого матча.',
  'Сделай день полного отдыха в неделю — мозг закрепляет навыки в паузах, а не в перегрузе.',
];

const DAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7;     // понедельник = 0
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfMonth(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), 1);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function loadSelfEvents(): ScheduleEvent[] {
  try {
    const raw = localStorage.getItem(SELF_TRAINING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e: any) => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end),
    }));
  } catch { return []; }
}
function saveSelfEvents(events: ScheduleEvent[]) {
  try {
    localStorage.setItem(SELF_TRAINING_KEY, JSON.stringify(events));
  } catch {}
}

export default function PlayerSchedule() {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());

  // Сессии с бэка
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Самостоятельные тренировки — пока localStorage
  const [selfEvents, setSelfEvents] = useState<ScheduleEvent[]>([]);

  // Modal "Добавить тренировку"
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<EventType>('training');
  const [addTitle, setAddTitle] = useState('');
  const [addDate, setAddDate] = useState(() => {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [addDuration, setAddDuration] = useState('60');

  useEffect(() => {
    coreApi.get('/training-sessions/my')
      .then((r) => setSessions(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
    setSelfEvents(loadSelfEvents());
  }, []);

  // Преобразуем сессии и self-events в единый список
  const events: ScheduleEvent[] = useMemo(() => {
    const fromSessions: ScheduleEvent[] = sessions
      .filter((s) => s.scheduled_at && s.status !== 'CANCELLED')
      .map((s) => {
        const start = new Date(s.scheduled_at);
        const end = new Date(start.getTime() + (s.duration_minutes || 60) * 60 * 1000);
        return {
          id: `session-${s.id}`,
          type: 'session' as const,
          title: `Сессия с ${s.coach_label || `тренером #${s.coach_profile_id}`}`,
          subtitle: 'Онлайн-сессия',
          start,
          end,
          sourceId: s.id,
          coachLabel: s.coach_label,
        };
      });
    return [...fromSessions, ...selfEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [sessions, selfEvents]);

  // Текущая неделя
  const weekStart = useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Текущий месяц — для grid 6 недель
  const monthStart = useMemo(() => startOfMonth(anchorDate), [anchorDate]);
  const monthGridStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i)), [monthGridStart]);

  // События сегодняшнего дня
  const today = new Date();
  const todayEvents = useMemo(() => events.filter((e) => sameDay(e.start, today)), [events]);

  // План на неделю — счётчики
  const weekPlan = useMemo(() => {
    const weekEvents = events.filter((e) => e.start >= weekStart && e.start < addDays(weekStart, 7));
    const sessionsCount = weekEvents.filter((e) => e.type === 'session').length;
    const trainingHours = weekEvents
      .filter((e) => e.type === 'training' || e.type === 'session')
      .reduce((sum, e) => sum + Math.max(0, (e.end.getTime() - e.start.getTime()) / 3600000), 0);
    const reviewsCount = weekEvents.filter((e) => /разбор|review|анализ/i.test(e.title)).length;
    return { sessionsCount, trainingHours, reviewsCount };
  }, [events, weekStart]);

  // Случайный совет Оракула (стабильный по дню)
  const oracleTip = ORACLE_TIPS[today.getDate() % ORACLE_TIPS.length];

  const headerLabel = viewMode === 'week'
    ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${MONTH_NAMES[monthStart.getMonth()]} ${monthStart.getFullYear()}`;

  const moveAnchor = (dir: -1 | 1) => {
    setAnchorDate((d) => {
      const r = new Date(d);
      if (viewMode === 'week') r.setDate(r.getDate() + dir * 7);
      else r.setMonth(r.getMonth() + dir);
      return r;
    });
  };
  const jumpToday = () => setAnchorDate(new Date());

  // Только в текущей неделе/месяце? Тогда кнопка «Сегодня» — без подсветки.
  const isOnTodaysWindow = useMemo(() => {
    const now = new Date();
    if (viewMode === 'week') return sameDay(startOfWeek(anchorDate), startOfWeek(now));
    return anchorDate.getFullYear() === now.getFullYear()
      && anchorDate.getMonth() === now.getMonth();
  }, [anchorDate, viewMode]);

  /* Сохранить новое самостоятельное событие */
  const submitAddEvent = () => {
    const start = new Date(addDate);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + Number(addDuration || 60) * 60 * 1000);
    const ev: ScheduleEvent = {
      id: `self-${Date.now()}`,
      type: addType,
      title: addTitle || TYPE_LABEL[addType],
      subtitle: addType === 'training' ? 'Самостоятельная практика' : undefined,
      start, end,
    };
    const next = [...selfEvents, ev];
    setSelfEvents(next);
    saveSelfEvents(next);
    setAddOpen(false);
    setAddTitle('');
  };

  const removeSelfEvent = (id: string) => {
    const next = selfEvents.filter((e) => e.id !== id);
    setSelfEvents(next);
    saveSelfEvents(next);
  };

  return (
    <div>
      {/* ============ Header ============ */}
      <div className="schedule-header">
        <div className="stats-header-title">
          <h1>Моё расписание</h1>
          <p>Сессии с тренерами и план тренировок</p>
        </div>
        <div className="schedule-header-controls">
          <div className="seg-control">
            <button type="button" className={`seg-control-btn ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>Неделя</button>
            <button type="button" className={`seg-control-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>Месяц</button>
          </div>
          <div className="schedule-monthnav">
            <button type="button" className="coaches-pagi-btn" onClick={() => moveAnchor(-1)} aria-label={viewMode === 'week' ? 'Предыдущая неделя' : 'Предыдущий месяц'}><IconChevronLeft size={14} /></button>
            <span className="schedule-monthnav-label">{headerLabel}</span>
            <button type="button" className="coaches-pagi-btn" onClick={() => moveAnchor(1)} aria-label={viewMode === 'week' ? 'Следующая неделя' : 'Следующий месяц'}><IconChevronRight size={14} /></button>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={jumpToday}
            disabled={isOnTodaysWindow}
            title="Вернуться к текущей неделе"
          >
            Сегодня
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            + Добавить тренировку
          </button>
        </div>
      </div>

      {/* ============ Two-col: Calendar | Side panel ============ */}
      <div className="schedule-layout">
        {/* Calendar */}
        <div className="card dash-card">
          {loading ? (
            <p className="text-muted text-center" style={{ padding: 40 }}>Загружаем календарь…</p>
          ) : viewMode === 'week' ? (
            <WeekView days={weekDays} events={events} onRemoveSelf={removeSelfEvent} />
          ) : (
            <MonthView days={monthDays} monthStart={monthStart} events={events} />
          )}

          {/* Bottom legend — только два типа реальных событий */}
          <div className="schedule-legend">
            {(['session', 'training'] as EventType[]).map((t) => (
              <div key={t} className="schedule-legend-item">
                <span className={`schedule-legend-dot schedule-legend-dot--${TYPE_TONE[t]}`} />
                <span className="schedule-legend-label">{TYPE_LABEL[t]}</span>
                <span className="schedule-legend-desc">
                  {t === 'session'  && 'Сессии с тренером'}
                  {t === 'training' && 'Самостоятельная практика'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <aside className="schedule-side">
          {/* Сегодня */}
          <div className="card dash-card">
            <div className="card-head">
              <div className="card-title">
                <IconCalendar size={16} /> Сегодня
              </div>
            </div>
            {todayEvents.length > 0 ? (
              <div className="schedule-today-list">
                {todayEvents.map((e) => (
                  <div key={e.id} className="schedule-today-row">
                    <span className="schedule-today-time">{fmtTime(e.start)}–{fmtTime(e.end)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={`schedule-today-title schedule-today-title--${TYPE_TONE[e.type]}`}>{e.title}</div>
                      {e.subtitle && <div className="schedule-today-sub">{e.subtitle}</div>}
                    </div>
                  </div>
                ))}
                <Link to="/requests" className="schedule-today-cta">
                  Все события сегодня <IconChevronRight size={12} />
                </Link>
              </div>
            ) : (
              <EmptyState compact title="План на сегодня пуст" description="Добавь сессию или тренировку — она появится здесь." cta={
                <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>+ Добавить</button>
              } />
            )}
          </div>

          {/* Рекомендация Оракула */}
          <div className="card dash-card">
            <div className="card-head">
              <div className="card-title">Рекомендация Оракула</div>
            </div>
            <div className="oracle-rec-row">
              <img src={ORACLE_AVATAR} alt="" className="oracle-rec-avatar" />
              <p className="oracle-rec-text">{oracleTip}</p>
            </div>
            <Link to="/ai-chat" className="ai-hint-cta">
              Другие советы <IconChevronRight size={12} />
            </Link>
          </div>

          {/* План на неделю */}
          <div className="card dash-card">
            <div className="card-head">
              <div className="card-title">
                <IconTarget size={16} /> План на неделю
              </div>
            </div>
            <PlanRow label="Сессий с тренером"
              current={weekPlan.sessionsCount} target={3} />
            <PlanRow label="Часов практики"
              current={Number(weekPlan.trainingHours.toFixed(1))} target={15} />
            <PlanRow label="Разборов матчей"
              current={weekPlan.reviewsCount} target={5} />
          </div>
        </aside>
      </div>

      {/* ============ Add event modal ============ */}
      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Добавить тренировку</h3>
              <button type="button" className="modal-close" onClick={() => setAddOpen(false)} aria-label="Закрыть">
                <IconClose size={16} />
              </button>
            </div>

            {/* Тип события — только «Тренировка» и «Сессия» */}
            <div className="form-group">
              <label>Тип</label>
              <div className="seg-control" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {(['training', 'session'] as EventType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`seg-control-btn ${addType === t ? 'active' : ''}`}
                    onClick={() => setAddType(t)}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                {addType === 'session' && (
                  <>
                    Тренеры со своими слотами — на странице{' '}
                    <Link to="/coaches">«Тренеры»</Link>. Здесь — заметка о сессии в плане.
                  </>
                )}
                {addType === 'training' && 'Самостоятельная практика — соло-лобби, повторы, разбор реплеев.'}
              </div>
            </div>

            <div className="form-group">
              <label>Название</label>
              <input
                type="text"
                className="form-input"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder={`Например: ${addType === 'training' ? 'Last-hit drill 30 мин' : 'Разбор с Eclipse'}`}
              />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Начало</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Длительность, мин</label>
                <input
                  type="number"
                  className="form-input"
                  value={addDuration}
                  onChange={(e) => setAddDuration(e.target.value)}
                  min={15}
                  step={15}
                />
              </div>
            </div>

            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
              Записи без тренера хранятся локально (в браузере), пока нет общего планировщика.
              Сессии с тренером — на их странице расписания.
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setAddOpen(false)}>Отмена</button>
              <button className="btn btn-primary btn-sm" onClick={submitAddEvent}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
 * Week view
 * =======================================================*/
function WeekView({
  days, events, onRemoveSelf,
}: { days: Date[]; events: ScheduleEvent[]; onRemoveSelf: (id: string) => void }) {
  const hourStart = 8;
  const hourEnd = 23;
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  const slotHeight = 38; // px per hour
  const now = new Date();

  const positionEvent = (e: ScheduleEvent) => {
    const startHour = e.start.getHours() + e.start.getMinutes() / 60;
    const endHour = e.end.getHours() + e.end.getMinutes() / 60;
    const clampedStart = Math.max(hourStart, startHour);
    const clampedEnd = Math.min(hourEnd, endHour);
    const top = (clampedStart - hourStart) * slotHeight;
    const height = Math.max(28, (clampedEnd - clampedStart) * slotHeight);
    return { top, height };
  };

  const todayIdx = days.findIndex((d) => sameDay(d, now));

  return (
    <div className="week-grid-wrap">
      <div className="week-grid">
        {/* Header row — дни недели */}
        <div className="week-grid-corner" />
        {days.map((d, i) => (
          <div key={d.toISOString()} className={`week-grid-dayhead ${todayIdx === i ? 'today' : ''}`}>
            <div className="week-grid-dayname">{DAY_NAMES_SHORT[i]}</div>
            <div className="week-grid-daynum">{d.getDate()} {MONTH_NAMES[d.getMonth()].slice(0, 3).toLowerCase()}</div>
          </div>
        ))}

        {/* Hour column + day cells */}
        <div className="week-grid-hours" style={{ height: hours.length * slotHeight }}>
          {hours.map((h) => (
            <div key={h} className="week-grid-hour-label" style={{ height: slotHeight }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, i) => {
          const dayEvents = events.filter((e) => sameDay(e.start, d));
          const isToday = todayIdx === i;
          const nowOffset = isToday
            ? ((now.getHours() + now.getMinutes() / 60) - hourStart) * slotHeight
            : null;
          return (
            <div key={d.toISOString()} className="week-grid-daycol" style={{ height: hours.length * slotHeight }}>
              {hours.map((h) => (
                <div key={h} className="week-grid-cell" style={{ height: slotHeight }} />
              ))}
              {nowOffset !== null && nowOffset >= 0 && nowOffset <= hours.length * slotHeight && (
                <>
                  <div className="week-grid-now-line" style={{ top: nowOffset }} />
                  <div className="week-grid-now-label" style={{ top: nowOffset - 9 }}>Сейчас</div>
                </>
              )}
              {dayEvents.map((e) => {
                const { top, height } = positionEvent(e);
                const isSelf = e.id.startsWith('self-');
                return (
                  <div
                    key={e.id}
                    className={`week-event week-event--${TYPE_TONE[e.type]}`}
                    style={{ top, height }}
                    title={`${e.title} · ${fmtTime(e.start)}–${fmtTime(e.end)}`}
                  >
                    <div className="week-event-time">{fmtTime(e.start)} — {fmtTime(e.end)}</div>
                    <div className="week-event-title">{e.title}</div>
                    {isSelf && (
                      <button type="button" className="week-event-close" onClick={() => onRemoveSelf(e.id)} aria-label="Удалить">×</button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
 * Month view
 * =======================================================*/
function MonthView({ days, monthStart, events }: { days: Date[]; monthStart: Date; events: ScheduleEvent[] }) {
  const monthIdx = monthStart.getMonth();
  const now = new Date();
  return (
    <div className="month-grid">
      {DAY_NAMES_SHORT.map((d) => (
        <div key={d} className="month-grid-dayhead">{d}</div>
      ))}
      {days.map((d) => {
        const inMonth = d.getMonth() === monthIdx;
        const isToday = sameDay(d, now);
        const dayEvents = events.filter((e) => sameDay(e.start, d));
        return (
          <div key={d.toISOString()} className={`month-grid-cell ${inMonth ? '' : 'oom'} ${isToday ? 'today' : ''}`}>
            <span className="month-grid-day">{d.getDate()}</span>
            <div className="month-grid-events">
              {dayEvents.slice(0, 3).map((e) => (
                <div key={e.id} className={`month-grid-event month-grid-event--${TYPE_TONE[e.type]}`} title={e.title}>
                  {fmtTime(e.start)} · {e.title}
                </div>
              ))}
              {dayEvents.length > 3 && <div className="month-grid-more">+{dayEvents.length - 3} ещё</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
 * Plan row
 * =======================================================*/
function PlanRow({ label, current, target }: { label: string; current: number; target: number }) {
  const pct = Math.min(100, Math.max(0, (current / Math.max(target, 1)) * 100));
  return (
    <div className="plan-row">
      <span className="plan-row-label">{label}</span>
      <div className="plan-row-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="plan-row-value">{current} / {target}</span>
    </div>
  );
}
