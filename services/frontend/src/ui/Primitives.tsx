import { ReactNode } from 'react';

/* ============================================================
 * Brand Logo — wordmark RuPrime в стиле сайдбара,
 * italic bold с cyan-glow, без декоративных символов сверху.
 * Используется в auth-карточках.
 * ============================================================ */

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  align?: 'center' | 'left';
}

export function BrandLogo({ size = 'lg', align = 'center' }: BrandLogoProps) {
  const cfg = size === 'lg'
    ? { font: '2.2rem', mb: 22 }
    : size === 'md'
      ? { font: '1.55rem', mb: 14 }
      : { font: '1.1rem',  mb: 8  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: align === 'center' ? 'center' : 'flex-start',
      marginBottom: cfg.mb,
      lineHeight: 1,
    }}>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontStyle: 'italic',
          fontSize: cfg.font,
          letterSpacing: '-1.5px',
          background: 'linear-gradient(135deg, var(--accent-bright) 0%, var(--accent) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          userSelect: 'none',
        }}
      >
        RuPrime
      </span>
    </div>
  );
}

/* ============================================================
 * Oracle Orb — декоративный AI-аватар (purple → cyan gradient)
 * ============================================================ */

interface OracleOrbProps {
  size?: number;
  className?: string;
}

export function OracleOrb({ size = 32, className }: OracleOrbProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #4df7e5 0%, #7d5eff 50%, #1a0d4d 100%)',
        boxShadow: '0 0 18px rgba(125, 94, 255, 0.45), inset 0 0 12px rgba(255,255,255,0.18)',
        flexShrink: 0,
      }}
      aria-hidden
    >
      <span style={{
        width: '40%',
        height: '40%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)',
        marginTop: '-30%',
        marginLeft: '-15%',
      }} />
    </span>
  );
}

/* ============================================================
 * Oracle Hint — карточка-подсказка от AI с переходом в /ai-chat
 * ============================================================ */

interface OracleHintProps {
  text: string;
  value?: string;
  compact?: boolean;
  onClick?: () => void;
}

export function OracleHint({ text, value, compact, onClick }: OracleHintProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: compact ? 'center' : 'flex-start',
        gap: 10,
        padding: compact ? '8px 10px' : '12px 14px',
        background: 'rgba(125, 94, 255, 0.06)',
        border: '1px solid rgba(125, 94, 255, 0.25)',
        borderRadius: 'var(--radius-lg)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--transition)',
        marginBottom: 8,
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = 'rgba(125, 94, 255, 0.12)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.background = 'rgba(125, 94, 255, 0.06)')}
    >
      <OracleOrb size={compact ? 24 : 32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: 'var(--text-primary)',
          fontSize: compact ? '0.82rem' : '0.9rem',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: compact ? 2 : 3,
          WebkitBoxOrient: 'vertical',
        }}>
          {text}
        </div>
        {value && (
          <div style={{ color: 'var(--accent-bright)', fontSize: '0.78rem', marginTop: 4, fontWeight: 700 }}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Empty State — иконка + заголовок + опц. описание + CTA
 * ============================================================ */

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, cta, compact }: EmptyStateProps) {
  return (
    <div className="empty-state" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10,
      padding: compact ? '20px 16px' : '40px 24px',
      border: '1px dashed rgba(22, 233, 212, 0.28)',
      borderRadius: 'var(--radius-lg)',
      background: 'radial-gradient(360px 140px at 50% 0%, rgba(22, 233, 212, 0.06), transparent 70%)',
      textAlign: 'center',
    }}>
      {icon && <div style={{ fontSize: compact ? '1.5rem' : '2.2rem', opacity: 0.7 }}>{icon}</div>}
      <h3 style={{
        fontSize: compact ? '0.95rem' : '1.1rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        margin: 0,
      }}>{title}</h3>
      {description && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, maxWidth: 400 }}>
          {description}
        </p>
      )}
      {cta && <div style={{ marginTop: 6 }}>{cta}</div>}
    </div>
  );
}

/* ============================================================
 * Skeleton Card — серый placeholder с pulse animation
 * ============================================================ */

