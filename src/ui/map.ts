import type { WorldFile, WorldLinkOptions } from '../world/types';

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
}

/** A chapter's end (docs/PHASE7_FINISH.md §3): plays once, after its rail has grown in. */
export interface MapFinale {
  /** "from>to": the rail that closes the chapter (it is among `fresh`). */
  link: string;
  /** Islands in order: a golden light runs round them once and each one hops as it passes. */
  ring?: string[];
  /** Each hop of the light (the sparkle sound). */
  onHop?: (index: number) => void;
  /** The light is round: show the card; the map waits for it. */
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
  /** The island to go to next: it bounces. */
  next?: string;
  /** Label of the close button ("もどる", "タイトルへ"); omitted = no button. */
  closeLabel?: string;
  finale?: MapFinale;
  /** Floats in after the finale when there is one, else it is simply there. */
  teaser?: MapTeaser;
}

export type MapChoice = { kind: 'stage'; id: string } | { kind: 'close' };

export const linkKey = (from: string, to: string): string => `${from}>${to}`;

const SVG = 'http://www.w3.org/2000/svg';
const RAIL_GROW_SECONDS = 1.4;
/** The golden light: seconds per link of the ring (6 links: about 3 s round). */
const RING_STEP_SECONDS = 0.5;
/** A breath between the light coming home and the card. */
const RING_REST_SECONDS = 0.5;
const SAY_SECONDS = 2;
/** Map area aspect (16:10): SVG x units per % of width. */
const K = 1.6;
const WIDE = 100 * K;

const sleep = (seconds: number): Promise<void> => new Promise((ok) => window.setTimeout(ok, seconds * 1000));

/**
 * The world map: islands floating in the sky, joined by rail as stages are cleared. Tapping an open island
 * resolves with its stage id. Pictures are public/map/<id>.png (scripts/render-map.mjs).
 */
