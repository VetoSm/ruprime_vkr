import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { loadHeroes, heroIcon, heroName, roleName } from '../../api/heroes';
import { RankBadge, RoleBadge, InfoTooltip } from '../../ui/GameComponents';
import SkillRing from '../../ui/SkillRing';
import DotaPrivacyBanner from '../../ui/DotaPrivacyBanner';
import ParseProgressBadge from '../../ui/ParseProgressBadge';
import { EmptyState } from '../../ui/Primitives';
import { Dropdown } from '../../ui/Dropdown';
import {
  IconChevronRight, IconChevronUp, IconChevronDown, IconCalendar, IconTrendUp,
} from '../../ui/Icons';
import {
  IconCoinsOutline, IconBookOpenOutline, IconSwordsOutline, IconStarOutline,
} from '../../ui/StatIcons';

const ORACLE_AVATAR = '/decor/oracle-avatar.png';

/* Искрящаяся ромбовидная звёздочка с cyan→purple градиентом — на месте 3-х отдельных ромбиков */
function SparkleDecor() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="var(--accent-bright, #16e9d4)" />
          <stop offset="100%" stopColor="var(--purple, #9b59ff)" />
        </linearGradient>
      </defs>
      {/* центральная 4-конечная звезда из ромба */}
      <path d="M20 4 L23 18 L36 20 L23 22 L20 36 L17 22 L4 20 L17 18 Z" fill="url(#sparkGrad)" />
      {/* малые искры рядом */}
      <path d="M32 6 L33 9 L36 10 L33 11 L32 14 L31 11 L28 10 L31 9 Z" fill="url(#sparkGrad)" opacity="0.55" />
      <path d="M7 28 L7.7 30 L9.5 30.5 L7.7 31 L7 33 L6.3 31 L4.5 30.5 L6.3 30 Z" fill="url(#sparkGrad)" opacity="0.5" />
    </svg>
  );
}

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/* =========================================================
 * Утилиты дашборда
 * =======================================================*/
const STEAM_PENDING_KEY = 'steam_pending_link_id';
const DASHBOARD_ROLES = ['', 'POS1', 'POS2', 'POS3', 'POS4', 'POS5'] as const;
const PERIOD_OPTIONS = [
  { value: '20',  label: 'Последние 20 матчей' },
  { value: '50',  label: 'Последние 50 матчей' },
  { value: '100', label: 'Последние 100 матчей' },
];
const MMR_BY_RANK: Record<string, number> = {
  HERALD: 700, GUARDIAN: 1500, CRUSADER: 2200, ARCHON: 2900,
  LEGEND: 3600, ANCIENT: 4300, DIVINE: 5000, IMMORTAL: 5700,
};
const FEATURE_TIPS: Record<string, string> = {
  farming: 'Эффективность фарма: как быстро вы зарабатываете золото и добиваете крипов.',
  combat: 'Эффективность в боях: урон, убийства, ассисты.',
  survival: 'Выживаемость: как часто вы умираете и насколько влияете на исход тимфайтов.',
  vision: 'Контроль карты: обсервер- и сентри-варды (по parsed матчам).',
  objectives: 'Давление на объекты: башни и Рошан.',
  mechanics: 'Механический скилл: APM и темп опыта.',
  consistency: 'Стабильность выступления от матча к матчу.',
  control: 'Контроль противников: станы и инициация (по parsed матчам).',
};
function fmtHM(seconds: number) {
  const m = Math.max(0, Math.floor(seconds / 60));
  const s = Math.max(0, seconds - m * 60);
  return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}

