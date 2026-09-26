export type TitleChoice = 'start' | 'continue';

const GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"/><circle cx="12" cy="12" r="3.4" fill="#fff"/></svg>`;

export interface TitleOptions {
  /** Chapters so far with a star once all their islands are cleared ("1しょう ★ 2しょう ☆"); shown from the first star. */
  chapters?: { label: string; done: boolean }[];
  /** Label of the "continue" button (e.g. "つづきから（きょうりゅうの たに）"); omitted = no button. */
  continueLabel?: string;
  /** Opens the world map; omitted = no button. */
  onMap?: () => void;
  /** Opens the picture book; omitted = no button. */
  onZukan?: () => void;
  /** Opens the settings (the gear in the corner); omitted = no gear. */
  onSettings?: () => void;
}

/** Title screen. Resolves with the button the player tapped. */
export function showTitle(root: HTMLElement, title: string, options: TitleOptions = {}): Promise<TitleChoice> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'title-screen';
    el.className = 'overlay title-screen';
    const h = document.createElement('h1');
    h.className = 'title-text';
    h.textContent = title;
    const buttons = document.createElement('div');
    buttons.className = 'title-buttons';
    const add = (id: string, label: string, onClick: () => void, secondary = false): void => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = id;
      btn.className = secondary ? 'big-button is-secondary' : 'big-button';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      buttons.appendChild(btn);
    };
    const pick = (choice: TitleChoice) => () => {
      el.remove();
      resolve(choice);
    };
    add('title-start', 'はじめる', pick('start'), !!options.continueLabel);
    if (options.continueLabel) add('title-continue', options.continueLabel, pick('continue'));
    if (options.onMap) add('title-map', 'ちず', options.onMap, true);
    if (options.onZukan) add('title-zukan', 'ずかん', options.onZukan, true);
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
    const stamp = document.createElement('div');
    stamp.className = 'build-stamp';
    stamp.textContent = `build ${__BUILD_ID__}`;
    el.append(h, ...(row ? [row] : []), buttons, stamp);
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
