## 1. Назначение core‑сервиса

Core‑сервис является центральным бэкендом (BFF) проекта:

- предоставляет API для фронтенда (React) для личного кабинета игрока, тренера и технического аккаунта;
    
- оркестрирует вызовы других сервисов:
    
    - auth‑сервис (идентификация и роль);
        
    - ML‑сервис (аналитика, фичи, рекомендации);
        
    - LLM‑сервис (чат с AI‑тренером);
        
- управляет доменными данными: профили игроков и тренеров, заявки, расписание тренировок, отчёты, отзывы, логи действий.
    

Core **не** занимается аутентификацией паролей и social‑логином, а только использует JWT, выданный auth‑сервисом.

---

## 2. Стек и инфраструктура

- Язык: Python 3.10+
    
- Framework: FastAPI
    
- БД: Postgres (общий кластер, таблицы домена в схеме `core` или `public`, но логически принадлежат core‑сервису).
    
- Контейнеризация: отдельный Docker‑контейнер `core-service`.
    
- Взаимодействие с другими сервисами:
    
    - Auth: HTTP/REST (`/auth/me`, проверка JWT на стороне core локально по секрету/ключу).
        
    - ML: HTTP/REST (например, `POST /ml/analyze-player`, `POST /ml/match-coaches`).
        
    - LLM: HTTP/REST (`POST /llm/advice`, `POST /llm/chat`).
        

---

## 3. Роли и политика доступа

Роли определяются auth‑сервисом и передаются в JWT (`role`: `PLAYER`, `COACH`, `ADMIN`).

Core‑сервис реализует авторизацию на уровне домена:

- **PLAYER (игрок):**
    
    - доступ к своему профилю игрока;
        
    - просмотр списка тренеров, рекомендованных тренеров;
        
    - управление своими заявками и расписанием;
        
    - просмотр своей статистики, фичей ML;
        
    - доступ к чату с LLM‑тренером.
        
- **COACH (тренер):**
    
    - доступ к своему профилю тренера;
        
    - управление своим расписанием тренировок;
        
    - просмотр заявок, где он выбран тренером;
        
    - заполнение отчётов о проведённых тренировках.
        
- **ADMIN (технический аккаунт):**
    
    - просмотр логов действий;
        
    - просмотр данных БД через интерфейс (read‑only для аналитики, расширенный доступ при необходимости);
        
    - управление аккаунтами (блокировка, смена ролей);
        
    - просмотр общей статистики по сервису.
        

Проверка роли выполняется на уровне FastAPI‑зависимостей/мидлварей.

---

## 4. Модель данных core‑сервиса

## 4.1. Таблица `core_users`

Назначение: связать `auth_users` с доменными сущностями и хранить общие настройки.

Поля:

- `id` (PK, serial/uuid)
    
- `auth_user_id` (integer, unique, not null, FK → auth_users.id)
    
- `preferred_language` (varchar, nullable)
    
- `time_zone` (varchar, nullable)
    
- `created_at` (timestamptz, default now)
    
- `updated_at` (timestamptz, default now)
    

## 4.2. Таблица `player_profiles`

Назначение: хранить профиль игрока, включая фактические данные из аккаунта и его цели/желания.

Поля:

- `id` (PK)
    
- `core_user_id` (FK → core_users.id, unique для игрока)
    
- `steam_id` (varchar, nullable) — дублируется из auth_providers для быстрого доступа
    
- `dota_account_id` (varchar, nullable)
    
- `actual_rank_tier` (varchar, nullable) — фактический ранг (из ML/данных матчей)
    
- `actual_roles` (jsonb, nullable) — распределение ролей по матчам (например, `{"POS1": 0.1, "POS4": 0.6, ...}`)
    
- `desired_rank_tier` (varchar, nullable) — целевой ранг, который хочет достичь
    
- `desired_roles` (jsonb, nullable) — роли, которые игрок хочет освоить
    
- `training_goals` (jsonb/text, nullable) — список/описание целей (улучшить лейн, пул героев, макро и т.п.)
    
