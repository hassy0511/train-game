export type TitleChoice = 'start' | 'continue';

const GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"/><circle cx="12" cy="12" r="3.4" fill="#fff"/></svg>`;

/** The rail under the title's two lines: two rails on sleepers, fading out at both ends. */
const RAIL = `<svg class="title-rail" viewBox="0 0 440 30" aria-hidden="true">
  <defs>
    <linearGradient id="title-rail-fade" x1="0" x2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.1" stop-color="#fff"/>
      <stop offset="0.9" stop-color="#fff"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="title-rail-mask"><rect width="440" height="30" fill="url(#title-rail-fade)"/></mask>
  </defs>
  <g mask="url(#title-rail-mask)">
    ${Array.from({ length: 20 }, (_, i) => `<rect x="${4 + i * 22}" y="3" width="11" height="24" rx="2.5" fill="#8a5a34" stroke="#5e3b20" stroke-width="1.5"/>`).join('')}
    <rect x="0" y="6.5" width="440" height="5" rx="2.5" fill="#f4f4f0" stroke="#1d4f91" stroke-width="1.5"/>
    <rect x="0" y="18.5" width="440" height="5" rx="2.5" fill="#f4f4f0" stroke="#1d4f91" stroke-width="1.5"/>
  </g>
</svg>`;

export interface TitleOptions {
  /** The title in lines (two: "ワンダーごうと" / "ふしぎな せかい"). */
  lines?: readonly string[];
  /** Chapters so far with a star once all their islands are cleared ("1しょう ★ 2しょう ☆"); shown from the first star. */
  chapters?: { label: string; done: boolean }[];
  /** Label of the "continue" button (e.g. "つづきから（きょうりゅうの たに）"); omitted = no button. */
  continueLabel?: string;
  /** Every stage there is has been cleared: the map is the big button (to go back for the records). */
  allCleared?: boolean;
  /** Opens the world map; omitted = no button. */
  onMap?: () => void;
  /** Opens the picture book; omitted = no button. */
  onZukan?: () => void;
  /** Opens the settings (the gear in the corner); omitted = no gear. */
  onSettings?: () => void;
}

/**
 * Title screen, over the stage's 3D (the camera swings around the standing train behind it): the two-line title on
 * a rail with the partner, the chapter stars, then one big button — "つづきから" when there is a next stage, "ちず"
 * once everything is cleared, else "はじめる" — and the others small (PHASE7_FINISH §4 item 6). Resolves with the
 * button the player tapped ("ちず" and "ずかん" open on top and come back here).
 */
export function showTitle(root: HTMLElement, title: string, options: TitleOptions = {}): Promise<TitleChoice> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'title-screen';
    el.className = 'overlay title-screen';

    const logo = document.createElement('div');
    logo.className = 'title-logo';
    const pico = document.createElement('img');
    pico.className = 'title-pico';
    pico.src = `${import.meta.env.BASE_URL}title/pico.png`;
    pico.alt = '';
    pico.draggable = false;
    const h = document.createElement('h1');
    h.className = 'title-text';
    h.setAttribute('aria-label', title);
    for (const line of options.lines ?? [title]) {
      const span = document.createElement('span');
      span.className = 'title-line';
      span.textContent = line;
      h.appendChild(span);
    }
    const words = document.createElement('div');
    words.className = 'title-words';
    words.append(h);
    words.insertAdjacentHTML('beforeend', RAIL);
    logo.append(pico, words);

    const pick = (choice: TitleChoice) => () => {
      el.remove();
      resolve(choice);
    };
    const primary = options.continueLabel ? 'continue' : options.allCleared && options.onMap ? 'map' : 'start';
    const main = document.createElement('div');
    main.className = 'title-main';
    const buttons = document.createElement('div');
    buttons.className = 'title-buttons';
    const add = (id: string, key: typeof primary | 'zukan', label: string, onClick: () => void): void => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = id;
      btn.className = key === primary ? 'big-button is-primary' : 'big-button is-secondary';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      (key === primary ? main : buttons).appendChild(btn);
    };
    if (options.continueLabel) add('title-continue', 'continue', options.continueLabel, pick('continue'));
    add('title-start', 'start', 'はじめる', pick('start'));
    if (options.onMap) add('title-map', 'map', 'ちず', options.onMap);
    if (options.onZukan) add('title-zukan', 'zukan', 'ずかん', options.onZukan);

    const chapters = options.chapters ?? [];
    let row: HTMLElement | null = null;
    if (chapters.some((c) => c.done)) {
      row = document.createElement('div');
      row.id = 'title-chapters';
      row.className = 'title-chapters';
      for (const c of chapters) {
        const item = document.createElement('span');
        item.className = c.done ? 'title-chapter is-done' : 'title-chapter';
        const star = document.createElement('span');
        star.className = 'title-star';
        star.textContent = c.done ? '★' : '☆';
        item.append(`${c.label} `, star);
        row.appendChild(item);
      }
    }
    const top = document.createElement('div');
    top.className = 'title-top';
    top.append(logo, ...(row ? [row] : []));
    const bottom = document.createElement('div');
    bottom.className = 'title-bottom';
    bottom.append(main, buttons);

    const stamp = document.createElement('div');
    stamp.className = 'build-stamp';
    stamp.textContent = `build ${__BUILD_ID__}`;
    el.append(top, bottom, stamp);
    if (options.onSettings) {
      const gear = document.createElement('button');
      gear.type = 'button';
      gear.id = 'title-settings';
      gear.className = 'gear-button';
      gear.setAttribute('aria-label', 'せってい');
      gear.innerHTML = GEAR;
      gear.addEventListener('click', options.onSettings);
      el.appendChild(gear);
    }
    root.appendChild(el);
  });
}
