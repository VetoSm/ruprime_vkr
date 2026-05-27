import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { loadHeroes, heroName, heroIcon, roleName } from '../../api/heroes';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';
import { EmptyState } from '../../ui/Primitives';
import { IconChevronLeft, IconChevronRight } from '../../ui/Icons';
import { IconListOutline, IconTargetOutline, IconSwordsOutline, IconCoinsOutline } from '../../ui/StatIcons';
import { Dropdown } from '../../ui/Dropdown';
import { RoleBadge } from '../../ui/GameComponents';

const CHART_STYLE = { background: '#0d1a35', border: '1px solid rgba(22, 233, 212, 0.20)', color: '#e8edf5', borderRadius: 8 };

const MATCH_COUNT_OPTIONS: { id: string; label: string; backend: string }[] = [
  { id: '10',  label: '10 матчей',  backend: '10' },
  { id: '20',  label: '20 матчей',  backend: '20' },
  { id: '50',  label: '50 матчей',  backend: '50' },
  { id: '100', label: '100 матчей', backend: '100' },
];

const DAY_PERIOD_OPTIONS: { id: string; label: string; backend: string }[] = [
  { id: '3d',  label: '3 дня',   backend: '3d' },
  { id: '7d',  label: '7 дней',  backend: '7d' },
  { id: '30d', label: '30 дней', backend: '30d' },
  { id: '90d', label: '90 дней', backend: '90d' },
  { id: 'all', label: 'Все',     backend: 'all' },
];

const PERIOD_OPTIONS = [...MATCH_COUNT_OPTIONS, ...DAY_PERIOD_OPTIONS];

const MODE_DROPDOWN_OPTIONS = [
  { value: 'all', label: 'Все матчи' },
  { value: 'ranked', label: 'Ranked' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'unranked', label: 'Unranked' },
];

const ROLE_DROPDOWN_OPTIONS = [
  { value: '',  label: 'Все роли' },
  { value: '1', label: 'Carry' },
  { value: '2', label: 'Mid' },
  { value: '3', label: 'Offlane' },
  { value: '4', label: 'Soft Support' },
  { value: '5', label: 'Hard Support' },
];

/* ============ Метрики для графика "Динамика"
 * Ключ — имя серии в trends (без `_over_time`), `field` — имя свойства
 * внутри точек серии (например, `gpm`/`winrate`). `decimals` контролирует
 * формат подписи на тултипе/осях. `pct` — серия идёт в %.
 * ===========================================================*/
const METRIC_OPTIONS: { value: string; label: string; field: string; decimals: number; pct?: boolean; group?: string }[] = [
  { value: 'kda',     label: 'KDA',              field: 'kda',     decimals: 2, group: 'Бой' },
  { value: 'kills',   label: 'Убийства',         field: 'kills',   decimals: 1, group: 'Бой' },
  { value: 'deaths',  label: 'Смерти',           field: 'deaths',  decimals: 1, group: 'Бой' },
  { value: 'assists', label: 'Ассисты',          field: 'assists', decimals: 1, group: 'Бой' },
  { value: 'gpm',     label: 'GPM',              field: 'gpm',     decimals: 0, group: 'Экономика' },
  { value: 'xpm',     label: 'XPM',              field: 'xpm',     decimals: 0, group: 'Экономика' },
  { value: 'last_hits', label: 'Last-hits',      field: 'last_hits', decimals: 0, group: 'Лейн' },
  { value: 'cs_per_min', label: 'CS / мин',      field: 'cs_per_min', decimals: 2, group: 'Лейн' },
  { value: 'hero_damage_per_min', label: 'Урон / мин', field: 'hero_damage_per_min', decimals: 0, group: 'Бой' },
  { value: 'tower_damage', label: 'Урон по строениям', field: 'tower_damage', decimals: 0, group: 'Объекты' },
  { value: 'winrate', label: 'Винрейт, %',       field: 'winrate', decimals: 1, pct: true, group: 'Итог' },
];

const FEATURE_TIPS: Record<string, string> = {
  farming: 'Эффективность фарма: золото в минуту, добивание крипов.',
  combat: 'Эффективность в боях: урон, убийства, ассисты.',
  survival: 'Выживание: смерти и вклад в команду.',
  vision: 'Контроль карты: варды, дюварды (по parsed-матчам).',
  objectives: 'Давление на объекты: башни и Рошан.',
  mechanics: 'Механический скилл: APM, набор опыта.',
  consistency: 'Стабильность показателей от матча к матчу.',
  control: 'Контроль противников: станы и инициация.',
};

