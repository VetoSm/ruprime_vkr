import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { loadHeroes } from '../../api/heroes';
import SkillRing, { ComponentBar } from '../../ui/SkillRing';
import { RankBadge, InfoTooltip } from '../../ui/GameComponents';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MMR_BY_RANK: Record<string, number> = {
  HERALD: 700, GUARDIAN: 1500, CRUSADER: 2200, ARCHON: 2900,
  LEGEND: 3600, ANCIENT: 4300, DIVINE: 5000, IMMORTAL: 5700,
};

const FEATURE_TIPS: Record<string, string> = {
  farming: 'Показывает насколько эффективно вы зарабатываете золото и добиваете крипов.',
  combat: 'Ваша эффективность в боях: урон, убийства, ассисты.',
  survival: 'Как часто вы умираете и какой вклад в выживание команды.',
  vision: 'Контроль карты: обсервер и сентри варды. Данные из parsed матчей.',
  objectives: 'Давление на объекты: башни и Рошан.',
  mechanics: 'Механический скилл: скорость действий и набор опыта.',
  consistency: 'Насколько стабильно вы играете от матча к матчу.',
  control: 'Контроль противников: станы и инициация. Данные из parsed матчей.',
};

const CHART_STYLE = { background: '#151c2e', border: '1px solid #1e2a45', color: '#e8edf5' };

