# Backend Gap — что нужно добавить на бэке после переписи фронта

Этот документ собирает **функции, которых сейчас нет в бэкенде**, но которые встречаются на макетах. Все они в первой итерации **не реализуются** — на их месте применяется замена из `REPLACEMENTS.md`. По мере того как продукт растёт, фичи из этого списка перетекают в production roadmap.

Приоритеты:

- 🔥 **Critical** — без этого продукт ощущается «недоделанным».
- ⭐ **High** — заметный value-add, без него страница работает, но скучнее.
- 🌿 **Nice-to-have** — на потом, не критично.

---

## 🔥 Critical (P1)

### 1. История MMR / прогресса

**Зачем:** график "Динамика MMR" на дашборде и в аналитике — основа visual storytelling продукта. Сейчас мы показываем `cumulative winrate`, что слабее.

**Что нужно:**
- Таблица `player_mmr_history(player_profile_id, recorded_at, mmr_estimate, rank_tier)`.
- Cron / on-sync job: при `link-steam` / `sync-steam` / `refresh-steam` сохранять snapshot в history.
- Endpoint `GET /player/{id}/mmr-history?from=&to=` → `[ { date, mmr, rank_tier } ]`.

**Где использовать после внедрения:**
- `pages/player_dashboard.md` блок A: заменить `cumulative winrate` обратно на `AreaLineChart` с MMR.
- `pages/player_stats.md` блок 2.1: вернуть "Динамика MMR".
- StatCards: вернуть дельты (+85 за неделю и т.п.).

### 2. Coach availability (слоты тренера)

**Зачем:** на макете тренера и в публичном профиле тренера — сетка "доступных слотов". Без неё игрок не видит, когда тренер свободен, и поиск слотов уходит в Discord-переписку.

**Что нужно:**
- Таблица `coach_availability(id, coach_profile_id, day_of_week, start_time, end_time)` для повторяющихся слотов.
- Таблица `coach_availability_overrides(id, coach_profile_id, date, start_time, end_time, is_blocked)` для одноразовых.
- Endpoints:
  - `GET /coach/{id}/availability?from=&to=` → массив свободных интервалов с учётом existing sessions.
  - `POST /coach/availability` (для тренера, batch update).
  - `DELETE /coach/availability/{id}`.

**Где использовать:**
- `pages/coach_profile.md` (публичный режим): tab "Слоты" с реальной сеткой.
- `pages/coach_schedule.md`: вернуть "Свободно / Недоступно / Шаблоны слотов".
- `pages/player_coaches.md`: фильтр "Доступен сейчас" + бейдж "Online сейчас".

### 3. Публичный профиль тренера (роут `/coaches/:id`)

**Зачем:** сейчас в `App.tsx` нет такого роута. Игрок не может изучить тренера перед запросом — открывается сразу модал заявки.

**Что нужно:**
- Frontend: добавить роут `/coaches/:id` → новая страница (см. `pages/coach_profile.md` секция "Публичный режим").
- Backend: эндпоинт `GET /coach/{id}/public` — отдаёт коуч-профиль без приватных полей + counts отзывов / сессий + `auto_*` autofill (то, что уже есть в `/coaches`). По сути расширение существующего фильтра по id.

**Где использовать:**
- `pages/coach_profile.md`: разблокировать публичный режим.
- `pages/player_coaches.md`: `<CoachCard>` "Подробнее →" → `/coaches/:id` (вместо открытия apply-modal сразу).

---

## ⭐ High (P2)

### 4. Сообщения / чат внутри платформы

**Зачем:** сейчас контакт обменивается через `/training-sessions/{id}/contact-share`, что работает, но требует выходить из платформы. На макетах был `<MessagesIcon>` в topbar — это могла бы быть нормальная conversation-feature.

**Что нужно:**
- Таблица `conversations`, `messages`, `read_receipts`.
- WebSocket или long-polling endpoint.
- Frontend `<MessagesPanel>` + nav-item "Сообщения".

**Где использовать:**
- Везде, где сейчас "Поделиться контактом" — заменить на "Открыть чат".

### 5. Уведомления (push / in-app)

**Зачем:** Новые заявки, подтверждения сессий, отзывы. Сейчас в topbar есть `<BellIcon>`, но он ни во что не ведёт.

