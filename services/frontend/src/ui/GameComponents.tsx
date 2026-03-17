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

const ROLE_INFO: Record<string, { name: string; short: string; icon: string; color: string }> = {
  POS1: { name: 'Carry', short: 'Carry', icon: '⚔', color: '#ff8c00' },
  POS2: { name: 'Mid', short: 'Mid', icon: '⚡', color: '#ffd700' },
  POS3: { name: 'Offlane', short: 'Off', icon: '🛡', color: '#ff4757' },
  POS4: { name: 'Soft Support', short: 'Sup4', icon: '✦', color: '#7c5cfc' },
  POS5: { name: 'Hard Support', short: 'Sup5', icon: '✚', color: '#00d4aa' },
  '1': { name: 'Carry', short: 'Carry', icon: '⚔', color: '#ff8c00' },
  '2': { name: 'Mid', short: 'Mid', icon: '⚡', color: '#ffd700' },
  '3': { name: 'Offlane', short: 'Off', icon: '🛡', color: '#ff4757' },
  '4': { name: 'Soft Support', short: 'Sup4', icon: '✦', color: '#7c5cfc' },
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
      <span>{info.icon}</span>
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
