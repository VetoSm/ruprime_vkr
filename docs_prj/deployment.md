# Deployment

## Локальный запуск

### Требования

- Docker 24+
- docker-compose v2
- Опционально: Kaggle Dota 2 dataset (`archive-2/`) для построения baseline-статистики. Без него ML-сервис стартует, но эндпоинты загрузки CSV вернут пустые результаты.

### Шаги

1. Скопировать пример окружения и заполнить:

   ```bash
   cp .env.example .env
   # отредактировать JWT_SECRET, POSTGRES_PASSWORD, ML_INTERNAL_TOKEN
   ```

2. Поднять стек:

   ```bash
   docker-compose up --build
   ```

   После старта будут доступны:
   - Frontend → http://localhost:3000
   - Auth API + Swagger → http://localhost:8001/docs
   - Core API + Swagger → http://localhost:8002/docs
   - LLM API + Swagger → http://localhost:8004/docs
   - PostgreSQL → `localhost:5432`
   - ML — **только из Docker-сети**, наружу порт не пробрасывается

3. (Опционально) Загрузить датасет и обучить MMR-модель — через UI админа или curl:

   ```bash
   curl -X POST http://localhost:8002/admin/ml/load-constants \
        -H "Authorization: Bearer <admin_access_token>"
   curl -X POST http://localhost:8002/admin/ml/start-import \
        -H "Authorization: Bearer <admin_access_token>"
   curl -X POST http://localhost:8002/admin/ml/compute-baselines \
        -H "Authorization: Bearer <admin_access_token>"
   curl -X POST http://localhost:8002/admin/ml/train-mmr-model \
        -H "Authorization: Bearer <admin_access_token>"
   ```

4. Создать первого админа:

   ```bash
   curl -X POST http://localhost:8001/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "login":"admin","email":"admin@example.com",
       "password":"admin1234","confirm_password":"admin1234",
       "role":"PLAYER","consent_accepted":true
     }'
   ```

   Затем повысить роль через БД либо через эндпоинт `POST /auth/admin/users/{id}/role` (требует уже существующего ADMIN).

   Для bootstrap первого ADMIN — вручную:

   ```sql
   UPDATE auth_users SET role = 'ADMIN' WHERE email = 'admin@example.com';
   ```

## Продакшн (типовая схема)

```
Internet
   │  HTTPS (443)
   ▼
Nginx (host) ── Let's Encrypt
   │
   ├──/ ─────────► frontend:3000
   ├──/auth ─────► auth:8001
   ├──/core ─────► core:8002
   └──/llm ──────► llm:8004
       (ml не проксируется наружу)
```

### Особенности

1. **SSL завершается на Nginx**, внутрь контейнеров идёт plain HTTP. Внутренние сервисы доверяют DC-сети.
2. **Обновление**:
   - Pull новой версии кода.
   - `docker-compose build --pull`.
   - `docker-compose up -d` — без полного down, чтобы не уронить БД.
3. **Миграции схемы** делаются автоматически при старте сервисов (`Base.metadata.create_all` + `CREATE INDEX IF NOT EXISTS`). Деструктивных миграций нет.
4. **Бэкапы БД**:
   ```bash
   docker exec <postgres_container> pg_dump -U dota_coach dota_coach_db | gzip > backup_$(date +%F).sql.gz
   ```
5. **Логи** — через `docker-compose logs -f <service>`.
6. **Health checks**:
   - `GET http://auth:8001/health`
   - `GET http://core:8002/health`
   - `GET http://ml:8003/health` (без `X-Internal-Token`, но из private network)
   - `GET http://llm:8004/health`

### Принудительный сброс сессий

После обновления, влияющего на JWT-payload, выставить:

```env
FORCE_REVOKE_ALL_SESSIONS=true
```

Перезапустить только `auth`, дождаться старта (в логе появится отметка), вернуть переменную в `false` и снова перезапустить `auth`. Все ранее выданные refresh-токены становятся невалидными.

## Важные нюансы инфраструктуры

- **Volumes:**
  - `pgdata` — persistent volume PostgreSQL.
  - `./archive-2:/data/archive-2:ro` — монтируется в контейнер `ml` как **read-only**. На prod рекомендуется тот же режим.
- **Зависимости запуска (`depends_on`):**
  - Все сервисы стартуют только после `postgres: service_healthy`.
  - `core` и `frontend` зависят от `auth`.
- **CORS:**
  - На каждом сервисе свой `CORSMiddleware`, читает `CORS_ORIGINS`. На проде указать только реальный домен фронта.
- **Rate limit:** in-memory, не реплицируется между процессами. При горизонтальном масштабировании заменить на Redis-based решение.

## Скрипты

- `scripts/deploy.sh` — пример shell-скрипта для деплоя на сервер (`git pull` →
  бэкап БД → аддитивные SQL-миграции → `docker compose build/up` → smoke-тесты по
  внутренним `/health`). Идемпотентен.
- `scripts/seed_demo_accounts.py` (не входит в репозиторий, см. `.gitignore`) —
  локальный скрипт для наполнения демо-аккаунтами на основе CSV из
  `data/ru_steam_accounts*.csv`. В публичном репозитории доступен только сэмпл
  `data/ru_steam_accounts.sample.csv`.
