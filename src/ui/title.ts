/** Title screen: one big button. Resolves when the player taps "はじめる". */
export function showTitle(root: HTMLElement, title: string): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'title-screen';
    el.className = 'overlay title-screen';
    const h = document.createElement('h1');
    h.className = 'title-text';
    h.textContent = title;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'title-start';
    btn.className = 'big-button';
    btn.textContent = 'はじめる';
    btn.addEventListener('click', () => {
      el.remove();
      resolve();
    });
    el.append(h, btn);
    root.appendChild(el);
  });
}
