import { chapterPage, crossPages, nodePage, pageTitle, type WorldBridge } from '../world/pages';
import type { WorldFile, WorldGatePoint, WorldLinkOptions } from '../world/types';

/** What the map shows about one island (worked out by the caller from the stages and the save). */
export interface MapIsland {
  id: string;
  /** Stage title; null for a later chapter that has no stage yet (drawn as a "?" silhouette). */
  title: string | null;
  unlocked: boolean;
  cleared: boolean;
  recordsFound: number;
  recordsTotal: number;
  /** Some record needs an ability the player does not have yet: come back later ("？"). */
  needsLater: boolean;
  /** The saved mission to go on from on this island (0-based, at least 1): a tap asks "つづきから" or "はじめから". */
  resumeMission?: number;
  /**
   * v1.11 (PHASE9_CHAPTER5_6 §0.4, 第 1 部 §1.2): a record still missing here needs an ability the stage does not give
   * at its start (a later stage's, or one learned part way through it), and the child has it now: come back for it.
   * Its badge glows softly.
   */
  takeable?: boolean;
}

/**
 * A chapter's end (docs/PHASE7_FINISH.md §3, docs/PHASE8_CHAPTER3_4.md 第 1 部 §4): plays once, after its rail has
 * grown in (if it has one), on its chapter's page.
 */
export interface MapFinale {
  chapter: number;
  /** "from>to": the rail that closes the chapter (it is among `fresh`); none for an end without a new rail. */
  link?: string;
  /** Islands in order: a golden light runs round them once and each one hops as it passes. */
  ring?: string[];
  /**
   * Islands in order along one road: the light runs along it once (water), they twinkle in turn (aurora), or
   * fireflies rise from each in turn and gather along the rails (firefly).
   */
  path?: string[];
  light?: 'gold' | 'water' | 'aurora' | 'firefly';
  /** v1.11 (firefly): where the one big light the fireflies gather into flies to (an island or "teaser:<chapter>"). */
  target?: string;
  /** v1.11 (firefly): the big light has landed (its sound). */
  onLand?: () => void;
  /** Islands that open with this end: they stay asleep (grey) until the light reaches them. */
  wake?: string[];
  /**
   * v1.11 (PR9): the big light landed on an island that opens with this end (the castle, 6-1): it wakes and its windows
   * light up ("ちりりん").
   */
  onWindows?: () => void;
  /** Islands the powder snow falls on when the water light arrives (the next chapter's). */
  snow?: string[];
  /** Each hop, bob or twinkle (its sound). */
  onHop?: (index: number) => void;
  /** The snow falls (its sound). */
  onSnow?: () => void;
  /** The light is done: show the card; the map waits for it. */
  onShown: () => Promise<void>;
}

/**
 * v1.11 (PR10, docs/PHASE9_CHAPTER5_6.md 第 1 部 §5.2): the world's end 「せかいの わ」 (about 11 s and a card). It opens on
 * the page of `after`; the pages shrink side by side onto one sheet; rainbow rails join them (and the long rail home);
 * a golden light runs along `trail`, each island hopping and turning gold; everything glows; the card; back to the page.
 * It plays after a chapter's end on the same map (and the rails that wait for that end), before `later`'s own rails.
 */
export interface MapEnding {
  /** The islands the light runs through, in order (world.json's `ending.trail`). */
  trail: string[];
  /** The island the world's ring closes on (1-1); `after`: the one the long rail home starts from (6-1). */
  home: string;
  after: string;
  /** The rainbow rails, on the sheet of all the pages (src/world/pages.ts endingBridges). */
  bridges: WorldBridge[];
  /** Fresh rails out of `after` that grow once it is over (6-2's rail, PR11b); among MapOptions.later. */
  later?: string[];
  /** It starts (the song "sekai"). */
  onStart?: () => void;
  /** The light reaches an island: `i` counts from 0 again on each page (the bell's note). */
  onStep?: (i: number) => void;
  /** A rainbow rail grows ("きらーん"). */
  onBridge?: () => void;
  /** Everything glows: show the card; the map waits for it. */
  onShown: () => Promise<void>;
}

/** A later chapter's single "?" island, joined to `from` by a dotted line. */
export interface MapTeaser {
  /** Its node id in world.json links ("teaser:<chapter>"). */
  id: string;
  label: string;
  /** Centre in % of the map area. */
  x: number;
  y: number;
  /** The little bubble when it is tapped. */
  line: string;
}

export interface MapOptions {
  islands: MapIsland[];
  /** Links ("from>to") whose rail is laid (from is cleared). */
  laid: string[];
  /** Laid links drawn for the first time now: the rail grows along them. */
  fresh: string[];
  /**
   * Fresh links that grow one after another once the finale (if any) is over, with the map's hands off; a rail to
   * another page grows to the gate, turns the page and grows on from the gate there. Each is reported by
   * `onLinkShown` once it is all in (the caller saves it then, so leaving early shows it again).
   */
  later?: string[];
  onLinkShown?: (key: string) => void;
  /** The island to go to next: it bounces. */
  next?: string;
  /** Label of the close button ("もどる", "タイトルへ"); omitted = no button. */
  closeLabel?: string;
  finale?: MapFinale;
  /** Floats in after the finale when there is one, else it is simply there. */
  teaser?: MapTeaser;
  /** The page it opens on (default 1). */
  page?: number;
  /** The pages the child knows about (default: just `page`). Only these are drawn, and ◀ ▶ go between them. */
  pages?: number[];
  /**
   * v1.11 (PR9, 第 1 部 §3.4): a child who saw chapter 5's end before 6-1's island came: the rail `link` (fresh) grows
   * to the castle `island`, asleep (grey) until the rail reaches it; then it wakes and its windows light (`onWindows`).
   */
  windows?: { island: string; link: string; onWindows?: () => void };
  /**
   * v1.11 (PR9b, 第 1 部 §4.2): islands asleep (grey, windows dark) until a chapter's end lights them: the castle 6-1
   * while chapter 5's end ("finale:5") is not seen yet. The big light landing on one wakes it.
   */
  asleep?: string[];
  /** v1.11 (PR9b): islands awake with their windows already lit (the castle, once "finale:5" is seen): no animation. */
  lit?: string[];
  /** v1.11 (PR10): the world's end plays (`pages` must hold every page: they are all laid out side by side). */
  ending?: MapEnding;
}

