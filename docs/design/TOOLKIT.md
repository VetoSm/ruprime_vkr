# RuPrime UI Toolkit

Полный каталог UI-элементов, извлечённых из 14 PNG-макетов в `docs/design/mockups/`.

**Маркеры:**
- 🟢 **active** — компонент используется в продакшен-странице
- 🟡 **toolkit-only** — лежит в библиотеке, но в страницы пока не подключается (см. `REPLACEMENTS.md`)
- 🔵 **existing** — уже реализован в `services/frontend/src/ui/`
- 🔴 **new** — нужно создать

---

## 1. Layout-примитивы

### `<AppLayout>` 🟢 🔵
`services/frontend/src/ui/AppLayout.tsx`
- Sidebar (260px collapsible до 64px) + Topbar (52px) + main content area.
- Контракт props: `children`. Sidebar и topbar внутри.

### `<PublicLayout>` 🟢 🔵
`services/frontend/src/ui/PublicLayout.tsx`
- Тонкий transparent navbar + main + `<SiteFooter />`.

### `<Sidebar>` 🟢 🔵 (часть AppLayout)
- Логотип (`<Logo>` cyan glow) + nav-items + collapse toggle.
- `collapsed: boolean` — иконки без подписей.
- Nav-items строятся **только из реальных роутов** (см. `REPLACEMENTS.md` §3).

### `<Topbar>` 🟢 🔵 (часть AppLayout)
- breadcrumb + spacer + actions (search icon, bell, avatar pill).

### `<SiteFooter>` 🟢 🔵
`services/frontend/src/ui/SiteFooter.tsx`
- Логотип, copyright, social icons (Telegram, Discord, YouTube, VK), legal links.

---

## 1.5. Avatars / Hero images

> **Правило:** см. `REPLACEMENTS.md §16`. Пользователь → Steam avatar; герой → opendota CDN. На сгенерированных PNG лица — декор, в проде подменяются.

### `<Avatar>` 🟢 🔴
- Кругло-радиусный аватар + cyan border (опц.) + onError-фолбэк на инициалы на cyan-violet gradient.
- Props: `src?: string`, `fallbackText: string`, `size?: 32|48|72|88`, `variant?: 'default'|'player'|'coach'|'student'`, `rankOverlay?: number` (показать `<RankBadge>` в углу).
- Источник `src`:
  - **Сам пользователь** → `summary.avatar_url` из `/player/{me}/stats/overview` или `acc.avatar_url` из `/player/steam-data`.
  - **Чужой игрок/ученик** → `useStudentAvatar(playerProfileId)` хук → `/ml/player-account/{aid}`.
  - **Тренер** → `useCoachAvatar(coachProfileId)` хук (см. ниже).

### `<CoachAvatar>` 🟢 🔴
- Wrapper над `<Avatar>` для тренеров.
- Делает запрос: получает `dota_account_id` тренера (через `/coach/{id}` или предзагруженный из `/coaches`) → `/ml/player-account/{aid}` → `avatar_url`.
- Кешируется через react-query / SWR с TTL ~1ч.

### `<PlayerAvatar>` 🟢 🔴
- Аналогично, для учеников и собственного аккаунта.

### `<OracleOrb>` 🟢 🔴 (см. §9)
- Декоративный градиент-аватар AI. **Не картинка**, а CSS-круг с purple → cyan gradient.

### Helper'ы (готовы 🔵)

`services/frontend/src/api/heroes.ts`:
- `loadHeroes()` — preload meta через `GET /ml/heroes`. Кеш в модуле.
- `heroIcon(heroId, size=28)` → CDN URL картинки (legacy, для совместимости).
- `heroName(heroId)` → localized_name.
- `rankTierToName(rt)` → "Immortal [3]" и т.д.
- `roleName(roleOrPos)` → "Mid" / "Carry" / ...

---

## 1.6. Dota assets (полный реестр)

> Все CDN-URL **публичные и стабильные**, никаких ключей не нужно. Кешируются браузером естественно (Cache-Control от Valve / OpenDota).
>
> Helper-файл: **`services/frontend/src/api/dota_assets.ts`** 🟢 🔵 (создан).

### Heroes — 4 варианта изображения

| Variant | CDN | Размер | Назначение |
|---|---|---|---|
| `sb` (small bordered) | `https://cdn.opendota.com/apps/dota2/images/heroes/{slug}_sb.png` | ~64×36 | списки, KDA, hero pool chips (28-32px) |
| `portrait` | `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{slug}.png` | 256×144 | карточки тренеров, hero detail header (≥64px) |
| `vert` | `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{slug}_vert.jpg` | 234×272 | hero-details страницы (если появятся) |
| `render` | `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/renders/{slug}.png` | ~512×512 | **декоративные фоны** (прозрачный PNG, full body) |

