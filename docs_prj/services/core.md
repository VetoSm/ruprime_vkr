# Core Service

Backend-for-Frontend (BFF) и центр доменной логики платформы. Все обращения фронта проходят через `core` (кроме самой авторизации, которая идёт напрямую в `auth`).

## Назначение

- Профили игрока (`PlayerProfile`) и тренера (`CoachProfile`).
- Привязка Steam через ML и поддержание актуальности данных игрока.
- Заявки на тренировку (`TrainingRequest`) и матчинг тренеров через ML.
- Жизненный цикл сессий (`TrainingSession`): план/завершение/перенос/отчёт.
- Отзывы (`CoachReview`) и расчёт рейтинга тренера.
- AI-чат (с историей и daily-лимитом), проксирование в `llm`.
- Админка: статистика, профили, заявки тренеров, журнал действий, импорт/анализ ML-данных.
- Прокси для всех ML-эндпоинтов (с добавлением `X-Internal-Token`).

## Стек

- Python 3.11, FastAPI 0.115, SQLAlchemy 2.0
- PostgreSQL 16
- `httpx` для синхронных и async вызовов в auth/ml/llm
- Без отдельных библиотек авторизации — JWT валидируется тем же `JWT_SECRET`, что и в `auth`

См. `services/core/requirements.txt`.

## Структура исходников

```
services/core/
├── Dockerfile
├── requirements.txt
├── app/
│   ├── main.py             # FastAPI app, middleware, startup-миграции
│   ├── config.py           # Settings (DATABASE_URL, JWT_SECRET, ML_INTERNAL_TOKEN, ...)
│   ├── database.py         # engine + sessionmaker
│   ├── dependencies.py     # get_current_user, require_role
│   ├── ml_client.py        # httpx клиент к ML с X-Internal-Token
│   ├── models.py           # CoreUser, PlayerProfile, CoachProfile, ...
│   ├── schemas.py          # Pydantic-схемы
│   ├── rate_limit.py       # In-memory limiter
│   ├── seed_test_data.py
│   └── routers/
│       ├── me.py           # /me/overview
│       ├── player.py       # /player/* (профиль, link-steam, sync)
│       ├── coach.py        # /coach/* (профиль, список, students)
│       ├── matchmaking.py  # /matchmaking/* (заявки, рекомендации)
│       ├── sessions.py     # /training-sessions/*, /coach-reviews
│       ├── ai_chat.py      # /ai/chat, /ai/history
│       ├── stats.py        # /player/{id}/stats/*, /features
│       ├── ml_proxy.py     # Тонкий прокси к ml-сервису
│       ├── admin.py        # /admin/*
│       └── public.py       # /public/client-event (телеметрия)
└── tests/
    └── test_core.py
```

## Конфигурация

| Переменная | Зачем |
|------------|-------|
| `DATABASE_URL` | Общая БД с auth и ml |
| `JWT_SECRET` | Должен совпадать с auth-сервисом |
| `JWT_ALGORITHM` | По умолчанию `HS256` |
| `AUTH_SERVICE_URL` | `http://auth:8001` |
| `ML_SERVICE_URL` | `http://ml:8003` |
| `LLM_SERVICE_URL` | `http://llm:8004` |
| `ML_INTERNAL_TOKEN` | Обязателен. Используется для всех вызовов в ML |
| `AI_CHAT_DAILY_LIMIT` | По умолчанию 20 сообщений в день на пользователя |
| `INVALIDATE_ML_ANALYSES_ON_START` | Сбрасывает `ml_analysis_id` у профилей при рестарте (default true) |
| `SEED_TEST_DATA` | Создание демо-профилей при первом старте |
| `CORS_ORIGINS` | Whitelist origin'ов |

## Эндпоинты

