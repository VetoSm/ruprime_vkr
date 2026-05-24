import { useEffect, useState } from 'react';
import { coreApi } from '../api/client';

interface ParseProgress {
  linked: boolean;
  window?: number;
  matches_loaded?: number;
  parsed?: number;
  in_progress?: number;
  unavailable?: number;
  error?: string;
}

interface Props {
  /** Refresh interval in ms. Defaults to 60s — match count is slow to
   *  change so we don't need to ping more often. */
  refreshMs?: number;
  /** ``true`` renders a tiny pill that fits next to a button. Otherwise
   *  a one-line note for above-content placement. */
  compact?: boolean;
}

/**
 * One-liner status: «Загружено 187 матчей» — and a tooltip with the
 * breakdown for users who want to know more. We intentionally hide the
 * parsing progress here because:
 *   - matches_loaded changes rarely (once per sync),
 *   - parsed grows slowly in background and was distracting in tests,
 *   - product decision (PR-2 follow-up): trust the user, hide internals.
 */
export default function ParseProgressBadge({ refreshMs = 60000, compact = false }: Props) {
  const [data, setData] = useState<ParseProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      coreApi.get('/player/parse-progress')
        .then((r) => { if (!cancelled) setData(r.data); })
        .catch(() => { /* silent — badge is best-effort UX */ });
    };
    tick();
    const id = window.setInterval(tick, refreshMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [refreshMs]);

  if (!data || !data.linked || data.error) return null;
  const loaded = data.matches_loaded ?? 0;
  if (loaded === 0) return null;

  const parsed = data.parsed ?? 0;
  const inProgress = data.in_progress ?? 0;
  const unavailable = data.unavailable ?? 0;

  const tooltipLines = [
    `${loaded} матчей в базе`,
    parsed > 0 && `Полный разбор готов: ${parsed}`,
    inProgress > 0 && `В обработке: ${inProgress}`,
    unavailable > 0 && `Не удалось получить replay: ${unavailable}`,
  ].filter(Boolean).join('\n');

  if (compact) {
    return (
      <span
        className="badge"
        title={tooltipLines}
        style={{ background: 'var(--accent-soft, #2a3550)', color: 'var(--text-muted, #b6c1d6)' }}
      >
        Загружено {loaded} матчей
      </span>
    );
  }

  return (
    <div
      className="text-muted"
      style={{ fontSize: '0.85rem' }}
      title={tooltipLines}
    >
      Загружено <strong style={{ color: 'var(--text)' }}>{loaded}</strong>{' '}
      последних матчей
      {inProgress > 0 && (
        <span style={{ marginLeft: 8 }}>
          (часть ещё обрабатывается)
        </span>
      )}
    </div>
  );
}