API:
```ts
import { heroAsset } from 'api/dota_assets';
heroAsset(74, 'render')         // by hero_id (нужен loadHeroes() перед этим)
heroAsset('invoker', 'portrait')  // by slug напрямую
```

### Items

URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`

```ts
import { itemIcon } from 'api/dota_assets';
itemIcon('blink')           // Blink Dagger
itemIcon('black_king_bar')  // BKB
itemIcon('aghanims_scepter') // Aghs
```

Используется в: Last matches (опц. items column), Oracle chat (рекомендации билдов).

### Abilities

URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/{name}.png`

```ts
import { abilityIcon } from 'api/dota_assets';
abilityIcon('invoker_chaos_meteor')
```

### Rank medals (8 рангов)

URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/rank_icons/rank_icon_{1..8}.png`

```ts
import { rankIcon } from 'api/dota_assets';
rankIcon(75)  // → Divine medal (звёзды отрисовываются поверх отдельно)
```

Уже встроено в `<RankBadge>` (`GameComponents.tsx`).

### Decorative renders (фоновые декорации)

Преcеты в `DECORATIVE_HEROES` константе:

| Страница | Декор |
|---|---|
| Auth (Login/Register) | Invoker (слева) + Lina (справа), opacity 0.18, blur(2px) |
| 404 NotFound | Vengeful Spirit (по центру за цифрами "404"), opacity 0.22 |
| Dashboard sidebar bottom | Invoker (в нижнем углу), masked-image gradient |
| Coach Landing | Rubick (слева) + Oracle (справа) |

API:
```ts
import { decorRender } from 'api/dota_assets';
decorRender('auth.left')        // Invoker render URL
decorRender('notfound.center')  // Vengeful Spirit render URL
decorRender('dashboardCorner')  // Invoker render URL
```

CSS-паттерн для использования:
```css
.auth-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url(/* decorRender('auth.left') */);
  background-position: left center;
  background-repeat: no-repeat;
  background-size: contain;
  opacity: 0.18;
  filter: blur(2px);
  pointer-events: none;
  z-index: 0;
}
```

Если CDN недоступен — `<img onError>` сработает, или CSS-background просто не отрисуется, фон останется только градиентным (`theme.css` уже даёт base radial gradient).

### Steam avatars (пользователи)

URL приходит от OpenDota как готовый Steam CDN ссылка:
`https://avatars.akamai.steamstatic.com/{hash}_full.jpg` (или `_medium.jpg` / `.jpg`).

```ts
import { steamAvatar } from 'api/dota_assets';
steamAvatar(summary.avatar_url)
```

Pass-through helper для будущего расширения (например proxy через бэк).

### Helper для onError

```ts
import { imgFallbackHide } from 'api/dota_assets';
<img src={...} onError={imgFallbackHide} />
```

Скрывает картинку при ошибке, оставляя CSS-фолбэк (initials в `<Avatar />`).

---

## 2. Brand / Identity

### `<Logo>` 🟢 🔴
- Текстовая монограмма "RuPrime" с cyan glow и опциональным subtitle.
- `variant: 'full' | 'icon'` (для collapsed sidebar — только R-моногр.).
- `subtitle?: string` — например "DOTA 2 COACHING" / "COACH MODE" / "ADMIN".

### `<Badge>` (cyan pill) 🟢 🔴
- Хром: cyan border + `accent-bg` fill + dot/icon left + text.
- Использование: "AI-аналитика Dota 2" на лендингах, "О проекте" на About.
- Props: `icon?`, `children`, `tone: 'cyan' | 'purple' | 'gold' | 'warning' | 'danger'`.

---

## 3. Кнопки

### `<Button variant="primary">` 🟢 🔴 (CSS уже есть как `.btn-primary`)
- Purple gradient (`#7d5eff` → `#a38bff`) + arrow icon right.
- Props: `as?: 'button' | 'a'`, `to?`, `icon?`, `loading?`.

### `<Button variant="outline">` 🟢 🔴 (CSS `.btn-outline`)
- Cyan border + cyan text + accent-bg на hover.

### `<Button variant="danger">` 🟢 🔴 (CSS `.btn-danger`)
- Transparent + red border/text.

### `<Button variant="ghost">` 🟢 🔴
- Только текст cyan, hover → underline.

