# План внедрения дизайна

Документ описывает порядок работы по переносу макетов из `docs/design/mockups/` в продакшен фронт `services/frontend/src/`. Источник правды — четыре файла:

1. **`docs/design/mockups/*.png`** — визуальные референсы.
2. **`docs/design/tokens.json`** — палитра, шрифты, размеры.
3. **`docs/design/TOOLKIT.md`** — каталог UI-компонентов.
4. **`docs/design/REPLACEMENTS.md`** — обязательные замены и пропуски.

Плюс — спеки по страницам: `docs/design/pages/*.md`.

---

## 0. Принципы

1. **Бэкенд не трогаем.** Все правки только во фронте.
2. **Не добавляем фейковую функциональность.** Если на макете элемент, для которого нет API, — заменяем по `REPLACEMENTS.md` или убираем.
3. **Композиция не должна выглядеть дырявой.** После удаления элемента — пересобираем layout.
4. **Используем существующие CSS-классы** из `services/frontend/src/ui/theme.css`. Новые добавляем только если не хватает.
5. **Стандартные состояния**: default / hover / active / disabled / loading / empty / error. Не пропускаем.
6. **Mobile** — каждая страница должна корректно стакаться < 768px (стек в одну колонку).

---

## 1. Фазы

### Фаза 0 — Подготовка (0.5 дня) ✅ Готово

- [x] `tokens.json`
- [x] `TOOLKIT.md`
- [x] `REPLACEMENTS.md`
- [x] `IMPLEMENTATION_PLAN.md` (этот файл)
- [ ] `pages/<page>.md` × 14 _(следующий шаг)_
- [ ] `BACKEND_GAP.md` _(после спек)_

### Фаза 1 — Фундамент библиотеки (1-2 дня)

Создать в `services/frontend/src/ui/primitives/`:

- [ ] `Button.tsx` (variants: primary / outline / danger / ghost)
- [ ] `IconButton.tsx`
- [ ] `Badge.tsx`
- [ ] `TextInput.tsx`, `PasswordInput.tsx`, `Select.tsx`, `Textarea.tsx`
- [ ] `Toggle.tsx`, `Checkbox.tsx`
- [ ] `SegmentedToggle.tsx`, `RolePicker.tsx`
- [ ] `FormGroup.tsx`
- [ ] `Tabs.tsx`, `SubTabs.tsx`
- [ ] `Pagination.tsx`
- [ ] `EmptyState.tsx`, `SkeletonCard.tsx`

Все рендерят существующие CSS-классы. Никакой логики, только props → CSS.

### Фаза 2 — Data-компоненты (1 день)

В `services/frontend/src/ui/data/`:

- [ ] `Card.tsx`, `HeroCard.tsx`, `StatCard.tsx`, `StatPill.tsx`, `ProofCard.tsx`
- [ ] `CoachCard.tsx` (с `auto_*` fallback из `/coaches`)
- [ ] `SessionCard.tsx`, `RequestCard.tsx`
- [ ] `MatchRow.tsx`, `HeroChip.tsx`, `RankBadge.tsx`
- [ ] `StatusPill.tsx` с маппингом enum → цвет/текст
- [ ] `OracleHint.tsx`, `OracleOrb.tsx`
- [ ] `DataTable.tsx` (generic)
- [ ] `FilterBar.tsx`
- [ ] `ProgressBar.tsx` (есть CSS), `ProgressRing.tsx`

### Фаза 3 — Визуализации (1-2 дня)

В `services/frontend/src/ui/charts/`:

- [ ] `AreaLineChart.tsx`
- [ ] `BarChart.tsx` (horizontal/vertical)
- [ ] `RadarChart.tsx`
- [ ] `DonutChart.tsx`
- [ ] `Sparkline.tsx`

Использовать `recharts` или чистый SVG (палитра — из `tokens.json`).

### Фаза 4 — Чат / Оракул (0.5 дня)

В `services/frontend/src/ui/chat/`:

- [ ] `ChatMessage.tsx` (с markdown поддержкой)
- [ ] `ChatInput.tsx`, `PromptChip.tsx`, `DailyLimitMeter.tsx`

### Фаза 5 — Декор + новые иконки (0.5 дня)

- [ ] `decor/GlowGradient.tsx`, `HexPattern.tsx`, `DotaMinimap.tsx`
- [ ] Расширить `Icons.tsx` недостающими (см. `TOOLKIT.md` §11)
- [ ] `_future/` — заглушка-папка с README "Toolkit-only компоненты, см. REPLACEMENTS.md".

### Фаза 6 — Переписать страницы (4-7 дней)

Порядок: от публичных к админу, от простых к сложным. **Для каждой страницы:**

