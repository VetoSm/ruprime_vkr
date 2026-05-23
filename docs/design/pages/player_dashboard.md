# Player Dashboard

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_dashboard.png` |
| **Код** | `services/frontend/src/pages/player/Dashboard.tsx` |
| **Layout** | `<AppLayout>` (PLAYER sidebar — см. `REPLACEMENTS.md §3`) |
| **Route** | `/dashboard` |
| **Доступ** | PLAYER |

## Sidebar (канонический, НЕ из PNG)

⚠ На PNG sidebar содержит: Обзор / Аналитика / Матчи / Разборы / Тренировки / Тренеры / Сессии / Цели / Настройки. **Из них реальные роуты только**: Обзор, Аналитика, Расписание, Тренеры, Сессии и заявки, Оракул, Настройки. Остальные элементы (Матчи, Разборы, Тренировки как отдельный пункт, Цели) — **не добавляем**.

Канонический PLAYER nav:
```
Обзор          /dashboard       ← active
Аналитика      /stats
Расписание     /schedule
Тренеры        /coaches
Сессии         /requests
Оракул         /ai-chat         ← с sparkle иконкой
Настройки      /settings
```

Декор в нижнем углу sidebar: `decorRender('dashboardCorner')` = Invoker (см. `REPLACEMENTS.md §16`).

## Композиция MAIN

```
<AppLayout sidebar="player">

  <header className="page-header">
    <h1>Привет, {user.login}</h1>
    <p className="text-muted">Отслеживай прогресс, анализируй игры, побеждай.</p>
    <Select value={range} onChange={setRange}>
      <option value="20">Последние 20 матчей</option>
      <option value="50">Последние 50 матчей</option>
      <option value="100">Последние 100 матчей</option>
    </Select>
  </header>

  {!profile.dota_account_id && (
    <EmptyState
      icon="steam"
      title="Привяжи Steam, чтобы увидеть аналитику"
      cta={<Button onClick={onLinkSteam}>Привязать Steam</Button>}
    />
  )}

  {profile.dota_account_id && (
    <>

      1. HERO CARD — div.hero-card
         <Avatar src={summary.avatar_url} fallbackText={user.login} size={88}
                 rankOverlay={summary.estimated_rank_tier} />
         <div>
           <h2>{summary.personaname || user.login}</h2>
           <RankBadge rankName={summary.estimated_rank_tier} />
           <small>Опыт ~{summary.estimated_hours}ч</small>
         </div>
         <div className="stat-pills">
           <StatPill label="MMR"        value={summary.estimated_mmr} />
           <StatPill label="Винрейт"    value={`${(summary.winrate * 100).toFixed(1)}%`} />
           <StatPill label="KDA"        value={summary.kda_avg} />
           <RoleBadge role={profile.analysis_role || 'POS2'} />
         </div>

      2. STAT GRID — grid-4 (на mobile стак)
         <StatCard icon="target"   label="Винрейт" value={(summary.winrate * 100).toFixed(1) + '%'} />
         <StatCard icon="swords"   label="KDA"     value={summary.kda_avg} />
         <StatCard icon="coin"     label="GPM"     value={summary.gpm_avg} />
         <StatCard icon="book"     label="XPM"     value={summary.xpm_avg} />
         ⚠ Дельты "+3.2% / +0.35" — УБРАНЫ (см. REPLACEMENTS §4: нет history endpoint).

      3. TWO-COLUMN — grid 2fr 1fr
         LEFT col:
           A. <Card title="Винрейт по матчам">
                <AreaLineChart
                  data={summary.recent_matches.map((m,i) => ({ x: i, y: cumulativeWR(m) }))}
                  gradient="cyan" />
              </Card>
              ⚠ "Динамика MMR" с PNG → **заменено** на cumulative winrate (см. REPLACEMENTS §4).

           B. <Card title="Skill rings">
                {detailedFeatures.categories.slice(0, 3).map(c =>
                  <SkillRing key={c.id} value={c.score} label={c.label} />)}
              </Card>
              ⚠ Только реальные категории, не дорисовываем фейковые (REPLACEMENTS §4).

           C. <Card title="Последние матчи">
                <DataTable>
                  {recent.map(m => (
                    <MatchRow
                      hero={<HeroIcon heroId={m.hero_id} size={32} />}
                      result={m.radiant_win === (m.player_slot < 128) ? 'WIN' : 'LOSS'}
                      kda={`${m.kills}/${m.deaths}/${m.assists}`}
                      gpm={m.gpm} duration={m.duration}
                      date={formatDate(m.start_time)}
                    />
                  ))}
                </DataTable>
              </Card>

         RIGHT col:
           D. <Card title="Последний разбор от Оракула">
                {history.length > 0
                  ? <OracleHint avatar={<OracleOrb />} text={history[0].advice_summary}
                                onClick={() => navigate('/ai-chat')} />
                  : <EmptyState compact title="Спроси Оракула о своей игре"
                                cta={<Button variant="outline" as={Link} to="/ai-chat">Открыть Оракула</Button>} />
                }
              </Card>
              ⚠ Было "3 AI рекомендации" — **заменено** на последний разбор + CTA (REPLACEMENTS §4).

           E. <Card title="Ближайшая сессия">
                {nextSession
                  ? <NextSessionCard session={nextSession} />
                  : <EmptyState compact title="Нет запланированных сессий"
                                cta={<Button variant="outline" as={Link} to="/coaches">Найти тренера</Button>} />
                }
              </Card>

           F. <Card title="Активные заявки" condensed>
                {activeRequests.map(req => <RequestRow key={req.id} request={req} />)}
                {activeRequests.length === 0 && <p className="text-muted">Нет активных заявок</p>}
              </Card>

    </>
  )}

