import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { heroIcon, heroName, loadHeroes, rankTierToName } from '../../api/heroes';
import ParseProgressBadge from '../../ui/ParseProgressBadge';

interface PlayerSlot {
  account_id: number | null;
  player_slot: number;
  hero_id: number;
  is_radiant: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  gold_per_min: number | null;
  xp_per_min: number | null;
  last_hits: number | null;
  denies: number | null;
  hero_damage: number | null;
  tower_damage: number | null;
  hero_healing: number | null;
  net_worth: number | null;
  level: number | null;
  lane_role: number | null;
  obs_placed: number | null;
  sen_placed: number | null;
  teamfight_participation: number | null;
  actions_per_min: number | null;
  rank_tier: number | null;
  items: number[];
  won: boolean | null;
}

interface MatchDetailResponse {
  match_id: number;
  source: string;
  is_parsed: boolean;
  parser_version: number | null;
  start_time: number | null;
  duration: number | null;
  game_mode: number | null;
  radiant_win: boolean | null;
  radiant_score: number | null;
  dire_score: number | null;
  avg_rank_tier: number | null;
  first_blood_time: number | null;
  players: PlayerSlot[];
  focus: {
    account_id: number;
    hero_id: number;
    lane_phase: {
      gold_at_10: number | null;
      xp_at_10: number | null;
      lh_at_10: number | null;
      gold_at_20: number | null;
      xp_at_20: number | null;
      lh_at_20: number | null;
      available: boolean;
    };
    item_timings: { item: string; time: number }[];
    ability_upgrades: any[];
    obs_placed: number | null;
    sen_placed: number | null;
    teamfight_participation: number | null;
    actions_per_min: number | null;
  } | null;
}

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'lane', label: 'Линия' },
  { id: 'build', label: 'Билд' },
  { id: 'scoreboard', label: 'Табло' },
] as const;

type TabId = typeof TABS[number]['id'];

function fmtDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTime(t: number | null): string {
  if (!t) return '—';
  if (t < 0) return `-${fmtDuration(-t)}`;
  return fmtDuration(t);
}

