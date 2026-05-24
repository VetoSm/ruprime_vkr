# Техническая документация — RuPrime (Dota 2 Coach Platform)

Документация технической части проекта: архитектура, стек, сервисы, эндпоинты, модель данных и инструкции по запуску. Предназначена для технического аудита и onboarding'а новых разработчиков.

## Состав документации

### Общее
- [Overview](./overview.md) — назначение системы, основные сценарии, роли пользователей.
- [Architecture](./architecture.md) — карта микросервисов, схема взаимодействий, диаграмма.
- [Stack](./stack.md) — используемые языки, фреймворки, библиотеки.
- [Data Model](./data-model.md) — схема PostgreSQL: домены и таблицы.
- [Configuration](./configuration.md) — переменные окружения по сервисам.
- [Deployment](./deployment.md) — сборка и запуск через Docker Compose, продакшн-нюансы.

### Сервисы
- [Auth Service](./services/auth.md) — аутентификация, JWT, Steam OpenID, роли.
- [Core Service](./services/core.md) — BFF: профили, матчинг, сессии, AI-чат, админка.
- [ML Service](./services/ml.md) — загрузка данных, фича-инжиниринг, MMR, матчинг тренеров.
- [LLM Service](./services/llm.md) — генерация AI-советов, история, провайдер OpenAI-совместимый.
- [Frontend](./services/frontend.md) — React SPA, маршруты, защищённые зоны.

## Соглашения

- Все эндпоинты собраны из исходников `services/*/app/routers/`.
- Авторизация: `Bearer <access_token>` в заголовке `Authorization`, кроме внутренних вызовов между `core ↔ ml ↔ llm` (заголовок `X-Internal-Token`).
- ML-сервис не имеет публичного порта и доступен только через `core`.
