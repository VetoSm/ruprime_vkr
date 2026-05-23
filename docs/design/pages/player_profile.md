# Player Profile / Settings (Настройки)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_player_profile.png` |
| **Код** | `services/frontend/src/pages/player/Profile.tsx` |
| **Layout** | `<AppLayout>` (PLAYER или COACH sidebar) |
| **Route** | `/settings` |
| **Доступ** | PLAYER, COACH |

## Sidebar

Канонический, active = `Настройки`.

## Композиция

```
<AppLayout>
  <header className="page-header">
    <h1>Профиль</h1>
    <p className="text-muted">Управляй данными аккаунта и предпочтениями</p>
  </header>

  <SubTabs value={tab} onChange={setTab}>
    <SubTab id="profile"  label="Профиль" />
    <SubTab id="steam"    label="Steam-аккаунт" />
    <SubTab id="goals"    label="Цели" />
    <SubTab id="security" label="Безопасность" />
  </SubTabs>
  ⚠ Tab "Уведомления" — УБРАН (REPLACEMENTS §10).
  ⚠ Tab "Подписка" — УБРАН.

  {tab === 'profile'  && <ProfilePanel />}
  {tab === 'steam'    && <SteamPanel />}
  {tab === 'goals'    && <GoalsPanel />}
  {tab === 'security' && <SecurityPanel />}
</AppLayout>
```

---

## `<ProfilePanel>`

```
<div className="two-col-grid"> {/* 2fr 1fr */}
  <Card title="Личная информация">
    <div className="avatar-row">
      <Avatar src={summary.avatar_url} fallbackText={user.login} size={120} />
      <p className="text-muted">Аватар синхронизируется со Steam.<br />
        Чтобы обновить — перепривяжи Steam-аккаунт.</p>
      {/* ⚠ Кнопка "Сменить аватар" — УБРАНА (REPLACEMENTS §10) */}
    </div>

    <div className="grid-2">
      <FormGroup label="НИКНЕЙМ"><TextInput value={profile.login} readOnly hint="Меняется только через поддержку" /></FormGroup>
      <FormGroup label="EMAIL"><TextInput value={user.email} readOnly /></FormGroup>
      <FormGroup label="ОСНОВНАЯ РОЛЬ"><RolePicker value={analysisRole} onChange={...} /></FormGroup>
      <FormGroup label="ЯЗЫК"><Select options={['RU']} value="RU" disabled /></FormGroup>
    </div>
    ⚠ "Дата рождения" — УБРАНО (нет в модели, REPLACEMENTS §10).
    ⚠ "Часовой пояс" — оставим pure-frontend setting в localStorage (без API).

    <FormGroup label="О СЕБЕ">
      <Textarea value={about} onChange={setAbout} maxLength={500} />
    </FormGroup>

    <footer>
      <Button variant="outline" onClick={onReset}>Отменить</Button>
      <Button variant="primary" onClick={onSave} disabled={!hasChanges}>Сохранить</Button>
    </footer>
  </Card>

  <Card title="Состояние" compact>
    <p>Роль: <Badge>{user.role}</Badge></p>
    <p>Создан: {formatDate(user.created_at)}</p>
    <p>Email подтверждён: {user.is_verified ? '✓' : '—'}</p>
    {user.role === 'PLAYER' && user.coach_application_status === 'PENDING' && (
      <Badge tone="warning">Заявка тренера на рассмотрении</Badge>
    )}
    {user.role === 'PLAYER' && user.coach_application_status !== 'PENDING' && (
      <Button variant="outline" size="sm" onClick={onApplyCoach}>Стать тренером</Button>
    )}
  </Card>
</div>
```

**API:**
- `GET /player/profile` + `GET /auth/me` + `GET /player/{id}/stats/overview` (для avatar_url) — на маунт.
- `POST /player/profile` с `{ analysis_role, about, training_goals, desired_rank_tier, desired_roles }`.
- `POST /auth/apply-coach` для CTA.

---

## `<SteamPanel>`