/** `resume`: go on from the island's saved mission ("つづきから") instead of from its start. */
export type MapChoice = { kind: 'stage'; id: string; resume?: boolean } | { kind: 'close' };

export const linkKey = (from: string, to: string): string => `${from}>${to}`;

const SVG = 'http://www.w3.org/2000/svg';
const RAIL_GROW_SECONDS = 1.4;
/**
 * v1.11 (PR9): the castle's windows lighting one by one (0.8 s in all), at the places world.json's island `windows`
 * gives on its picture (PR9b; scripts/render-map.mjs works them out).
 */
const WINDOWS_SECONDS = 0.8;
/** The golden light: seconds per link of the ring (6 links: about 3 s round). The water light runs as fast. */
const RING_STEP_SECONDS = 0.5;
/** A breath between the light coming home and the card. */
const RING_REST_SECONDS = 0.5;
/** The powder snow on the next chapter's islands, as the water light arrives. */
const SNOW_SECONDS = 0.8;
/** The aurora: the sky turns to evening with a flurry, each island twinkles in turn, the sky comes back. */
const DUSK_SECONDS = 1;
const TWINKLE_STEP_SECONDS = 0.35;
const DAWN_SECONDS = 0.5;
/**
 * v1.11 chapter 5's end (fireflies, PHASE9_CHAPTER5_6 第 1 部 §4.2): night falls, fireflies rise from each island of
 * the path in turn (six each, gathering along the rails), one big light flies to the target, the night lifts.
 */
const NIGHT_SECONDS = 0.6;
const FIREFLY_STEP_SECONDS = 0.45;
const FIREFLIES_PER_ISLAND = 6;
const BIG_LIGHT_SECONDS = 0.8;
const MAP_STARS = 12;
/**
 * v1.11 (PR10) the world's end (第 1 部 §5.2): the pages shrink side by side, the light runs (an island to the next on a
 * page, a crossing through the gate or the long rail home), all glow, and the pages come back.
 */
const WORLD_IN_SECONDS = 1.2;
const WORLD_STEP_SECONDS = 0.2;
const WORLD_CROSS_SECONDS = 0.5;
const WORLD_GLOW_SECONDS = 1;
const WORLD_BACK_SECONDS = 1;
const WORLD_CONFETTI = 28;
/** The rainbow rail's bands, outside in (pastel: a thin ribbon of the rainbow's colours). */
const RAINBOW = ['#ff9aa8', '#ffc98a', '#fff08a', '#a8eaa0', '#9ccfff', '#c8b0ff'];
/** A rail through the gate: a breath at the gate before the page turns. */
const GATE_REST_SECONDS = 0.3;
const TURN_SECONDS = 0.5;
/** A swipe turns the page: this far across, mostly across, this quick. */
const SWIPE_PX = 60;
const SWIPE_RATIO = 1.5;
const SWIPE_SECONDS = 0.6;
const SAY_SECONDS = 2;
/** The "つづきから / はじめから" choice ignores taps this long: a second tap on the island does not pick for the child. */
const CHOOSE_GUARD_SECONDS = 0.4;
/** Map area aspect (16:10): SVG x units per % of width. */
const K = 1.6;
const WIDE = 100 * K;

const sleep = (seconds: number): Promise<void> => new Promise((ok) => window.setTimeout(ok, seconds * 1000));

/** "くもの もん": an arch of cloud puffs with a warm light inside, the rail running into it. */
const GATE = `<svg viewBox="0 0 100 92" aria-hidden="true">
  <defs>
    <radialGradient id="map-gate-glow" cx="50%" cy="62%" r="50%">
      <stop offset="0" stop-color="#fffbe6"/>
      <stop offset="0.6" stop-color="#ffe9a8"/>
      <stop offset="1" stop-color="#bfe3ff"/>
    </radialGradient>
  </defs>
  <path d="M28 86 V46 A22 22 0 0 1 72 46 V86 Z" fill="url(#map-gate-glow)"/>
  <g fill="#cfe2f5">
    <circle cx="20" cy="80" r="12"/><circle cx="17" cy="62" r="12"/><circle cx="20" cy="44" r="12"/>
    <circle cx="30" cy="28" r="13"/><circle cx="50" cy="21" r="14"/><circle cx="70" cy="28" r="13"/>
    <circle cx="80" cy="44" r="12"/><circle cx="83" cy="62" r="12"/><circle cx="80" cy="80" r="12"/>
  </g>
  <g fill="#fff">
    <circle cx="19" cy="77" r="11"/><circle cx="16" cy="59" r="11"/><circle cx="19" cy="41" r="11"/>
    <circle cx="30" cy="25" r="12"/><circle cx="50" cy="18" r="13"/><circle cx="70" cy="25" r="12"/>
    <circle cx="81" cy="41" r="11"/><circle cx="84" cy="59" r="11"/><circle cx="81" cy="77" r="11"/>
  </g>
  <g fill="#fff" opacity="0.9">
    <path d="M50 44 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
    <path d="M40 60 l1.3 3 3 1.3 -3 1.3 -1.3 3 -1.3 -3 -3 -1.3 3 -1.3z"/>
    <path d="M61 57 l1.3 3 3 1.3 -3 1.3 -1.3 3 -1.3 -3 -3 -1.3 3 -1.3z"/>
  </g>
</svg>`;

/** The aurora: three soft ribbons (green, pink, lilac) across the top of the sky. */
const AURORA = `<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="map-aurora-a" x1="0" x2="1">
      <stop offset="0" stop-color="#8ef0b8" stop-opacity="0"/>
      <stop offset="0.25" stop-color="#8ef0b8"/>
      <stop offset="0.6" stop-color="#ffb3dd"/>
      <stop offset="1" stop-color="#d4c2ff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="map-aurora-b" x1="0" x2="1">
      <stop offset="0" stop-color="#d4c2ff" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#d4c2ff"/>
      <stop offset="0.7" stop-color="#9ff5c8"/>
      <stop offset="1" stop-color="#ffb3dd" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path class="map-aurora-ribbon is-a" d="M0 50 C60 20 110 70 170 44 S290 16 400 46 L400 70 C300 40 240 92 170 66 S60 44 0 76 Z" fill="url(#map-aurora-a)"/>
  <path class="map-aurora-ribbon is-b" d="M0 30 C80 60 140 10 210 34 S330 62 400 26 L400 42 C330 78 260 34 210 50 S80 76 0 44 Z" fill="url(#map-aurora-b)"/>
</svg>`;

