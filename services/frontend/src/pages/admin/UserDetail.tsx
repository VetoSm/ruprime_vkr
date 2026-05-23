import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { Dropdown } from '../../ui/Dropdown';

interface UserDetail {
  auth: {
    id: number;
    login: string;
    email: string;
    role: string;
    is_active: boolean;
    is_verified: boolean;
    coach_application_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
    coach_application_requested_at: string | null;
    coach_approved_at: string | null;
    steam_id: string | null;
    created_at: string | null;
  };
  core_user_id: number | null;
  account_id: number | null;
  player_profile: any | null;
  coach_profile: any | null;
  steam: {
    linked: boolean;
    steam_id: string | null;
    web_api_configured: boolean;
    web_api_found: boolean;
    profile: any | null;
    playtime: any | null;
  };
  opendota: {
    available: boolean;
    match_history_open: boolean;
    warning: string | null;
    personaname: string | null;
    avatar_url: string | null;
    rank_tier: number | null;
    mmr_estimate: number | null;
    win: number | null;
    lose: number | null;
    lifetime_games: number | null;
    parsed_games_n: number | null;
    estimated_hours: number | null;
    last_match_time: string | null;
    matches_loaded: number | null;
  };
  analysis: any | null;
  sessions_as_player: Array<{ id: number; status: string; scheduled_at: string | null; coach_profile_id: number }>;
  sessions_as_coach: Array<{ id: number; status: string; scheduled_at: string | null; training_request_id: number }>;
}