```
{!steamData.linked && (
  <Card title="Steam не привязан">
    <p>Привяжи Steam, чтобы видеть аналитику.</p>
    <Button variant="primary" onClick={onSteamLink} icon="steam">
      Привязать через Steam OpenID
    </Button>
    <Button variant="outline" onClick={onManualLink}>Ввести Steam ID вручную</Button>
  </Card>
)}

{steamData.linked && (
  <Card title="Steam-аккаунт">
    <Avatar src={steamData.avatar_url} fallbackText={steamData.personaname || 'S'} size={64} />
    <div>
      <h3>{steamData.personaname}</h3>
      <p>Steam ID: <code>{steamData.steam_id}</code></p>
      <RankBadge rankTier={steamData.rank_tier} />
      <p>Матчей: {steamData.matches_loaded} / {steamData.total_games}</p>
      <p>Последняя игра: {formatRelative(steamData.last_match_time)}</p>
    </div>
    <footer>
      <Button variant="outline" onClick={onRefresh}>Обновить</Button>
      <Button variant="ghost" onClick={onUnlink} disabled>Отвязать (через поддержку)</Button>
    </footer>
  </Card>
)}

<SyncStatusCard /> {/* фоновый прогресс deep-sync */}
```

**API:**
- `GET /player/steam-data` (на маунт).
- `onSteamLink`: `POST /auth/steam/link-intent` → `<a href="${AUTH_URL}/auth/steam/login?mode=link">`.
- `onManualLink`: модал с Steam ID → `POST /player/link-steam { steam_id, trusted: false }`.
- `onRefresh`: `POST /player/sync-steam` (force refetch).
- `GET /player/sync-status` для `<SyncStatusCard>`.

---

## `<GoalsPanel>`

```
<Card title="Цели">
  <FormGroup label="ЖЕЛАЕМЫЙ РАНГ">
    <Select value={desiredRank} options={RANKS}>...</Select>
  </FormGroup>
  <FormGroup label="ЖЕЛАЕМЫЕ РОЛИ" hint="Можно выбрать несколько">
    <RolePicker multi value={desiredRoles} onChange={...} />
  </FormGroup>
  <FormGroup label="ЦЕЛИ ТРЕНИРОВОК" hint="Опиши, что хочешь прокачать">
    <Textarea value={trainingGoals} maxLength={1000} />
  </FormGroup>
  <footer>
    <Button variant="primary" onClick={onSave}>Сохранить</Button>
  </footer>
</Card>
```

⚠ Progress bars "72% / 54% / 6/10" с PNG — УБРАНЫ (нет goal-tracking на бэке, REPLACEMENTS §10).

**API:** `POST /player/profile { desired_rank_tier, desired_roles, training_goals }`.

---

## `<SecurityPanel>`

```
<Card title="Сменить пароль">
  <FormGroup label="ТЕКУЩИЙ ПАРОЛЬ"><PasswordInput value={oldPwd} /></FormGroup>
  <FormGroup label="НОВЫЙ ПАРОЛЬ"><PasswordInput value={newPwd} hint="Минимум 8 символов" /></FormGroup>
  <Button variant="primary" onClick={onChangePassword}>Сохранить пароль</Button>
</Card>

<Card title="Сессии">
  <Button variant="danger" onClick={onLogoutAll}>Выйти на всех устройствах</Button>
</Card>

⚠ "Двухфакторная аутентификация" — УБРАНА (REPLACEMENTS §1).
⚠ "Сессии в Discord" — УБРАНО.
```

**API:**
- `POST /auth/change-password { old_password, new_password }`.
- `POST /auth/logout-all`.

## Замены

- **§3**: sidebar canonical.
- **§10**: убраны tabs "Уведомления", "Подписка"; "Дата рождения" поле; кнопка "Сменить аватар"; progress bars в Goals; 2FA toggle.
- **§16**: Avatar пользователя — `summary.avatar_url`. Fallback на initials в gradient.

## Acceptance

- [ ] Все 4 sub-tab переключаются без перезагрузки.
- [ ] Save кнопка disabled пока `!hasChanges`.
- [ ] Steam refresh показывает progress (через `/player/sync-status`).
- [ ] Логин в `coach_application_status` корректно показывается.
- [ ] Mobile: 2-col → 1-col стак.

## States

| State | Поведение |
|---|---|
| no Steam | Steam panel — `<EmptyState>` с CTA "Привязать" |
| sync in progress | `<SyncStatusCard>` с progress |
| save success | toast "Сохранено" |
| save validation error | inline errors под полями |