**Что нужно:**
- Таблица `notifications(user_id, type, payload, read_at, created_at)`.
- Endpoints `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.
- Push (Web Push API) опционально на потом.

**Где использовать:**
- Topbar `<NotificationsDropdown>`.
- Toast'ы — заменить локальные toasts на server-driven, чтобы события синхронизировались между вкладками.

### 6. Подписка Pro / тарифные планы

**Зачем:** на профиле было "Подписка Pro · до 12.06.26". Сейчас всё бесплатно.

**Что нужно:**
- Таблица `subscriptions(user_id, tier, started_at, expires_at, status)`.
- Интеграция платёжного шлюза (СБП / ЮKassa / Stripe).
- Endpoints `GET /me/subscription`, `POST /payments/subscribe`, `POST /payments/cancel`.
- Feature flags привязаны к tier (например, daily AI limit).

**Где использовать:**
- `pages/player_profile.md`: вернуть tab "Подписка".
- Daily AI Chat limit поднимается для Pro.
- `<TopOnePercentBadge>` (gold) → для топ-тренеров (sub-feature).

### 7. Goal tracking с прогрессом

**Зачем:** на профиле игрока были progress bars "Достичь Divine 5 — 72%". Сейчас цели хранятся как текст в `training_goals`, без structure.

**Что нужно:**
- Таблица `player_goals(id, player_profile_id, kind, target_value, current_value, status, created_at, achieved_at)`. Kinds: `RANK`, `WINRATE`, `SESSIONS_COUNT`, `CUSTOM`.
- Endpoints `GET /player/{id}/goals`, `POST /player/{id}/goals`, `PATCH /player/{id}/goals/{gid}`.
- Background job — обновлять `current_value` из ML stats.

**Где использовать:**
- `pages/player_profile.md` tab "Цели" — вернуть progress bars.
- `pages/player_dashboard.md`: виджет "Цели месяца" в RIGHT col.

### 8. Подробные подкатегории отзывов (sub-ratings)

**Зачем:** на coach reviews PNG были 4 sub-rating (Объяснение / Польза / Атмосфера / Стиль). Сейчас одна оценка 1-5.

**Что нужно:**
- В `CoachReview` добавить поля `rating_explanation`, `rating_usefulness`, `rating_atmosphere`, `rating_style` (все 1-5).
- В endpoint POST `/coach-reviews` принимать опционально, в response — возвращать.
- Опционально — поле `reply` (ответ тренера).

**Где использовать:**
- Coach Reviews page (вне основной 13 — мокап исключён, но компонент в toolkit готов).

---

## 🌿 Nice-to-have (P3)

### 9. Heatmap активности по карте Dota

**Зачем:** на player_stats был визуально красивый «тепловой минимап». Сейчас невозможен.

**Что нужно:** хранение `x`, `y` координат событий из replay parser (есть в OpenDota), агрегация → endpoint `/player/{id}/heatmap?period=`. Большое инфраструктурное вложение, value не критичный.

### 10. Платёжный workflow внутри сессии

Сейчас оплата off-platform. Можно добавить "Оплатить сессию" с эскроу.

### 11. История изменения подписки / транзакций

### 12. Реферальная программа / промокоды

### 13. Турниры / лидерборды

### 14. Curated курсы / гайды контента

### 15. 2FA (TOTP)

### 16. Discord OAuth (опционально)

Зачем убрали изначально — пользователю не нужен Discord-вход. Если соберём аудиторию преимущественно из Discord-серверов, может стать P2.

### 17. Coach «топ-1%» badge + лейтенант-сертификации

### 18. Replay attachment к Oracle сессии

Прикреплять `.dem` файл из Steam → парсить → передавать в LLM context.

### 19. Auto-detect language (RU / EN) для интерфейса

### 20. Notification preferences (granular toggles)

---

## Связь с фронтенд-задачами

После реализации каждой Backend Gap фичи нужно:

1. Обновить `REPLACEMENTS.md` — убрать или ослабить соответствующее правило замены.
2. Обновить `pages/<page>.md` — заменить заглушку на реальный компонент.
3. Достать компонент из `services/frontend/src/ui/_future/` если он там лежит.
4. Обновить `IMPLEMENTATION_PLAN.md` — добавить как новую фазу/итерацию.

---

## Совсем не реализуем (out of scope продукта)

- Discord chat integration в-app (контактом обмениваемся ссылкой).
- Twitch / YouTube стриминг.
- Tournament hosting.
- Шахматы / иные не-Dota игры.
