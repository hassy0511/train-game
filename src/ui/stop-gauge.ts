import type { GaugeState } from '../mission/station-stop';

export interface StopGauge {
  set(state: GaugeState): void;
}

/**
 * Horizontal bar at the top of the screen: the train icon slides toward the stop line.
 * Green = acceptable, gold = perfect, red = past the line. Blinks red when too fast.
 */
export function createStopGauge(root: HTMLElement): StopGauge {
  const el = document.createElement('div');
  el.id = 'stop-gauge';
  el.className = 'stop-gauge';
  el.hidden = true;
  el.innerHTML = `
    <div class="stop-gauge-track">
      <div class="stop-gauge-zone stop-gauge-ok"></div>
      <div class="stop-gauge-zone stop-gauge-perfect"></div>
      <div class="stop-gauge-line"></div>
      <div class="stop-gauge-train"><svg viewBox="0 0 32 20" aria-hidden="true"><rect x="1" y="2" width="30" height="13" rx="4" fill="#3fa7d6"/><rect x="1" y="2" width="30" height="4" rx="2" fill="#f4f4f0"/><circle cx="8" cy="17" r="2.6" fill="#3a3f47"/><circle cx="24" cy="17" r="2.6" fill="#3a3f47"/></svg></div>
    </div>`;
  root.appendChild(el);
  const train = el.querySelector('.stop-gauge-train') as HTMLElement;
  const okZone = el.querySelector('.stop-gauge-ok') as HTMLElement;
  const perfectZone = el.querySelector('.stop-gauge-perfect') as HTMLElement;
  const line = el.querySelector('.stop-gauge-line') as HTMLElement;

  // Layout: the bar spans [-range, +range/4] meters; 0 is the stop line.
  const LINE_AT = 0.8; // fraction of the width where the stop line sits
  let laidOut = false;
  const pct = (offsetMeters: number, range: number): number => {
    // offset = line - front; larger offset = further left.
    const x = LINE_AT - (offsetMeters / range) * LINE_AT;
    return Math.min(Math.max(x, 0), 1) * 100;
  };

  return {
    set(state: GaugeState): void {
      if (!state.visible) {
        el.hidden = true;
        laidOut = false;
        return;
      }
      if (!laidOut) {
        laidOut = true;
        line.style.left = `${LINE_AT * 100}%`;
        okZone.style.left = `${pct(state.ok, state.range)}%`;
        okZone.style.width = `${pct(-state.ok, state.range) - pct(state.ok, state.range)}%`;
        perfectZone.style.left = `${pct(state.perfect, state.range)}%`;
        perfectZone.style.width = `${pct(-state.perfect, state.range) - pct(state.perfect, state.range)}%`;
      }
      el.hidden = false;
      train.style.left = `${pct(state.offset, state.range)}%`;
      el.classList.toggle('is-too-fast', state.tooFast);
      el.classList.toggle('is-over', state.offset < -state.ok);
      el.dataset.offset = state.offset.toFixed(1);
    },
  };
}
