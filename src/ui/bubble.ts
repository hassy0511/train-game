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
  // v1.11 (6-1): an open hand held up ("とまって〜！"): a round palm, four fingers and a thumb (a mitten shape; no lines).
  'hand-stop': `<svg class="bubble-icon" viewBox="0 0 40 32" aria-hidden="true">
  <g fill="#ffd9b8" stroke="#c9825a" stroke-width="1.6" stroke-linejoin="round">
    <rect x="13" y="3" width="4.2" height="14" rx="2.1"/><rect x="17.6" y="1.5" width="4.2" height="15" rx="2.1"/>
    <rect x="22.2" y="3" width="4.2" height="14" rx="2.1"/><rect x="26.6" y="6" width="3.8" height="11" rx="1.9"/>
    <path d="M13 13c0-2 2-2.6 3.2-1.2l1.4 1.8V12h12.8v7.5c0 5.5-4 9.5-9 9.5-4.2 0-7-2.6-8.2-6.4L10.2 17c-.8-1.8 1.4-3.2 2.8-1.6z"/>
  </g>
  <path d="M5 8l4 2M4 15h4M5 22l4-2" stroke="#e8579f" stroke-width="2" stroke-linecap="round"/>
</svg>`,
  // v1.11 (6-1): a running foot and an arrow bending back ("こっちが うしろへ いったら…？").
  'run-swirl': `<svg class="bubble-icon" viewBox="0 0 40 32" aria-hidden="true">
  <path d="M6 24c4 0 7-1 9-3l3-5c1-1.6 3-1.6 3.6.2l.6 3.4c.3 1.4 1.5 2.4 3 2.4H28c1.6 0 2.4 1.8 1.4 3-.4.5-1 .8-1.6.8H7c-1 0-1.8-.8-1.8-1.8z" fill="#9fd3f4" stroke="#3a6a9a" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M26 11c5-4 11-1 10 4-.6 3.6-5 5-8 3" fill="none" stroke="#e8579f" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M24.5 14.5l3.5 3.8-5 1.2z" fill="#e8579f"/>
  <path d="M3 18h5M2 13h5" stroke="#3a6a9a" stroke-width="1.6" stroke-linecap="round"/>
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