export default function PlayerDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any>(null);
  const [detailedFeatures, setDetailedFeatures] = useState<any>(null);
  const [steamData, setSteamData] = useState<any>(null);
  const [playerProfile, setPlayerProfile] = useState<any>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  useEffect(() => {
    loadHeroes();
    coreApi.get('/me/overview').then((r) => setOverview(r.data)).catch(() => {});
    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
    coreApi.get('/player/profile').then((r) => setPlayerProfile(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (overview?.profile?.id) {
      coreApi.get(`/player/${overview.profile.id}/stats/overview`).then((r) => setPlayerStats(r.data)).catch(() => {});
      coreApi.get(`/player/${overview.profile.id}/detailed-features`).then((r) => setDetailedFeatures(r.data)).catch(() => {});
    }
  }, [overview]);

  const summary = playerStats?.summary || {};
  const trends = playerStats?.trends || {};
  const isLinked = steamData?.linked && steamData?.personaname;
  const displayName = steamData?.personaname || user?.login || 'Игрок';
  const avatarUrl = steamData?.avatar_url;
  const estimated_mmr = summary.estimated_mmr || 0;
  const totalGames = summary.total_games || summary.games_analyzed || (steamData?.win || 0) + (steamData?.lose || 0) || 0;
  const winrate = summary.winrate || (totalGames > 0 ? (steamData?.win || 0) / totalGames : 0);
  const hours = summary.estimated_hours || steamData?.estimated_hours || 0;
  const desiredRankStr = playerProfile?.desired_rank_tier || 'IMMORTAL';
  const desired_mmr = MMR_BY_RANK[desiredRankStr.toUpperCase()] || 5700;
  const progress = estimated_mmr > 0 ? Math.min((estimated_mmr / desired_mmr) * 100, 100) : 0;

  const categories = detailedFeatures?.categories || [];
  const topGaps = detailedFeatures?.top_gaps || [];
  const overallScore = detailedFeatures?.overall_score || 0;

  return (
    <div>
      {!isLinked && (
        <div className="alert alert-error mb-20">
          Steam не привязан. <a href="/profile/player">Привяжите аккаунт</a> для получения статистики.
        </div>
      )}

      {/* === Top: Player Card + Skills Grid === */}
      <div className="dash-layout mb-20">
        {/* Left: Player Card */}
        <div className="hero-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {avatarUrl && (
            <img src={avatarUrl} alt="" className="hero-card-avatar" style={{ marginBottom: 12 }} />
          )}
          {(steamData?.rank_tier || playerProfile?.actual_rank_tier) && (
            <div style={{ marginBottom: 8 }}>
              {steamData?.rank_tier
                ? <RankBadge rankTier={steamData.rank_tier} size="lg" />
                : <RankBadge rankName={playerProfile?.actual_rank_tier} size="lg" />
              }
            </div>
          )}
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '4px 0 12px' }}>{displayName}</h2>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {estimated_mmr > 0 && (
              <div className="stat-pill" style={{ minWidth: 80, padding: '10px 14px' }}>
                <span className="stat-pill-label">MMR</span>
                <span className="stat-pill-value accent">{estimated_mmr}</span>
              </div>
            )}
            <div className="stat-pill" style={{ minWidth: 80, padding: '10px 14px' }}>
              <span className="stat-pill-label">Винрейт</span>
              <span className="stat-pill-value">{winrate > 0 ? `${(winrate * 100).toFixed(0)}%` : '—'}</span>
            </div>
            <div className="stat-pill" style={{ minWidth: 80, padding: '10px 14px' }}>
              <span className="stat-pill-label">Часы</span>
              <span className="stat-pill-value">{hours || '—'}</span>
            </div>
          </div>

          {overallScore > 0 && (
            <div style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(0,212,170,0.06)', borderRadius: 12, border: '1px solid rgba(0,212,170,0.15)' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)' }}>{overallScore.toFixed(1)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Общий балл</div>
            </div>
          )}

          {estimated_mmr > 0 && (
            <div style={{ width: '100%', marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>{estimated_mmr} MMR</span>
                <span><RankBadge rankName={desiredRankStr} size="sm" /></span>
              </div>
              <div className="progress-bar progress-bar--lg">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--accent)', marginTop: 3, fontWeight: 700 }}>
                {progress.toFixed(0)}%
              </div>
            </div>
          )}

          <a href="/profile/player" className="btn btn-outline btn-sm" style={{ marginTop: 16 }}>
            Редактировать профиль
          </a>
        </div>

        {/* Right: Skills Grid */}
        <div>
          <div className="flex-between mb-10">
            <h3 style={{ fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Навыки
              <InfoTooltip text="Оценка навыков от 0 до 10 на основе ваших матчей. Кликните для деталей." />
            </h3>
            {detailedFeatures?.target_rank && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {detailedFeatures.current_band} → {detailedFeatures.target_band}
              </span>
            )}
          </div>

          {categories.length > 0 ? (
            <div className="skill-grid">
              {categories.map((cat: any) => (
                <SkillRing key={cat.key} value={cat.score} target={cat.target} label={cat.name}
                  onClick={() => setExpandedSkill(expandedSkill === cat.key ? null : cat.key)}
                  expanded={expandedSkill === cat.key} />
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <p className="text-muted">
                {isLinked ? 'Навыки рассчитываются после загрузки матчей...' : 'Привяжите Steam аккаунт для анализа.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* === Drill-down === */}
      {expandedSkill && (() => {
        const cat = categories.find((c: any) => c.key === expandedSkill);
        if (!cat) return null;
        const tip = FEATURE_TIPS[cat.key] || '';
        return (
          <div className="card mb-20" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
            <div className="flex-between mb-10">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                {cat.name} {tip && <InfoTooltip text={tip} />}
              </h4>
              <div className="flex gap-10">
                <span className="badge badge-accent">Текущий: {cat.score}/10</span>
                <span className="badge badge-warning">Цель: {cat.target}/10</span>
              </div>
            </div>
            {cat.components.map((comp: any) => (
              <ComponentBar key={comp.key} name={comp.name}
                playerValue={comp.player_value} targetValue={comp.target_value}
                baselineValue={comp.baseline_value} score={comp.score} targetScore={comp.target_score} />
            ))}
          </div>
        );
      })()}

      {/* === What to Improve === */}
      {topGaps.length > 0 && (
        <div className="card mb-20">
          <div className="section-header">
            <h3>Что подтянуть до {detailedFeatures?.target_rank || desiredRankStr}</h3>
            <div className="section-line" />
          </div>
          {topGaps.slice(0, 5).map((g: any, i: number) => {
            const maxVal = Math.max(g.target_value, g.player_value, 1);
            const pct = Math.min((g.player_value / maxVal) * 100, 100);
            const barColor = pct >= 80 ? 'var(--accent)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
            return (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div>
                    <strong style={{ fontSize: '0.88rem' }}>{g.component}</strong>
                    <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>({g.category})</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                    <span>{typeof g.player_value === 'number' ? g.player_value.toFixed(1) : g.player_value}</span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{typeof g.target_value === 'number' ? g.target_value.toFixed(1) : g.target_value}</span>
                    <span style={{
                      fontSize: '0.72rem', color: 'var(--danger)',
                      background: 'rgba(255,71,87,0.08)', padding: '1px 7px', borderRadius: 8,
                    }}>-{g.gap.toFixed(1)}</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 16 }}>
            <a href="/ai-chat" className="btn btn-purple">Спросить AI-тренера</a>
          </div>
        </div>
      )}

      {/* === GPM Trend Chart === */}
      {trends.gpm_over_time && trends.gpm_over_time.length > 0 && (
        <div className="card mb-20">
          <div className="section-header">
            <h3>GPM тренд <InfoTooltip text="Как менялось ваше золото в минуту по последним матчам." /></h3>
            <div className="section-line" />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trends.gpm_over_time}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
              <XAxis dataKey="ts" stroke="#7b8ba5" fontSize={11} />
              <YAxis stroke="#7b8ba5" fontSize={11} />
              <Tooltip contentStyle={CHART_STYLE} />
              <Line type="monotone" dataKey="gpm" stroke="#00d4aa" strokeWidth={2.5}
                dot={{ fill: '#00d4aa', r: 3 }} activeDot={{ r: 5, fill: '#00ffc8' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* === Quick Stats === */}
      <div className="grid-4">
        <div className="stat-card">
          <div className="stat-card-label">Винрейт</div>
          <div className="stat-card-value">{winrate > 0 ? `${(winrate * 100).toFixed(1)}%` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">GPM <InfoTooltip text="Золото в минуту." /></div>
          <div className="stat-card-value">{summary.gpm_avg || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">XPM <InfoTooltip text="Опыт в минуту." /></div>
          <div className="stat-card-value">{summary.xpm_avg || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">KDA <InfoTooltip text="(K + A) / D" /></div>
          <div className="stat-card-value">{summary.kda_avg || '—'}</div>
        </div>
      </div>
    </div>
  );
}
