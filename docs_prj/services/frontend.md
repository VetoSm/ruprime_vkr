# Frontend

Single-page приложение на React + Vite + TypeScript. Тёмная тема в стилистике Dota 2. Используется для всех ролей: PLAYER, COACH, ADMIN, плюс публичные страницы.

## Назначение

- Регистрация и логин (email/пароль и Steam OpenID).
- Личный кабинет игрока: дашборд, статистика, список тренеров, заявки, расписание, AI-чат.
- Кабинет тренера: дашборд, профиль, расписание, отзывы.
- Админ-панель: пользователи, сессии, логи, импорт ML-данных, просмотр ML-таблиц.
- Публичные страницы: лендинг, лендинг для тренеров, About, Contacts, Privacy, Terms.

## Стек

- **React 18.3** + **TypeScript 5.7**
- **Vite 6.0** — dev-сервер и сборка
- **react-router-dom 6.28** — маршрутизация
- **axios 1.7** — HTTP-клиент
- **recharts 2.15** — графики
- **React Context** (`AuthContext`) — глобальное состояние сессии (без Redux/Zustand)
- Тёмная тема — собственный `theme.css` без UI-фреймворков

## Структура исходников

```
services/frontend/
├── Dockerfile
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public/                       # favicon, sitemap, robots, manifest
└── src/
    ├── main.tsx                  # entry
    ├── App.tsx                   # маршруты + ProtectedRoute + телеметрия
    ├── api/
    │   ├── client.ts             # axios-инстансы (auth, core), интерцепторы
    │   └── heroes.ts             # кэш справочника героев
    ├── store/
    │   └── AuthContext.tsx       # context + хук useAuth + silent refresh
    ├── ui/
    │   ├── theme.css             # глобальные стили
    │   ├── AppLayout.tsx         # layout для авторизованной зоны
    │   ├── PublicLayout.tsx      # layout для публичных страниц
    │   ├── ConsentGate.tsx       # модал «принять Terms/Privacy»
    │   ├── DotaPrivacyBanner.tsx # баннер про публичные данные Steam
    │   ├── SessionsCalendar.tsx  # календарь сессий
    │   ├── SkillRing.tsx         # круг прогресса
    │   ├── LandingSkillRing.tsx  # анимированный круг для лендингов
    │   ├── GameComponents.tsx    # игровые UI-элементы
    │   ├── Icons.tsx
    │   ├── SiteFooter.tsx
    │   └── AppErrorBoundary.tsx
    ├── pages/
    │   ├── Landing.tsx
    │   ├── CoachLanding.tsx
    │   ├── Login.tsx
    │   ├── Register.tsx
    │   ├── SteamAuthCallback.tsx
    │   ├── About.tsx
    │   ├── Contacts.tsx
    │   ├── Privacy.tsx
    │   ├── Terms.tsx
    │   ├── NotFound.tsx
    │   ├── player/
    │   │   ├── Dashboard.tsx
    │   │   ├── Profile.tsx
    │   │   ├── Stats.tsx
    │   │   ├── Coaches.tsx
    │   │   ├── Requests.tsx
    │   │   ├── Schedule.tsx
    │   │   └── AiChat.tsx
    │   ├── coach/
    │   │   ├── Dashboard.tsx
    │   │   ├── Profile.tsx
    │   │   ├── Schedule.tsx
    │   │   └── Reviews.tsx
    │   └── admin/
    │       ├── Dashboard.tsx
    │       ├── Users.tsx
    │       ├── UserDetail.tsx
    │       ├── Sessions.tsx
    │       ├── Logs.tsx
    │       ├── Import.tsx
    │       └── MlData.tsx
    └── utils/
        └── telemetry.ts          # trackEvent → POST /public/client-event
```

## Конфигурация

Build-time переменные (Vite):

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `VITE_AUTH_API_URL` | `http://localhost:8001` | Адрес auth-сервиса |
| `VITE_CORE_API_URL` | `http://localhost:8002` | Адрес core-сервиса |

> ML и LLM напрямую из браузера **не вызываются**. Все обращения идут через core.

## Маршрутизация

См. `src/App.tsx`. Маршруты делятся на 3 зоны:

### Публичные (PublicLayout)

| Путь | Страница |
|------|----------|
| `/` | Landing |
| `/login` | Login |
| `/register` | Register |
| `/about` | About |
| `/contacts` | Contacts |
| `/coach-landing` | CoachLanding |
| `/privacy` | Privacy |
| `/terms` | Terms |
| `/auth/steam-callback` | Финальный шаг Steam OpenID |

