import { Link } from 'react-router-dom';
import { OracleOrb } from '../ui/Primitives';
import { decorRender } from '../api/dota_assets';

const ORACLE_QUOTES = [
  'Не форси без союзников. Жди роту.',
  'Лучший вард — тот, что не нашли.',
  'Хорошая мысль: купи бкб.',
  'Карта была. Возможно, ты её не смотрел.',
  'В этой ситуации ластхит — это ты.',
  'Tier-1 — это не цель, а побочка дисциплины.',
];

function randomQuote() {
  return ORACLE_QUOTES[Math.floor(Math.random() * ORACLE_QUOTES.length)];
}

export default function NotFound() {
  return (
    <div className="notfound-page">
      <div
        className="page-decor page-decor--notfound"
        aria-hidden
        style={{ backgroundImage: `url(${decorRender('notfound.center')})` }}
      />

      <div className="notfound-content">
        <h1 className="notfound-404">404</h1>
        <h2 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.6rem', marginBottom: 8 }}>
          Эта страница ушла в фонтан
        </h2>
        <p className="text-muted" style={{ marginBottom: 28, maxWidth: 460, margin: '0 auto 28px' }}>
          Кажется, ты заглянул в туман войны. Давай вернёмся на базу.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          <Link to="/" className="btn btn-primary">→ На главную</Link>
          <Link to="/coaches" className="btn btn-outline">К списку тренеров</Link>
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          background: 'rgba(125, 94, 255, 0.08)',
          border: '1px dashed rgba(125, 94, 255, 0.4)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'left',
        }}>
          <OracleOrb size={40} />
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--purple)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 4 }}>
              СОВЕТ ОТ ОРАКУЛА
            </div>
            <blockquote style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              «{randomQuote()}»
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}
