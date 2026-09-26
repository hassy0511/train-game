export interface PauseControls {
  show(): void;
  hide(): void;
}

export interface PauseHandlers {
  /** The game stops (true) or goes on (false). */
  onPause(paused: boolean): void;
  /** "ちずに もどる": resolves when the map was closed again (the menu comes back). */
  onMap(): Promise<void>;
}

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`;

/** Small "||" button in the corner; it stops the game and offers "つづける" and "ちずに もどる". */
export function createPause(root: HTMLElement, handlers: PauseHandlers): PauseControls {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'pause';
  button.className = 'corner-button pause-button';
  button.setAttribute('aria-label', 'いちじ ていし');
  button.innerHTML = ICON;
  button.hidden = true;

  const openMenu = (): void => {
    handlers.onPause(true);
    const el = document.createElement('div');
    el.id = 'pause-menu';
    el.className = 'overlay pause-menu';
    const h = document.createElement('h1');
    h.textContent = 'ひとやすみ';
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.id = 'pause-resume';
    resume.className = 'big-button';
    resume.textContent = 'つづける';
    resume.addEventListener('click', () => {
      el.remove();
      handlers.onPause(false);
    });
    const map = document.createElement('button');
    map.type = 'button';
    map.id = 'pause-map';
    map.className = 'big-button is-secondary';
    map.textContent = 'ちずに もどる';
    map.addEventListener('click', () => {
      el.hidden = true;
      void handlers.onMap().then(() => {
        el.hidden = false;
      });
    });
    el.append(h, resume, map);
    root.appendChild(el);
  };
  button.addEventListener('click', openMenu);
  root.appendChild(button);

  return {
    show(): void {
      button.hidden = false;
    },
    hide(): void {
      button.hidden = true;
    },
  };
}
