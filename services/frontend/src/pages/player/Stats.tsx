import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { loadHeroes, heroName, heroIcon, roleName } from '../../api/heroes';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { ComponentBar } from '../../ui/SkillRing';
import { RoleBadge, InfoTooltip } from '../../ui/GameComponents';

const CHART_STYLE = { background: '#151c2e', border: '1px solid #1e2a45', color: '#e8edf5' };
const COLORS = ['#00d4aa', '#7c5cfc', '#ffa502', '#ff4757', '#1e90ff', '#ff6b81'];
const DEFAULT_FILTERS = { mode: 'ranked', period: '50', role: '', hero_id: '' };
const MODE_LABELS: Record<string, string> = { ranked: 'Рейтинговые', turbo: 'Turbo', all: 'Все режимы' };
const PERIOD_LABELS: Record<string, string> = { '20': '20 игр', '50': '50 игр', month: '30 дней', all: 'Вся история' };
const PERIOD_OPTIONS = [
  { value: '20', label: '20 игр' },
  { value: '50', label: '50 игр' },
  { value: 'month', label: '30 дней' },
  { value: 'all', label: 'Вся история' },
];
const ROLE_OPTIONS = [
  { value: '1', label: 'Позиция 1', short: 'Carry' },
  { value: '2', label: 'Позиция 2', short: 'Mid' },
  { value: '3', label: 'Позиция 3', short: 'Offlane' },
  { value: '4', label: 'Позиция 4', short: 'Soft Support' },
  { value: '5', label: 'Позиция 5', short: 'Hard Support' },
];

const FEATURE_TIPS: Record<string, string> = {
  farming: 'Эффективность фарма: золото в минуту, крипов в минуту.',
  combat: 'Эффективность в боях: урон, убийства, ассисты.',
  survival: 'Выживание: смерти и вклад в команду.',
  vision: 'Контроль карты: варды, dewarding.',
  objectives: 'Давление на объекты: башни и Рошан.',
  mechanics: 'Механический скилл: APM, набор опыта.',
  consistency: 'Стабильность показателей от матча к матчу.',
  control: 'Контроль противников: станы и инициация.',
};

