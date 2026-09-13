/** Full-screen card with a title and one button. Resolves on tap. */
export function showCard(root: HTMLElement, title: string, button: string): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay card';
    el.id = 'card';
    const h = document.createElement('h1');
    const lines = title.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) h.appendChild(document.createElement('br'));
      h.appendChild(document.createTextNode(line));
    });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'big-button';
    btn.id = 'card-button';
    btn.textContent = button;
    btn.addEventListener('click', () => {
      el.remove();
      resolve();
    });
    el.append(h, btn);
    root.appendChild(el);
  });
}
