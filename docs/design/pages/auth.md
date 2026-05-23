# Auth — Login + Register + SteamCallback

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_auth.png` (две карточки бок-о-бок) |
| **Код** | `Login.tsx`, `Register.tsx`, `SteamAuthCallback.tsx` |
| **Layout** | `<PublicLayout>` |
| **Routes** | `/login`, `/register`, `/auth/steam-callback` |
| **Доступ** | guest only (`user` → redirect через `<Navigate />` в `App.tsx`) |

## Глобальная композиция страниц

Обе формы — центральная карточка `<AuthCard>` на тёмном фоне с декоративными hero-силуэтами.

```
<PublicLayout>
  <main className="auth-page">
    + decor: ::before slot — <img src={decorRender('auth.left')} className="auth-decor auth-decor--left" aria-hidden />
    + decor: ::after slot  — <img src={decorRender('auth.right')} className="auth-decor auth-decor--right" aria-hidden />

    <div className="auth-card">
      ... контент формы ...
    </div>
  </main>
</PublicLayout>
```

CSS-фолбэк: при недоступности картинок остаётся базовый `radial-gradient(ellipse at top, rgba(0,212,170,0.03), transparent 60%)` из существующего `theme.css`.

---

## Login (`/login`)

```
<Logo /> (центр, cyan glow)
<h2>Вход в RuPrime</h2>
<p className="text-muted">С возвращением, чемпион</p>

<SteamLoginButton fullWidth>            ← см. REPLACEMENTS §1: центрированная, занимает всю ширину
  <SteamIcon /> Войти через Steam →
</SteamLoginButton>

<Divider>или почтой</Divider>

<form onSubmit={handleEmailLogin}>
  <FormGroup label="EMAIL">
    <TextInput type="email" name="email" required />
  </FormGroup>
  <FormGroup label="ПАРОЛЬ">
    <PasswordInput name="password" required />
  </FormGroup>
  <a className="text-cyan" href="#">Забыли пароль?</a>   ← оставить, ведёт на /contacts пока нет flow
  <Button variant="primary" type="submit" fullWidth>Войти →</Button>
</form>

<p>Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
```

**API:**
- `<SteamLoginButton>` → `<a href="${AUTH_URL}/auth/steam/login">` (не axios!)
- `<form>` → `POST /auth/login` → `{ access_token, refresh_token }` → `saveTokens()` → redirect на `defaultRouteForRole(user.role)`

**Замены:**
- ❌ Кнопка Discord — **убрана**. Иконка Discord — toolkit-only, не используется.
- 🎯 Steam-кнопка занимает всю ширину контентной области карточки.

---

## Register (`/register`)

```
<Logo />
<h2>Регистрация</h2>
<p className="text-muted">Создай аккаунт за 30 секунд</p>

<SteamLoginButton fullWidth onClick={() => onSteamRegister('player')}>
  <SteamIcon /> Зарегистрироваться через Steam →
</SteamLoginButton>
<SteamLoginButton variant="outline" fullWidth onClick={() => onSteamRegister('coach')}>
  Я тренер →
</SteamLoginButton>

<Divider>или почтой</Divider>

<form onSubmit={handleRegister}>
  <RolePickerToggle value={role} onChange={setRole}>
    <option value="PLAYER">Я игрок</option>
    <option value="COACH">Я тренер</option>
  </RolePickerToggle>

  <FormGroup label="НИКНЕЙМ"><TextInput name="login" /></FormGroup>
  <FormGroup label="EMAIL"><TextInput type="email" name="email" /></FormGroup>
  <FormGroup label="ПАРОЛЬ"><PasswordInput name="password" /></FormGroup>
  <FormGroup label="ПОВТОРИ ПАРОЛЬ"><PasswordInput name="confirm_password" /></FormGroup>

  <ConsentCheckbox>
    Согласен с <Link to="/terms">условиями</Link> и <Link to="/privacy">политикой конфиденциальности</Link>
  </ConsentCheckbox>

  <Button variant="primary" type="submit" fullWidth disabled={!consent}>Создать аккаунт →</Button>
</form>

<p>Уже есть аккаунт? <Link to="/login">Войти</Link></p>
```

**API:**
- `onSteamRegister(role)` → редирект на `${AUTH_URL}/auth/steam/login?signup=${role}&consent=v1`.
- Email-form → `POST /auth/register` с `{ login, email, password, confirm_password, role, consent_accepted: true, consent_version: "v1" }`. Бэкенд ВСЕГДА создаёт `role=PLAYER`; если в форме выбран `COACH` — создаётся как PLAYER с `coach_application_status=PENDING`.

**Замены:**
- ❌ Discord-кнопка — убрана.
- ❌ Поле "Steam ID" в форме — убрано (Steam привязывается через OpenID, а не вводом строкой).
- ✅ Сохранили role-picker, но добавили **второй Steam-CTA** для "Я тренер" — как самый быстрый путь (один клик).

---

## SteamAuthCallback (`/auth/steam-callback`)

Это **технический экран**, не имеет своего макета. Парсит hash-параметры из URL (`#access_token=...&refresh_token=...&steam_id=...&coach_application=pending`), сохраняет токены и редиректит:

```
useEffect(() => {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const error = params.get('error');
  if (error) {
    toast.error(translateSteamError(error));
    navigate('/login');
    return;
  }

  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  const steamId = params.get('steam_id');
  const linked = params.get('linked') === '1';
  const coachApp = params.get('coach_application');

  if (access && refresh) {
    saveTokens(access, refresh);
    // фоновая привязка PlayerProfile в Core
    coreApi.post('/player/link-steam', { steam_id: steamId, trusted: true }).catch(() => {});
    if (coachApp === 'pending') toast.success('Заявка тренера отправлена!');
    refreshAuthContext().then(() => navigate('/dashboard'));
  } else if (linked && steamId) {
    coreApi.post('/player/link-steam', { steam_id: steamId, trusted: true });
    toast.success('Steam привязан');
    navigate('/settings');
  } else {
    navigate('/login');
  }
}, []);
```

Визуально — спиннер + "Завершаем вход через Steam...".

**Замены:** —

---

## Компоненты из TOOLKIT

🟢 `Logo`, `SteamLoginButton`, `TextInput`, `PasswordInput`, `FormGroup`, `Button primary`, `ConsentCheckbox`, `RolePickerToggle`, `Divider`, `Avatar` (нет), декор: `decorRender('auth.left'|.right')`.

🟡 toolkit-only (не используется на этой странице): `<DiscordIconButton>`, `<TwoFactorToggle>`.

## Acceptance criteria

- [ ] Steam-кнопка занимает всю ширину контентного блока.
- [ ] Discord-кнопка **отсутствует** в DOM.
- [ ] Email/Password form работает, валидация на клиенте.
- [ ] Consent checkbox обязателен для регистрации.
- [ ] Декоративные hero-renders по краям с `opacity ≤ 0.22` и `aria-hidden`.
- [ ] При успехе redirect на `defaultRouteForRole`.
- [ ] При `steam_auth_failed` / `steam_disabled` — понятный toast.
- [ ] Mobile (< 480px) — карточка занимает 100% ширины с отступами.

## States

| State | Поведение |
|---|---|
| default | форма |
| submitting | кнопка disabled + spinner |
| email_taken (409) | error pod input "Email уже используется" |
| login_failed (401) | banner "Неверный email или пароль" |
| network | banner с retry |
| steam_disabled (от callback) | `<Alert>` "Steam OAuth временно недоступен" |