function fmtDate(unixSec: number | null): string {
  if (!unixSec) return '—';
  return new Date(unixSec * 1000).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');
  const [parseRequested, setParseRequested] = useState(false);

  useEffect(() => {
    loadHeroes();
  }, []);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    coreApi.get(`/player/match/${matchId}`)
      .then((r) => setData(r.data))
      .catch((err) => setError(err?.response?.data?.detail || 'Не удалось загрузить матч'))
      .finally(() => setLoading(false));
  }, [matchId]);

  const focus = data?.focus;
  const focusPlayer = useMemo(
    () => data?.players.find((p) => p.account_id === focus?.account_id) || null,
    [data, focus],
  );

  const radiant = useMemo(
    () => (data?.players || []).filter((p) => p.is_radiant),
    [data],
  );
  const dire = useMemo(
    () => (data?.players || []).filter((p) => !p.is_radiant),
    [data],
  );

  const handleRequestParse = async () => {
    if (!matchId) return;
    setParseRequested(true);
    try {
      await coreApi.post(`/player/match/${matchId}/request-parse`);
    } catch {
      setParseRequested(false);
    }
  };

  if (loading) {
    return (
      <div className="page-header">
        <h1>Матч</h1>
        <p className="text-muted">Загружаем карточку...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <div className="page-header">
          <h1>Матч не найден</h1>
          <p className="text-muted">{error || 'Нет данных по этому матчу.'}</p>
        </div>
        <button className="btn btn-outline" onClick={() => navigate('/stats')}>
          ← Назад к статистике
        </button>
      </div>
    );
  }

  const radiantWin = data.radiant_win;
  const focusWon = focusPlayer?.won;

  return (
    <div>
      <div className="page-header">
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <button
              className="btn btn-outline btn-sm mb-10"
              onClick={() => navigate('/stats')}
              style={{ marginBottom: 8 }}
            >
              ← К статистике
            </button>
            <h1 style={{ margin: 0 }}>
              Матч #{data.match_id}
              {focusWon !== null && focusWon !== undefined && (
                <span
                  className="badge"
                  style={{
                    marginLeft: 12,
                    background: focusWon ? 'var(--accent)' : 'var(--danger)',
                    color: '#0a0e1a',
                  }}
                >
                  {focusWon ? 'Победа' : 'Поражение'}
                </span>
              )}
            </h1>
            <p className="text-muted" style={{ margin: '6px 0 0' }}>
              {fmtDate(data.start_time)} · {fmtDuration(data.duration)}
              {' · '}Ранг матча: {rankTierToName(data.avg_rank_tier)}
              {' · '}Счёт: <strong style={{ color: '#00d4aa' }}>{data.radiant_score ?? '?'}</strong>
              {' : '}<strong style={{ color: '#ff4757' }}>{data.dire_score ?? '?'}</strong>
            </p>
          </div>
          <div className="flex gap-10" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <span className={`badge ${data.is_parsed ? 'badge-accent' : 'badge-warning'}`}>
              {data.is_parsed ? 'Полные данные (parsed)' : 'Базовые данные'}
            </span>
            <span className="badge">источник: {data.source}</span>
          </div>
        </div>
      </div>

      <div className="mb-20">
        <ParseProgressBadge />
      </div>

      {!data.is_parsed && (
        <div className="alert mb-20">
          <strong>Матч ещё не разобран до конца.</strong>
          <p style={{ margin: '6px 0 10px' }}>
            Чтобы появились тайминги предметов, кривые золота, варды и анализ линии —
            нужно подождать парсинг реплея OpenDota (обычно 2-10 минут).
            Этот матч уже в приоритетной очереди — обновите страницу через несколько минут.
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleRequestParse}
            disabled={parseRequested}
          >
            {parseRequested ? 'Запрос отправлен' : 'Запросить ещё раз'}
          </button>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'overview' && focusPlayer && (
        <>
          <div className="grid-4 mb-20">
            <StatCard label="KDA" value={focusPlayer.kda} accent />
            <StatCard label="K / D / A" value={`${focusPlayer.kills} / ${focusPlayer.deaths} / ${focusPlayer.assists}`} />
            <StatCard label="GPM" value={focusPlayer.gold_per_min ?? '—'} />
            <StatCard label="XPM" value={focusPlayer.xp_per_min ?? '—'} />
          </div>
          <div className="grid-4 mb-20">
            <StatCard label="Last hits" value={focusPlayer.last_hits ?? '—'} />
            <StatCard label="Denies" value={focusPlayer.denies ?? '—'} />
            <StatCard label="Net worth" value={focusPlayer.net_worth ?? '—'} />
            <StatCard label="Уровень" value={focusPlayer.level ?? '—'} />
          </div>
          <div className="grid-4 mb-20">
            <StatCard label="Damage по героям" value={focusPlayer.hero_damage ?? '—'} />
            <StatCard label="Damage по строениям" value={focusPlayer.tower_damage ?? '—'} />
            <StatCard label="Healing" value={focusPlayer.hero_healing ?? '—'} />
            <StatCard label="Уровень парсинга" value={data.is_parsed ? 'Полный' : 'Базовый'} />
          </div>
          {data.is_parsed && focus && (
            <div className="grid-4 mb-20">
              <StatCard
                label="Варды (observer)"
                value={focus.obs_placed ?? focusPlayer.obs_placed ?? '—'}
              />
              <StatCard
                label="Варды (sentry)"
                value={focus.sen_placed ?? focusPlayer.sen_placed ?? '—'}
              />
              <StatCard
                label="APM"
                value={focus.actions_per_min ?? focusPlayer.actions_per_min ?? '—'}
              />
              <StatCard
                label="Файты участие"
                value={
                  (focus.teamfight_participation ?? focusPlayer.teamfight_participation) != null
                    ? `${Math.round(((focus.teamfight_participation ?? focusPlayer.teamfight_participation) as number) * 100)}%`
                    : '—'
                }
              />
            </div>
          )}
        </>
      )}

      {tab === 'lane' && (
        <div className="card">
          <div className="section-header">
            <h3>Лейн-фаза</h3>
            <div className="section-line" />
          </div>
          {focus?.lane_phase?.available ? (
            <div className="grid-4">
              <StatCard label="Gold @ 10" value={focus.lane_phase.gold_at_10 ?? '—'} />
              <StatCard label="XP @ 10" value={focus.lane_phase.xp_at_10 ?? '—'} />
              <StatCard label="CS @ 10" value={focus.lane_phase.lh_at_10 ?? '—'} />
              <StatCard label="Gold @ 20" value={focus.lane_phase.gold_at_20 ?? '—'} />
              <StatCard label="XP @ 20" value={focus.lane_phase.xp_at_20 ?? '—'} />
              <StatCard label="CS @ 20" value={focus.lane_phase.lh_at_20 ?? '—'} />
            </div>
          ) : (
            <p className="text-muted text-center" style={{ padding: 20 }}>
              Данные по линии станут доступны после парсинга матча.
            </p>
          )}
        </div>
      )}

      {tab === 'build' && (
        <div className="card">
          <div className="section-header">
            <h3>Тайминги предметов</h3>
            <div className="section-line" />
          </div>
          {focus?.item_timings && focus.item_timings.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Предмет</th>
                  </tr>
                </thead>
                <tbody>
                  {focus.item_timings.map((it, idx) => (
                    <tr key={`${it.item}-${idx}`}>
                      <td><strong>{fmtTime(it.time)}</strong></td>
                      <td>{it.item}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-center" style={{ padding: 20 }}>
              Тайминги покупок появятся после парсинга матча.
            </p>
          )}
        </div>
      )}

      {tab === 'scoreboard' && (
        <>
          <TeamScoreboard title="Radiant" players={radiant} winner={radiantWin === true} />
          <TeamScoreboard title="Dire" players={dire} winner={radiantWin === false} />
        </>
      )}
    </div>
  );
}

function StatCard({
  label, value, accent = false,
}: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className={`stat-card-value ${accent ? 'text-accent' : ''}`}>{value}</div>
    </div>
  );
}

function TeamScoreboard({
  title, players, winner,
}: { title: string; players: PlayerSlot[]; winner: boolean }) {
  return (
    <div className="card mb-20">
      <div className="section-header">
        <h3 style={{ color: winner ? 'var(--accent)' : 'var(--danger)' }}>
          {title} {winner ? '— победа' : ''}
        </h3>
        <div className="section-line" />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Герой</th>
              <th>K/D/A</th>
              <th>GPM</th>
              <th>XPM</th>
              <th>LH/DN</th>
              <th>Урон</th>
              <th>Net worth</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player_slot}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img
                    src={heroIcon(p.hero_id)}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: 4 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <strong>{heroName(p.hero_id)}</strong>
                </td>
                <td>{p.kills}/{p.deaths}/{p.assists}</td>
                <td>{p.gold_per_min ?? '—'}</td>
                <td>{p.xp_per_min ?? '—'}</td>
                <td>{p.last_hits ?? '—'}/{p.denies ?? '—'}</td>
                <td>{p.hero_damage ?? '—'}</td>
                <td>{p.net_worth ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
