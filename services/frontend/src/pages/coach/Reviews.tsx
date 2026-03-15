import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function CoachReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [coachId, setCoachId] = useState<number | null>(null);

  useEffect(() => {
    coreApi.get('/me/overview').then((r) => {
      const pid = r.data?.profile?.id;
      if (pid) {
        setCoachId(pid);
        coreApi.get(`/coach/${pid}/reviews`).then((r2) => setReviews(r2.data)).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : 'N/A';

  return (
    <div>
      <div className="page-header">
        <h1>Мои отзывы</h1>
        <p>Обратная связь и оценки учеников</p>
      </div>

      <div className="stat-card mb-30" style={{ maxWidth: 300 }}>
        <div className="stat-card-label">Средний рейтинг</div>
        <div className="stat-card-value text-accent">{avgRating} / 5</div>
        <div className="text-muted">{reviews.length} отзывов</div>
      </div>

      {reviews.length === 0 ? (
        <div className="card"><p className="text-muted">Отзывов пока нет.</p></div>
      ) : (
        <div>
          {reviews.map((r) => (
            <div key={r.id} className="card mb-10">
              <div className="flex-between">
                <div className="flex gap-10">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ color: i < r.rating ? 'var(--accent)' : 'var(--text-muted)', fontSize: '1.2rem' }}>
                      &#9733;
                    </span>
                  ))}
                </div>
                <span className="text-muted">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
              </div>
              {r.comment && <p className="mt-10">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
