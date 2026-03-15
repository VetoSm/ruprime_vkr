## Сервис аутентификации и авторизации

## 1. Назначение сервиса

Сервис аутентификации отвечает за:
- регистрацию пользователей (игроки, тренеры, админы);
- вход по логину/паролю;
- выдачу и обновление JWT токенов (access + refresh);
- проверку текущего пользователя по токену (`/auth/me`);
- хранение базовой информации о ролях и статусе пользователей

Взаимодействие с другими сервисами:
- frontend получает/хранит access‑токен и передаёт его в заголовке `Authorization: Bearer <token>`;
- backend/core при каждом запросе проверяет токен локально (подпись и claims) и использует `sub`/`role` для авторизации;
- при необходимости backend может вызывать `/auth/me` или `/auth/introspect` для дополнительной проверки

## 2. Стек и инфраструктура

- Язык: Python 3.10+
- Framework: FastAPI
- БД: Postgres (общий кластер, но таблицы `auth_*` принадлежат auth‑сервису)
- Миграции: Alembic (желательно, но не обязательно для MVP)
- JWT: PyJWT или эквивалент, алгоритм HS256 (MVP), опционально RS256.
- Пароли: хеширование через bcrypt/argon2 (например, passlib + bcrypt).​
- Контейнеризация: отдельный Docker‑контейнер `auth-service`, конфигурация через переменные окружения (`AUTH_DB_URL`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_MIN`, и т.д.).

## 3. Модель данных и таблицы БД

## 3.1. Таблица `auth_users`

Назначение: хранение пользовательских аккаунтов и базовой информации.

Поля (Postgres):

- `id` (PK, serial / uuid) — уникальный идентификатор пользователя.
- `email` (varchar, unique, not null) — логин/почта.
- `password_hash` (varchar, not null) — хеш пароля (bcrypt/argon2).
- `role` (enum: `PLAYER`, `COACH`, `ADMIN`, default `PLAYER`) — роль.
- `is_active` (boolean, default true) — активен ли пользователь.
- `is_verified` (boolean, default false) — подтверждена ли почта (MVP можно оставить false, но не использовать).
- `created_at` (timestamp with time zone, default now)
- `updated_at` (timestamp with time zone, default now, on update)

Индексы:

- уникальный индекс по `email`.
- индекс по `role` (для админ‑панели).

## 3.2. Таблица `auth_sessions` (для refresh‑токенов)

Назначение: хранение активных refresh‑сессий.

Поля:

- `id` (PK, serial / uuid)
- `user_id` (FK → auth_users.id)
- `refresh_token` (varchar, unique, можно хранить хеш)
- `user_agent` (varchar, optional) — инфо о клиенте
- `ip_address` (varchar, optional)
- `expires_at` (timestamp with time zone, not null)
- `created_at` (timestamp with time zone, default now)
- `revoked` (boolean, default false)

Индексы:
- по `user_id`
- по `refresh_token`

3.3 Таблица `auth_roles`

**Поля:**

**Назначение:** хранит список доступных ролей и их базовое описание.

- `id` (PK, serial / uuid) — уникальный идентификатор роли.
- `name` (varchar, unique, not null) — системное имя роли:
    - `ADMIN`
    - `PLAYER`
    - `COACH`
- `description` (varchar, nullable) — человекочитаемое описание роли.
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now, on update)
Примеры записей:
- `ADMIN` — «Администратор системы, полный доступ к управлению пользователями, тренерами и настройками».
- `PLAYER` — «Игрок, может регистрировать аккаунт Dota 2, получать аналитику и рекомендации».
- `COACH` — «Тренер, может вести профиль тренера, принимать учеников, видеть аналитику учеников».

**Индексы:**
- уникальный индекс по `name`.

## 4 JWT и политика токенов

- Access‑токен:
    - срок жизни: 15–60 минут (MVP: 30 мин);
    - payload:
        - `sub`: user_id
        - `role`: роль пользователя
        - `exp`: время истечения
            
- Refresh‑токен:
    - срок жизни: 7–30 дней (MVP: 7 дней);
    - хранится в таблице `auth_sessions` (желательно в хешированном виде).
        

Секреты:
- `JWT_SECRET`: общий секрет (HS256) в MVP;
- `JWT_ALGORITHM`: `HS256`.​

## 5. API эндпоинты и логика

Все пути начинаются с `/auth`.

## 5.1. `POST /auth/register`

Назначение: создать нового пользователя.

**Вход (JSON):**

json

`{   "login": "userLogin",  "email": "user@example.com",  "password": "string-min-8",  "confirm password": "string-min-8", "role": "PLAYER" or "COACH"}`

**Шаги:**

1. Валидировать тело запроса (формат email, длина пароля).
2. Проверить, что `email` не занят. Не записывать пробелы, если пользователь нечаяно их поставил
3. Проверять что пароли введены одинаково
4. Проверять что логин не занят
5. Хешировать пароль (bcrypt/argon2).
6. Проверять пароль на пробелы, с ними не записывать.
7. Создать запись в `auth_users` с выбранной ролью.
8. Вернуть 201 + базовую информацию (без пароля).


**Выход (JSON):**

json
`{   "id": 1,  "email": "user@example.com",  "role": "PLAYER",  "is_active": true,  "is_verified": false,  "created_at": "..." }`

Ошибки
- 400 — неверные данные (неверный пароль, неверный email).
- 409 — пользователь с таким email уже существует. или логином

## 5.2. `POST /auth/login`

Назначение: аутентификация, выдача access + refresh токена.

**Вход (JSON):**
json

`{   "email": "user@example.com",  "password": "string" }`

**Шаги:**
1. Найти пользователя по email.
2. Проверить `is_active` (если false — 403).
3. Проверить пароль (сравнить с `password_hash`).
4. Сгенерировать access‑токен (JWT).
5. Сгенерировать refresh‑токен (случайная строка), сохранить в `auth_sessions` с `user_id`, `expires_at`, метаданными.
6. Вернуть оба токена.
    

**Выход (JSON):**

json

`{   "access_token": "jwt_string",  "refresh_token": "random_string",  "token_type": "bearer",  "expires_in": 1800 }`

Ошибки:
- 400 — неверные данные.
- 401 — неправильный email или пароль.
- 403 — пользователь деактивирован.
    

## 5.3. `POST /auth/refresh`

Назначение: обновить access‑токен по refresh‑токену.

**Вход (JSON):**

json

`{   "refresh_token": "random_string" }`

**Шаги:**

1. Найти запись в `auth_sessions` по `refresh_token` (или его хешу).
2. Проверить `revoked == false`.
3. Проверить `expires_at > now()`.
4. Получить `user_id`, найти пользователя, убедиться, что `is_active`.
5. Сгенерировать новый access‑токен.
6. (Опционально) сгенерировать новый refresh‑токен и инвалидировать старый.
7. Вернуть новый access (и refresh, если перегенерируем).​

## 5.4. `GET /auth/me`

Назначение: вернуть информацию о текущем пользователе по access‑токену.​

**Авторизация:** заголовок `Authorization: Bearer <access_token>`.

**Шаги:**

1. В middleware/зависимости FastAPI проверить подпись JWT и `exp`.
2. Извлечь `sub` (user_id) и `role`.
3. Найти пользователя в `auth_users`.
4. Вернуть профиль (без пароля).

**Выход (JSON):**

json

`{   "id": 1,  "email": "user@example.com",  "role": "PLAYER",  "is_active": true,  "is_verified": false }`

Ошибки:

- 401 — токен отсутствует или невалиден.
- 403 — пользователь деактивирован.

## 5.5. (Опционально) `POST /auth/logout`

Назначение: инвалидировать refresh‑токен (логаут с текущего устройства).

- По `refresh_token` выставить `revoked = true` в `auth_sessions`.
---
## 6. Требования к безопасности
- Пароли никогда не хранятся в открытом виде, только устойчивый хеш (bcrypt/argon2).​
- JWT подписывается секретом, лежащим только в переменных окружения/секретах, не в коде.
- Access‑токен имеет ограниченный срок жизни, refresh‑токены могут отозваться через таблицу `auth_sessions`.​
- Ограничение количества активных refresh‑сессий на пользователя (MVP: можно не делать, но описать как будущее улучшение).​

---

## 7. Базовые тест‑кейсы для сервиса

1. Регистрация:
    - успешная регистрация нового email;
    - попытка регистрации с уже существующим email → 409;
    - неверный email/короткий пароль → 400.
2. Логин:
    
    - успешный логин с корректным паролем;
    - логин с неверным паролем → 401;
    - логин неактивного пользователя → 403.
3. Refresh:
    
    - успешное обновление access‑токена по валидному refresh;
    - refresh с просроченным токеном → 401/403;
    - refresh с `revoked` → 401/403.

## Подключение Steam‑аккаунта к существующему пользователю

## 7. Endpoint: `POST /auth/link-steam`

**Назначение:** привязать Steam‑аккаунт к уже залогиненному пользователю.

**Авторизация:** требуется валидный access‑токен (`Authorization: Bearer <access_token>`).
**Вход (JSON):**
json
`{   "steam_token": "ticket_or_openid_response" }`
(В методологии можно описать обобщённо: «токен/код от Steam OpenID, который фронтенд получает после редиректа пользователя через Steam». )
**Шаги:**

1. Проверить access‑токен, получить `current_user_id`.[](https://jwt.io/introduction)​
2. Валидировать `steam_token` через Steam OpenID / Web API и получить `steam_id` (SteamID64).
3. Проверить в `auth_providers`, нет ли уже записи с `(provider='STEAM', provider_user_id=steam_id)` для **другого** пользователя:
    - если есть → 409 (этот Steam уже привязан к другому аккаунту сервиса).
4. Проверить, есть ли запись для `(user_id=current_user_id, provider='STEAM')`:
    - если есть → можно либо вернуть 200 и сказать, что уже привязан, либо обновить `provider_user_id` (если используешь возможность смены Steam).
5. Если привязки нет, создать запись в `auth_providers` с `user_id=current_user_id, provider='STEAM', provider_user_id=steam_id`.
6. Вернуть 200 с информацией о привязанном провайдере.

**Выход (JSON):**

json
`{   "provider": "STEAM",  "provider_user_id": "7656119...",  "linked": true }`
Ошибки:
- 400 — некорректный `steam_token`.
- 401 — пользователь не авторизован (нет/битый access‑токен).
- 409 — `steam_id` уже привязан к другому пользователю.

## 7.3. Использование данных из Steam

После успешной привязки:

- Auth‑сервис хранит связку `user_id ↔ steam_id` в `auth_providers`.
- Core/ML‑сервисы могут:
    - через `GET /auth/me` (или отдельный `GET /auth/providers`) получить список провайдеров текущего пользователя;
    - взять оттуда `steam_id` и использовать его для запросов к OpenDota/Steam API и расчёта фичей.

---

## 8. Выход из аккаунта (logout)
Нужно минимум два уровня:
1. **Logout на уровне текущей сессии** (один refresh‑токен).
2. (Опционально) logout со всех устройств.​
    
## 8.1. Endpoint: `POST /auth/logout`
**Назначение:** выйти с текущего устройства/сессии.
**Авторизация:** есть два варианта, в методологии можно описать оба:
- вариант A (упрощённый): logout только по access‑токену — на клиенте просто удаляется токен;
- вариант B (правильнее): передаётся `refresh_token`, и он помечается как отозванный в `auth_sessions`.
Рекомендуемый для тебя вариант B (так можно отрубать конкретную сессию):

**Вход (JSON):**

json

`{   "refresh_token": "random_string" }`

**Шаги:**

1. Найти запись в `auth_sessions` по `refresh_token` (или его хешу).
2. Если нет записи → 200/204 (idempotent: считаем, что уже разлогинен).
3. Проверить, что `user_id` совпадает с текущим пользователем по access‑токену (чтобы нельзя было вылогинить другого).
4. Установить `revoked = true`.[](https://curity.io/resources/learn/jwt-best-practices/)​
5. Вернуть 204 (без тела) или 200 с флагом `logged_out: true`.
**Выход (JSON, если 200):**

json

`{   "logged_out": true }`

## 8.2. (Опционально) `POST /auth/logout-all`

**Назначение:** инвалидировать все refresh‑токены пользователя.

**Авторизация:** по access‑токену.

**Шаги:**

1. Получить `current_user_id` из JWT.
2. Обновить все записи `auth_sessions` с `user_id=current_user_id`: `revoked = true`.[](https://curity.io/resources/learn/jwt-best-practices/)​
3. Вернуть 200.