interface SkeletonCardProps {
  height?: number | string;
  rounded?: boolean;
}

export function SkeletonCard({ height = 120, rounded = true }: SkeletonCardProps) {
  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(24, 53, 99, 0.4) 0%, rgba(24, 53, 99, 0.6) 50%, rgba(24, 53, 99, 0.4) 100%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
      borderRadius: rounded ? 'var(--radius-lg)' : 0,
      height,
      width: '100%',
    }} />
  );
}

/* ============================================================
 * Progress Ring — кольцо с процентом внутри
 * ============================================================ */

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  thickness?: number;
  label?: string;
  sublabel?: string;
  color?: string;
}

export function ProgressRing({ value, size = 88, thickness = 8, label, sublabel, color = 'var(--accent)' }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} stroke="var(--bg-card)" strokeWidth={thickness} fill="none" />
          <circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth={thickness} fill="none"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)', filter: 'drop-shadow(0 0 6px rgba(22,233,212,0.4))' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <strong style={{ fontSize: size > 80 ? '1.4rem' : '1rem', color: 'var(--accent-bright)', lineHeight: 1 }}>
            {label || `${clamped.toFixed(0)}%`}
          </strong>
          {sublabel && <small style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>{sublabel}</small>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Badge (pill) — небольшой шильдик
 * ============================================================ */

interface BadgeProps {
  children: ReactNode;
  tone?: 'cyan' | 'purple' | 'warning' | 'danger' | 'success' | 'muted';
  icon?: ReactNode;
}

const BADGE_COLORS = {
  cyan:    { bg: 'rgba(22, 233, 212, 0.1)',  border: 'rgba(22, 233, 212, 0.4)',  text: 'var(--accent)' },
  purple:  { bg: 'rgba(125, 94, 255, 0.12)', border: 'rgba(125, 94, 255, 0.4)',  text: 'var(--purple)' },
  warning: { bg: 'rgba(255, 165, 2, 0.1)',   border: 'rgba(255, 165, 2, 0.4)',   text: 'var(--warning)' },
  danger:  { bg: 'rgba(255, 71, 87, 0.1)',   border: 'rgba(255, 71, 87, 0.4)',   text: 'var(--danger)' },
  success: { bg: 'rgba(0, 212, 170, 0.1)',   border: 'rgba(0, 212, 170, 0.4)',   text: 'var(--success)' },
  muted:   { bg: 'rgba(123, 139, 165, 0.1)', border: 'rgba(123, 139, 165, 0.3)', text: 'var(--text-secondary)' },
};

export function Badge({ children, tone = 'cyan', icon }: BadgeProps) {
  const c = BADGE_COLORS[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 999,
      fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.3px',
      color: c.text, background: c.bg, border: `1px solid ${c.border}`,
    }}>
      {icon}
      {children}
    </span>
  );
}

/* ============================================================
 * Status Pill — маппинг enum статуса сессии/заявки на цветную pill
 * ============================================================ */

interface StatusPillProps {
  status: string;
  kind?: 'session' | 'request';
  small?: boolean;
}

const SESSION_STATUS_MAP: Record<string, { label: string; tone: BadgeProps['tone'] }> = {
  PLANNED:      { label: 'Подтверждена', tone: 'cyan' },
  COMPLETED:    { label: 'Завершена',    tone: 'success' },
  CANCELLED:    { label: 'Отменена',     tone: 'danger' },
  RESCHEDULED:  { label: 'Перенесена',   tone: 'muted' },
};

const REQUEST_STATUS_MAP: Record<string, { label: string; tone: BadgeProps['tone'] }> = {
  NEW:                  { label: 'Новая',              tone: 'cyan' },
  MATCHING:             { label: 'Подбираем',          tone: 'warning' },
  WAITING_CONFIRMATION: { label: 'Ждёт подтверждения', tone: 'cyan' },
  ACCEPTED:             { label: 'Принята',            tone: 'success' },
  REJECTED:             { label: 'Отклонена',          tone: 'muted' },
  CANCELLED:            { label: 'Отменена',           tone: 'danger' },
};

