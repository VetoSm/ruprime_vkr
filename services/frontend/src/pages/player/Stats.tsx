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
      const profileId = r.data?.profile?.id;
      if (profileId) {
        setPid(profileId);
      }
    }).catch(() => {});
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
  const roleContext = applied.role
    ? `${applied.role_source === 'auto' ? 'основная роль' : 'роль'} POS${applied.role}`
    : 'все позиции';

  const rolesData = Object.entries(roles)
    .map(([k, v]: [string, any]) => ({ name: roleName(k.replace('POS', '')), key: k, value: Math.round(v * 100) }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="page-header">
        <h1>Статистика</h1>
        <p>Обзор вашей игры и динамика показателей: {scopeLabel}</p>
      </div>

      <div className="card mb-20">
        <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Фильтры статистики</h3>
            <p className="text-muted" style={{ margin: '4px 0 0' }}>
              Найдено матчей: {matchesCount}. Сравнение строится с игроками того же ранга
              {applied.role ? ` и ${roleContext}` : ''}{filters.hero_id ? ` на герое ${heroName(Number(filters.hero_id))}` : ''}.
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Сбросить</button>
        </div>
        <div className="grid-4 mt-20">
          <label>
            <div className="form-label">Режим</div>
            <select className="input" value={filters.mode} onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value }))}>
              <option value="ranked">Рейтинговые</option>
              <option value="turbo">Turbo</option>
              <option value="all">Все режимы</option>
            </select>
          </label>
          <label>
            <div className="form-label">Период</div>
            <select className="input" value={filters.period} onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value }))}>
              <option value="20">Последние 20</option>
              <option value="50">Последние 50</option>
              <option value="month">Последние 30 дней</option>
              <option value="all">Вся загруженная история</option>
            </select>
          </label>
          <label>
            <div className="form-label">Позиция</div>
            <select className="input" value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
              <option value="">Все позиции</option>
              <option value="1">Позиция 1</option>
              <option value="2">Позиция 2</option>
              <option value="3">Позиция 3</option>
              <option value="4">Позиция 4</option>
              <option value="5">Позиция 5</option>
            </select>
          </label>
          <label>
            <div className="form-label">Герой</div>
            <select className="input" value={filters.hero_id} onChange={(e) => setFilters((f) => ({ ...f, hero_id: e.target.value }))}>
              <option value="">Все герои</option>
              {heroOptions.map((h: any) => (
                <option key={h.hero_id} value={h.hero_id}>{h.localized_name || h.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-card-label">Матчей в выборке <InfoTooltip text="Количество матчей после выбранных фильтров." /></div>
          <div className="stat-card-value">{matchesCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Винрейт <InfoTooltip text={`Доля побед в выборке: ${scopeLabel}.`} /></div>
          <div className="stat-card-value">{summary.winrate !== null && summary.winrate !== undefined ? `${(summary.winrate * 100).toFixed(1)}%` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">KDA <InfoTooltip text="(Убийства + Ассисты) / Смерти" /></div>
          <div className="stat-card-value">{summary.kda_avg || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">MMR <InfoTooltip text="Оценка рейтинга по матчевой статистике." /></div>
          <div className="stat-card-value text-accent">{summary.estimated_mmr || '—'}</div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'trends' ? 'active' : ''}`} onClick={() => setTab('trends')}>Тренды</div>
        <div className={`tab ${tab === 'heroes' ? 'active' : ''}`} onClick={() => setTab('heroes')}>Герои</div>
        <div className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Позиции</div>
        <div className={`tab ${tab === 'features' ? 'active' : ''}`} onClick={() => setTab('features')}>Навыки</div>
        <div className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>Сравнение</div>
      </div>

      {tab === 'trends' && (
        <div>
          {trends.gpm_over_time && trends.gpm_over_time.length > 0 ? (
            <>
              <div className="card mb-20">
                <div className="section-header">
                  <h3>GPM по периодам <InfoTooltip text="Как менялось ваше золото в минуту от матча к матчу." /></h3>
                  <div className="section-line" />
                </div>
                <ResponsiveContainer width="100%" height={280}>
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
              <div className="grid-2">
                <div className="card mb-20">
                  <div className="section-header">
                    <h3>Винрейт</h3>
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
                    <h3>KDA</h3>
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
            <h3>Топ героев</h3>
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
                  <thead><tr><th>Герой</th><th>Игр</th><th>Винрейт</th><th>KDA</th></tr></thead>
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
            <h3>Распределение по позициям</h3>
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
                    score={comp.score} targetScore={comp.target_score} />
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
              Сравнение с игроками того же ранга
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
