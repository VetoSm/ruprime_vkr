import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { ComponentBar } from '../../ui/SkillRing';

export default function PlayerStats() {
  const [stats, setStats] = useState<any>(null);
  const [features, setFeatures] = useState<any>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [tab, setTab] = useState('trends');

  useEffect(() => {
    coreApi.get('/me/overview').then((r) => {
      const pid = r.data?.profile?.id;
      if (pid) {
        setProfileId(pid);
        coreApi.get(`/player/${pid}/stats/overview`).then((r2) => setStats(r2.data)).catch(() => {});
        coreApi.get(`/player/${pid}/detailed-features`).then((r2) => setFeatures(r2.data)).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const summary = stats?.summary || {};
  const trends = stats?.trends || {};
  const heroes = stats?.heroes?.top_heroes || [];
  const comparisons = stats?.comparisons?.vs_same_tier || {};
  const roles = stats?.roles?.actual_roles_distribution || {};
  const categories = features?.categories || [];

  const COLORS = ['#00ff88', '#ffa502', '#ff4757', '#1e90ff', '#ff6b81', '#7bed9f'];

  const rolesData = Object.entries(roles).map(([k, v]: [string, any]) => ({
    name: k, value: Math.round(v * 100),
  }));

  return (
    <div>
      <div className="page-header">
        <h1>Статистика</h1>
        <p>Обзор вашей игры и динамика показателей</p>
      </div>

      <div className="grid-4 mb-30">
        <div className="stat-card"><div className="stat-card-label">Игр проанализировано</div><div className="stat-card-value">{summary.games_analyzed || features?.total_matches || 0}</div></div>
        <div className="stat-card"><div className="stat-card-label">Винрейт</div><div className="stat-card-value">{summary.winrate ? `${(summary.winrate * 100).toFixed(1)}%` : '—'}</div></div>
        <div className="stat-card"><div className="stat-card-label">Средний KDA</div><div className="stat-card-value">{summary.kda_avg || '—'}</div></div>
        <div className="stat-card"><div className="stat-card-label">Примерный MMR</div><div className="stat-card-value text-accent">{summary.estimated_mmr || '—'}</div></div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'trends' ? 'active' : ''}`} onClick={() => setTab('trends')}>Тренды</div>
        <div className={`tab ${tab === 'heroes' ? 'active' : ''}`} onClick={() => setTab('heroes')}>Герои</div>
        <div className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Роли</div>
        <div className={`tab ${tab === 'features' ? 'active' : ''}`} onClick={() => setTab('features')}>Фичи</div>
        <div className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>Сравнение</div>
      </div>

      {/* Тренды */}
      {tab === 'trends' && (
        <div>
          {trends.gpm_over_time && trends.gpm_over_time.length > 0 ? (
            <>
              <div className="card mb-20">
                <h3 className="card-title">GPM по времени</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={trends.gpm_over_time}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                    <XAxis dataKey="ts" stroke="#8b949e" fontSize={11} />
                    <YAxis stroke="#8b949e" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }} />
                    <Line type="monotone" dataKey="gpm" stroke="#00ff88" strokeWidth={2} dot={{ fill: '#00ff88', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid-2">
                <div className="card mb-20">
                  <h3 className="card-title">Винрейт по времени</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trends.winrate_over_time?.map((d: any) => ({ ...d, wr: +(d.winrate * 100).toFixed(1) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                      <XAxis dataKey="ts" stroke="#8b949e" fontSize={10} />
                      <YAxis stroke="#8b949e" fontSize={10} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }} />
                      <Line type="monotone" dataKey="wr" stroke="#ffa502" strokeWidth={2} name="Винрейт %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="card mb-20">
                  <h3 className="card-title">KDA по времени</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trends.kda_over_time}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                      <XAxis dataKey="ts" stroke="#8b949e" fontSize={10} />
                      <YAxis stroke="#8b949e" fontSize={10} />
                      <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }} />
                      <Line type="monotone" dataKey="kda" stroke="#1e90ff" strokeWidth={2} name="KDA" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <div className="card"><p className="text-muted">Нет данных трендов. Привяжите Steam и загрузите матчи.</p></div>
          )}
        </div>
      )}

      {/* Герои */}
      {tab === 'heroes' && (
        <div className="card">
          <h3 className="card-title">Топ героев</h3>
          {heroes.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={heroes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                  <XAxis dataKey="hero_id" stroke="#8b949e" fontSize={11} />
                  <YAxis stroke="#8b949e" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }} />
                  <Bar dataKey="games" fill="#00ff88" name="Игр" />
                </BarChart>
              </ResponsiveContainer>
              <div className="table-wrap mt-20">
                <table>
                  <thead><tr><th>ID Героя</th><th>Игр</th><th>Винрейт</th><th>KDA</th></tr></thead>
                  <tbody>
                    {heroes.map((h: any) => (
                      <tr key={h.hero_id}>
                        <td>{h.hero_id}</td><td>{h.games}</td>
                        <td>{(h.winrate * 100).toFixed(1)}%</td><td>{h.avg_kda}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-muted">Нет данных по героям.</p>
          )}
        </div>
      )}

      {/* Роли */}
      {tab === 'roles' && (
        <div className="card">
          <h3 className="card-title">Распределение по ролям</h3>
          {rolesData.length > 0 ? (
            <div className="grid-2">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={rolesData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={100} label={({ name, value }) => `${name}: ${value}%`}>
                    {rolesData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div>
                {rolesData.map((r: any, i: number) => (
                  <div key={r.name} className="flex-between mb-10">
                    <div className="flex gap-10" style={{ alignItems: 'center' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
                      <span>{r.name}</span>
                    </div>
                    <strong>{r.value}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted">Нет данных по ролям.</p>
          )}
        </div>
      )}

      {/* Фичи (детальный анализ) */}
      {tab === 'features' && (
        <div>
          {categories.length > 0 ? (
            categories.map((cat: any) => (
              <div key={cat.key} className="card mb-20">
                <div className="flex-between mb-10">
                  <h3 className="card-title" style={{ margin: 0 }}>{cat.name}</h3>
                  <div>
                    <span className="badge badge-accent">Текущий: {cat.score}/10</span>
                    <span className="badge badge-warning" style={{ marginLeft: 8 }}>Цель: {cat.target}/10</span>
                  </div>
                </div>
                {cat.components.map((comp: any) => (
                  <ComponentBar key={comp.key}
                    name={comp.name} playerValue={comp.player_value}
                    targetValue={comp.target_value} baselineValue={comp.baseline_value}
                    score={comp.score} targetScore={comp.target_score} />
                ))}
              </div>
            ))
          ) : (
            <div className="card"><p className="text-muted">Фичи рассчитываются после загрузки матчей.</p></div>
          )}
        </div>
      )}

      {/* Сравнение */}
      {tab === 'compare' && (
        <div className="card">
          <h3 className="card-title">Сравнение с игроками того же ранга</h3>
          {Object.keys(comparisons).length > 0 ? (
            <div className="grid-3">
              {Object.entries(comparisons).map(([key, val]: [string, any]) => {
                const pct = Math.round(val * 100);
                return (
                  <div key={key} className="stat-card">
                    <div className="stat-card-label">{key.replace(/_/g, ' ')}</div>
                    <div className="stat-card-value" style={{ color: pct >= 100 ? 'var(--accent)' : pct >= 80 ? 'var(--warning)' : 'var(--danger)' }}>
                      {pct}%
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted">Нет данных для сравнения.</p>
          )}
        </div>
      )}
    </div>
  );
}