### `<IconButton>` 🟢 🔴 (CSS `.topbar-btn`)
- 36×36 кв., только иконка, тонкий border.

### `<SteamLoginButton>` 🟢 🔴
- Большая кнопка с лого Steam → `GET /auth/steam/login`.
- В forms — full-width, центральная позиция (см. `REPLACEMENTS.md` §1).

### `<DiscordIconButton>` 🟡 🔴
- Зарезервировано. В toolkit как готовый стиль, но не используется в авторизации.

---

## 4. Формы

### `<TextInput>` 🟢 🔴 (CSS `.form-input`)
- Dark `bg-input`, cyan border на focus + glow.
- Props: `label?`, `icon?`, `error?`, `hint?`.

### `<PasswordInput>` 🟢 🔴 (CSS `.input-with-icon`)
- Расширение `TextInput` с eye-toggle справа.

### `<Select>` 🟢 🔴 (CSS `.form-select`)

### `<SegmentedToggle>` 🟢 🔴
- Pill-row из 2-5 опций, активная — cyan glow inset.
- Использование: persona switch на лендинге, role-picker на регистрации, неделя/месяц на расписаниях.

### `<RolePicker>` 🟢 🔴
- 5 pill-кнопок (Carry / Mid / Off / Soft Sup / Hard Sup), single-select.
- Под `analysis_role` / `desired_roles` (POS1..POS5).

### `<Textarea>` 🟢 🔴 (CSS `textarea.form-input`)

### `<Checkbox>` 🟢 🔴
- С cyan check icon.

### `<Toggle>` 🟢 🔴
- Pill switch, активный — cyan.
- 🟡 `<TwoFactorToggle>`, `<SessionsInDiscordToggle>` — toolkit-only.

### `<FormGroup>` 🟢 🔴 (CSS `.form-group`)
- label (uppercase, letter-spacing wide) + input + hint/error.

---

## 5. Карточки

### `<Card>` 🟢 🔴 (CSS `.card`)
- Dark bg + thin border + radius-lg + padding-2xl.
- Variants: `default`, `accent` (cyan border + shadow-glow), `interactive` (hover-state).

### `<StatCard>` 🟢 🔴 (CSS `.stat-card`)
- icon + label (uppercase muted) + big value + optional delta-badge top-right.
- Props: `icon`, `label`, `value`, `delta?: { value: number, trend: 'up'|'down'|'flat' }`.

### `<StatPill>` 🟢 🔴 (CSS `.stat-pill`)
- Меньше `StatCard`, для строк KPI.

### `<HeroCard>` 🟢 🔴 (CSS `.hero-card`)
- Player avatar + name + rank badge + KPI pills.
- Topline accent gradient.

### `<CoachCard>` 🟢 🔴
- Avatar circle (cyan border) + name + rank badge + hero pool chips (3) + KPI mini-stats + specialty pills + price row + CTA "Записаться".
- Props: `coach: CoachListItem` (data from `GET /coaches`).
- 🟡 `<TopOnePercentBadge>` — gold pill в углу — toolkit-only.

### `<SessionCard>` 🟢 🔴
- Horizontal: coach avatar + topic + date/time + duration pill + status pill + actions.
- Props: `session: TrainingSession`, `onAction(action)`.

### `<RequestCard>` 🟢 🔴
- Аналогично `SessionCard`, для заявок (`TrainingRequest`).
- Status maps: NEW → "Новая", MATCHING → "Подбираем тренеров", WAITING_CONFIRMATION → "Ждёт подтверждения", ACCEPTED → "Принята", REJECTED → "Отклонена", CANCELLED → "Отменена".

### `<CTABanner>` 🟢 🔴
- Wide gradient card с заголовком + кнопкой + опциональным side art.

### `<StepCard>` 🟢 🔴
- Cyan numbered circle + title + text + optional icon.
- Использование: "Как это работает", "Как стать тренером".

### `<ProofCard>` 🟢 🔴
- KPI на лендинге: big value cyan + small label muted.

---

## 6. Визуализации данных

### `<SkillRing>` 🟢 🔵
`services/frontend/src/ui/SkillRing.tsx` + `LandingSkillRing.tsx`
- Circular SVG progress + центральный % + label.
- Подключаем к `categories[].score` из `/player/{id}/detailed-features`.
- ⚠ Не дорисовываем фейковые кольца (см. `REPLACEMENTS.md` §4).

