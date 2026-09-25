export type TitleChoice = 'start' | 'continue';

export interface TitleOptions {
  /** Label of the "continue" button (e.g. "つづきから（きょうりゅうの たに）"); omitted = no button. */
  continueLabel?: string;
  /** Opens the world map; omitted = no button. */
  onMap?: () => void;
  /** Opens the picture book; omitted = no button. */
  onZukan?: () => void;
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
    const stamp = document.createElement('div');
    stamp.className = 'build-stamp';
    stamp.textContent = `build ${__BUILD_ID__}`;
    el.append(h, buttons, stamp);
    root.appendChild(el);
  });
}
