/**
 * Dark full-screen caption for story beats. Resolves after `seconds` (or on tap). v1.7: `light` shows the words
 * over the scene without darkening it (the volcano's "はっくしょーん！" while its smoke ring shows).
 */
export function createCaption(root: HTMLElement): (text: string, seconds: number, light?: boolean) => Promise<void> {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'caption';
  el.className = 'overlay caption';
  el.hidden = true;
  root.appendChild(el);
  return (text, seconds, light = false) =>
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
          el.hidden = true;
          resolve();
        }, 400);
      };
      el.onclick = finish;
      window.setTimeout(finish, seconds * 1000);
    });
}