### `<AreaLineChart>` 🟢 🔴
- Smooth cyan line + gradient fill + grid + axes.
- Props: `data: {x, y}[]`, `gradient: 'cyan'|'purple'`, `markerLast?: boolean`.
- Использование: winrate / sessions count timeline.
- ⚠ Не используется для MMR-dynamic (нет в бэке) — см. §4.

### `<Sparkline>` 🟢 🔴 (CSS `.landing-sparkline`)
- Mini cyan curve в карточках.

### `<RadarChart>` 🟢 🔴
- Spider/radar для категорий из `/detailed-features` (Фарм, Урон, Позиционирование, Вижн, Карта, Тимплей).
- Сравнение "Ты vs Immortal среднее" (purple line) — берём `target_band` если есть.

### `<BarChart horizontal>` 🟢 🔴
- Винрейт по ролям: `roles_distribution` из ML.

### `<DonutChart>` 🟢 🔴
- Распределение ролей / статусов сессий.

### `<Heatmap>` 🟡 🔴
- Карта Dota с теплокартой активности. **toolkit-only** — данных нет.

### `<ProgressBar>` 🟢 🔴 (CSS `.progress-bar`)
- Animated cyan fill with shine. Use для целей, лимитов.

### `<ProgressRing>` 🟢 🔴
- Большое кольцо с % внутри (для "84% заполнено месяц").

---

## 7. Списки и таблицы

### `<DataTable>` 🟢 🔴
- Header row uppercase muted + body rows с alternating hover.
- Columns config + row-key.
- Использование: матчи, сессии, тренеры, лидер-таблица учеников.

### `<MatchRow>` 🟢 🔴
- Hero icon circle + result pill (WIN/LOSS) + KDA + GPM + длительность + дата.
- Props: `match: RecentMatch` (`summary.trends.recent_matches[]`).

### `<HeroIcon>` 🟢 🔵
`services/frontend/src/ui/GameComponents.tsx`
- Props: `heroId`, `size=28`, `showName=true`.
- Источник изображения: `heroIcon(heroId)` → `https://cdn.opendota.com/apps/dota2/images/heroes/{slug}_sb.png`.
- ⚠ Перед первым использованием в приложении вызвать `await loadHeroes()` (из `api/heroes.ts`) — обычно в `AuthProvider` после получения user.

### `<HeroChip>` 🟢 🔴 (CSS `.coach-hero-chip`)
- Pill-обёртка над `<HeroIcon>`: hero icon circle + name + опц. winrate/match count.
- Использование: hero pool в `CoachCard`, в Coach Profile, в Oracle chat context.

### `<RankBadge>` 🟢 🔵
`services/frontend/src/ui/GameComponents.tsx`
- Иконка медали + название ранга + звёзды.
- Маппинг цветов из `tokens.json` → `rank.*`.

### `<RoleBadge>` 🟢 🔵
`services/frontend/src/ui/GameComponents.tsx`
- Pill для роли: POS1..POS5 → Carry/Mid/Off/Soft/Hard.
- Helper: `roleName(role)` из `api/heroes.ts`.

### `<StatusPill>` 🟢 🔴 (CSS `.badge.badge-*`)
- Mappings:
  - Session: PLANNED → cyan "Подтверждена", COMPLETED → success "Завершена", CANCELLED → danger "Отменена", RESCHEDULED → muted "Перенесена".
  - Request: см. `<RequestCard>`.
  - Coach: is_verified → cyan "Verified".

### `<EmptyState>` 🟢 🔴
- Cyan dashed border + icon + title + CTA.
- Использование: нет привязанного Steam, нет истории Оракула, нет сессий.

### `<SkeletonCard>` 🟢 🔴
- Loading placeholder с pulse-анимацией.

---

## 8. Календарь / Schedule

### `<WeekStrip>` 🟢 🔴
- 7 дней в строку, dot на дне с событиями, активный день — cyan border.
- Использование: top of `/requests`.

### `<MonthCalendar>` 🟢 🔵
`services/frontend/src/ui/SessionsCalendar.tsx`
- Используем как есть.

### `<TimeGrid>` 🟢 🔴
- 7 columns × N time-rows, sessions/requests как блоки.
- ⚠ В тренерском расписании показываем только сессии и заявки (см. `REPLACEMENTS.md` §13).
- Props: `events`, `range: {start, end}`, `onCellClick?`.

### `<AvailabilitySlot>` 🟡 🔴
- Зарезервировано на будущее (когда появится модель coach_availability).

---

## 9. Чат / Оракул

### `<ChatMessage>` 🟢 🔴 (CSS `.chat-message`)
- User: cyan-tinted bg, right-aligned.
- AI: dark card + thin cyan border + AI avatar mini-circle (purple-cyan gradient orb).
- Поддерживает markdown в advice_full.

