# Auth Service

Сервис аутентификации, авторизации и работы с провайдером Steam.

## Назначение

- Регистрация и логин пользователей по email/паролю.
- Логин и привязка через **Steam OpenID 2.0**.
- Выдача JWT (access + refresh) и rotation refresh-токенов.
- Управление ролями: `PLAYER` / `COACH` / `ADMIN`.
- Lifecycle заявок на роль COACH (PENDING → APPROVED/REJECTED).
- Учёт согласия с Terms/Privacy (versioned consent).
- Принудительный массовый logout по флагу.

## Стек

- Python 3.11, FastAPI 0.115, SQLAlchemy 2.0
- PostgreSQL 16
- `pyjwt` 2.10 для подписи токенов
- `passlib[bcrypt]` 1.7 + `bcrypt` 4.2
- Steam OpenID 2.0 — реализован вручную в `app/steam_openid.py`
- httpx (для проверочных запросов к Steam OpenID)

См. полный список — `services/auth/requirements.txt`.

## Структура исходников

```
services/auth/
├── Dockerfile
├── requirements.txt
├── app/
│   ├── main.py            # FastAPI app, middleware, startup-хук
│   ├── config.py          # Settings из ENV (с обязательными переменными)
│   ├── database.py        # SQLAlchemy engine + sessionmaker
│   ├── models.py          # ORM-модели (auth_users, auth_sessions, ...)
│   ├── schemas.py         # Pydantic-схемы запросов/ответов
│   ├── security.py        # bcrypt, JWT, refresh-токены
│   ├── rate_limit.py      # In-memory rate limiter
│   ├── steam_openid.py    # OpenID 2.0 client (без сторонней библиотеки)
│   ├── seed_test_data.py  # Опциональный seed демо-аккаунтов
│   └── routers/
│       ├── auth.py        # Все базовые эндпоинты (/auth/*)
│       └── steam_auth.py  # Steam OpenID flow (/auth/steam/*)
└── tests/
    └── test_auth.py       # Pytest на ключевые сценарии
```

## Конфигурация

Полный список — в [../configuration.md](../configuration.md). Минимально обязательны:

| Переменная | Зачем |
|------------|-------|
| `DATABASE_URL` | Подключение к PostgreSQL |
| `JWT_SECRET` | Подпись access-токенов (обязательна, без default) |
| `JWT_ACCESS_EXPIRES_MIN` | TTL access (default 30) |
| `JWT_REFRESH_EXPIRES_DAYS` | TTL refresh (default 30) |
| `STEAM_OPENID_ENABLED` | Включает flow логина через Steam |
| `STEAM_RETURN_URL` / `STEAM_REALM` / `FRONTEND_STEAM_REDIRECT` | URL'ы для OpenID round-trip |
| `CORS_ORIGINS` | Разрешённые origin'ы фронта |
| `FORCE_REVOKE_ALL_SESSIONS` | One-shot инвалидизация всех сессий на старте |
| `SEED_TEST_DATA` | Создать демо-аккаунты при первом старте |

## Эндпоинты

### Базовая аутентификация

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `POST` | `/auth/register` | — | Регистрация. Принимает `consent_accepted=true`. Роль `COACH` записывается как PENDING-заявка, аккаунт создаётся как PLAYER |
| `POST` | `/auth/login` | — | Email + пароль. Возвращает access + refresh |
| `POST` | `/auth/refresh` | — (refresh) | Rotation: старый refresh инвалидируется, выдаётся новый access + refresh |
| `POST` | `/auth/logout` | access | Помечает текущую refresh-сессию как `revoked` |
| `POST` | `/auth/logout-all` | access | Помечает все активные сессии пользователя как `revoked` |
| `GET`  | `/auth/me` | access | Профиль текущего пользователя |
| `POST` | `/auth/change-password` | access | Смена пароля (требует старый, минимум 8 символов) |
| `POST` | `/auth/accept-consent` | access | Записать факт принятия конкретной версии Terms/Privacy |
| `POST` | `/auth/apply-coach` | access | Заявка на роль COACH (только для PLAYER) |
| `GET`  | `/health` | — | Healthcheck |

### Steam OpenID

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET`  | `/auth/steam/login` | — / cookie | Редирект на Valve. Параметры:<br>• `signup=coach` — стартовать поток как coach-application;<br>• `mode=link` — после возврата привязать Steam к авторизованному пользователю (требует cookie от `/steam/link-intent`);<br>• `consent=<version>` — версия принятых условий, переносится через round-trip |
| `GET`  | `/auth/steam/callback` | — | Возврат от Valve. Верифицирует подпись OpenID, выдаёт токены или линкует Steam, редиректит на фронт с фрагментом URL |
| `POST` | `/auth/steam/link-intent` | access | Выдаёт HMAC-cookie `steam_link_user_id`, авторизующую следующий round-trip на привязку |

Подробнее о cookies и подписях — в комментариях `services/auth/app/routers/steam_auth.py`.

### Привязка Steam (legacy/internal)

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET`  | `/auth/providers/steam` | access | Возвращает `{linked: bool, steam_id: str?}` для текущего пользователя |
| `POST` | `/auth/link-steam` | access | Прямая привязка по `steam_token` (legacy stub, в проде заменяется OpenID-flow выше) |

### Админка

Все эндпоинты требуют `role=ADMIN`.

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/auth/admin/users/{user_id}/role` | Сменить роль пользователя. Роли: `PLAYER`/`COACH`/`ADMIN`. Запрещено понижать последнего ADMIN |
| `GET`  | `/auth/admin/users-lite` | Список всех пользователей с привязанным `steam_id` (для join'ов в core) |
| `GET`  | `/auth/admin/coach-applications` | Список заявок (фильтр `?status=PENDING/APPROVED/REJECTED`) |
| `POST` | `/auth/admin/coach-applications/{user_id}/approve` | Одобрить заявку → роль становится COACH |
| `POST` | `/auth/admin/coach-applications/{user_id}/reject` | Отклонить заявку (статус → REJECTED) |

## Модель данных

См. [../data-model.md](../data-model.md), раздел **Auth domain**.

Ключевые таблицы:

- `auth_users` — учётные записи (роль, статус заявки, версия consent).
- `auth_sessions` — refresh-токены (хранятся хешированные через sha256).
- `auth_providers` — привязка Steam.
- `auth_roles` — справочник ролей (seed на старте).

## Безопасность

- Все пароли — `bcrypt`.
- Refresh-токены **никогда не хранятся в plain виде**, в БД лежит sha256-хеш. Сравнение `hmac.compare_digest`.
- Refresh-rotation: каждый `/auth/refresh` инвалидирует старую сессию и выдаёт новую (защита от reuse).
- Rate limit (in-memory) на `/register`, `/login`, `/refresh`.
- Security headers через middleware: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`.
- `JWT_SECRET` обязателен, без default — стартап падает с понятной ошибкой.
- `FORCE_REVOKE_ALL_SESSIONS=true` — массовая инвалидизация всех refresh-сессий на старте (используется при rollout-ах с изменением JWT-payload).
- Steam-cookies (`steam_signup_role`, `steam_link_user_id`, `steam_consent_version`) — HMAC-подписаны секретом `JWT_SECRET`, `HttpOnly`, `Secure`, `SameSite=Lax`, TTL = 10 минут.

## Тесты

```bash
cd services/auth
pytest tests/
```

Покрывают: register/login/refresh/logout, role checks, coach-application flow.
