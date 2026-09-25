import type { WorldFile } from '../world/types';

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
}

export type MapChoice = { kind: 'stage'; id: string } | { kind: 'close' };

export const linkKey = (from: string, to: string): string => `${from}>${to}`;

const SVG = 'http://www.w3.org/2000/svg';
const RAIL_GROW_SECONDS = 1.4;
/** Map area aspect (16:10): SVG x units per % of width. */
const K = 1.6;
const WIDE = 100 * K;

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

    // Rail between islands, under them.
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'map-links');
    // The area is always 16:10, so one user unit is the same across and down (x% × 1.6, y%).
    svg.setAttribute('viewBox', `0 0 ${WIDE} 100`);
    const byId = new Map(world.islands.map((i) => [i.id, i]));
    for (const [from, to] of world.links) {
      const a = byId.get(from);
      const b = byId.get(to);
      if (!a || !b) continue;
      const key = linkKey(from, to);
      const laid = options.laid.includes(key);
      // A gentle arc: the control point sits above the midpoint.
      const d = `M ${a.x * K} ${a.y} Q ${((a.x + b.x) / 2) * K} ${Math.min(a.y, b.y) - 10} ${b.x * K} ${b.y}`;
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', laid ? 'map-link is-laid' : 'map-link');
      g.dataset.link = key;
      for (const cls of laid ? ['bed', 'rail'] : ['dots']) {
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', cls);
        // The rail grows in with a dash offset over a normalised length.
        if (cls === 'rail') path.setAttribute('pathLength', '100');
        g.appendChild(path);
      }
      if (laid && options.fresh.includes(key)) g.classList.add('is-growing');
      svg.appendChild(g);
    }
    area.appendChild(svg);

    const info = new Map(options.islands.map((i) => [i.id, i]));
    for (const island of world.islands) {
      const state = info.get(island.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-island';
      btn.dataset.island = island.id;
      btn.style.left = `${island.x}%`;
      btn.style.top = `${island.y}%`;
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
        btn.classList.remove('is-wiggle');
        void btn.offsetWidth;
        btn.classList.add('is-wiggle');
      });
      area.appendChild(btn);
    }

    el.append(header, area);
    if (options.closeLabel) {
      const close = document.createElement('button');
      close.type = 'button';
      close.id = 'map-close';
      close.className = 'big-button is-secondary map-close';
      close.textContent = options.closeLabel;
      close.addEventListener('click', () => finish({ kind: 'close' }));
      el.appendChild(close);
    }
    root.appendChild(el);
  });
}
