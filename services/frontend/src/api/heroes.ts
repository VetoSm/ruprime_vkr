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

export function heroIcon(heroId: number, size: number = 28): string {
  const h = heroCache[heroId];
  if (h?.name) {
    const slug = h.name.replace('npc_dota_hero_', '');
    return `https://cdn.opendota.com/apps/dota2/images/heroes/${slug}_sb.png`;
  }
  return '';
}

export function rankTierToName(rt: number | null | undefined): string {
  if (!rt || rt <= 0) return 'Без ранга';
  const medal = Math.floor(rt / 10);
  const stars = rt % 10;
  const names: Record<number, string> = {
    1: 'Herald', 2: 'Guardian', 3: 'Crusader', 4: 'Archon',
    5: 'Legend', 6: 'Ancient', 7: 'Divine', 8: 'Immortal',
  };
  return `${names[medal] || '?'} [${stars}]`;
}

export function roleName(role: number | string): string {
  const map: Record<string, string> = {
    '1': 'Carry', '2': 'Mid', '3': 'Offlane', '4': 'Soft Support', '5': 'Hard Support',
    'POS1': 'Carry', 'POS2': 'Mid', 'POS3': 'Offlane', 'POS4': 'Soft Support', 'POS5': 'Hard Support',
  };
  return map[String(role)] || String(role);
}
