import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

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
  error?: string;
  warning?: string;
}

const RANK_NAMES: Record<number, string> = {
  1: 'Herald', 2: 'Guardian', 3: 'Crusader', 4: 'Archon',
  5: 'Legend', 6: 'Ancient', 7: 'Divine', 8: 'Immortal',
};

function rankTierToString(rt?: number): string {
  if (!rt) return 'Неизвестен';
  const medal = Math.floor(rt / 10);
  const stars = rt % 10;
  return `${RANK_NAMES[medal] || '?'} [${stars}]`;
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
    // Load profile
    coreApi.get('/player/profile').then((r) => {
      setProfile(r.data);
      setDesiredRank(r.data.desired_rank_tier || '');
      setDesiredRoles(Array.isArray(r.data.desired_roles) ? r.data.desired_roles.join(', ') : '');
      setGoals(Array.isArray(r.data.training_goals) ? r.data.training_goals.join(', ') : '');
      setAbout(r.data.about || '');
    }).catch(() => {});

    // Load steam data
    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
  }, []);

  const saveProfile = async () => {
    setMsg(''); setError('');
    try {
      const data = {
        desired_rank_tier: desiredRank || undefined,
        desired_roles: desiredRoles ? desiredRoles.split(',').map(s => s.trim()) : undefined,
        training_goals: goals ? goals.split(',').map(s => s.trim()) : undefined,
        about: about || undefined,
      };
      const res = await coreApi.post('/player/profile', data);
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
      if (data.error) {
        setError(data.error);
      } else {
        setSteamData({ linked: true, ...data });
        setMsg(`Аккаунт ${data.personaname || ''} успешно привязан! Загружено ${data.matches_loaded} матчей.`);
        // Reload profile
        coreApi.get('/player/profile').then((r) => setProfile(r.data)).catch(() => {});
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка привязки Steam');
    } finally {
      setLinking(false);
    }
  };

  const refreshSteam = async () => {
    setMsg(''); setError(''); setLinking(true);
    try {
      const res = await coreApi.post('/player/refresh-steam');
      setSteamData({ linked: true, ...res.data });
      setMsg('Данные обновлены!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления');
    } finally {
      setLinking(false);
    }
  };

  const isLinked = steamData?.linked && steamData?.personaname;

  return (
    <div>
      <div className="page-header">
        <h1>Профиль игрока</h1>
        <p>Привязка Steam, цели и предпочтения</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Steam Account Card */}
      <div className="card card-accent mb-20">
        <div className="flex-between mb-10">
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Аккаунт Steam / Dota 2
            <span
              onClick={() => setShowSteamHelp(!showSteamHelp)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                flexShrink: 0,
              }}
            >i</span>
          </h3>
          {isLinked && (
            <button className="btn btn-outline btn-sm" onClick={refreshSteam} disabled={linking}>
              {linking ? 'Обновление...' : 'Обновить данные'}
            </button>
          )}
        </div>

        {showSteamHelp && (
          <div className="alert alert-success" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
            <strong>Как найти свой Steam ID:</strong>
            <ol style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.8 }}>
              <li>Откройте <strong>Steam</strong> → нажмите на своё имя вверху справа → <strong>«Об аккаунте»</strong></li>
              <li>Ваш Steam ID (SteamID64) — это число вида <code>76561198xxxxxxxxx</code></li>
              <li>Или зайдите на <a href="https://steamid.io" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>steamid.io</a> и скопируйте <strong>steamID64</strong></li>
              <li>Убедитесь, что профиль и история матчей <strong>публичные</strong></li>
              <li>Вставьте ID ниже и нажмите «Привязать Steam»</li>
            </ol>
          </div>
        )}

        {isLinked ? (
          /* Linked: show full profile */
          <div>
            <div className="flex gap-20" style={{ alignItems: 'center', marginBottom: 20 }}>
              {steamData.avatar_url && (
                <img
                  src={steamData.avatar_url}
                  alt="Avatar"
                  style={{ width: 80, height: 80, borderRadius: 'var(--radius)', border: '2px solid var(--accent)' }}
                />
              )}
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent)' }}>
                  {steamData.personaname}
                </h3>
                <div className="flex gap-10 mt-10" style={{ flexWrap: 'wrap' }}>
                  <span className="badge badge-accent">{rankTierToString(steamData.rank_tier)}</span>
                  <span className="badge badge-accent">{steamData.win || 0}W / {steamData.lose || 0}L</span>
                  <span className="badge badge-accent">~{steamData.estimated_hours || 0} часов</span>
                  <span className="badge badge-accent">{steamData.matches_loaded || 0} матчей загружено</span>
                </div>
              </div>
            </div>

            {steamData.warning && (
              <div className="alert alert-error" style={{ fontSize: '0.85rem', whiteSpace: 'pre-line', marginBottom: 16 }}>
                {steamData.warning}
              </div>
            )}

            <div className="grid-4 mb-20">
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-card-label">Ранг</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{rankTierToString(steamData.rank_tier)}</div>
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
                  {steamData.last_match_time
                    ? new Date(steamData.last_match_time).toLocaleDateString('ru-RU')
                    : '—'}
                </div>
              </div>
            </div>

            {steamData.heroes_top && steamData.heroes_top.length > 0 && (
              <div>
                <h4 style={{ marginBottom: 10 }}>Топ героев</h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID Героя</th>
                        <th>Игр</th>
                        <th>Побед</th>
                        <th>Винрейт</th>
                      </tr>
                    </thead>
                    <tbody>
                      {steamData.heroes_top.slice(0, 5).map((h: any) => (
                        <tr key={h.hero_id}>
                          <td>{h.hero_id}</td>
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

            <div className="mt-20 text-muted" style={{ fontSize: '0.8rem' }}>
              Account ID: {steamData.account_id} | Steam ID: {steamData.steam_id}
              {steamData.profile_url && (
                <> | <a href={steamData.profile_url} target="_blank" rel="noreferrer">Профиль Steam</a></>
              )}
            </div>
          </div>
        ) : (
          /* Not linked: show input */
          <div>
            <div className="form-group">
              <label>Steam ID (SteamID64)</label>
              <input
                className="form-input"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder="76561198xxxxxxxxx"
              />
            </div>
            <button className="btn btn-primary" onClick={linkSteam} disabled={linking}>
              {linking ? 'Подключение... (загрузка данных ~10 сек)' : 'Привязать Steam'}
            </button>
          </div>
        )}
      </div>

      {/* Actual data (readonly) */}
      <div className="card mb-20">
        <h3 className="card-title">Фактические данные</h3>
        <div className="grid-3">
          <div>
            <span className="text-muted">Steam ID: </span>
            <strong>{profile?.steam_id || 'Не привязан'}</strong>
          </div>
          <div>
            <span className="text-muted">Dota Account ID: </span>
            <strong>{profile?.dota_account_id || '—'}</strong>
          </div>
          <div>
            <span className="text-muted">Текущий ранг: </span>
            <strong>{profile?.actual_rank_tier || 'Неизвестен'}</strong>
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="card">
        <h3 className="card-title">Ваши цели и предпочтения</h3>
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
            <label>Желаемые роли (через запятую)</label>
            <input className="form-input" value={desiredRoles} onChange={(e) => setDesiredRoles(e.target.value)}
              placeholder="POS1, POS2, POS3" />
          </div>
        </div>
        <div className="form-group">
          <label>Цели тренировок (через запятую)</label>
          <input className="form-input" value={goals} onChange={(e) => setGoals(e.target.value)}
            placeholder="контроль линии, пул героев, макро, тимфайты" />
        </div>
        <div className="form-group">
          <label>О себе</label>
          <textarea className="form-input" value={about} onChange={(e) => setAbout(e.target.value)}
            placeholder="Расскажите о своём стиле игры..." />
        </div>
        <button className="btn btn-primary" onClick={saveProfile}>Сохранить профиль</button>
      </div>
    </div>
  );
}