/** A few falling flakes (white dots) in `box`; they go after `seconds`. */
function snowIn(box: HTMLElement, flakes: number, seconds: number): void {
  for (let i = 0; i < flakes; i++) {
    const f = document.createElement('span');
    f.className = 'map-flake';
    f.style.left = `${4 + ((i * 37) % 92)}%`;
    f.style.animationDelay = `${((i * 0.13) % 0.5).toFixed(2)}s`;
    f.style.setProperty('--size', `${5 + (i % 3) * 2}px`);
    box.appendChild(f);
  }
  window.setTimeout(() => box.remove(), seconds * 1000);
}

interface LinkPart {
  key: string;
  page: number;
  g: SVGGElement;
  /** A half of a rail through the gate: its gate on this page. */
  gate?: HTMLButtonElement;
}

/**
 * The world map: islands floating in the sky, joined by rail as stages are cleared, in pages of two chapters that
 * the child turns with ◀ ▶, a swipe or a tap on the cloud gate. Tapping an open island resolves with its stage id.
 * Pictures are public/map/<id>.png (scripts/render-map.mjs).
 */
export function showMap(root: HTMLElement, world: WorldFile, options: MapOptions): Promise<MapChoice> {
  return new Promise((resolve) => {
    const pages = [...new Set(options.pages ?? [options.page ?? 1])].sort((a, b) => a - b);
    let current = pages.includes(options.page ?? 1) ? (options.page ?? 1) : pages[0];
    const slot = (page: number): number => pages.indexOf(page);

    const el = document.createElement('div');
    el.id = 'map';
    el.className = 'overlay map';
    const sky = document.createElement('div');
    sky.className = 'map-sky';
    const header = document.createElement('div');
    header.className = 'map-header';
    const h = document.createElement('h1');
    h.textContent = 'ちず';
    header.appendChild(h);
    // Which chapters this page holds, and dots for the pages: only once there is more than one page to see.
    let heading: HTMLElement | null = null;
    const dots: HTMLElement[] = [];
    if (pages.length > 1) {
      el.classList.add('has-pages');
      heading = document.createElement('span');
      heading.className = 'map-page-title';
      heading.id = 'map-page-title';
      const row = document.createElement('span');
      row.className = 'map-dots';
      for (const p of pages) {
        const dot = document.createElement('span');
        dot.className = 'map-dot';
        dot.dataset.page = String(p);
        row.appendChild(dot);
        dots.push(dot);
      }
      header.append(heading, row);
    }
    const area = document.createElement('div');
    area.className = 'map-area';
    const strip = document.createElement('div');
    strip.className = 'map-pages';
    area.appendChild(strip);
    const pageEls = new Map<number, HTMLElement>();
    for (const p of pages) {
      const pageEl = document.createElement('div');
      pageEl.className = 'map-page';
      pageEl.dataset.page = String(p);
      pageEl.style.setProperty('--slot', String(slot(p)));
      strip.appendChild(pageEl);
      pageEls.set(p, pageEl);
    }

    const finish = (choice: MapChoice): void => {
      el.remove();
      resolve(choice);
    };

    // An island with a saved mission asks how to start, in a bubble beside it; a tap anywhere else closes it.
    let choose: HTMLElement | null = null;
    const closeChoose = (): void => {
      choose?.remove();
      choose = null;
      el.querySelector('.map-island.is-choosing')?.classList.remove('is-choosing');
    };
    const askStart = (btn: HTMLElement, pageEl: HTMLElement, id: string, x: number, y: number, mission: number): void => {
      closeChoose();
      const box = document.createElement('div');
      box.className = 'map-choose';
      box.dataset.island = id;
      // On the side with more room: right of an island in the left half, else left of it (islands are 25% wide).
      const right = x < 50;
      box.classList.add(right ? 'is-right' : 'is-left');
      box.style.left = `${right ? x + 11 : x - 11}%`;
      box.style.top = `${y}%`;
      const add = (cls: string, label: string, resume: boolean): void => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `map-choose-button ${cls}`;
        b.textContent = label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          finish({ kind: 'stage', id, resume });
        });
        box.appendChild(b);
      };
      add('is-continue', `つづきから（ミッション ${mission + 1}）`, true);
      add('is-start', 'はじめから', false);
      box.addEventListener('click', (e) => e.stopPropagation());
      pageEl.appendChild(box);
      choose = box;
      window.setTimeout(() => box.classList.add('is-ready'), CHOOSE_GUARD_SECONDS * 1000);
      btn.classList.add('is-choosing');
    };
    area.addEventListener('click', closeChoose);

    const { finale, teaser, ending } = options;
    const later = options.later ?? [];
    const fresh = new Set(options.fresh);
    // v1.11 (PR10): the world's end's golden light runs along the rails too (they carry it).
    const lightPath = finale?.ring ?? finale?.path ?? ending?.trail;
    // Where each node sits (% of its page): the islands, and the teaser's "?" island.
    const at = new Map<string, { x: number; y: number }>(world.islands.map((i) => [i.id, { x: i.x, y: i.y }]));
    if (teaser) at.set(teaser.id, { x: teaser.x, y: teaser.y });

    // A tap on a node: a little wiggle (a one-off: its class goes when it ends, so the island's own motion — the
    // "?" island floats — comes back; the same for the "?" island's fade-in).
    const wiggle = (btn: HTMLElement): void => {
      btn.classList.remove('is-wiggle', 'is-appear');
      void btn.offsetWidth;
      btn.classList.add('is-wiggle');
    };
    area.addEventListener('animationend', (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('map-island') && !target.classList.contains('map-gate')) return;
      if (e.animationName === 'island-wiggle') target.classList.remove('is-wiggle');
      // A bob or a twinkle is a moment: gone after, so a bounce (the next island) is not held back by it.
      if (e.animationName === 'island-bob') target.classList.remove('is-bob');
      if (e.animationName === 'island-twinkle') target.classList.remove('is-twinkle');
      if (e.animationName === 'teaser-appear' || e.animationName === 'gate-appear') target.classList.remove('is-appear');
    });

    // Rail between islands, under them: one SVG per page. The area is always 16:10, so one user unit is the same
    // across and down (x% × 1.6, y%).
    const svgs = new Map<number, SVGSVGElement>();
    for (const [p, pageEl] of pageEls) {
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'map-links');
      svg.setAttribute('viewBox', `0 0 ${WIDE} 100`);
      pageEl.appendChild(svg);
      svgs.set(p, svg);
    }
    const parts: LinkPart[] = [];
    const linkEls = new Map<string, SVGGElement>();
    let teaserLink: SVGGElement | null = null;
    const drawLink = (
      key: string,
      page: number,
      a: { x: number; y: number },
      b: { x: number; y: number },
      via: [number, number] | undefined,
      laid: boolean,
    ): SVGGElement | null => {
      const svg = svgs.get(page);
      if (!svg) return null;
      // A gentle arc: the control point sits above the midpoint, unless the link names its own.
      const [cx, cy] = via ?? [(a.x + b.x) / 2, Math.min(a.y, b.y) - 10];
      const d = `M ${a.x * K} ${a.y} Q ${cx * K} ${cy} ${b.x * K} ${b.y}`;
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', laid ? 'map-link is-laid' : 'map-link');
      const layers = laid ? ['bed', 'rail'] : ['dots'];
      // The rails the light runs along carry it (drawn only while it passes); the water light has bubbles too.
      if (laid && lightPath) layers.push('glow', 'glow-core', 'glow-bubbles');
      for (const cls of layers) {
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', cls);
        // The rail grows in (and the light runs) with a dash offset over a normalised length.
        if (cls !== 'bed' && cls !== 'dots') path.setAttribute('pathLength', '100');
        g.appendChild(path);
      }
      svg.appendChild(g);
      return g;
    };

    // The cloud gate at one end of a rail to another page: a tap turns to that page.
    const gateEls: HTMLButtonElement[] = [];
    const drawGate = (page: number, point: WorldGatePoint, side: 'exit' | 'enter', key: string, toPage: number): HTMLButtonElement | undefined => {
      const pageEl = pageEls.get(page);
      if (!pageEl) return undefined;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-gate';
      btn.dataset.gate = side;
      btn.dataset.gateLink = key;
      btn.dataset.toPage = String(toPage);
      btn.setAttribute('aria-label', side === 'exit' ? 'くもの もん（つぎの ページ）' : 'くもの もん（まえの ページ）');
      btn.style.left = `${point.x}%`;
      btn.style.top = `${point.y}%`;
      btn.style.zIndex = String(100 - Math.round(point.y));
      btn.innerHTML = GATE;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeChoose();
        void turnTo(toPage);
      });
      pageEl.appendChild(btn);
      gateEls.push(btn);
      return btn;
    };

    for (const [from, to, opts] of world.links as [string, string, WorldLinkOptions?][]) {
      const isTeaser = to.startsWith('teaser:');
      if (isTeaser && teaser?.id !== to) continue;
      const a = at.get(from);
      const b = at.get(to);
      if (!a || !b) continue;
      const key = linkKey(from, to);
      const laid = !isTeaser && options.laid.includes(key);
      const cross = crossPages(world, key);
      if (cross) {
        // Through the gate: drawn only once laid (no dotted line to another page), a half on each page.
        if (!laid || !opts?.exit || !opts.enter) continue;
        const out = drawLink(key, cross.from, a, opts.exit, opts.exit.via, true);
        const into = drawLink(key, cross.to, opts.enter, b, opts.enter.via, true);
        if (out) {
          out.dataset.link = key;
          linkEls.set(key, out);
          parts.push({ key, page: cross.from, g: out, gate: drawGate(cross.from, opts.exit, 'exit', key, cross.to) });
        }
        if (into) {
          into.dataset.linkEnter = key;
          parts.push({ key, page: cross.to, g: into, gate: drawGate(cross.to, opts.enter, 'enter', key, cross.from) });
        }
        continue;
      }
      const page = nodePage(world, from) ?? 1;
      const g = drawLink(key, page, a, b, opts?.via, laid);
      if (!g) continue;
      g.dataset.link = key;
      if (isTeaser) {
        g.classList.add('is-teaser-link');
        teaserLink = g;
      } else if (laid) parts.push({ key, page, g });
      linkEls.set(key, g);
    }

    const info = new Map(options.islands.map((i) => [i.id, i]));
    const islandEls = new Map<string, HTMLButtonElement>();
    for (const island of world.islands) {
      const pageEl = pageEls.get(chapterPage(world, island.chapter));
      if (!pageEl) continue;
      const state = info.get(island.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-island';
      btn.dataset.island = island.id;
      btn.style.left = `${island.x}%`;
      btn.style.top = `${island.y}%`;
      // v1.11: a bigger island (the castle, 6-1): 25 % × size wide.
      if (island.size !== undefined) btn.style.width = `${25 * island.size}%`;
      // Islands higher up the map sit on top: their name tag hangs below them, over the island underneath.
      btn.style.zIndex = String(100 - Math.round(island.y));
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      const known = !!state?.title;
      img.src = `${import.meta.env.BASE_URL}map/${known && island.diorama ? island.id : 'unknown'}.png`;
      if (known && island.windows) {
        // v1.11 (PR9b): the castle's picture in a frame of its own, so its windows sit on the picture (% of it).
        const frame = document.createElement('span');
        frame.className = 'map-picture';
        frame.appendChild(img);
        btn.appendChild(frame);
      } else btn.appendChild(img);
      if (!known || !state) {
        btn.classList.add('is-unknown');
        const q = document.createElement('span');
        q.className = 'map-mystery';
        q.textContent = '？';
        btn.appendChild(q);
      } else {
        const label = document.createElement('span');
        label.className = 'map-label';
        label.textContent = state.title;
        btn.appendChild(label);
        if (state.recordsTotal > 0) {
          const badge = document.createElement('span');
          badge.className = state.takeable ? 'map-badge is-takeable' : 'map-badge';
          badge.textContent = `きろく ${state.recordsFound}/${state.recordsTotal}${state.needsLater ? ' ？' : ''}`;
          btn.appendChild(badge);
        }
        if (state.cleared) btn.classList.add('is-cleared');
        if (!state.unlocked) btn.classList.add('is-locked');
        // Opening with this chapter's end: still asleep until the light gets here.
        if (finale?.wake?.includes(island.id) || options.windows?.island === island.id || options.asleep?.includes(island.id)) {
          btn.classList.add('is-asleep');
        }
      }
      btn.addEventListener('click', (e) => {
        if (state?.title && state.unlocked) {
          if (state.resumeMission !== undefined) {
            e.stopPropagation();
            if (choose?.dataset.island !== island.id) askStart(btn, pageEl, island.id, island.x, island.y, state.resumeMission);
            return;
          }
          finish({ kind: 'stage', id: island.id });
          return;
        }
        // Not yet: a little wiggle, nothing else.
        wiggle(btn);
      });
      islandEls.set(island.id, btn);
      pageEl.appendChild(btn);
    }

    // The next chapter's "?" island: it only wiggles and says "see you next time".
    let teaserEl: HTMLButtonElement | null = null;
    const teaserPage = teaser ? pageEls.get(nodePage(world, teaser.id) ?? 1) : undefined;
    if (teaser && teaserPage) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-island is-unknown is-teaser';
      btn.dataset.island = teaser.id;
      btn.style.left = `${teaser.x}%`;
      btn.style.top = `${teaser.y}%`;
      btn.style.zIndex = String(100 - Math.round(teaser.y));
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.src = `${import.meta.env.BASE_URL}map/unknown.png`;
      const q = document.createElement('span');
      q.className = 'map-mystery';
      q.textContent = '？';
      const label = document.createElement('span');
      label.className = 'map-label';
      label.textContent = teaser.label;
      btn.append(img, q, label);
      let say: HTMLElement | null = null;
      let sayTimer = 0;
      btn.addEventListener('click', () => {
        wiggle(btn);
        say?.remove();
        window.clearTimeout(sayTimer);
        say = document.createElement('div');
        say.className = 'map-say';
        say.textContent = teaser.line;
        // Beside it, on the side with room (the "?" island at the right edge says it to its left).
        const left = teaser.x > 60;
        say.classList.toggle('is-left', left);
        say.style.left = `${left ? teaser.x - 8 : teaser.x + 8}%`;
        say.style.top = `${teaser.y - 6}%`;
        teaserPage.appendChild(say);
        const shown = say;
        sayTimer = window.setTimeout(() => shown.remove(), SAY_SECONDS * 1000);
      });
      teaserEl = btn;
      teaserPage.appendChild(btn);
    }

    // v1.11 (PR10): the world's end's rainbow rails, over the sheet of all the pages side by side (hidden till they grow).
    const bridgeEls = new Map<string, SVGGElement>();
    if (ending) {
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'map-world-links');
      svg.setAttribute('viewBox', `0 0 ${WIDE} 100`);
      svg.setAttribute('aria-hidden', 'true');
      for (const b of ending.bridges) {
        const g = document.createElementNS(SVG, 'g');
        g.setAttribute('class', b.home ? 'map-bridge is-home is-pending' : 'map-bridge is-pending');
        g.dataset.bridge = b.key;
        g.style.setProperty('--grow-seconds', `${b.seconds}s`);
        const d = `M ${b.from.x * K} ${b.from.y} Q ${b.via[0] * K} ${b.via[1]} ${b.to.x * K} ${b.to.y}`;
        const layers = [...RAINBOW.map((_, i) => `band band-${i}`), 'glow', 'glow-core'];
        layers.forEach((cls, i) => {
          const path = document.createElementNS(SVG, 'path');
          path.setAttribute('d', d);
          path.setAttribute('class', cls);
          path.setAttribute('pathLength', '100');
          if (i < RAINBOW.length) {
            path.setAttribute('stroke', RAINBOW[i]);
            path.setAttribute('stroke-width', String(Math.round((1.5 - i * 0.22) * 100) / 100));
          }
          g.appendChild(path);
        });
        svg.appendChild(g);
        bridgeEls.set(b.key, g);
      }
      area.appendChild(svg);
    }

    el.append(sky, header, area);
    let close: HTMLButtonElement | null = null;
    if (options.closeLabel) {
      close = document.createElement('button');
      close.type = 'button';
      close.id = 'map-close';
      close.className = 'big-button is-secondary map-close';
      close.textContent = options.closeLabel;
      close.addEventListener('click', () => finish({ kind: 'close' }));
      el.appendChild(close);
    }

    // ◀ ▶ in the bottom corners, only towards pages the child knows about.
    const turnButton = (dir: -1 | 1): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = dir < 0 ? 'map-prev' : 'map-next';
      b.className = `map-turn ${dir < 0 ? 'is-prev' : 'is-next-page'}`;
      b.setAttribute('aria-label', dir < 0 ? 'まえの ページ' : 'つぎの ページ');
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19'}"/></svg>`;
      b.addEventListener('click', () => {
        const to = pages[slot(current) + dir];
        if (to !== undefined) void turnTo(to);
      });
      el.appendChild(b);
      return b;
    };
    const prev = pages.length > 1 ? turnButton(-1) : null;
    const nextBtn = pages.length > 1 ? turnButton(1) : null;

    // Rails growing in: the ones on the page shown now at once, the ones on another page when it is first shown
    // (the rails the sequence below grows wait for it).
    const pending = new Set(later);
    const grownPages = new Set<number>();
    const growOn = (page: number): void => {
      if (grownPages.has(page)) return;
      grownPages.add(page);
      for (const part of parts) {
        if (part.page === page && fresh.has(part.key) && !pending.has(part.key)) part.g.classList.add('is-growing');
      }
    };
    for (const part of parts) {
      if (!pending.has(part.key)) continue;
      part.g.classList.add('is-pending');
      part.gate?.classList.add('is-pending');
    }
    // Something new over there (the next island, or rail not seen yet): its arrow beckons.
    const news = (page: number | undefined): boolean =>
      page !== undefined &&
      ((options.next !== undefined && nodePage(world, options.next) === page) ||
        parts.some((p) => p.page === page && fresh.has(p.key) && !grownPages.has(page) && !pending.has(p.key)));

    const show = (): void => {
      el.dataset.page = String(current);
      // No transform at all on the first page: it draws exactly as the map did before it had pages.
      strip.style.transform = slot(current) > 0 ? `translateX(${-slot(current) * 100}vw)` : '';
      for (const [p, pageEl] of pageEls) {
        const here = p === current;
        pageEl.inert = !here;
        pageEl.setAttribute('aria-hidden', here ? 'false' : 'true');
      }
      if (heading) heading.textContent = pageTitle(world, current);
      dots.forEach((d) => d.classList.toggle('is-on', d.dataset.page === String(current)));
      const before = pages[slot(current) - 1];
      const after = pages[slot(current) + 1];
      if (prev) {
        prev.hidden = before === undefined;
        prev.classList.toggle('is-beckon', news(before));
      }
      if (nextBtn) {
        nextBtn.hidden = after === undefined;
        nextBtn.classList.toggle('is-beckon', news(after));
      }
      for (const gate of gateEls) gate.classList.toggle('is-beckon', news(Number(gate.dataset.toPage)));
      growOn(current);
    };
    const turnTo = async (page: number): Promise<void> => {
      if (page === current || !pageEls.has(page)) return;
      closeChoose();
      current = page;
      show();
      await sleep(TURN_SECONDS);
    };

    // A swipe across turns the page (only towards a page there is). The tap that ends it reaches nothing.
    let swipe: { x: number; y: number; t: number; id: number } | null = null;
    let swallowUntil = 0;
    el.addEventListener('pointerdown', (e) => {
      swipe = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
    });
    el.addEventListener('pointerup', (e) => {
      const s = swipe;
      swipe = null;
      if (!s || s.id !== e.pointerId || pages.length < 2 || el.classList.contains('is-busy')) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return;
      if (performance.now() - s.t > SWIPE_SECONDS * 1000) return;
      swallowUntil = performance.now() + 500;
      const to = pages[slot(current) + (dx < 0 ? 1 : -1)];
      if (to !== undefined) void turnTo(to);
    });
    el.addEventListener('pointercancel', () => (swipe = null));
    el.addEventListener(
      'click',
      (e) => {
        if (performance.now() < swallowUntil) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );

    // The page it opens on, placed without the slide.
    show();
    root.appendChild(el);
    void strip.offsetWidth;
    strip.classList.add('is-sliding');

    const markNext = (delay: boolean): void => {
      const btn = options.next ? islandEls.get(options.next) : undefined;
      if (!btn || !info.get(options.next ?? '')?.title) return;
      btn.classList.add('is-next');
      // Wait for the rail to reach it before it starts bouncing.
      if (delay && options.fresh.length > 0) btn.style.animationDelay = `${RAIL_GROW_SECONDS}s`;
    };
    /**
     * v1.11 (PR9): the castle wakes: its colour comes back and its windows (four) light up, one after another; PR9b:
     * `still`, already awake (a later visit): they are simply lit.
     */
    const lightWindows = (id: string, still = false): void => {
      const btn = islandEls.get(id);
      if (!btn) return;
      btn.classList.remove('is-asleep');
      btn.classList.add('is-awake');
      const frame = btn.querySelector('.map-picture');
      if (!frame || frame.querySelector('.map-window')) return;
      const spots = world.islands.find((i) => i.id === id)?.windows ?? [];
      spots.forEach(([x, y], i) => {
        const w = document.createElement('span');
        w.className = still ? 'map-window is-still' : 'map-window';
        w.style.left = `${x}%`;
        w.style.top = `${y}%`;
        if (!still) w.style.animationDelay = `${(i * WINDOWS_SECONDS) / spots.length}s`;
        frame.appendChild(w);
      });
    };
    const windows = options.windows;
    if (windows && options.fresh.includes(windows.link)) {
      // The rail grows to the sleeping castle; as it gets there, the castle wakes.
      window.setTimeout(() => {
        lightWindows(windows.island);
        windows.onWindows?.();
        el.dataset.windows = windows.island;
      }, RAIL_GROW_SECONDS * 1000);
    } else if (windows) lightWindows(windows.island);
    // v1.11 (PR9b): a castle that woke on an earlier visit keeps its windows lit.
    for (const id of options.lit ?? []) if (id !== windows?.island) lightWindows(id, true);
    if (!finale && later.length === 0 && !ending) {
      markNext(true);
      return;
    }

    // Hands off the map (and no way out) until it is all shown: the finale and its card, then the rails that wait.
    el.classList.add('is-busy');
    // v1.11: an end whose big light lands on the "?" island leaves it (and its dotted line) there to land on.
    const teaserIsTarget = !!teaser && finale?.target === teaser.id;
    if (finale) {
      el.dataset.finale = 'playing';
      el.dataset.light = finale.light ?? 'gold';
      el.classList.add('is-finale-playing');
      if (!teaserIsTarget) {
        teaserEl?.classList.add('is-waiting');
        teaserLink?.classList.add('is-waiting');
      }
    } else el.dataset.growing = '1';
    if (close) close.hidden = true;
    const trail: string[] = [];
    const reach = (id: string): void => {
      trail.push(id);
      el.dataset.trail = trail.join(',');
    };
    const restart = (node: Element | null | undefined, cls: string): void => {
      if (!node) return;
      node.classList.remove(cls);
      void node.getBoundingClientRect();
      node.classList.add(cls);
    };
    const lightLink = (from: string, to: string, water: boolean): void => {
      const forward = linkEls.get(linkKey(from, to));
      const link = forward ?? linkEls.get(linkKey(to, from));
      if (!link) return;
      link.classList.toggle('is-reverse', !forward);
      link.classList.toggle('is-water', water);
      link.classList.remove('is-lit');
      void link.getBoundingClientRect();
      link.classList.add('is-lit');
    };

    /**
     * v1.11 chapter 5's end: night (the sky a deeper blue-violet, never darker than 70 %, a dozen twinkling stars);
     * each island of the path in turn gets a warm ring of light ("ぽわん") and six yellow-green fireflies rise from
     * it; they drift along the rail to the next island and the swarm grows (6, 12, 18); at the last island they
     * become one big light that flies to the target, which glows warm; the night lifts. With calm motion no dots
     * fly: the islands glow in turn, the target glows, the night comes and goes at once.
     */
    const fireflies = async (path: string[]): Promise<void> => {
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const pageEl = pageEls.get(current);
      el.classList.add('is-night');
      const stars = document.createElement('div');
      stars.className = 'map-stars';
      for (let i = 0; i < MAP_STARS; i++) {
        const star = document.createElement('span');
        star.className = 'map-star';
        star.style.left = `${6 + ((i * 37) % 88)}%`;
        star.style.top = `${4 + ((i * 23) % 30)}%`;
        star.style.animationDelay = `${(i % 5) * 0.3}s`;
        stars.appendChild(star);
      }
      el.insertBefore(stars, header);
      if (!calm) await sleep(NIGHT_SECONDS);
      const swarm: HTMLElement[] = [];
      const place = (dot: HTMLElement, p: { x: number; y: number }, spread: number, k: number): void => {
        dot.style.left = `${p.x + Math.cos(k * 2.4) * spread}%`;
        dot.style.top = `${p.y - 6 + Math.sin(k * 2.4) * spread * 1.4}%`;
      };
      for (let i = 0; i < path.length; i++) {
        const id = path[i];
        restart(islandEls.get(id), 'is-glow');
        reach(id);
        finale?.onHop?.(i);
        const p = at.get(id);
        if (!calm && p && pageEl) {
          for (let k = 0; k < FIREFLIES_PER_ISLAND; k++) {
            const dot = document.createElement('span');
            dot.className = 'map-firefly';
            dot.style.animationDelay = `${(k % 3) * 0.2}s`;
            place(dot, p, 0.5, k);
            pageEl.appendChild(dot);
            swarm.push(dot);
          }
          void pageEl.offsetWidth;
          swarm.forEach((dot, k) => place(dot, p, 2.2 + (k % 3), k + i));
        }
        if (i === path.length - 1) break;
        lightLink(path[i], path[i + 1], false);
        linkEls.get(linkKey(path[i], path[i + 1]))?.classList.add('is-firefly');
        await sleep(FIREFLY_STEP_SECONDS / 2);
        const q = at.get(path[i + 1]);
        if (!calm && q) swarm.forEach((dot, k) => place(dot, q, 2 + (k % 3), k));
        await sleep(FIREFLY_STEP_SECONDS / 2);
      }
      await sleep(FIREFLY_STEP_SECONDS);
      // They gather into one big light over the last island and fly to the target.
      const last = at.get(path[path.length - 1]);
      const target = finale?.target;
      const to = target ? at.get(target) : undefined;
      if (last && to && pageEl) {
        if (!calm) {
          swarm.forEach((dot) => place(dot, last, 0.3, 0));
          await sleep(0.35);
          const big = document.createElement('span');
          big.className = 'map-bigfly';
          big.style.left = `${last.x}%`;
          big.style.top = `${last.y - 6}%`;
          pageEl.appendChild(big);
          swarm.forEach((dot) => dot.remove());
          swarm.length = 0;
          void big.offsetWidth;
          big.style.left = `${to.x}%`;
          big.style.top = `${to.y}%`;
          await sleep(BIG_LIGHT_SECONDS);
          big.remove();
        }
        const targetEl = target?.startsWith('teaser:') ? teaserEl : islandEls.get(target ?? '');
        targetEl?.classList.add('is-lit');
        if (target) reach(target);
        finale?.onLand?.();
        // v1.11 (PR9): the castle the light lands on wakes up and its windows light ("ちりりん").
        if (target && (finale?.wake?.includes(target) || islandEls.get(target)?.classList.contains('is-asleep'))) {
          await sleep(0.3);
          lightWindows(target);
          finale.onWindows?.();
          el.dataset.windows = target;
          await sleep(WINDOWS_SECONDS);
        }
        await sleep(RING_REST_SECONDS);
      }
      swarm.forEach((dot) => dot.remove());
      el.classList.remove('is-night');
      if (!calm) await sleep(DAWN_SECONDS);
      stars.remove();
    };

    /** Lights one half of a rail through the gate (the part on one page), and its gate twinkles. */
    const lightHalf = (part: LinkPart): void => {
      part.g.classList.remove('is-lit', 'is-reverse', 'is-water', 'is-firefly');
      void part.g.getBoundingClientRect();
      part.g.classList.add('is-lit');
      restart(part.gate, 'is-twinkle');
    };
    const lightBridge = (key: string): void => restart(bridgeEls.get(key), 'is-lit');

    /**
     * v1.11 (PR10) the world's end (第 1 部 §5.2): the song; the pages shrink side by side (names and badges go); the
     * rainbow rails grow; the golden light runs along the trail (a hop and gold on each island, a bell rising on each
     * page); all glow under a faint rainbow and star confetti; the card; the pages come back. With calm motion nothing
     * slides or hops and no confetti falls: the islands turn gold in turn.
     */
    const playEnding = async (end: MapEnding): Promise<void> => {
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      closeChoose();
      el.dataset.ending = 'playing';
      end.onStart?.();
      trail.length = 0;
      delete el.dataset.trail;
      // Every page on one sheet: the strip stays put, each page slides to its place and shrinks.
      el.style.setProperty('--world-seconds', `${WORLD_IN_SECONDS}s`);
      el.classList.add('is-world-moving');
      void el.offsetWidth;
      strip.style.transform = '';
      el.classList.add('is-world');
      await sleep(calm ? 0.1 : WORLD_IN_SECONDS);
      // The rainbow rails: through the gates in order, then the long rail home.
      for (const b of [...end.bridges].sort((a, c) => Number(!!a.home) - Number(!!c.home))) {
        const g = bridgeEls.get(b.key);
        if (!g) continue;
        g.classList.remove('is-pending');
        g.classList.add('is-growing');
        end.onBridge?.();
        await sleep(b.seconds);
      }
      // The golden light along the trail.
      let lastPage: number | undefined;
      let step = 0;
      for (let i = 0; i < end.trail.length; i++) {
        const id = end.trail[i];
        if (i > 0) {
          const from = end.trail[i - 1];
          const key = linkKey(from, id);
          const halves = parts.filter((p) => p.key === key || p.key === linkKey(id, from));
          if (from === end.after && id === end.home) {
            lightBridge(key);
            await sleep(WORLD_CROSS_SECONDS);
          } else if (halves.length > 0 && crossPages(world, halves[0].key) !== null) {
            // Through the gate: its half on this page, the rainbow, its half on the next page.
            const ordered = halves[0].key === key ? halves : [...halves].reverse();
            lightHalf(ordered[0]);
            await sleep(WORLD_CROSS_SECONDS / 3);
            lightBridge(halves[0].key);
            await sleep(WORLD_CROSS_SECONDS / 3);
            if (ordered[1]) lightHalf(ordered[1]);
            await sleep(WORLD_CROSS_SECONDS / 3);
          } else {
            lightLink(from, id, false);
            await sleep(WORLD_STEP_SECONDS);
          }
        }
        const page = nodePage(world, id);
        if (page !== lastPage) step = 0;
        lastPage = page;
        const island = islandEls.get(id);
        if (!calm) restart(island, 'is-hop');
        island?.classList.add('is-gold');
        reach(id);
        end.onStep?.(step++);
      }
      // All of it glows: a faint rainbow over the sky and star confetti (no sound, no fireworks).
      el.classList.add('is-world-glow');
      const rainbow = document.createElement('div');
      rainbow.className = 'map-world-rainbow';
      el.insertBefore(rainbow, header);
      const confetti = document.createElement('div');
      confetti.className = 'map-confetti';
      if (!calm) {
        for (let i = 0; i < WORLD_CONFETTI; i++) {
          const bit = document.createElement('span');
          bit.className = `map-confetto is-${i % 4}`;
          bit.style.left = `${3 + ((i * 37) % 94)}%`;
          bit.style.animationDelay = `${((i * 0.11) % 0.9).toFixed(2)}s`;
          confetti.appendChild(bit);
        }
      }
      el.insertBefore(confetti, header);
      await sleep(WORLD_GLOW_SECONDS);
      await end.onShown();
      el.dataset.ending = 'done';
      // Back to the page it started on.
      confetti.remove();
      rainbow.remove();
      el.classList.remove('is-world-glow');
      el.style.setProperty('--world-seconds', `${WORLD_BACK_SECONDS}s`);
      el.classList.remove('is-world');
      show();
      await sleep(calm ? 0.1 : WORLD_BACK_SECONDS);
      el.classList.remove('is-world-moving');
      for (const island of islandEls.values()) island.classList.remove('is-gold');
    };

    /** The rails that waited: one after another, through the gate to the page beyond. */
    const growLater = async (keys: string[]): Promise<void> => {
      for (const key of keys) {
        const halves = parts.filter((p) => p.key === key);
        const first = halves[0];
        if (!first) continue;
        await turnTo(first.page);
        for (const [i, half] of halves.entries()) {
          if (i > 0) {
            await sleep(GATE_REST_SECONDS);
            await turnTo(half.page);
          }
          half.g.classList.remove('is-pending');
          half.g.classList.add('is-growing');
          if (half.gate) {
            half.gate.classList.remove('is-pending');
            half.gate.classList.add('is-appear');
          }
          await sleep(RAIL_GROW_SECONDS);
        }
        pending.delete(key);
        options.onLinkShown?.(key);
      }
    };

    void (async () => {
      if (finale) {
        if (finale.link && options.fresh.includes(finale.link)) await sleep(RAIL_GROW_SECONDS);
        el.classList.add('is-finale');
        const light = finale.light ?? 'gold';
        const ring = finale.ring ?? [];
        const path = finale.path ?? [];
        if (light === 'gold' && ring.length > 1) {
          for (let i = 0; i <= ring.length; i++) {
            restart(islandEls.get(ring[i % ring.length]), 'is-hop');
            reach(ring[i % ring.length]);
            finale.onHop?.(i);
            if (i === ring.length) break;
            lightLink(ring[i], ring[(i + 1) % ring.length], false);
            await sleep(RING_STEP_SECONDS);
          }
          await sleep(RING_REST_SECONDS);
        } else if (light === 'water' && path.length > 0) {
          // The water light runs along the road; each island bobs up and settles as it arrives.
          for (let i = 0; i < path.length; i++) {
            restart(islandEls.get(path[i]), 'is-bob');
            reach(path[i]);
            finale.onHop?.(i);
            if (i === path.length - 1) break;
            lightLink(path[i], path[i + 1], true);
            await sleep(RING_STEP_SECONDS);
          }
          // At the end of the road: powder snow on the next chapter's islands, and the one that opens wakes up.
          for (const id of finale.wake ?? []) islandEls.get(id)?.classList.remove('is-asleep');
          for (const id of finale.snow ?? []) {
            const island = world.islands.find((i) => i.id === id);
            const pageEl = island && pageEls.get(chapterPage(world, island.chapter));
            if (!island || !pageEl) continue;
            const box = document.createElement('div');
            box.className = 'map-snow';
            box.dataset.island = id;
            box.style.left = `${island.x}%`;
            box.style.top = `${island.y}%`;
            pageEl.appendChild(box);
            snowIn(box, 9, SNOW_SECONDS + 0.6);
          }
          if (finale.snow?.length) finale.onSnow?.();
          await sleep(SNOW_SECONDS + RING_REST_SECONDS);
        } else if (light === 'aurora') {
          // Evening falls a little with a flurry, a band of light crosses the sky, and every island twinkles in turn.
          el.classList.add('is-dusk');
          const flurry = document.createElement('div');
          flurry.className = 'map-flurry';
          el.insertBefore(flurry, header);
          snowIn(flurry, 28, DUSK_SECONDS + 1.6);
          await sleep(DUSK_SECONDS);
          const pageEl = pageEls.get(current);
          const twinkles: HTMLElement[] = [];
          const ids: string[] = [];
          for (const gate of gateEls) {
            if (gate.dataset.gate === 'enter' && gate.parentElement === pageEl) {
              twinkles.push(gate);
              ids.push(`gate:${gate.dataset.gateLink}`);
            }
          }
          for (const id of path) {
            const island = islandEls.get(id);
            if (island) {
              twinkles.push(island);
              ids.push(id);
            }
          }
          const band = document.createElement('div');
          band.className = 'map-aurora';
          band.innerHTML = AURORA;
          band.style.setProperty('--aurora-seconds', `${twinkles.length * TWINKLE_STEP_SECONDS + 0.4}s`);
          pageEl?.appendChild(band);
          for (let i = 0; i < twinkles.length; i++) {
            restart(twinkles[i], 'is-twinkle');
            reach(ids[i]);
            finale.onHop?.(i);
            await sleep(TWINKLE_STEP_SECONDS);
          }
          el.classList.remove('is-dusk');
          await sleep(DAWN_SECONDS);
          band.remove();
        } else if (light === 'firefly' && path.length > 0) {
          await fireflies(path);
        }
        await finale.onShown();
        el.classList.remove('is-finale-playing');
      }

      // The rails that waited (a chapter's end's, through the gate); v1.11 (PR10) then the world's end, then its own.
      const afterEnding = new Set(ending?.later ?? []);
      await growLater(later.filter((key) => !afterEnding.has(key)));
      if (ending) {
        await playEnding(ending);
        await growLater(later.filter((key) => afterEnding.has(key)));
      }

      el.classList.remove('is-busy');
      if (finale) el.dataset.finale = 'done';
      delete el.dataset.growing;
      for (const t of teaserIsTarget ? [] : [teaserEl, teaserLink]) {
        if (!t) continue;
        t.classList.remove('is-waiting');
        t.classList.add('is-appear');
      }
      // The "?" island the big light landed on hops: that is where the story goes next.
      if (teaserIsTarget) teaserEl?.classList.add('is-next');
      markNext(false);
      show();
      if (close) close.hidden = false;
    })();
  });
}
