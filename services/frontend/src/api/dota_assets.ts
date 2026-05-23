/**
 * Реестр и helper'ы для всех Dota-ассетов на фронте.
 *
 * Источники:
 * - OpenDota CDN — иконки героев (square, small_bordered)
 * - Valve CDN (steamstatic) — портреты, рендеры, иконки рангов, предметов, способностей
 * - Steam avatars приходят как готовые URL от OpenDota
 *
 * Правило:
 * - Hero ICON (`sb`) — для списков, KDA, hero pool chips (28-32px)
 * - Hero PORTRAIT — для карточек тренеров и игроков (88-120px)
 * - Hero VERT — для hero-details страниц (если появятся)
 * - Hero RENDER — для декоративных фонов (auth, 404, dashboard corner)
 *
 * @see docs/design/REPLACEMENTS.md §16
 * @see docs/design/TOOLKIT.md §1.5 / §1.6
 */

import { getHero } from './heroes';

/* ============================================================
 * Hero assets
 * ============================================================ */

const OPENDOTA_HEROES_CDN = 'https://cdn.opendota.com/apps/dota2/images/heroes';
const VALVE_HEROES_DOTA_REACT = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';
const VALVE_HEROES_LEGACY = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes';

export type HeroAssetVariant =
  | 'sb'        // small bordered — для списков, KDA, hero pool (≤32px)
  | 'portrait'  // квадратный портрет — для карточек (≥64px), Valve dota_react CDN
  | 'vert'      // вертикальный портрет 234×272 — для hero-details и декоративных фонов
  | 'full'      // большой landscape ~230×125 — для card-banner'ов
  | 'lg'        // расширенный landscape ~600×316
  | 'render';   // alias к `vert` (исторически — full body render; Valve больше не отдаёт renders/, используем vert как самый "ростовой" из доступных)

/**
 * Вернуть URL изображения героя нужного варианта.
 *
 * Все варианты проверены — отдают 200 OK.
 *
 * @example
 *   heroAsset('invoker', 'vert')     // → invoker_vert.jpg (вертикальный портрет, для фонов)
 *   heroAsset('invoker', 'sb')       // → invoker_sb.png  (28px иконка)
 *   heroAsset('invoker', 'portrait') // → dota_react .png
 */
export function heroAsset(idOrSlug: number | string, variant: HeroAssetVariant = 'sb'): string {
  let slug: string | null = null;

  if (typeof idOrSlug === 'string') {
    slug = idOrSlug.replace('npc_dota_hero_', '');
  } else {
    const h = getHero(idOrSlug);
    if (h?.name) slug = h.name.replace('npc_dota_hero_', '');
  }

  if (!slug) return '';

  switch (variant) {
    case 'sb':
      return `${OPENDOTA_HEROES_CDN}/${slug}_sb.png`;
    case 'portrait':
      return `${VALVE_HEROES_DOTA_REACT}/${slug}.png`;
    case 'vert':
    case 'render':
      return `${VALVE_HEROES_LEGACY}/${slug}_vert.jpg`;
    case 'full':
      return `${VALVE_HEROES_LEGACY}/${slug}_full.png`;
    case 'lg':
      return `${VALVE_HEROES_LEGACY}/${slug}_lg.png`;
    default:
      return '';
  }
}

/* ============================================================
 * Item / Ability assets
 * ============================================================ */

const VALVE_ITEMS_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items';
const VALVE_ABILITIES_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities';

/**
 * Иконка предмета. Имя — без префикса `item_`.
 *
 * @example
 *   itemIcon('blink')           // blink dagger
 *   itemIcon('black_king_bar')  // BKB
 */
export function itemIcon(itemName: string): string {
  const name = itemName.replace(/^item_/, '');
  return `${VALVE_ITEMS_CDN}/${name}.png`;
}

/**
 * Иконка способности. Имя — full ability key (например `invoker_chaos_meteor`).
 */