function timeAgo(iso: string | number) {
  const t = typeof iso === 'number' ? iso * 1000 : new Date(iso).getTime();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff/60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ч назад`;
  return `${Math.floor(diff/86400)} дн назад`;
}

function timeUntil(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((t - Date.now()) / 1000));
  if (diff <= 0) return 'сейчас';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d} дн ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

/* =========================================================
 * Маленькие подкомпоненты дашборда (локальные)
 * =======================================================*/
function HeroStat({
  label, value, delta, deltaTone, color,
}: { label: string; value: React.ReactNode; delta?: string; deltaTone?: 'pos' | 'neg' | 'neutral'; color?: string }) {
  return (
    <div className="player-hero-stat">
      <span className="player-hero-stat-label">{label}</span>
      <span className="player-hero-stat-value" style={color ? { color } : undefined}>{value}</span>
      {delta && (
        <span className={`player-hero-stat-delta ${deltaTone === 'neg' ? 'negative' : ''}`}>{delta}</span>
      )}
    </div>
  );
}

function StatTile({
  label, value, icon, tint, info, deltaText, deltaTone, deltaContext,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon: React.ReactNode;
  tint: 'cyan' | 'purple' | 'gold' | 'rose';
  /** Optional ℹ︎ tooltip rendered next to the label. */
  info?: string;
  /** "+0.42" / "-150" — short delta string already formatted. */
  deltaText?: string;
  deltaTone?: 'pos' | 'neg' | 'neutral';
  /** One-liner under the value explaining what the delta is compared to. */
  deltaContext?: string;
}) {
  return (
    <div className={`stat-tile stat-tile--${tint}`}>
      <div className="stat-tile-icon">{icon}</div>
      <div className="stat-tile-body" style={{ flex: 1 }}>
        <div className="stat-tile-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {label}
          {info && <InfoTooltip text={info} />}
        </div>
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

/* "Сравни первую и последнюю точку серии" — единая утилита для дельт
   в плитках. Подходит для KDA/GPM/XPM/overall_score: первая половина
   окна vs последняя, разница со знаком. */
function trendDelta(
  series: any[] | undefined | null,
  field: string,
  digits: number = 1,
  asPercent: boolean = false,
): { text: string; tone: 'pos' | 'neg' | 'neutral' } {
  if (!Array.isArray(series) || series.length < 2) return { text: '', tone: 'neutral' };
  const first = Number(series[0]?.[field]);
  const last = Number(series[series.length - 1]?.[field]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return { text: '', tone: 'neutral' };
  const diff = (last - first) * (asPercent ? 100 : 1);
  if (Math.abs(diff) < 10 ** -(digits + 1)) {
    return { text: `±${(0).toFixed(digits)}${asPercent ? '%' : ''}`, tone: 'neutral' };
  }
  const sign = diff > 0 ? '+' : '';
  return {
    text: `${sign}${diff.toFixed(digits)}${asPercent ? '%' : ''}`,
    tone: diff > 0 ? 'pos' : 'neg',
  };
}

/* =========================================================
 * Player Dashboard
 * =======================================================*/
export default function PlayerDashboard() {
  const { user } = useAuth();

  // Базовые данные
  const [overview, setOverview] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any>(null);
  const [detailedFeatures, setDetailedFeatures] = useState<any>(null);
  const [steamData, setSteamData] = useState<any>(null);
  const [playerProfile, setPlayerProfile] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [retried, setRetried] = useState(false);
  const [pendingSteamChecked, setPendingSteamChecked] = useState(false);

  // Управление UI
  const [periodCount, setPeriodCount] = useState<'20' | '50' | '100'>('50');
  const [selectedAnalysisRole, setSelectedAnalysisRole] = useState('');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'gpm' | 'xpm' | 'kda' | 'winrate'>('gpm');
  // Свёрнутый ли баннер «Загружаем данные Dota». Состояние храним в
  // localStorage, чтобы при обновлении страницы пользователь не
  // получал баннер обратно развёрнутым каждый раз.
  const [syncCollapsed, setSyncCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sync_banner_collapsed') === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('sync_banner_collapsed', syncCollapsed ? '1' : '0'); }
    catch {}
  }, [syncCollapsed]);

  // Боковые блоки
  const [aiHistory, setAiHistory] = useState<any[]>([]);
  const [aiIndex, setAiIndex] = useState(0);
  const [upcomingSession, setUpcomingSession] = useState<any>(null);

  // Загрузка героев + overview + steam + профиль
  useEffect(() => {
    loadHeroes();
    coreApi.get('/me/overview').then((r) => setOverview(r.data)).catch(() => {});
    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
    coreApi.get('/player/profile').then((r) => {
      setPlayerProfile(r.data);
      setSelectedAnalysisRole(r.data?.analysis_role || '');
    }).catch(() => {});
    coreApi.get('/ai/history').then((r) => setAiHistory(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    coreApi.get('/training-sessions/my').then((r) => {
      const all = Array.isArray(r.data) ? r.data : [];
      const planned = all
        .filter((s: any) => s.status === 'PLANNED' && s.scheduled_at && new Date(s.scheduled_at).getTime() > Date.now())
        .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      setUpcomingSession(planned[0] || null);
    }).catch(() => {});
  }, []);

  // Polling sync-status пока идёт догрузка матчей
  useEffect(() => {
    if (!steamData?.linked) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await coreApi.get('/player/sync-status');
        if (cancelled) return;
        setSyncStatus(r.data);
        if (r.data?.status && r.data.status !== 'queued' && r.data.status !== 'running') return;
      } catch { return; }
      if (!cancelled) window.setTimeout(tick, 4000);
    };
    tick();
    return () => { cancelled = true; };
  }, [steamData?.linked]);

  // Stats overview (по периоду)
  useEffect(() => {
    if (overview?.profile?.id) {
      const pid = overview.profile.id;
      coreApi.get(`/player/${pid}/stats/overview`, { params: { mode: 'ranked', period: periodCount } })
        .then((r) => setPlayerStats(r.data))
        .catch(() => {});
    }
  }, [overview, periodCount]);

  // Detailed features (по периоду + роль)
  useEffect(() => {
    if (!overview?.profile?.id) return;
    const pid = overview.profile.id;
    const baselineRole = String(selectedAnalysisRole || '').match(/POS([1-5])/)?.[1];
    coreApi.get(`/player/${pid}/detailed-features`, {
      params: { mode: 'ranked', period: periodCount, ...(baselineRole ? { baseline_role: Number(baselineRole) } : {}) },
    }).then((r) => setDetailedFeatures(r.data)).catch(() => {});
  }, [overview?.profile?.id, selectedAnalysisRole, periodCount]);

  // Заявка из регистрации (pending steam link)
  useEffect(() => {
    if (pendingSteamChecked) return;
    if (!overview?.profile?.id) return;
    const pendingSteamId = localStorage.getItem(STEAM_PENDING_KEY);
    if (!pendingSteamId) { setPendingSteamChecked(true); return; }
    if (steamData?.linked && steamData?.personaname) {
      localStorage.removeItem(STEAM_PENDING_KEY);
      setPendingSteamChecked(true);
      return;
    }
    setPendingSteamChecked(true);
    const pid = overview.profile.id;
    (async () => {
      try {
        // ``trusted: true`` — the pending steam_id was written by the
        // OpenID callback (see SteamAuthCallback.tsx). The core endpoint
        // re-verifies against /auth/providers/steam, so a stale localStorage
        // entry can't be abused to claim arbitrary accounts.
        await coreApi.post('/player/link-steam', { steam_id: pendingSteamId, trusted: true });
        await coreApi.post('/player/sync-steam').catch(() => {});
        localStorage.removeItem(STEAM_PENDING_KEY);
        coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
        coreApi.get('/player/profile').then((r) => setPlayerProfile(r.data)).catch(() => {});
        coreApi.get(`/player/${pid}/stats/overview`, { params: { mode: 'ranked', period: periodCount } })
          .then((r) => setPlayerStats(r.data)).catch(() => {});
      } catch { /* кнопка ручной привязки остаётся в настройках */ }
    })();
  }, [overview, steamData, pendingSteamChecked, periodCount]);

  // Retry sync если ничего не подгрузилось
  useEffect(() => {
    if (retried) return;
    const isLinkedNow = steamData?.linked && steamData?.personaname;
    const hasNoData = !detailedFeatures?.categories?.length && !playerStats?.summary?.games_analyzed;
    if (isLinkedNow && hasNoData && overview?.profile?.id) {
      setRetried(true);
      coreApi.post('/player/sync-steam').then(() => {
        const pid = overview.profile.id;
        coreApi.get(`/player/${pid}/stats/overview`, { params: { mode: 'ranked', period: periodCount } })
          .then((r) => setPlayerStats(r.data)).catch(() => {});
        coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
      }).catch(() => {});
    }
  }, [steamData, detailedFeatures, playerStats, overview, retried, periodCount]);

  /* ---------- Вычисляемые поля ---------- */
  const summary = playerStats?.summary || {};
  const trends = playerStats?.trends || {};
  const isLinked = steamData?.linked && steamData?.personaname;
  const displayName = steamData?.personaname || user?.login || 'Игрок';
  const avatarUrl = steamData?.avatar_url;
  const reportMmr = summary.estimated_mmr || 0;
  const totalGames =
    steamData?.lifetime_games
    ?? steamData?.total_games
    ?? ((steamData?.win || 0) + (steamData?.lose || 0));
  const accountMmr = steamData?.mmr_estimate ?? reportMmr;
  const lifetimeWinrate = totalGames > 0 ? (steamData?.win || 0) / totalGames : 0;
  const winrate = summary.winrate ?? lifetimeWinrate;
  const statsScopeLabel = summary.stats_scope_label || summary.filters_applied?.label || `последние ${periodCount}, рейтинговые матчи`;
  const scopeMatches = summary.filters_applied?.matches_count ?? summary.games_analyzed ?? 0;
  const hours = summary.estimated_hours || steamData?.estimated_hours || 0;
  const desiredRankStr = playerProfile?.desired_rank_tier || 'IMMORTAL';
  const desired_mmr = MMR_BY_RANK[desiredRankStr.toUpperCase()] || 5700;
  const progress = accountMmr > 0 ? Math.min((accountMmr / desired_mmr) * 100, 100) : 0;

  const categories = detailedFeatures?.categories || [];
  const topGaps = detailedFeatures?.top_gaps || [];
  const effectiveAnalysisRole = selectedAnalysisRole || (detailedFeatures?.baseline_role ? `POS${detailedFeatures.baseline_role}` : '');

  // 3 худших ринга для правой части skill блока
  const worstRings = useMemo(() => {
    return [...categories]
      .filter((c: any) => !c.missing && typeof c.score === 'number')
      .sort((a: any, b: any) => a.score - b.score)
      .slice(0, 3);
  }, [categories]);

  const recentMatches: any[] = Array.isArray(steamData?.recent_matches) ? steamData.recent_matches : [];

  /* Top roles ordered by how often the player actually played them in
     the recent window, descending. Empty (`0`/`null` `lane_role`) and
     out-of-range values are dropped. Used in the hero card "Роли" stat
     to surface real role distribution instead of a single auto-pick. */
  const popularRoles = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of recentMatches) {
      const role = Number(m?.lane_role);
      if (Number.isFinite(role) && role >= 1 && role <= 5) {
        counts.set(role, (counts.get(role) || 0) + 1);
      }
    }
    const total = Array.from(counts.values()).reduce((s, v) => s + v, 0);
    if (total === 0) return [] as { role: number; count: number; pct: number }[];
    return Array.from(counts.entries())
      .map(([role, count]) => ({ role, count, pct: count / total }))
      .sort((a, b) => b.count - a.count);
  }, [recentMatches]);

  // Дельта GPM матча относительно предыдущего (для колонки GPM ▲)
  const gpmDeltas = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < recentMatches.length; i++) {
      const cur = recentMatches[i]?.gpm;
      const prev = recentMatches[i + 1]?.gpm;
      arr.push(typeof cur === 'number' && typeof prev === 'number' ? cur - prev : null);
    }
    return arr;
  }, [recentMatches]);

  /* Линейный график "Динамика" — снимок одной метрики по 5 батчам.
     Раньше X-ось показывала ярлык батча ("Матчи 1-20" / месяц), что
     ломалось на любых размерах окна и не совпадало с реальным числом
     матчей в фильтре. Теперь X-ось — номер матча, и мы явным образом
     просим Recharts показать ровно 3 тика: 1, середина, конец (с учётом
     общего количества матчей в окне). */
  /* Безопасный фолбэк для усреднённых метрик: иногда backend возвращает
     только overall_score (без kda/gpm/xpm), и плитки начинают показывать
     одинаковые "—". Чтобы пользователь всегда видел РАЗНЫЕ значения по
     метрикам, считаем среднее из recent_matches как запасной вариант
     (только когда summary не дал свой). */
  const fallbackAverages = useMemo(() => {
    const arr = (recentMatches || []).filter(Boolean);
    if (arr.length === 0) return { kda: null, gpm: null, xpm: null };
    const mean = (key: 'kda' | 'gpm' | 'xpm' | 'kills' | 'deaths' | 'assists'): number | null => {
      const vals = arr.map((m: any) => Number(m?.[key])).filter((n: number) => Number.isFinite(n) && n > 0);
      if (vals.length === 0) return null;
      return vals.reduce((s: number, n: number) => s + n, 0) / vals.length;
    };
    let kda = mean('kda');
    if (kda === null) {
      // На случай, если бэк не положил `kda` в matches — посчитаем сами.
      const k = mean('kills') ?? 0;
      const d = mean('deaths');
      const a = mean('assists') ?? 0;
      if ((k + a) > 0) kda = d && d > 0 ? (k + a) / d : (k + a);
    }
    return { kda, gpm: mean('gpm'), xpm: mean('xpm') };
  }, [recentMatches]);

  const kdaDisplay = summary.kda_avg ?? fallbackAverages.kda;
  const gpmDisplay = summary.gpm_avg ?? fallbackAverages.gpm;
  const xpmDisplay = summary.xpm_avg ?? fallbackAverages.xpm;

  const chartData = useMemo(() => {
    const key = `${chartMetric}_over_time`;
    const series = (trends as any)[key];
    if (!Array.isArray(series)) return [];
    return series.map((p: any) => {
      const endIdx = typeof p.batch_end_idx === 'number' ? p.batch_end_idx : null;
      const startIdx = typeof p.batch_start_idx === 'number' ? p.batch_start_idx : null;
      const midpoint = endIdx != null && startIdx != null
        ? Math.round((startIdx + endIdx) / 2)
        : null;
      return {
        ts: p.ts,
        x: midpoint,
        value: typeof p[chartMetric] === 'number' ? p[chartMetric] : Number(p[chartMetric]) || 0,
      };
    });
  }, [trends, chartMetric]);

  const chartTicks = useMemo(() => {
    const last = chartData.length > 0
      ? chartData[chartData.length - 1]?.x
      : null;
    if (!last || last <= 1) return [1];
    const mid = Math.max(2, Math.round(last / 2));
    return [1, mid, last];
  }, [chartData]);

  const coachPending = user?.coach_application_status === 'PENDING';
  const coachRejected = user?.coach_application_status === 'REJECTED';
  const coachApprovedButStillPlayer =
    user?.coach_application_status === 'APPROVED' && user?.role === 'PLAYER';

  const currentAi = aiHistory[aiIndex];

  /* ---------- Render ---------- */
  return (
    <div>
      {coachApprovedButStillPlayer && (
        <div className="alert mb-20" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}>
          <strong>Заявка на тренера одобрена.</strong>{' '}
          Панель тренера станет доступна в течение ≈30 минут (когда обновится токен), или сразу после
          повторного входа. <a href="/login" style={{ color: 'var(--accent-bright)' }}>Войти заново</a>.
        </div>
      )}
      {coachPending && (
        <div className="alert mb-20" style={{ background: 'var(--purple-bg)', border: '1px solid var(--purple)', color: 'var(--text-primary)' }}>
          Заявка на роль тренера в рассмотрении. Пока вы пользуетесь сервисом как игрок — статистика, цели и матчи доступны.
        </div>
      )}
      {coachRejected && (
        <div className="alert alert-error mb-20">
          Заявка на роль тренера отклонена. Если считаете это ошибкой — напишите в поддержку.
        </div>
      )}
      {!isLinked && (
        <div className="alert alert-error mb-20">
          Steam не привязан. <Link to="/settings">Привяжите аккаунт</Link> для получения статистики.
        </div>
      )}

      <DotaPrivacyBanner
        steamData={steamData}
        onRefreshed={(data) => data && setSteamData((prev: any) => ({ ...(prev || {}), ...data, linked: true }))}
      />

      {isLinked && syncStatus?.scheduled && (syncStatus.status === 'queued' || syncStatus.status === 'running') && (
        <div
          className={`alert sync-alert mb-20 ${syncCollapsed ? 'sync-alert--collapsed' : ''}`}
          style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
        >
          <div className="sync-alert-head">
            <strong>Загружаем данные Dota.</strong>
            <button
              type="button"
              className="sync-alert-toggle"
              onClick={() => setSyncCollapsed((v) => !v)}
              aria-label={syncCollapsed ? 'Развернуть' : 'Свернуть'}
              title={syncCollapsed ? 'Показать прогресс' : 'Свернуть'}
            >
              {syncCollapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
            </button>
          </div>
          {!syncCollapsed && (
            <div className="sync-alert-body">
              {syncStatus.message || 'Догружаем матчи и детальные события в фоне.'}
              {typeof syncStatus.fetched_matches === 'number' && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  Загружено матчей: {syncStatus.fetched_matches.toLocaleString('ru-RU')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ Greeting + Filters ============ */}
      <div className="dash-greeting">
        <div className="dash-greeting-text">
          <h1>Привет, <strong>{displayName}</strong></h1>
          <p>Отслеживай прогресс, анализируй игры и побеждай!</p>
        </div>
        <div className="dash-filter-row">
          <Dropdown
            value={periodCount}
            onChange={(v) => setPeriodCount(v as any)}
            options={PERIOD_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            label="Период"
            align="right"
          />
          <Dropdown
            value={selectedAnalysisRole}
            onChange={setSelectedAnalysisRole}
            options={DASHBOARD_ROLES.map(r => ({
              value: r,
              label: r ? roleName(r) : 'Авто',
            }))}
            label="Роль"
            align="right"
          />
        </div>
      </div>

      {/* ============ Hero Card (5 секций) ============ */}
      <div className="player-hero-card player-hero-card--5col">
        <div className="player-hero-portrait">
          {avatarUrl
            ? <img src={avatarUrl} alt="" />
            : <span className="player-hero-portrait-initials">{(displayName || '?').slice(0, 2).toUpperCase()}</span>
          }
        </div>
        <div className="player-hero-body">
          <h2 className="player-hero-name">{displayName}</h2>
          {(steamData?.rank_tier || playerProfile?.actual_rank_tier) && (
            <div className="player-hero-rank-row">
              {/* RankBadge сам рендерит медаль + имя ранга; раньше рядом
                  была отдельная подпись с тем же названием, и на UI выходило
                  "🏅 Immortal  Immortal" — задвоение. Достаточно одной
                  бейдж-капсулы. */}
              {steamData?.rank_tier
                ? <RankBadge rankTier={steamData.rank_tier} size="lg" />
                : <RankBadge rankName={playerProfile?.actual_rank_tier} size="lg" />
              }
            </div>
          )}
        </div>

        <HeroStat
          label="MMR"
          color="var(--accent-bright)"
          value={accountMmr ? accountMmr.toLocaleString('ru-RU') : '—'}
          delta={scopeMatches > 0 ? `${scopeMatches} м в окне` : undefined}
          deltaTone="neutral"
        />
        <HeroStat
          label="Время"
          value={hours > 0 ? `${Math.round(hours).toLocaleString('ru-RU')} ч` : '—'}
          delta={totalGames > 0 ? `${totalGames.toLocaleString('ru-RU')} матчей` : undefined}
          deltaTone="neutral"
        />
        <HeroStat
          label="Винрейт"
          value={winrate > 0 ? `${(winrate * 100).toFixed(0)}%` : '—'}
          delta={lifetimeWinrate > 0 ? `всего ${(lifetimeWinrate * 100).toFixed(1)}%` : undefined}
          deltaTone={winrate >= lifetimeWinrate ? 'pos' : 'neg'}
        />
        <div className="player-hero-stat">
          <span className="player-hero-stat-label">Роли</span>
          <div className="player-hero-stat-tags">
            {popularRoles.length > 0 ? (
              popularRoles.map((r) => {
                const active = effectiveAnalysisRole === `POS${r.role}`;
                return (
                  <span
                    key={r.role}
                    className={`hero-role-pill ${active ? 'active' : ''}`}
                    title={`${r.count} матч${r.count === 1 ? '' : 'ей'} · ${(r.pct * 100).toFixed(0)}%`}
                  >
                    <RoleBadge role={r.role} compact />
                    <small>{Math.round(r.pct * 100)}%</small>
                  </span>
                );
              })
            ) : effectiveAnalysisRole ? (
              <RoleBadge role={effectiveAnalysisRole} compact />
            ) : (
              <span className="player-hero-stat-tag warn">авто</span>
            )}
          </div>
          {accountMmr > 0 && desired_mmr > accountMmr && (
            <span className="player-hero-stat-delta">
              до {desiredRankStr} · {progress.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      {/* ============ Quick Stats (4 плитки) ============
       * Каждая плитка показывает среднее по выбранному окну + дельту
       * (последняя точка тренда vs первая). Так пользователь сразу видит:
       *   "KDA 2.45  +0.30  — растёт в последних играх".
       * Tooltip на «Общий балл» расшифровывает агрегат. */}
      {(() => {
        const kdaTileDelta = trendDelta(trends.kda_over_time, 'kda', 2);
        const gpmTileDelta = trendDelta(trends.gpm_over_time, 'gpm', 0);
        const xpmTileDelta = trendDelta(trends.xpm_over_time, 'xpm', 0);
        const deltaCtx = 'к концу окна vs его началу';
        return (
      <div className="grid-4 dash-quick-stats">
        <StatTile
          label="ОБЩИЙ БАЛЛ" tint="cyan"
          icon={<IconStarOutline />}
          value={typeof detailedFeatures?.overall_score === 'number' ? `${Number(detailedFeatures.overall_score).toFixed(1)} / 10` : '—'}
          info={
            'Агрегированный показатель твоей игры от 0 до 10. Среднее по 8 категориям ' +
            'из «Радара навыков» (farming / combat / vision / objectives / mechanics / ' +
            'control / survival / consistency), каждая из которых нормирована к диапазону ' +
            '0-10 относительно эталонов твоего ранга. 10 = на уровне топ-1% твоего MMR-бэнда.'
          }
        />
        <StatTile
          label="KDA" tint="rose"
          icon={<IconSwordsOutline />}
          value={typeof kdaDisplay === 'number' && Number.isFinite(kdaDisplay) ? Number(kdaDisplay).toFixed(2) : '—'}
          deltaText={kdaTileDelta.text}
          deltaTone={kdaTileDelta.tone}
          deltaContext={kdaTileDelta.text ? deltaCtx : undefined}
        />
        <StatTile
          label="GPM" tint="gold"
          icon={<IconCoinsOutline />}
          value={typeof gpmDisplay === 'number' && Number.isFinite(gpmDisplay) ? Math.round(gpmDisplay) : '—'}
          deltaText={gpmTileDelta.text}
          deltaTone={gpmTileDelta.tone}
          deltaContext={gpmTileDelta.text ? deltaCtx : undefined}
        />
        <StatTile
          label="XPM" tint="purple"
          icon={<IconBookOpenOutline />}
          value={typeof xpmDisplay === 'number' && Number.isFinite(xpmDisplay) ? Math.round(xpmDisplay) : '—'}
          deltaText={xpmTileDelta.text}
          deltaTone={xpmTileDelta.tone}
          deltaContext={xpmTileDelta.text ? deltaCtx : undefined}
        />
      </div>
        );
      })()}

      {/* ============ 4-col widgets grid (Chart | Rings | Matches | Oracle-tall) ============
       * Карточка слева работает в двух режимах:
       *   1) `expandedSkill === null` — обычный линейный график по выбранной
       *      метрике (GPM / XPM / KDA / Винрейт).
       *   2) `expandedSkill === <key>` — drill-down по выбранной группе из
       *      «Слабых мест»: список компонентов с прогресс-барами «ты vs
       *      цель» вместо линии. График визуально превращается в подробный
       *      breakdown категории.
       *
       * Skill rings справа — клик по кольцу включает/выключает второй режим. */}
      <div className="dash-widgets-grid">
        {(() => {
          const drillCat = expandedSkill
            ? categories.find((c: any) => c.key === expandedSkill)
            : null;
          const drillComponents = drillCat
            ? (drillCat.components || []).filter((c: any) => !c.missing)
            : [];
          return (
        <div className="card dash-card dash-card--chart">
          <div className="card-head">
            <div className="card-title">
              {drillCat ? (
                <>
                  Разбор: {drillCat.name}
                  {FEATURE_TIPS[drillCat.key] && (
                    <InfoTooltip text={FEATURE_TIPS[drillCat.key]} />
                  )}
                </>
              ) : (
                'Динамика'
              )}
            </div>
            {drillCat ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setExpandedSkill(null)}
                title="Вернуться к графику"
              >
                ← Динамика
              </button>
            ) : (
              <Dropdown
                value={chartMetric}
                onChange={(v) => setChartMetric(v as any)}
                options={[
                  { value: 'gpm',     label: 'GPM' },
                  { value: 'xpm',     label: 'XPM' },
                  { value: 'kda',     label: 'KDA' },
                  { value: 'winrate', label: 'Винрейт' },
                ]}
                size="sm"
                align="right"
              />
            )}
          </div>

          {drillCat ? (
            // === Drill-down mode: прогресс-бары по компонентам ===
            drillComponents.length > 0 ? (
              <div className="skill-bars">
                {drillComponents.map((comp: any) => {
                  const score = Number(comp.score) || 0;
                  const target = Number(comp.target_score) || 0;
                  // Нормируем: score / 10 ⇒ заполнение бара, target_score
                  // / 10 ⇒ положение «цели». Делаем 100% потолком.
                  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
                  const targetPct = Math.min(100, Math.max(0, (target / 10) * 100));
                  const reached = score >= target;
                  return (
                    <div key={comp.key} className="skill-bar-row">
                      <div className="skill-bar-row-head">
                        <span className="skill-bar-name">{comp.name}</span>
                        <span className={`skill-bar-value ${reached ? 'reached' : ''}`}>
                          {typeof comp.player_value === 'number'
                            ? comp.player_value.toFixed(1)
                            : comp.player_value}
                          {typeof comp.target_value === 'number' && (
                            <span className="text-muted">
                              {' → '}{comp.target_value.toFixed(1)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="skill-bar-track">
                        <div
                          className={`skill-bar-fill ${reached ? 'reached' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                        {targetPct > 0 && (
                          <span
                            className="skill-bar-target"
                            style={{ left: `${targetPct}%` }}
                            aria-hidden
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Незаметный текст-линк, как и просили — без кнопки */}
                <Link to="/stats" className="skill-bars-cta">
                  Перейти в полную статистику <IconChevronRight size={12} />
                </Link>
              </div>
            ) : (
              <EmptyState
                title="Нет компонентов"
                description="Эта категория ещё без данных — нужны parsed-матчи."
                compact
              />
            )
          ) : chartData.length > 0 ? (
            // === Default mode: линейный график выбранной метрики ===
            // Стиль повторяет график "Динамика" со страницы /stats:
            // cyan→purple-градиент по линии, ровно 3 тика на X (1, mid,
            // last) — масштабируются по числу матчей в окне.
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#16e9d4" />
                    <stop offset="100%" stopColor="#9b59ff" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22, 233, 212, 0.12)" />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={[1, chartTicks[chartTicks.length - 1] || 1]}
                  ticks={chartTicks}
                  stroke="#7b8ba5"
                  fontSize={11}
                  tickFormatter={(v: number) => String(v)}
                />
                <YAxis stroke="#7b8ba5" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#0d1a35', border: '1px solid rgba(22, 233, 212, 0.20)', color: '#e8edf5', borderRadius: 8 }}
                  labelFormatter={(_v, payload: any) => payload?.[0]?.payload?.ts ?? ''}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="url(#dashLineGrad)"
                  strokeWidth={2.6}
                  dot={{ fill: '#16e9d4', r: 3 }}
                  activeDot={{ r: 6, fill: '#00ffc8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<IconTrendUp size={28} color="var(--accent)" />}
              title="Данных пока нет"
              description={isLinked ? 'Дождёмся загрузки матчей — график появится автоматически.' : 'Привяжите Steam, чтобы увидеть динамику.'}
              compact
            />
          )}
        </div>
          );
        })()}

        {/* Skill rings: 3 худших — клик переключает левую карточку в
            режим разбора этой группы. Inline-drilldown под кольцами
            больше не нужен (всё содержательное теперь в графике). */}
        <div className="card dash-card dash-card--rings">
          <div className="card-head">
            <div className="card-title">
              Слабые места
              <InfoTooltip text="Три самых слабых направления в выбранном окне. Жмите кольцо — слева раскроется детализация в виде прогресс-баров." />
            </div>
            {effectiveAnalysisRole && (
              <span className="badge badge-purple">{roleName(effectiveAnalysisRole)}</span>
            )}
          </div>
          {worstRings.length > 0 ? (
            <div className="skill-rings-row">
              {worstRings.map((cat: any) => (
                <div key={cat.key} className="skill-ring-cell" onClick={() => setExpandedSkill(expandedSkill === cat.key ? null : cat.key)}>
                  <SkillRing
                    value={cat.score}
                    target={cat.target}
                    label={cat.name}
                    missing={Boolean(cat.missing)}
                    onClick={() => setExpandedSkill(expandedSkill === cat.key ? null : cat.key)}
                    expanded={expandedSkill === cat.key}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconTrendUp size={28} color="var(--accent)" />}
              title="Не хватает данных"
              description={isLinked ? 'Подгружаем матчи — здесь появятся 3 направления для прокачки.' : 'Привяжите Steam для анализа сильных и слабых сторон.'}
              compact
            />
          )}
        </div>

        {/* Recent Matches (right of rings, same row) */}
        <div className="card dash-card dash-card--matches">
          <div className="card-head">
            <div className="card-title">Последние матчи</div>
            <div className="flex gap-10" style={{ alignItems: 'center' }}>
              {/* Label теперь привязан к выбранному фильтру (периоду): меняется
                  вместе с dropdown "Последние N матчей". Раньше использовался
                  ParseProgressBadge со счётчиком из /player/parse-progress —
                  он отдавал total-в-БД, а не filtered count. */}
              {scopeMatches > 0 ? (
                <span className="badge badge-muted" title="Матчей попало в текущий фильтр">
                  Загружено {scopeMatches.toLocaleString('ru-RU')} матчей
                </span>
              ) : (
                <ParseProgressBadge compact />
              )}
              <Link to="/stats" className="btn btn-outline btn-sm">
                Все <IconChevronRight size={14} />
              </Link>
            </div>
          </div>
          {recentMatches.length > 0 ? (
            <div className="recent-matches-table">
              <div className="recent-matches-head">
                <span>Герой</span>
                <span>Рез-т</span>
                <span>KDA</span>
                <span>GPM</span>
                <span>Длит-ть</span>
                <span aria-hidden />
              </div>
              {recentMatches.slice(0, 5).map((m, i) => {
                const icon = m.hero_id ? heroIcon(m.hero_id) : '';
                const k = m.kills ?? 0, d = m.deaths ?? 0, a = m.assists ?? 0;
                const kdaVal = m.kda ?? (d > 0 ? (k + a) / d : (k + a));
                const dur = typeof m.duration === 'number' ? fmtHM(m.duration) : '—';
                const gpmDelta = gpmDeltas[i];
                return (
                  <div key={m.match_id || i} className={`recent-matches-row ${i % 2 === 1 ? 'recent-matches-row--alt' : ''}`}>
                    <span className="match-hero">
                      {icon && <img src={icon} alt="" />}
                      <span>{m.hero_id ? heroName(m.hero_id) : `Match #${m.match_id}`}</span>
                    </span>
                    <span className={`match-result ${m.win ? 'win' : 'loss'}`}>{m.win ? 'WIN' : 'LOSS'}</span>
                    <span className="match-kda">
                      {k} / <span className="text-muted">{d}</span> / {a}
                      <span className="match-kda-val"> · {Number(kdaVal).toFixed(1)}</span>
                    </span>
                    <span className="match-gpm">
                      {m.gpm ?? '—'}
                      {typeof gpmDelta === 'number' && (
                        <span className={`match-gpm-delta ${gpmDelta >= 0 ? 'pos' : 'neg'}`}>
                          {gpmDelta >= 0 ? '+' : ''}{gpmDelta}
                        </span>
                      )}
                    </span>
                    <span className="match-duration">
                      {dur}
                      {m.start_time && <small className="text-muted">· {timeAgo(m.start_time)}</small>}
                    </span>
                    {m.match_id ? (
                      <Link
                        to={`/match/${m.match_id}`}
                        className="match-detail-link"
                        aria-label="Открыть разбор матча"
                        title="Разбор матча"
                      >
                        <IconChevronRight size={16} />
                      </Link>
                    ) : (
                      <span className="match-detail-link" aria-hidden>
                        <IconChevronRight size={16} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<IconCalendar size={28} color="var(--accent)" />}
              title="Матчей пока нет"
              description={isLinked ? 'Дождёмся загрузки — пять последних появятся здесь.' : 'Привяжите Steam, чтобы увидеть последние игры.'}
              compact
            />
          )}
        </div>

        {/* Oracle hints — высокая колонка справа, перекрывает 2 ряда сетки */}
        <div className="card dash-card dash-card--oracle">
          <div className="card-head">
            <div className="card-title">
              Подсказки Оракула
            </div>
            <SparkleDecor />
          </div>
          {currentAi ? (
            <div className="ai-hint-card ai-hint-card--tall">
              <img src={ORACLE_AVATAR} alt="" className="oracle-avatar" />
              <div className="ai-hint-meta">Oracle · {timeAgo(currentAi.created_at)}</div>
              <div className="ai-hint-text ai-hint-text--tall">
                {currentAi.advice_summary || currentAi.advice_full || 'Совет без текста.'}
              </div>
              <div className="ai-hint-card-footer">
                <div className="ai-hint-nav">
                  <button type="button" className="ai-hint-nav-btn" onClick={() => setAiIndex(Math.max(0, aiIndex - 1))} disabled={aiIndex === 0} aria-label="Назад">‹</button>
                  <span>{aiHistory.length === 0 ? 0 : aiIndex + 1} / {aiHistory.length}</span>
                  <button type="button" className="ai-hint-nav-btn" onClick={() => setAiIndex(Math.min(aiHistory.length - 1, aiIndex + 1))} disabled={aiIndex >= aiHistory.length - 1} aria-label="Вперёд">›</button>
                </div>
                <Link to="/ai-chat" className="ai-hint-cta">
                  Открыть чат <IconChevronRight size={12} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="ai-hint-empty">
              <img src={ORACLE_AVATAR} alt="" className="oracle-avatar" />
              <h4 style={{ margin: '12px 0 6px', color: 'var(--text-primary)' }}>Оракул молчит</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                Задайте вопрос про конкретный матч, тайминг или роль — здесь будет последний совет.
              </p>
              <Link to="/ai-chat" className="btn btn-primary btn-sm">Спросить Оракула</Link>
            </div>
          )}
        </div>

        {/* Upcoming session — компактный блок под трио */}
        <div className="card dash-card dash-card--session">
          <div className="card-head">
            <div className="card-title">
              <IconCalendar size={16} /> Ближайшая сессия
            </div>
          </div>
          {upcomingSession ? (
            <div className="upcoming-session">
              <div className="upcoming-session-head">
                <span className="app-user-avatar" style={{ width: 44, height: 44, fontSize: '0.95rem' }}>
                  {(upcomingSession.coach_label || 'T').slice(0, 2).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="upcoming-session-title">{upcomingSession.coach_label || 'Тренер'}</div>
                  <div className="upcoming-session-meta">
                    {new Date(upcomingSession.scheduled_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{upcomingSession.duration_minutes || 60} мин
                  </div>
                </div>
                <div className="upcoming-session-countdown">
                  <span className="upcoming-session-countdown-label">через</span>
                  <strong>{timeUntil(upcomingSession.scheduled_at)}</strong>
                </div>
                <Link to="/requests" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}>
                  К сессии
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<IconCalendar size={24} color="var(--accent)" />}
              title="Сессий не запланировано"
              description="Найдите тренера и оставьте заявку — расписание появится здесь."
              cta={<Link to="/coaches" className="btn btn-primary btn-sm">Найти тренера</Link>}
              compact
            />
          )}
        </div>
      </div>

    </div>
  );
}
