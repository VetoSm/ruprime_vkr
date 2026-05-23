# Coach Dashboard

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_coach_dashboard.png` |
| **Код** | `services/frontend/src/pages/coach/Dashboard.tsx` |
| **Layout** | `<AppLayout sidebar="coach">` (COACH MODE — см. REPLACEMENTS §3) |
| **Route** | `/coach/dashboard` |
| **Доступ** | COACH |

## Sidebar (canonical COACH)

⚠ На PNG: Обзор / Сессии / Ученики / Расписание / Доходы / Отзывы / Профиль / Аналитика / Настройки. **Из них реальные роуты**: Обзор, Расписание, Профиль, Отзывы, Аналитика, Оракул, Настройки. Пункты "Сессии", "Ученики", "Доходы" — **не добавляем как отдельные** (Ученики и Сессии видны на дашборде; Доходы — нет на бэке).

Канонический COACH nav:
```
Обзор             /coach/dashboard
Расписание        /coach/schedule
Профиль тренера   /coach/profile
Отзывы            /coach/reviews
Аналитика         /stats               ← общая страница, для тренеров доступ открыт
Оракул            /ai-chat
Настройки         /settings
```

Логотип: `<Logo subtitle="COACH MODE" />`.
Декор: `decorRender('dashboardCorner')` = Invoker в углу.

## Композиция MAIN

```
<AppLayout sidebar="coach">

  <header className="page-header flex-between">
    <div>
      <h1>Добрый {greetingByTime()}, {coach.about?.split('\n')[0] || user.login}</h1>
      <p className="text-muted">
        Сегодня у тебя {todaysSessions.length} сессий и {pendingRequests.length} новых заявок
      </p>
    </div>
    <Select value={monthRange} options={[...]}>...</Select>
    ⚠ Кнопка "Выплатить" — УБРАНА (REPLACEMENTS §12).
  </header>

  1. KPI ROW — grid-4
     <StatCard icon="calendar" label="Сессий за месяц" value={monthSessions.length}
               sublabel={`+${planned.length} запланировано`} />
     <StatCard icon="people"   label="Активных учеников" value={uniqueStudents.length} />
     <StatCard icon="check"    label="Завершено сессий" value={completed.length} />
     <StatCard icon="star"     label="Рейтинг" value={`${avgRating} ★`}
               sublabel={`${reviewsCount} отзывов`} />
     ⚠ "Доход за месяц 64 500 ₽" — **заменено** на "Сессий за месяц" (REPLACEMENTS §12).

  2. TWO-COLUMN — grid 2fr 1fr

     LEFT col:
       A. <Card title="Сессии по дням">
            <AreaLineChart data={sessionsByDay(monthSessions)} gradient="cyan" />
          </Card>
          ⚠ "Доход по дням" — **заменено** на "Сессии по дням" (REPLACEMENTS §12).

       B. <Card title="Предстоящие сессии сегодня">
            {todaysSessions.length === 0
              ? <p className="text-muted">Сегодня свободный день</p>
              : todaysSessions.map(s => (
                  <SessionRow horizontal key={s.id}>
                    <PlayerAvatar playerProfileId={s.player_profile_id} fallbackName={s.player_label} />
                    <strong>{s.player_label}</strong>
                    <RankBadge rankName={s.player_actual_rank_tier} />
                    <p>{s.topic || 'Тренировочная сессия'}</p>
                    <small><Icon name="clock" /> {formatTime(s.scheduled_at)} · {s.duration_minutes} мин</small>
                    <StatusPill status={s.status} />
                    <div className="actions">
                      <Button variant="outline" onClick={() => openContactShare(s)}>Поделиться контактом</Button>
                      <Button variant="ghost" onClick={() => openNotes(s)}>Заметки</Button>
                    </div>
                  </SessionRow>
                ))
            }
          </Card>

       C. <Card title={`Новые заявки (${pendingRequests.length})`}>
            {pendingRequests.length === 0 && <p className="text-muted">Нет новых заявок</p>}
            {pendingRequests.map(r => (
              <CoachRequestRow key={r.id}>
                <PlayerAvatar playerProfileId={r.player_profile_id} fallbackName={r.player_label} />
                <strong>{r.player_label}</strong>
                <RankBadge rankName={r.player_actual_rank_tier} />
                <p><RoleBadge role={r.desired_role} /> · {r.focus_area}</p>
                <small>Сообщение: "{r.message || '—'}"</small>
                <div className="actions">
                  <Button variant="primary" size="sm" onClick={() => openAcceptModal(r)}>Принять</Button>
                  <Button variant="ghost" size="sm" onClick={() => openChatModal(r)}>Обсудить</Button>
                  <Button variant="danger-ghost" size="sm" onClick={() => onReject(r)}>Отклонить</Button>
                </div>
              </CoachRequestRow>
            ))}
          </Card>

     RIGHT col:
       D. <Card title="Лидер ученики месяца" compact>
            {topStudents.slice(0, 3).map((s, i) => (
              <StudentRow key={s.player_profile_id}>
                <Badge tone={['gold','silver','bronze'][i]}>{i+1}</Badge>
                <PlayerAvatar playerProfileId={s.player_profile_id} fallbackName={s.player_label} />
                <div>
                  <strong>{s.player_label}</strong>
                  <RankBadge rankName={s.analysis_summary?.estimated_rank_tier} />
                </div>
                <small>Сессий: {s.sessions_completed}</small>
              </StudentRow>
            ))}
            <Button variant="ghost" size="sm" as={Link} to="/coach/students">Показать всех</Button>
            ⚠ Дельты "+320 MMR / +280 MMR" — УБРАНЫ (нет history endpoint, REPLACEMENTS §12).
            ⚠ Сортировка по `sessions_completed` desc.
          </Card>

       E. <Card title="Свежие отзывы" compact>
            {recentReviews.slice(0, 2).map(r => (
              <ReviewMiniCard key={r.id}>
                <PlayerAvatar playerProfileId={r.player_profile_id} fallbackName={r.author_label} />
                <div>
                  <strong>{r.author_label}</strong>
                  <StarRating value={r.rating} />
                </div>
                <blockquote>"{r.comment?.slice(0, 100)}..."</blockquote>
              </ReviewMiniCard>
            ))}
            <Button variant="ghost" size="sm" as={Link} to="/coach/reviews">Все отзывы</Button>
          </Card>

       F. <Card title="Цель месяца" compact>
            <ProgressRing value={(completed.length / goalSessions) * 100}
                          label={`${completed.length} / ${goalSessions}`} />
            <small className="text-muted">Сессий в этом месяце</small>
          </Card>
          ⚠ `goalSessions` — pure-frontend setting (localStorage), без бэка.
