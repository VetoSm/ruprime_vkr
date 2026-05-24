import { coreApi } from './client';

export interface HeroInfo {
  hero_id: number;
  name: string;
  localized_name: string;
  primary_attr: string;
  attack_type: string;
  img: string;
}

let heroCache: Record<number, HeroInfo> = {};
let loaded = false;

export async function loadHeroes(): Promise<Record<number, HeroInfo>> {
  if (loaded) return heroCache;
  try {
    const res = await coreApi.get('/ml/heroes');
    for (const h of res.data) {
      heroCache[h.hero_id] = h;
    }
    loaded = true;
  } catch {}
  return heroCache;
}

export function getHero(heroId: number): HeroInfo | undefined {
  return heroCache[heroId];
}

export function heroName(heroId: number): string {
  const h = heroCache[heroId];
  if (h?.localized_name) return h.localized_name;
  return `Hero #${heroId}`;
}

const VALVE_CDN = 'https://cdn.cloudflare.steamstatic.com';

export function heroIcon(heroId: number, _size: number = 28): string {
  const h = heroCache[heroId];
  if (!h) return '';
  // The constants endpoint already gives us the canonical Valve path
  // (e.g. `/apps/dota2/images/dota_react/heroes/life_stealer.png?`). It's
  // strictly more accurate than reconstructing OpenDota slugs ourselves —
  // OpenDota normalises `life_stealer` to `lifestealer` and a few other
  // heroes break the same way, which is why icons were missing on the
  // dashboard. Trim the trailing cache-buster query and prefix the CDN.
  if (h.img) {
    return `${VALVE_CDN}${h.img.replace(/\?.*$/, '')}`;
  }
  if (h.name) {
    // Defensive fallback: same slug path we used before, with the cleaned
    // Valve CDN so the dota_react file naming wins.
    const slug = h.name.replace('npc_dota_hero_', '');
    return `${VALVE_CDN}/apps/dota2/images/dota_react/heroes/${slug}.png`;
  }
  return '';
}

const RANK_NAMES_EN: Record<number, string> = {
  1: 'Herald', 2: 'Guardian', 3: 'Crusader', 4: 'Archon',
  5: 'Legend', 6: 'Ancient', 7: 'Divine', 8: 'Immortal',
};

/**
 * Render a Dota rank_tier as a clean medal name without the "[stars]" suffix.
 * The star count is conveyed visually by the medal icon (Valve renders the
 * stars inside the medal), so duplicating the number in text was redundant
 * everywhere it appeared.
 */
export function rankTierToName(rt: number | null | undefined): string {
  if (!rt || rt <= 0) return 'Без ранга';
  const medal = Math.floor(rt / 10);
  return RANK_NAMES_EN[medal] || '—';
}

/**
 * URL of the medal icon for the given rank_tier (or 0 if no rank).
 * Returns "" when we don't have a medal for this tier, so callers can
 * gate the `<img>` render on truthy.
 */
export function rankMedalIcon(rt: number | null | undefined): string {
  if (!rt || rt <= 0) return '';
  const medal = Math.floor(rt / 10);
  if (medal < 1 || medal > 8) return '';
  const colors: Record<number, string> = {
    1: '#8b8b8b', 2: '#b0c4de', 3: '#90ee90', 4: '#f0e68c',
    5: '#ffd700', 6: '#ff8c00', 7: '#ff69b4', 8: '#ff4444',
  };
  const label = medal === 8 ? 'I' : String(medal);
  const color = colors[medal] || '#16e9d4';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><radialGradient id="g" cx="50%" cy="35%" r="70%"><stop offset="0%" stop-color="#fff7d6"/><stop offset="45%" stop-color="${color}"/><stop offset="100%" stop-color="#4b1020"/></radialGradient></defs><path d="M48 6 76 18 88 46 72 78 48 90 24 78 8 46 20 18Z" fill="url(#g)" stroke="#ffdca8" stroke-width="4"/><path d="M48 15 69 24 78 46 66 69 48 78 30 69 18 46 27 24Z" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="3"/><text x="48" y="59" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="900" fill="#fff" stroke="#35121c" stroke-width="2">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function roleName(role: number | string): string {
  const map: Record<string, string> = {
    '1': 'Carry', '2': 'Mid', '3': 'Offlane', '4': 'Soft Support', '5': 'Hard Support',
    'POS1': 'Carry', 'POS2': 'Mid', 'POS3': 'Offlane', 'POS4': 'Soft Support', 'POS5': 'Hard Support',
  };
  return map[String(role)] || String(role);
}
