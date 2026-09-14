import type { Speaker } from '../stage/types';
import { BUBBLE_SECONDS } from '../train/params';

export interface Bubbles {
  /** Shows the line and resolves when tapped or after the timeout. Lines queue up in order. */
  say(text: string, who?: Speaker): Promise<void>;
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
  let dismiss: (() => void) | null = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dismiss?.();
  });

  const showOne = (line: string, who: Speaker): Promise<void> =>
    new Promise((resolve) => {
      el.className = `bubble ${SPEAKER_CLASS[who]}`;
      name.textContent = who === 'partner' ? partnerName : who === 'amanojaku' ? 'サカサ' : 'たんけんたいの なかま';
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

  return {
    say(line, who = 'partner'): Promise<void> {
      queue = queue.then(() => showOne(line, who));
      return queue;
    },
  };
}
