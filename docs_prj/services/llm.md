# LLM Service

Сервис генерации советов AI-тренера. Принимает контекст игрока (последние слабые стороны, цели, метаинформация) и возвращает текстовый ответ.

## Назначение

- Принимать запросы от `core` (AI-чат, советы по сессии).
- Генерировать ответ через OpenAI-совместимый API (`https://api.openai.com/v1`, либо локальный шлюз).
- При отсутствии `LLM_API_KEY` — детерминированный fallback на шаблонные ответы (чтобы UX не ломался).
- Сохранять request/response в БД для истории и аудита.

## Стек

- Python 3.11, FastAPI 0.115
- SQLAlchemy 2.0, PostgreSQL
- `httpx` — клиент к OpenAI-compatible endpoint
- Без `openai` SDK — обращения «руками» через httpx (упрощает поддержку альтернативных провайдеров: vLLM, OpenRouter, локальный шлюз).

## Структура исходников

```
services/llm/
├── Dockerfile
├── requirements.txt
└── app/
    ├── main.py             # FastAPI app, routers с require_internal_token
    ├── models.py           # llm_requests, llm_responses
    ├── internal_auth.py    # require_internal_token dependency
    └── routers/
        └── chat.py         # /llm/chat, /llm/advice, /llm/history/{id}
```

## Конфигурация

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `DATABASE_URL` | — | Общая БД (для истории) |
| `ML_INTERNAL_TOKEN` | — | Тот же токен, что в core/ml. Любой запрос без него → 401 |
| `LLM_PROVIDER` | `openai` | Зарезервировано для расширения |
| `LLM_API_KEY` | пусто | Если пусто — fallback на шаблоны |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Можно указать свой endpoint |
| `LLM_MODEL` | `gpt-4o-mini` | Имя модели |
| `LLM_TIMEOUT_SEC` | `25` | Таймаут запроса |
| `CORS_ORIGINS` | `http://localhost:3000,...` | На случай прямого тестирования из браузера |

## Эндпоинты

> Все требуют `X-Internal-Token`. Обычный клиент — `core`.

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/llm/chat` | Обработать сообщение пользователя. На вход — текст + контекст игрока. На выход — `summary`, `plan` (JSON), `full_text` |
| `POST` | `/llm/advice` | Получить совет на основе контекста (без явного сообщения) |
| `GET`  | `/llm/history/{player_profile_id}` | История чата конкретного игрока |
| `GET`  | `/health` | Healthcheck (включая текущий режим: `live` / `fallback`) |

Точные схемы запросов/ответов (`ChatRequest`, `AdviceRequest`, `ChatResponse`, `HistoryEntry`) — в `services/llm/app/routers/chat.py`. Pydantic-модели документируются в Swagger по адресу `http://localhost:8004/docs`.

## Модель данных

### `llm_requests`

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `request_id` | str(100), unique | Внешний идентификатор запроса (используется в `core.ai_advice_history.llm_request_id`) |
| `player_profile_id` | int | Игрок |
| `message` | text | Исходное сообщение |
| `player_context` | JSON | Контекст (роль, фокус, слабые стороны и т.п.) |
| `created_at` | datetime | |

### `llm_responses`

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `request_id` | str(100) | Связь с `llm_requests` |
| `summary` | text | Короткий итог |
| `plan` | JSON | Структурированный план действий |
| `full_text` | text | Полный ответ |
| `created_at` | datetime | |

## Поведение fallback

Если `LLM_API_KEY` пустой:

- `/llm/chat` и `/llm/advice` возвращают **детерминированный шаблонный ответ**, основанный на переданном `player_context`.
- В `/health` поле `mode` будет `fallback`. С ключом — `live`.
- БД-история ведётся одинаково для обоих режимов.

Это сделано, чтобы:
- демо/учебный запуск работал без внешних ключей;
- интеграция core ↔ llm не падала с 5xx при проблемах с провайдером.

## Безопасность

- Все routers смонтированы с `dependencies=[Depends(require_internal_token)]`. Внешний (не из docker-network) запрос невозможен без секрета.
- Тот же набор security headers, что и в других сервисах.
- `LLM_API_KEY` никогда не возвращается клиенту, не попадает в логи (используется только в заголовке Authorization исходящего httpx-запроса).
- Сообщения от пользователей сохраняются в `llm_requests.message`. При обработке PII необходимо учитывать политику хранения.

## Расширение

- Заменить провайдера → достаточно поменять `LLM_BASE_URL` + `LLM_MODEL`. Совместим с любым OpenAI-compatible API (vLLM, OpenRouter, локальные шлюзы).
- Добавить streaming → потребуется доработать `chat.py`, на текущий момент ответ возвращается одним JSON-объектом.
- Добавить кэш одинаковых запросов → можно завязать на `request_id` или хеш `(player_profile_id, message)`.
