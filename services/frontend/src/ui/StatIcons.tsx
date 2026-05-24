/* Outline-иконки для stat-плиток дашборда и аналитики.
 * Только stroke, цвет берётся из currentColor через .stat-tile-icon { color: ... }. */

export function IconCoinsOutline() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g>
        <ellipse cx="11" cy="11" rx="7" ry="2.2" />
        <path d="M4,11 L4,30 a7,2.2 0 0 0 14,0 L18,11" />
        <path d="M4,14 a7,2.2 0 0 0 14,0" />
        <path d="M4,17 a7,2.2 0 0 0 14,0" />
        <path d="M4,20 a7,2.2 0 0 0 14,0" />
        <path d="M4,23 a7,2.2 0 0 0 14,0" />
        <path d="M4,26 a7,2.2 0 0 0 14,0" />
      </g>
      <g>
        <ellipse cx="30" cy="21" rx="6" ry="2" />
        <path d="M24,21 L24,30 a6,2 0 0 0 12,0 L36,21" />
        <path d="M24,24 a6,2 0 0 0 12,0" />
        <path d="M24,27 a6,2 0 0 0 12,0" />
      </g>
    </svg>
  );
}

export function IconBookOpenOutline() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4,9 Q4,7 6,7.4 L17,10 L17,29 L6,26.6 Q4,26.2 4,28 Z" />
      <path d="M32,9 Q32,7 30,7.4 L17,10 L17,29 L30,26.6 Q32,26.2 32,28 Z" />
      <line x1="17" y1="10" x2="17" y2="29" />
      <line x1="7"  y1="14.5" x2="14" y2="16" />
      <line x1="7"  y1="17.5" x2="14" y2="19" />
      <line x1="7"  y1="20.5" x2="13" y2="22" />
      <line x1="20" y1="16"   x2="27" y2="14.5" />
      <line x1="20" y1="19"   x2="27" y2="17.5" />
      <line x1="20" y1="22"   x2="26" y2="20.5" />
    </svg>
  );
}

export function IconSwordsOutline() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g transform="rotate(-45 18 18)">
        <path d="M14,3 L22,3 L21.4,21 L14.6,21 Z" />
        <path d="M11,21 L25,21 L25,23 L11,23 Z" />
        <line x1="18" y1="23" x2="18" y2="29" />
        <circle cx="18" cy="30.5" r="1.6" />
      </g>
      <g transform="rotate(45 18 18)">
        <path d="M14,3 L22,3 L21.4,21 L14.6,21 Z" />
        <path d="M11,21 L25,21 L25,23 L11,23 Z" />
        <line x1="18" y1="23" x2="18" y2="29" />
        <circle cx="18" cy="30.5" r="1.6" />
      </g>
    </svg>
  );
}

export function IconStarOutline() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="18,4 22.2,14 33,15 24.5,22 27.2,32.5 18,27 8.8,32.5 11.5,22 3,15 13.8,14" />
    </svg>
  );
}

export function IconTargetOutline() {
  // Прицел / мишень — для метрики Винрейта на странице аналитики.
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="18" r="13" />
      <circle cx="18" cy="18" r="8" />
      <circle cx="18" cy="18" r="3" />
      <line x1="18" y1="2"  x2="18" y2="8" />
      <line x1="18" y1="28" x2="18" y2="34" />
      <line x1="2"  y1="18" x2="8"  y2="18" />
      <line x1="28" y1="18" x2="34" y2="18" />
    </svg>
  );
}

export function IconListOutline() {
  // Геймпад — для метрики "Матчей". Раньше тут была сетка с двумя торчащими
  // вверх палочками, которая визуально читалась как календарь; для счётчика
  // матчей по периоду календарь сбивал с толку. Контроллер однозначнее.
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* Тело геймпада */}
      <path d="M11 12h14a6 6 0 0 1 6 6v2a4 4 0 0 1-7.4 2L22 20H14l-1.6 2A4 4 0 0 1 5 20v-2a6 6 0 0 1 6-6Z" />
      {/* Левый D-pad */}
      <line x1="11" y1="17" x2="15" y2="17" />
      <line x1="13" y1="15" x2="13" y2="19" />
      {/* Правые кнопки */}
      <circle cx="23" cy="16" r="1.1" />
      <circle cx="26" cy="19" r="1.1" />
    </svg>
  );
}
