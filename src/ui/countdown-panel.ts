import type { CountdownView } from '../mission/countdown';
import type { SnowWaveView } from '../mission/chase';

export interface CountdownPanel {
  /**
   * Shows the countdown, or v1.10 (4-3) the snow wave's meter (`chase`, when there is no countdown), or hides the
   * panel (both null).
   */
  set(view: CountdownView | null, chase?: SnowWaveView | null): void;
}

/** v1.10 (4-3): the snow wave (round white balls rolling, no face) on the meter's left. */
const WAVE = `<svg class="timer-art" viewBox="0 0 40 32" aria-hidden="true">
  <circle cx="11" cy="22" r="9" fill="#ffffff" stroke="#c9dbea" stroke-width="1.5"/>
  <circle cx="24" cy="21" r="10" fill="#f6f9fc" stroke="#c9dbea" stroke-width="1.5"/>
  <circle cx="17" cy="12" r="7" fill="#ffffff" stroke="#c9dbea" stroke-width="1.5"/>
  <circle cx="33" cy="25" r="6" fill="#ffffff" stroke="#c9dbea" stroke-width="1.5"/>
</svg>`;

/** v1.10 (4-3): the little train at the right end of the snow wave's meter (no face). */
const TRAIN = `<svg class="chase-train" viewBox="0 0 30 18" aria-hidden="true">
  <rect x="2" y="3" width="24" height="11" rx="3" fill="#e94f37"/><rect x="18" y="5" width="6" height="5" rx="1" fill="#cfefff"/>
  <circle cx="8" cy="15" r="2.5" fill="#2b3a4a"/><circle cx="20" cy="15" r="2.5" fill="#2b3a4a"/>
</svg>`;

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
 * v1.10 (3-3): the moon over the sea (no face): it comes up from behind the sea line as the time runs down, half out
 * with COUNTDOWN.lowAt s left of a 75 s countdown. The sea is drawn over it, so the part below the line is hidden.
 */
const MOON = `<svg class="timer-art" viewBox="0 0 40 32" aria-hidden="true">
  <rect x="0" y="0" width="40" height="24" rx="4" fill="#3b4f8f"/>
  <g class="timer-moon"><circle cx="20" cy="24" r="8" fill="#fff4d6"/><circle cx="17" cy="22" r="1.6" fill="#f3e3b8"/></g>
  <path d="M0 24h40v6a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2z" fill="#2f7fbf"/>
  <path d="M3 27c3-1.5 5-1.5 8 0s5 1.5 8 0 5-1.5 8 0 5 1.5 8 0" fill="none" stroke="#bfe9ff" stroke-width="1.4" stroke-linecap="round"/>
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
  const bar = el.querySelector('.timer-bar') as HTMLElement;
  const train = document.createElement('span');
  train.className = 'chase-train-at';
  train.innerHTML = TRAIN;
  bar.appendChild(train);
  /**
   * The snow wave's meter: its picture, then the band to the little train at the right; the snow fills the band from
   * the left as the wave closes in (SNOW_WAVE.meter m away or more: empty; caught: full). It wobbles when close. Never red,
   * never blinking; "セーフ！" in green once the train is past the fence.
   */
  const setChase = (chase: SnowWaveView): void => {
    const safe = chase.state === 'safe';
    const key = `chase|${chase.state}|${chase.fraction.toFixed(2)}`;
    if (key === last) return;
    last = key;
    el.hidden = false;
    el.dataset.mode = 'chase';
    el.dataset.state = safe ? 'safe' : chase.gap < 20 ? 'near' : 'run';
    if (lastIcon !== 'wave') {
      lastIcon = 'wave';
      icon.innerHTML = WAVE;
      el.dataset.icon = 'wave';
    }
    fill.style.transform = `scaleX(${safe ? 1 : 1 - chase.fraction})`;
    num.textContent = safe ? 'セーフ！' : '';
  };
  return {
    set(view, chase): void {
      if (!view && chase) {
        setChase(chase);
        return;
      }
      if (view) el.dataset.mode = 'countdown';
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
        icon.innerHTML = view.icon === 'clock' ? CLOCK : view.icon === 'moon' ? MOON : VOLCANO;
        el.dataset.icon = view.icon;
      }
      if (view.icon === 'moon') {
        // Up from behind the sea line as the time runs down (all the way out at 0).
        const rise = view.state === 'safe' ? 0 : 1 - view.fraction;
        const moon = icon.querySelector<SVGGElement>('.timer-moon');
        moon?.setAttribute('transform', `translate(0 ${(8 * (1 - rise / 0.87)).toFixed(2)})`);
      }
      fill.style.transform = `scaleX(${view.state === 'safe' ? 1 : view.fraction})`;
      num.textContent = view.state === 'safe' ? 'セーフ！' : String(view.seconds);
    },
  };
}