1. Открыть `docs/design/mockups/<page>.png`.
2. Прочитать `docs/design/pages/<page>.md`.
3. Свериться с `REPLACEMENTS.md`.
4. Переписать соответствующий `.tsx`.
5. Проверить states: default / loading / empty / error.
6. Проверить mobile (< 768px).
7. Mark page as `[x]` ниже.

#### Публичная часть
- [ ] `Landing.tsx` — `pages/landing.md`
- [ ] `CoachLanding.tsx` — `pages/coach_landing.md`
- [ ] `Login.tsx` + `Register.tsx` + `SteamAuthCallback.tsx` — `pages/auth.md`
- [ ] `NotFound.tsx` + `Privacy.tsx` + `Terms.tsx` — `pages/notfound_legal.md`

#### Кабинет игрока
- [ ] `player/Dashboard.tsx` — `pages/player_dashboard.md`
- [ ] `player/Stats.tsx` — `pages/player_stats.md`
- [ ] `player/Schedule.tsx` — `pages/player_schedule.md`
- [ ] `player/Coaches.tsx` — `pages/player_coaches.md`
- [ ] `player/Requests.tsx` — `pages/player_sessions.md`
- [ ] `player/AiChat.tsx` — `pages/player_oracle_chat.md`
- [ ] `player/Profile.tsx` — `pages/player_profile.md`

#### Кабинет тренера
- [ ] `coach/Dashboard.tsx` — `pages/coach_dashboard.md`
- [ ] `coach/Profile.tsx` (публичный + личный кабинет — split) — `pages/coach_profile.md`
- [ ] `coach/Schedule.tsx` — `pages/coach_schedule.md`

#### Не переписываем сейчас
- `About.tsx`, `Contacts.tsx` — оставляем как есть (макет исключён пользователем)
- `coach/Reviews.tsx` — оставляем как есть (макет исключён пользователем)
- Все `admin/*.tsx` — оставляем как есть (макеты исключены пользователем)

### Фаза 7 — QA & polish (1 день)

- [ ] Прогнать все страницы на каждой роли (PLAYER, COACH, GUEST)
- [ ] Проверить переходы между ролями (PLAYER → apply-coach → PENDING badge)
- [ ] Проверить Steam OAuth full flow
- [ ] Проверить mobile-стек на всех страницах
- [ ] Проверить states empty/error/loading
- [ ] Lighthouse: a11y ≥ 90, perf ≥ 80

### Фаза 8 — Backend roadmap

После того как фронт переписан и стабилен, открываем `BACKEND_GAP.md` и приоритизируем функции, которые поднимут страницу со «статичной заглушки» до «живой». Каждая функция = отдельный PR на бэке, плюс «достать компонент из `_future/`» в соответствующем `pages/*.md`.

---

## 2. Сценарии работы с AI

Для каждой страницы используется один и тот же шаблон промпта в Cursor:

```
Перепиши services/frontend/src/pages/<page>.tsx по этим референсам:
- макет: docs/design/mockups/<page>.png
- спека: docs/design/pages/<page>.md
- правила замен: docs/design/REPLACEMENTS.md (раздел <N>)
- доступные компоненты: docs/design/TOOLKIT.md
- токены: docs/design/tokens.json

Обязательные правила:
1. Не вызывай API, которых нет в спеке.
2. Применяй замены из REPLACEMENTS.md дословно.
3. Используй существующие CSS-классы из theme.css.
4. Не оставляй пустых мест после удалённых элементов.
5. Добавь states: loading (skeleton), empty (EmptyState), error.
```

Это даёт нейросети все необходимые ограничения, чтобы она не выдумывала ни визуал, ни функционал.

---

## 3. Команда / роли (если есть)

- **Дизайнер** не нужен — макет уже зафиксирован в PNG + спеках.
- **AI / разработчик** идёт по спекам страница за страницей.
- **Тимлид / автор продукта** держит «зелёный свет»: ревью каждой переписанной страницы по чеклисту:
  - визуал совпадает с PNG (с поправкой на замены)
  - все CTA ведут на реальные эндпоинты
  - states работают
  - mobile работает

---

## 4. Полезные ссылки

- `services/frontend/src/ui/theme.css` — единственный источник CSS.
- `services/frontend/src/App.tsx` — карта роутов и `ProtectedRoute`.
- `services/frontend/src/api/client.ts` — axios-клиенты `authApi`, `coreApi`.
- `services/core/app/routers/` — bыходы бэкенда.
- `services/auth/app/routers/` — авторизация.

---

_Документ живёт и обновляется по мере прохождения фаз. Если что-то поменялось на бэке — сначала правим `REPLACEMENTS.md`, потом `pages/*.md`, потом код._