### Текущий пользователь

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET` | `/me/overview` | access | Сводка под роль текущего пользователя |
| `GET` | `/health` | — | Healthcheck |

### Игрок

Префикс `/player`.

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET`  | `/player/profile` | access | Получить свой профиль |
| `POST` | `/player/profile` | access | Создать/обновить профиль |
| `POST` | `/player/link-steam` | access | Привязать Steam (через ML, добавляет account_id) |
| `POST` | `/player/sync-steam` | access | Запустить sync OpenDota данных |
| `POST` | `/player/refresh-steam` | access | Принудительный refresh профиля |
| `GET`  | `/player/sync-status` | access | Статус фоновой догрузки |
| `GET`  | `/player/steam-data` | access | Текущие данные из OpenDota |

### Тренер

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET`  | `/coach/profile` | access | Свой coach-профиль |
| `POST` | `/coach/profile` | access | Создать/обновить coach-профиль |
| `GET`  | `/coaches` | access | Публичный список тренеров с фильтрами |
| `GET`  | `/coach/students-overview` | COACH | Сводка по своим ученикам и сессиям |

### Матчинг

Префикс `/matchmaking`.

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `POST`  | `/matchmaking/requests` | access | Создать заявку. Тут же вызывает ML за ranking тренеров |
| `POST`  | `/matchmaking/recommend-preview` | access | Превью рекомендаций без создания заявки |
| `GET`   | `/matchmaking/requests/my` | access | Мои заявки |
| `PATCH` | `/matchmaking/requests/{request_id}` | access | Сменить статус (CANCEL/ACCEPT и т.д.) |

### Сессии и отзывы

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET`   | `/training-sessions/my` | access | Сессии текущего пользователя |
| `PATCH` | `/training-sessions/{session_id}` | access | Изменить (reschedule/cancel/complete) |
| `POST`  | `/training-sessions/{session_id}/report` | COACH | Загрузить отчёт по сессии |
| `POST`  | `/coach-reviews` | PLAYER | Оставить отзыв |
| `GET`   | `/coach/{coach_id}/reviews` | access | Публичные отзывы тренера |

### AI-чат

Префикс `/ai`.

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `POST` | `/ai/chat` | access | Сообщение → проксируется в LLM с контекстом игрока. Учитывает дневной лимит |
| `GET`  | `/ai/history` | access | История диалогов |

### Статистика игрока

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET` | `/player/{player_id}/stats/overview` | access | Сводка |
| `GET` | `/player/{player_id}/features` | access | Feature-сравнение с baseline |
| `GET` | `/player/{player_id}/detailed-features` | access | Подробная разбивка по 8 категориям |

### Публичная телеметрия

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `POST` | `/public/client-event` | — | Приём произвольных клиентских событий (page_view и т.п.) |

### Админка

Префикс `/admin`. Все требуют `role=ADMIN`.

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET`   | `/admin/stats` | Сводка по системе |
| `GET`   | `/admin/profiles` | Профили игроков и тренеров |
| `GET`   | `/admin/users` | Список пользователей |
| `PATCH` | `/admin/users/{user_id}` | Изменить пользователя (роль и т.п.) — проксирует в `auth` |
| `GET`   | `/admin/users-full` | Расширенный список с join'ами auth+core+ml |
| `GET`   | `/admin/users/{auth_user_id}/detail` | Детальная карточка пользователя |
| `GET`   | `/admin/logs` | Журнал действий из `core_action_logs` (фильтр `?action_type=`) |
| `GET`   | `/admin/db-view/{table_name}` | Защищённый просмотрщик произвольной таблицы (только из whitelist) |
| `GET`   | `/admin/coach-applications` | Список заявок на роль COACH (проксирует в auth) |
| `POST`  | `/admin/coaches/{auth_user_id}/verify` | Подтвердить тренера |
| `POST`  | `/admin/coaches/{auth_user_id}/reject` | Отклонить заявку |
| `POST`  | `/admin/coaches/{auth_user_id}/unverify` | Скрыть тренера из публичного каталога без отзыва роли |
| `POST`  | `/admin/users/{auth_user_id}/role` | Сменить роль (PLAYER/COACH/ADMIN). При повышении до COACH автоматически создаёт `CoachProfile` с `is_verified=true`; при понижении — снимает флаг |
| `POST`  | `/admin/steam/{account_id}/refresh` | Принудительный deep-sync одного Steam/Dota аккаунта через ML |
| `POST`  | `/admin/backfill/players` | Перезапустить ML-link для всех игроков с привязанным Steam (фоновая очередь) |
| `POST`  | `/admin/ml-import` | Триггер импорта Kaggle-данных через ML |
| `GET`   | `/admin/ml-data/stats` | Сводка ML-таблиц (количество строк) |
| `GET`   | `/admin/ml-data/table/{table_name}` | Просмотр строк ML-таблицы |
| `GET`   | `/admin/ml-data/baselines` | Просмотр baseline'ов |
| `GET`   | `/admin/ml-data/analyses` | Список последних аналитик игроков |
| `GET`   | `/admin/ml-data/player-accounts` | Список привязанных Steam-аккаунтов |
| `GET`   | `/admin/ml-data/player-account-detail/{account_id}` | Детали одного аккаунта |

