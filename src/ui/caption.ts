export interface Caption {
  (text: string, seconds: number, light?: boolean): Promise<void>;
  /** Puts the caption showing away now (a skipped cutscene); its promise resolves. */
  clear(): void;
}

/**
 * Dark full-screen caption for story beats. Resolves after `seconds` (or on tap). v1.7: `light` shows the words
 * over the scene without darkening it (the volcano's "はっくしょーん！" while its smoke ring shows).
 */
export function createCaption(root: HTMLElement): Caption {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'caption';
  el.className = 'overlay caption';
  el.hidden = true;
  root.appendChild(el);
  let current: (() => void) | null = null;
  const show = (text: string, seconds: number, light = false): Promise<void> =>
    new Promise((resolve) => {
      el.textContent = text;
      el.classList.toggle('is-light', light);
      el.hidden = false;
      el.classList.remove('is-out');
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        el.classList.add('is-out');
        window.setTimeout(() => {
          if (current === hide) {
            el.hidden = true;
            current = null;
          }
          resolve();
        }, 400);
      };
      const hide = (): void => {
        done = true;
        el.hidden = true;
        current = null;
        resolve();
      };
      current = hide;
      el.onclick = finish;
      window.setTimeout(finish, seconds * 1000);
    });
  return Object.assign(show, {
    clear(): void {
      current?.();
    },
  });
}
