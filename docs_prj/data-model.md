# Data Model

Одна общая БД PostgreSQL для всех сервисов, разделение по префиксам таблиц. Связи между доменами — через идентификаторы без cross-domain FK.

## Auth domain (пишет только `auth`)

### `auth_users`

Учётка пользователя. Уникальность по `email` и `login`.

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `id` | int PK | |
| `login` | str(100), unique | Логин |
| `email` | str(255), unique | Email |
| `password_hash` | str(255) | bcrypt |
| `role` | enum (`PLAYER`/`COACH`/`ADMIN`) | Текущая роль |
| `is_active` | bool | Активен ли аккаунт |
| `is_verified` | bool | Подтверждён ли (для будущей email-верификации) |
| `coach_application_status` | enum (`NONE`/`PENDING`/`APPROVED`/`REJECTED`) | Статус заявки на роль COACH |
| `coach_application_requested_at` | datetime | Когда подал заявку |
| `coach_approved_at` | datetime | Когда одобрена |
| `consent_version` | str(32) | Версия принятого Terms/Privacy |
| `consent_accepted_at` | datetime | Когда принял |
| `created_at`, `updated_at` | datetime | |

### `auth_sessions`

Refresh-токены (хешированные).

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `id` | int PK | |
| `user_id` | FK → `auth_users` | |
| `refresh_token` | str(512), unique | sha256(plain_token) |
| `user_agent`, `ip_address` | str | |
| `expires_at` | datetime | TTL refresh |
| `revoked` | bool | Флаг отзыва |
| `created_at` | datetime | |

### `auth_roles`

Справочник ролей (используется как seed; auth ещё хранит текущую роль в `auth_users.role`).

### `auth_providers`

Привязка внешних identity-провайдеров (Steam).

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `id` | int PK | |
| `user_id` | FK → `auth_users` | |
| `provider` | str(50) | `STEAM` |
| `provider_user_id` | str(255) | SteamID64 |
| `created_at` | datetime | |

## Core domain (пишет только `core`)

### `core_users`

Расширение профиля поверх `auth_users` (через идентификатор `auth_user_id`, без FK).

| Колонка | Тип |
|---------|-----|
| `id` | int PK |
| `auth_user_id` | int unique, индекс |
| `preferred_language`, `time_zone` | str |

### `player_profiles`

Игровой профиль игрока. Один-к-одному с `core_users`.

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `id` | int PK | |
| `core_user_id` | FK → `core_users`, unique | |
| `steam_id` | str(100) | SteamID64. Уникален с условием `IS NOT NULL AND <> ''` |
| `dota_account_id` | str(100) | OpenDota accountId. Уникален с тем же условием |
| `actual_rank_tier` | str(50) | Текущий ранг |
| `actual_roles` | JSON | Текущие позиции/роли |
| `desired_rank_tier` | str(50) | Целевой ранг |
| `desired_roles` | JSON | Желаемые позиции |
| `training_goals` | JSON | Список целей |
| `about` | text | |
| `ml_analysis_id` | str(100) | Ссылка на `ml_player_analyses.analysis_id` |

### `coach_profiles`

Публичная карточка тренера.

| Колонка | Тип |
|---------|-----|
| `mmr_estimate` | int |
| `rank_tier` | str |
| `main_roles`, `hero_pool` | JSON |
| `hourly_rate` | float |
| `experience_years` | int |
| `is_verified` | bool |

### `training_requests`

Заявка игрока на тренировку.

| Колонка | Тип | Назначение |
|---------|-----|------------|
| `id` | int PK | |
| `player_profile_id` | FK → `player_profiles` | |
| `desired_role` | str(20) | |
| `focus_area` | str(100) | |
| `ml_analysis_id` | str(100) | Снимок аналитики на момент создания |
| `status` | enum (`NEW`/`MATCHING`/`WAITING_CONFIRMATION`/`ACCEPTED`/`REJECTED`/`CANCELLED`) | |
| `recommended_coaches` | JSON | Список ID тренеров с рейтингом совпадения |