export function abilityIcon(abilityName: string): string {
  return `${VALVE_ABILITIES_CDN}/${abilityName}.png`;
}

/* ============================================================
 * Rank icon (медаль)
 * ============================================================ */

const VALVE_RANK_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/rank_icons';

/**
 * Иконка ранг-медали по `rank_tier` (от OpenDota) — например 75 → Divine.
 *
 * @example
 *   rankIcon(75)  // Divine medal (medal=7, stars=5 — звёзды надо отрисовывать поверх)
 *   rankIcon(8)   // Immortal без звёзд
 */
export function rankIcon(rankTier: number | null | undefined): string {
  if (!rankTier || rankTier <= 0) return '';
  const medal = Math.floor(rankTier / 10);
  if (medal < 1 || medal > 8) return '';
  return `${VALVE_RANK_CDN}/rank_icon_${medal}.png`;
}

/* ============================================================
 * Steam avatar
 * ============================================================ */

/**
 * Pass-through для Steam avatar URL.
 *
 * Можно использовать как точку расширения если потребуется
 * проксирование или upscaling. Сейчас просто возвращает URL.
 *
 * Источники avatar_url:
 *  - `summary.avatar_url` из GET /player/{id}/stats/overview
 *  - `acc.avatar_url` из GET /player/steam-data
 *  - `data.avatar_url` из POST /player/link-steam
 */
export function steamAvatar(url: string | null | undefined): string {
  if (!url) return '';
  return url;
}

/* ============================================================
 * Декоративные ассеты
 * ============================================================
 *
 * Используются как фоновые украшения на страницах. Все — hero
 * renders с Valve CDN с opacity ≤ 0.25 + blur(4px) (см. theme.css).
 *
 * Не привязаны к пользовательским данным — это «искусство», а не аватары.
 */

/** Семантические пресеты декораций для страниц. */
export const DECORATIVE_HEROES = {
  /** Auth (Login/Register): magic-силуэты по краям. */
  auth: {
    left: { slug: 'invoker', alt: 'Invoker — символ AI-аналитики' },
    right: { slug: 'lina', alt: 'Lina — пламя побед' },
  },

  /** 404 NotFound: одинокий силуэт по центру. */
  notfound: {
    center: { slug: 'vengefulspirit', alt: 'Ушла в фонтан' },
  },

  /** Dashboard / AppLayout: персонаж в нижнем-левом углу sidebar'а (как на мокапе). */
  dashboardCorner: {
    slug: 'invoker',
    alt: '',
  },

  /** Coach Landing — арт между двумя секциями. */
  coachLanding: {
    left:  { slug: 'rubick',  alt: 'Rubick — мастер копирования стиля' },
    right: { slug: 'oracle',  alt: 'Oracle — предвидение результата' },
  },

  /** Landing: декорация под mockup-превью. Не используется явно — превью самодостаточно. */
  landing: null,
} as const;

/**
 * Получить готовый URL декоративного hero render по семантическому ключу.
 *
 * @example
 *   decorRender('auth.left')    // invoker render
 *   decorRender('dashboardCorner') // invoker render
 */
export function decorRender(
  key:
    | 'auth.left' | 'auth.right'
    | 'notfound.center'
    | 'dashboardCorner'
    | 'coachLanding.left' | 'coachLanding.right'
): string {
  const path = key.split('.');
  let node: any = DECORATIVE_HEROES;
  for (const p of path) {
    if (node == null) return '';
    node = node[p];
  }
  const slug = node?.slug;
  return slug ? heroAsset(slug, 'render') : '';
}

/* ============================================================
 * Утилиты
 * ============================================================ */

/**
 * Безопасный onError handler для <img>: прячет картинку при ошибке загрузки.
 * Использовать вместе с CSS-фолбэком (initials, gradient placeholder).
 */
export function imgFallbackHide(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.target as HTMLImageElement).style.display = 'none';
}