- `about` (text, nullable) — свободное описание игрока
    
- `created_at`, `updated_at`
    

Индексы:

- по `core_user_id`
    
- по `steam_id`
    

## 4.3. Таблица `coach_profiles`

Назначение: профиль тренера.

Поля:

- `id` (PK)
    
- `core_user_id` (FK → core_users.id, unique для тренера)
    
- `mmr_estimate` (integer, nullable)
    
- `rank_tier` (varchar, nullable)
    
- `main_roles` (jsonb) — основные позиции
    
- `hero_pool` (jsonb) — ключевые герои
    
- `hourly_rate` (numeric, nullable) — ставка за час
    
- `experience_years` (integer, nullable)
    
- `about` (text, nullable) — описание тренера
    
- `is_verified` (boolean, default false)
    
- `created_at`, `updated_at`
    

## 4.4. Таблица `training_requests`

Назначение: заявки игрока на подбор тренера (живого и/или AI).

Поля:

- `id` (PK)
    
- `player_profile_id` (FK → player_profiles.id)
    
- `desired_role` (varchar, nullable) — на какую роль ищет тренировка
    
- `focus_area` (varchar, nullable) — ключевой фокус (лейнинг, макро, пул героев, коммуникация и т.д.)
    
- `ml_analysis_id` (varchar/integer, nullable) — ссылка на сущность/снимок в ML‑сервисе
    
- `status` (enum: `NEW`, `MATCHING`, `WAITING_CONFIRMATION`, `ACCEPTED`, `REJECTED`, `CANCELLED`)
    
- `recommended_coaches` (jsonb, nullable) — список ID тренеров и их скор (кешированный результат ML)
    
- `created_at`, `updated_at`
    

## 4.5. Таблица `training_sessions`

Назначение: конкретные тренировки.

Поля:

- `id` (PK)
    
- `training_request_id` (FK → training_requests.id)
    
- `coach_profile_id` (FK → coach_profiles.id)
    
- `scheduled_at` (timestamptz)
    
- `duration_minutes` (integer)
    
