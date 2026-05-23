# Coach Profile (страница тренера — две роли)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_coach_profile.png` |
| **Код** | `services/frontend/src/pages/coach/Profile.tsx` (личный) + публичный режим для других пользователей |
| **Layout** | `<AppLayout>` (когда смотрит сам тренер) или `<PublicLayout>` (когда смотрит игрок) |
| **Routes** | `/coach/profile` (свой), `/coaches/:id` (публичный — *роут пока отсутствует, см. ниже*) |

⚠ Сейчас в `App.tsx` нет роута `/coaches/:id`. Когда игрок нажимает "Записаться" на карточке коуча, он не открывает страницу профиля — он сразу видит модал заявки. Если хотим публичную страницу профиля тренера — нужен новый роут (см. `BACKEND_GAP.md`). **В рамках первой итерации публичный профиль не создаём**, ограничиваемся личным `/coach/profile`. Эта спека описывает оба режима для согласованности; помеченные 🟡 — на следующую итерацию.

## Sidebar

Для `/coach/profile` (личный кабинет): canonical COACH sidebar, active = `Профиль тренера`.

## Композиция (личный кабинет)

```
<AppLayout sidebar="coach">

  <header className="page-header flex-between">
    <div>
      <h1>Мой профиль тренера</h1>
      <p className="text-muted">Так тебя видят игроки в каталоге</p>
    </div>
    <div>
      <Badge tone={coach.is_verified ? 'cyan' : 'warning'}>
        {coach.is_verified ? 'Verified' : 'На рассмотрении'}
      </Badge>
      <Button variant="outline" onClick={onPreview}>Предпросмотр</Button>
    </div>
  </header>

  <div className="coach-profile-layout"> {/* 2fr 1fr */}

    <main>

      1. HERO CARD
         <CoachAvatar coachProfileId={coach.id} fallbackName={coach.about?.split('\n')[0]} size={120} />
         <div>
           <h2>{coach.about?.split('\n')[0] || `Тренер #${coach.id}`}</h2>
           <RankBadge rankName={coach.rank_tier || coach.auto_rank_tier} />
           <small>Опыт {coach.experience_years || '—'} лет · {sessions.length} сессий</small>
         </div>
         <div className="stat-pills">
           <StatPill label="MMR"      value={coach.mmr_estimate || coach.auto_mmr_estimate || '—'} />
           <StatPill label="Рейтинг"  value={`${avgRating} ★`} sublabel={`${reviewsCount} отзывов`} />
           <StatPill label="Сессий"   value={sessions.length} />
         </div>
         {!coach.is_verified && <Alert variant="warning">
           Профиль на проверке. После одобрения админом — появится в каталоге.
         </Alert>}

      2. Tabs: "О тренере · Цена · Hero pool · Отзывы"
         ⚠ Tab "Расписание" в публичном профиле и tab "Стиль" — УБРАНЫ (REPLACEMENTS §11).

         === Tab "О тренере" ===
         <FormGroup label="ЗАГОЛОВОК">
           <TextInput value={firstLine} hint="Первая строка отображается как имя в каталоге" />
         </FormGroup>
         <FormGroup label="ПОДРОБНО О ПОДХОДЕ">
           <Textarea value={about} maxLength={2000} />
         </FormGroup>
         <FormGroup label="ОПЫТ В ГОДАХ">
           <NumberInput value={expYears} min={0} max={30} />
         </FormGroup>
         <FormGroup label="ОСНОВНЫЕ РОЛИ">
           <RolePicker multi value={mainRoles} onChange={setMainRoles} />
           <small className="text-muted">
             {coach.auto_main_roles?.length
               ? `Автозаполнение: ${coach.auto_main_roles.join(', ')}`
               : 'Привяжи Steam, чтобы было автозаполнение'}
           </small>
         </FormGroup>

         === Tab "Цена" ===
         <FormGroup label="ЦЕНА ЗА ЧАС" hint="В рублях">
           <NumberInput value={hourlyRate} min={0} />
         </FormGroup>
         <p className="text-muted">
           Оплата происходит напрямую между сторонами после сессии. RuPrime не удерживает комиссию.
         </p>
         ⚠ Карточки тарифов "Разовая / Пакет 5 / Безлимит" — УБРАНЫ (REPLACEMENTS §2). Только hourly_rate.

         === Tab "Hero pool" ===
         <HeroPoolPicker value={heroPool} onChange={setHeroPool} max={10} />
           {/* мульти-select с поиском, выбор до 10 героев */}
         {coach.auto_hero_pool?.length > 0 && (
           <Card variant="ghost" compact>
             <small>Автоопределение из последних 200 матчей:</small>
             <div className="hero-pool-row">
               {coach.auto_hero_pool.map(id => <HeroChip key={id} heroId={Number(id)} />)}
             </div>
             <Button variant="ghost" size="sm" onClick={useAutoPool}>Использовать автозаполнение</Button>
           </Card>
         )}

         === Tab "Отзывы" ===
         <CoachReviewsList reviews={reviews} variant="self" />
         {reviews.length === 0 && <EmptyState title="Отзывов пока нет" />}

      <footer className="form-actions">
        <Button variant="outline" onClick={onCancel}>Отменить</Button>
        <Button variant="primary" onClick={onSave} disabled={!hasChanges}>Сохранить</Button>
      </footer>

    </main>

    <aside>
      <Card title="Видимость" compact>
        {coach.profile_complete
          ? <Badge tone="success">Виден в каталоге</Badge>
          : <Alert variant="warning">
              Заполни about, hourly_rate, mmr_estimate (или привяжи Steam для autofill) — тогда появишься в каталоге.
            </Alert>
        }
      </Card>

      <Card title="Steam-аккаунт" compact>
        {coach.dota_account_id
          ? <>
              <Avatar src={steamData.avatar_url} fallbackText="C" size={48} />
              <small>{steamData.personaname}</small>
              <small>{steamData.matches_loaded} матчей загружено</small>
              <Button variant="outline" size="sm" as={Link} to="/settings">Обновить</Button>
            </>
          : <Button variant="primary" onClick={onLinkSteam}>Привязать Steam</Button>
        }
      </Card>

      <Card title="Подсказки" compact>
        <ul>
          <li>Заполни "О тренере" подробно — это главное, что видят игроки.</li>
          <li>Загрузи топ героев для повышения авторитета.</li>
          <li>Отвечай на заявки в течение 24 часов — твой рейтинг растёт быстрее.</li>
        </ul>
      </Card>
    </aside>
  </div>