</AppLayout>
```

## Данные (API)

| Блок | Endpoint | Источник |
|---|---|---|
| `user` | `GET /auth/me` | AuthContext |
| `profile` | `GET /player/profile` | один запрос на маунт |
| `summary` (KDA, GPM, MMR, recent matches, personaname, avatar_url) | `GET /player/{profile.id}/stats/overview?period={range}` | range-зависимо |
| `detailedFeatures.categories` (Skill rings) | `GET /player/{profile.id}/detailed-features?period={range}` | для 3 топ-категорий |
| `history` (последний Oracle ответ) | `GET /ai/history?limit=1` | один |
| Сессии (`nextSession`) | `GET /training-sessions/my` → фильтр `status === 'PLANNED'`, sort по `scheduled_at`, первая | один |
| `activeRequests` | `GET /matchmaking/requests/my` → filter `status in ('NEW','MATCHING','WAITING_CONFIRMATION')` | один |
| `summary.avatar_url` для `<Avatar>` | из того же `/stats/overview` | — |

Загрузка: `Promise.all([profile, summary, features, history, sessions, requests])`. До прихода — `<SkeletonCard>` для каждого блока.

## Замены применены

См. `REPLACEMENTS.md`:
- **§3**: sidebar = canonical PLAYER (не как на PNG).
- **§4**: убраны MMR-дельты ("+85 сегодня"), "Динамика MMR" → cumulative winrate, фейковые "3 AI рекомендации" → последний из `/ai/history`, skill rings = только реальные категории.
- **§16**: декор в углу sidebar — `decorRender('dashboardCorner')`. Аватар игрока — `summary.avatar_url`, fallback на initials.

## Acceptance

- [ ] Если нет linked Steam → empty-state с CTA "Привязать Steam" (POST `/player/link-steam` через модал ввода Steam ID или редирект на `/auth/steam/login?mode=link`).
- [ ] Skeleton'ы на каждой карточке во время загрузки.
- [ ] Все суммы / проценты / KDA отформатированы (нули, отрицательные не показываем как мусор).
- [ ] Range select меняет данные для блоков A, B, C (с retry).
- [ ] Sidebar collapse работает (toggle сохраняется в `localStorage`).
- [ ] Mobile (< 768px): sidebar превращается в drawer (по burger из topbar), stat-grid → 1 колонка, two-column → стак.

## States

| State | Поведение |
|---|---|
| no Steam | `<EmptyState>` с CTA "Привязать Steam" |
| loading | `<SkeletonCard>` для каждой карточки |
| partial (ML вернул только summary, не detailed) | hero + stat-grid рендерим, skill rings → empty-state "Аналитика рассчитывается, попробуй через минуту" |
| error 5xx | `<Alert variant="error">` с кнопкой "Повторить" |
| empty Oracle history | empty-state с кнопкой → `/ai-chat` |
| empty sessions | empty-state с кнопкой → `/coaches` |