> Уникальный индекс `ux_training_requests_active_same_scope` запрещает несколько активных заявок на одну `(role, focus)` для одного игрока.

### `training_sessions`

Запланированная или прошедшая сессия.

| Колонка | Тип |
|---------|-----|
| `training_request_id` | FK → `training_requests` |
| `coach_profile_id` | FK → `coach_profiles` |
| `scheduled_at` | datetime |
| `duration_minutes` | int |
| `status` | enum (`PLANNED`/`COMPLETED`/`CANCELLED`/`RESCHEDULED`) |
| `report` | text |
| `rescheduled_from_id` | self-FK |

### `coach_reviews`

Отзыв игрока по сессии.

| Колонка | Тип |
|---------|-----|
| `training_session_id` | FK |
| `player_profile_id`, `coach_profile_id` | FK |
| `rating` | int (1–5) |
| `comment` | text |

### `ai_advice_history`

История запросов в AI-чат.

| Колонка | Тип |
|---------|-----|
| `player_profile_id` | FK |
| `training_request_id` | FK (nullable) |
| `llm_request_id` | str — ссылка на `llm_requests.request_id` |
| `prompt_context` | JSON |
| `message` | text |
| `advice_summary`, `advice_full` | text |

### `core_action_logs`

Audit-лог действий в core.

| Колонка | Тип |
|---------|-----|
| `core_user_id` | FK |
| `role` | str |
| `action_type` | str(100) |
| `entity_type`, `entity_id` | str / int |
| `metadata_json` | JSON |
| `ip_address`, `user_agent` | str |

## ML domain (пишет только `ml`)

### Сырые данные из Kaggle

- `ml_raw_matches` — матчи (`match_id`, длительность, патч, регион, win-флаг и т.д.).
- `ml_raw_players` — статистика игрока в матче (kda, gpm, xpm, lh, denies, hero damage, items 0..5, lane, lane_role).
- `ml_raw_teams` — состав команд по матчам.
- `ml_raw_picks_bans` — пики и баны.

### Справочники (constants)

- `ml_constants_heroes` — герои (id, имя, attr, тип атаки, base-stat'ы, иконки).
- `ml_constants_items` — предметы (id, имя, стоимость, иконка).
- `ml_constants_abilities` — способности (id, имя, иконка).

### Baselines

`ml_kaggle_baselines` — агрегаты по `(mmr_band × hero_id × role)`:
- `avg_gpm`, `avg_xpm`, `avg_kda`, `avg_last_hits`, `avg_hero_damage`, `winrate`, `match_count`.
- `percentiles` — JSON `{p25, p50, p75, p90, p95}`.

### Аналитика конкретного игрока

`ml_player_analyses` — финальный snapshot аналитики:
- `analysis_id` — внешний идентификатор (используется в `player_profiles.ml_analysis_id`).
- `estimated_mmr`, `mmr_band`.
- `summary`, `trends`, `roles_data`, `heroes_data`, `comparisons`, `features`, `weaknesses_ranked`, `strengths_ranked` — всё JSON.

### Real-time данные игрока (OpenDota)

- `player_accounts` — профиль (`account_id`, `personaname`, `avatar_url`, `rank_tier`, win/lose, `lifetime_games`, агрегаты totals).
- `player_matches` — матчи игрока (`account_id` + `match_id` уникальны вместе через `ux_player_matches_account_match`).

## LLM domain (пишет только `llm`)

### `llm_requests`

| Колонка | Тип |
|---------|-----|
| `request_id` | str unique |
| `player_profile_id` | int |
| `message` | text |
| `player_context` | JSON |

### `llm_responses`

| Колонка | Тип |
|---------|-----|
| `request_id` | str |
| `summary` | text |
| `plan` | JSON |
| `full_text` | text |

## Сводка миграций

Alembic не используется. Все изменения схемы выполняются:

1. `Base.metadata.create_all(bind=engine)` — создаёт отсутствующие таблицы.
2. `CREATE INDEX IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` в `startup`-хуке (`services/core/app/main.py`, `services/ml/app/main.py`).

Деструктивных операций (DROP, RENAME) в коде нет — для них нужен Alembic.
