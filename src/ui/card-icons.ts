/**
 * The round pictures on the cards (src/ui/cards.ts showCard): the badge, and each chapter's end. Plain SVG strings, so
 * the smoke tests can show them too (tests/smoke/card-icons.spec.ts).
 */

/** The explorers' badge (joining the team). */
const BADGE = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#ffd166" stroke="#e9573f" stroke-width="6"/>
  <circle cx="60" cy="60" r="38" fill="#3fa7d6"/>
  <path d="M20 60h80" stroke="#f4f4f0" stroke-width="6" stroke-linecap="round"/>
  <path d="M30 48h60M30 72h60" stroke="#f4f4f0" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
  <circle cx="60" cy="60" r="9" fill="#ffd166" stroke="#2b3a4a" stroke-width="3"/>
</svg>`;

/** Chapter 3's end (water): a wave with bubbles over the sea. */
const WAVE = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#bfe9ff" stroke="#ffd166" stroke-width="6"/>
  <path d="M10 70 C24 52 38 52 48 64 C56 74 68 72 70 60 C72 44 92 40 104 56 L110 60 A54 54 0 0 1 10 70 Z" fill="#3fa7d6"/>
  <path d="M16 84 C30 74 42 76 54 84 C66 92 80 92 104 80 A54 54 0 0 1 16 84 Z" fill="#1d7fb8"/>
  <path d="M70 60 C72 48 86 44 96 52" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <circle cx="40" cy="36" r="7" fill="#fff" stroke="#3fa7d6" stroke-width="2.5"/>
  <circle cx="56" cy="24" r="4.5" fill="#fff" stroke="#3fa7d6" stroke-width="2"/>
  <circle cx="30" cy="20" r="3.5" fill="#fff" stroke="#3fa7d6" stroke-width="2"/>
</svg>`;

/** Chapter 4's end (ice and snow): a snow crystal. */
const SNOW = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#6f9fe0" stroke="#ffd166" stroke-width="6"/>
  <g stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none">
    ${[0, 60, 120]
      .map(
        (a) => `<g transform="rotate(${a} 60 60)">
      <path d="M60 22 V98"/>
      <path d="M60 36 L50 28 M60 36 L70 28 M60 84 L50 92 M60 84 L70 92"/>
    </g>`,
      )
      .join('')}
  </g>
  <circle cx="60" cy="60" r="8" fill="#fff"/>
</svg>`;

/**
 * v1.11 chapter 5's end: three soft yellow-green lights with little wings over a night blue (PHASE9_CHAPTER5_6 第 1 部
 * §1.3; fireflies, no face).
 */
const FIREFLY = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#34407a" stroke="#ffd166" stroke-width="6"/>
  ${[
    [42, 48, 1],
    [78, 40, 0.8],
    [62, 80, 1.1],
  ]
    .map(
      ([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})">
    <circle r="15" fill="#e8ff9a" opacity="0.28"/>
    <ellipse cx="-6" cy="-7" rx="6" ry="3.5" fill="#fff" opacity="0.75" transform="rotate(-30 -6 -7)"/>
    <ellipse cx="6" cy="-7" rx="6" ry="3.5" fill="#fff" opacity="0.75" transform="rotate(30 6 -7)"/>
    <circle r="7" fill="#d9ff66"/>
    <circle r="3.5" fill="#fffbe0"/>
  </g>`,
    )
    .join('')}
  <circle cx="30" cy="84" r="1.8" fill="#fff"/><circle cx="92" cy="72" r="1.6" fill="#fff"/><circle cx="84" cy="94" r="1.4" fill="#fff"/>
</svg>`;

/** Chapter 2's end: six islands joined by rail into a ring. */
const RING = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#3fa7d6" stroke="#ffd166" stroke-width="6"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#a2805c" stroke-width="9" stroke-dasharray="3 3.3"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#f4f4f0" stroke-width="2.5"/>
  <circle cx="60.0" cy="24.0" r="12" fill="#8bd17c" stroke="#fff" stroke-width="4"/>
  <circle cx="91.2" cy="42.0" r="12" fill="#f4a261" stroke="#fff" stroke-width="4"/>
  <circle cx="91.2" cy="78.0" r="12" fill="#c9b8f0" stroke="#fff" stroke-width="4"/>
  <circle cx="60.0" cy="96.0" r="12" fill="#5fb36b" stroke="#fff" stroke-width="4"/>
  <circle cx="28.8" cy="78.0" r="12" fill="#f2d45c" stroke="#fff" stroke-width="4"/>
  <circle cx="28.8" cy="42.0" r="12" fill="#e76f51" stroke="#fff" stroke-width="4"/>
</svg>`;

/**
 * v1.11 the whole world joined (PHASE9_CHAPTER5_6 第 1 部 §1.3, the ending 「せかいの わ」 and chapter 6's end): six
 * dots, one per chapter in its colour, on a ring of rail drawn as a rainbow, and a star in the middle, over a dawn sky.
 * Unlike chapter 2's `ring` (six islands on a plain rail over the sea): the rainbow rail, the star, the sky. No face,
 * no letters.
 */
const WORLD = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <linearGradient id="card-world-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fa6f2"/>
      <stop offset="1" stop-color="#ffd3e8"/>
    </linearGradient>
  </defs>
  <circle cx="60" cy="60" r="54" fill="url(#card-world-sky)" stroke="#ffd166" stroke-width="6"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#a2805c" stroke-width="11" stroke-dasharray="3 3.3"/>
  <circle cx="60" cy="60" r="33.2" fill="none" stroke="#ff9fc6" stroke-width="2.4"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#fff3a0" stroke-width="2.4"/>
  <circle cx="60" cy="60" r="38.8" fill="none" stroke="#a8dcff" stroke-width="2.4"/>
  ${[
    [60, 24, '#8bd17c'],
    [91.2, 42, '#f4a261'],
    [91.2, 78, '#3fa7d6'],
    [60, 96, '#eaf6ff'],
    [28.8, 78, '#c8f05a'],
    [28.8, 42, '#c9a8f0'],
  ]
    .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="10" fill="${c}" stroke="#fff" stroke-width="3.5"/>`)
    .join('')}
  <path d="M60.0 43.0 L64.5 54.9 L77.1 55.4 L67.2 63.3 L70.6 75.6 L60.0 68.6 L49.4 75.6 L52.8 63.3 L42.9 55.4 L55.5 54.9 Z"
    fill="#ffd166" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
  <path d="M44 40 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6 z" fill="#fff"/>
  <path d="M78 74 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2 z" fill="#fff"/>
</svg>`;

export const CARD_ICONS = {
  badge: BADGE,
  ring: RING,
  wave: WAVE,
  snow: SNOW,
  firefly: FIREFLY,
  world: WORLD,
} as const;

export type RoundCardIcon = keyof typeof CARD_ICONS;
