/** Dark full-screen caption for story beats. Resolves after `seconds` (or on tap). */
export function createCaption(root: HTMLElement): (text: string, seconds: number) => Promise<void> {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'caption';
  el.className = 'overlay caption';
  el.hidden = true;
  root.appendChild(el);
  return (text, seconds) =>
    new Promise((resolve) => {
      el.textContent = text;
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