export function StatusPill({ status, kind = 'session', small }: StatusPillProps) {
  const map = kind === 'session' ? SESSION_STATUS_MAP : REQUEST_STATUS_MAP;
  const info = map[status] || { label: status, tone: 'muted' as const };
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

/* ============================================================
 * Steam Login Button — крупная кнопка с лого Steam
 * ============================================================ */

interface SteamLoginButtonProps {
  variant?: 'primary' | 'outline';
  href?: string;
  onClick?: () => void;
  children?: ReactNode;
  fullWidth?: boolean;
}

const STEAM_LOGO_URL = 'https://store.cloudflare.steamstatic.com/public/shared/images/header/logo_steam.svg';

export function SteamLoginButton({ variant = 'primary', href, onClick, children, fullWidth = true }: SteamLoginButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '12px 24px',
    borderRadius: 'var(--radius)',
    fontWeight: 700,
    fontSize: '0.95rem',
    letterSpacing: '0.3px',
    cursor: 'pointer',
    transition: 'var(--transition)',
    textDecoration: 'none',
    width: fullWidth ? '100%' : undefined,
    border: '1px solid',
  };

  const styleByVariant: React.CSSProperties = variant === 'primary'
    ? {
        background: 'linear-gradient(135deg, #171a21 0%, #1b2838 100%)',
        borderColor: 'rgba(102, 192, 244, 0.55)',
        color: '#fff',
        boxShadow: '0 4px 18px rgba(27, 40, 56, 0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
      }
    : {
        background: 'rgba(5, 16, 36, 0.75)',
        borderColor: 'var(--border-color)',
        color: '#fff',
      };

  // Если children явно === null — рендерим только лого (без подписи).
  // Иначе используем переданный текст или дефолт "Войти через Steam".
  const showLabel = children !== null;
  const label = children || 'Войти через Steam';

  const content = (
    <>
      <img src={STEAM_LOGO_URL} alt="Steam" style={{ height: 18 }} />
      {showLabel && <span>{label}</span>}
    </>
  );

  if (href) {
    return <a href={href} style={{ ...baseStyle, ...styleByVariant }} onClick={onClick}>{content}</a>;
  }
  return <button type="button" style={{ ...baseStyle, ...styleByVariant }} onClick={onClick}>{content}</button>;
}

/* ============================================================
 * Tabs — горизонтальная цыно-подчёркнутая вкладка
 * ============================================================ */

interface TabsProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string; count?: number }>;
}

export function Tabs<T extends string>({ value, onChange, options }: TabsProps<T>) {
  return (
    <div className="tabs">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          className={`tab ${value === opt.id ? 'active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
          {typeof opt.count === 'number' && (
            <span style={{ opacity: 0.65, marginLeft: 6 }}>· {opt.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
 * Pagination — простой 1 ... N
 * ============================================================ */

interface PaginationProps {
  page: number;
  total: number;
  perPage: number;
  onChange: (p: number) => void;
}

export function Pagination({ page, total, perPage, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;

  const showPages: number[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) showPages.push(i);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
      <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {showPages.map((p, idx) => (
        <span key={p}>
          {idx > 0 && showPages[idx-1] !== p - 1 && <span style={{ color: 'var(--text-muted)', padding: '0 6px' }}>...</span>}
          <button
            className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onChange(p)}
            style={{ minWidth: 32 }}
          >
            {p}
          </button>
        </span>
      ))}
      <button className="btn btn-outline btn-sm" disabled={page === pages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  );
}

/* ============================================================
 * Daily Limit Meter — счётчик использования AI запросов
 * ============================================================ */

interface DailyLimitMeterProps {
  used: number;
  total: number;
}

export function DailyLimitMeter({ used, total }: DailyLimitMeterProps) {
  const remaining = Math.max(0, total - used);
  const pct = (used / Math.max(total, 1)) * 100;
  const color = remaining === 0 ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : 'var(--accent)';

  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', gap: 4,
      padding: '8px 14px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      minWidth: 160,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Запросов сегодня</span>
        <span style={{ color, fontWeight: 700 }}>{used} / {total}</span>
      </div>
      <div style={{
        height: 4,
        background: 'var(--bg-input)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 0.4s',
        }} />
      </div>
    </div>
  );
}
