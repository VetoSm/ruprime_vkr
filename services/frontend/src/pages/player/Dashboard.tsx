import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { loadHeroes, heroName, heroIcon } from '../../api/heroes';
import SkillRing, { ComponentBar } from '../../ui/SkillRing';
import { RankBadge, RoleBadge, InfoTooltip } from '../../ui/GameComponents';

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

export default function PlayerDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any>(null);
  const [detailedFeatures, setDetailedFeatures] = useState<any>(null);
  const [steamData, setSteamData] = useState<any>(null);
  const [playerProfile, setPlayerProfile] = useState<any>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');

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
      {/* Player Hero Card */}
      <div className="card card-accent mb-20">
        <div className="flex gap-20" style={{ alignItems: 'center' }}>
          {avatarUrl && (
            <img src={avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: 14,
              border: '2px solid var(--accent)', boxShadow: '0 0 20px rgba(0, 212, 170, 0.2)' }} />
          )}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900 }}>{displayName}</h2>
            <div className="flex gap-10 mt-10" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              {steamData?.rank_tier ? <RankBadge rankTier={steamData.rank_tier} /> :
                playerProfile?.actual_rank_tier ? <RankBadge rankName={playerProfile.actual_rank_tier} /> : null}
              {estimated_mmr > 0 && <span className="badge badge-purple">{estimated_mmr} MMR</span>}
              <span className="badge badge-accent">{totalGames} Игр</span>
              {hours > 0 && <span className="badge badge-accent">~{hours} ч</span>}
              {winrate > 0 && <span className="badge badge-accent">{(winrate * 100).toFixed(1)}% WR</span>}
            </div>
          </div>
          {overallScore > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>{overallScore}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Score</div>
            </div>
          )}
        </div>
      </div>

      {!isLinked && (
        <div className="alert alert-error mb-20">
          Steam не привязан. <a href="/profile/player">Привяжите аккаунт</a> для статистики.
        </div>
      )}

      {/* Goal Progress */}
      {estimated_mmr > 0 && (
        <div className="card mb-20">
          <div className="flex-between mb-10">
            <span style={{ fontWeight: 700 }}>
              Цель: <RankBadge rankName={desiredRankStr} size="sm" />
            </span>
            <span className="text-accent" style={{ fontWeight: 700 }}>{progress.toFixed(0)}%</span>
          </div>
          <div className="progress-bar mb-10">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex-between" style={{ fontSize: '0.85rem' }}>
            <span className="text-muted">{estimated_mmr} MMR</span>
            <span className="text-muted">{desired_mmr} MMR</span>
          </div>
        </div>
      )}

      {/* Skills with drill-down */}
      <div className="card mb-20">
        <div className="flex-between mb-20">
          <h3 className="card-title" style={{ margin: 0 }}>⚡ Навыки</h3>
          {detailedFeatures?.target_rank && (
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
              {detailedFeatures.current_band} → {detailedFeatures.target_band}
            </span>
          )}
        </div>

        {categories.length > 0 ? (
          <>
            <div className="grid-4">
              {categories.map((cat: any) => (
                <SkillRing key={cat.key} value={cat.score} target={cat.target} label={cat.name}
                  onClick={() => setExpandedSkill(expandedSkill === cat.key ? null : cat.key)}
                  expanded={expandedSkill === cat.key} />
              ))}
            </div>

            {expandedSkill && (() => {
              const cat = categories.find((c: any) => c.key === expandedSkill);
              if (!cat) return null;
              const tip = FEATURE_TIPS[cat.key] || '';
              return (
                <div className="card mt-20" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                  <div className="flex-between mb-10">
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          </>
        ) : (
          <p className="text-muted text-center" style={{ padding: 20 }}>
            {isLinked ? 'Навыки рассчитываются после загрузки матчей.' : 'Привяжите Steam аккаунт.'}
          </p>
        )}
      </div>

      {/* What to improve */}
      {topGaps.length > 0 && (
        <div className="card mb-20">
          <h3 className="card-title">📈 Что подтянуть до {detailedFeatures?.target_rank || desiredRankStr}</h3>
          {topGaps.slice(0, 5).map((g: any, i: number) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: '1px solid var(--border-color)',
            }}>
              <div>
                <strong>{g.component}</strong>
                <span className="text-muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>({g.category})</span>
              </div>
              <div className="flex gap-10" style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem' }}>{g.player_value}</span>
                <span className="text-muted">→</span>
                <span className="text-accent" style={{ fontWeight: 700 }}>{g.target_value}</span>
                <span className="badge badge-danger">-{g.gap.toFixed(1)}</span>
              </div>
            </div>
          ))}
          <div className="mt-20">
            <a href="/ai-chat" className="btn btn-purple">🤖 Спросить AI-тренера</a>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <div className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Обзор</div>
        <div className={`tab ${tab === 'heroes' ? 'active' : ''}`} onClick={() => setTab('heroes')}>Герои</div>
      </div>

      {tab === 'overview' && (
        <div className="grid-4">
          <div className="stat-card">
            <div className="stat-card-label">Винрейт</div>
            <div className="stat-card-value">{winrate > 0 ? `${(winrate * 100).toFixed(1)}%` : '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">GPM <InfoTooltip text="Золото в минуту. Показывает скорость фарма." /></div>
            <div className="stat-card-value">{summary.gpm_avg || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">XPM <InfoTooltip text="Опыт в минуту. Показывает скорость набора уровня." /></div>
            <div className="stat-card-value">{summary.xpm_avg || '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">KDA <InfoTooltip text="(Убийства + Ассисты) / Смерти. Эффективность в боях." /></div>
            <div className="stat-card-value">{summary.kda_avg || '—'}</div>
          </div>
        </div>
      )}

      {tab === 'heroes' && (
        <div className="card">
          {playerStats?.heroes?.top_heroes && playerStats.heroes.top_heroes.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Герой</th><th>Игр</th><th>Винрейт</th><th>KDA</th></tr></thead>
                <tbody>
                  {playerStats.heroes.top_heroes.map((h: any) => (
                    <tr key={h.hero_id}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img src={heroIcon(h.hero_id)} alt="" style={{ width: 28, height: 28, borderRadius: 4 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        {heroName(h.hero_id)}
                      </td>
                      <td>{h.games}</td>
                      <td>{(h.winrate * 100).toFixed(1)}%</td>
                      <td>{h.avg_kda}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-center" style={{ padding: 20 }}>
              {isLinked ? 'Данные появятся после загрузки матчей.' : 'Привяжите Steam.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
