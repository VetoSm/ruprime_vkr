import { useState } from 'react';

/* ===== Rank Badge: иконка медали + название ===== */

const RANK_DATA: Record<number, { name: string; color: string }> = {
  1: { name: 'Herald', color: 'var(--rank-herald)' },
  2: { name: 'Guardian', color: 'var(--rank-guardian)' },
  3: { name: 'Crusader', color: 'var(--rank-crusader)' },
  4: { name: 'Archon', color: 'var(--rank-archon)' },
  5: { name: 'Legend', color: 'var(--rank-legend)' },
  6: { name: 'Ancient', color: 'var(--rank-ancient)' },
  7: { name: 'Divine', color: 'var(--rank-divine)' },
  8: { name: 'Immortal', color: 'var(--rank-immortal)' },
};

const RANK_NAMES_RU: Record<string, string> = {
  herald: 'Рекрут', guardian: 'Страж', crusader: 'Рыцарь', archon: 'Герой',
  legend: 'Легенда', ancient: 'Властелин', divine: 'Божество', immortal: 'Титан',
  HERALD: 'Рекрут', GUARDIAN: 'Страж', CRUSADER: 'Рыцарь', ARCHON: 'Герой',
  LEGEND: 'Легенда', ANCIENT: 'Властелин', DIVINE: 'Божество', IMMORTAL: 'Титан',
};

interface RankBadgeProps {
  rankTier?: number | null;
  rankName?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function RankBadge({ rankTier, rankName, size = 'md' }: RankBadgeProps) {
  let medal = 0;
  let stars = 0;

  if (rankTier && rankTier > 0) {
    medal = Math.floor(rankTier / 10);
    stars = rankTier % 10;
  } else if (rankName) {
    const upper = rankName.toUpperCase().split(' ')[0].split('[')[0].trim();
    const idx = Object.entries(RANK_DATA).find(([_, v]) => v.name.toUpperCase() === upper);
    if (idx) medal = parseInt(idx[0]);
    const starMatch = rankName.match(/\[(\d)\]/);
    if (starMatch) stars = parseInt(starMatch[1]);
  }

  const info = RANK_DATA[medal];
  if (!info) return <span className="badge badge-accent">{rankName || 'Без ранга'}</span>;

  const iconUrl = `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/rank_icons/rank_icon_${medal}.png`;
  const sizes = { sm: 20, md: 28, lg: 40 };
  const fontSize = { sm: '0.75rem', md: '0.85rem', lg: '1rem' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 20,
      border: `1px solid ${info.color}40`,
      background: `${info.color}10`,
      fontSize: fontSize[size], fontWeight: 700, color: info.color,
    }}>
      <img src={iconUrl} alt={info.name} style={{ width: sizes[size], height: sizes[size] }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      {info.name}{stars > 0 ? ` [${stars}]` : ''}
    </span>
  );
}


/* ===== Hero Icon + Name ===== */

const HERO_CDN = 'https://cdn.opendota.com/apps/dota2/images/heroes';

interface HeroIconProps {
  heroId: number;
  heroName?: string;
  size?: number;
  showName?: boolean;
}

export function HeroIcon({ heroId, heroName, size = 28, showName = true }: HeroIconProps) {
  const name = heroName || `Hero #${heroId}`;
  const slug = heroName?.replace('npc_dota_hero_', '') || '';
  const imgUrl = slug ? `${HERO_CDN}/${slug}_sb.png` : '';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {imgUrl && (
        <img src={imgUrl} alt={name} style={{ width: size, height: size, borderRadius: 4 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      {showName && <span style={{ fontSize: '0.85rem' }}>{name}</span>}
    </span>
  );
}


/* ===== Role Badge ===== */

function RoleIconSvg({ type, color, size = 12 }: { type: string; color: string; size?: number }) {
  const s = { width: size, height: size, flexShrink: 0 } as const;
  switch (type) {
    case 'carry': return (
      <svg style={s} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <line x1="2" y1="14" x2="14" y2="2" /><polyline points="8,2 14,2 14,8" />
      </svg>
    );
    case 'mid': return (
      <svg style={s} viewBox="0 0 16 16" fill={color} stroke="none">
        <polygon points="8,1 10,6 8,5 6,6" /><polygon points="8,15 6,10 8,11 10,10" />
        <rect x="7" y="5" width="2" height="6" rx="1" />
      </svg>
    );
    case 'off': return (
      <svg style={s} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2L2 6v5l6 4 6-4V6z" />
      </svg>
    );
    case 'sup4': return (
      <svg style={s} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" /><line x1="8" y1="1" x2="8" y2="4" /><line x1="8" y1="12" x2="8" y2="15" />
        <line x1="1" y1="8" x2="4" y2="8" /><line x1="12" y1="8" x2="15" y2="8" />
      </svg>
    );
    case 'sup5': return (
      <svg style={s} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <line x1="8" y1="2" x2="8" y2="14" /><line x1="2" y1="8" x2="14" y2="8" />
      </svg>
    );
    default: return null;
  }
}

const ROLE_INFO: Record<string, { name: string; short: string; svgType: string; color: string }> = {
  POS1: { name: 'Carry', short: 'Carry', svgType: 'carry', color: '#ff8c00' },
  POS2: { name: 'Mid', short: 'Mid', svgType: 'mid', color: '#ffd700' },
  POS3: { name: 'Offlane', short: 'Off', svgType: 'off', color: '#ff4757' },
  POS4: { name: 'Soft Support', short: 'Sup4', svgType: 'sup4', color: '#7c5cfc' },
  POS5: { name: 'Hard Support', short: 'Sup5', svgType: 'sup5', color: '#00d4aa' },
  '1': { name: 'Carry', short: 'Carry', svgType: 'carry', color: '#ff8c00' },
  '2': { name: 'Mid', short: 'Mid', svgType: 'mid', color: '#ffd700' },
  '3': { name: 'Offlane', short: 'Off', svgType: 'off', color: '#ff4757' },
  '4': { name: 'Soft Support', short: 'Sup4', svgType: 'sup4', color: '#7c5cfc' },
};

interface RoleBadgeProps {
  role: string | number;
  compact?: boolean;
}

export function RoleBadge({ role, compact = false }: RoleBadgeProps) {
  const key = typeof role === 'number' ? String(role) : role;
  const info = ROLE_INFO[key] || ROLE_INFO[`POS${key}`];
  if (!info) return <span className="badge badge-accent">{role}</span>;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      border: `1px solid ${info.color}40`,
      background: `${info.color}10`,
      fontSize: '0.75rem', fontWeight: 700, color: info.color,
    }}>
      <RoleIconSvg type={info.svgType} color={info.color} />
      {compact ? info.short : info.name}
    </span>
  );
}


/* ===== Info Tooltip ===== */

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        className="info-icon"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >i</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 8, padding: '10px 14px', borderRadius: 'var(--radius)',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
          color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5,
          width: 240, zIndex: 100, boxShadow: 'var(--shadow)',
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}