</AppLayout>
```

## Композиция (публичный профиль) 🟡

> Не создаём в первой итерации. Если будем делать — это та же страница, но в `<PublicLayout>` (или `<AppLayout>` если смотрит другой игрок), все формы заменяются на read-only текст, добавляется CTA "Записаться → ApplyToCoachModal".

```
<header className="hero-card">
  <CoachAvatar coachProfileId={c.id} size={120} />
  <h1>{c.about?.split('\n')[0]}</h1>
  <RankBadge rankName={c.rank_tier} />
  <Button variant="primary" onClick={openApplyModal}>Записаться на сессию →</Button>
  ⚠ Кнопка "Написать в чат" — УБРАНА (REPLACEMENTS §11).
</header>

<Tabs value={tab}>
  <Tab id="about" label="О тренере">{aboutText}</Tab>
  <Tab id="heroes" label="Hero pool">{heroPool}</Tab>
  <Tab id="reviews" label={`Отзывы (${reviewsCount})`}>{reviews}</Tab>
</Tabs>

⚠ Tab "Расписание" — заменён на статичный блок "Связаться через заявку" (REPLACEMENTS §11).
⚠ Карточки тарифов — заменены на одну строку цены (REPLACEMENTS §2).
```

## Данные

| Блок | Endpoint |
|---|---|
| Свой профиль | `GET /coach/profile` |
| Save | `POST /coach/profile` |
| Reviews | `GET /coach/{coach.id}/reviews` |
| Sessions count (для KPI) | `GET /training-sessions/my` |
| Steam data | `GET /player/steam-data` |
| Hero metadata (для picker'а) | `loadHeroes()` (preload) |

## Замены

- **§2**: Карточки тарифов → одна строка цены.
- **§11**: Tab "Стиль", "Расписание" в публичном (заменён), кнопка "Написать в чат" — убраны.
- **§16**: Аватар тренера — `<CoachAvatar coachProfileId>` или `<Avatar src={steamData.avatar_url}>`. Hero pool — `<HeroChip heroId>`.

## Acceptance

- [ ] Tabs работают.
- [ ] `useAutoPool` копирует `auto_hero_pool` в `hero_pool`.
- [ ] Save шлёт только изменённые поля.
- [ ] Если `is_verified === false` — баннер с предупреждением.
- [ ] Hero pool picker с поиском по имени (используя `loadHeroes()`).
- [ ] Mobile: 2-col → стак, tabs остаются вверху.

## States

| State | Поведение |
|---|---|
| no coach profile (404 при GET) | автоматически POST с пустым телом → создаст пустой профиль |
| not verified | banner + кнопка disabled "Сохранить отправит в каталог после проверки" |
| save 403 (не тренер) | toast error |