export default function PlayerStats() {
  const [stats, setStats] = useState<any>(null);
  const [features, setFeatures] = useState<any>(null);
  const [tab, setTab] = useState('trends');
  const [pid, setPid] = useState<number | null>(null);
  const [retried, setRetried] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [heroOptions, setHeroOptions] = useState<any[]>([]);
  const [steamData, setSteamData] = useState<any>(null);
  const [showFilterNotes, setShowFilterNotes] = useState(false);

  const apiParams = {
    mode: filters.mode,
    period: filters.period,
    ...(filters.role ? { role: Number(filters.role) } : {}),
    ...(filters.hero_id ? { hero_id: Number(filters.hero_id) } : {}),
  };

  useEffect(() => {
    loadHeroes().then((heroes) => {
      setHeroOptions(Object.values(heroes).sort((a: any, b: any) => a.localized_name.localeCompare(b.localized_name)));
    });
    coreApi.get('/me/overview').then((r) => {
      // For COACH role overview.profile.id is coach_profile_id, while
      // overview.profile.player_profile_id holds the linked player profile.
      // Use whichever is present so this page works for both roles.
      const profileId = r.data?.profile?.player_profile_id ?? r.data?.profile?.id;
      if (profileId) {
        setPid(profileId);
      }
    }).catch(() => {});
    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pid) return;
    coreApi.get(`/player/${pid}/stats/overview`, { params: apiParams }).then((r2) => setStats(r2.data)).catch(() => {});
    coreApi.get(`/player/${pid}/detailed-features`, { params: apiParams }).then((r2) => setFeatures(r2.data)).catch(() => {});
  }, [pid, filters.mode, filters.period, filters.role, filters.hero_id]);

  useEffect(() => {
    if (retried || !pid) return;
    const hasNoRoles = !stats?.roles?.actual_roles_distribution || Object.keys(stats.roles.actual_roles_distribution).length === 0;
    const hasNoStats = !stats?.summary?.games_analyzed;
    if (hasNoRoles && hasNoStats) return;
    if (hasNoRoles && !hasNoStats) {
      setRetried(true);
      coreApi.post('/player/sync-steam').then(() => {
        coreApi.get(`/player/${pid}/stats/overview`, { params: apiParams }).then((r2) => setStats(r2.data)).catch(() => {});
      }).catch(() => {});
    }
  }, [stats, pid, retried]);

  const summary = stats?.summary || {};
  const trends = stats?.trends || {};
  const heroes = stats?.heroes?.top_heroes || [];
  const comparisons = stats?.comparisons?.vs_same_tier || {};
  const roles = stats?.roles?.actual_roles_distribution || {};
  const categories = features?.categories || [];
  const applied = summary.filters_applied || features?.filters_applied || {};
  const scopeLabel = applied.label || `${PERIOD_LABELS[filters.period]}, ${MODE_LABELS[filters.mode]}`;
  const matchesCount = applied.matches_count ?? summary.games_analyzed ?? 0;
  const metricCounts = summary.metric_counts || {};
  const sampleQuality = summary.sample_quality || {};
  const dataFreshness = summary.data_freshness;
  const roleCounts = applied.role_counts || {};
  const unknownRoleCount = applied.unknown_role_count ?? 0;
  const modeCounts = applied.mode_counts || {};
  const reportBaseCount = applied.base_report_count ?? applied.after_period_count ?? applied.before_period_count ?? matchesCount;
  const narrowingApplied = Boolean(applied.narrowing_applied);
  const totalGames =
    steamData?.lifetime_games
    ?? steamData?.total_games
    ?? ((steamData?.win || 0) + (steamData?.lose || 0));
  const accountMmr = steamData?.mmr_estimate ?? summary.estimated_mmr;
  const accountWinrate = totalGames > 0 ? (steamData?.win || 0) / totalGames : null;
  const selectedHeroId = filters.hero_id ? Number(filters.hero_id) : null;
  const selectedHero = selectedHeroId ? heroOptions.find((h: any) => Number(h.hero_id) === selectedHeroId) : null;
  const hasFilterNotes = Boolean(
    (dataFreshness && dataFreshness !== 'fresh') ||
    summary.notice ||
    matchesCount === 0 ||
    metricCounts.gpm === 0 ||
    modeCounts.other > 0 ||
    modeCounts.unknown > 0 ||
    (unknownRoleCount > 0 && !filters.role)
  );
  const roleContext = applied.role
    ? `${applied.role_source === 'auto' ? 'основная роль' : 'роль'} ${roleName(applied.role)}`
    : 'все позиции';

  const rolesData = Object.entries(roles)
    .map(([k, v]: [string, any]) => ({ name: roleName(k.replace('POS', '')), key: k, value: Math.round(v * 100) }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="page-header">
        <h1>Разбор игры</h1>
        <p>Матчевая сводка: {scopeLabel}</p>
      </div>

      {steamData?.linked && (
        <div className="card mb-20">
          <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Данные аккаунта</h3>
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
                Это общие данные Steam/OpenDota. Они не меняются от фильтров отчёта ниже.
              </p>
            </div>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              <span className="badge badge-accent">MMR: {accountMmr || '—'}</span>
              <span className="badge badge-purple">Игр аккаунта: {totalGames ? totalGames.toLocaleString('ru-RU') : '—'}</span>
              <span className="badge">
                WR аккаунта: {accountWinrate != null ? `${(accountWinrate * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-20">
        <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Фильтры боевого отчёта</h3>
            <p className="text-muted" style={{ margin: '4px 0 0' }}>
              Отчёт считается только по выбранному срезу: {scopeLabel}. База среза: {reportBaseCount} матчей.
              {narrowingApplied ? ` После фильтра позиции/героя осталось: ${matchesCount}.` : ` В отчёте: ${matchesCount}.`}
              Сравнение строится с игроками того же ранга
              {applied.role ? ` и ${roleContext}` : ''}{filters.hero_id ? ` на герое ${heroName(Number(filters.hero_id))}` : ''}.
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Сбросить</button>
        </div>
        {hasFilterNotes && (
          <div className="card mt-20" style={{ padding: 12, borderStyle: 'dashed' }}>
            <div className="flex-between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong>Пояснения к данным и фильтрам</strong>
                <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Качество выборки, недостающие поля и распределение режимов.
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowFilterNotes((v) => !v)}>
                {showFilterNotes ? 'Свернуть' : 'Развернуть'}
              </button>
            </div>
            {showFilterNotes && (
              <div style={{ marginTop: 10 }}>
                {dataFreshness && dataFreshness !== 'fresh' && (
                  <div className="alert mb-10" style={{ fontSize: '0.86rem' }}>
                    {dataFreshness === 'stale' && 'Последние доступные матчи давно не обновлялись. Отчёт показывает последнюю известную форму, а не текущую.'}
                    {dataFreshness === 'low_sample' && 'В выбранном срезе мало матчей, поэтому оценка предварительная.'}
                    {dataFreshness === 'no_matches' && 'В выбранном срезе нет матчей. Попробуйте другой период или обновите данные Steam.'}
                    {sampleQuality.latest_match_at && (
                      <div className="text-muted" style={{ marginTop: 6 }}>
                        Последний матч: {new Date(sampleQuality.latest_match_at).toLocaleDateString('ru-RU')}.
                      </div>
                    )}
                  </div>
                )}
                {(summary.notice || matchesCount === 0 || metricCounts.gpm === 0) && (
                  <div className="alert mb-10" style={{ fontSize: '0.86rem' }}>
                    {summary.notice || (
                      metricCounts.gpm === 0
                        ? 'В выбранном срезе есть матчи, но GPM/XPM ещё не загружены для этих строк. Нажмите «Обновить данные» в настройках и дождитесь фоновой догрузки.'
                        : 'По выбранным фильтрам нет матчей. Проверьте режим, роль, героя или период.'
                    )}
                    {applied.total_available != null && (
                      <div className="text-muted" style={{ marginTop: 6 }}>
                        Загружено в базе: {applied.total_available}; после режима: {applied.after_mode_count ?? '—'};
                        после периода: {applied.after_period_count ?? '—'}.
                      </div>
                    )}
                  </div>
                )}
                {(modeCounts.other > 0 || modeCounts.unknown > 0) && (
                  <div className="alert mb-10" style={{ fontSize: '0.86rem' }}>
                    Распределение режимов в загруженной истории: ranked {modeCounts.ranked || 0}, turbo {modeCounts.turbo || 0}
                    {modeCounts.other > 0 ? `, другие режимы ${modeCounts.other}` : ''}
                    {modeCounts.unknown > 0 ? `, режим не определён ${modeCounts.unknown}` : ''}.
                    Режим «Все» включает все эти категории.
                  </div>
                )}
                {unknownRoleCount > 0 && !filters.role && (
                  <div className="alert" style={{ fontSize: '0.86rem' }}>
                    У {unknownRoleCount} матчей в текущем отчёте позиция ещё не определена OpenDota.
                    Поэтому суммы по POS могут быть меньше, чем {reportBaseCount} матчей отчёта.
                    После parsed-догрузки эти матчи постепенно распределятся по позициям.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="grid-4 mt-20">
          <label>
            <div className="form-label">Режим</div>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              {[
                { value: 'ranked', label: 'Рейтинговые', count: (modeCounts.ranked || 0) + (modeCounts.unknown || 0) },
                { value: 'turbo', label: 'Turbo', count: modeCounts.turbo || 0 },
                { value: 'all', label: 'Все', count: modeCounts.all || 0 },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`btn btn-sm ${filters.mode === m.value ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setFilters((f) => ({ ...f, mode: m.value }))}
                >
                  {m.label} {m.count ? `(${m.count})` : ''}
                </button>
              ))}
            </div>
            {modeCounts.unknown > 0 && (
              <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: 6 }}>
                {modeCounts.unknown} матчей без режима считаются в ranked-срезе, чтобы не терять старую историю.
              </div>
            )}
          </label>
          <label>
            <div className="form-label">Период</div>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`btn btn-sm ${filters.period === p.value ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setFilters((f) => ({ ...f, period: p.value }))}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </label>
          <label>
            <div className="form-label">Позиция</div>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${filters.role === '' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilters((f) => ({ ...f, role: '' }))}
              >
                Все ({reportBaseCount})
              </button>
              {ROLE_OPTIONS.map((r) => {
                const count = roleCounts[r.value] || 0;
                return (
                  <button
                    key={r.value}
                    type="button"
                    className={`btn btn-sm ${filters.role === r.value ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setFilters((f) => ({ ...f, role: r.value }))}
                    title={r.label}
                  >
                    {r.short} ({count})
                  </button>
                );
              })}
            </div>
            {unknownRoleCount > 0 && (
              <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: 6 }}>
                Не определено: {unknownRoleCount}
              </div>
            )}
          </label>
          <label>
            <div className="form-label">Герой</div>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${filters.hero_id === '' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilters((f) => ({ ...f, hero_id: '' }))}
              >
                Все герои
              </button>
              {selectedHero && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setFilters((f) => ({ ...f, hero_id: '' }))}
                  title="Нажмите, чтобы сбросить героя"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <img
                    src={heroIcon(selectedHero.hero_id)}
                    alt=""
                    style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {selectedHero.localized_name || heroName(selectedHero.hero_id)}
                </button>
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 8,
                maxHeight: 220,
                overflowY: 'auto',
                marginTop: 10,
                paddingRight: 4,
              }}
            >
              {heroOptions.map((h: any) => {
                const active = filters.hero_id === String(h.hero_id);
                return (
                  <button
                    key={h.hero_id}
                    type="button"
                    className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setFilters((f) => ({ ...f, hero_id: String(h.hero_id) }))}
                    style={{
                      justifyContent: 'flex-start',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                    }}
                    title={h.localized_name || h.name}
                  >
                    <img
                      src={heroIcon(h.hero_id)}
                      alt=""
                      style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', flex: '0 0 24px' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.localized_name || heroName(h.hero_id)}
                    </span>
                  </button>
                );
              })}
            </div>
          </label>
        </div>
      </div>

      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-card-label">База среза <InfoTooltip text="Сколько матчей попало в отчёт после выбора режима и периода, до позиции/героя." /></div>
          <div className="stat-card-value">{reportBaseCount}</div>
          {narrowingApplied && <div className="text-muted" style={{ fontSize: '0.78rem' }}>после фильтров: {matchesCount}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Игр аккаунта <InfoTooltip text="Общее число игр из профиля OpenDota/Steam. Это не то же самое, что текущий отчёт." /></div>
          <div className="stat-card-value">{totalGames ? totalGames.toLocaleString('ru-RU') : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Результативность <InfoTooltip text={`Доля побед в выборке: ${scopeLabel}.`} /></div>
          <div className="stat-card-value">{summary.winrate !== null && summary.winrate !== undefined ? `${(summary.winrate * 100).toFixed(1)}%` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">MMR аккаунта <InfoTooltip text="Единая оценка аккаунта из Steam/OpenDota ранга. Фильтры отчёта её не меняют." /></div>
          <div className="stat-card-value text-accent">{accountMmr || '—'}</div>
        </div>
      </div>

      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-card-label">Матчей после всех фильтров <InfoTooltip text="Итоговая выборка после режима, периода, позиции и героя." /></div>
          <div className="stat-card-value">{matchesCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Боевой счёт <InfoTooltip text="KDA: (убийства + ассисты) / смерти." /></div>
          <div className="stat-card-value">{summary.kda_avg || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Фарм-темп <InfoTooltip text="GPM: золото в минуту в итоговой выборке." /></div>
          <div className="stat-card-value">{summary.gpm_avg || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Темп опыта <InfoTooltip text="XPM: опыт в минуту в итоговой выборке." /></div>
          <div className="stat-card-value">{summary.xpm_avg || '—'}</div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'trends' ? 'active' : ''}`} onClick={() => setTab('trends')}>Темп</div>
        <div className={`tab ${tab === 'heroes' ? 'active' : ''}`} onClick={() => setTab('heroes')}>Герои</div>
        <div className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Позиции</div>
        <div className={`tab ${tab === 'features' ? 'active' : ''}`} onClick={() => setTab('features')}>Скиллы</div>
        <div className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>Сравнение</div>
      </div>

      {tab === 'trends' && (
        <div>
          {trends.gpm_over_time && trends.gpm_over_time.length > 0 ? (
            <>
              <div className="card mb-20">
                <div className="section-header">
                  <h3>Фарм-темп по отрезкам <InfoTooltip text="Как менялось ваше золото в минуту от матча к матчу." /></h3>
                  <div className="section-line" />
                </div>
                {metricCounts.gpm === 0 ? (
                  <p className="text-muted text-center" style={{ padding: 30 }}>
                    Для выбранных матчей нет загруженного GPM. Это не нулевой фарм, а отсутствующая метрика.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trends.gpm_over_time}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                      <XAxis dataKey="ts" stroke="#7b8ba5" fontSize={11} />
                      <YAxis stroke="#7b8ba5" fontSize={11} />
                      <Tooltip contentStyle={CHART_STYLE} />
                      <Line type="monotone" dataKey="gpm" stroke="#00d4aa" strokeWidth={2.5}
                        connectNulls={false}
                        dot={{ fill: '#00d4aa', r: 3 }} activeDot={{ r: 5, fill: '#00ffc8' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="grid-2">
                <div className="card mb-20">
                  <div className="section-header">
                    <h3>Результативность</h3>
                    <div className="section-line" />
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={trends.winrate_over_time?.map((d: any) => ({ ...d, wr: +(d.winrate * 100).toFixed(1) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                      <XAxis dataKey="ts" stroke="#7b8ba5" fontSize={10} />
                      <YAxis stroke="#7b8ba5" fontSize={10} domain={[0, 100]} />
                      <Tooltip contentStyle={CHART_STYLE} />
                      <Line type="monotone" dataKey="wr" stroke="#ffa502" strokeWidth={2} name="Винрейт %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="card mb-20">
                  <div className="section-header">
                    <h3>Боевой счёт KDA</h3>
                    <div className="section-line" />
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={trends.kda_over_time}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                      <XAxis dataKey="ts" stroke="#7b8ba5" fontSize={10} />
                      <YAxis stroke="#7b8ba5" fontSize={10} />
                      <Tooltip contentStyle={CHART_STYLE} />
                      <Line type="monotone" dataKey="kda" stroke="#7c5cfc" strokeWidth={2} name="KDA" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <div className="card"><p className="text-muted text-center" style={{ padding: 30 }}>Нет данных трендов.</p></div>
          )}
        </div>
      )}

      {tab === 'heroes' && (
        <div className="card">
          <div className="section-header">
            <h3>Пул героев</h3>
            <div className="section-line" />
          </div>
          {heroes.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={heroes.map((h: any) => ({ ...h, name: heroName(h.hero_id) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                  <XAxis dataKey="name" stroke="#7b8ba5" fontSize={10} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#7b8ba5" fontSize={11} />
                  <Tooltip contentStyle={CHART_STYLE} />
                  <Bar dataKey="games" fill="#00d4aa" name="Игр" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="table-wrap mt-20">
                <table>
                  <thead><tr><th>Герой</th><th>Игр</th><th>WR</th><th>Боевой счёт</th></tr></thead>
                  <tbody>
                    {heroes.map((h: any) => (
                      <tr key={h.hero_id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <img src={heroIcon(h.hero_id)} alt="" style={{ width: 28, height: 28, borderRadius: 4 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <strong>{heroName(h.hero_id)}</strong>
                        </td>
                        <td>{h.games}</td>
                        <td style={{ color: h.winrate >= 0.5 ? 'var(--accent)' : 'var(--danger)' }}>
                          {(h.winrate * 100).toFixed(1)}%
                        </td>
                        <td>{h.avg_kda}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-muted text-center" style={{ padding: 30 }}>Нет данных по героям.</p>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <div className="card">
          <div className="section-header">
            <h3>Роли в матчах</h3>
            <div className="section-line" />
          </div>
          {rolesData.length > 0 ? (
            <div className="grid-2">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={rolesData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={110} innerRadius={60}
                    label={({ name, value }) => `${name}: ${value}%`}>
                    {rolesData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                {rolesData.map((r: any, i: number) => (
                  <div key={r.key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: '1px solid var(--border-color)',
                  }}>
                    <div className="flex gap-10" style={{ alignItems: 'center' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
                      <RoleBadge role={r.key.replace('POS', '')} />
                    </div>
                    <strong>{r.value}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted text-center" style={{ padding: 30 }}>
              Данные по позициям загружаются...
            </p>
          )}
        </div>
      )}

      {tab === 'features' && (
        <div>
          {categories.length > 0 ? (
            categories.map((cat: any) => (
              <div key={cat.key} className="card mb-20">
                <div className="flex-between mb-10">
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                    {cat.name}
                    <InfoTooltip text={FEATURE_TIPS[cat.key] || 'Категория навыков.'} />
                  </h3>
                  <div className="flex gap-10">
                    <span className="badge badge-accent">Текущий: {cat.score}/10</span>
                    <span className="badge badge-warning">Цель: {cat.target}/10</span>
                  </div>
                </div>
                {cat.components.map((comp: any) => (
                  <ComponentBar key={comp.key} name={comp.name} playerValue={comp.player_value}
                    targetValue={comp.target_value} baselineValue={comp.baseline_value}
                    score={comp.score} targetScore={comp.target_score}
                    missing={Boolean(comp.missing)} />
                ))}
              </div>
            ))
          ) : (
            <div className="card"><p className="text-muted text-center" style={{ padding: 30 }}>Навыки рассчитываются после загрузки матчей.</p></div>
          )}
        </div>
      )}

      {tab === 'compare' && (
        <div className="card">
          <div className="section-header">
            <h3>
              Сравнение с игроками того же ранга и роли
              <InfoTooltip text="Насколько ваши метрики отличаются от среднего для вашего ранга. 100% = на уровне." />
            </h3>
            <div className="section-line" />
          </div>
          {Object.keys(comparisons).length > 0 ? (
            <div className="grid-3">
              {Object.entries(comparisons).map(([key, val]: [string, any]) => {
                const pct = Math.round(val * 100);
                const color = pct >= 100 ? 'var(--accent)' : pct >= 80 ? 'var(--warning)' : 'var(--danger)';
                return (
                  <div key={key} className="stat-card">
                    <div className="stat-card-label">{key.replace(/_/g, ' ')}</div>
                    <div className="stat-card-value" style={{ color }}>{pct}%</div>
                    <div className="progress-bar" style={{ marginTop: 8 }}>
                      <div className="progress-bar-fill" style={{
                        width: `${Math.min(pct, 100)}%`,
                        background: color,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted text-center" style={{ padding: 30 }}>Нет данных для сравнения.</p>
          )}
        </div>
      )}
    </div>
  );
}