### PLAYER / COACH (ProtectedRoute, AppLayout)

| Путь | Доступ | Страница |
|------|--------|----------|
| `/dashboard` | PLAYER | Дашборд игрока |
| `/settings` | PLAYER, COACH | Профиль |
| `/stats` | PLAYER, COACH | Статистика |
| `/coaches` | PLAYER | Каталог тренеров |
| `/requests` | PLAYER | Заявки |
| `/schedule` | PLAYER | Расписание |
| `/ai-chat` | PLAYER, COACH | AI-чат |
| `/coach/dashboard` | COACH | Дашборд тренера |
| `/coach/profile` | COACH | Карточка тренера |
| `/coach/schedule` | COACH | Расписание тренера |
| `/coach/reviews` | COACH | Отзывы |

Legacy redirects: `/profile/player` → `/settings`, `/matchmaking` → `/coaches`.

### ADMIN

| Путь | Страница |
|------|----------|
| `/admin/dashboard` | Сводка |
| `/admin/users` | Пользователи |
| `/admin/users/:id` | Детали пользователя |
| `/admin/sessions` | Сессии и календарь |
| `/admin/logs` | Журнал действий |
| `/admin/ml-import` | Импорт Kaggle и тренировка моделей |
| `/admin/ml-data` | Просмотрщик ML-таблиц |

`ProtectedRoute` загружает текущего пользователя через `/auth/me`. Роль из JWT-payload недостаточна — данные подтверждаются API-запросом, чтобы реагировать на изменения роли в реальном времени.

## Аутентификация на клиенте

Реализована в `src/store/AuthContext.tsx` и `src/api/client.ts`:

1. После логина в localStorage сохраняются `access_token` и `refresh_token`.
2. `axios`-интерцептор подкладывает `Authorization: Bearer <access>` в каждый запрос.
3. На ответ 401 — выполняется silent refresh:
   - вызывается `POST /auth/refresh` с текущим refresh,
   - при успехе — повторяется исходный запрос,
   - при провале — пользователь отправляется на `/login`.
4. Через 30 минут (TTL access по умолчанию) refresh инициируется заранее по таймеру, чтобы не было flicker'а.
5. `logout` обнуляет хранилище и вызывает `POST /auth/logout`.

## Steam OpenID flow на клиенте

1. Кнопка «Войти через Steam» → `window.location = "{AUTH_URL}/auth/steam/login"`.
2. Valve редиректит на `{AUTH_URL}/auth/steam/callback`, callback после верификации делает 302 на `FRONTEND_STEAM_REDIRECT` с фрагментом `#access_token=...&refresh_token=...&steam_id=...`.
3. `SteamAuthCallback.tsx` парсит URL-фрагмент, кладёт токены в localStorage, переходит на дашборд.
4. Для привязки Steam к существующему аккаунту используется `POST /auth/steam/link-intent` (получает HMAC-cookie), затем `GET /auth/steam/login?mode=link`.

## Особенности

- **ConsentGate** — модальное окно: если у пользователя `consent_version` пуст или устарел, до использования закрытой зоны он должен принять текущие Terms/Privacy. Версия передаётся в `POST /auth/accept-consent`.
- **Telemetry** — каждое переключение страницы шлёт событие `page_view` через `POST /public/client-event` (анонимно, безопасно для не-залогиненного юзера).
- **Тёмная тема** жёстко зашита в `theme.css`, переключателя нет.
- **Без Service Worker / PWA** — обычный SPA.
- **Build:**
  ```bash
  cd services/frontend
  npm install
  npm run build
  npm run preview   # локальный smoke-тест собранной версии
  ```

## Безопасность на клиенте

- Токены хранятся в `localStorage` (учебный проект). Для продакшна с повышенными требованиями к XSS-защите — стоит мигрировать на `HttpOnly` cookies + CSRF-токен.
- Все формы валидируются на клиенте (минимальная длина пароля, корректный email), основная валидация — на сервере.
- ProtectedRoute не пропускает в защищённые зоны без user из контекста, а сам контекст не считается готовым, пока не отработал `/auth/me`.
- `Authorization` header отправляется только через axios-инстансы (`src/api/client.ts`), которые направлены на доверенные origin'ы (`VITE_AUTH_API_URL` / `VITE_CORE_API_URL`).