- `status` (enum: `PLANNED`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`)
    
- `rescheduled_from_id` (FK → training_sessions.id, nullable) — ссылка на старую сессию при переносе
    
- `created_at`, `updated_at`
    

## 4.6. Таблица `coach_reviews`

Назначение: отзывы о тренерах.

Поля:

- `id` (PK)
    
- `training_session_id` (FK → training_sessions.id)
    
- `rating` (integer, 1–5)
    
- `comment` (text, nullable)
    
- `created_at`
    

## 4.7. Таблица `ai_advice_history`

Назначение: хранить обращения к LLM‑сервису и ответы для игрока.

Поля:

- `id` (PK)
    
- `player_profile_id` (FK → player_profiles.id)
    
- `training_request_id` (FK, nullable)
    
- `llm_request_id` (varchar, nullable) — идентификатор запроса в LLM‑сервисе
    
- `prompt_context` (jsonb/text) — краткое описание, какие фичи/цели были переданы
    
- `advice_summary` (text) — краткий вывод/резюме
    
- `advice_full` (text) — полный текст ответа
    
- `created_at`
    

## 4.8. Таблица `core_action_logs`

Назначение: логирование действий пользователей (для технического аккаунта).[](https://www.scitepress.org/publishedPapers/2025/133910/pdf/index.html)​

Поля:

- `id` (PK)
    
- `core_user_id` (FK → core_users.id, nullable — например, для системных событий)
    
- `role` (varchar, nullable) — роль пользователя в момент действия
    
- `action_type` (varchar) — тип действия (`CREATE_REQUEST`, `UPDATE_SESSION`, `VIEW_STATS`, `LOGIN`, `ADMIN_BLOCK_USER` и т.п.)
    
- `entity_type` (varchar, nullable) — над какой сущностью действие (PLAYER_PROFILE, COACH_PROFILE, TRAINING_SESSION, …)
    
- `entity_id` (integer, nullable)
    
- `metadata` (jsonb, nullable) — детали (старые/новые значения, параметры запроса)
    
- `ip_address` (varchar, nullable)
    
- `user_agent` (varchar, nullable)
    
- `created_at`
    

Технический аккаунт просматривает эти логи через админ‑интерфейс.

---

## 5. Основные группы API core‑сервиса

## 5.1. Общие: `/me`

## `GET /me/overview`

Назначение: вернуть сводную информацию для личного кабинета в зависимости от роли.

Шаги:

- Определить роль по JWT (`PLAYER`/`COACH`/`ADMIN`).[](https://jwt.io/introduction)​
    
- Для `PLAYER`: вернуть краткий профиль игрока, количество активных заявок, ближайшие тренировки, ссылки на статистику.
    
- Для `COACH`: профиль тренера, количество предстоящих сессий, последние отзывы.
    
- Для `ADMIN`: краткий обзор метрик (кол-во пользователей, активных тренеров, заявок).
    

Ответ — структурированный JSON, который фронт использует для dashboard.

---

## 5.2. Профиль игрока

## `GET /player/profile`

Назначение: получить профиль текущего игрока (фактические + желаемые данные).

## `POST /player/profile`

Назначение: создать/обновить профиль игрока (только анкета/желания).

Вход:

json

`{   "desired_rank_tier": "ANCIENT",  "desired_roles": ["POS2"],  "training_goals": ["lane_control", "hero_pool_mid"],  "about": "Играю саппортов, хочу перейти в мид." }`

Шаги:

- Определить `core_user_id` по JWT.
    
- Найти/создать `player_profiles`.
    
- Обновить `desired_*`, `training_goals`, `about`.
    
- Фактические данные (`actual_*`) не трогать — они обновляются из ML‑сервиса.
    

---

## 5.3. Профиль тренера

## `GET /coach/profile`

Возвращает профиль текущего тренера.

## `POST /coach/profile`

Создание/обновление профиля тренера (ставка, опыт, роли, пул героев, описание).

---

## 5.4. Список и подбор тренеров

## `GET /coaches`

Назначение: список тренеров (с базовым фильтром по ролям/рангу/цене).

## `GET /coaches/recommended`

Назначение: список **рекомендованных тренеров** для текущего игрока.

Шаги:

- Получить `player_profile` и его `ml_analysis_id`/`steam_id`/`dota_account_id`.
    
- Если нет анализа — инициировать запрос в ML‑сервис (асинхронно/синхронно) и дождаться результата.
    
- Вызвать ML‑сервис для получения рекомендованных тренеров и их скор.
    
- Вернуть список тренеров с сортировкой и объяснением (короткий summary).
    

---

## 5.5. Заявки и расписание

## `POST /matchmaking/requests`

Назначение: создать заявку на подбор тренера.

Вход:

json

`{   "desired_role": "POS2",  "focus_area": "lane_control",  "use_ai_coach": true }`

Шаги:

- Определить `player_profile`.
    
- Создать запись в `training_requests` со статусом `NEW`.
    
- Вызвать ML‑сервис для анализа и подбора, сохранить `ml_analysis_id` и `recommended_coaches`.
    
- Вернуть ID заявки и предварительные рекомендации.
    

## `GET /matchmaking/requests/my`

Возвращает список заявок текущего игрока с их статусами и прикреплёнными рекомендациями.

## `PATCH /matchmaking/requests/{id}`

Игрок может:

- отменить заявку (`status = CANCELLED`);
    
- выбрать тренера из рекомендованных (создаётся `training_session`).
    

---

## 5.6. Тренировочные сессии

## `GET /training-sessions/my`

Для игрока:

- список его сессий (будущие и прошедшие).
    

Для тренера:

- список сессий, где он выбран тренером.
    

## `PATCH /training-sessions/{id}`

Позволяет:

- переносить (`RESCHEDULED`, с новой датой + ссылка в `rescheduled_from_id`);
    
- отменять;
    
- помечать как завершённые (`COMPLETED`).
    

Права:

- Игрок может переносить/отменять **свои** сессии до наступления времени (в рамках правил).
    
- Тренер может подтверждать/отменять свои сессии.
    
- Админ может управлять любыми сессиями.
    

---

## 5.7. Отчёты о тренировках и отзывы

## `POST /training-sessions/{id}/report` (для тренера)

Сохранить отчёт по завершённой тренировке (что делали, какие рекомендации).

## `POST /coach-reviews`

Игрок после завершённой сессии оставляет рейтинг и комментарий.

## `GET /coach/{id}/reviews`

Список отзывов по тренеру.

---

## 5.8. Статистика и фичи ML для игрока

## `GET /player/{id}/stats/overview`

Назначение: отдать агрегированную статистику по игроку (для вкладки «Моя статистика»).

Шаги:

- По `player_profile` получить `ml_analysis_id` или инициировать анализ.
    
- Обратиться к ML‑сервису и получить:
    
    - KDA, GPM/XPM, винрейт, длину игр и т.п.;
        
    - сравнительные показатели относительно эталона/среднего уровня.
        
- Вернуть данные в формате, удобном для фронта (массивы для графиков, агрегаты).
    

## `GET /player/{id}/features`

Назначение: отдать фичи, посчитанные ML‑сервисом, в более «сырым» виде (для вкладки «Детальный анализ»).

---

## 5.9. Чат с LLM‑тренером

## `POST /ai/chat`

Назначение: отправить вопрос в чат с LLM‑тренером.

Вход:

json

`{   "message": "Почему я постоянно проигрываю лейн на миде?",  "context_mode": "AUTO" // core сам подбирает контекст из ML }`

Шаги:

- По пользователю/профилю получить последние фичи/аналитику из ML‑сервиса.
    
- Сформировать запрос к LLM‑сервису (фичи + вопрос игрока).
    
- Получить ответ, сохранить в `ai_advice_history`, вернуть игроку.
    

## `GET /ai/history`

Список прошлых обращений и ответов AI‑тренера для текущего игрока.

---

## 5.10. Админ‑функционал (технический аккаунт)

## `GET /admin/logs`

Просмотр логов `core_action_logs` с фильтрами по пользователю, роли, типу действия, периоду.[](https://www.scitepress.org/publishedPapers/2025/133910/pdf/index.html)​

## `GET /admin/db-view`

Интерфейс просмотра БД (read‑only выборки по ключевым таблицам: users, profiles, requests, sessions).

Можно ограничиться заранее определёнными запросами/фильтрами, без произвольного SQL.

## `PATCH /admin/users/{id}`

- смена роли (PLAYER/COACH/ADMIN)
    
- блокировка/разблокировка аккаунта (вызывает endpoint в auth‑сервисе или меняет флаг через админ‑интерфейс auth).
    

## `GET /admin/stats`

Базовые агрегаты по проекту:

- количество пользователей по ролям;
    
- активные тренеры;
    
- количество заявок и сессий за период;
    
- средний рейтинг тренеров.
    

---

## 6. Логирование действий

Для каждого значимого действия core‑сервис создаёт запись в `core_action_logs`:

- создание/изменение профиля;
    
- создание/изменение/отмена/перенос заявок и сессий;
    
- просмотр статистики и фичей;
    
- обращение к LLM‑чату;
    
- действия админа (блокировка аккаунта, смена ролей).[](https://www.scitepress.org/publishedPapers/2025/133910/pdf/index.html)​
    

Технический аккаунт (ADMIN) может просматривать логи и видеть историю действий по пользователю/сущности.

## 7. Matchmaking и интеграция с ML‑сервисом

## 7.1. Общий сценарий подбора тренера

Назначение: по запросу игрока подобрать список подходящих тренеров и, при необходимости, предложить AI‑коуча.

- Core‑сервис управляет жизненным циклом заявки (`training_requests`) и хранит результат подбора.
    
- ML‑сервис выполняет аналитику игрока и тренеров, оценивает совместимость и возвращает ранжированный список.
    

При создании заявки core учитывает одновременно:

- фактические данные игрока (из Steam/Dota/ML): `actual_rank_tier`, `actual_roles`, статистика матчей;
    
- желаемые параметры и цели из профиля: `desired_rank_tier`, `desired_roles`, `training_goals`;
    
- параметры конкретного запроса: `desired_role`, `focus_area`, `use_ai_coach`.
    

## 7.2. Endpoint `POST /matchmaking/requests`

Назначение: создать заявку на подбор тренера (и/или AI‑коуча).

**Роль доступа:** только `PLAYER`.

**Вход (JSON):**

json

`{   "desired_role": "POS2",  "focus_area": "lane_control",  "use_ai_coach": true }`

**Бизнес‑логика:**

1. По JWT определить `core_user_id`, найти или создать `player_profile`.
    
2. Прочитать профиль игрока: фактические (`steam_id`, `dota_account_id`, `actual_rank_tier`, `actual_roles`) и желаемые (`desired_rank_tier`, `desired_roles`, `training_goals`).
    
3. Создать запись в `training_requests`:
    

- `player_profile_id` = ID игрока;
    
- `desired_role`, `focus_area`, `status = NEW`;
    
- `ml_analysis_id = NULL`, `recommended_coaches = NULL`.
    

4. Сформировать запрос к ML‑сервису:
    

json

`{   "player_profile": {    "player_profile_id": <id>,    "steam_id": "...",    "dota_account_id": "...",    "actual_rank_tier": "...",    "actual_roles": ["POS4", "POS5"],    "desired_rank_tier": "...",    "desired_roles": ["POS2"],    "training_goals": ["lane_control", "hero_pool_mid"]  },  "request": {    "training_request_id": <id>,    "desired_role": "POS2",    "focus_area": "lane_control",    "use_ai_coach": true  } }`

5. Отправить запрос в ML‑сервис (`POST /ml/match-coaches`).
    
6. Получить ответ и обновить `training_requests`:
    

- `ml_analysis_id` ← `response.ml_analysis_id`;
    
- `recommended_coaches` ← `response.recommended_coaches` (jsonb);
    
- `status` → `WAITING_CONFIRMATION`.
    

7. Записать событие в `core_action_logs` (`CREATE_REQUEST`).
    
8. Вернуть фронтенду данные заявки и список рекомендованных тренеров.
    

**Ответ (JSON):**

json

`{   "training_request_id": 456,  "status": "WAITING_CONFIRMATION",  "recommended_coaches": [    {      "coach_profile_id": 10,      "score": 0.92,      "reasons": [        "Специализация на POS2",        "Опыт работы с игроками уровня LEGEND→ANCIENT"      ]    }  ] }`

## 7.3. Endpoint `GET /matchmaking/requests/my`

Назначение: показать игроку список его заявок.

**Роль доступа:** `PLAYER`.

**Логика:**

- По текущему `core_user_id` найти связанные `player_profiles`.
    
- Вернуть все `training_requests` игрока, включая: `status`, `recommended_coaches`, ссылки на связанные `training_sessions`.
    
- Логировать просмотр в `core_action_logs` (`VIEW_REQUESTS`).
    

## 7.4. Endpoint `PATCH /matchmaking/requests/{id}`

Назначение: управление заявкой игроком (выбор тренера, отмена).

**Роль доступа:** `PLAYER` (только владелец заявки).

**Возможные операции (по полю `action` или по структуре тела):**

1. Выбор тренера и создание сессии:
    

json

`{   "action": "CHOOSE_COACH",  "chosen_coach_profile_id": 10,  "scheduled_at": "2026-02-20T18:00:00Z" }`

Логика:

- Проверить, что заявка принадлежит игроку и `status = WAITING_CONFIRMATION`.
    
- Проверить, что `chosen_coach_profile_id` присутствует в `recommended_coaches`.
    
- Создать запись в `training_sessions` (`status = PLANNED`, `scheduled_at`).
    
- Обновить заявку: `status = ACCEPTED`.
    
- Логировать действие (`CREATE_SESSION`).
    

2. Отмена заявки:
    

json

`{   "action": "CANCEL" }`

- Проверить права;
    
- Перевести `status` в `CANCELLED`;
    
- Логировать действие (`CANCEL_REQUEST`).
    

Ответы: соответствующие обновлённые состояния заявки и/или созданной сессии.

---

## 8. Статистика и фичи игрока (интеграция с ML)

## 8.1. Endpoint `GET /player/{id}/stats/overview`

Назначение: отдать агрегированную статистику игрока для вкладки «Моя статистика».

**Роль доступа:**

- `PLAYER` — только свой ID;
    
- `COACH` — по игрокам, с которыми есть общие сессии (опционально);
    
- `ADMIN` — любой игрок.
    

**Шаги:**

1. Проверить права доступа к запрашиваемому `player_profile_id`.
    
2. Найти `player_profile` и связанный `ml_analysis_id`.
    
3. Если `ml_analysis_id` отсутствует или устарел (по политике), инициировать обновлённый анализ в ML‑сервисе.
    
4. Вызвать ML‑сервис (`GET /ml/player-analysis/{ml_analysis_id}` или аналог).
    
5. Преобразовать ответ ML в фронт‑ориентированную структуру:
    

- `summary` — ключевые агрегаты (ранг, количество игр, винрейт, средние GPM/XPM);
    
- `trends` — массивы по времени для графиков;
    
- `roles` — распределение фактических ролей + желаемые роли;
    
- `heroes` — топ герои;
    
- `comparisons` — сравнение с игроками того же ранга (перцентили).
    

**Пример ответа:**

json

`{   "summary": {    "estimated_rank_tier": "LEGEND",    "games_analyzed": 150,    "winrate": 0.52,    "gpm_avg": 430,    "xpm_avg": 520  },  "trends": {    "gpm_over_time": [      { "ts": "2026-01-01", "gpm": 400 },      { "ts": "2026-02-01", "gpm": 440 }    ],    "winrate_over_time": [      { "ts": "2026-01", "winrate": 0.48 },      { "ts": "2026-02", "winrate": 0.55 }    ]  },  "roles": {    "actual_roles_distribution": {      "POS1": 0.1,      "POS2": 0.15,      "POS4": 0.5,      "POS5": 0.25    },    "desired_roles": ["POS2"]  },  "heroes": {    "top_heroes": [      { "hero_id": 1, "games": 50, "winrate": 0.6 },      { "hero_id": 2, "games": 30, "winrate": 0.4 }    ]  },  "comparisons": {    "vs_same_tier": {      "gpm_percentile": 0.65,      "xpm_percentile": 0.6,      "deaths_percentile": 0.4    }  } }`

6. Залогировать действие `VIEW_STATS` в `core_action_logs`.
    

---

## 8.2. Endpoint `GET /player/{id}/features`

Назначение: отдать детальные фичи, рассчитанные ML‑сервисом, для вкладки «Детальный анализ / фичи».

**Роль доступа:** как для `/stats/overview`.

**Шаги:**

1. Проверить права, найти `ml_analysis_id`.
    
2. Вызвать ML‑сервис для получения фичей (часто это будет другая часть того же ответа, что для overview).
    
3. Вернуть структуру вида:
    

json

`{   "ml_analysis_id": "analysis_abc123",  "features": {    "lane_cs_per_min": 5.3,    "wards_placed_per_game": 7.1,    "stack_camps_per_game": 0.8,    "tp_usage_per_game": 3.2  },  "weaknesses_ranked": [    { "feature": "lane_cs_per_min", "score": 0.2, "description": "Низкий добор крипов на линии" }  ],  "strengths_ranked": [    { "feature": "teamfight_impact", "score": 0.8, "description": "Высокое влияние в тимфайтах" }  ] }`

4. Залогировать действие `VIEW_FEATURES`.