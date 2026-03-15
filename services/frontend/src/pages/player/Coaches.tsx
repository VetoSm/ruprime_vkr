import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function PlayerCoaches() {
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coreApi.get('/coaches').then((r) => setCoaches(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Коучи</h1>
        <p>Просмотр доступных коучей</p>
      </div>

      {loading ? (
        <p className="text-muted">Загрузка коучей...</p>
      ) : coaches.length === 0 ? (
        <div className="card">
          <p className="text-muted">Коучей пока нет. Заходите позже!</p>
        </div>
      ) : (
        <div className="grid-2">
          {coaches.map((coach) => (
            <div key={coach.id} className="card">
              <div className="flex-between mb-10">
                <h3 style={{ fontSize: '1.1rem' }}>Коуч №{coach.id}</h3>
                {coach.is_verified && <span className="badge badge-accent">Верифицирован</span>}
              </div>
              <div className="grid-2 mb-10">
                <div>
                  <span className="text-muted">MMR:</span>{' '}
                  <strong>{coach.mmr_estimate || 'Н/Д'}</strong>
                </div>
                <div>
                  <span className="text-muted">Ставка:</span>{' '}
                  <strong>{coach.hourly_rate ? `$${coach.hourly_rate}/ч` : 'Н/Д'}</strong>
                </div>
              </div>
              <div className="mb-10">
                <span className="text-muted">Позиции: </span>
                {Array.isArray(coach.main_roles)
                  ? coach.main_roles.map((r: string) => (
                      <span key={r} className="badge badge-accent" style={{ marginRight: 4 }}>{r}</span>
                    ))
                  : 'Н/Д'}
              </div>
              <div className="mb-10">
                <span className="text-muted">Опыт: </span>
                <strong>{coach.experience_years ? `${coach.experience_years} лет` : 'Н/Д'}</strong>
              </div>
              {coach.about && <p className="text-muted" style={{ fontSize: '0.85rem' }}>{coach.about}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
