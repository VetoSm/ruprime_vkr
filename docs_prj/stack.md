# Tech Stack

## Языки и runtime

- **Backend:** Python 3.11
- **Frontend:** TypeScript 5.7, ES2022
- **БД:** PostgreSQL 16
- **Контейнеризация:** Docker, docker-compose
- **Прокси (prod):** Nginx + Let's Encrypt

## Backend (общее для auth / core / ml / llm)

| Категория | Библиотека | Версия |
|-----------|------------|--------|
| HTTP-фреймворк | `fastapi` | 0.115.6 |
| ASGI-сервер | `uvicorn` | 0.34.0 |
| ORM | `sqlalchemy` | 2.0.36 |
| Драйвер PostgreSQL | `psycopg2-binary` | 2.9.10 |
| Валидация / схемы | `pydantic` (+`email-validator` в auth) | 2.10.4 |
| Парсинг multipart | `python-multipart` | 0.0.20 |
| HTTP-клиент (для межсервисных и внешних вызовов) | `httpx` | 0.28.1 |

## Auth-специфичное

| Категория | Библиотека | Версия |
|-----------|------------|--------|
| JWT | `pyjwt` | 2.10.1 |
| Хеш паролей | `passlib[bcrypt]` | 1.7.4 |
| Bcrypt-бэкенд | `bcrypt` | 4.2.1 |

Steam OpenID реализован вручную (`services/auth/app/steam_openid.py`) — без сторонней библиотеки, по спецификации OpenID 2.0 с `check_authentication`.

## ML-специфичное

| Категория | Библиотека | Версия |
|-----------|------------|--------|
| DataFrame | `pandas` | 2.2.3 |
| Численные операции | `numpy` | 2.2.1 |
| Модели | `scikit-learn` | 1.6.1 |
| Сохранение моделей | `joblib` | 1.4.2 |

## Frontend

| Категория | Библиотека | Версия |
|-----------|------------|--------|
| UI | `react`, `react-dom` | 18.3.1 |
| Сборка | `vite` | 6.0.5 |
| Плагин React для Vite | `@vitejs/plugin-react` | 4.3.4 |
| Компилятор | `typescript` | 5.7.2 |
| Маршрутизация | `react-router-dom` | 6.28.0 |
| HTTP-клиент | `axios` | 1.7.9 |
| Графики | `recharts` | 2.15.0 |

Без CSS-фреймворков: используется собственный тёмный stylesheet `services/frontend/src/ui/theme.css`. State management — встроенный React Context (`AuthContext`), без Redux/Zustand.

## Тестирование

- Backend: `pytest` для `auth` и `core` — изолированные тесты с in-memory SQLite override через FastAPI `dependency_overrides` (см. `services/auth/tests/`, `services/core/tests/`).
- Frontend: тестов нет (учебный проект).

## Инфраструктурные особенности

- **Нет ORM-миграций** (Alembic не используется). Схема создаётся автоматически + миграции выражены через `CREATE INDEX/COLUMN IF NOT EXISTS` в `startup`-хуках.
- **In-memory rate limiter** (`services/auth/app/rate_limit.py`, `services/core/app/rate_limit.py`) — без Redis, состояние теряется при рестарте. Для prod-нагрузки заменяется на Redis.
- **Background workers внутри ML-процесса:**
  - `match_collector` — фоновый сбор parsed-матчей из OpenDota. Стартует в `startup`
    при `AUTO_COLLECT_MATCHES=true` (по умолчанию `true`).
  - `auto_refresh` — периодическое обновление привязанных Steam-аккаунтов
    (default 24h). Управляется набором `AUTO_REFRESH_*` переменных, выключается
    флагом `AUTO_REFRESH_ENABLED=false`.
- **SSE-стрим прогресса импорта** — `GET /ml/admin/import-progress` отдаёт `text/event-stream`.

## Секреты и конфиги

Все настройки берутся из переменных окружения. Источники:
- Локально: файл `.env` в корне проекта.
- В Docker Compose: переменные пробрасываются явно (см. `docker-compose.yml`).

Полный список — в [configuration.md](./configuration.md).
