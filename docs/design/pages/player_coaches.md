# Player Coaches (Каталог тренеров)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_coaches.png` |
| **Код** | `services/frontend/src/pages/player/Coaches.tsx` |
| **Layout** | `<AppLayout sidebar="player">` |
| **Route** | `/coaches` |
| **Доступ** | PLAYER |

## Sidebar

Канонический PLAYER, active = `Тренеры`.

## Композиция

```
<AppLayout>
  <header className="page-header">
    <h1>Тренеры</h1>
    <p className="text-muted">Найди ментора под свою цель и стиль игры</p>
  </header>

  <FilterBar className="mb-20">
    <TextInput
      icon="search"
      placeholder="Поиск по нику или герою"
      value={search} onChange={setSearch} />
    <Select label="Ранг" options={['Любой','Divine+','Immortal']}>...</Select>
    <Select label="Роль" options={['Все','POS1','POS2','POS3','POS4','POS5']}>...</Select>
    <Select label="Цена" options={['до 1000 ₽','до 2000 ₽','до 5000 ₽','от 5000 ₽']}>...</Select>
    <Select label="Сортировка" options={['По рейтингу','По цене','По опыту','Новые']}>...</Select>
  </FilterBar>
  ⚠ "Сейчас онлайн" toggle — УБРАН (REPLACEMENTS §7).
  ⚠ Filter "Язык" — УБРАН (нет поля в модели).

  <div className="grid-3">
    {coaches.map(c => <CoachCard key={c.id} coach={c} onApply={() => openApplyModal(c)} />)}
    {coaches.length === 0 && <EmptyState title="По фильтрам никого не нашли" />}
  </div>

  <Pagination total={total} page={page} onChange={setPage} />

  {applyModal && <ApplyToCoachModal coach={applyModal} onClose={...} onApply={...} />}
</AppLayout>
```

## `<CoachCard>` композиция

```
<div className="card card-coach">
  <header>
    <CoachAvatar coachProfileId={c.id} fallbackName={c.about?.split('\n')[0]} size={72} />
    <div>
      <h3>{c.about?.split('\n')[0] || `Тренер #${c.id}`}</h3>
      <RankBadge rankName={c.rank_tier || c.auto_rank_tier} />
      {c.is_verified && <Badge tone="cyan" icon="check">Verified</Badge>}
    </div>
    {/* Топ-1% badge — УБРАН (REPLACEMENTS §7) */}
  </header>

  <div className="coach-hero-pool">
    {(c.hero_pool?.length ? c.hero_pool : c.auto_hero_pool || [])
      .slice(0, 5)
      .map(id => <HeroChip heroId={Number(id)} key={id} />)}
  </div>
  ⚠ Если оба пусты — chip-row не рендерим.

  <div className="coach-stats-row">
    <div className="coach-stat">
      <div className="coach-stat-value">{c.mmr_estimate || c.auto_mmr_estimate || '—'}</div>
      <div className="coach-stat-label">MMR</div>
    </div>
    <div className="coach-stat">
      <div className="coach-stat-value">{c.experience_years || '—'}{c.experience_years && ' лет'}</div>
      <div className="coach-stat-label">Опыт</div>
    </div>
    <div className="coach-stat">
      <div className="coach-stat-value">{stats.sessions || 0}</div>
      <div className="coach-stat-label">Сессий</div>
    </div>
    <div className="coach-stat">
      <div className="coach-stat-value">{stats.avgRating || '—'} ★</div>
      <div className="coach-stat-label">Рейтинг</div>
    </div>
  </div>
  ⚠ Винрейт учеников 71% — заменили на "Опыт лет" (нужны агрегаты на бэке, см. BACKEND_GAP).

  <div className="coach-roles">
    {(c.main_roles?.length ? c.main_roles : c.auto_main_roles || [])
      .map(r => <RoleBadge key={r} role={r} compact />)}
  </div>

  <footer>
    <div className="coach-price">
      {c.hourly_rate
        ? <><b>{c.hourly_rate} ₽</b><small> / час</small></>
        : <span className="text-muted">Цена обсуждается</span>}
    </div>
    <Button variant="primary" onClick={onApply}>Записаться →</Button>
  </footer>
</div>
```

## `<ApplyToCoachModal>` композиция

Модал, открывается кнопкой "Записаться":

```
<Modal title={`Записаться к ${c.coach_label}`}>
  <FormGroup label="ЖЕЛАЕМАЯ РОЛЬ">
    <RolePicker value={role} onChange={setRole} />
  </FormGroup>
  <FormGroup label="ФОКУС ОБУЧЕНИЯ" hint="Что хочешь прокачать?">
    <Textarea value={focus} onChange={setFocus} maxLength={300} />
  </FormGroup>
  <FormGroup label="СООБЩЕНИЕ ТРЕНЕРУ (опц.)">
    <Textarea value={message} onChange={setMessage} maxLength={500} />
  </FormGroup>
  <footer>
    <Button variant="outline" onClick={onClose}>Отмена</Button>
    <Button variant="primary" onClick={handleSubmit} disabled={!role}>Отправить заявку</Button>
  </footer>
</Modal>
```

Submit:
```ts
await coreApi.post('/matchmaking/requests', {
  desired_role: role,
  focus_area: focus,
  preferred_coach_profile_id: c.id,
  message,
  use_ai_coach: false,
});
toast.success('Заявка отправлена');
navigate('/requests');
```

## Данные

| Блок | Endpoint |
|---|---|
| Список тренеров | `GET /coaches?role={role}&min_rate=&max_rate=` |
| Coach avatars | `<CoachAvatar coachProfileId>` |
| Reviews aggregate (avg rating, count) | `GET /coach/{id}/reviews` или передавать с `/coaches` (см. BACKEND_GAP) |
| Apply | `POST /matchmaking/requests` |

## Замены

- **§3**: sidebar canonical.
- **§7**: убраны "Сейчас онлайн" toggle, фильтр "Язык", "Топ-1%" badge → Verified, Online dot на аватаре.
- **§7**: "Винрейт учеников" — заменили на "Опыт лет".
- **§16**: `<CoachAvatar>`, `<HeroChip heroId>`, `<RoleBadge>`, `<RankBadge>` — все из toolkit.

## Acceptance

- [ ] Фильтры обновляют список (debounce 250ms для поиска).
- [ ] Пустой результат — `<EmptyState>`.
- [ ] Verified-бейдж только при `is_verified === true`.
- [ ] Если у тренера нет ручного `hero_pool` — берём `auto_hero_pool`.
- [ ] Если у тренера нет ручного `main_roles` — берём `auto_main_roles`.
- [ ] Если оба пустые → блок скрывается, карточка не "дырявая".
- [ ] Mobile: grid-3 → 1 колонка, фильтры → горизонтальный скролл.

## States

| State | Поведение |
|---|---|
| loading | grid-3 со SkeletonCard × 6 |
| empty | `<EmptyState title="Тренеры не найдены" />` |
| apply success | toast + navigate `/requests` |
| apply 409 (уже есть заявка) | toast warning + navigate `/requests` |