function fmtDelta(curr?: number | null, prev?: number | null, digits = 1, suffix = '') {
  if (typeof curr !== 'number' || typeof prev !== 'number' || !Number.isFinite(curr - prev)) {
    return { text: '—', tone: 'neutral' as const };
  }
  const d = curr - prev;
  if (Math.abs(d) < 0.001) return { text: `±${(0).toFixed(digits)}${suffix}`, tone: 'neutral' as const };
  const sign = d > 0 ? '+' : '';
  const tone = d > 0 ? 'pos' as const : 'neg' as const;
  return { text: `${sign}${d.toFixed(digits)}${suffix}`, tone };
}

/* ============ Stat tile ============ */
function StatTile({
  label, value, icon, tint, deltaText, deltaTone, deltaContext,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tint: 'cyan' | 'purple' | 'gold' | 'rose';
  deltaText?: string;
  deltaTone?: 'pos' | 'neg' | 'neutral';
  deltaContext?: string;
}) {
  return (
    <div className={`stat-tile stat-tile--${tint}`}>
      <div className="stat-tile-icon">{icon}</div>
      <div className="stat-tile-body" style={{ flex: 1 }}>
        <div className="stat-tile-label">{label}</div>
        <div className="stat-tile-value-row">
          <span className="stat-tile-value">{value}</span>
          {deltaText && (
            <span className={`stat-tile-delta ${deltaTone === 'pos' ? 'pos' : deltaTone === 'neg' ? 'neg' : 'neutral'}`}>
              {deltaText}
            </span>
          )}
        </div>
        {deltaContext && <div className="stat-tile-delta-context">{deltaContext}</div>}
      </div>
    </div>
  );
}

