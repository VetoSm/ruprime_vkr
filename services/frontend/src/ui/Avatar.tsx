import { useEffect, useState } from 'react';
import { coreApi } from '../api/client';
import { imgFallbackHide } from '../api/dota_assets';

interface AvatarProps {
  src?: string | null;
  fallbackText: string;
  size?: number;
  variant?: 'default' | 'player' | 'coach' | 'student' | 'placeholder';
  rankOverlay?: React.ReactNode;
  className?: string;
}

/**
 * Универсальный аватар с поддержкой Steam avatar URL и фолбэка на инициалы.
 *
 * При ошибке загрузки картинки автоматически показывает initials поверх
 * cyan-violet gradient круга.
 */
export function Avatar({ src, fallbackText, size = 48, variant = 'default', rankOverlay, className }: AvatarProps) {
  const initials = fallbackText
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const borderColor =
    variant === 'coach'   ? 'rgba(125, 94, 255, 0.55)' :
    variant === 'student' ? 'rgba(22, 233, 212, 0.4)' :
    'rgba(22, 233, 212, 0.55)';

  return (
    <span
      className={`avatar ${className || ''}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(125,94,255,0.35), rgba(22,233,212,0.35))',
        border: `1.5px solid ${borderColor}`,
        color: '#e8edf5',
        fontWeight: 800,
        fontSize: Math.max(10, Math.floor(size * 0.38)),
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: variant === 'placeholder' ? 'none' : '0 0 16px rgba(22,233,212,0.18)',
      }}
      aria-label={fallbackText}
    >
      {src ? (
        <img
          src={src}
          alt={fallbackText}
          onError={imgFallbackHide}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : null}
      <span style={{ position: 'relative', zIndex: 1, opacity: src ? 0 : 1 }}>{initials}</span>
      {rankOverlay && (
        <span style={{
          position: 'absolute',
          bottom: -4,
          right: -4,
          zIndex: 2,
          transform: 'scale(0.7)',
          transformOrigin: 'bottom right',
        }}>
          {rankOverlay}
        </span>
      )}
    </span>
  );
}

/* ============================================================
 * Hook + component for coach avatar (по coachProfileId)
 * Тянет dota_account_id из /coaches list (если был preloaded) или из /coach/{id}/public
 * и потом /ml/player-account/{aid} → avatar_url.
 * Мини-кеш в модуле, чтобы не делать N запросов на каталог.
 * ============================================================ */

const coachAvatarCache: Record<number, { url: string | null; ts: number }> = {};
const COACH_AVATAR_TTL = 60 * 60 * 1000; // 1h

async function fetchCoachAvatar(dotaAccountId: string | null | undefined): Promise<string | null> {
  if (!dotaAccountId) return null;
  try {
    const res = await coreApi.get(`/ml/player-account/${dotaAccountId}`);
    return (res.data?.avatar_url as string) || null;
  } catch {
    return null;
  }
}

export function useCoachAvatar(coachProfileId: number | null | undefined, dotaAccountId?: string | null) {
  const [url, setUrl] = useState<string | null>(() => {
    if (!coachProfileId) return null;
    const c = coachAvatarCache[coachProfileId];
    return c && Date.now() - c.ts < COACH_AVATAR_TTL ? c.url : null;
  });

  useEffect(() => {
    if (!coachProfileId || !dotaAccountId) return;
    const cached = coachAvatarCache[coachProfileId];
    if (cached && Date.now() - cached.ts < COACH_AVATAR_TTL) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    fetchCoachAvatar(dotaAccountId).then(u => {
      if (cancelled) return;
      coachAvatarCache[coachProfileId] = { url: u, ts: Date.now() };
      setUrl(u);
    });
    return () => { cancelled = true; };
  }, [coachProfileId, dotaAccountId]);

  return url;
}

interface CoachAvatarProps {
  coachProfileId: number | null | undefined;
  dotaAccountId?: string | null;
  fallbackName: string;
  size?: number;
  rankOverlay?: React.ReactNode;
}

export function CoachAvatar({ coachProfileId, dotaAccountId, fallbackName, size, rankOverlay }: CoachAvatarProps) {
  const url = useCoachAvatar(coachProfileId, dotaAccountId);
  return <Avatar src={url} fallbackText={fallbackName} size={size} variant="coach" rankOverlay={rankOverlay} />;
}

interface PlayerAvatarProps {
  playerProfileId?: number | null;
  dotaAccountId?: string | null;
  src?: string | null;
  fallbackName: string;
  size?: number;
  rankOverlay?: React.ReactNode;
}

export function PlayerAvatar({ src, dotaAccountId, fallbackName, size, rankOverlay }: PlayerAvatarProps) {
  // Если уже знаем avatar_url напрямую (например, из summary) — используем сразу.
  // Иначе тянем через dota_account_id.
  const [url, setUrl] = useState<string | null>(src || null);

  useEffect(() => {
    if (src) { setUrl(src); return; }
    if (!dotaAccountId) return;
    let cancelled = false;
    fetchCoachAvatar(dotaAccountId).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [src, dotaAccountId]);

  return <Avatar src={url} fallbackText={fallbackName} size={size} variant="student" rankOverlay={rankOverlay} />;
}