### `<ChatInput>` 🟢 🔴
- Wide dark input + purple gradient send-button.

### `<PromptChip>` 🟢 🔴
- Preset prompts ("Разбери последний матч", и т.д.).

### `<OracleOrb>` 🟢 🔴
- Purple → cyan gradient circle, decorative AI icon.

### `<OracleHint>` 🟢 🔴
- Mini-card with Oracle avatar + short text + arrow → opens `/ai-chat`.
- Используется на дашборде вместо фейковых AI-рекомендаций.

### `<DailyLimitMeter>` 🟢 🔴
- Простой счётчик "{used}/{limit} запросов сегодня" + tiny progress bar.

---

## 10. Tabs / Navigation внутри страниц

### `<Tabs>` 🟢 🔴 (CSS `.tabs`)
- Underlined cyan tab. Variant с pill-фоном на active.

### `<SubTabs>` 🟢 🔴
- Pill-style без подчёркивания, для подсекций (Профиль / Steam / Уведомления...).

### `<FilterBar>` 🟢 🔴
- Horizontal: search input + N selects + sort dropdown + actions.

### `<Pagination>` 🟢 🔴
- "1 2 3 ... N" с cyan на активной.

---

## 11. Иконки

`services/frontend/src/ui/Icons.tsx` — 🔵 базовая библиотека.

### Используются на проде 🟢
- Home, Chart, Match (mêlée icon), Replay, Practice (target), Coach (people), Session (calendar), Oracle (sparkle), Goal (flag), Settings (gear)
- Steam logo
- ArrowRight, ChevronDown, X (close), Search, Bell, Calendar
- Eye (password), Camera (avatar)
- Telegram, VK, YouTube
- Hero placeholder

### Toolkit-only 🟡
- Discord
- Wallet (платежи)
- Tournament (cup)
- Leaderboard (medal)
- Subscription (crown)
- Lock+2 (2FA)
- Course (book)
- Message (chat bubble; есть в topbar — toolkit-only)

---

## 12. Декоративные элементы

### `<GlowGradient>` 🟢 🔴
- Radial gradient cyan + violet в углах страницы (для public-страниц и hero).

### `<DotaMinimap>` 🟢 🔴
- SVG силуэт мини-карты для 404 страницы.

### `<HeroSilhouette>` 🟡 🔴
- Radiant/Dire side art. Опционально для auth-страниц.

### `<HexPattern>` 🟢 🔴
- Cyan тонкий пятиугольный фон.

---

## 13. Состояния (states matrix)

Все компоненты должны поддерживать:

| State | Применение |
|---|---|
| `default` | базовый |
| `hover` | cyan glow border, transition 0.25s |
| `active` / `selected` | сильнее cyan + glow + opt. cyan left border (sidebar) |
| `disabled` | opacity 0.5, no events |
| `loading` | skeleton or spinner |
| `empty` | `<EmptyState>` с CTA |
| `error` | red border + alert message |

---

## 14. Связь с `theme.css`

Большая часть стилей уже есть как CSS-классы (`.btn-*`, `.card`, `.stat-card`, `.badge`, `.tabs`, `.progress-bar`, и т.д.) — см. `services/frontend/src/ui/theme.css`.

Новые React-компоненты должны:
1. **Использовать существующие CSS-классы** в первую очередь.
2. Если класса нет — добавлять локальный CSS-модуль рядом с компонентом или расширить `theme.css`.
3. Не создавать дубликаты палитры — брать из CSS custom properties (`var(--accent)` и т.д.).

---

## 15. Расположение в коде (план)

```
services/frontend/src/ui/
├── primitives/          # Button, TextInput, Select, Toggle, Badge, ...
├── data/                # Card, StatCard, CoachCard, SessionCard, ...
├── charts/              # AreaLineChart, RadarChart, BarChart, Sparkline, ...
├── chat/                # ChatMessage, ChatInput, OracleOrb, ...
├── layout/              # AppLayout, PublicLayout, Sidebar, Topbar, ...    (есть)
├── icons/               # Icons.tsx (есть, расширить)
├── decor/               # GlowGradient, HexPattern, ...
└── _future/             # toolkit-only компоненты (Discord, Wallet, ...)
```

Папка `_future/` — это «холодильник»: компоненты готовы по стилю, но не импортируются в actual страницы. Когда соответствующий backend появляется — перемещаем в основной слой и добавляем в `IMPLEMENTATION_PLAN.md`.
