import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { RankBadge, RoleBadge } from '../../ui/GameComponents';
import { IconFilter, IconSearch } from '../../ui/Icons';
import { loadHeroes, heroName } from '../../api/heroes';

export default function PlayerCoaches() {
  const [coaches, setCoaches] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
  const [steamLinked, setSteamLinked] = useState<boolean | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [filterRole, setFilterRole] = useState('');
  const [filterFocus, setFilterFocus] = useState('');
  const [filterMaxRate, setFilterMaxRate] = useState('');

  const [applyCoach, setApplyCoach] = useState<any | null>(null);
  const [applyRole, setApplyRole] = useState('');
  const [applyFocus, setApplyFocus] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResultMsg, setApplyResultMsg] = useState<string | null>(null);
  const [applyResultErr, setApplyResultErr] = useState<string | null>(null);

  useEffect(() => {
    loadHeroes();
    coreApi.get('/coaches').then((r) => setCoaches(r.data)).catch(() => {}).finally(() => setLoading(false));
    coreApi.get('/player/steam-data').then((r) => setSteamLinked(Boolean(r.data?.linked))).catch(() => setSteamLinked(false));
    fetchRecommended();
  }, []);

  const fetchRecommended = async (role?: string, focus?: string) => {
    setMatchLoading(true);
    try {
      const res = await coreApi.post('/matchmaking/recommend-preview', {
        desired_role: role || undefined,
        focus_area: focus || undefined,
        use_ai_coach: false,
      });
      setRecommended(res.data?.recommended_coaches || []);
    } catch { /* silent */ }
    finally { setMatchLoading(false); }
  };

  const applyFilters = () => {
    fetchRecommended(filterRole, filterFocus);
  };

  const openApply = (coach: any) => {
    setApplyCoach(coach);
    setApplyRole(filterRole || '');
    setApplyFocus(filterFocus || '');
    setApplyMessage('');
    setApplyResultMsg(null);
    setApplyResultErr(null);
  };

  const submitApply = async () => {
    if (!applyCoach) return;
    setApplyLoading(true);
    setApplyResultMsg(null); setApplyResultErr(null);
    try {
      await coreApi.post('/matchmaking/requests', {
        preferred_coach_profile_id: applyCoach.id,
        desired_role: applyRole || undefined,
        focus_area: applyFocus || undefined,
        message: applyMessage || undefined,
        use_ai_coach: false,
      });
      setApplyResultMsg('Заявка отправлена. Тренер увидит её в своём расписании и свяжется с вами.');
    } catch (e: any) {
      setApplyResultErr(e?.response?.data?.detail || 'Не удалось отправить заявку');
    } finally {
      setApplyLoading(false);
    }
  };

  const filteredCoaches = coaches.filter((c) => {
    const effectiveRoles: string[] = (c.main_roles && c.main_roles.length > 0)
      ? c.main_roles
      : (c.auto_main_roles || []);
    if (filterRole && !effectiveRoles.includes(filterRole)) return false;
    if (filterMaxRate && c.hourly_rate && c.hourly_rate > Number(filterMaxRate)) return false;
    return true;
  });

  const heroLabel = (raw: any): string => {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      const name = heroName(num);
      return name === String(num) ? `Hero #${num}` : name;
    }
    return String(raw);
  };

  const recommendedScore = new Map<number, any>();
  for (const r of recommended) {
    if (!recommendedScore.has(r.coach_profile_id)) {
      recommendedScore.set(r.coach_profile_id, r);
    }
  }
  const bestMatches = filteredCoaches
    .filter((c) => recommendedScore.has(c.id))
    .sort((a, b) => (recommendedScore.get(b.id)?.score || 0) - (recommendedScore.get(a.id)?.score || 0))
    .slice(0, 5);
  const bestIds = new Set(bestMatches.map((c) => c.id));
  const otherCoaches = filteredCoaches.filter((c) => !bestIds.has(c.id));

  const renderCoachCard = (coach: any, rec?: any) => {
    const effectiveRoles: string[] = (coach.main_roles && coach.main_roles.length > 0)
      ? coach.main_roles
      : (coach.auto_main_roles || []);
    const effectiveHeroes: any[] = (coach.hero_pool && coach.hero_pool.length > 0)
      ? coach.hero_pool
      : (coach.auto_hero_pool || []);
    const effectiveRank = coach.rank_tier || coach.auto_rank_tier;
    const effectiveMmr = coach.mmr_estimate || coach.auto_mmr_estimate;
    const usingAutoData = (
      (!coach.main_roles?.length && coach.auto_main_roles?.length) ||
      (!coach.hero_pool?.length && coach.auto_hero_pool?.length) ||
      (!coach.about)
    );

    return (
    <div key={coach.id} className="card" style={{
      position: 'relative',
      borderColor: rec ? 'var(--accent)' : undefined,
      borderWidth: rec ? 2 : undefined,
    }}>
      {rec && (
        <span className="badge badge-accent" style={{
          position: 'absolute', top: 10, right: 10, fontSize: '0.7rem',
        }}>
          MATCH {(rec.score * 100).toFixed(0)}%
        </span>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div className="badge badge-purple" style={{ marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Coach card
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>
            {coach.about?.split('\n')[0] || `Тренер #${coach.id}`}
          </h3>
          <div className="flex gap-10" style={{ alignItems: 'center' }}>
            {effectiveRank && <RankBadge rankName={effectiveRank} size="sm" />}
            {coach.is_verified && <span className="badge badge-accent">Verified coach</span>}
            {!coach.profile_complete && (
              <span className="badge" style={{
                background: 'rgba(255,165,2,0.12)', color: 'var(--warning)',
                border: '1px solid rgba(255,165,2,0.35)', fontSize: '0.7rem',
              }} title="Тренер пока не дозаполнил профиль. Данные подтянуты автоматически из Steam.">
                Профиль не дозаполнен
              </span>
            )}
          </div>
        </div>
        <div style={{
          textAlign: 'right', padding: '8px 14px',
          background: 'rgba(0,212,170,0.06)', borderRadius: 12,
          border: '1px solid rgba(0,212,170,0.15)',
        }}>
          {coach.hourly_rate ? (
            <>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--accent)' }}>
                {coach.hourly_rate.toLocaleString()} ₽
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>разбор / час</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Договорная</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>цена</div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>Coach MMR: </span>
          <strong>{effectiveMmr ? effectiveMmr.toLocaleString() : '—'}</strong>
        </div>
        <div>
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>Опыт тренера: </span>
          <strong>{coach.experience_years ? `${coach.experience_years} лет` : '—'}</strong>
        </div>
      </div>

      {effectiveRoles.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {effectiveRoles.map((r: string) => <RoleBadge key={r} role={r} compact />)}
        </div>
      )}

      {effectiveHeroes.length > 0 && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
          Hero pool: {effectiveHeroes.map(heroLabel).join(', ')}
        </div>
      )}

      {rec?.reasons?.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="text-muted" style={{ fontSize: '0.76rem', marginBottom: 4 }}>Почему подходит под ваш матчап:</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {rec.reasons.slice(0, 3).map((reason: string, idx: number) => (
              <li key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {coach.about && (
        <p style={{
          fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6,
          borderTop: '1px solid var(--border-color)', paddingTop: 10, marginTop: 4,
        }}>
          {coach.about.length > 140 ? coach.about.slice(0, 140) + '...' : coach.about}
        </p>
      )}

      {usingAutoData && (
        <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 8, fontStyle: 'italic' }}>
          Часть данных подтянута автоматически из истории матчей тренера.
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-sm" onClick={() => openApply(coach)}>
          Записаться на разбор
        </button>
      </div>
    </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1>Найти тренера</h1>
        <p>Coach cards под ваш ранг, роль и зоны роста</p>
      </div>

      {steamLinked === false && (
        <div
          className="alert mb-20"
          style={{
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
          }}
        >
          Steam не привязан — рекомендации формируются по общему профилю, без вашей реальной статистики.
          Привяжите аккаунт в <Link to="/settings">настройках</Link>, и мы подберём тренеров под ваш ранг, роли и зоны роста.
        </div>
      )}

      {/* Filters */}
      <div className="flex-between mb-20">
        <button className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setShowFilters(!showFilters)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconFilter size={14} /> Фильтры
          </span>
        </button>
        {matchLoading && <span className="text-muted" style={{ fontSize: '0.85rem' }}>Подбираем...</span>}
      </div>

      {showFilters && (
        <div className="card mb-20">
          <div className="grid-3" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Позиция</label>
              <select className="form-select" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                <option value="">Любая</option>
                <option value="POS1">Carry</option>
                <option value="POS2">Mid</option>
                <option value="POS3">Offlane</option>
                <option value="POS4">Soft Support</option>
                <option value="POS5">Hard Support</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Область фокуса</label>
              <select className="form-select" value={filterFocus} onChange={(e) => setFilterFocus(e.target.value)}>
                <option value="">Общее</option>
                <option value="lane_control">Контроль линии</option>
                <option value="macro">Макро / карта</option>
                <option value="hero_pool">Пул героев</option>
                <option value="teamfight">Тимфайты</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Макс. ставка (₽/час)</label>
              <input className="form-input" type="number" value={filterMaxRate}
                onChange={(e) => setFilterMaxRate(e.target.value)} placeholder="Без лимита" />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={applyFilters}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IconSearch size={14} /> Найти тренеров
            </span>
          </button>
        </div>
      )}

      {/* Coach List */}
      {loading ? (
        <p className="text-muted">Загрузка...</p>
      ) : filteredCoaches.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <p className="text-muted">
            {coaches.length === 0
              ? 'Пока нет зарегистрированных тренеров. Станьте первым!'
              : 'Нет тренеров по заданным фильтрам.'}
          </p>
        </div>
      ) : (
        <>
          <div className="card mb-20" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
            <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--accent)' }}>★</span> Лучшие матчапы под ваш профиль
            </h3>
            {bestMatches.length === 0 ? (
              <p className="text-muted">Пока не удалось определить персональные match score. Проверьте привязку Steam и статистику.</p>
            ) : (
              <div className="grid-2">
                {bestMatches.map((coach) => renderCoachCard(coach, recommendedScore.get(coach.id)))}
              </div>
            )}
          </div>

          <div>
            <h3 style={{ margin: '0 0 12px' }}>Каталог тренеров</h3>
            {otherCoaches.length === 0 ? (
              <div className="card"><p className="text-muted">Нет других тренеров по текущему фильтру.</p></div>
            ) : (
              <div className="grid-2">
                {otherCoaches.map((coach) => renderCoachCard(coach))}
              </div>
            )}
          </div>
        </>
      )}

      {applyCoach && (
        <div
          onClick={() => (!applyLoading ? setApplyCoach(null) : null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(4, 10, 24, 0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, border: '1px solid var(--border-color)' }}
          >
            <div className="section-header">
              <h3 style={{ margin: 0 }}>Записаться на разбор игры</h3>
              <div className="section-line" />
            </div>

            <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: 14 }}>
              Тренер <strong>{applyCoach.about?.split('\n')[0] || `#${applyCoach.id}`}</strong>.
              Заявка появится у тренера в расписании. Вы сможете подтвердить дату и время после согласования.
            </p>

            {applyResultMsg && <div className="alert alert-success">{applyResultMsg}</div>}
            {applyResultErr && <div className="alert alert-error">{applyResultErr}</div>}

            {!applyResultMsg && (
              <>
                <div className="grid-2">
                  <div className="form-group">
                    <label>Позиция</label>
                    <select className="form-select" value={applyRole} onChange={(e) => setApplyRole(e.target.value)}>
                      <option value="">По умолчанию</option>
                      <option value="POS1">Carry</option>
                      <option value="POS2">Mid</option>
                      <option value="POS3">Offlane</option>
                      <option value="POS4">Soft Support</option>
                      <option value="POS5">Hard Support</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Область фокуса</label>
                    <select className="form-select" value={applyFocus} onChange={(e) => setApplyFocus(e.target.value)}>
                      <option value="">Общее</option>
                      <option value="lane_control">Контроль линии</option>
                      <option value="macro">Макро / карта</option>
                      <option value="hero_pool">Пул героев</option>
                      <option value="teamfight">Тимфайты</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Сообщение тренеру (опционально)</label>
                  <textarea
                    className="form-input"
                    value={applyMessage}
                    onChange={(e) => setApplyMessage(e.target.value)}
                    placeholder="Коротко опишите, что хотите подтянуть, какой у вас график, ожидания."
                    rows={3}
                  />
                </div>
              </>
            )}

            <div className="flex gap-10" style={{ justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
              {applyResultMsg ? (
                <>
                  <Link to="/requests" className="btn btn-outline">Мои заявки</Link>
                  <button className="btn btn-primary" onClick={() => setApplyCoach(null)}>Закрыть</button>
                </>
              ) : (
                <>
                  <button className="btn btn-outline" disabled={applyLoading} onClick={() => setApplyCoach(null)}>Отмена</button>
                  <button className="btn btn-primary" disabled={applyLoading} onClick={submitApply}>
                    {applyLoading ? 'Отправляем...' : 'Отправить заявку'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
