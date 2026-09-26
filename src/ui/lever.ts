export interface LeverOptions {
  labels: readonly string[];
  /** Notch the lever starts on. */
  initial?: number;
  onChange(notch: number): void;
}

export interface Lever {
  setNotch(notch: number): void;
  relayout(): void;
  /** Make one notch's mark glow ("this speed here"), or none. */
  setHint(notch: number | null): void;
  /** v1.7: a mark on the knob while the lever does nothing: "rocket" (a flame), "slide" (sparkles), or none. */
  setMark(mark: 'rocket' | 'slide' | null): void;
}

const KNOB_MARKS = `<svg class="knob-mark mark-rocket" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 4 6 7 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-7 0 3 1.5 4 3 4-1-4 0-6 0-9z" fill="#e8590c"/><path d="M12 12c1.5 1.5 2.5 3 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.5 1-3 2.5-4.5z" fill="#ffe066"/></svg><svg class="knob-mark mark-slide" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3l1.6 3.4L12 8l-3.4 1.6L7 13l-1.6-3.4L2 8l3.4-1.6zM17 10l1.2 2.6 2.8 1.4-2.8 1.4L17 18l-1.2-2.6L13 14l2.8-1.4z" fill="#1c7ed6"/></svg>`;

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
  knob.innerHTML = KNOB_MARKS;
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
    setMark(mark): void {
      const v = mark ?? '';
      if (knob.dataset.mark !== v) knob.dataset.mark = v;
    },
    setHint(n: number | null): void {
      detents.forEach((d, i) => {
        const v = i === n ? '1' : '0';
        if (d.dataset.hint !== v) d.dataset.hint = v;
      });
    },
  };
}
