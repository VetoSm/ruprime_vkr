import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { EmptyState } from '../../ui/Primitives';
import { IconChevronLeft, IconChevronRight, IconCalendar, IconClose } from '../../ui/Icons';

const COACH_SLOTS_KEY = 'coach_open_slots_v1';

type SlotState = 'open' | 'pending' | 'booked' | 'unavailable';

interface SlotCell {
  date: Date;
  hour: number;
  state: SlotState;
  sessionId?: number;
  studentLabel?: string;
  requestId?: number;
}

const DAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function loadOpenSlots(): { dateIso: string; hour: number }[] {
  try { const raw = localStorage.getItem(COACH_SLOTS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveOpenSlots(slots: { dateIso: string; hour: number }[]) {
  try { localStorage.setItem(COACH_SLOTS_KEY, JSON.stringify(slots)); } catch {}
}

export default function CoachSchedule() {
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [sessions, setSessions] = useState<any[]>([]);
  const [pendingReqs, setPendingReqs] = useState<any[]>([]);
  const [openSlots, setOpenSlots] = useState<{ dateIso: string; hour: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Slot dialog
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slotHour, setSlotHour] = useState('19');
  const [slotsLimit, setSlotsLimit] = useState(4);
  const [autoAccept, setAutoAccept] = useState(true);

  useEffect(() => {
    Promise.all([
      coreApi.get('/training-sessions/my').then((r) => setSessions(Array.isArray(r.data) ? r.data : [])).catch(() => {}),
      coreApi.get('/matchmaking/requests/my').then((r) => setPendingReqs((Array.isArray(r.data) ? r.data : []).filter((i: any) => ['NEW', 'MATCHING', 'WAITING_CONFIRMATION'].includes(i.status)))).catch(() => {}),
    ]).finally(() => setLoading(false));
    setOpenSlots(loadOpenSlots());
  }, []);

  const weekStart = useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const headerLabel = `${weekStart.getDate()}–${addDays(weekStart, 6).getDate()} ${MONTH_NAMES[weekStart.getMonth()].slice(0, 3)} ${weekStart.getFullYear()}`;

  /* Слоты для конкретного дня и часа */
  const slotAt = (date: Date, hour: number): SlotCell => {
    // Booked — есть session
    const booked = sessions.find((s: any) => {
      if (s.status !== 'PLANNED') return false;
      if (!s.scheduled_at) return false;
      const sd = new Date(s.scheduled_at);
      return sameDay(sd, date) && sd.getHours() === hour;
    });
    if (booked) {
      return { date, hour, state: 'booked', sessionId: booked.id, studentLabel: `Игрок #${booked.player_profile_id || '?'}` };
    }
    // Open
    const isoDay = date.toISOString().slice(0, 10);
    const isOpen = openSlots.some((s) => s.dateIso === isoDay && s.hour === hour);
    if (isOpen) return { date, hour, state: 'open' };

    return { date, hour, state: 'unavailable' };
  };

  /* Открыть слот (одиночный клик по unavailable-ячейке) */
  const toggleSlot = (date: Date, hour: number) => {
    const cell = slotAt(date, hour);
    if (cell.state === 'booked') return;
    const isoDay = date.toISOString().slice(0, 10);
    const exists = openSlots.find((s) => s.dateIso === isoDay && s.hour === hour);
    let next: typeof openSlots;
    if (exists) next = openSlots.filter((s) => !(s.dateIso === isoDay && s.hour === hour));
    else        next = [...openSlots, { dateIso: isoDay, hour }];
    setOpenSlots(next);
    saveOpenSlots(next);
  };

  const openSlotBulk = () => {
    const d = new Date(slotDate);
    const h = Number(slotHour);
    if (!Number.isFinite(h)) return;
    const isoDay = d.toISOString().slice(0, 10);
    const exists = openSlots.some((s) => s.dateIso === isoDay && s.hour === h);
    if (!exists) {
      const next = [...openSlots, { dateIso: isoDay, hour: h }];
      setOpenSlots(next);
      saveOpenSlots(next);
    }
    setSlotPickerOpen(false);
  };

  const copyLastWeek = () => {
    const next = [...openSlots];
    openSlots.forEach((s) => {
      const d = new Date(s.dateIso);
      d.setDate(d.getDate() + 7);
      const newIso = d.toISOString().slice(0, 10);
      if (!next.some((x) => x.dateIso === newIso && x.hour === s.hour)) {
        next.push({ dateIso: newIso, hour: s.hour });
      }
    });
    setOpenSlots(next);
    saveOpenSlots(next);
  };

  /* Месячная статистика */
  const monthStats = useMemo(() => {
    const now = new Date();
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const planned = sessions.filter((s) => s.scheduled_at && s.status === 'PLANNED' && new Date(s.scheduled_at).getTime() >= m0).length;
    const completed = sessions.filter((s) => s.scheduled_at && s.status === 'COMPLETED' && new Date(s.scheduled_at).getTime() >= m0).length;
    const blocked = openSlots.filter((s) => new Date(s.dateIso).getTime() >= m0).length;
    const total = planned + completed + blocked || 1;
    return { planned, completed, blocked, total, fillPct: Math.round(((planned + completed) / total) * 100) };
  }, [sessions, openSlots]);

  return (
    <div>
      {/* Header */}
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>Расписание</h1>
          <p>Управляй доступными слотами и сессиями</p>
        </div>
        <div className="stats-header-filters">
          <div className="seg-control">
            <button type="button" className={`seg-control-btn ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>Неделя</button>
            <button type="button" className={`seg-control-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>Месяц</button>
          </div>
          <div className="schedule-monthnav">
            <button type="button" className="coaches-pagi-btn" onClick={() => setAnchorDate((d) => { const r = new Date(d); r.setDate(r.getDate() - 7); return r; })}><IconChevronLeft size={14} /></button>
            <span className="schedule-monthnav-label">{headerLabel}</span>
            <button type="button" className="coaches-pagi-btn" onClick={() => setAnchorDate((d) => { const r = new Date(d); r.setDate(r.getDate() + 7); return r; })}><IconChevronRight size={14} /></button>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={copyLastWeek}>Скопировать прошлую неделю</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setSlotPickerOpen(true)}>+ Открыть слот</button>
        </div>
      </div>

      <div className="schedule-layout">
        {/* === Slot grid === */}
        <div className="card dash-card">
          {loading ? (
            <p className="text-muted text-center" style={{ padding: 40 }}>Загружаем расписание…</p>
          ) : (
            <CoachWeekGrid days={weekDays} slotAt={slotAt} onToggle={toggleSlot} />
          )}

          {/* Legend */}
          <div className="schedule-legend">
            <div className="schedule-legend-item">
              <span className="coach-slot-legend-box coach-slot-legend-box--open" />
              <span className="schedule-legend-label">Свободно</span>
              <span className="schedule-legend-desc">Доступно</span>
            </div>
            <div className="schedule-legend-item">
              <span className="coach-slot-legend-box coach-slot-legend-box--booked" />
              <span className="schedule-legend-label">Забронировано</span>
              <span className="schedule-legend-desc">Подтверждено</span>
            </div>
            <div className="schedule-legend-item">
              <span className="coach-slot-legend-box coach-slot-legend-box--pending" />
              <span className="schedule-legend-label">Ожидает подтверждения</span>
              <span className="schedule-legend-desc">Запрос на слот</span>
            </div>
            <div className="schedule-legend-item">
              <span className="coach-slot-legend-box coach-slot-legend-box--unavail" />
              <span className="schedule-legend-label">Недоступно</span>
              <span className="schedule-legend-desc">Заблокировано</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <aside className="schedule-side">
          <div className="card dash-card">
            <div className="card-head"><div className="card-title">Параметры доступности</div></div>
            <div className="profile-side-list">
              <button type="button" className="profile-side-row profile-side-row--toggle" onClick={() => setAutoAccept((v) => !v)}>
                <div>
                  <div className="profile-side-row-title">Принимать заявки автоматически</div>
                  <div className="profile-side-row-desc">Игроки без подтверждения сразу бронируют</div>
                </div>
                <span className={`toggle-mini ${autoAccept ? 'on' : 'off'}`} />
              </button>
              <div className="coach-limit-row">
                <span className="coach-limit-label">Лимит сессий в день</span>
                <div className="coach-limit-control">
                  <button type="button" onClick={() => setSlotsLimit((v) => Math.max(1, v - 1))}>−</button>
                  <span>{slotsLimit}</span>
                  <button type="button" onClick={() => setSlotsLimit((v) => Math.min(12, v + 1))}>+</button>
                </div>
              </div>
              <div className="coach-limit-row">
                <span className="coach-limit-label">Минимальный интервал</span>
                <span className="badge badge-muted">30 мин</span>
              </div>
            </div>
          </div>

          <div className="card dash-card">
            <div className="card-head"><div className="card-title">Статистика месяца</div></div>
            <div className="coach-month-stats">
              <svg width="100" height="100" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="monthGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%"   stopColor="#16e9d4" />
                    <stop offset="100%" stopColor="#9b59ff" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="42" stroke="rgba(22, 233, 212, 0.10)" strokeWidth="10" fill="none" />
                <circle cx="50" cy="50" r="42" stroke="url(#monthGrad)" strokeWidth="10" fill="none"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 - (monthStats.fillPct / 100) * 2 * Math.PI * 42}
                  strokeLinecap="round" transform="rotate(-90 50 50)" />
                <text x="50" y="55" textAnchor="middle" fill="var(--accent-bright)" fontSize="22" fontWeight="800" fontFamily="var(--font-display)">
                  {monthStats.fillPct}%
                </text>
              </svg>
              <div className="coach-month-stats-list">
                <div><span className="coach-mon-dot coach-mon-dot--cyan" /> Забронировано <strong>{monthStats.planned + monthStats.completed}</strong></div>
                <div><span className="coach-mon-dot coach-mon-dot--purple" /> Свободно <strong>{monthStats.blocked}</strong></div>
                <div><span className="coach-mon-dot coach-mon-dot--muted" /> Всего <strong>{monthStats.total}</strong></div>
              </div>
            </div>
          </div>

          <div className="card dash-card">
            <div className="card-head">
              <div className="card-title">Заявки в очереди</div>
              {pendingReqs.length > 0 && <span className="badge badge-warning">{pendingReqs.length}</span>}
            </div>
            {pendingReqs.length > 0 ? (
              <div className="reviews-list">
                {pendingReqs.slice(0, 4).map((r: any) => (
                  <div key={r.id} className="today-session-row">
                    <span className="coach-portrait coach-portrait--sm"><span>?</span></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="leader-name">Заявка #{r.id}</div>
                      <div className="leader-rank-label">{r.desired_role || 'без роли'}{r.focus_area && ` · ${r.focus_area}`}</div>
                    </div>
                  </div>
                ))}
                <Link to="/coach/dashboard" className="ai-hint-cta">
                  Все заявки <IconChevronRight size={12} />
                </Link>
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Очередь пуста.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Add slot modal */}
      {slotPickerOpen && (
        <div className="modal-backdrop" onClick={() => setSlotPickerOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Открыть слот</h3>
              <button type="button" className="modal-close" onClick={() => setSlotPickerOpen(false)}>
                <IconClose size={16} />
              </button>
            </div>
            <div className="grid-2 form-grid">
              <div className="form-group">
                <label>Дата</label>
                <input type="date" className="form-input" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Час</label>
                <input type="number" className="form-input" value={slotHour} min={0} max={23} onChange={(e) => setSlotHour(e.target.value)} />
              </div>
            </div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
              Слот добавится как "Свободно 19:00". Можно также кликать прямо по клеткам в сетке.
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setSlotPickerOpen(false)}>Отмена</button>
              <button className="btn btn-primary btn-sm" onClick={openSlotBulk}>Открыть слот</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ Slot grid ============ */
function CoachWeekGrid({
  days, slotAt, onToggle,
}: {
  days: Date[];
  slotAt: (date: Date, hour: number) => SlotCell;
  onToggle: (date: Date, hour: number) => void;
}) {
  const hours = Array.from({ length: 16 }, (_, i) => 8 + i); // 08:00 — 23:00
  const now = new Date();
  return (
    <div className="week-grid-wrap">
      <div className="coach-slot-grid">
        <div className="week-grid-corner" />
        {days.map((d) => (
          <div key={d.toISOString()} className={`week-grid-dayhead ${sameDay(d, now) ? 'today' : ''}`}>
            <div className="week-grid-dayname">{DAY_NAMES_SHORT[(d.getDay() + 6) % 7]}</div>
            <div className="week-grid-daynum">{d.getDate()} {MONTH_NAMES[d.getMonth()].slice(0, 3).toLowerCase()}</div>
          </div>
        ))}

        {hours.map((h) => (
          <Row key={h} hour={h} days={days} slotAt={slotAt} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

function Row({ hour, days, slotAt, onToggle }: { hour: number; days: Date[]; slotAt: (date: Date, hour: number) => SlotCell; onToggle: (date: Date, hour: number) => void }) {
  return (
    <>
      <div className="coach-slot-hour">{String(hour).padStart(2, '0')}:00</div>
      {days.map((d) => {
        const cell = slotAt(d, hour);
        return (
          <button
            key={`${d.toISOString()}-${hour}`}
            type="button"
            className={`coach-slot-cell coach-slot-cell--${cell.state}`}
            onClick={() => onToggle(d, hour)}
          >
            {cell.state === 'open' && (
              <>
                <span className="coach-slot-cell-status">Свободно</span>
                <span className="coach-slot-cell-time">{String(hour).padStart(2, '0')}:00</span>
              </>
            )}
            {cell.state === 'booked' && (
              <>
                <span className="coach-slot-cell-status">{cell.studentLabel}</span>
                <span className="coach-slot-cell-badge">Подтверждена</span>
              </>
            )}
            {cell.state === 'pending' && (
              <>
                <span className="coach-slot-cell-status">Ожидает</span>
              </>
            )}
            {cell.state === 'unavailable' && <span className="coach-slot-cell-time" style={{ opacity: 0.3 }}>—</span>}
          </button>
        );
      })}
    </>
  );
}