export function showMap(root: HTMLElement, world: WorldFile, options: MapOptions): Promise<MapChoice> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'map';
    el.className = 'overlay map';
    const header = document.createElement('div');
    header.className = 'map-header';
    const h = document.createElement('h1');
    h.textContent = 'ちず';
    header.appendChild(h);
    const area = document.createElement('div');
    area.className = 'map-area';

    const finish = (choice: MapChoice): void => {
      el.remove();
      resolve(choice);
    };

    const { finale, teaser } = options;
    // Where each node sits (% of the area): the islands, and the teaser's "?" island.
    const at = new Map<string, { x: number; y: number }>(world.islands.map((i) => [i.id, { x: i.x, y: i.y }]));
    if (teaser) at.set(teaser.id, { x: teaser.x, y: teaser.y });

    // Rail between islands, under them.
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'map-links');
    // The area is always 16:10, so one user unit is the same across and down (x% × 1.6, y%).
    svg.setAttribute('viewBox', `0 0 ${WIDE} 100`);
    const linkEls = new Map<string, SVGGElement>();
    let teaserLink: SVGGElement | null = null;
    for (const [from, to, opts] of world.links as [string, string, WorldLinkOptions?][]) {
      const isTeaser = to.startsWith('teaser:');
      if (isTeaser && teaser?.id !== to) continue;
      const a = at.get(from);
      const b = at.get(to);
      if (!a || !b) continue;
      const key = linkKey(from, to);
      const laid = !isTeaser && options.laid.includes(key);
      // A gentle arc: the control point sits above the midpoint, unless the link names its own.
      const [cx, cy] = opts?.via ?? [(a.x + b.x) / 2, Math.min(a.y, b.y) - 10];
      const d = `M ${a.x * K} ${a.y} Q ${cx * K} ${cy} ${b.x * K} ${b.y}`;
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', laid ? 'map-link is-laid' : 'map-link');
      g.dataset.link = key;
      const layers = laid ? ['bed', 'rail'] : ['dots'];
      // The ring's rails carry the golden light (drawn only while it passes).
      if (laid && finale?.ring) layers.push('glow', 'glow-core');
      for (const cls of layers) {
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', cls);
        // The rail grows in (and the light runs) with a dash offset over a normalised length.
        if (cls !== 'bed' && cls !== 'dots') path.setAttribute('pathLength', '100');
        g.appendChild(path);
      }
      if (laid && options.fresh.includes(key)) g.classList.add('is-growing');
      if (isTeaser) {
        g.classList.add('is-teaser-link');
        teaserLink = g;
      }
      linkEls.set(key, g);
      svg.appendChild(g);
    }
    area.appendChild(svg);

    const info = new Map(options.islands.map((i) => [i.id, i]));
    const islandEls = new Map<string, HTMLButtonElement>();
    // A wiggle is a one-off: its class goes when it ends, so the island's own motion (the "?" island floats)
    // comes back. The same for the "?" island's fade-in.
    const wiggle = (btn: HTMLElement): void => {
      btn.classList.remove('is-wiggle', 'is-appear');
      void btn.offsetWidth;
      btn.classList.add('is-wiggle');
    };
    area.addEventListener('animationend', (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('map-island')) return;
      if (e.animationName === 'island-wiggle') target.classList.remove('is-wiggle');
      if (e.animationName === 'teaser-appear') target.classList.remove('is-appear');
    });
    for (const island of world.islands) {
      const state = info.get(island.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-island';
      btn.dataset.island = island.id;
      btn.style.left = `${island.x}%`;
      btn.style.top = `${island.y}%`;
      // Islands higher up the map sit on top: their name tag hangs below them, over the island underneath.
      btn.style.zIndex = String(100 - Math.round(island.y));
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      const known = !!state?.title;
      img.src = `${import.meta.env.BASE_URL}map/${known && island.diorama ? island.id : 'unknown'}.png`;
      btn.appendChild(img);
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
          badge.className = 'map-badge';
          badge.textContent = `きろく ${state.recordsFound}/${state.recordsTotal}${state.needsLater ? ' ？' : ''}`;
          btn.appendChild(badge);
        }
        if (state.cleared) btn.classList.add('is-cleared');
        if (!state.unlocked) btn.classList.add('is-locked');
        if (options.next === island.id) {
          btn.classList.add('is-next');
          // Wait for the rail to reach it before it starts bouncing.
          if (options.fresh.length > 0) btn.style.animationDelay = `${RAIL_GROW_SECONDS}s`;
        }
      }
      btn.addEventListener('click', () => {
        if (state?.title && state.unlocked) {
          finish({ kind: 'stage', id: island.id });
          return;
        }
        // Not yet: a little wiggle, nothing else.
        wiggle(btn);
      });
      islandEls.set(island.id, btn);
      area.appendChild(btn);
    }

    // The next chapter's "?" island: it only wiggles and says "see you next time".
    let teaserEl: HTMLButtonElement | null = null;
    if (teaser) {
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
        say.style.left = `${teaser.x + 8}%`;
        say.style.top = `${teaser.y - 6}%`;
        area.appendChild(say);
        const shown = say;
        sayTimer = window.setTimeout(() => shown.remove(), SAY_SECONDS * 1000);
      });
      teaserEl = btn;
      area.appendChild(btn);
    }

    el.append(header, area);
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
    root.appendChild(el);

    if (!finale) return;
    // The finale: hands off the map (and no way out) until the card has been seen.
    el.dataset.finale = 'playing';
    el.classList.add('is-finale-playing');
    if (close) close.hidden = true;
    teaserEl?.classList.add('is-waiting');
    teaserLink?.classList.add('is-waiting');
    void (async () => {
      if (options.fresh.includes(finale.link)) await sleep(RAIL_GROW_SECONDS);
      el.classList.add('is-finale');
      const ring = finale.ring ?? [];
      if (ring.length > 1) {
        for (let i = 0; i <= ring.length; i++) {
          const here = islandEls.get(ring[i % ring.length]);
          if (here) {
            here.classList.remove('is-hop');
            void here.offsetWidth;
            here.classList.add('is-hop');
          }
          finale.onHop?.(i);
          if (i === ring.length) break;
          const from = ring[i];
          const to = ring[(i + 1) % ring.length];
          const forward = linkEls.get(linkKey(from, to));
          const link = forward ?? linkEls.get(linkKey(to, from));
          if (link) {
            link.classList.toggle('is-reverse', !forward);
            link.classList.add('is-lit');
          }
          await sleep(RING_STEP_SECONDS);
        }
        await sleep(RING_REST_SECONDS);
      }
      await finale.onShown();
      el.classList.remove('is-finale-playing');
      el.dataset.finale = 'done';
      for (const t of [teaserEl, teaserLink]) {
        if (!t) continue;
        t.classList.remove('is-waiting');
        t.classList.add('is-appear');
      }
      if (close) close.hidden = false;
    })();
  });
}
