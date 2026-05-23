# Coach Schedule (Расписание тренера)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_coach_schedule.png` |
| **Код** | `services/frontend/src/pages/coach/Schedule.tsx` |
| **Layout** | `<AppLayout sidebar="coach">` |
| **Route** | `/coach/schedule` |
| **Доступ** | COACH |

## Sidebar

Canonical COACH, active = `Расписание`.

## Композиция

```
<AppLayout sidebar="coach">
  <header className="page-header flex-between">
    <div>
      <h1>Расписание</h1>
      <p className="text-muted">Подтверждённые сессии и новые заявки</p>
    </div>
    <div className="filter-bar">
      <SegmentedToggle value={view} options={['week','month']}>...</SegmentedToggle>
      <DateNav value={weekStart} onChange={setWeekStart} />
    </div>
    ⚠ Кнопка "+ Открыть слот" — УБРАНА (REPLACEMENTS §13).
    ⚠ Кнопка "Скопировать прошлую неделю" — УБРАНА.
  </header>

  <div className="coach-schedule-layout"> {/* 2fr 1fr */}

    <main>

      <TimeGrid
        cols={7}
        rows={['09:00', '10:00', ..., '23:00']}
        events={[
          // PLANNED сессии: cyan-glow блок
          ...sessions.map(s => ({
            id: `s-${s.id}`, kind: 'session',
            dayOfWeek: dayjs(s.scheduled_at).day(),
            start: s.scheduled_at, durationMinutes: s.duration_minutes,
            color: 'cyan',
            content: <SessionBlock session={s} />
          })),
          // Pending requests: yellow dashed блок
          ...pendingRequests.filter(r => r.preferredAt).map(r => ({
            id: `r-${r.id}`, kind: 'request',
            ...
          }))
        ]}
        showNowLine={true}
      />
      ⚠ "Свободно / Недоступно" слоты с PNG — УБРАНЫ (нет модели coach_availability, REPLACEMENTS §13).
      Сетка теперь разреженная — только реальные сессии и заявки.

      <legend className="schedule-legend">
        <Badge tone="cyan">Подтверждена</Badge>
        <Badge tone="warning">Ожидает</Badge>
        <Badge tone="muted">Перенесена</Badge>
        <Badge tone="success">Завершена</Badge>
        <Badge tone="danger">Отменена</Badge>
      </legend>

    </main>

    <aside>
      ⚠ "Параметры доступности" карточка (auto-accept, лимит, интервал) — УБРАНА (§13).
      ⚠ "Шаблоны слотов" — УБРАНЫ.

      <Card title={`Заявки в очереди (${pendingRequests.length})`} compact>
        {pendingRequests.length === 0 && <p className="text-muted">Нет новых заявок</p>}
        {pendingRequests.map(r => (
          <RequestMiniRow key={r.id}>
            <PlayerAvatar playerProfileId={r.player_profile_id} fallbackName={r.player_label} />
            <div>
              <strong>{r.player_label}</strong>
              <RankBadge rankName={r.player_actual_rank_tier} />
            </div>
            <p><RoleBadge role={r.desired_role} compact /> · {r.focus_area}</p>
            <Button variant="primary" size="sm" onClick={() => openAcceptModal(r)}>
              Подтвердить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onReject(r)}>Отклонить</Button>
          </RequestMiniRow>
        ))}
      </Card>

      <Card title="Статистика месяца" compact>
        <ProgressRing value={(completed.length / Math.max(monthSessions.length, 1)) * 100}
                      label={`${completed.length}/${monthSessions.length}`} />
        <small>сессий завершено в этом месяце</small>
        <ul>
          <li>Подтверждённых: <b>{planned.length}</b></li>
          <li>Перенесено: <b>{rescheduled.length}</b></li>
          <li>Отменено: <b>{cancelled.length}</b></li>
        </ul>
      </Card>
    </aside>
  </div>
</AppLayout>
```

## SessionBlock (внутри TimeGrid)

```
<div className={`schedule-block schedule-block--${s.status.toLowerCase()}`}>
  <PlayerAvatar playerProfileId={s.player_profile_id} fallbackName={s.player_label} size={20} />
  <strong>{s.player_label}</strong>
  <small>{formatTime(s.scheduled_at)} · {s.duration_minutes} мин</small>
  <small>{s.topic || 'Тренировка'}</small>
  <StatusPill status={s.status} small />
</div>
```

Клик → `<SessionDetailModal>` (reschedule / complete / cancel / contact share / write report).

## Данные

| Блок | Endpoint |
|---|---|
| Sessions | `GET /training-sessions/my` |
| Pending requests | `GET /matchmaking/requests/coach` |
| Accept (с временем) | `PATCH /matchmaking/requests/{id}` action=`CHOOSE_COACH` |
| Reject | `PATCH /matchmaking/requests/{id}` action=`REJECT` |
| Reschedule | `PATCH /training-sessions/{id}` action=`RESCHEDULE` |
| Complete | `PATCH /training-sessions/{id}` action=`COMPLETE` |
| Cancel | `PATCH /training-sessions/{id}` action=`CANCEL` |
| Submit report | `POST /training-sessions/{id}/report` |
| Player avatars | `<PlayerAvatar>` (хук) |

## Замены

- **§3**: sidebar canonical.
- **§13**: убраны слоты "Свободно / Недоступно" / "+ Открыть слот" / "Скопировать неделю" / "Параметры доступности" / "Шаблоны слотов". Сетка остаётся, но пустые ячейки — просто пустые.
- **§13**: "Заявки в очереди" — оставили, источник `/matchmaking/requests/coach`.
- **§16**: `<PlayerAvatar>` для учеников.

## Acceptance

- [ ] TimeGrid показывает только реальные сессии + pending requests (если есть preferred_at).
- [ ] "Now line" — горизонтальная cyan линия с подписью "Сейчас".
- [ ] Клик по PLANNED сессии → modal с действиями.
- [ ] Клик по pending request → accept-modal (с date-time picker).
- [ ] Reject требует confirm.
- [ ] Mobile: TimeGrid → list-view по дням, aside ниже.

## States

| State | Поведение |
|---|---|
| no sessions and no requests | empty-state в main "Пока пусто. Заполни профиль, чтобы появились заявки." |
| loading | skeleton TimeGrid + aside |
| network error | banner с retry |
