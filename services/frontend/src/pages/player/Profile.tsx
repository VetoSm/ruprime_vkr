import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { loadHeroes, heroName, heroIcon } from '../../api/heroes';
import { RankBadge, RoleBadge, InfoTooltip } from '../../ui/GameComponents';

interface SteamData {
  linked: boolean;
  account_id?: number;
  steam_id?: string;
  personaname?: string;
  avatar_url?: string;
  rank_tier?: number;
  win?: number;
  lose?: number;
  estimated_hours?: number;
  last_match_time?: string;
  profile_url?: string;
  is_public?: boolean;
  matches_loaded?: number;
  heroes_top?: any[];
  rankings_top?: any[];
  error?: string;
  warning?: string;
  parse_requested?: number;
  parse_message?: string;
}

export default function PlayerProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [steamData, setSteamData] = useState<SteamData | null>(null);
  const [desiredRank, setDesiredRank] = useState('');
  const [desiredRoles, setDesiredRoles] = useState('');
  const [goals, setGoals] = useState('');
  const [about, setAbout] = useState('');
  const [steamId, setSteamId] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [showSteamHelp, setShowSteamHelp] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    loadHeroes();
    coreApi.get('/player/profile').then((r) => {
      setProfile(r.data);
      setDesiredRank(r.data.desired_rank_tier || '');
      setDesiredRoles(Array.isArray(r.data.desired_roles) ? r.data.desired_roles.join(', ') : '');
      setGoals(Array.isArray(r.data.training_goals) ? r.data.training_goals.join(', ') : '');
      setAbout(r.data.about || '');
    }).catch(() => {});
    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
  }, []);

  const saveProfile = async () => {
    setMsg(''); setError('');
    try {
      const res = await coreApi.post('/player/profile', {
        desired_rank_tier: desiredRank || undefined,
        desired_roles: desiredRoles ? desiredRoles.split(',').map(s => s.trim()) : undefined,
        training_goals: goals ? goals.split(',').map(s => s.trim()) : undefined,
        about: about || undefined,
      });
      setProfile(res.data);
      setMsg('Профиль сохранён!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const linkSteam = async () => {
    setMsg(''); setError(''); setLinking(true);
    try {
      const res = await coreApi.post('/player/link-steam', { steam_id: steamId });
      const data = res.data;
      if (data.error) { setError(data.error); }
      else {
        setSteamData({ linked: true, ...data });
        let successMsg = `Аккаунт ${data.personaname || ''} привязан! Загружено ${data.matches_loaded} матчей.`;
        if (data.parse_message) successMsg += '\n' + data.parse_message;
        setMsg(successMsg);
        coreApi.get('/player/profile').then((r) => setProfile(r.data)).catch(() => {});
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка привязки');
    } finally { setLinking(false); }
  };

  const refreshSteam = async () => {
    setMsg(''); setError(''); setLinking(true);
    try {
      const res = await coreApi.post('/player/refresh-steam');
      setSteamData({ linked: true, ...res.data });
      setMsg('Данные обновлены!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления');
    } finally { setLinking(false); }
  };

  const isLinked = steamData?.linked && steamData?.personaname;
  const totalGames = (steamData?.win || 0) + (steamData?.lose || 0);
  const winrate = totalGames > 0 ? ((steamData?.win || 0) / totalGames * 100).toFixed(1) : '0';

  return (
    <div>
      <div className="page-header">
        <h1>⚔ Профиль игрока</h1>
        <p>Привязка аккаунта, цели и предпочтения</p>
      </div>

      {msg && <div className="alert alert-success" style={{ whiteSpace: 'pre-line' }}>{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* === Steam Account === */}
      <div className="card card-accent mb-20">
        <div className="flex-between mb-10">
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Аккаунт Steam / Dota 2
            <InfoTooltip text="Привяжите Steam ID чтобы загрузить статистику матчей, ранг, героев и получить персональный анализ." />
          </h3>
          {isLinked && (
            <button className="btn btn-outline btn-sm" onClick={refreshSteam} disabled={linking}>
              {linking ? '⏳ Обновление...' : '🔄 Обновить данные'}
            </button>
          )}
        </div>

        {showSteamHelp && (
          <div className="alert alert-success" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
            <strong>Как найти свой Steam ID:</strong>
            <ol style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.8 }}>
              <li>Откройте <strong>Steam</strong> → имя вверху справа → <strong>«Об аккаунте»</strong></li>
              <li>SteamID64 — число вида <code>76561198xxxxxxxxx</code></li>
              <li>Или <a href="https://steamid.io" target="_blank" rel="noreferrer">steamid.io</a> → вставьте ссылку на профиль</li>
              <li>Убедитесь что <strong>история матчей публичная</strong> в настройках Dota 2</li>
            </ol>
          </div>
        )}

        {steamData?.warning && (
          <div className="alert alert-error" style={{ fontSize: '0.85rem', whiteSpace: 'pre-line', marginBottom: 16 }}>
            {steamData.warning}
          </div>
        )}

        {steamData?.parse_message && (
          <div className="alert alert-success" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
            ⏳ {steamData.parse_message}
          </div>
        )}

        {isLinked ? (
          <div>
            {/* Player card */}
            <div className="flex gap-20" style={{ alignItems: 'center', marginBottom: 20 }}>
              {steamData.avatar_url && (
                <img src={steamData.avatar_url} alt="Avatar"
                  style={{ width: 80, height: 80, borderRadius: 14, border: '2px solid var(--accent)',
                    boxShadow: '0 0 20px rgba(0, 212, 170, 0.25)' }} />
              )}
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)' }}>
                  {steamData.personaname}
                </h3>
                <div className="flex gap-10 mt-10" style={{ flexWrap: 'wrap' }}>
                  <RankBadge rankTier={steamData.rank_tier} size="md" />
                  <span className="badge badge-accent">{steamData.win}W / {steamData.lose}L</span>
                  <span className="badge badge-purple">~{steamData.estimated_hours} часов</span>
                  <span className="badge badge-accent">Винрейт: {winrate}%</span>
                  <span className="badge badge-accent">{steamData.matches_loaded} матчей</span>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid-4 mb-20">
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-card-label">Ранг</div>
                <RankBadge rankTier={steamData.rank_tier} size="sm" />
              </div>
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-card-label">Побед / Поражений</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{steamData.win} / {steamData.lose}</div>
              </div>
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-card-label">Часов в Dota 2</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>~{steamData.estimated_hours}</div>
              </div>
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-card-label">Последняя игра</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {steamData.last_match_time ? new Date(steamData.last_match_time).toLocaleDateString('ru-RU') : '—'}
                </div>
              </div>
            </div>

            {/* Top heroes */}
            {steamData.heroes_top && steamData.heroes_top.length > 0 && (
              <div className="mb-20">
                <h4 style={{ marginBottom: 10 }}>Топ героев</h4>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Герой</th><th>Игр</th><th>Побед</th><th>Винрейт</th></tr></thead>
                    <tbody>
                      {steamData.heroes_top.slice(0, 5).map((h: any) => (
                        <tr key={h.hero_id}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <img src={heroIcon(h.hero_id)} alt="" style={{ width: 28, height: 28, borderRadius: 4 }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            {heroName(h.hero_id)}
                          </td>
                          <td>{h.games}</td>
                          <td>{h.win}</td>
                          <td>{(h.winrate * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rankings */}
            {steamData.rankings_top && steamData.rankings_top.length > 0 && (
              <div className="mb-20">
                <h4 style={{ marginBottom: 10 }}>
                  Рейтинг по героям <InfoTooltip text="Перцентиль OpenDota: в каком проценте игроков мира вы находитесь по этому герою." />
                </h4>
                <div className="grid-3">
                  {steamData.rankings_top.slice(0, 6).map((r: any) => {
                    const topPct = ((1 - r.percent_rank) * 100);
                    const color = topPct <= 5 ? 'var(--accent)' : topPct <= 20 ? 'var(--warning)' : 'var(--text-primary)';
                    return (
                      <div key={r.hero_id} className="stat-card" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <img src={heroIcon(r.hero_id)} alt="" style={{ width: 24, height: 24, borderRadius: 3 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{heroName(r.hero_id)}</span>
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color }}>
                          Топ {topPct.toFixed(1)}%
                        </div>
                        <div className="progress-bar" style={{ marginTop: 6 }}>
                          <div className="progress-bar-fill" style={{ width: `${r.percent_rank * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-muted" style={{ fontSize: '0.8rem' }}>
              Account: {steamData.account_id} | Steam: {steamData.steam_id}
              {steamData.profile_url && <> | <a href={steamData.profile_url} target="_blank" rel="noreferrer">Профиль Steam ↗</a></>}
            </div>
          </div>
        ) : (
          <div>
            <button className="btn btn-outline btn-sm mb-10" onClick={() => setShowSteamHelp(!showSteamHelp)}>
              ❓ Как найти Steam ID
            </button>
            <div className="form-group">
              <label>Steam ID (SteamID64)</label>
              <input className="form-input" value={steamId} onChange={(e) => setSteamId(e.target.value)}
                placeholder="76561198xxxxxxxxx" />
            </div>
            <button className="btn btn-primary" onClick={linkSteam} disabled={linking}>
              {linking ? '⏳ Подключение (~15 сек)...' : '🔗 Привязать Steam'}
            </button>
          </div>
        )}
      </div>

      {/* === Фактические данные === */}
      <div className="card mb-20">
        <h3 className="card-title">📋 Фактические данные</h3>
        <div className="grid-3">
          <div>
            <span className="text-muted">Steam ID: </span>
            <strong>{profile?.steam_id || 'Не привязан'}</strong>
          </div>
          <div>
            <span className="text-muted">Account ID: </span>
            <strong>{profile?.dota_account_id || '—'}</strong>
          </div>
          <div>
            <span className="text-muted">Текущий ранг: </span>
            {profile?.actual_rank_tier ? <RankBadge rankName={profile.actual_rank_tier} size="sm" /> : <strong>Неизвестен</strong>}
          </div>
        </div>
      </div>

      {/* === Цели === */}
      <div className="card">
        <h3 className="card-title">🎯 Ваши цели и предпочтения</h3>
        <div className="grid-2">
          <div className="form-group">
            <label>Желаемый ранг</label>
            <select className="form-select" value={desiredRank} onChange={(e) => setDesiredRank(e.target.value)}>
              <option value="">Выберите...</option>
              <option value="HERALD">Herald (Рекрут)</option>
              <option value="GUARDIAN">Guardian (Страж)</option>
              <option value="CRUSADER">Crusader (Рыцарь)</option>
              <option value="ARCHON">Archon (Герой)</option>
              <option value="LEGEND">Legend (Легенда)</option>
              <option value="ANCIENT">Ancient (Властелин)</option>
              <option value="DIVINE">Divine (Божество)</option>
              <option value="IMMORTAL">Immortal (Титан)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Желаемые позиции</label>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              {['POS1', 'POS2', 'POS3', 'POS4', 'POS5'].map((r) => {
                const selected = desiredRoles.includes(r);
                return (
                  <button key={r} type="button"
                    className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      const roles = desiredRoles.split(',').map(s => s.trim()).filter(Boolean);
                      if (selected) setDesiredRoles(roles.filter(x => x !== r).join(', '));
                      else setDesiredRoles([...roles, r].join(', '));
                    }}>
                    <RoleBadge role={r} compact />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="form-group">
          <label>Цели тренировок</label>
          <input className="form-input" value={goals} onChange={(e) => setGoals(e.target.value)}
            placeholder="контроль линии, пул героев, макро, тимфайты" />
        </div>
        <div className="form-group">
          <label>О себе</label>
          <textarea className="form-input" value={about} onChange={(e) => setAbout(e.target.value)}
            placeholder="Расскажите о своём стиле игры..." />
        </div>
        <button className="btn btn-primary" onClick={saveProfile}>💾 Сохранить профиль</button>
      </div>
    </div>
  );
}
