import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { RankBadge, RoleBadge } from '../../ui/GameComponents';
import { IconFilter, IconSearch } from '../../ui/Icons';

export default function PlayerCoaches() {
  const [coaches, setCoaches] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [filterRole, setFilterRole] = useState('');
  const [filterFocus, setFilterFocus] = useState('');
  const [filterMaxRate, setFilterMaxRate] = useState('');

  useEffect(() => {
    coreApi.get('/coaches').then((r) => setCoaches(r.data)).catch(() => {}).finally(() => setLoading(false));
    fetchRecommended();
  }, []);

  const fetchRecommended = async (role?: string, focus?: string) => {
    setMatchLoading(true);
    try {
      const res = await coreApi.post('/matchmaking/requests', {
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

  const filteredCoaches = coaches.filter((c) => {
    if (filterRole && Array.isArray(c.main_roles) && !c.main_roles.includes(filterRole)) return false;
    if (filterMaxRate && c.hourly_rate > Number(filterMaxRate)) return false;
    return true;
  });

  const recommendedIds = new Set(recommended.map((r: any) => r.coach_profile_id));

  const sortedCoaches = [...filteredCoaches].sort((a, b) => {
    const aRec = recommendedIds.has(a.id) ? 1 : 0;
    const bRec = recommendedIds.has(b.id) ? 1 : 0;
    return bRec - aRec;
  });

  return (
    <div>
      <div className="page-header">
        <h1>Тренеры</h1>
        <p>Лучшие тренеры, подобранные под ваш профиль</p>
      </div>

      {/* Recommended section */}
      {recommended.length > 0 && !matchLoading && (
        <div className="card mb-20" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
          <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--accent)' }}>★</span> Рекомендованные для вас
          </h3>
          <div className="grid-3">
            {recommended.slice(0, 3).map((rec: any, i: number) => (
              <div key={i} className="stat-card" style={{ textAlign: 'left' }}>
                <div className="flex-between mb-10">
                  <strong>Тренер #{rec.coach_profile_id}</strong>
                  <span className="badge badge-accent">{(rec.score * 100).toFixed(0)}% совпадение</span>
                </div>
                <ul style={{ paddingLeft: 16, margin: 0 }}>
                  {rec.reasons?.slice(0, 2).map((r: string, j: number) => (
                    <li key={j} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
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
                <option value="POS1">Керри (POS1)</option>
                <option value="POS2">Мид (POS2)</option>
                <option value="POS3">Оффлейн (POS3)</option>
                <option value="POS4">Софт саппорт (POS4)</option>
                <option value="POS5">Хард саппорт (POS5)</option>
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
      ) : sortedCoaches.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <p className="text-muted">
            {coaches.length === 0
              ? 'Пока нет зарегистрированных тренеров. Станьте первым!'
              : 'Нет тренеров по заданным фильтрам.'}
          </p>
        </div>
      ) : (
        <div className="grid-2">
          {sortedCoaches.map((coach) => {
            const isRec = recommendedIds.has(coach.id);
            return (
              <div key={coach.id} className="card" style={{
                position: 'relative',
                borderColor: isRec ? 'var(--accent)' : undefined,
                borderWidth: isRec ? 2 : undefined,
              }}>
                {isRec && (
                  <span className="badge badge-accent" style={{
                    position: 'absolute', top: 10, right: 10, fontSize: '0.7rem',
                  }}>Рекомендован</span>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>
                      {coach.about?.split('\n')[0] || `Тренер #${coach.id}`}
                    </h3>
                    <div className="flex gap-10" style={{ alignItems: 'center' }}>
                      {coach.rank_tier && <RankBadge rankName={coach.rank_tier} size="sm" />}
                      {coach.is_verified && <span className="badge badge-accent">Верифицирован</span>}
                    </div>
                  </div>
                  {coach.hourly_rate && (
                    <div style={{
                      textAlign: 'right', padding: '8px 14px',
                      background: 'rgba(0,212,170,0.06)', borderRadius: 12,
                      border: '1px solid rgba(0,212,170,0.15)',
                    }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--accent)' }}>
                        {coach.hourly_rate.toLocaleString()} ₽
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>за час</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>MMR: </span>
                    <strong>{coach.mmr_estimate ? coach.mmr_estimate.toLocaleString() : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>Опыт: </span>
                    <strong>{coach.experience_years ? `${coach.experience_years} лет` : '—'}</strong>
                  </div>
                </div>

                {Array.isArray(coach.main_roles) && coach.main_roles.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {coach.main_roles.map((r: string) => <RoleBadge key={r} role={r} compact />)}
                  </div>
                )}

                {Array.isArray(coach.hero_pool) && coach.hero_pool.length > 0 && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                    Герои: {coach.hero_pool.join(', ')}
                  </div>
                )}

                {coach.about && (
                  <p style={{
                    fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6,
                    borderTop: '1px solid var(--border-color)', paddingTop: 10, marginTop: 4,
                  }}>
                    {coach.about.length > 120 ? coach.about.slice(0, 120) + '...' : coach.about}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
