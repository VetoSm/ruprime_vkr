# Player Sessions & Requests (Сессии и заявки)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_sessions.png` |
| **Код** | `services/frontend/src/pages/player/Requests.tsx` (страница объединяет requests + sessions) |
| **Layout** | `<AppLayout sidebar="player">` |
| **Route** | `/requests` |
| **Доступ** | PLAYER |

## Sidebar

Канонический PLAYER, active = `Сессии`.

## Композиция

```
<AppLayout>
  <header className="page-header flex-between">
    <div>
      <h1>Сессии и заявки</h1>
      <p className="text-muted">Управляй своими записями и активными запросами</p>
    </div>
    <Button variant="primary" as={Link} to="/coaches">+ Новая заявка</Button>
  </header>

  <Tabs value={tab} onChange={setTab}>
    <Tab id="all"          label={`Все · ${all.length}`} />
    <Tab id="active"       label={`Активные · ${active.length}`} />
    <Tab id="pending"      label={`Ожидают · ${pending.length}`} />
    <Tab id="completed"    label={`Завершённые · ${completed.length}`} />
  </Tabs>

  <div className="sessions-layout"> {/* 2fr 1fr */}
    <main>

      <WeekStrip value={weekStart} events={eventsByDay} onChange={setWeekStart} />

      <div className="session-list">
        {filtered.map(item => (
          item.kind === 'session'
            ? <SessionCard key={`s-${item.id}`} session={item} onAction={...} />
            : <RequestCard key={`r-${item.id}`} request={item} onAction={...} />
        ))}
        {filtered.length === 0 && (
          <EmptyState title="Нет записей в этой категории"
            cta={<Button as={Link} to="/coaches">Найти тренера</Button>} />
        )}
      </div>

    </main>

    <aside>
      <Card title="Ближайшая сессия" variant="accent">
        {nextSession ? <NextSessionCountdown session={nextSession} /> : <p>Нет ближайших сессий</p>}
      </Card>

      <Card title="Подсказки от Оракула" compact>
        {lastTips.slice(0, 3).map(t => (
          <OracleHint key={t.id} compact text={t.advice_summary}
                      onClick={() => navigate('/ai-chat')} />
        ))}
        {lastTips.length === 0 && (
          <EmptyState compact title="Нет советов" cta={<Link to="/ai-chat">Открыть Оракула</Link>} />
        )}
      </Card>

      <Card title="Статистика месяца" compact>
        <ProgressRing value={(completed.length / Math.max(all.length, 1)) * 100}
                      label={`${completed.length}/${all.length}`} />
        <small className="text-muted">Завершено сессий за май</small>
      </Card>
    </aside>
  </div>
</AppLayout>
```

## `<SessionCard>` действия

```
<Card horizontal>
  <CoachAvatar coachProfileId={s.coach_profile_id} fallbackName={s.coach_label} size={48} />
  <div>
    <strong>{s.coach_label}</strong>
    <RankBadge rankName={...} />
    <p>{s.topic || 'Тренировочная сессия'}</p>
    <small>
      <Icon name="calendar" /> {formatDate(s.scheduled_at)} · {s.duration_minutes} мин
    </small>
  </div>
  <StatusPill status={s.status} />  ← PLANNED→cyan "Подтверждена", COMPLETED→green "Завершена",
                                       CANCELLED→red "Отменена", RESCHEDULED→muted "Перенесена"

  <div className="actions">
    {s.status === 'PLANNED' && (
      <>
        <Button variant="outline" onClick={() => openContactShareModal(s)}>
          Поделиться контактом
        </Button>
        <Button variant="ghost" onClick={() => onCancel(s)}>Отменить</Button>
        <Button variant="ghost" onClick={() => openRescheduleModal(s)}>Перенести</Button>
      </>
    )}
    {s.status === 'COMPLETED' && !s.review && (
      <Button variant="outline" onClick={() => openReviewModal(s)}>Оставить отзыв</Button>
    )}
  </div>
</Card>
```

⚠ Кнопка **"Перейти в Discord"** с PNG — **заменена** на `Поделиться контактом` (см. REPLACEMENTS §8).

## Contact Share Modal

```
<Modal title="Поделиться контактом с тренером">
  <SegmentedToggle value={contactType} options={['telegram','discord','vk','steam','phone','email']}>
    <option>Telegram</option><option>Discord</option><option>VK</option>
    <option>Steam</option><option>Phone</option><option>Email</option>
  </SegmentedToggle>
  <FormGroup label="ВАШ КОНТАКТ">
    <TextInput value={contactValue} placeholder={placeholderByType[contactType]} />
  </FormGroup>
  <FormGroup label="ЗАМЕТКА (опц.)">
    <TextInput value={note} maxLength={255} />
  </FormGroup>
  <footer>
    <Button variant="outline" onClick={close}>Отмена</Button>
    <Button variant="primary" onClick={handleShare}>Отправить</Button>
  </footer>
</Modal>
```

