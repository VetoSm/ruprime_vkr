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
        <h1>🎓 Тренеры</h1>
        <p>Зарегистрированные тренеры на платформе</p>
      </div>

      {loading ? (
        <p className="text-muted">Загрузка...</p>
      ) : coaches.length === 0 ? (
        <div className="card">
          <p className="text-muted text-center" style={{ padding: 40 }}>
            Пока нет зарегистрированных тренеров.<br/>
            Станьте первым — зарегистрируйтесь как тренер!
          </p>
        </div>
      ) : (
        <div className="grid-2">
          {coaches.map((coach) => (
            <div key={coach.id} className="card">
              <div className="flex-between mb-10">
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Тренер #{coach.id}
                </h3>
                <div className="flex gap-10">
                  {coach.is_verified && <span className="badge badge-accent">✓ Верифицирован</span>}
                  {coach.rank_tier && <RankBadge rankName={coach.rank_tier} size="sm" />}
                </div>
              </div>

              <div className="grid-2 mb-10">
                <div>
                  <span className="text-muted">MMR:</span>{' '}
                  <strong>{coach.mmr_estimate ? coach.mmr_estimate.toLocaleString() : 'Н/Д'}</strong>
                </div>
                <div>
                  <span className="text-muted">Ставка:</span>{' '}
                  <strong style={{ color: 'var(--accent)' }}>
                    {coach.hourly_rate ? `${coach.hourly_rate.toLocaleString()} ₽/час` : 'Н/Д'}
                  </strong>
                </div>
              </div>

              <div className="mb-10">
                <span className="text-muted">Позиции: </span>
                {Array.isArray(coach.main_roles) && coach.main_roles.length > 0
                  ? coach.main_roles.map((r: string) => <RoleBadge key={r} role={r} compact />)
                  : <span className="text-muted">Не указаны</span>
                }
              </div>

              {Array.isArray(coach.hero_pool) && coach.hero_pool.length > 0 && (
                <div className="mb-10">
                  <span className="text-muted">Герои: </span>
                  <span>{coach.hero_pool.join(', ')}</span>
                </div>
              )}

              <div className="mb-10">
                <span className="text-muted">Опыт: </span>
                <strong>{coach.experience_years ? `${coach.experience_years} лет` : 'Н/Д'}</strong>
              </div>

              {coach.about && (
                <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 10, lineHeight: 1.6 }}>
                  {coach.about}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
