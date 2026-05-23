# Player Schedule (Расписание)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_player_schedule.png` |
| **Код** | `services/frontend/src/pages/player/Schedule.tsx` |
| **Layout** | `<AppLayout sidebar="player">` |
| **Route** | `/schedule` |
| **Доступ** | PLAYER |

## Sidebar

Канонический PLAYER, active = `Расписание`.

## Композиция

```
<AppLayout>
  <header className="page-header flex-between">
    <div>
      <h1>Моё расписание</h1>
      <p className="text-muted">Сессии с тренерами на неделю</p>
    </div>
    <div className="filter-bar">
      <SegmentedToggle value={view} options={['week','month']}>...</SegmentedToggle>
      <DateNav value={weekStart} onChange={setWeekStart} format="MMM yyyy" />
      <Button variant="primary" as={Link} to="/coaches">+ Записаться к тренеру</Button>
    </div>
  </header>
  ⚠ Было "+ Добавить тренировку" — **заменено** на "+ Записаться" (REPLACEMENTS §9).

  <div className="schedule-layout"> {/* 2fr 1fr */}
    <main className="schedule-main">

      <TimeGrid
        cols={7}                                          // Пн..Вс
        rows={['08:00', '09:00', ..., '22:00']}            // или dense строки только для занятых часов
        events={sessions.map(s => ({
          id: s.id,
          dayOfWeek: dayjs(s.scheduled_at).day(),
          start: s.scheduled_at,
          durationMinutes: s.duration_minutes,
          color: 'cyan',
          content: <ScheduleBlock session={s} />
        }))}
        showNowLine={true}
      />

      ⚠ Цветные блоки "Турнир", "Восстановление", "Самостоятельная практика" с PNG —
      **УБРАНЫ** (REPLACEMENTS §9: нет в бэке).
      Календарь становится разреженным — это ок.
      Empty-state если сессий < 2: <EmptyState compact title="Запиши себе тренировку"
        cta={<Button as={Link} to="/coaches">Найти тренера</Button>} />

    </main>

    <aside className="schedule-aside">
      <Card title="Сегодня" compact>
        {todaysSessions.map(s => <SessionRow key={s.id} session={s} compact />)}
        {todaysSessions.length === 0 && <p className="text-muted">Свободный день</p>}
      </Card>

      <Card title="В этом месяце" compact>
        <p>Всего сессий: <b>{monthSessions.length}</b></p>
        <p>Завершено:    <b>{completed.length}</b></p>
        <p>Запланировано: <b>{planned.length}</b></p>
      </Card>
      ⚠ Было "План на неделю" с 3 progress bars целей — **заменено** на простой counter (REPLACEMENTS §9).

      <Card title="Совет от Оракула" compact>
        {lastAdvice
          ? <OracleHint avatar={<OracleOrb size={32} />} text={lastAdvice.advice_summary}
                        onClick={() => navigate('/ai-chat')} />
          : <EmptyState compact title="Нет советов" cta={<Link to="/ai-chat">Открыть Оракула</Link>} />
        }
      </Card>
    </aside>
  </div>
</AppLayout>
```

## ScheduleBlock компонент

Используется внутри TimeGrid для каждого слота:

```
<ScheduleBlock>
  <CoachAvatar coachProfileId={s.coach_profile_id} fallbackName={s.coach_label} size={20} />
  <span className="time">{formatTime(s.scheduled_at)}</span>
  <strong>{s.coach_label}</strong>
  <small>{s.topic || 'Сессия'}</small>
  <StatusPill status={s.status} />
</ScheduleBlock>
```

## Данные

| Блок | Endpoint |
|---|---|
| Sessions грид + сегодня + counter | `GET /training-sessions/my` |
| `lastAdvice` | `GET /ai/history?limit=1` |
| Coach avatars (для каждой сессии) | `<CoachAvatar coachProfileId>` хук → `/ml/player-account/{aid}` (с TTL 1ч) |

## Замены

- **§3**: sidebar canonical.
- **§9**: убраны блоки "Турнир / Восстановление / Самостоятельная практика"; "+ Добавить тренировку" → "+ Записаться к тренеру"; "План на неделю" с целями → counter.
- **§16**: Coach avatars через хук `<CoachAvatar>`.

## Acceptance

- [ ] Today column подсвечена cyan tint.
- [ ] "Now line" — горизонтальная cyan линия с подписью "Сейчас" в актуальное время (обновляется раз в минуту).
- [ ] Клик по сессии → modal с деталями (reschedule, cancel, contact share).
- [ ] При навигации между неделями — данные перезагружаются.
- [ ] Mobile (< 768px): TimeGrid → list-view (карточки сессий по дням).

## States

| State | Поведение |
|---|---|
| sessions.length === 0 | TimeGrid пустой + empty-state в основной зоне с CTA "Найти тренера" |
| loading | skeleton TimeGrid + aside |
| network error | banner с retry |