function StatusBadge({ ok, label, warnLabel }: { ok: boolean; label: string; warnLabel?: string }) {
  return (
    <span
      className="badge"
      style={{
        background: ok ? 'var(--accent-bg)' : 'var(--warning-bg)',
        border: `1px solid ${ok ? 'var(--accent)' : 'var(--warning)'}`,
        color: ok ? 'var(--accent)' : 'var(--warning)',
      }}
    >
      {ok ? label : (warnLabel ?? label)}
    </span>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    coreApi.get(`/admin/users/${id}/detail`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  const refreshSteam = async () => {
    if (!data?.account_id) return;
    setRefreshing(true); setMsg(null);
    try {
      const res = await coreApi.post(`/admin/steam/${data.account_id}/refresh`);
      setMsg(res.data?.message || 'Запрошена фоновая загрузка. Данные обновятся через 30–90 секунд.');
      setTimeout(load, 2500);
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Не удалось запустить догрузку');
    } finally {
      setRefreshing(false);
    }
  };

  const changeRole = async (newRole: 'PLAYER' | 'COACH' | 'ADMIN') => {
    if (!data) return;
    if (newRole === data.auth.role) return;
    const warn =
      newRole === 'ADMIN' ? `Сделать ${data.auth.login} администратором?` :
      newRole === 'COACH' ? `Подтвердить ${data.auth.login} как тренера?` :
      `Снять роль и сделать ${data.auth.login} игроком?`;
    if (!window.confirm(warn)) return;
    try {
      await coreApi.post(`/admin/users/${data.auth.id}/role`, { role: newRole });
      setMsg(`Роль обновлена: ${newRole}`);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Не удалось сменить роль');
    }
  };

  if (loading) return <div className="card"><p className="text-muted">Загрузка профиля...</p></div>;
  if (err || !data) return <div className="alert alert-error">{err || 'Нет данных'}</div>;

  const rankName = (rt?: number | null) => {
    if (!rt) return null;
    const medals: Record<number, string> = {
      1: 'Herald', 2: 'Guardian', 3: 'Crusader', 4: 'Archon',
      5: 'Legend', 6: 'Ancient', 7: 'Divine', 8: 'Immortal',
    };
    const medal = Math.floor(rt / 10);
    const stars = rt % 10;
    return `${medals[medal] || '?'}${stars ? ` [${stars}]` : ''}`;
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Профиль пользователя #{data.auth.id}</h1>
          <p className="text-muted" style={{ margin: 0 }}>
            <Link to="/admin/users">← все пользователи</Link>
          </p>
        </div>
        <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
          <Dropdown
            value={data.auth.role}
            onChange={(v) => changeRole(v as any)}
            options={[
              { value: 'PLAYER', label: 'PLAYER' },
              { value: 'COACH', label: 'COACH' },
              { value: 'ADMIN', label: 'ADMIN' },
            ]}
            label="Роль"
            align="right"
          />
          {data.account_id && (
            <button className="btn btn-outline btn-sm" disabled={refreshing} onClick={refreshSteam}>
              {refreshing ? 'Догружаем...' : 'Догрузить Steam/OpenDota'}
            </button>
          )}
        </div>
      </div>

      {msg && <div className="alert alert-success mb-20">{msg}</div>}

      {/* === Identity card === */}
      <div className="card mb-20" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {data.opendota.avatar_url && (
          <img
            src={data.opendota.avatar_url}
            alt=""
            style={{ width: 72, height: 72, borderRadius: 10, border: '1px solid var(--border-color)' }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{data.auth.login}</div>
          <div className="text-muted" style={{ fontSize: '0.86rem' }}>{data.auth.email}</div>
          {data.opendota.personaname && data.opendota.personaname !== data.auth.login && (
            <div style={{ fontSize: '0.86rem', marginTop: 4 }}>
              <span className="text-muted">Dota-ник: </span>
              <strong>{data.opendota.personaname}</strong>
            </div>
          )}
          <div className="flex gap-10" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <span className="badge badge-accent">{data.auth.role}</span>
            {data.auth.coach_application_status !== 'NONE' && (
              <span className="badge" style={{
                background: data.auth.coach_application_status === 'APPROVED' ? 'var(--accent-bg)'
                  : data.auth.coach_application_status === 'PENDING' ? 'var(--warning-bg)' : 'var(--danger-bg)',
                border: `1px solid ${data.auth.coach_application_status === 'APPROVED' ? 'var(--accent)'
                  : data.auth.coach_application_status === 'PENDING' ? 'var(--warning)' : 'var(--danger)'}`,
                color: data.auth.coach_application_status === 'APPROVED' ? 'var(--accent)'
                  : data.auth.coach_application_status === 'PENDING' ? 'var(--warning)' : 'var(--danger)',
              }}>
                Coach: {data.auth.coach_application_status}
              </span>
            )}
            {!data.auth.is_active && <span className="badge badge-danger">Deactivated</span>}
          </div>
        </div>
      </div>

      {/* === Data sources === */}
      <div className="grid-2 mb-20">
        {/* Steam Web API */}
        <div className="card">
          <div className="section-header"><h3 style={{ margin: 0 }}>Steam Web API</h3><div className="section-line" /></div>
          <div className="flex gap-10 mb-10" style={{ flexWrap: 'wrap' }}>
            <StatusBadge ok={data.steam.linked} label="Steam привязан" warnLabel="Steam не привязан" />
            <StatusBadge ok={data.steam.web_api_configured} label="API-ключ есть" warnLabel="STEAM_API_KEY не настроен" />
            <StatusBadge
              ok={data.steam.web_api_found}
              label="Профиль публичный"
              warnLabel={data.steam.linked && data.steam.web_api_configured ? 'Steam-профиль скрыт' : '—'}
            />
          </div>
          {data.steam.linked && (
            <div className="text-muted" style={{ fontSize: '0.84rem', lineHeight: 1.7 }}>
              SteamID64: <strong>{data.steam.steam_id}</strong><br />
              account_id: <strong>{data.account_id || '—'}</strong><br />
              {data.steam.profile?.personaname && <>Steam-ник: <strong>{data.steam.profile.personaname}</strong><br /></>}
              {data.steam.profile?.country_code && <>Страна: {data.steam.profile.country_code}<br /></>}
              {data.steam.playtime && (
                <>
                  Часы в Dota 2 (Steam):{' '}
                  <strong>{data.steam.playtime.dota_hours?.toLocaleString('ru-RU') ?? '—'}</strong>
                  {data.steam.playtime.last_played && (
                    <> · последний запуск: {new Date(data.steam.playtime.last_played).toLocaleDateString('ru-RU')}</>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* OpenDota / match history */}
        <div className="card">
          <div className="section-header"><h3 style={{ margin: 0 }}>OpenDota (матчи Dota 2)</h3><div className="section-line" /></div>
          <div className="flex gap-10 mb-10" style={{ flexWrap: 'wrap' }}>
            <StatusBadge ok={data.opendota.available} label="Данные получены" warnLabel="Нет данных в OpenDota" />
            <StatusBadge
              ok={data.opendota.match_history_open}
              label="Матч-история открыта"
              warnLabel="Матч-история закрыта"
            />
          </div>
          {data.opendota.available ? (
            <div className="text-muted" style={{ fontSize: '0.84rem', lineHeight: 1.7 }}>
              Ранг: <strong>{rankName(data.opendota.rank_tier) || '—'}</strong> (оценка MMR: {data.opendota.mmr_estimate || '—'})<br />
              Всего игр: <strong>{data.opendota.lifetime_games?.toLocaleString('ru-RU') ?? '—'}</strong>{' '}
              (W/L {data.opendota.win ?? 0}/{data.opendota.lose ?? 0})<br />
              Parsed (детальные): <strong>{data.opendota.parsed_games_n?.toLocaleString('ru-RU') ?? '—'}</strong><br />
              Загружено в нашей БД: <strong>{data.opendota.matches_loaded?.toLocaleString('ru-RU') ?? '—'}</strong><br />
              {data.opendota.last_match_time && <>Последний матч: {new Date(data.opendota.last_match_time).toLocaleString('ru-RU')}<br /></>}
              {data.opendota.estimated_hours && <>Часы (по Dota): {data.opendota.estimated_hours.toLocaleString('ru-RU')}</>}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.86rem' }}>
              OpenDota пока не отдал данные по этому аккаунту.
              Возможные причины: закрытый «Expose Public Match Data», свежая регистрация,
              временный 429 OpenDota, несуществующий Steam ID.
            </p>
          )}
          {data.opendota.warning && (
            <div className="alert" style={{
              background: 'var(--warning-bg)',
              border: '1px solid var(--warning)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              marginTop: 10,
              whiteSpace: 'pre-line',
            }}>
              {data.opendota.warning}
            </div>
          )}
        </div>
      </div>

      {/* === Profiles === */}
      <div className="grid-2 mb-20">
        <div className="card">
          <div className="section-header"><h3 style={{ margin: 0 }}>Player profile</h3><div className="section-line" /></div>
          {data.player_profile ? (
            <div className="text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.7 }}>
              profile_id: <strong>#{data.player_profile.id}</strong><br />
              Текущий ранг (в профиле): {data.player_profile.actual_rank_tier || '—'}<br />
              Желаемый ранг: {data.player_profile.desired_rank_tier || '—'}<br />
              Роли (текущие): {Array.isArray(data.player_profile.actual_roles) ? data.player_profile.actual_roles.join(', ') : '—'}<br />
              Роли (желаемые): {Array.isArray(data.player_profile.desired_roles) ? data.player_profile.desired_roles.join(', ') : '—'}<br />
              Цели: {Array.isArray(data.player_profile.training_goals) ? data.player_profile.training_goals.join(', ') : '—'}<br />
              ml_analysis_id: {data.player_profile.ml_analysis_id || '—'}
            </div>
          ) : <p className="text-muted">Нет player profile</p>}
        </div>
        <div className="card">
          <div className="section-header"><h3 style={{ margin: 0 }}>Coach profile</h3><div className="section-line" /></div>
          {data.coach_profile ? (
            <div className="text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.7 }}>
              profile_id: <strong>#{data.coach_profile.id}</strong><br />
              Верифицирован: <strong>{data.coach_profile.is_verified ? 'Да' : 'Нет'}</strong><br />
              MMR: {data.coach_profile.mmr_estimate || '—'}{' '}
              · ранг: {data.coach_profile.rank_tier || '—'}<br />
              Роли: {Array.isArray(data.coach_profile.main_roles) ? data.coach_profile.main_roles.join(', ') : '—'}<br />
              Ставка/час: {data.coach_profile.hourly_rate || '—'} ₽<br />
              Опыт: {data.coach_profile.experience_years || '—'} лет
            </div>
          ) : <p className="text-muted">Нет coach profile</p>}
        </div>
      </div>

      {/* === Sessions === */}
      {(data.sessions_as_player.length > 0 || data.sessions_as_coach.length > 0) && (
        <div className="grid-2 mb-20">
          {data.sessions_as_player.length > 0 && (
            <div className="card">
              <div className="section-header"><h3 style={{ margin: 0 }}>Сессии как игрок ({data.sessions_as_player.length})</h3><div className="section-line" /></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Статус</th><th>Дата</th><th>Тренер</th></tr></thead>
                  <tbody>
                    {data.sessions_as_player.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>{s.status}</td>
                        <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('ru-RU') : '—'}</td>
                        <td>#{s.coach_profile_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {data.sessions_as_coach.length > 0 && (
            <div className="card">
              <div className="section-header"><h3 style={{ margin: 0 }}>Сессии как тренер ({data.sessions_as_coach.length})</h3><div className="section-line" /></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Статус</th><th>Дата</th><th>Заявка</th></tr></thead>
                  <tbody>
                    {data.sessions_as_coach.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>{s.status}</td>
                        <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('ru-RU') : '—'}</td>
                        <td>#{s.training_request_id}</td>
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
  );
}
