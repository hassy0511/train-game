const BADGE = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#ffd166" stroke="#e9573f" stroke-width="6"/>
  <circle cx="60" cy="60" r="38" fill="#3fa7d6"/>
  <path d="M20 60h80" stroke="#f4f4f0" stroke-width="6" stroke-linecap="round"/>
  <path d="M30 48h60M30 72h60" stroke="#f4f4f0" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
  <circle cx="60" cy="60" r="9" fill="#ffd166" stroke="#2b3a4a" stroke-width="3"/>
</svg>`;

/** Full-screen card with a title, an optional icon, and one button. Resolves on tap. */
export function showCard(root: HTMLElement, title: string, button: string, icon?: 'badge'): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay card';
    el.id = 'card';
    if (icon === 'badge') el.insertAdjacentHTML('beforeend', BADGE);
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
