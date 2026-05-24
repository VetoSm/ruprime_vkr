import { useMemo, useState } from 'react';

type SessionItem = {
  id: number;
  scheduled_at?: string | null;
  status?: string;
  player_label?: string;
  coach_label?: string;
};

type Props = {
  sessions: SessionItem[];
};

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function shiftMonth(d: Date, diff: number) {
  return new Date(d.getFullYear(), d.getMonth() + diff, 1);
}

export default function SessionsCalendar({ sessions }: Props) {
  const [monthCursor, setMonthCursor] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, SessionItem[]> = {};
    for (const s of sessions) {
      if (!s.scheduled_at) continue;
      const d = new Date(s.scheduled_at);
      if (Number.isNaN(d.getTime())) continue;
      const k = toDateKey(d);
      map[k] = map[k] || [];
      map[k].push(s);
    }
    return map;
  }, [sessions]);

  const monthStart = startOfMonth(monthCursor);
  const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();

  const cells: Array<{ key: string; day: number; count: number } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const k = toDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day));
    cells.push({ key: k, day, count: (grouped[k] || []).length });
  }

  const selectedItems = selectedDay ? (grouped[selectedDay] || []) : [];

  return (
    <div className="card mb-20">
      <div className="flex-between mb-10">
        <h3 style={{ margin: 0 }}>Календарь записей</h3>
        <div className="flex gap-10">
          <button className="btn btn-outline btn-sm" onClick={() => setMonthCursor(shiftMonth(monthCursor, -1))}>
            ←
          </button>
          <strong style={{ minWidth: 130, textAlign: 'center', alignSelf: 'center' }}>
            {monthCursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </strong>
          <button className="btn btn-outline btn-sm" onClick={() => setMonthCursor(shiftMonth(monthCursor, 1))}>
            →
          </button>
        </div>
      </div>

      <div className="calendar-grid calendar-grid--head">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <div key={d} className="calendar-head-cell">{d}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`empty-${idx}`} className="calendar-cell calendar-cell--empty" />;
          const active = selectedDay === cell.key;
          return (
            <button
              key={cell.key}
              className={`calendar-cell ${active ? 'calendar-cell--active' : ''}`}
              onClick={() => setSelectedDay(cell.key)}
            >
              <span>{cell.day}</span>
              {cell.count > 0 && <span className="badge badge-accent">{cell.count}</span>}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px' }}>
            Записи на {new Date(selectedDay).toLocaleDateString('ru-RU')}
          </h4>
          {selectedItems.length === 0 ? (
            <p className="text-muted">На эту дату записей нет.</p>
          ) : (
            <div className="grid-2">
              {selectedItems.map((s) => (
                <div key={s.id} className="stat-card">
                  <div className="stat-card-label">Сессия #{s.id}</div>
                  <div style={{ fontWeight: 700 }}>{s.player_label || 'Игрок'} → {s.coach_label || 'Тренер'}</div>
                  <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                    {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('ru-RU') : 'Без даты'}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span className={`badge ${s.status === 'COMPLETED' ? 'badge-accent' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}`}>
                      {s.status || 'PLANNED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