Submit → `POST /training-sessions/{id}/contact-share` с `{ contact_type, contact_value, note }`.

## `<RequestCard>` действия

```
<Card>
  <h4>Заявка #{r.id}</h4>
  <StatusPill status={r.status} />
  <div>
    <RoleBadge role={r.desired_role} /> · {r.focus_area}
  </div>

  {r.status === 'WAITING_CONFIRMATION' && r.recommended_coaches?.map(rc => (
    <div key={rc.coach_profile_id} className="recommended-coach">
      <CoachAvatar coachProfileId={rc.coach_profile_id} fallbackName={rc.coach_label} />
      <div>
        <strong>{rc.coach_label}</strong>
        <RankBadge rankName={rc.rank_tier} />
        <small>{rc.hourly_rate} ₽/час</small>
      </div>
      <small className="text-muted">Match score: {(rc.score * 100).toFixed(0)}%</small>
      <Button variant="primary" size="sm" onClick={() => onChoose(r.id, rc.coach_profile_id)}>
        Выбрать
      </Button>
    </div>
  ))}

  {r.status === 'NEW' || r.status === 'MATCHING' && (
    <div className="loading-state">
      <Spinner /> Подбираем тренеров...
    </div>
  )}

  <Button variant="ghost" onClick={() => onCancel(r.id)}>Отменить заявку</Button>
</Card>
```

## Данные

| Блок | Endpoint |
|---|---|
| Сессии | `GET /training-sessions/my` |
| Заявки | `GET /matchmaking/requests/my` |
| Объединение | в стейте `[...sessions.map(s=>({...s,kind:'session'})), ...requests.map(r=>({...r,kind:'request'}))].sort()` |
| `onCancel(session)` | `PATCH /training-sessions/{id}` `{ action: 'CANCEL' }` |
| `onReschedule(session, newTime)` | `PATCH /training-sessions/{id}` `{ action: 'RESCHEDULE', scheduled_at }` |
| `onContactShare(session, payload)` | `POST /training-sessions/{id}/contact-share` |
| `onCancelRequest(req)` | `PATCH /matchmaking/requests/{id}` `{ action: 'CANCEL' }` |
| `onChooseCoach(req, coachId)` | `PATCH /matchmaking/requests/{id}` `{ action: 'CHOOSE_COACH', chosen_coach_profile_id, scheduled_at }` ⚠ требует выбора времени → DatePickerModal |
| `onReview(session, rating, comment)` | `POST /coach-reviews` `{ training_session_id, rating, comment }` |
| `lastTips` | `GET /ai/history?limit=3` |

## Status mapping (Session)

| API status | UI label | StatusPill tone |
|---|---|---|
| PLANNED | Подтверждена | cyan |
| COMPLETED | Завершена | success (green) |
| CANCELLED | Отменена | danger (red) |
| RESCHEDULED | Перенесена | muted |

## Status mapping (Request)

| API status | UI label | tone |
|---|---|---|
| NEW | Новая | cyan |
| MATCHING | Подбираем | warning (yellow) |
| WAITING_CONFIRMATION | Ждёт подтверждения | cyan |
| ACCEPTED | Принята | success |
| REJECTED | Отклонена | muted |
| CANCELLED | Отменена | danger |

## Замены

- **§3**: sidebar canonical.
- **§8**: "Перейти в Discord" → "Поделиться контактом" с выбором мессенджера. Иконка Discord — одна из 6 опций.
- **§8**: Маленькая hero-icon в углу сессии — **УБРАНА** (не знаем заранее на каком герое).
- **§16**: Coach avatars через `<CoachAvatar>`.

## Acceptance

- [ ] Tabs обновляют список без перезагрузки.
- [ ] Countdown в "Ближайшая сессия" обновляется раз в секунду.
- [ ] Cancel требует confirm-modal.
- [ ] Reschedule открывает date-time picker.
- [ ] Choose coach требует выбора `scheduled_at` (модал).
- [ ] После apply / cancel / reschedule — refetch.
- [ ] Mobile: 2-колоночный layout → стак, WeekStrip горизонтально скроллится.

## States

| State | Поведение |
|---|---|
| empty all | `<EmptyState>` "Запиши свою первую тренировку" CTA → `/coaches` |
| loading | Skeleton x 4 cards |
| network error | banner с retry |
