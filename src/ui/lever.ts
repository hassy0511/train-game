export interface LeverOptions {
  labels: readonly string[];
  /** Notch the lever starts on. */
  initial?: number;
  onChange(notch: number): void;
}

export interface Lever {
  setNotch(notch: number): void;
  relayout(): void;
}

/** Vertical master controller: drag with the thumb, snaps to detents, keeps its position when released. */
export function createLever(root: HTMLElement, opts: LeverOptions): Lever {
  const count = opts.labels.length;
  const max = count - 1;

  const lever = document.createElement('div');
  lever.id = 'lever';
  lever.className = 'lever';
  const track = document.createElement('div');
  track.className = 'lever-track';
  lever.appendChild(track);

  const detents: HTMLElement[] = [];
  for (let n = 0; n < count; n++) {
    const d = document.createElement('div');
    d.className = 'lever-detent';
    d.dataset.notch = String(n);
    const label = document.createElement('span');
    label.className = 'lever-label';
    label.textContent = opts.labels[n];
    d.appendChild(label);
    track.appendChild(d);
    detents.push(d);
  }
  const knob = document.createElement('div');
  knob.id = 'lever-knob';
  knob.className = 'lever-knob';
  track.appendChild(knob);
  root.appendChild(lever);

  let notch = opts.initial ?? 0;
  let fraction = notch / max;
  let dragging = false;
  const KNOB_HALF = 22;

  const centerY = (f: number): number => {
    const h = track.clientHeight;
    return KNOB_HALF + (h - 2 * KNOB_HALF) * (1 - f);
  };

  const relayout = (): void => {
    detents.forEach((d, n) => {
      d.style.top = `${centerY(n / max)}px`;
    });
    knob.style.top = `${centerY(fraction)}px`;
  };

  const applyNotch = (n: number): void => {
    if (n === notch) return;
    notch = n;
    detents.forEach((d, i) => d.classList.toggle('is-active', i === n));
    opts.onChange(n);
  };

  const fractionFromPointer = (clientY: number): number => {
    const rect = track.getBoundingClientRect();
    const usable = rect.height - 2 * KNOB_HALF;
    const f = (rect.bottom - KNOB_HALF - clientY) / usable;
    return Math.min(Math.max(f, 0), 1);
  };

  lever.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    lever.classList.add('is-dragging');
    lever.setPointerCapture(e.pointerId);
    fraction = fractionFromPointer(e.clientY);
    applyNotch(Math.round(fraction * max));
    knob.style.top = `${centerY(fraction)}px`;
  });
  lever.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    fraction = fractionFromPointer(e.clientY);
    applyNotch(Math.round(fraction * max));
    knob.style.top = `${centerY(fraction)}px`;
  });
  const release = (): void => {
    if (!dragging) return;
    dragging = false;
    lever.classList.remove('is-dragging');
    fraction = notch / max;
    knob.style.top = `${centerY(fraction)}px`;
  };
  lever.addEventListener('pointerup', release);
  lever.addEventListener('pointercancel', release);

  detents[notch].classList.add('is-active');
  requestAnimationFrame(relayout);

  return {
    setNotch(n: number): void {
      applyNotch(Math.min(Math.max(n, 0), max));
      fraction = notch / max;
      knob.style.top = `${centerY(fraction)}px`;
    },
    relayout,
  };
}
