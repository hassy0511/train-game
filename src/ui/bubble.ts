import type { Speaker } from '../stage/types';
import { BUBBLE_SECONDS } from '../train/params';

export interface Bubbles {
  /** Shows the line and resolves when tapped or after the timeout. Lines queue up in order. `name` replaces the speaker's name. */
  say(text: string, who?: Speaker, name?: string): Promise<void>;
  /** Drops the line showing and every queued one (their promises resolve right away). */
  clear(): void;
  /** v1.11 (PR5): nothing is showing and nothing is waiting (a line that may as well not come can be said now). */
  readonly quiet: boolean;
}

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
  el.append(name, text);
  root.appendChild(el);

  let queue: Promise<void> = Promise.resolve();
  /** Bumped by clear(): queued lines from an older generation are skipped. */
  let generation = 0;
  let dismiss: (() => void) | null = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dismiss?.();
  });

  const showOne = (line: string, who: Speaker, speakerName?: string): Promise<void> =>
    new Promise((resolve) => {
      el.className = `bubble ${SPEAKER_CLASS[who]}`;
      name.textContent = speakerName ?? (who === 'partner' ? partnerName : who === 'amanojaku' ? 'サカサ' : 'たんけんたいの なかま');
      text.textContent = line;
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
    say(line, who = 'partner', speakerName?: string): Promise<void> {
      const g = generation;
      pending += 1;
      queue = queue
        .then(() => (g === generation ? showOne(line, who, speakerName) : undefined))
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
