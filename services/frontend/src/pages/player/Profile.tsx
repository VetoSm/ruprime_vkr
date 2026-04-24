import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { coreApi, authApi } from '../../api/client';
import { loadHeroes, heroName, heroIcon } from '../../api/heroes';
import { RankBadge, RoleBadge, InfoTooltip } from '../../ui/GameComponents';
import DotaPrivacyBanner from '../../ui/DotaPrivacyBanner';
import { IconEye, IconEyeOff, IconSettings } from '../../ui/Icons';
const STEAM_PENDING_KEY = 'steam_pending_link_id';
const AUTH_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001';

interface SteamData {
  linked: boolean;
  account_id?: number;
  steam_id?: string;
  personaname?: string;
  avatar_url?: string;
  rank_tier?: number;
  mmr_estimate?: number;
  win?: number;
  lose?: number;
  total_games?: number;
  lifetime_games?: number;
  parsed_games_n?: number;
  totals?: {
    avg_gpm?: number;
    avg_xpm?: number;
    avg_kills?: number;
    avg_deaths?: number;
    avg_assists?: number;
  };
  estimated_hours?: number;
  last_match_time?: string;
  profile_url?: string;
  is_public?: boolean;
  matches_loaded?: number;
  roles_distribution?: Record<string, number>;
  recent_matches?: Array<{
    match_id?: number;
    hero_id?: number;
    win?: boolean;
    kda?: number;
    gpm?: number;
  }>;
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
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [autoLinkTried, setAutoLinkTried] = useState(false);
  const [showManualSteam, setShowManualSteam] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('linked') === '1') {
      setMsg('Steam привязан. Статистика обновится за минуту.');
      coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
      const next = new URLSearchParams(searchParams);
      next.delete('linked');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  useEffect(() => {
    if (autoLinkTried) return;
    if (steamData?.linked) {
      localStorage.removeItem(STEAM_PENDING_KEY);
      setAutoLinkTried(true);
      return;
    }
    const pendingSteamId = localStorage.getItem(STEAM_PENDING_KEY);
    if (!pendingSteamId) {
      setAutoLinkTried(true);
      return;
    }
    setAutoLinkTried(true);

    (async () => {
      setLinking(true);
      try {
        await coreApi.post('/player/link-steam', { steam_id: pendingSteamId });
        const syncRes = await coreApi.post('/player/sync-steam').catch(() => null);
        if (syncRes?.data) {
          setSteamData({ linked: true, ...syncRes.data });
        } else {
          const res = await coreApi.get('/player/steam-data');
          setSteamData(res.data);
        }
        localStorage.removeItem(STEAM_PENDING_KEY);
        setMsg('Steam-аккаунт привязан автоматически.');
        coreApi.get('/player/profile').then((r) => setProfile(r.data)).catch(() => {});
      } catch {
        setError('Автопривязка Steam не удалась. Можно повторить кнопкой ниже.');
      } finally {
        setLinking(false);
      }
    })();
  }, [steamData, autoLinkTried]);

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

  const linkSteamViaOpenId = async () => {
    setMsg(''); setError('');
    try {
      // Ask auth to drop the signed link-intent cookie (HttpOnly, same
      // origin as /auth/steam/login) and then bounce to Steam.
      await authApi.post('/auth/steam/link-intent', {}, { withCredentials: true });
      window.location.href = `${AUTH_URL}/auth/steam/login?mode=link`;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось начать привязку через Steam');
    }
  };

  const linkSteam = async () => {
    setMsg(''); setError(''); setLinking(true);
    try {
      const res = await coreApi.post('/player/link-steam', { steam_id: steamId, trusted: false });
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
      const res = await coreApi.post('/player/sync-steam');
      setSteamData({ linked: true, ...res.data });
      setMsg('Данные обновлены!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления');
    } finally { setLinking(false); }
  };

  const changePassword = async () => {
    setPwdMsg(''); setPwdError('');
    if (newPassword !== confirmNewPassword) { setPwdError('Пароли не совпадают'); return; }
    if (newPassword.length < 8) { setPwdError('Минимум 8 символов'); return; }
    try {
      await authApi.post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setPwdMsg('Пароль изменён!');
      setOldPassword(''); setNewPassword(''); setConfirmNewPassword('');
    } catch (err: any) {
      setPwdError(err.response?.data?.detail || 'Ошибка смены пароля');
    }
  };

  const logoutAllSessions = async () => {
    setPwdMsg(''); setPwdError('');
    try {
      await authApi.post('/auth/logout-all');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    } catch (err: any) {
      setPwdError(err.response?.data?.detail || 'Не удалось завершить все сессии');
    }
  };

  const isLinked = steamData?.linked && steamData?.personaname;
  const totalGames =
    steamData?.lifetime_games ??
    steamData?.total_games ??
    ((steamData?.win || 0) + (steamData?.lose || 0));
  const winrate = totalGames > 0 ? ((steamData?.win || 0) / totalGames * 100).toFixed(1) : '0';

  return (
    <div>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconSettings size={24} /> Настройки
        </h1>
        <p>Привязка Steam, смена пароля, цели и предпочтения</p>
      </div>

      {msg && <div className="alert alert-success" style={{ whiteSpace: 'pre-line' }}>{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {isLinked ? (
        <>
          {/* === Hero Card === */}
          <div className="hero-card mb-20">
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              {steamData.avatar_url && (
                <img src={steamData.avatar_url} alt="Avatar" className="hero-card-avatar" />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                    {steamData.personaname}
                  </h2>
                  <RankBadge rankTier={steamData.rank_tier} size="lg" />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="badge badge-accent" style={{ fontSize: '0.8rem' }}>
                    {totalGames > 0 ? `${winrate}% WR` : '—'}
                  </span>
                  <span className="badge badge-purple" style={{ fontSize: '0.8rem' }}>
                    ~{steamData.estimated_hours} часов
                  </span>
                  <span className="badge badge-accent" style={{ fontSize: '0.8rem' }}>
                    {totalGames.toLocaleString('ru-RU')} игр
                  </span>
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={refreshSteam} disabled={linking}
                style={{ whiteSpace: 'nowrap' }}>
                {linking ? 'Обновление...' : 'Обновить данные'}
              </button>
            </div>
          </div>

          {steamData?.warning && (
            <div className="alert alert-error" style={{ fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
              {steamData.warning}
            </div>
          )}

          {steamData?.parse_message && (
            <div className="alert alert-success" style={{ fontSize: '0.85rem' }}>
              {steamData.parse_message}
            </div>
          )}

          {/* === Stat Pills === */}
          <div className="stat-pills mb-20">
            <div className="stat-pill">
              <span className="stat-pill-label">Ранг</span>
              <RankBadge rankTier={steamData.rank_tier} size="sm" />
            </div>
            <div className="stat-pill">
              <span className="stat-pill-label">W / L</span>
              <span className="stat-pill-value">{steamData.win} / {steamData.lose}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-label">MMR (оценка)</span>
              <span className="stat-pill-value accent">{steamData.mmr_estimate || '—'}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-label">Часы</span>
              <span className="stat-pill-value accent">{steamData.estimated_hours?.toLocaleString()}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-label">Последняя игра</span>
              <span className="stat-pill-value" style={{ fontSize: '0.95rem' }}>
                {steamData.last_match_time
                  ? new Date(steamData.last_match_time).toLocaleDateString('ru-RU')
                  : '—'}
              </span>
            </div>
          </div>

          {steamData?.totals && (
            <div className="card mb-20">
              <div className="section-header">
                <h3>Средние показатели</h3>
                <div className="section-line" />
              </div>
              <div className="grid-3">
                <div className="stat-pill"><span className="stat-pill-label">AVG GPM</span><span className="stat-pill-value">{steamData.totals.avg_gpm ?? '—'}</span></div>
                <div className="stat-pill"><span className="stat-pill-label">AVG XPM</span><span className="stat-pill-value">{steamData.totals.avg_xpm ?? '—'}</span></div>
                <div className="stat-pill"><span className="stat-pill-label">AVG KDA</span><span className="stat-pill-value">
                  {steamData.totals.avg_kills != null && steamData.totals.avg_deaths != null && steamData.totals.avg_assists != null
                    ? (((steamData.totals.avg_kills + steamData.totals.avg_assists) / Math.max(steamData.totals.avg_deaths, 1)).toFixed(2))
                    : '—'}
                </span></div>
              </div>
            </div>
          )}

          {steamData?.recent_matches && steamData.recent_matches.length > 0 && (
            <div className="mb-20">
              <div className="section-header">
                <h3>Последние матчи</h3>
                <div className="section-line" />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Герой</th><th>Результат</th><th>KDA</th><th>GPM</th></tr>
                  </thead>
                  <tbody>
                    {steamData.recent_matches.slice(0, 8).map((m) => (
                      <tr key={m.match_id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <img src={heroIcon(m.hero_id)} alt="" style={{ width: 24, height: 24, borderRadius: 4 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          {heroName(m.hero_id)}
                        </td>
                        <td style={{ color: m.win ? 'var(--accent)' : 'var(--danger)' }}>{m.win ? 'Победа' : 'Поражение'}</td>
                        <td>{m.kda ?? '—'}</td>
                        <td>{m.gpm ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* === Top Heroes === */}
          {steamData.heroes_top && steamData.heroes_top.length > 0 && (
            <div className="mb-20">
              <div className="section-header">
                <h3>Топ героев</h3>
                <div className="section-line" />
              </div>
              <div className="grid-3">
                {steamData.heroes_top.slice(0, 6).map((h: any) => (
                  <div key={h.hero_id} className="ranking-card">
                    <img src={heroIcon(h.hero_id)} alt="" style={{
                      width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border-color)'
                    }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {heroName(h.hero_id)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {h.games} игр, <span style={{ color: h.winrate >= 0.5 ? 'var(--accent)' : 'var(--danger)' }}>{(h.winrate * 100).toFixed(0)}% WR</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === Hero Rankings === */}
          {steamData.rankings_top && steamData.rankings_top.length > 0 && (
            <div className="mb-20">
              <div className="section-header">
                <h3>
                  Рейтинг по героям
                  <InfoTooltip text="Перцентиль OpenDota: в каком проценте игроков мира вы находитесь по этому герою." />
                </h3>
                <div className="section-line" />
              </div>
              <div className="grid-3">
                {steamData.rankings_top.slice(0, 6).map((r: any) => {
                  const topPct = ((1 - r.percent_rank) * 100);
                  const color = topPct <= 5 ? 'var(--accent)' : topPct <= 20 ? 'var(--warning)' : 'var(--text-primary)';
                  return (
                    <div key={r.hero_id} className="ranking-card">
                      <img src={heroIcon(r.hero_id)} alt="" style={{
                        width: 36, height: 36, borderRadius: 6, border: '1px solid var(--border-color)',
                      }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 2 }}>{heroName(r.hero_id)}</div>
                        <div className="progress-bar" style={{ height: 5 }}>
                          <div className="progress-bar-fill" style={{ width: `${r.percent_rank * 100}%` }} />
                        </div>
                      </div>
                      <span className="ranking-pct" style={{ color }}>
                        Top {topPct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 24 }}>
            Account: {steamData.account_id} | Steam: {steamData.steam_id}
            {steamData.profile_url && <> | <a href={steamData.profile_url} target="_blank" rel="noreferrer">Профиль Steam</a></>}
          </div>

          <DotaPrivacyBanner
            steamData={steamData}
            onRefreshed={(data) => data && setSteamData((prev: any) => ({ ...(prev || {}), ...data, linked: true }))}
          />
        </>
      ) : (
        /* === Link Steam === */
        <div className="hero-card mb-20">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontWeight: 700 }}>Подключение Steam / Dota 2</h3>
            <InfoTooltip text="Рекомендуется вход через Steam: мы проверим владение аккаунтом и подгрузим статистику автоматически." />
          </div>
          <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: 14 }}>
            Нажмите «Привязать через Steam» — откроется официальная страница Steam. После входа вернётесь сюда с подтверждённой привязкой и данными матчей.
          </p>
          <button
            className="btn btn-primary"
            onClick={linkSteamViaOpenId}
            disabled={linking}
            style={{ width: '100%' }}
          >
            {linking ? 'Подключаем...' : 'Привязать через Steam'}
          </button>

          <div style={{ marginTop: 18 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowManualSteam((v) => !v)}
            >
              {showManualSteam ? 'Скрыть ручной ввод' : 'Или ввести SteamID64 вручную'}
            </button>
          </div>

          {showManualSteam && (
            <div className="mt-20">
              <div className="alert" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', fontSize: '0.85rem' }}>
                <strong>Ручной режим:</strong> мы не проверяем, что указанный SteamID64 принадлежит вам.
                Используйте только если рекомендованный вход через Steam недоступен.
              </div>
              <button className="btn btn-outline btn-sm mb-10" onClick={() => setShowSteamHelp(!showSteamHelp)}>
                Как найти Steam ID
              </button>
              {showSteamHelp && (
                <div className="alert alert-success" style={{ fontSize: '0.85rem' }}>
                  <strong>Инструкция:</strong>
                  <ol style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.8 }}>
                    <li>Откройте <strong>Steam</strong> → имя вверху справа → <strong>«Об аккаунте»</strong></li>
                    <li>SteamID64 — число вида <code>76561198xxxxxxxxx</code></li>
                    <li>Или <a href="https://steamid.io" target="_blank" rel="noreferrer">steamid.io</a> → вставьте ссылку на профиль</li>
                    <li>Убедитесь что <strong>история матчей публичная</strong> в настройках Dota 2</li>
                  </ol>
                </div>
              )}
              <div className="form-group" style={{ marginTop: 12 }}>
                <label>Steam ID (SteamID64)</label>
                <input className="form-input" value={steamId} onChange={(e) => setSteamId(e.target.value)}
                  placeholder="76561198xxxxxxxxx" />
              </div>
              <button className="btn btn-outline" onClick={linkSteam} disabled={linking}>
                {linking ? 'Подключение (~15 сек)...' : 'Привязать вручную'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* === Goals === */}
      <div className="card mb-20">
        <div className="section-header">
          <h3>Цели и предпочтения</h3>
          <div className="section-line" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Целевой ранг</label>
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
            <label>Целевые позиции</label>
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
        <button className="btn btn-primary" onClick={saveProfile}>Сохранить профиль</button>
      </div>

      {/* === Become a coach === */}
      <CoachUpgradeCard />

      {/* === Password Change === */}
      <div className="card mb-20">
        <div className="section-header">
          <h3>Смена пароля</h3>
          <div className="section-line" />
        </div>
        {pwdMsg && <div className="alert alert-success">{pwdMsg}</div>}
        {pwdError && <div className="alert alert-error">{pwdError}</div>}
        <div className="form-group">
          <label>Текущий пароль</label>
          <div className="input-with-icon">
            <input
              type={showOldPwd ? 'text' : 'password'}
              className="form-input"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Введите текущий пароль"
            />
            <button
              type="button"
              className="input-icon-btn"
              onClick={() => setShowOldPwd(!showOldPwd)}
              tabIndex={-1}
              aria-label={showOldPwd ? 'Скрыть текущий пароль' : 'Показать текущий пароль'}
            >
              {showOldPwd ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Новый пароль</label>
            <div className="input-with-icon">
              <input
                type={showNewPwd ? 'text' : 'password'}
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 8 символов"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowNewPwd(!showNewPwd)}
                tabIndex={-1}
                aria-label={showNewPwd ? 'Скрыть новый пароль' : 'Показать новый пароль'}
              >
                {showNewPwd ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Подтверждение</label>
            <input
              type="password"
              className="form-input"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Повторите новый пароль"
            />
          </div>
        </div>
        <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={changePassword}>Сменить пароль</button>
          <button className="btn btn-danger" onClick={logoutAllSessions}>Выйти на всех устройствах</button>
        </div>
      </div>
    </div>
  );
}


function CoachUpgradeCard() {
  const [status, setStatus] = useState<string>('NONE');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    authApi.get('/auth/me').then((r) => {
      setStatus(r.data?.coach_application_status || 'NONE');
    }).catch(() => {});
  }, []);

  const apply = async () => {
    setLoading(true); setMsg(null); setErr(null);
    try {
      const r = await authApi.post('/auth/apply-coach');
      setStatus(r.data?.coach_application_status || 'PENDING');
      setMsg('Заявка отправлена. Ждите подтверждения тех-аккаунтом.');
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Не удалось отправить заявку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card mb-20">
      <div className="section-header">
        <h3>Стать тренером</h3>
        <div className="section-line" />
      </div>
      {msg && <div className="alert alert-success">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {status === 'PENDING' && (
        <div
          className="alert"
          style={{ background: 'var(--purple-bg)', border: '1px solid var(--purple)' }}
        >
          Заявка на роль тренера уже отправлена и рассматривается. Пока вы продолжаете пользоваться сервисом как игрок.
        </div>
      )}
      {status === 'APPROVED' && (
        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
          Вы уже подтверждённый тренер. Панель тренера доступна в меню.
        </p>
      )}
      {status === 'REJECTED' && (
        <div className="alert alert-error">
          Заявка ранее была отклонена. Обновите профиль и подайте снова.
        </div>
      )}
      {(status === 'NONE' || status === 'REJECTED') && (
        <>
          <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: 12 }}>
            Заявка уходит на тех-аккаунт. После подтверждения ваш профиль появится в каталоге, а у вас откроется панель тренера. До подтверждения роль остаётся «Игрок» и вы продолжаете видеть свою статистику.
          </p>
          <button className="btn btn-primary" onClick={apply} disabled={loading}>
            {loading ? 'Отправляем...' : 'Подать заявку на роль тренера'}
          </button>
        </>
      )}
    </div>
  );
}
