import { useEffect, useMemo, useState } from 'react';
import { coreApi } from '../../api/client';
import { EmptyState } from '../../ui/Primitives';
import { IconStar } from '../../ui/Icons';

type FilterKind = 'all' | '5' | '4' | '3' | 'less';

export default function CoachReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterKind>('all');

  useEffect(() => {
    coreApi.get('/me/overview').then((r) => {
      const cid = r.data?.profile?.id;
      if (cid) {
        coreApi.get(`/coach/${cid}/reviews`).then((r2) => setReviews(Array.isArray(r2.data) ? r2.data : [])).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const avg = reviews.length > 0 ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length : null;
  const counts = useMemo(() => ({
    5: reviews.filter((r) => r.rating === 5).length,
    4: reviews.filter((r) => r.rating === 4).length,
    3: reviews.filter((r) => r.rating === 3).length,
    less: reviews.filter((r) => r.rating <= 2).length,
  }), [reviews]);

  const filtered = useMemo(() => {
    if (filter === 'all') return reviews;
    if (filter === 'less') return reviews.filter((r) => r.rating <= 2);
    const n = Number(filter);
    return reviews.filter((r) => r.rating === n);
  }, [reviews, filter]);

  return (
    <div>
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>Отзывы учеников</h1>
          <p>Обратная связь после сессий</p>
        </div>
        <div className="stats-header-filters">
          {avg != null && (
            <span className="badge badge-warning" style={{ fontSize: '0.95rem', padding: '6px 12px' }}>
              {avg.toFixed(1)} <IconStar size={14} color="#f6c463" /> · {reviews.length}
            </span>
          )}
        </div>
      </div>

      {/* Distribution bars */}
      {reviews.length > 0 && (
        <div className="card dash-card" style={{ marginBottom: 18 }}>
          <div className="card-head"><div className="card-title">Распределение оценок</div></div>
          <div className="reviews-distribution">
            {[5, 4, 3, 2, 1].map((star) => {
              const cnt = reviews.filter((r) => r.rating === star).length;
              const pct = (cnt / reviews.length) * 100;
              return (
                <div key={star} className="reviews-distribution-row">
                  <span className="reviews-distribution-star">
                    {star} <IconStar size={11} color="#f6c463" />
                  </span>
                  <div className="role-wr-bar" style={{ flex: 1, height: 6 }}>
                    <div
                      className="role-wr-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: star >= 4 ? 'linear-gradient(90deg, var(--accent-bright), var(--accent))'
                                              : 'linear-gradient(90deg, var(--purple), rgba(155, 89, 255, 0.6))',
                      }}
                    />
                  </div>
                  <span className="reviews-distribution-count">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="seg-control" style={{ marginBottom: 18 }}>
        <button type="button" className={`seg-control-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Все · {reviews.length}</button>
        <button type="button" className={`seg-control-btn ${filter === '5' ? 'active' : ''}`} onClick={() => setFilter('5')}>5 ★ · {counts[5]}</button>
        <button type="button" className={`seg-control-btn ${filter === '4' ? 'active' : ''}`} onClick={() => setFilter('4')}>4 ★ · {counts[4]}</button>
        <button type="button" className={`seg-control-btn ${filter === '3' ? 'active' : ''}`} onClick={() => setFilter('3')}>3 ★ · {counts[3]}</button>
        <button type="button" className={`seg-control-btn ${filter === 'less' ? 'active' : ''}`} onClick={() => setFilter('less')}>1-2 ★ · {counts.less}</button>
      </div>

      <div className="card dash-card">
        {filtered.length > 0 ? (
          <div className="reviews-list reviews-list--big">
            {filtered.map((r: any) => (
              <div key={r.id} className="review-row review-row--big">
                <span className="coach-portrait coach-portrait--sm"><span>?</span></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="review-rating">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <IconStar key={i} size={14} color={i < (r.rating || 0) ? '#f6c463' : 'rgba(123, 139, 165, 0.30)'} />
                    ))}
                    <span className="text-muted" style={{ fontSize: '0.78rem', marginLeft: 6 }}>
                      Сессия #{r.training_session_id} · {new Date(r.created_at).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  {r.comment && <div className="review-comment">{r.comment}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="По фильтру отзывов нет"
            description={reviews.length === 0
              ? 'После каждой сессии ученик сможет оставить оценку и комментарий.'
              : 'Попробуйте сменить фильтр — на других звёздах есть отзывы.'}
            compact />
        )}
      </div>
    </div>
  );
}
