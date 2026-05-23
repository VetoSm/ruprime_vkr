import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { coreApi, authApi } from '../../api/client';
import { RankBadge } from '../../ui/GameComponents';
import { rankTierToName } from '../../api/heroes';
import { IconEye, IconEyeOff } from '../../ui/Icons';

const STEAM_PENDING_KEY = 'steam_pending_link_id';
const AI_SUB_KEY = 'ai_subscription_active_v1';
const NOTIF_KEY  = 'notification_prefs_v1';
const AUTH_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001';

const ROLE_OPTIONS = [
  { id: 'POS1', label: 'Carry' },
  { id: 'POS2', label: 'Mid' },
  { id: 'POS3', label: 'Offlane' },
  { id: 'POS4', label: 'Soft Support' },
  { id: 'POS5', label: 'Hard Support' },
];

const RANK_OPTIONS = ['HERALD', 'GUARDIAN', 'CRUSADER', 'ARCHON', 'LEGEND', 'ANCIENT', 'DIVINE', 'IMMORTAL'];

type TabId = 'profile' | 'goals' | 'security' | 'notifications' | 'subscription';

interface NotifPrefs {
  new_sessions: boolean;
  coach_messages: boolean;
  oracle_reports: boolean;
}

function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (!raw) return { new_sessions: true, coach_messages: true, oracle_reports: true };
    const parsed = JSON.parse(raw);
    return {
      new_sessions:    Boolean(parsed?.new_sessions ?? true),
      coach_messages:  Boolean(parsed?.coach_messages ?? true),
      oracle_reports:  Boolean(parsed?.oracle_reports ?? true),
    };
  } catch { return { new_sessions: true, coach_messages: true, oracle_reports: true }; }
}

