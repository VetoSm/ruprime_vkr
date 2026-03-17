import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { RankBadge, RoleBadge } from '../../ui/GameComponents';

export default function PlayerCoaches() {
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coreApi.get('/coaches').then((r) => setCoaches(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Тренеры</h1>
        <p>Зарегистрированные тренеры на платформе</p>
      </div>

      {loading ? (
        <p className="text-muted">Загрузка...</p>
      ) : coaches.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <p className="text-muted">
            Пока нет зарегистрированных тренеров.<br />
            Станьте первым — зарегистрируйтесь как тренер!
          </p>
        </div>
      ) : (
        <div className="grid-2">
          {coaches.map((coach) => (
            <div key={coach.id} className="card" style={{ position: 'relative' }}>
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
          ))}
        </div>
      )}
    </div>
  );
}