/* ============ Главный компонент ============ */
export default function PlayerStats() {
  const { user } = useAuth();
  const [pid, setPid] = useState<number | null>(null);
  const [missingCoachSteam, setMissingCoachSteam] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [features, setFeatures] = useState<any>(null);
  const [steamData, setSteamData] = useState<any>(null);
  const [heroOptions, setHeroOptions] = useState<any[]>([]);

  const [period, setPeriod] = useState<typeof PERIOD_OPTIONS[number]['id']>('30d');
  const [matchMode, setMatchMode] = useState<'all' | 'ranked' | 'turbo' | 'unranked'>('all');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedHero, setSelectedHero] = useState<string>('');
  const [chartMetric, setChartMetric] = useState<string>('kda');
  const [topHeroesExpanded, setTopHeroesExpanded] = useState(false);

  // Активная фитча для widget "Слабые места"
  const [activeFeatureIdx, setActiveFeatureIdx] = useState(0);

  const backendPeriod = PERIOD_OPTIONS.find(p => p.id === period)?.backend || '50';

  useEffect(() => {
    loadHeroes().then((heroes) => {
      setHeroOptions(Object.values(heroes).sort((a: any, b: any) => a.localized_name.localeCompare(b.localized_name)));
    });
    coreApi.get('/me/overview').then((r) => {
      const profile = r.data?.profile || {};
      const profileId = r.data?.role === 'COACH' ? profile.player_profile_id : profile.id;
      if (profileId) setPid(profileId);
      if (r.data?.role === 'COACH' && !profileId) setMissingCoachSteam(true);
    }).catch(() => {});
    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pid) return;
    // Сбрасываем активный выбор в списке "слабых мест" и старые данные,
    // чтобы при смене фильтра старая выборка не подмешивалась к новой.
    setActiveFeatureIdx(0);
    setStats(null);
    setFeatures(null);
    let cancelled = false;
    const params: any = { mode: matchMode, period: backendPeriod };
    if (selectedRole)  params.role = Number(selectedRole);
    if (selectedHero)  params.hero_id = Number(selectedHero);
    coreApi.get(`/player/${pid}/stats/overview`, { params })
      .then((r) => { if (!cancelled) setStats(r.data); })
      .catch(() => {});
    coreApi.get(`/player/${pid}/detailed-features`, { params })
      .then((r) => { if (!cancelled) setFeatures(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pid, matchMode, backendPeriod, selectedRole, selectedHero]);

  /* ---- Вычисляемые ---- */
  const summary = stats?.summary || {};
  const trends  = stats?.trends || {};
  const topHeroes = stats?.heroes?.top_heroes || [];
  const matchesCount = summary.filters_applied?.matches_count ?? summary.games_analyzed ?? 0;
  const winrate = summary.winrate ?? null;
  const kdaAvg  = summary.kda_avg ?? null;
  const gpmAvg  = summary.gpm_avg ?? null;
  const isLinked = steamData?.linked && steamData?.personaname;
  const heatmap = trends.position_heatmap || {};
  const heatmapPoints = Array.isArray(heatmap.points) ? heatmap.points : [];

  const wrDelta = useMemo(() => {
    const arr = trends.winrate_over_time;
    if (!Array.isArray(arr) || arr.length < 2) return { text: '', tone: 'neutral' as const };
    const cur  = arr[arr.length - 1]?.winrate;
    const prev = arr[0]?.winrate;
    return fmtDelta(typeof cur === 'number' ? cur * 100 : null, typeof prev === 'number' ? prev * 100 : null, 1, '%');
  }, [trends]);

  const kdaDelta = useMemo(() => {
    const arr = trends.kda_over_time;
    if (!Array.isArray(arr) || arr.length < 2) return { text: '', tone: 'neutral' as const };
    return fmtDelta(arr[arr.length - 1]?.kda, arr[0]?.kda, 1, '');
  }, [trends]);

  const gpmDelta = useMemo(() => {
    const arr = trends.gpm_over_time;
    if (!Array.isArray(arr) || arr.length < 2) return { text: '', tone: 'neutral' as const };
    return fmtDelta(arr[arr.length - 1]?.gpm, arr[0]?.gpm, 0, '');
  }, [trends]);

  /* WR по ролям + KDA + GPM из той же base-window выборки, что и KPI. */
  const roleStats = useMemo(() => {
    const backendRows = stats?.roles?.role_stats;
    if (Array.isArray(backendRows) && backendRows.length > 0) {
      return [1, 2, 3, 4, 5].map((r) => {
        const row = backendRows.find((x: any) => Number(x.role) === r) || {};
        return {
          role: r,
          label: roleName(r),
          total: Number(row.matches || 0),
          wins: Number(row.wins || 0),
          winrate: typeof row.winrate === 'number' ? row.winrate : null,
          kda: typeof row.kda === 'number' ? row.kda : null,
          gpm: typeof row.gpm === 'number' ? row.gpm : null,
        };
      });
    }
    const roleCounts = summary.filters_applied?.role_counts || {};
    return [1, 2, 3, 4, 5].map((r) => {
      return {
        role: r,
        label: roleName(r),
        total: Number(roleCounts[String(r)] || 0),
        wins: 0,
        winrate: null,
        kda: null,
        gpm: null,
      };
    });
  }, [stats, summary.filters_applied]);

  /* Радар */
  const radarData = useMemo(() => {
    const cats = features?.categories || [];
    return cats.filter((c: any) => !c.missing).map((c: any) => ({
      category: c.name,
      you: Number((c.score ?? 0).toFixed(1)),
      baseline: Number((c.target ?? 0).toFixed(1)),
    }));
  }, [features]);

  /* Все слабые места отсортированные от худшего к лучшему */
  const weakFeaturesSorted = useMemo(() => {
    const cats = features?.categories || [];
    return [...cats]
      .filter((c: any) => !c.missing && typeof c.score === 'number')
      .sort((a: any, b: any) => a.score - b.score);
  }, [features]);

  useEffect(() => {
    if (activeFeatureIdx >= weakFeaturesSorted.length) setActiveFeatureIdx(0);
  }, [weakFeaturesSorted.length, activeFeatureIdx]);

  const activeFeature = weakFeaturesSorted[activeFeatureIdx];

  /* График: трендовая метрика. Берём конфиг из METRIC_OPTIONS — это
     единственное место, где знаем как обрабатывать pct/decimals. */
  const activeMetric = useMemo(
    () => METRIC_OPTIONS.find((m) => m.value === chartMetric) || METRIC_OPTIONS[0],
    [chartMetric],
  );

  const dynamicTrend = useMemo(() => {
    const key = `${activeMetric.value}_over_time`;
    const arr = (trends as any)[key];
    if (!Array.isArray(arr)) return [];
    return arr.map((p: any) => {
      const raw = p[activeMetric.field];
      let value = typeof raw === 'number' ? raw : Number(raw);
      if (activeMetric.pct && Number.isFinite(value)) value = value * 100;
      if (!Number.isFinite(value)) value = 0;
      // X-ось — дата конца батча матчей (последний матч в группировке).
      // Если бэк ещё не отдаёт start_ts/end_ts (старый ml без патча для
      // временных меток), оставим ярлык батча — UI не сломается, просто
      // покажется текст по типу "Матчи 1-20" вместо даты.
      const tsLabel = p.ts;
      const tsUnix = typeof p.end_ts === 'number'
        ? p.end_ts
        : (typeof p.start_ts === 'number' ? p.start_ts : null);
      return {
        ts: tsLabel,
        tsUnix,
        value: Number(value.toFixed(activeMetric.decimals)),
      };
    });
  }, [trends, activeMetric]);

  /* Если хоть одна точка тренда имеет реальную unix-метку, переключаем
     X-ось на даты. Это покрывает /ml-analyze-player, который отдаёт
     month-строки ("2026-04") в `ts` — мы их тоже отображаем как даты
     через парсинг, см. fallback в formatter. */
  const dynamicAxisMode: 'date' | 'label' = useMemo(() => {
    if (dynamicTrend.some((d: any) => typeof d.tsUnix === 'number' && d.tsUnix > 0)) return 'date';
    if (dynamicTrend.some((d: any) => typeof d.ts === 'string' && /^\d{4}-\d{2}/.test(d.ts))) return 'date';
    return 'label';
  }, [dynamicTrend]);

  const formatDynamicTick = (idx: number): string => {
    const p = dynamicTrend[idx];
    if (!p) return '';
    if (typeof p.tsUnix === 'number' && p.tsUnix > 0) {
      const d = new Date(p.tsUnix * 1000);
      return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    }
    if (typeof p.ts === 'string' && /^\d{4}-\d{2}/.test(p.ts)) {
      const [year, month] = p.ts.split('-');
      const d = new Date(Number(year), Number(month) - 1, 1);
      return d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
    }
    return String(p.ts ?? '');
  };

  const dynamicTicks = useMemo(() => {
    const n = dynamicTrend.length;
    if (n <= 1) return [0];
    const desired = Math.min(6, Math.max(3, Math.ceil(n / 25)));
    const ticks = new Set<number>();
    for (let i = 0; i < desired; i += 1) {
      ticks.add(Math.round((i * (n - 1)) / (desired - 1)));
    }
    return Array.from(ticks).sort((a, b) => a - b);
  }, [dynamicTrend.length]);

  const dynamicLabel = activeMetric.label;
  const dynamicGroupedOptions = useMemo(() => {
    /* Отсортированы по группам, но возвращаем плоский массив с
       group prefix в label — наш Dropdown не умеет в optgroup. */
    return METRIC_OPTIONS.map((m) => ({
      value: m.value,
      label: m.label,
      description: m.group,
    }));
  }, []);

  if (missingCoachSteam && !pid) {
    return (
      <div className="stats-page">
        <div className="card dash-card">
          <EmptyState
            title="Steam не привязан"
            description="Чтобы открыть «Мой разбор», привяжите Steam в настройках тренера. После синхронизации эта страница покажет ту же аналитику, что у игрока."
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <Link to="/settings" className="btn btn-primary btn-sm">Перейти в настройки</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-page">
      {/* ============ Header (без экспорта) ============ */}
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>{user?.role === 'COACH' ? 'Мой разбор' : 'Аналитика'}</h1>
          <p>{user?.role === 'COACH' ? 'Та же статистика игрока по твоему привязанному Steam' : 'Глубокий разбор твоей игры по последним матчам'}</p>
        </div>

        <div className="stats-header-filters">
          <div className="stats-filter-group">
            <span className="stats-filter-group-label">Матчи</span>
            <div className="seg-control">
              {MATCH_COUNT_OPTIONS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`seg-control-btn ${period === p.id ? 'active' : ''}`}
                  onClick={() => setPeriod(p.id as any)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stats-filter-group">
            <span className="stats-filter-group-label">Дни</span>
            <div className="seg-control">
              {DAY_PERIOD_OPTIONS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`seg-control-btn ${period === p.id ? 'active' : ''}`}
                  onClick={() => setPeriod(p.id as any)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Dropdown
            value={matchMode}
            onChange={(v) => setMatchMode(v as any)}
            options={MODE_DROPDOWN_OPTIONS}
            label="Тип матчей"
          />

          {/* Role — кастомный Dropdown */}
          <Dropdown
            value={selectedRole}
            onChange={setSelectedRole}
            options={ROLE_DROPDOWN_OPTIONS}
            label="Роль"
          />

          {/* Hero — кастомный Dropdown с поиском */}
          <Dropdown
            value={selectedHero}
            onChange={setSelectedHero}
            options={[
              { value: '', label: 'Все герои' },
              ...heroOptions.map((h: any) => ({
                value: String(h.hero_id),
                label: h.localized_name || h.name,
              })),
            ]}
            label="Герой"
            searchable
            maxHeight={320}
          />
        </div>
      </div>

      {/* ============ 4 stat tiles ============ */}
      <div className="grid-4 stats-tiles">
        <StatTile
          label="МАТЧЕЙ" tint="rose"
          icon={<IconListOutline />}
          value={matchesCount || '—'}
        />
        <StatTile
          label="ВИНРЕЙТ" tint="cyan"
          icon={<IconTargetOutline />}
          value={typeof winrate === 'number' ? `${(winrate * 100).toFixed(1)}%` : '—'}
          deltaText={wrDelta.text}
          deltaTone={wrDelta.tone as any}
          deltaContext={wrDelta.text ? `vs первой части периода` : undefined}
        />
        <StatTile
          label="KDA" tint="purple"
          icon={<IconSwordsOutline />}
          value={typeof kdaAvg === 'number' ? Number(kdaAvg).toFixed(2) : '—'}
          deltaText={kdaDelta.text}
          deltaTone={kdaDelta.tone as any}
          deltaContext={kdaDelta.text ? `vs первой части периода` : undefined}
        />
        <StatTile
          label="GPM" tint="gold"
          icon={<IconCoinsOutline />}
          value={typeof gpmAvg === 'number' ? Number(gpmAvg).toFixed(0) : '—'}
          deltaText={gpmDelta.text}
          deltaTone={gpmDelta.tone as any}
          deltaContext={gpmDelta.text ? `vs первой части периода` : undefined}
        />
      </div>

      {/* ============ Row 2: Динамика (большая, слева) | Винрейт по ролям (справа) ============
       * График трендов — основное visual storytelling страницы, поэтому
       * занимает большую левую колонку и тянется в высоту примерно как
       * два прежних компактных «Винрейт по ролям» сложенных вместе. */}
      <div className="stats-split">
        {/* NB: НЕ ставим класс `dash-card--chart` — он определён под
            named grid-area дашборда (.dash-widgets-grid) и в контексте
            .stats-split ломает раскладку: карточка пытается занять
            несуществующую named-area "chart" и съезжает с auto-flow. */}
        <div className="card dash-card stats-dynamics-card">
          <div className="card-head">
            <div className="card-title">Динамика</div>
            <Dropdown
              value={chartMetric}
              onChange={setChartMetric}
              options={dynamicGroupedOptions}
              label="Метрика"
              size="sm"
              align="right"
              maxHeight={360}
            />
          </div>
          {dynamicTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart
                data={dynamicTrend.map((d: any, i: number) => ({ ...d, idx: i }))}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dynamicLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#16e9d4" />
                    <stop offset="100%" stopColor="#9b59ff" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22, 233, 212, 0.12)" />
                <XAxis
                  dataKey="idx"
                  type="number"
                  domain={[0, Math.max(0, dynamicTrend.length - 1)]}
                  // Линия содержит все матчи, но подписи X-оси показываем
                  // разреженно: иначе 100-500 матчей превращают ось в кашу.
                  ticks={dynamicTicks}
                  interval="preserveStartEnd"
                  stroke="#7b8ba5"
                  fontSize={11}
                  tickFormatter={(v: number) => formatDynamicTick(v)}
                />
                <YAxis stroke="#7b8ba5" fontSize={11} />
                <Tooltip
                  contentStyle={CHART_STYLE}
                  formatter={(v: any) => [v, dynamicLabel]}
                  labelFormatter={(idx: any) => {
                    const i = Number(idx);
                    if (dynamicAxisMode === 'date') return formatDynamicTick(i);
                    return dynamicTrend[i]?.ts ?? '';
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="url(#dynamicLineGrad)"
                  strokeWidth={2.6}
                  dot={false}
                  activeDot={{ r: 5, fill: '#00ffc8', stroke: '#0d1a35', strokeWidth: 2 }}
                  name={dynamicLabel}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              title="Данных пока нет"
              description={isLinked ? 'Подгружаем матчи — здесь появится твоя кривая прогресса.' : 'Привяжите Steam, чтобы построить динамику.'}
              compact
            />
          )}
        </div>

        {/* Винрейт по ролям — справа от Динамики. Поменян местами с
            «Радаром навыков»: WR по ролям информативнее как сосед графика
            динамики (две сводных метрики рядом), а радар лучше работает
            в нижнем ряду вместе с разбивкой по ролям и топом героев. */}
        <div className="card dash-card">
          <div className="card-head">
            <div className="card-title">Винрейт по ролям</div>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              по {stats?.roles?.base_report_count ?? summary.filters_applied?.base_report_count ?? matchesCount} матчам
            </span>
          </div>
          <div className="role-wr-list">
            {roleStats.map((r) => (
              <div key={r.role} className="role-wr-row">
                <span className="role-wr-label">
                  <RoleBadge role={r.role} compact />
                </span>
                <div className="role-wr-bar">
                  <div
                    className="role-wr-bar-fill"
                    style={{
                      width: r.winrate != null ? `${(r.winrate * 100).toFixed(0)}%` : '0%',
                      background: r.winrate != null && r.winrate >= 0.5
                        ? 'linear-gradient(90deg, var(--accent-bright) 0%, var(--accent) 100%)'
                        : 'linear-gradient(90deg, var(--purple) 0%, rgba(155, 89, 255, 0.6) 100%)',
                    }}
                  />
                </div>
                <span className="role-wr-value">
                  {r.winrate != null ? `${(r.winrate * 100).toFixed(0)}%` : '—'}
                  {r.total > 0 && <small> · {r.total}</small>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ Row 3: Слабые места | Тепловая карта + Топ героев ============ */}
      <div className="stats-split stats-split--wide-left">
        <div className="stats-left-stack">
        <div className="card dash-card weak-card weak-card--in-split">
          <div className="card-head">
            <div className="card-title">Слабые места — над чем работать</div>
            {weakFeaturesSorted.length > 0 && (
              <div className="weak-pager">
                <button
                  type="button"
                  className="weak-pager-btn"
                  onClick={() => setActiveFeatureIdx((i) => Math.max(0, i - 1))}
                  disabled={activeFeatureIdx === 0}
                  aria-label="Предыдущая"
                >
                  <IconChevronLeft size={14} />
                </button>
                <span>{activeFeatureIdx + 1} / {weakFeaturesSorted.length}</span>
                <button
                  type="button"
                  className="weak-pager-btn"
                  onClick={() => setActiveFeatureIdx((i) => Math.min(weakFeaturesSorted.length - 1, i + 1))}
                  disabled={activeFeatureIdx >= weakFeaturesSorted.length - 1}
                  aria-label="Следующая"
                >
                  <IconChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {activeFeature ? (
            <div className="weak-circle-layout">
              <div className="weak-circle">
                {(() => {
                  const score = activeFeature.score ?? 0;
                  const target = activeFeature.target ?? 0;
                  const pct = Math.min(100, (score / 10) * 100);
                  const targetPct = Math.min(100, (target / 10) * 100);
                  const size = 145;
                  const r = (size - 16) / 2;
                  const c = 2 * Math.PI * r;
                  const offset = c - (pct / 100) * c;
                  const targetOffset = c - (targetPct / 100) * c;
                  return (
                    <svg width={size} height={size}>
                      <defs>
                        <linearGradient id="weakRingGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%"   stopColor="#f6c463" />
                          <stop offset="100%" stopColor="#ff4757" />
                        </linearGradient>
                      </defs>
                      <circle cx={size/2} cy={size/2} r={r} stroke="rgba(22, 233, 212, 0.12)" strokeWidth="12" fill="none" />
                      <circle
                        cx={size/2} cy={size/2} r={r}
                        stroke="rgba(155, 89, 255, 0.35)"
                        strokeWidth="3" fill="none"
                        strokeDasharray={c}
                        strokeDashoffset={targetOffset}
                        transform={`rotate(-90 ${size/2} ${size/2})`}
                        strokeLinecap="round"
                      />
                      <circle
                        cx={size/2} cy={size/2} r={r}
                        stroke="url(#weakRingGrad)"
                        strokeWidth="12"
                        fill="none"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        transform={`rotate(-90 ${size/2} ${size/2})`}
                        strokeLinecap="round"
                        style={{ filter: 'drop-shadow(0 0 8px rgba(22, 233, 212, 0.4))' }}
                      />
                      <text x={size/2} y={size/2 + 10} textAnchor="middle"
                        fill="var(--accent-bright)" fontSize="31" fontWeight="800" fontFamily="var(--font-display)">
                        {score.toFixed(1)}
                      </text>
                    </svg>
                  );
                })()}
              </div>

              <div className="weak-circle-details">
                <h3 className="weak-circle-title">{activeFeature.name}</h3>
                <p className="weak-circle-desc">{FEATURE_TIPS[activeFeature.key] || 'Игровая категория, влияет на исход матча.'}</p>

                <div className="weak-circle-row">
                  <span className="weak-circle-row-label">Текущий балл</span>
                  <strong>{(activeFeature.score ?? 0).toFixed(1)} / 10</strong>
                </div>
                <div className="weak-circle-row">
                  <span className="weak-circle-row-label">Цель</span>
                  <strong style={{ color: 'var(--purple)' }}>{(activeFeature.target ?? 0).toFixed(1)} / 10</strong>
                </div>
                <div className="weak-circle-row">
                  <span className="weak-circle-row-label">Разрыв</span>
                  <strong style={{ color: 'var(--warning)' }}>
                    −{Math.max(0, (activeFeature.target ?? 0) - (activeFeature.score ?? 0)).toFixed(1)}
                  </strong>
                </div>
              </div>

              {(activeFeature.components || []).length > 0 && (
                <div className="weak-circle-components">
                  <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Компоненты</div>
                  <div className="weak-circle-components-list">
                    {(activeFeature.components || []).slice(0, 6).map((c: any) => (
                      <div key={c.key} className="weak-circle-comp-row">
                        <span className="weak-circle-comp-name">{c.name}</span>
                        <span className="weak-circle-comp-value">
                          {typeof c.player_value === 'number' ? c.player_value.toFixed(1) : c.player_value}
                          {typeof c.target_value === 'number' && <span className="text-muted"> → {c.target_value.toFixed(1)}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="weak-list">
                <div className="text-muted weak-list-caption">Все направления</div>
                <div className="weak-list-grid">
                  {weakFeaturesSorted.map((cat: any, i: number) => (
                    <button
                      key={cat.key}
                      type="button"
                      className={`weak-list-tile ${i === activeFeatureIdx ? 'active' : ''}`}
                      onClick={() => setActiveFeatureIdx(i)}
                    >
                      <span className="weak-list-tile-rank">{i + 1}</span>
                      <span className="weak-list-tile-name">{cat.name}</span>
                      <span className="weak-list-tile-score">{(cat.score ?? 0).toFixed(1)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="Недостаточно данных"
              description={isLinked ? 'Слабые направления появятся после загрузки фитчей.' : 'Привяжите Steam.'} compact />
          )}
        </div>

        <div className="card dash-card stats-radar-card">
          <div className="card-head">
            <div className="card-title">Радар навыков</div>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              ты vs цель
            </span>
          </div>
          {radarData.length > 2 ? (
            <div className="stats-radar-chart">
            <ResponsiveContainer width="100%" height={500}>
              <RadarChart data={radarData} outerRadius="82%">
                <PolarGrid stroke="rgba(22, 233, 212, 0.24)" />
                <PolarAngleAxis dataKey="category" stroke="#c7d4ea" fontSize={13} tickLine={false} />
                <PolarRadiusAxis stroke="rgba(123, 139, 165, 0.45)" fontSize={10} angle={45} />
                <Radar name="Ты" dataKey="you" stroke="#16e9d4" strokeWidth={3.2} fill="#16e9d4" fillOpacity={0.20} />
                <Radar name="Цель" dataKey="baseline" stroke="#9b59ff" strokeWidth={2.6} fill="#9b59ff" fillOpacity={0.12} />
                <Legend verticalAlign="bottom" iconType="line" wrapperStyle={{ fontSize: 11, color: '#a0b1c8' }} />
                <Tooltip contentStyle={CHART_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Недостаточно данных" description={isLinked ? 'Радар появится после загрузки фитчей.' : 'Привяжите Steam.'} compact />
          )}
        </div>
        </div>

        <div className="stats-side-stack stats-side-stack--media">
          <div className="card dash-card stats-equal-card heatmap-card">
            <div className="card-head">
              <div className="card-title">Тепловая карта</div>
              <span className="badge badge-muted">{heatmap.scope_matches || heatmap.matches || 0} матчей</span>
            </div>
            {heatmapPoints.length > 0 ? (
              <div className="match-heatmap-widget">
                <div className="match-heatmap-map" aria-label="Тепловая карта позиций">
                  <img className="match-heatmap-bg" src="/decor/dota-map.jpg" alt="" aria-hidden="true" />
                  <div className="match-heatmap-river" />
                  {heatmapPoints.map((p: any, idx: number) => {
                    const x = Math.max(0, Math.min(100, (Number(p.x) / 255) * 100));
                    const y = Math.max(0, Math.min(100, 100 - (Number(p.y) / 255) * 100));
                    const intensity = Math.max(0.12, Math.min(1, Number(p.intensity || 0)));
                    const size = 4 + intensity * 16;
                    return (
                      <span
                        key={`${p.x}-${p.y}-${idx}`}
                        className="match-heatmap-point"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          width: size,
                          height: size,
                          opacity: 0.25 + intensity * 0.65,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="match-heatmap-meta">
                  <span>
                    {Number(heatmap.events || 0).toLocaleString('ru-RU')} точек · {heatmap.matches || 0}/{heatmap.scope_matches || heatmap.matches || 0} м
                  </span>
                  <span>
                    {heatmap.source === 'role_estimate'
                      ? 'оценка по роли'
                      : heatmap.source === 'mixed_lane_pos_role'
                        ? `lane_pos + оценка (${heatmap.lane_pos_matches || 0}+${heatmap.estimated_matches || 0})`
                        : 'parsed lane_pos'}
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Нет данных карты"
                description={isLinked ? 'Карта строится по матчам выбранного игрока.' : 'Привяжите Steam.'}
                compact
              />
            )}
          </div>

          <div className={`card dash-card stats-equal-card top-heroes-card ${topHeroesExpanded ? 'expanded' : ''}`}>
            <div className="card-head">
              <div className="card-title">Топ героев</div>
              <button type="button" className="top-heroes-expand-btn" onClick={() => setTopHeroesExpanded((v) => !v)}>
                {topHeroesExpanded ? 'Свернуть' : `${topHeroes.length} в пуле`}
              </button>
            </div>
            {topHeroes.length > 0 ? (
              <div className="top-heroes-compact">
                {topHeroes.slice(0, topHeroesExpanded ? topHeroes.length : 8).map((h: any) => (
                  <div key={h.hero_id} className="top-heroes-compact-row">
                    <span className="top-heroes-compact-hero">
                      <img src={heroIcon(h.hero_id)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="top-heroes-compact-name">{heroName(h.hero_id)}</span>
                    </span>
                    <span className="top-heroes-compact-meta">
                      <span className="top-heroes-compact-games">{h.games} м</span>
                      {typeof h.pickrate === 'number' && (
                        <span className="top-heroes-compact-pick">{(h.pickrate * 100).toFixed(0)}%</span>
                      )}
                      <span className="top-heroes-compact-wr">{(h.winrate * 100).toFixed(0)}%</span>
                      <span className="top-heroes-compact-kda">{Number(h.avg_kda).toFixed(1)}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Героев пока нет" description={isLinked ? 'Подгружаем матчи.' : 'Привяжите Steam.'} compact />
            )}
          </div>

          <div className="card dash-card stats-equal-card role-stats-card">
            <div className="card-head">
              <div className="card-title">Игры по ролям</div>
              <span className="text-muted" style={{ fontSize: '0.72rem' }}>средние</span>
            </div>
            <div className="role-stats-grid">
              {roleStats.map((r) => (
                <div key={r.role} className="role-stat-cell">
                  <div className="role-stat-cell-head">
                    <span className="role-stat-cell-name">
                      <RoleBadge role={r.role} compact />
                    </span>
                    <span className="role-stat-cell-count">{r.total} м</span>
                  </div>
                  <div className="role-stat-cell-metrics">
                    <span><span className="role-stat-cell-metric-label">WR</span> <strong>{r.winrate != null ? `${(r.winrate * 100).toFixed(0)}%` : '—'}</strong></span>
                    <span><span className="role-stat-cell-metric-label">KDA</span> <strong>{r.kda != null ? r.kda.toFixed(2) : '—'}</strong></span>
                    <span><span className="role-stat-cell-metric-label">GPM</span> <strong>{r.gpm != null ? r.gpm.toFixed(0) : '—'}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
