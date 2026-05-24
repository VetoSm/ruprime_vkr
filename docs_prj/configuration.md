# Configuration

Все сервисы конфигурируются через переменные окружения. Примером служит файл `.env.example` в корне репозитория.

Принципы:

- **Обязательные секреты** (`JWT_SECRET`, `ML_INTERNAL_TOKEN`) — сервис **отказывается стартовать**, если они пусты.
- **CORS** настраивается одной общей переменной `CORS_ORIGINS` (comma-separated, без пробелов).
- **Внутренние URL** между сервисами по умолчанию указывают на имена контейнеров (`http://auth:8001`, `http://ml:8003`, `http://llm:8004`).
- **`SEED_TEST_DATA=true`** имеет смысл выставлять только при первом запуске для наполнения демо-данными, потом обязательно вернуть `false`.

## Полный список переменных

### PostgreSQL

| Переменная | Назначение | Пример |
|------------|------------|--------|
| `POSTGRES_USER` | Имя пользователя БД | `dota_coach` |
| `POSTGRES_PASSWORD` | Пароль пользователя БД | (длинная случайная строка) |
| `POSTGRES_DB` | Имя БД | `dota_coach_db` |
| `POSTGRES_HOST` | Хост БД (для приложений) | `postgres` |
| `POSTGRES_PORT` | Порт БД | `5432` |
| `DATABASE_URL` | Полный URL для SQLAlchemy | `postgresql://USER:PASS@postgres:5432/dota_coach_db` |

### JWT (auth + core)

| Переменная | Обязательно | По умолчанию | Назначение |
|------------|:----------:|--------------|------------|
| `JWT_SECRET` | **да** | — | Ключ HMAC для подписи access-токенов |
| `JWT_ALGORITHM` | нет | `HS256` | Алгоритм подписи |
| `JWT_ACCESS_EXPIRES_MIN` | нет | `30` | TTL access-токена в минутах |
| `JWT_REFRESH_EXPIRES_DAYS` | нет | `30` | TTL refresh-токена в днях |
| `FORCE_REVOKE_ALL_SESSIONS` | нет | `false` | На старте `auth` помечает все активные сессии как `revoked` |

### Внутренние сервисы

| Переменная | Назначение |
|------------|------------|
| `ML_INTERNAL_TOKEN` | **Обязателен.** Общий секрет для `core ↔ ml` и `core ↔ llm`. Никогда не отдаётся фронту |
| `AUTH_SERVICE_URL` | URL auth-сервиса (default `http://auth:8001`) |
| `ML_SERVICE_URL` | URL ml-сервиса (default `http://ml:8003`) |
| `LLM_SERVICE_URL` | URL llm-сервиса (default `http://llm:8004`) |
| `CORE_SERVICE_URL` | URL core-сервиса (для интеграционных скриптов; в коде не обязателен) |

### Steam OpenID (auth)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `STEAM_OPENID_ENABLED` | `true` | Выключатель flow логина через Steam |
| `STEAM_RETURN_URL` | `http://localhost:8001/auth/steam/callback` | Куда Valve возвращает пользователя |
| `STEAM_REALM` | `http://localhost:8001/` | Realm для OpenID-проверки |
| `FRONTEND_STEAM_REDIRECT` | `http://localhost:3000/auth/steam-callback` | Финальный редирект из callback'а |

### Steam Web API (ml)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `STEAM_API_KEY` | пусто | Ключ для https://steamcommunity.com/dev/apikey. Без него работают только публичные профили |

### OpenDota (ml)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `OPENDOTA_API_KEY` | пусто | Поднимает лимит с 60 до 1200 RPM |
| `OPENDOTA_REQUEST_DELAY_SEC` | `1.4` | Пауза между запросами внутри одного sync. С ключом можно опускать |
| `PLAYER_DEEP_SYNC_MAX_MATCHES` | `500` | Макс. матчей для deep-sync игрока |
| `PLAYER_DEEP_SYNC_DETAILED_MATCHES` | `30` | Макс. detailed-матчей для deep-sync |
| `KAGGLE_DATA_PATH` | `/data/archive-2` | Путь к Kaggle CSV внутри контейнера ML |
| `AUTO_COLLECT_MATCHES` | `true` | Запуск фонового сборщика матчей в startup |
| `AUTO_REFRESH_ENABLED` | `true` | Включение демона `auto_refresh` (периодический deep-sync привязанных аккаунтов) |
| `AUTO_REFRESH_STALE_HOURS` | `24` | Порог «устаревания» строки в `player_accounts` |
| `AUTO_REFRESH_INTERVAL_SEC` | `86400` | Пауза между полными проходами `auto_refresh` |
| `AUTO_REFRESH_ENQUEUE_DELAY_SEC` | `15` | Пауза между двумя enqueue'ами в `auto_refresh` |
| `AUTO_REFRESH_FORCE_ON_START` | `true` | После рестарта однократно поставить в очередь все аккаунты |
| `INVALIDATE_ML_ANALYSES_ON_START` | `true` | Сброс кэша ml_analysis_id у профилей при рестарте core |

### LLM (llm)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `LLM_PROVIDER` | `openai` | Тип провайдера (поддерживается openai-compatible) |
| `LLM_API_KEY` | пусто | Ключ API. Без него — fallback на детерминированные шаблоны |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Можно указать свой URL (vLLM, локальный шлюз) |
| `LLM_MODEL` | `gpt-4o-mini` | Имя модели |
| `LLM_TIMEOUT_SEC` | `25` | Таймаут на запрос |
| `AI_CHAT_DAILY_LIMIT` | `20` | Дневной лимит сообщений на пользователя в core/ai_chat |

### CORS

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Whitelist origin'ов для всех сервисов |

### Frontend (build-time, через Vite)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `VITE_AUTH_API_URL` | `http://localhost:8001` | Адрес auth-сервиса для браузера |
| `VITE_CORE_API_URL` | `http://localhost:8002` | Адрес core-сервиса для браузера |

> ML-сервис намеренно недоступен из браузера — переменной `VITE_ML_API_URL` нет.

## Чек-лист продакшна

1. Сгенерировать длинные случайные значения для `JWT_SECRET` и `ML_INTERNAL_TOKEN` (≥ 64 байта).
2. Установить надёжный `POSTGRES_PASSWORD`.
3. Прописать реальный домен в `STEAM_RETURN_URL`, `STEAM_REALM`, `FRONTEND_STEAM_REDIRECT`.
4. Указать prod-домен в `CORS_ORIGINS` (только https).
5. Если используется AI-чат — выдать `LLM_API_KEY`. Иначе чат работает на шаблонном fallback'е.
6. Получить `OPENDOTA_API_KEY` (бесплатно), чтобы избежать упирания в 60 RPM.
7. `SEED_TEST_DATA=false`, `FORCE_REVOKE_ALL_SESSIONS=false`.
8. `archive-2/` смонтировать как `:ro` (см. `docker-compose.yml`).
