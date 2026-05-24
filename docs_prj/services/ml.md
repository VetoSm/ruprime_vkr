# ML Service

Сервис аналитики и матчинга. **Internal-only**: не имеет публичного порта в `docker-compose.yml`, доступ — только из Docker-сети с заголовком `X-Internal-Token`.

## Назначение

- Загрузка Kaggle-датасета (Pro League 2024–2025) → формирование сырых таблиц `ml_raw_*`.
- Загрузка справочников OpenDota: герои, предметы, способности.
- Расчёт **baseline-статистики** по `(MMR-band × hero × role)`: средние и перцентили (p25/p50/p75/p90/p95).
- **Feature engineering**: 8 категорий метрик с нормализацией Score 0–10 и gap-анализом.
- **Real-time sync** игроков через OpenDota API (профиль, матчи, totals) и Steam Web API (резерв).
- **MMR-оценка**: ранг игрока по агрегированным фичам (тренировка scikit-learn).
- **Coach matching**: ранжирование тренеров по совпадению ролей и MMR.
- Фоновые воркеры: сборщик parsed-матчей и периодический refresh привязанных аккаунтов.

## Стек

- Python 3.11, FastAPI, SQLAlchemy 2.0
- PostgreSQL 16
- `pandas` 2.2, `numpy` 2.2 — feature engine
- `scikit-learn` 1.6 — MMR-модель
- `joblib` 1.4 — сохранение модели
- `httpx` — клиенты OpenDota и Steam Web API
- SSE через стандартные средства FastAPI

## Структура исходников

```
services/ml/
├── Dockerfile
├── requirements.txt
├── app/
│   ├── main.py                 # FastAPI app, routers с принудительным X-Internal-Token
│   ├── config.py
│   ├── database.py
│   ├── models.py               # ml_raw_*, ml_constants_*, ml_kaggle_baselines, ...
│   ├── schemas.py
│   ├── internal_auth.py        # require_internal_token dependency
│   ├── csv_loader.py           # Kaggle CSV → ml_raw_*
│   ├── feature_engine.py       # Расчёт фич и Score 0-10
│   ├── detailed_features.py    # Детализация по 8 категориям
│   ├── mmr_estimator.py        # Тренировка/инференс MMR-модели
│   ├── opendota_client.py      # HTTP клиент OpenDota
│   ├── steam_web_api.py        # Резервный путь через Steam Web API
│   ├── player_sync_manager.py  # Оркестрация sync игрока
│   ├── match_collector.py      # Background-сборщик parsed-матчей
│   ├── auto_refresh.py         # Периодический refresh всех linked Steam-аккаунтов
│   ├── import_manager.py       # Async-импорт CSV (с прогрессом и SSE)
│   ├── training_manager.py     # Async-тренировка модели
│   └── routers/
│       ├── admin.py            # /ml/admin/* (импорт, тренировка, baseline)
│       ├── analysis.py         # /ml/* (профиль игрока, аналитика, link-steam)
│       ├── matching.py         # /ml/match-coaches
│       └── data_view.py        # /ml/data/* (просмотрщик ML-таблиц)
└── tests/
```

## Конфигурация

| Переменная | Зачем |
|------------|-------|
| `DATABASE_URL` | Общая БД |
| `ML_INTERNAL_TOKEN` | **Обязателен.** Без него любой запрос вернёт 401 |
| `KAGGLE_DATA_PATH` | Путь к CSV внутри контейнера (`/data/archive-2`) |
| `STEAM_API_KEY` | Опционально — расширяет покрытие закрытых профилей |
| `OPENDOTA_API_KEY` | Опционально — лимит 60 → 1200 RPM |
| `OPENDOTA_REQUEST_DELAY_SEC` | Пауза между OpenDota-запросами в одном sync (default 1.4) |
| `PLAYER_DEEP_SYNC_MAX_MATCHES` | Cap для deep-sync (default 500) |
| `PLAYER_DEEP_SYNC_DETAILED_MATCHES` | Сколько матчей подгружать с детализацией (default 30) |
| `AUTO_COLLECT_MATCHES` | Запуск фонового сборщика на старте (default true) |
| `CORS_ORIGINS` | На случай прямого доступа из сети разработки |

## Эндпоинты

> Все вызовы требуют заголовок `X-Internal-Token: <ML_INTERNAL_TOKEN>`. В обычной работе клиент — это `core`, фронт сюда не ходит.

### Админ / импорт (префикс `/ml/admin`)

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/ml/admin/start-import` | Async-импорт CSV (`{directory_path}` или `"all"`) |
| `POST` | `/ml/admin/cancel-import` | Прервать текущий импорт |
| `GET`  | `/ml/admin/import-progress` | SSE-стрим прогресса (`text/event-stream`) |
| `GET`  | `/ml/admin/import-status` | Текущий статус (без SSE) |
| `POST` | `/ml/admin/load-kaggle-data` | Sync-импорт одной директории |
| `POST` | `/ml/admin/load-all-data` | Sync-импорт всех директорий |
| `POST` | `/ml/admin/load-constants` | Загрузить heroes/items/abilities из OpenDota |
| `POST` | `/ml/admin/compute-baselines` | Пересчитать `ml_kaggle_baselines` |
| `POST` | `/ml/admin/recompute-baselines` | Алиас для пересчёта |
| `POST` | `/ml/admin/train-mmr-model` | Sync-тренировка MMR-модели |
| `POST` | `/ml/admin/start-training` | Async-тренировка с прогрессом |
| `GET`  | `/ml/admin/training-status` | Прогресс тренировки |
| `POST` | `/ml/admin/collector-start` | Запустить фоновый сборщик parsed-матчей |
| `POST` | `/ml/admin/collector-stop` | Остановить |
| `GET`  | `/ml/admin/collector-status` | Статус сборщика |
| `POST` | `/ml/admin/request-parse` | Запросить parse конкретных match_id'ов в OpenDota |

### Аналитика игрока (префикс `/ml`)

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/ml/link-steam-account` | Привязать Steam, поднять профиль из OpenDota, запустить deep-sync |
| `POST` | `/ml/refresh-player-data/{account_id}` | Принудительный refresh |
| `GET`  | `/ml/player-sync-status/{account_id}` | Статус фоновой догрузки |
| `GET`  | `/ml/player-account/{account_id}` | Сохранённые данные аккаунта |
| `GET`  | `/ml/player-analysis/{analysis_id}` | Получить snapshot аналитики |
| `GET`  | `/ml/analyze-player/{account_id}` | Запустить анализ и вернуть результат |
| `GET`  | `/ml/detailed-features/{account_id}` | Подробная разбивка по 8 категориям |
| `GET`  | `/ml/heroes` | Каталог героев |
| `GET`  | `/ml/debug/steam-web/{steam_id}` | Live-проба Steam Web API (для админа) |