</AppLayout>
```

## `AcceptRequestModal`

При нажатии "Принять":
```
<Modal title={`Назначить сессию с ${r.player_label}`}>
  <FormGroup label="ДАТА И ВРЕМЯ">
    <DateTimePicker value={scheduledAt} onChange={setScheduledAt} min={now} />
  </FormGroup>
  <FormGroup label="ДЛИТЕЛЬНОСТЬ">
    <SegmentedToggle value={duration} options={[60, 90, 120]}>...</SegmentedToggle>
  </FormGroup>
  <footer>
    <Button variant="outline" onClick={close}>Отмена</Button>
    <Button variant="primary" onClick={() => submit(r.id, scheduledAt, duration)}>
      Подтвердить
    </Button>
  </footer>
</Modal>
```

Submit → `PATCH /matchmaking/requests/{id}` `{ action: 'CHOOSE_COACH', scheduled_at, chosen_coach_profile_id: coach.id }`. Бэк создаст `TrainingSession`.

## Данные

| Блок | Endpoint |
|---|---|
| `coach` | `GET /coach/profile` |
| Sessions месяца | `GET /training-sessions/my` (фильтр на фронте по `scheduled_at` за месяц) |
| Pending requests | `GET /matchmaking/requests/coach` |
| Top students | `GET /coach/students-overview` (готовый агрегат) |
| Recent reviews | `GET /coach/{coach.id}/reviews` (limit на фронте) |
| Accept | `PATCH /matchmaking/requests/{id}` action=`CHOOSE_COACH` |
| Reject | `PATCH /matchmaking/requests/{id}` action=`REJECT` |
| Cancel | `PATCH /training-sessions/{id}` action=`CANCEL` |
| Complete | `PATCH /training-sessions/{id}` action=`COMPLETE` |

## Замены

- **§3**: sidebar canonical (без "Доходы" / "Сессии" / "Ученики" как отдельных пунктов).
- **§12**: "Доход за месяц / Доход по дням / Выплатить" → "Сессий за месяц / Сессии по дням" + кнопка убрана.
- **§12**: "Лидер ученики" с MMR-дельтами → без дельт, сорт по `sessions_completed`.
- **§12**: "Принять" → модал выбора времени, не bare click.
- **§16**: Avatars: `<PlayerAvatar playerProfileId>` для учеников, `<Avatar src={summary.avatar_url}>` для самого тренера.

## Acceptance

- [ ] Greeting меняется по времени (Доброе утро / Добрый день / Добрый вечер).
- [ ] Pending requests с badge на nav-item (counter).
- [ ] Accept-модал требует выбора времени.
- [ ] Reject — confirm-modal.
- [ ] Reviews aside показывает только 2 свежих с link → /coach/reviews.
- [ ] Mobile: 2-col → стак, KPI row → 2×2.

## States

| State | Поведение |
|---|---|
| `coach_profile` not found (профиль не создан) | redirect на `/coach/profile` с пометкой "Заполни профиль для приёма заявок" |
| no sessions | empty-state в "Сегодня" + "0 в этом месяце" |
| no requests | empty-state |
| chart loading | skeleton chart |
