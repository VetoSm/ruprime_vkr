import { useEffect, useMemo, useState } from 'react';
import { coreApi } from '../../api/client';
import { loadHeroes, heroName, heroIcon, roleName } from '../../api/heroes';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';
import { EmptyState } from '../../ui/Primitives';
import { IconChevronLeft, IconChevronRight } from '../../ui/Icons';
import { IconListOutline, IconTargetOutline, IconSwordsOutline, IconCoinsOutline } from '../../ui/StatIcons';
import { Dropdown } from '../../ui/Dropdown';

const CHART_STYLE = { background: '#0d1a35', border: '1px solid rgba(22, 233, 212, 0.20)', color: '#e8edf5', borderRadius: 8 };

const PERIOD_OPTIONS: { id: string; label: string; backend: string }[] = [
  { id: '7d',  label: '7 дней',  backend: '20' },
  { id: '30d', label: '30 дней', backend: 'month' },
  { id: '90d', label: '90 дней', backend: 'all' },
  { id: 'all', label: 'Сезон',   backend: 'all' },
];

const ROLE_DROPDOWN_OPTIONS = [
  { value: '',  label: 'Все роли' },
  { value: '1', label: 'Carry' },
  { value: '2', label: 'Mid' },
  { value: '3', label: 'Offlane' },
  { value: '4', label: 'Soft Support' },
  { value: '5', label: 'Hard Support' },
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
  const [pid, setPid] = useState<number | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [features, setFeatures] = useState<any>(null);
  const [steamData, setSteamData] = useState<any>(null);
  const [heroOptions, setHeroOptions] = useState<any[]>([]);

  const [period, setPeriod] = useState<typeof PERIOD_OPTIONS[number]['id']>('30d');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedHero, setSelectedHero] = useState<string>('');
  const [chartMetric, setChartMetric] = useState<'gpm' | 'xpm' | 'kda' | 'winrate'>('kda');

  // Активная фитча для widget "Слабые места"
  const [activeFeatureIdx, setActiveFeatureIdx] = useState(0);

  const backendPeriod = PERIOD_OPTIONS.find(p => p.id === period)?.backend || '50';

  useEffect(() => {
    loadHeroes().then((heroes) => {
      setHeroOptions(Object.values(heroes).sort((a: any, b: any) => a.localized_name.localeCompare(b.localized_name)));
    });
    coreApi.get('/me/overview').then((r) => {
      const profileId = r.data?.profile?.player_profile_id ?? r.data?.profile?.id;
      if (profileId) setPid(profileId);
    }).catch(() => {});
    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pid) return;
    const params: any = { mode: 'ranked', period: backendPeriod };
    if (selectedRole)  params.role = Number(selectedRole);
    if (selectedHero)  params.hero_id = Number(selectedHero);
    coreApi.get(`/player/${pid}/stats/overview`, { params }).then((r) => setStats(r.data)).catch(() => {});
    coreApi.get(`/player/${pid}/detailed-features`, { params }).then((r) => setFeatures(r.data)).catch(() => {});
  }, [pid, backendPeriod, selectedRole, selectedHero]);

  /* ---- Вычисляемые ---- */
  const summary = stats?.summary || {};
  const trends  = stats?.trends || {};
  const topHeroes = stats?.heroes?.top_heroes || [];
  const matchesCount = summary.filters_applied?.matches_count ?? summary.games_analyzed ?? 0;
  const winrate = summary.winrate ?? null;
  const kdaAvg  = summary.kda_avg ?? null;
  const gpmAvg  = summary.gpm_avg ?? null;
  const isLinked = steamData?.linked && steamData?.personaname;

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

  /* WR по ролям + KDA + GPM (avg) из recent_matches */
  const roleStats = useMemo(() => {
    const rm = steamData?.recent_matches || [];
    return [1, 2, 3, 4, 5].map((r) => {
      const matches = rm.filter((m: any) => m.lane_role === r);
      const wins = matches.filter((m: any) => m.win).length;
      const avg = (key: 'kda' | 'gpm') => {
        const arr = matches.map((m: any) => Number(m[key]) || 0).filter((n: number) => Number.isFinite(n) && n > 0);
        return arr.length > 0 ? arr.reduce((s: number, n: number) => s + n, 0) / arr.length : null;
      };
      return {
        role: r,
        label: roleName(r),
        total: matches.length,
        wins,
        winrate: matches.length > 0 ? wins / matches.length : null,
        kda: avg('kda'),
        gpm: avg('gpm'),
      };
    });
  }, [steamData]);

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

  /* График: трендовая метрика */
  const dynamicTrend = useMemo(() => {
    const key = `${chartMetric}_over_time`;
    const arr = (trends as any)[key];
    if (!Array.isArray(arr)) return [];
    return arr.map((p: any) => {
      const raw = p[chartMetric];
      const value = chartMetric === 'winrate' && typeof raw === 'number'
        ? Number((raw * 100).toFixed(1))
        : Number(raw);
      return { ts: p.ts, value: Number.isFinite(value) ? value : 0 };
    });
  }, [trends, chartMetric]);

  const dynamicLabel = chartMetric === 'gpm' ? 'GPM'
                     : chartMetric === 'xpm' ? 'XPM'
                     : chartMetric === 'kda' ? 'KDA'
                     : 'Винрейт, %';

  return (
    <div>
      {/* ============ Header (без экспорта) ============ */}
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>Аналитика</h1>
          <p>Глубокий разбор твоей игры по последним матчам</p>
        </div>

        <div className="stats-header-filters">
          {/* Period — оставлен сегментированным контролем */}
          <div className="seg-control">
            {PERIOD_OPTIONS.map(p => (
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

      {/* ============ Row 1: Динамика | Тепловая карта ============ */}
      <div className="stats-two-col">
        <div className="card dash-card">
          <div className="card-head">
            <div className="card-title">Динамика</div>
            <div className="seg-control" style={{ padding: 2 }}>
              {(['gpm', 'xpm', 'kda', 'winrate'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`seg-control-btn ${chartMetric === m ? 'active' : ''}`}
                  onClick={() => setChartMetric(m)}
                  style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                >
                  {m === 'gpm' ? 'GPM' : m === 'xpm' ? 'XPM' : m === 'kda' ? 'KDA' : 'WR'}
                </button>
              ))}
            </div>
          </div>
          {dynamicTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dynamicTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22, 233, 212, 0.12)" />
                <XAxis dataKey="ts" stroke="#7b8ba5" fontSize={11} />
                <YAxis stroke="#7b8ba5" fontSize={11} />
                <Tooltip contentStyle={CHART_STYLE} formatter={(v: any) => [v, dynamicLabel]} />
                <Line type="monotone" dataKey="value" stroke="#16e9d4" strokeWidth={2.5}
                  dot={{ fill: '#16e9d4', r: 3 }} activeDot={{ r: 5, fill: '#00ffc8' }}
                  name={dynamicLabel} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Данных пока нет" description={isLinked ? 'Подгружаем матчи.' : 'Привяжите Steam.'} compact />
          )}
        </div>

        <div className="card dash-card">
          <div className="card-head">
            <div className="card-title">Тепловая карта</div>
            <span className="badge badge-muted">parsed-данные</span>
          </div>
          {/* Хитмап строится только из parsed-матчей с координатами событий.
              Пока у бэка нет endpoint'а — карточка остаётся в состоянии "ждём данных". */}
          <EmptyState
            title="Появится из parsed-матчей"
            description="Тепловая карта строится по координатам ивентов в матчах после parsed-загрузки. Как только данные подгрузятся — карточка обновится автоматически."
            compact
          />
        </div>
      </div>

      {/* ============ Row 2: Винрейт по ролям (full width) ============ */}
      <div className="card dash-card stats-row">
        <div className="card-head">
          <div className="card-title">Винрейт по ролям</div>
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>по последним {steamData?.recent_matches?.length || 0} матчам</span>
        </div>
        <div className="role-wr-list">
          {roleStats.map((r) => (
            <div key={r.role} className="role-wr-row">
              <span className="role-wr-label">{r.label}</span>
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

      {/* ============ Row 3: Радар | Игры по ролям ============ */}
      <div className="stats-two-col">
        <div className="card dash-card">
          <div className="card-head">
            <div className="card-title">Радар навыков</div>
          </div>
          {radarData.length > 2 ? (
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(22, 233, 212, 0.18)" />
                <PolarAngleAxis dataKey="category" stroke="#a0b1c8" fontSize={11} />
                <PolarRadiusAxis stroke="rgba(123, 139, 165, 0.4)" fontSize={9} angle={45} />
                <Radar name="Ты" dataKey="you" stroke="#16e9d4" fill="#16e9d4" fillOpacity={0.18} />
                <Radar name="Цель" dataKey="baseline" stroke="#9b59ff" fill="#9b59ff" fillOpacity={0.10} />
                <Legend verticalAlign="bottom" iconType="line" wrapperStyle={{ fontSize: 11, color: '#a0b1c8' }} />
                <Tooltip contentStyle={CHART_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Недостаточно данных" description={isLinked ? 'Радар появится после загрузки фитчей.' : 'Привяжите Steam.'} compact />
          )}
        </div>

        <div className="card dash-card">
          <div className="card-head">
            <div className="card-title">Игры по ролям</div>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>средние</span>
          </div>
          <div className="role-stats-grid">
            {roleStats.map((r) => (
              <div key={r.role} className="role-stat-cell">
                <div className="role-stat-cell-head">
                  <span className="role-stat-cell-name">{r.label}</span>
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

      {/* ============ Row 4: Топ героев (full width) ============ */}
      <div className="card dash-card stats-row">
        <div className="card-head">
          <div className="card-title">Топ героев</div>
        </div>
        {topHeroes.length > 0 ? (
          <div className="top-heroes-table">
            <div className="top-heroes-head">
              <span>Герой</span>
              <span>Матчей</span>
              <span>Винрейт</span>
              <span>KDA</span>
            </div>
            {topHeroes.slice(0, 6).map((h: any) => (
              <div key={h.hero_id} className="top-heroes-row">
                <span className="match-hero">
                  <img src={heroIcon(h.hero_id)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span>{heroName(h.hero_id)}</span>
                </span>
                <span className="text-muted">{h.games}</span>
                <span className="top-heroes-wr">
                  <span className="top-heroes-wr-value">{(h.winrate * 100).toFixed(0)}%</span>
                  <span className="top-heroes-wr-bar"><span style={{ width: `${Math.min(100, h.winrate * 100)}%` }} /></span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(h.avg_kda).toFixed(1)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Героев пока нет" description={isLinked ? 'Подгружаем матчи.' : 'Привяжите Steam.'} compact />
        )}
      </div>

      {/* ============ Слабые места — circular widget ============ */}
      <div className="card dash-card stats-row weak-card">
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
            {/* Большое кольцо с фитчей */}
            <div className="weak-circle">
              {(() => {
                const score = activeFeature.score ?? 0;
                const target = activeFeature.target ?? 0;
                const pct = Math.min(100, (score / 10) * 100);
                const targetPct = Math.min(100, (target / 10) * 100);
                const size = 200;
                const r = (size - 16) / 2;
                const c = 2 * Math.PI * r;
                const offset = c - (pct / 100) * c;
                const targetOffset = c - (targetPct / 100) * c;
                return (
                  <svg width={size} height={size}>
                    <defs>
                      <linearGradient id="weakRingGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%"   stopColor="#16e9d4" />
                        <stop offset="100%" stopColor="#9b59ff" />
                      </linearGradient>
                    </defs>
                    {/* Track */}
                    <circle cx={size/2} cy={size/2} r={r} stroke="rgba(22, 233, 212, 0.12)" strokeWidth="14" fill="none" />
                    {/* Target ghost */}
                    <circle
                      cx={size/2} cy={size/2} r={r}
                      stroke="rgba(155, 89, 255, 0.35)"
                      strokeWidth="3" fill="none"
                      strokeDasharray={c}
                      strokeDashoffset={targetOffset}
                      transform={`rotate(-90 ${size/2} ${size/2})`}
                      strokeLinecap="round"
                    />
                    {/* Score arc */}
                    <circle
                      cx={size/2} cy={size/2} r={r}
                      stroke="url(#weakRingGrad)"
                      strokeWidth="14"
                      fill="none"
                      strokeDasharray={c}
                      strokeDashoffset={offset}
                      transform={`rotate(-90 ${size/2} ${size/2})`}
                      strokeLinecap="round"
                      style={{ filter: 'drop-shadow(0 0 8px rgba(22, 233, 212, 0.4))' }}
                    />
                    <text x={size/2} y={size/2 - 6} textAnchor="middle"
                      fill="var(--accent-bright)" fontSize="36" fontWeight="800" fontFamily="var(--font-display)">
                      {score.toFixed(1)}
                    </text>
                    <text x={size/2} y={size/2 + 22} textAnchor="middle"
                      fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-body)">
                      / 10
                    </text>
                  </svg>
                );
              })()}
            </div>

            {/* Подробности */}
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

              {(activeFeature.components || []).length > 0 && (
                <div className="weak-circle-components">
                  <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Компоненты</div>
                  <div className="weak-circle-components-list">
                    {(activeFeature.components || []).slice(0, 5).map((c: any) => (
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
            </div>

            {/* Список всех слабых мест сбоку — clickable list */}
            <div className="weak-list">
              <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 8 }}>Все направления (от худших)</div>
              {weakFeaturesSorted.map((cat: any, i: number) => (
                <button
                  key={cat.key}
                  type="button"
                  className={`weak-list-row ${i === activeFeatureIdx ? 'active' : ''}`}
                  onClick={() => setActiveFeatureIdx(i)}
                >
                  <span className="weak-list-rank">{i + 1}</span>
                  <span className="weak-list-name">{cat.name}</span>
                  <span className="weak-list-score">{(cat.score ?? 0).toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="Недостаточно данных"
            description={isLinked ? 'Слабые направления появятся после загрузки фитчей.' : 'Привяжите Steam.'} compact />
        )}
      </div>
    </div>
  );
}