### Матчинг

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/ml/match-coaches` | Ранжирование тренеров под цели игрока |

### Просмотр данных (префикс `/ml/data`)

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/ml/data/stats` | Сводка по всем ML-таблицам |
| `GET` | `/ml/data/table/{table_name}` | Просмотр строк таблицы (limit/offset) |
| `GET` | `/ml/data/baselines` | Просмотр baseline'ов (фильтр `?mmr_band=`) |
| `GET` | `/ml/data/baselines/mmr-bands` | Список доступных MMR-бэндов |
| `GET` | `/ml/data/analyses` | Последние аналитики |
| `GET` | `/ml/data/player-accounts` | Привязанные аккаунты |
| `GET` | `/ml/data/player-account-detail/{account_id}` | Детали аккаунта (профиль + матчи + анализ) |

### Health и static

| Метод | Путь | Auth | Назначение |
|-------|------|------|------------|
| `GET` | `/health` | — | Healthcheck (включая статус сборщика) |
| `GET` | `/ml/images/<file>` | — | Статика иконок героев из Kaggle (если папка есть на диске) |

## Модель данных

См. [../data-model.md](../data-model.md), раздел **ML domain**.

Краткая структура:

| Таблица | Назначение |
|---------|------------|
| `ml_raw_matches` | Сырые матчи Kaggle |
| `ml_raw_players` | Сырая статистика игрока в матче (50+ полей) |
| `ml_raw_teams` | Команды |
| `ml_raw_picks_bans` | Драфт |
| `ml_constants_heroes` / `_items` / `_abilities` | Справочники OpenDota |
| `ml_kaggle_baselines` | Агрегаты `(mmr_band × hero × role)`: средние + percentiles JSON |
| `ml_player_analyses` | Snapshot аналитики (summary, trends, weaknesses_ranked, ...) |
| `player_accounts` | Профиль OpenDota (lifetime_games, parsed_games_n, средние totals) |
| `player_matches` | Матчи игрока. Уникальность `(account_id, match_id)` |

## Feature engineering — общая логика

1. Из `player_matches` для конкретного `account_id` рассчитываются агрегаты по последним N матчам (с разбивкой по hero/role).
2. Для каждой категории берутся метрики игрока и сравниваются с `ml_kaggle_baselines` соответствующего `(mmr_band, hero, role)`.
3. Каждая метрика нормализуется в Score 0–10 (через перцентили из baseline).
4. Категории: Farming, Aggression, Vision, Survivability, Lane, Macro, Tempo, Mid-game (точные определения — в `app/feature_engine.py` и `app/detailed_features.py`).
5. Считается **gap = target − score**, ранжируется список слабостей и сильных сторон.
6. Snapshot сохраняется в `ml_player_analyses` с уникальным `analysis_id`. Этот id потом цепляется к `player_profiles.ml_analysis_id`.

## MMR-оценка

- На вход — агрегированные фичи игрока.
- Модель: scikit-learn (см. `mmr_estimator.py`).
- Артефакт сохраняется через `joblib` в файловой системе контейнера.
- Тренируется на собранной выборке Kaggle + размеченных профилях (целевая переменная — `rank_tier`).
- Возвращает `estimated_mmr` и `mmr_band`.

## Фоновые процессы

При старте сервиса:

- **`match_collector`** — собирает parsed-матчи из OpenDota пакетами, обновляет
  `player_matches`. Стартует, если `AUTO_COLLECT_MATCHES=true` (по умолчанию `true`).
  Логи и статистика доступны через `GET /ml/admin/collector-status`.
- **`auto_refresh`** — раз в `AUTO_REFRESH_INTERVAL_SEC` секунд (default 24 часа)
  обходит `player_accounts` и для устаревших (`fetched_at` старше
  `AUTO_REFRESH_STALE_HOURS`) ставит deep-sync через `player_sync_manager`. Между
  enqueue'ами выдерживается `AUTO_REFRESH_ENQUEUE_DELAY_SEC` (15 сек). Выключается
  через `AUTO_REFRESH_ENABLED=false`.

Фоновые воркеры запускаются как обычные потоки внутри процесса FastAPI
(`threading`), без отдельного task queue.

## Безопасность

- **Все** routers подключены с `dependencies=[Depends(require_internal_token)]`. Без `X-Internal-Token` любой запрос → 401.
- Исключение — `GET /health`, объявлен на уровне приложения без зависимости.
- Валидация Kaggle CSV проводится на этапе импорта (csv_loader): отбрасываются строки с битыми типами.
- OpenDota и Steam Web API вызываются с таймаутами и backoff'ом на 429.
