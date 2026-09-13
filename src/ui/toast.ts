export interface Toast {
  show(text: string, kind: 'perfect' | 'ok'): void;
}

/** Short center message ("ぴったり！"). */
export function createToast(root: HTMLElement): Toast {
  const el = document.createElement('div');
  el.id = 'toast';
  el.className = 'toast';
  el.hidden = true;
  root.appendChild(el);
  let timer = 0;
  return {
    show(text, kind): void {
      el.textContent = text;
      el.className = `toast is-${kind}`;
      el.hidden = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        el.hidden = true;
      }, 1800);
    },
  };
}