### ML proxy

Префикс — без префикса (mounting напрямую). Все требуют `role=ADMIN`, кроме `/ml/heroes`.

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET`  | `/ml/heroes` | Каталог героев (для фронт-кэша) |
| `POST` | `/admin/ml/start-import` | Запуск асинхронного импорта Kaggle |
| `POST` | `/admin/ml/cancel-import` | Отмена |
| `GET`  | `/admin/ml/import-status` | Текущий статус |
| `GET`  | `/admin/ml/import-progress` | SSE-стрим прогресса |
| `POST` | `/admin/ml/load-constants` | Загрузить heroes/items/abilities |
| `POST` | `/admin/ml/compute-baselines` | Пересчитать baseline'ы |
| `POST` | `/admin/ml/train-mmr-model` | Тренировка модели MMR |
| `POST` | `/admin/ml/start-training` | Async-вариант тренировки |
| `GET`  | `/admin/ml/training-status` | Прогресс тренировки |

## Модель данных

См. [../data-model.md](../data-model.md), раздел **Core domain**.

Ключевые сущности и их жизненный цикл:

- `TrainingRequest.status`: `NEW` → `MATCHING` → `WAITING_CONFIRMATION` → `ACCEPTED` (или `REJECTED`/`CANCELLED`).
- `TrainingSession.status`: `PLANNED` → `COMPLETED` (или `CANCELLED`/`RESCHEDULED`).
- `CoachApplication` (хранится в `auth_users`): `NONE` → `PENDING` → `APPROVED`/`REJECTED`.

Уникальные ограничения, создаваемые в `startup`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_player_profiles_steam_id_nonempty
  ON player_profiles (steam_id) WHERE steam_id IS NOT NULL AND steam_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_player_profiles_dota_account_id_nonempty
  ON player_profiles (dota_account_id) WHERE dota_account_id IS NOT NULL AND dota_account_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_training_requests_active_same_scope
  ON training_requests (player_profile_id, COALESCE(desired_role, ''), COALESCE(focus_area, ''))
  WHERE status IN ('NEW','MATCHING','WAITING_CONFIRMATION','ACCEPTED');
```

## Взаимодействие с другими сервисами

```
frontend ─▶ core
                ├─▶ auth      (валидация JWT, role-чек, list users)
                ├─▶ ml        (X-Internal-Token, sync, аналитика, ranking)
                └─▶ llm       (X-Internal-Token, /chat, /advice)
```

- `core` доверяет `auth` в части ролей: на каждом запросе декодирует JWT и подгружает пользователя из общей БД.
- При обращении в `ml` обязательно добавляется заголовок `X-Internal-Token: <ML_INTERNAL_TOKEN>` (см. `app/ml_client.py`).

## Безопасность

- Те же security headers, что и в auth (без `Cache-Control`).
- Все админ-эндпоинты требуют `role=ADMIN`, проверка идёт через `dependencies.require_role`.
- Просмотрщик БД ограничен whitelist'ом таблиц.
- Telemetry (`/public/client-event`) — анонимный, лимитируется по IP.

## Тесты

```bash
cd services/core
pytest tests/
```
