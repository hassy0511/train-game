/**
 * v1.12 (えんしゅつ): the movie's black bars at the top and bottom of the screen (a DOM overlay over the 3D view, under
 * the speech bubbles, the cards and "▶▶"). They slide in and out; with prefers-reduced-motion they just appear.
 * `#app.is-letterbox` lifts the speech bubble above the bottom bar (styles.css).
 */
export interface Letterbox {
  set(on: boolean): void;
  readonly on: boolean;
}

export function createLetterbox(root: HTMLElement, app: HTMLElement): Letterbox {
  const el = document.createElement('div');
  el.id = 'letterbox';
  el.className = 'letterbox';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="letterbox-bar is-top"></div><div class="letterbox-bar is-bottom"></div>';
  root.appendChild(el);
  let on = false;
  return {
    set(next: boolean): void {
      if (next === on) return;
      on = next;
      el.classList.toggle('is-on', on);
      app.classList.toggle('is-letterbox', on);
      app.dataset.letterbox = on ? '1' : '0';
    },
    get on(): boolean {
      return on;
    },
  };
}

/** The part of the screen height each bar covers (styles.css `--letterbox`). The shots frame inside what is left. */
export const LETTERBOX_PART = 0.11;
