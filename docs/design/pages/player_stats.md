# Player Stats (Аналитика)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_player_stats.png` |
| **Код** | `services/frontend/src/pages/player/Stats.tsx` |
| **Layout** | `<AppLayout sidebar="player">` (или COACH — этот роут доступен и тренерам) |
| **Route** | `/stats` |
| **Доступ** | PLAYER, COACH |

## Sidebar

Канонический PLAYER (см. `REPLACEMENTS.md §3`), active = `Аналитика`. ⚠ На PNG много лишних пунктов (Герои/Мета/Гайды/Коучинг/Сообщество) — **не добавляем**.

## Композиция

```
<AppLayout>
  <header className="page-header flex-between">
    <div>
      <h1>Аналитика</h1>
      <p className="text-muted">Глубокий разбор твоей игры по последним матчам</p>
    </div>
    <div className="filter-bar">
      <SegmentedToggle value={range} options={['7','30','90','season']}>...</SegmentedToggle>
      <Select value={role} options={['Все роли','Carry','Mid','Off','Soft','Hard']}>...</Select>
      <Select value={hero} options={['Все герои', ...heroOptions]}>...</Select>
      <Button variant="outline" onClick={exportCsv} icon="download">Экспорт</Button>
    </div>
  </header>

  {!profile.dota_account_id && <EmptyState icon="steam" title="Привяжи Steam" cta={...} />}

  1. KPI ROW — grid-4
     <StatCard icon="match"    label="Матчей" value={summary.games_analyzed} />
     <StatCard icon="target"   label="Винрейт" value={(summary.winrate * 100).toFixed(1) + '%'} />
     <StatCard icon="swords"   label="KDA"     value={summary.kda_avg} />
     <StatCard icon="coin"     label="GPM"     value={summary.gpm_avg} />
     ⚠ Дельты "+3.2%" — УБРАНЫ (нет history endpoint).

  2. CHART GRID — grid-2 × 2

     2.1 <Card title="Винрейт по матчам">
           <AreaLineChart data={cumulativeWinrate(summary.recent_matches)} gradient="cyan" />
         </Card>
         ⚠ Было "Динамика MMR +850 MMR" — **заменено** (REPLACEMENTS §4).

     2.2 <Card title="Винрейт по ролям">
           <BarChart horizontal data={summary.roles_distribution}
             labels={['Carry','Mid','Off','Soft','Hard']} />
         </Card>

     2.3 <Card title="Тепловая карта активности">
           <HeatmapPlaceholder />
         </Card>
         ⚠ **toolkit-only** (см. REPLACEMENTS §16 / §4). На самом деле — empty-state
         "Тепловая карта в разработке" с placeholder-изображением minimap silhouette.

     2.4 <Card title="Радар скиллов">
           <RadarChart
             you={detailedFeatures.categories.map(c => c.score)}
             baseline={detailedFeatures.categories.map(c => c.target)}
             labels={detailedFeatures.categories.map(c => c.label)} />
         </Card>

  3. <Card title="Топ герои по эффективности">
       <DataTable
         columns={['Hero','Матчей','Винрейт','KDA','Влияние']}
         rows={summary.top_heroes.map(h => ({
           hero: <HeroIcon heroId={h.hero_id} size={32} />,
           matches: h.games,
           winrate: `${(h.winrate * 100).toFixed(1)}%`,
           kda: h.kda,
           impact: <ProgressBar value={h.impact_score * 100} />
         }))} />
     </Card>

  4. <Card title="Инсайты Оракула" variant="accent">
       {detailedFeatures.top_gaps.slice(0, 3).map(gap => (
         <OracleHint key={gap.key} text={gap.label} value={`-${gap.gap.toFixed(1)} от целевого`} />
       ))}
     </Card>
     ⚠ Если нет данных — empty-state с CTA → /ai-chat.

</AppLayout>
```

## Данные

| Блок | Endpoint |
|---|---|
| KPI + winrate chart | `GET /player/{me.id}/stats/overview?period={range}&role={role}&hero_id={hero}` → `summary`, `summary.recent_matches`, `summary.roles_distribution`, `summary.top_heroes` |
| Радар + heatmap (categories.score/target) + top_gaps | `GET /player/{me.id}/detailed-features?period={range}&role={role}&hero_id={hero}` → `categories`, `top_gaps` |

⚠ `me.id` = `profile.id` (получаем через `GET /player/profile` один раз).

## Замены

- **§4**: "Динамика MMR" → cumulative winrate.
- **§4**: Heatmap — toolkit-only, на странице placeholder.
- **§16**: Hero icons через `<HeroIcon heroId>`. Иконка ранга — `<RankBadge>` (не используется здесь, но при desire — добавить).
- KPI без дельт.

## Acceptance

- [ ] Фильтры обновляют все 4 чарта + table.
- [ ] Sticky filter-bar при скролле (опц.).
- [ ] Loading skeleton на каждый чарт.
- [ ] Export CSV — собирается на фронте из `summary.recent_matches`.
- [ ] Mobile: charts становятся 1-колонка.

## States

| State | Поведение |
|---|---|
| no Steam | empty-state с CTA |
| games_analyzed === 0 | "Слишком мало данных, сыграй ещё пару матчей" |
| ML недоступен | `<Alert>` "ML-сервис временно недоступен, повтори через минуту" |
