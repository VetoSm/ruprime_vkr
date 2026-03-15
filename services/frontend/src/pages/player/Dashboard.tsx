import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import SkillRing, { ComponentBar } from '../../ui/SkillRing';

const MMR_BY_RANK: Record<string, number> = {
  HERALD: 700, GUARDIAN: 1500, CRUSADER: 2200, ARCHON: 2900,
  LEGEND: 3600, ANCIENT: 4300, DIVINE: 5000, IMMORTAL: 5700,
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
  const actualRank = summary.estimated_rank_tier || playerProfile?.actual_rank_tier || 'Без ранга';
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
  const warningMsg = playerStats?.warning;

  return (
    <div>
      {/* Карточка игрока */}
      <div className="card card-accent mb-30">
        <div className="flex gap-20" style={{ alignItems: 'center' }}>
          {avatarUrl && (
            <img src={avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: 10, border: '2px solid var(--accent)' }} />
          )}
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{displayName}</h2>
            <div className="flex gap-10 mt-10" style={{ flexWrap: 'wrap' }}>
              <span className="badge badge-accent">{actualRank}</span>
              {estimated_mmr > 0 && <span className="badge badge-accent">{estimated_mmr} MMR</span>}
              <span className="badge badge-accent">{totalGames} Игр</span>
              {hours > 0 && <span className="badge badge-accent">~{hours} часов</span>}
              {winrate > 0 && <span className="badge badge-accent">Винрейт: {(winrate * 100).toFixed(1)}%</span>}
              {overallScore > 0 && <span className="badge badge-accent">Общий рейтинг: {overallScore}/10</span>}
            </div>
          </div>
        </div>
      </div>

      {warningMsg && <div className="alert alert-error mb-20" style={{ whiteSpace: 'pre-line' }}>{warningMsg}</div>}
      {!isLinked && (
        <div className="alert alert-error mb-20">
          Steam не привязан. <a href="/profile/player">Привяжите Steam аккаунт</a> для получения статистики.
        </div>
      )}

      {/* Прогресс к цели */}
      <div className="card card-accent mb-30">
        <div className="text-center mb-20">
          <h3 className="text-accent" style={{ fontSize: '1.3rem' }}>Ваша цель: {desiredRankStr}</h3>
        </div>
        {estimated_mmr > 0 ? (
          <>
            <div className="flex-between mb-10">
              <span className="text-muted">Прогресс к цели</span>
              <span className="text-accent">{progress.toFixed(1)}%</span>
            </div>
            <div className="progress-bar mb-20">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="grid-2">
              <div className="card"><div className="stat-card-label">Текущий MMR</div><div className="stat-card-value">{estimated_mmr}</div></div>
              <div className="card"><div className="stat-card-label">Целевой MMR</div><div className="stat-card-value text-accent">{desired_mmr}</div></div>
            </div>
          </>
        ) : (
          <div className="text-center text-muted">
            {isLinked ? 'Откройте историю матчей в Dota 2 для расчёта MMR.' : 'Привяжите Steam аккаунт.'}
          </div>
        )}
      </div>

      {/* Система навыков с drill-down */}
      <div className="card mb-30">
        <div className="flex-between mb-20">
          <h3 className="card-title" style={{ margin: 0 }}>Система Навыков и Достижений</h3>
          {detailedFeatures?.target_rank && (
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
              Эталон: {detailedFeatures.current_band} → Цель: {detailedFeatures.target_band}
            </span>
          )}
        </div>

        {categories.length > 0 ? (
          <>
            <div className="grid-3">
              {categories.map((cat: any) => (
                <SkillRing
                  key={cat.key}
                  value={cat.score}
                  target={cat.target}
                  label={cat.name}
                  onClick={() => setExpandedSkill(expandedSkill === cat.key ? null : cat.key)}
                  expanded={expandedSkill === cat.key}
                />
              ))}
            </div>

            {/* Drill-down panel */}
            {expandedSkill && (() => {
              const cat = categories.find((c: any) => c.key === expandedSkill);
              if (!cat) return null;
              return (
                <div className="card mt-20" style={{ borderColor: 'var(--accent)' }}>
                  <div className="flex-between mb-10">
                    <h4>{cat.name}</h4>
                    <div>
                      <span className="badge badge-accent" style={{ marginRight: 8 }}>Текущий: {cat.score}/10</span>
                      <span className="badge badge-warning">Цель: {cat.target}/10</span>
                      {cat.gap > 0 && <span className="badge badge-danger" style={{ marginLeft: 8 }}>Разрыв: {cat.gap}</span>}
                    </div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    {cat.components.map((comp: any) => (
                      <ComponentBar
                        key={comp.key}
                        name={comp.name}
                        playerValue={comp.player_value}
                        targetValue={comp.target_value}
                        baselineValue={comp.baseline_value}
                        score={comp.score}
                        targetScore={comp.target_score}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <p className="text-muted text-center">
            {isLinked ? 'Навыки рассчитываются после загрузки матчей.' : 'Привяжите Steam аккаунт.'}
          </p>
        )}
      </div>

      {/* Что подтянуть */}
      {topGaps.length > 0 && (
        <div className="card mb-30">
          <h3 className="card-title">Что нужно подтянуть</h3>
          <p className="text-muted mb-20">Топ областей для улучшения до ранга {detailedFeatures?.target_rank || desiredRankStr}:</p>
          {topGaps.slice(0, 5).map((g: any, i: number) => (
            <div key={i} className="card mb-10" style={{ borderColor: 'var(--warning)', padding: 14 }}>
              <div className="flex-between">
                <div>
                  <strong>{g.component}</strong>
                  <span className="text-muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>({g.category})</span>
                </div>
                <div className="flex gap-10">
                  <span style={{ fontSize: '0.85rem' }}>
                    Ваше: <strong>{g.player_value}</strong>
                  </span>
                  <span style={{ fontSize: '0.85rem' }}>
                    Цель: <strong className="text-accent">{g.target_value}</strong>
                  </span>
                  <span className="badge badge-danger">-{g.gap.toFixed(1)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Вкладки */}
      <div className="tabs">
        <div className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Обзор</div>
        <div className={`tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>Аналитика</div>
        <div className={`tab ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>План развития</div>
      </div>

      {tab === 'overview' && (
        <div className="grid-4">
          <div className="stat-card"><div className="stat-card-label">Винрейт</div><div className="stat-card-value">{winrate > 0 ? `${(winrate * 100).toFixed(1)}%` : '—'}</div></div>
          <div className="stat-card"><div className="stat-card-label">Средний GPM</div><div className="stat-card-value">{summary.gpm_avg || steamData?.totals?.avg_gpm || '—'}</div></div>
          <div className="stat-card"><div className="stat-card-label">Средний XPM</div><div className="stat-card-value">{summary.xpm_avg || steamData?.totals?.avg_xpm || '—'}</div></div>
          <div className="stat-card"><div className="stat-card-label">Средний KDA</div><div className="stat-card-value">{summary.kda_avg || '—'}</div></div>
        </div>
      )}

      {tab === 'analytics' && (
        <div className="card">
          <h3 className="card-title">Последние матчи</h3>
          {playerStats?.heroes?.top_heroes && playerStats.heroes.top_heroes.length > 0 ? (
            <div className="table-wrap mt-20">
              <table>
                <thead><tr><th>Герой</th><th>Игр</th><th>Винрейт</th><th>KDA</th></tr></thead>
                <tbody>
                  {playerStats.heroes.top_heroes.map((h: any) => (
                    <tr key={h.hero_id}>
                      <td>{h.hero_id}</td><td>{h.games}</td>
                      <td>{(h.winrate * 100).toFixed(1)}%</td><td>{h.avg_kda}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">{isLinked ? 'Данные появятся после открытия истории матчей.' : 'Привяжите Steam.'}</p>
          )}
        </div>
      )}

      {tab === 'plan' && (
        <div className="card">
          <h3 className="card-title">План развития</h3>
          {topGaps.length > 0 ? (
            <div>
              <p className="text-muted mb-20">Сосредоточьтесь на этих областях для достижения {detailedFeatures?.target_rank}:</p>
              {topGaps.slice(0, 5).map((g: any, i: number) => (
                <div key={i} className="card mb-10" style={{ borderColor: 'var(--warning)' }}>
                  <div className="flex-between">
                    <div>
                      <strong>{g.component}</strong>
                      <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                        Текущий уровень: {g.current_score.toFixed(1)}/10 → Цель: {g.target_score.toFixed(1)}/10
                      </div>
                    </div>
                    <span className="badge badge-warning">Разрыв: {g.gap.toFixed(1)}</span>
                  </div>
                </div>
              ))}
              <a href="/ai-chat" className="btn btn-primary mt-20">Спросить AI-тренера совет</a>
            </div>
          ) : (
            <p className="text-muted">{isLinked ? 'План формируется после загрузки матчей.' : 'Привяжите Steam.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
