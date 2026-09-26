import type { CountdownView } from '../mission/countdown';

export interface CountdownPanel {
  /** Shows the countdown, or hides the panel (null). */
  set(view: CountdownView | null): void;
}

/** A round, friendly volcano (it fidgets when time is short). */
const VOLCANO = `<svg class="timer-art" viewBox="0 0 40 32" aria-hidden="true">
  <circle class="puff" cx="22" cy="6" r="4" fill="#ffffff"/><circle class="puff" cx="27" cy="4" r="3" fill="#f1f3f5"/>
  <path d="M3 30c4-2 8-10 12-17 1.5-2 8.5-2 10 0 4 7 8 15 12 17z" fill="#8c6f5a"/>
  <path d="M15 13c1.5-2 8.5-2 10 0-1.2 1.3-8.8 1.3-10 0z" fill="#5b4636"/>
  <path d="M3 30c4-2 6-5 8-8 3 2 5 2 8 0 3 2 6 2 9 0 2 3 5 6 9 8z" fill="#6aa84f"/>
  <circle cx="17" cy="20" r="1.3" fill="#3b2f24"/><circle cx="23" cy="20" r="1.3" fill="#3b2f24"/>
</svg>`;

const CLOCK = `<svg class="timer-art" viewBox="0 0 40 32" aria-hidden="true">
  <circle cx="20" cy="17" r="13" fill="#fff" stroke="#2b3a4a" stroke-width="3"/>
  <path d="M20 17V9M20 17l6 4" stroke="#2b3a4a" stroke-width="3" stroke-linecap="round"/>
</svg>`;

/**
 * v1.7: the countdown panel at the top, beside the speed word: a picture, an orange band that shrinks and the
 * seconds left. Never red, never blinking; "セーフ！" in green when beaten.
 */
export function createCountdownPanel(root: HTMLElement): CountdownPanel {
  const el = document.createElement('div');
  el.id = 'timer';
  el.className = 'timer';
  el.hidden = true;
  el.innerHTML = `<span class="timer-icon"></span><span class="timer-bar"><span class="timer-fill"></span></span><span class="timer-num"></span>`;
  root.appendChild(el);
  const icon = el.querySelector('.timer-icon') as HTMLElement;
  const fill = el.querySelector('.timer-fill') as HTMLElement;
  const num = el.querySelector('.timer-num') as HTMLElement;
  let last = '';
  let lastIcon = '';
  return {
    set(view): void {
      const key = view ? `${view.state}|${view.seconds}|${view.fraction.toFixed(3)}|${view.icon}` : '';
      if (key === last) return;
      last = key;
      if (!view) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.dataset.state = view.state;
      if (view.icon !== lastIcon) {
        lastIcon = view.icon;
        icon.innerHTML = view.icon === 'clock' ? CLOCK : VOLCANO;
      }
      fill.style.transform = `scaleX(${view.state === 'safe' ? 1 : view.fraction})`;
      num.textContent = view.state === 'safe' ? 'セーフ！' : String(view.seconds);
    },
  };
}
