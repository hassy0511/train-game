import type { BubbleIcon, Speaker } from '../stage/types';
import { BUBBLE_SECONDS } from '../train/params';

export interface Bubbles {
  /** Shows the line and resolves when tapped or after the timeout. Lines queue up in order. `name` replaces the speaker's name. */
  say(text: string, who?: Speaker, name?: string, icon?: BubbleIcon): Promise<void>;
  /** Drops the line showing and every queued one (their promises resolve right away). */
  clear(): void;
  /** v1.11 (PR5): nothing is showing and nothing is waiting (a line that may as well not come can be said now). */
  readonly quiet: boolean;
}

/**
 * v1.11 (5-3): the bubble's little pictures (drawn for this game). "ride": the Wonder train's coach with a swirly hat
 * in its window (Sakasa riding it; no face), as on the "のせて" card.
 */
const ICONS: Record<BubbleIcon, string> = {
  ride: `<svg class="bubble-icon" viewBox="0 0 40 32" aria-hidden="true">
  <path d="M4 27h32" stroke="#8a6a4a" stroke-width="2" stroke-linecap="round"/>
  <rect x="6" y="9" width="28" height="15" rx="4" fill="#9fd3f4" stroke="#3a6a9a" stroke-width="2"/>
  <circle cx="12" cy="25" r="3" fill="#5a4a3a"/><circle cx="28" cy="25" r="3" fill="#5a4a3a"/>
  <rect x="14" y="12" width="12" height="8" rx="1.5" fill="#fff"/>
  <path d="M20 16.2c0-1 1.6-1 1.6.2 0 1.6-2.8 1.8-3.2-.2-.4-2.2 3-3.2 4.6-1.2" fill="none" stroke="#e8579f" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M20 6.5c0-2 -3-2.4-3-.2 0 1.6 3 3 3 3s3-1.4 3-3c0-2.2-3-1.8-3 .2z" fill="#e8579f"/>
</svg>`,
};

const SPEAKER_CLASS: Record<Speaker, string> = { partner: 'is-partner', amanojaku: 'is-amanojaku', passenger: 'is-passenger' };

/** Speech bubbles as DOM. One at a time; tapping advances. */
export function createBubbles(root: HTMLElement, partnerName: string): Bubbles {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'bubble';
  el.className = 'bubble';
  el.hidden = true;
  const name = document.createElement('span');
  name.className = 'bubble-name';
  const text = document.createElement('span');
  text.className = 'bubble-text';
  const icon = document.createElement('span');
  icon.className = 'bubble-pic';
  icon.hidden = true;
  el.append(name, icon, text);
  root.appendChild(el);

  let queue: Promise<void> = Promise.resolve();
  /** Bumped by clear(): queued lines from an older generation are skipped. */
  let generation = 0;
  let dismiss: (() => void) | null = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dismiss?.();
  });

  const showOne = (line: string, who: Speaker, speakerName?: string, pic?: BubbleIcon): Promise<void> =>
    new Promise((resolve) => {
      el.className = `bubble ${SPEAKER_CLASS[who]}`;
      name.textContent = speakerName ?? (who === 'partner' ? partnerName : who === 'amanojaku' ? 'サカサ' : 'たんけんたいの なかま');
      text.textContent = line;
      icon.innerHTML = pic ? ICONS[pic] : '';
      icon.hidden = !pic;
      if (pic) el.dataset.icon = pic;
      else delete el.dataset.icon;
      el.hidden = false;
      el.dataset.line = line;
      const timer = window.setTimeout(() => dismiss?.(), BUBBLE_SECONDS * 1000);
      dismiss = () => {
        window.clearTimeout(timer);
        dismiss = null;
        el.hidden = true;
        delete el.dataset.line;
        resolve();
      };
    });

  let pending = 0;
  return {
    say(line, who = 'partner', speakerName?: string, pic?: BubbleIcon): Promise<void> {
      const g = generation;
      pending += 1;
      queue = queue
        .then(() => (g === generation ? showOne(line, who, speakerName, pic) : undefined))
        .finally(() => {
          pending = Math.max(0, pending - 1);
        });
      return queue;
    },
    clear(): void {
      generation += 1;
      dismiss?.();
    },
    get quiet(): boolean {
      return pending === 0;
    },
  };
}