export default function PlayerProfile() {
  const [tab, setTab] = useState<TabId>('profile');

  /* ---- Data ---- */
  const [profile, setProfile] = useState<any>(null);
  const [steamData, setSteamData] = useState<any>(null);
  const [features, setFeatures] = useState<any>(null);

  /* ---- Profile fields ---- */
  const [email, setEmail] = useState('');
  const [favRole, setFavRole] = useState('');
  const [about, setAbout] = useState('');
  const [telegram, setTelegram] = useState('');
  const [desiredRank, setDesiredRank] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  /* ---- Targets per feature ---- */
  const [targets, setTargets] = useState<Record<string, number>>({});

  /* ---- Notifications ---- */
  const [notifs, setNotifs] = useState<NotifPrefs>(loadNotifPrefs());

  /* ---- AI subscription (local, until backend) ---- */
  const [aiSubActive, setAiSubActive] = useState<boolean>(() => {
    try { return localStorage.getItem(AI_SUB_KEY) === '1'; } catch { return false; }
  });

  /* ---- Steam linking ---- */
  const [steamId, setSteamId] = useState('');
  const [linking, setLinking] = useState(false);
  const [showManualSteam, setShowManualSteam] = useState(false);
  const [autoLinkTried, setAutoLinkTried] = useState(false);

  /* ---- Password change ---- */
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();

  /* ============================================================
   * Load
   * ==========================================================*/
  useEffect(() => {
    if (searchParams.get('linked') === '1') {
      setProfileMsg('Steam привязан. Статистика обновится за минуту.');
      coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
      const next = new URLSearchParams(searchParams);
      next.delete('linked');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    coreApi.get('/player/profile').then((r) => {
      setProfile(r.data);
      setEmail(r.data.email || '');
      setFavRole(r.data.analysis_role || r.data.preferred_role || '');
      setAbout(r.data.about || '');
      setTelegram(r.data.telegram || '');
      setDesiredRank(r.data.desired_rank_tier || '');
    }).catch(() => {});

    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});

    coreApi.get('/me/overview').then((r) => {
      const pid = r.data?.profile?.player_profile_id ?? r.data?.profile?.id;
      if (pid) {
        coreApi.get(`/player/${pid}/detailed-features`, { params: { mode: 'ranked', period: '50' } })
          .then((r2) => {
            setFeatures(r2.data);
            // init targets from current values, allow editing
            const initial: Record<string, number> = {};
            (r2.data?.categories || []).forEach((c: any) => {
              if (!c.missing) initial[c.key] = c.target ?? Math.min(10, (c.score ?? 0) + 1.5);
            });
            setTargets(initial);
          })
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  /* Auto-link Steam from pending value */
  useEffect(() => {
    if (autoLinkTried) return;
    if (steamData?.linked) {
      try { localStorage.removeItem(STEAM_PENDING_KEY); } catch {}
      setAutoLinkTried(true);
      return;
    }
    let pending: string | null = null;
    try { pending = localStorage.getItem(STEAM_PENDING_KEY); } catch {}
    if (!pending) { setAutoLinkTried(true); return; }
    setAutoLinkTried(true);
    (async () => {
      setLinking(true);
      try {
        await coreApi.post('/player/link-steam', { steam_id: pending });
        const syncRes = await coreApi.post('/player/sync-steam').catch(() => null);
        if (syncRes?.data) setSteamData({ linked: true, ...syncRes.data });
        else {
          const r = await coreApi.get('/player/steam-data');
          setSteamData(r.data);
        }
        try { localStorage.removeItem(STEAM_PENDING_KEY); } catch {}
        setProfileMsg('Steam-аккаунт привязан автоматически.');
      } catch {
        setProfileErr('Автопривязка не удалась — попробуйте через Steam ниже.');
      } finally { setLinking(false); }
    })();
  }, [steamData, autoLinkTried]);

  /* ============================================================
   * Handlers
   * ==========================================================*/
  const saveProfile = async () => {
    setProfileMsg(''); setProfileErr('');
    try {
      const res = await coreApi.post('/player/profile', {
        about: about || undefined,
        telegram: telegram || undefined,
        analysis_role: favRole || '',
        desired_rank_tier: desiredRank || undefined,
      });
      setProfile(res.data);
      setProfileMsg('Профиль сохранён.');
    } catch (err: any) {
      setProfileErr(err?.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const saveTargets = async () => {
    setProfileMsg(''); setProfileErr('');
    try {
      // На бэке нет dedicated targets endpoint — пишем как training_goals (массив строк "key:target").
      const lines = Object.entries(targets).map(([k, v]) => `${k}:${v}`);
      await coreApi.post('/player/profile', { training_goals: lines });
      setProfileMsg('Цели сохранены.');
    } catch (err: any) {
      setProfileErr(err?.response?.data?.detail || 'Ошибка сохранения целей');
    }
  };

  const linkSteamViaOpenId = async () => {
    setProfileErr('');
    try {
      await authApi.post('/auth/steam/link-intent', {}, { withCredentials: true });
      window.location.href = `${AUTH_URL}/auth/steam/login?mode=link`;
    } catch (err: any) {
      setProfileErr(err?.response?.data?.detail || 'Не удалось начать привязку через Steam');
    }
  };

  const linkSteam = async () => {
    setProfileMsg(''); setProfileErr(''); setLinking(true);
    try {
      const res = await coreApi.post('/player/link-steam', { steam_id: steamId, trusted: false });
      setSteamData({ linked: true, ...res.data });
      setProfileMsg(`Аккаунт ${res.data.personaname || ''} привязан.`);
    } catch (err: any) {
      setProfileErr(err?.response?.data?.detail || 'Ошибка привязки');
    } finally { setLinking(false); }
  };

  const changePassword = async () => {
    setPwdMsg(''); setPwdError('');
    if (newPassword !== confirmNewPassword) { setPwdError('Пароли не совпадают'); return; }
    if (newPassword.length < 8)              { setPwdError('Минимум 8 символов'); return; }
    try {
      await authApi.post('/auth/change-password', { old_password: oldPassword, new_password: newPassword });
      setPwdMsg('Пароль изменён.');
      setOldPassword(''); setNewPassword(''); setConfirmNewPassword('');
    } catch (err: any) {
      setPwdError(err?.response?.data?.detail || 'Ошибка смены пароля');
    }
  };

  const toggleNotif = (key: keyof NotifPrefs) => {
    setNotifs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const toggleAiSub = () => {
    setAiSubActive((v) => {
      const next = !v;
      try { localStorage.setItem(AI_SUB_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  };

  /* ============================================================
   * Render
   * ==========================================================*/
  const isLinked = steamData?.linked && steamData?.personaname;
  const initials = (steamData?.personaname || profile?.login || '?').slice(0, 2).toUpperCase();

  return (
    <div>
      {/* Header */}
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>Профиль</h1>
          <p>Управляй данными аккаунта и предпочтениями</p>
        </div>
      </div>

      {profileMsg && <div className="alert alert-success" style={{ marginBottom: 14 }}>{profileMsg}</div>}
      {profileErr && <div className="alert alert-error"   style={{ marginBottom: 14 }}>{profileErr}</div>}

      {/* Tabs */}
      <div className="seg-control" style={{ marginBottom: 18 }}>
        {([
          { id: 'profile',       label: 'Профиль' },
          { id: 'goals',         label: 'Цели' },
          { id: 'security',      label: 'Безопасность' },
          { id: 'notifications', label: 'Уведомления' },
          { id: 'subscription',  label: 'Подписка' },
        ] as { id: TabId; label: string }[]).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`seg-control-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="profile-layout">
        {/* ============ Main column ============ */}
        <div className="profile-main">
          {tab === 'profile' && (
            <>
              <div className="card dash-card">
                <div className="card-head"><div className="card-title">Личная информация</div></div>
                <div className="profile-form">
                  <div className="profile-avatar-block">
                    {steamData?.avatar_url
                      ? <img src={steamData.avatar_url} alt="" className="profile-avatar" />
                      : <span className="profile-avatar profile-avatar--initials">{initials}</span>}
                    <div className="profile-avatar-meta">
                      <div className="profile-avatar-name">{steamData?.personaname || profile?.login || '—'}</div>
                      {steamData?.rank_tier && (
                        <div className="profile-avatar-rank">
                          <RankBadge rankTier={steamData.rank_tier} size="sm" />
                          <span>{rankTierToName(steamData.rank_tier)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid-2 form-grid">
                    <div className="form-group">
                      <label>Никнейм</label>
                      <input type="text" className="form-input" value={profile?.login || ''} readOnly />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@mail.ru" />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Любимая роль</label>
                    <div className="role-toggle" role="tablist" style={{ borderRadius: 10, gridTemplateColumns: 'repeat(5, 1fr)' }}>
                      {ROLE_OPTIONS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          role="tab"
                          aria-selected={favRole === r.id}
                          className={`role-toggle-btn ${favRole === r.id ? 'active' : ''}`}
                          onClick={() => setFavRole(favRole === r.id ? '' : r.id)}
                          style={{ borderRadius: 8, padding: '8px 6px', fontSize: '0.78rem' }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Telegram</label>
                    <input
                      type="text"
                      className="form-input"
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value)}
                      placeholder="@username"
                    />
                  </div>

                  <div className="form-group">
                    <label>О себе</label>
                    <textarea
                      className="form-input"
                      value={about}
                      onChange={(e) => setAbout(e.target.value)}
                      placeholder="Расскажи немного о себе…"
                      rows={3}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="btn btn-primary btn-sm" onClick={saveProfile}>Сохранить</button>
                  </div>
                </div>
              </div>

              {/* Linked Steam account */}
              <div className="card dash-card" style={{ marginTop: 18 }}>
                <div className="card-head">
                  <div className="card-title">Привязанный Steam-аккаунт</div>
                </div>
                {isLinked ? (
                  <div className="profile-steam-row">
                    <div className="profile-steam-info">
                      {steamData?.avatar_url
                        ? <img src={steamData.avatar_url} alt="" className="profile-avatar profile-avatar--sm" />
                        : <span className="profile-avatar profile-avatar--sm profile-avatar--initials">{initials}</span>}
                      <div>
                        <div className="profile-steam-name">{steamData.personaname}</div>
                        <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                          {steamData.steam_id || '—'}
                          {steamData.rank_tier && <> · {rankTierToName(steamData.rank_tier)}</>}
                          {steamData.estimated_hours && <> · {Math.round(steamData.estimated_hours)} ч</>}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: 4 }}>
                          Данные обновляются автоматически в фоне.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="profile-steam-empty">
                    <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: 12 }}>
                      Steam не привязан. Без привязки не подгружается реальная статистика и не работает подбор тренеров.
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={linkSteamViaOpenId} disabled={linking}>
                        Привязать через Steam
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => setShowManualSteam((v) => !v)}>
                        {showManualSteam ? 'Скрыть' : 'Ввести SteamID вручную'}
                      </button>
                    </div>
                    {showManualSteam && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                        <input
                          className="form-input"
                          placeholder="76561198xxxxxxxxx или ссылка на профиль"
                          value={steamId}
                          onChange={(e) => setSteamId(e.target.value)}
                        />
                        <button className="btn btn-primary btn-sm" disabled={!steamId || linking} onClick={linkSteam}>
                          {linking ? 'Привязка…' : 'Привязать'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'goals' && (
            <>
              <div className="card dash-card">
                <div className="card-head"><div className="card-title">Желаемый ранг</div></div>
                <div className="role-toggle" role="tablist" style={{ borderRadius: 10, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {RANK_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`role-toggle-btn ${desiredRank === r ? 'active' : ''}`}
                      onClick={() => setDesiredRank(desiredRank === r ? '' : r)}
                      style={{ borderRadius: 8, padding: '8px 6px', fontSize: '0.78rem' }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveProfile}>Сохранить ранг</button>
                </div>
              </div>

              <div className="card dash-card" style={{ marginTop: 18 }}>
                <div className="card-head">
                  <div className="card-title">Цели по навыкам</div>
                </div>
                {features?.categories?.length > 0 ? (
                  <>
                    <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 14 }}>
                      Текущий балл считается по выборке за последние 50 матчей. Поставь желаемый таргет — он будет видеть Оракул и тренер.
                    </p>
                    <div className="goals-list">
                      {features.categories.filter((c: any) => !c.missing).map((cat: any) => {
                        const cur = cat.score ?? 0;
                        const tgt = targets[cat.key] ?? cat.target ?? 0;
                        return (
                          <div key={cat.key} className="goal-row">
                            <div className="goal-row-head">
                              <span className="goal-row-name">{cat.name}</span>
                              <span className="goal-row-now">{cur.toFixed(1)} / 10</span>
                            </div>
                            <div className="goal-row-bar">
                              <span style={{ width: `${Math.min(100, (cur / 10) * 100)}%` }} />
                            </div>
                            <div className="goal-row-target">
                              <label>Цель</label>
                              <input
                                type="range"
                                min={0}
                                max={10}
                                step={0.1}
                                value={tgt}
                                onChange={(e) => setTargets((t) => ({ ...t, [cat.key]: Number(e.target.value) }))}
                              />
                              <span className="goal-row-target-val">{Number(tgt).toFixed(1)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <button className="btn btn-primary btn-sm" onClick={saveTargets}>Сохранить цели</button>
                    </div>
                  </>
                ) : (
                  <p className="text-muted" style={{ fontSize: '0.88rem' }}>
                    Привяжите Steam — фитчи появятся после загрузки матчей.
                  </p>
                )}
              </div>
            </>
          )}

          {tab === 'security' && (
            <div className="card dash-card">
              <div className="card-head"><div className="card-title">Смена пароля</div></div>
              {pwdMsg   && <div className="alert alert-success" style={{ marginBottom: 12 }}>{pwdMsg}</div>}
              {pwdError && <div className="alert alert-error"   style={{ marginBottom: 12 }}>{pwdError}</div>}

              <div className="form-group">
                <label>Старый пароль</label>
                <div className="input-with-icon">
                  <input
                    type={showOldPwd ? 'text' : 'password'}
                    className="form-input"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                  <button type="button" className="input-icon-btn" onClick={() => setShowOldPwd(!showOldPwd)} tabIndex={-1}>
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
                      minLength={8}
                      placeholder="Минимум 8 символов"
                    />
                    <button type="button" className="input-icon-btn" onClick={() => setShowNewPwd(!showNewPwd)} tabIndex={-1}>
                      {showNewPwd ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Повторите пароль</label>
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    className="form-input"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={changePassword}
                  disabled={!oldPassword || !newPassword || !confirmNewPassword}
                >
                  Сменить пароль
                </button>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="card dash-card">
              <div className="card-head"><div className="card-title">Уведомления</div></div>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 14 }}>
                В уведомления приходят новости платформы и сообщения от тренеров (подтверждение сессии, перенос и т.д.).
              </p>
              <div className="notif-list">
                <NotifRow label="Новые сессии и подтверждения" desc="Когда тренер подтверждает / переносит / отменяет сессию." active={notifs.new_sessions} onToggle={() => toggleNotif('new_sessions')} />
                <NotifRow label="Сообщения от тренеров"        desc="Когда тренер пишет вам по поводу заявки или подбора слота." active={notifs.coach_messages} onToggle={() => toggleNotif('coach_messages')} />
                <NotifRow label="Отчёты от Оракула"            desc="Еженедельная сводка, советы по прокачке слабых сторон." active={notifs.oracle_reports} onToggle={() => toggleNotif('oracle_reports')} />
              </div>
            </div>
          )}

          {tab === 'subscription' && (
            <div className="card dash-card">
              <div className="card-head">
                <div className="card-title">Подписка на AI-тренера</div>
                <span className={`badge ${aiSubActive ? 'badge-accent' : 'badge-muted'}`}>
                  {aiSubActive ? 'Активна' : 'Не оформлена'}
                </span>
              </div>
              <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: 14 }}>
                {aiSubActive
                  ? 'У вас активная подписка Pro. Расширенные разборы, неограниченные запросы Оракулу, доступ к гайдам тренеров.'
                  : 'С Pro-подпиской открывается доступ к расширенному Оракулу, неограниченным разборам матчей и эксклюзивным гайдам.'}
              </p>
              <ul className="profile-sub-features">
                <li>✓ Неограниченные разборы с Оракулом</li>
                <li>✓ Расширенная аналитика и таргеты</li>
                <li>✓ Эксклюзивные гайды от тренеров</li>
                <li>✓ Приоритетная поддержка</li>
              </ul>
              <button className="btn btn-primary btn-sm" onClick={toggleAiSub}>
                {aiSubActive ? 'Отключить подписку' : 'Оформить Pro'}
              </button>
            </div>
          )}
        </div>

        {/* ============ Side column (always visible) ============ */}
        <aside className="profile-side">
          <div className="card dash-card">
            <div className="card-head"><div className="card-title">Безопасность</div></div>
            <div className="profile-side-list">
              <div className="profile-side-row">
                <div>
                  <div className="profile-side-row-title">Авторизация через Steam</div>
                  <div className="profile-side-row-desc">{isLinked ? 'Привязано' : 'Не привязано'}</div>
                </div>
                <span className={`badge ${isLinked ? 'badge-accent' : 'badge-muted'}`}>
                  {isLinked ? 'on' : 'off'}
                </span>
              </div>
              <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={() => setTab('security')}>
                Сменить пароль
              </button>
            </div>
          </div>

          <div className="card dash-card">
            <div className="card-head"><div className="card-title">Уведомления</div></div>
            <div className="profile-side-list">
              {([
                ['new_sessions',    'Новые сессии'],
                ['coach_messages',  'Сообщения от тренеров'],
                ['oracle_reports',  'Отчёты от Оракула'],
              ] as [keyof NotifPrefs, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className="profile-side-row profile-side-row--toggle"
                  onClick={() => toggleNotif(k)}
                >
                  <span className="profile-side-row-title">{label}</span>
                  <span className={`toggle-mini ${notifs[k] ? 'on' : 'off'}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="card dash-card">
            <div className="card-head">
              <div className="card-title">Подписка</div>
              <span className={`badge ${aiSubActive ? 'badge-accent' : 'badge-muted'}`}>
                {aiSubActive ? 'Pro' : 'Free'}
              </span>
            </div>
            <ul className="profile-sub-features" style={{ marginBottom: 12, fontSize: '0.82rem' }}>
              <li>{aiSubActive ? '✓' : '·'} Неограниченные разборы</li>
              <li>{aiSubActive ? '✓' : '·'} Расширенная аналитика</li>
              <li>{aiSubActive ? '✓' : '·'} Гайды от тренеров</li>
              <li>{aiSubActive ? '✓' : '·'} Доступ к функциям Оракула</li>
            </ul>
            <button className="btn btn-outline btn-sm" style={{ width: '100%' }} onClick={() => setTab('subscription')}>
              Управлять
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ============ Helpers ============ */
function NotifRow({ label, desc, active, onToggle }: { label: string; desc?: string; active: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="notif-row" onClick={onToggle}>
      <div className="notif-row-text">
        <div className="notif-row-title">{label}</div>
        {desc && <div className="notif-row-desc">{desc}</div>}
      </div>
      <span className={`toggle-mini ${active ? 'on' : 'off'}`} />
    </button>
  );
}
