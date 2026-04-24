import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

type TabType = 'stats' | 'tables' | 'baselines' | 'analyses' | 'accounts';

export default function MlData() {
  const [tab, setTab] = useState<TabType>('stats');
  const [stats, setStats] = useState<any>(null);
  const [tableData, setTableData] = useState<any>(null);
  const [baselines, setBaselines] = useState<any>(null);
  const [analyses, setAnalyses] = useState<any>(null);
  const [accounts, setAccounts] = useState<any>(null);
  const [accountDetail, setAccountDetail] = useState<any>(null);
  const [allLinks, setAllLinks] = useState<any[]>([]);
  const [busyRefreshAcc, setBusyRefreshAcc] = useState<number | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState('ml_raw_matches');
  const [tableOffset, setTableOffset] = useState(0);
  const [mmrFilter, setMmrFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const mlTables = [
    'ml_raw_matches', 'ml_raw_players', 'ml_raw_teams', 'ml_raw_picks_bans',
    'ml_constants_heroes', 'ml_constants_items', 'ml_constants_abilities',
    'ml_kaggle_baselines', 'ml_player_analyses',
  ];

  useEffect(() => {
    if (tab === 'stats') loadStats();
    if (tab === 'baselines') loadBaselines();
    if (tab === 'analyses') loadAnalyses();
    if (tab === 'accounts') loadAccounts();
  }, [tab]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await coreApi.get('/admin/ml-data/stats');
      setStats(res.data);
    } catch {}
    setLoading(false);
  };

  const loadTable = async (tbl: string, offset: number = 0) => {
    setLoading(true);
    setSelectedTable(tbl);
    setTableOffset(offset);
    try {
      const res = await coreApi.get(`/admin/ml-data/table/${tbl}`, {
        params: { limit: 30, offset },
      });
      setTableData(res.data);
    } catch {}
    setLoading(false);
  };

  const loadBaselines = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (mmrFilter) params.mmr_band = mmrFilter;
      const res = await coreApi.get('/admin/ml-data/baselines', { params });
      setBaselines(res.data);
    } catch {}
    setLoading(false);
  };

  const loadAnalyses = async () => {
    setLoading(true);
    try {
      const res = await coreApi.get('/admin/ml-data/analyses');
      setAnalyses(res.data);
    } catch {}
    setLoading(false);
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await coreApi.get('/admin/ml-data/player-accounts');
      setAccounts(res.data);
    } catch {}
    // Also pull the full user list to show links that aren't in ML yet
    // (closed profiles, fake Steam IDs from seeds, or rate-limited ones).
    try {
      const full = await coreApi.get('/admin/users-full');
      setAllLinks((full.data?.items || []).filter((u: any) => u.steam_linked));
    } catch {
      setAllLinks([]);
    }
    setLoading(false);
  };

  const refreshAccount = async (accountId: number) => {
    setBusyRefreshAcc(accountId); setRefreshMsg(null);
    try {
      const res = await coreApi.post(`/admin/steam/${accountId}/refresh`);
      setRefreshMsg(res.data?.message || 'Запрошена фоновая загрузка.');
      setTimeout(loadAccounts, 2000);
    } catch (e: any) {
      setRefreshMsg(e?.response?.data?.detail || 'Не удалось запустить догрузку');
    } finally {
      setBusyRefreshAcc(null);
    }
  };

  const loadAccountDetail = async (accountId: number) => {
    setLoading(true);
    try {
      const res = await coreApi.get(`/admin/ml-data/player-account-detail/${accountId}`);
      setAccountDetail(res.data);
    } catch {}
    setLoading(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Данные ML</h1>
        <p>Просмотр загруженных таблиц, эталонов и анализов</p>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>Обзор таблиц</div>
        <div className={`tab ${tab === 'tables' ? 'active' : ''}`} onClick={() => { setTab('tables'); loadTable(selectedTable); }}>Содержимое</div>
        <div className={`tab ${tab === 'baselines' ? 'active' : ''}`} onClick={() => setTab('baselines')}>Эталоны</div>
        <div className={`tab ${tab === 'analyses' ? 'active' : ''}`} onClick={() => setTab('analyses')}>Анализы игроков</div>
        <div className={`tab ${tab === 'accounts' ? 'active' : ''}`} onClick={() => setTab('accounts')}>Аккаунты игроков</div>
      </div>

      {/* ===== Обзор таблиц ===== */}
      {tab === 'stats' && (
        <div>
          {!stats ? (
            <div className="card"><p className="text-muted">Загрузка...</p></div>
          ) : (
            <div className="grid-3">
              {Object.entries(stats).map(([name, info]: [string, any]) => (
                <div key={name} className="stat-card" style={{ cursor: 'pointer' }}
                  onClick={() => { setTab('tables'); loadTable(name); }}>
                  <div className="stat-card-label" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{name}</div>
                  <div className="stat-card-value">{(info.count || 0).toLocaleString('ru-RU')}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>строк</div>
                  {info.sources && (
                    <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {Object.entries(info.sources).map(([src, cnt]: [string, any]) => (
                        <div key={src}>{src}: {cnt.toLocaleString('ru-RU')}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Содержимое таблицы ===== */}
      {tab === 'tables' && (
        <div>
          <div className="flex gap-10 mb-20" style={{ flexWrap: 'wrap' }}>
            {mlTables.map((t) => (
              <button
                key={t}
                className={`btn ${t === selectedTable ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => loadTable(t, 0)}
              >
                {t.replace('ml_', '').replace('raw_', '').replace('constants_', 'const:')}
              </button>
            ))}
          </div>

          {tableData && (
            <div className="card">
              <div className="flex-between mb-10">
                <h3 className="card-title" style={{ margin: 0 }}>
                  {tableData.table} — {tableData.total?.toLocaleString('ru-RU')} строк
                </h3>
                <div className="flex gap-10">
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={tableOffset === 0}
                    onClick={() => loadTable(selectedTable, Math.max(0, tableOffset - 30))}
                  >
                    ← Назад
                  </button>
                  <span className="text-muted" style={{ lineHeight: '32px' }}>
                    {tableOffset + 1}–{Math.min(tableOffset + 30, tableData.total || 0)}
                  </span>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={tableOffset + 30 >= (tableData.total || 0)}
                    onClick={() => loadTable(selectedTable, tableOffset + 30)}
                  >
                    Вперёд →
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {(tableData.columns || []).map((col: string) => (
                        <th key={col} style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(tableData.rows || []).map((row: any, i: number) => (
                      <tr key={i}>
                        {(tableData.columns || []).map((col: string) => (
                          <td key={col} style={{ fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row[col] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Эталоны ===== */}
      {tab === 'baselines' && (
        <div>
          {baselines?.bands_summary && (
            <div className="grid-4 mb-20">
              {Object.entries(baselines.bands_summary).map(([band, info]: [string, any]) => (
                <div key={band} className="stat-card" style={{ cursor: 'pointer' }}
                  onClick={() => { setMmrFilter(band); setTimeout(loadBaselines, 50); }}>
                  <div className="stat-card-label">MMR {band}</div>
                  <div className="stat-card-value">{info.configs}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>{(info.total_matches || 0).toLocaleString('ru-RU')} матчей</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-10 mb-20">
            <select className="form-select" style={{ maxWidth: 200 }} value={mmrFilter} onChange={(e) => setMmrFilter(e.target.value)}>
              <option value="">Все MMR-бэнды</option>
              <option value="0-2000">0-2000</option>
              <option value="2000-4000">2000-4000</option>
              <option value="4000-6000">4000-6000</option>
              <option value="6000+">6000+</option>
            </select>
            <button className="btn btn-outline btn-sm" onClick={loadBaselines}>Обновить</button>
          </div>

          {baselines?.rows && baselines.rows.length > 0 && (
            <div className="card">
              <h3 className="card-title">
                Эталонные конфигурации — {baselines.total_baselines} всего
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>MMR</th>
                      <th>Герой</th>
                      <th>Роль</th>
                      <th>GPM</th>
                      <th>XPM</th>
                      <th>KDA</th>
                      <th>Убийства</th>
                      <th>Смерти</th>
                      <th>Урон</th>
                      <th>Винрейт</th>
                      <th>Матчей</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baselines.rows.map((b: any) => (
                      <tr key={b.id}>
                        <td><span className="badge badge-accent">{b.mmr_band}</span></td>
                        <td>{b.hero_id}</td>
                        <td>POS{b.role}</td>
                        <td>{b.avg_gpm}</td>
                        <td>{b.avg_xpm}</td>
                        <td>{b.avg_kda}</td>
                        <td>{b.avg_kills}</td>
                        <td>{b.avg_deaths}</td>
                        <td>{b.avg_hero_damage}</td>
                        <td>{b.winrate ? `${(b.winrate * 100).toFixed(1)}%` : '—'}</td>
                        <td>{b.match_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {baselines?.rows?.length === 0 && (
            <div className="card">
              <p className="text-muted">Эталоны не вычислены. Загрузите данные и нажмите «Вычислить эталоны» в разделе Импорта.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== Анализы игроков ===== */}
      {tab === 'analyses' && (
        <div>
          {analyses?.analyses && analyses.analyses.length > 0 ? (
            <div className="card">
              <h3 className="card-title">Выполненные анализы — {analyses.total}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID анализа</th>
                      <th>Профиль</th>
                      <th>MMR</th>
                      <th>Бэнд</th>
                      <th>Игр</th>
                      <th>Винрейт</th>
                      <th>GPM</th>
                      <th>KDA</th>
                      <th>Сильные</th>
                      <th>Слабые</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.analyses.map((a: any) => (
                      <tr key={a.analysis_id}>
                        <td style={{ fontSize: '0.75rem' }}>{a.analysis_id}</td>
                        <td>{a.player_profile_id || '—'}</td>
                        <td className="text-accent">{a.estimated_mmr || '—'}</td>
                        <td><span className="badge badge-accent">{a.mmr_band}</span></td>
                        <td>{a.games_analyzed}</td>
                        <td>{a.winrate ? `${(a.winrate * 100).toFixed(1)}%` : '—'}</td>
                        <td>{a.gpm_avg}</td>
                        <td>{a.kda_avg}</td>
                        <td className="text-accent">{a.strengths}</td>
                        <td className="text-danger">{a.weaknesses}</td>
                        <td style={{ fontSize: '0.75rem' }}>{a.created_at || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card">
              <p className="text-muted">Анализов пока нет. Они создаются при подборе тренера или просмотре статистики игрока.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== Аккаунты игроков ===== */}
      {tab === 'accounts' && (
        <div>
          {!accountDetail ? (
            /* List of accounts */
            <div>
              {refreshMsg && <div className="alert alert-success mb-20">{refreshMsg}</div>}

              {/* Summary: all Steam-links grouped by load status */}
              {allLinks.length > 0 && (() => {
                const loaded = allLinks.filter((u: any) => u.dota_personaname);
                const pending = allLinks.filter((u: any) => !u.dota_personaname);
                return (
                  <div className="grid-3 mb-20">
                    <div className="stat-card">
                      <div className="stat-card-label">Привязали Steam</div>
                      <div className="stat-card-value">{allLinks.length}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card-label">Данные загружены</div>
                      <div className="stat-card-value text-accent">{loaded.length}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card-label">Ожидают / не загрузились</div>
                      <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{pending.length}</div>
                    </div>
                  </div>
                );
              })()}

              {allLinks.length > 0 && (
                <div className="card mb-20">
                  <h3 className="card-title">Все привязки Steam ({allLinks.length})</h3>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                    Здесь видно всех, кто подвязал Steam, включая аккаунты без данных в OpenDota (закрытый профиль, свежие аккаунты, rate-limit при первой загрузке).
                    Для «не загружен» можно запустить догрузку вручную.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Логин</th>
                          <th>Роль</th>
                          <th>Steam ID</th>
                          <th>Account ID</th>
                          <th>Dota-ник</th>
                          <th>Ранг</th>
                          <th>Игр</th>
                          <th>Статус</th>
                          <th>Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allLinks.map((u: any) => {
                          const loaded = Boolean(u.dota_personaname);
                          // dota_account_id from backend is now always
                          // populated when there's a Steam link — even if
                          // no OpenDota profile was ever fetched. Fall
                          // back to a client-side conversion just in case.
                          const accId = Number(u.dota_account_id) || (
                            u.steam_id ? Number(u.steam_id) - 76561197960265728 : null
                          );
                          return (
                            <tr key={u.auth_user_id}>
                              <td>{u.login}</td>
                              <td><span className="badge badge-accent">{u.role}</span></td>
                              <td style={{ fontSize: '0.78rem' }}>{u.steam_id || '—'}</td>
                              <td style={{ fontSize: '0.78rem' }}>{accId || '—'}</td>
                              <td>{u.dota_personaname || <span className="text-muted">—</span>}</td>
                              <td style={{ fontSize: '0.82rem' }}>{u.dota_rank_name || '—'}</td>
                              <td>{u.lifetime_games?.toLocaleString('ru-RU') ?? '—'}</td>
                              <td>
                                {loaded ? (
                                  <span className="badge badge-accent">Загружены</span>
                                ) : (
                                  <span className="badge" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>Нет данных</span>
                                )}
                              </td>
                              <td>
                                {accId ? (
                                  <button
                                    className="btn btn-outline btn-sm"
                                    disabled={busyRefreshAcc === accId}
                                    onClick={() => refreshAccount(accId)}
                                  >
                                    {busyRefreshAcc === accId ? 'Запрашиваем…' : 'Догрузить'}
                                  </button>
                                ) : (
                                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>нет Steam ID</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {accounts?.accounts && accounts.accounts.length > 0 ? (
                <div>
                  <h3 className="card-title mb-20">
                    Подробности по загруженным аккаунтам ({accounts.total})
                  </h3>
                  {accounts.accounts.map((a: any) => (
                    <div key={a.account_id} className="card mb-10" style={{ cursor: 'pointer' }}
                      onClick={() => loadAccountDetail(a.account_id)}>
                      <div className="flex gap-20" style={{ alignItems: 'center' }}>
                        {a.avatar_url && (
                          <img src={a.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, border: '1px solid var(--accent)' }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div className="flex-between">
                            <strong style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>{a.personaname || 'Unknown'}</strong>
                            <div className="flex gap-10">
                              {a.rank_tier && <span className="badge badge-accent">Ранг: {a.rank_tier}</span>}
                              <span className="badge badge-accent">{a.win || 0}W / {a.lose || 0}L</span>
                              <span className="badge badge-accent">{a.matches_in_db} матчей в БД</span>
                              {a.has_analysis && <span className="badge badge-accent">Анализ есть</span>}
                              {a.estimated_mmr && <span className="badge badge-accent">MMR: ~{a.estimated_mmr}</span>}
                            </div>
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                            Account: {a.account_id} | Steam: {a.steam_id} | ~{a.estimated_hours || 0} часов | Обновлено: {a.fetched_at || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card">
                  <p className="text-muted">Нет привязанных аккаунтов. Пользователи привяжут Steam в профиле.</p>
                </div>
              )}
            </div>
          ) : (
            /* Account detail view */
            <div>
              <button className="btn btn-outline btn-sm mb-20" onClick={() => setAccountDetail(null)}>
                ← Назад к списку
              </button>

              {/* Profile */}
              <div className="card card-accent mb-20">
                <div className="flex gap-20" style={{ alignItems: 'center' }}>
                  {accountDetail.account?.avatar_url && (
                    <img src={accountDetail.account.avatar_url} alt=""
                      style={{ width: 80, height: 80, borderRadius: 10, border: '2px solid var(--accent)' }} />
                  )}
                  <div>
                    <h2 style={{ color: 'var(--accent)' }}>{accountDetail.account?.personaname}</h2>
                    <div className="flex gap-10 mt-10" style={{ flexWrap: 'wrap' }}>
                      <span className="badge badge-accent">Ранг: {accountDetail.account?.rank_tier || '—'}</span>
                      <span className="badge badge-accent">{accountDetail.account?.win}W / {accountDetail.account?.lose}L</span>
                      <span className="badge badge-accent">~{accountDetail.account?.estimated_hours} часов</span>
                      <span className="badge badge-accent">Account ID: {accountDetail.account?.account_id}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analysis */}
              {accountDetail.analysis && (
                <div className="card mb-20">
                  <h3 className="card-title">Анализ игрока</h3>
                  <div className="grid-4 mb-20">
                    <div className="stat-card" style={{ padding: 12 }}>
                      <div className="stat-card-label">MMR</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent)' }}>
                        {accountDetail.analysis.estimated_mmr || '—'}
                      </div>
                    </div>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <div className="stat-card-label">MMR Band</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{accountDetail.analysis.mmr_band}</div>
                    </div>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <div className="stat-card-label">Сильные стороны</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>
                        {(accountDetail.analysis.strengths || []).length}
                      </div>
                    </div>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <div className="stat-card-label">Слабые стороны</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>
                        {(accountDetail.analysis.weaknesses || []).length}
                      </div>
                    </div>
                  </div>

                  {accountDetail.analysis.summary && (
                    <div className="grid-3 mb-20">
                      {Object.entries(accountDetail.analysis.summary).map(([k, v]: [string, any]) => (
                        <div key={k} style={{ fontSize: '0.85rem' }}>
                          <span className="text-muted">{k}: </span>
                          <strong>{typeof v === 'number' ? (v < 1 && v > 0 ? `${(v * 100).toFixed(1)}%` : v) : String(v)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {accountDetail.analysis.weaknesses && accountDetail.analysis.weaknesses.length > 0 && (
                    <div className="mb-10">
                      <strong className="text-danger">Слабости:</strong>
                      {accountDetail.analysis.weaknesses.map((w: any, i: number) => (
                        <span key={i} className="badge badge-danger" style={{ margin: '4px 4px' }}>
                          {w.description || w.feature}: {w.score}/10
                        </span>
                      ))}
                    </div>
                  )}
                  {accountDetail.analysis.strengths && accountDetail.analysis.strengths.length > 0 && (
                    <div>
                      <strong className="text-accent">Сильные:</strong>
                      {accountDetail.analysis.strengths.map((s: any, i: number) => (
                        <span key={i} className="badge badge-accent" style={{ margin: '4px 4px' }}>
                          {s.description || s.feature}: {s.score}/10
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Matches */}
              {accountDetail.matches && accountDetail.matches.length > 0 && (
                <div className="card">
                  <h3 className="card-title">Загруженные матчи — {accountDetail.matches_count}</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Match ID</th>
                          <th>Герой</th>
                          <th>K/D/A</th>
                          <th>GPM</th>
                          <th>XPM</th>
                          <th>LH</th>
                          <th>Урон</th>
                          <th>Роль</th>
                          <th>Длит.</th>
                          <th>Результат</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountDetail.matches.map((m: any) => (
                          <tr key={m.match_id}>
                            <td style={{ fontSize: '0.75rem' }}>{m.match_id}</td>
                            <td>{m.hero_id}</td>
                            <td>{m.kills}/{m.deaths}/{m.assists}</td>
                            <td>{m.gpm}</td>
                            <td>{m.xpm}</td>
                            <td>{m.last_hits}</td>
                            <td>{m.hero_damage}</td>
                            <td>{m.lane_role ? `POS${m.lane_role}` : '—'}</td>
                            <td>{m.duration_min ? `${m.duration_min}м` : '—'}</td>
                            <td>
                              <span className={`badge ${m.win ? 'badge-accent' : 'badge-danger'}`}>
                                {m.win ? 'Победа' : m.win === false ? 'Поражение' : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
