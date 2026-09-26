const BADGE = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#ffd166" stroke="#e9573f" stroke-width="6"/>
  <circle cx="60" cy="60" r="38" fill="#3fa7d6"/>
  <path d="M20 60h80" stroke="#f4f4f0" stroke-width="6" stroke-linecap="round"/>
  <path d="M30 48h60M30 72h60" stroke="#f4f4f0" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
  <circle cx="60" cy="60" r="9" fill="#ffd166" stroke="#2b3a4a" stroke-width="3"/>
</svg>`;

export type CardIcon = 'badge' | 'ring';

/** Chapter 2's end: six islands joined by rail into a ring. */
const RING = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#3fa7d6" stroke="#ffd166" stroke-width="6"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#a2805c" stroke-width="9" stroke-dasharray="3 3.3"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#f4f4f0" stroke-width="2.5"/>
  <circle cx="60.0" cy="24.0" r="12" fill="#8bd17c" stroke="#fff" stroke-width="4"/>
  <circle cx="91.2" cy="42.0" r="12" fill="#f4a261" stroke="#fff" stroke-width="4"/>
  <circle cx="91.2" cy="78.0" r="12" fill="#c9b8f0" stroke="#fff" stroke-width="4"/>
  <circle cx="60.0" cy="96.0" r="12" fill="#5fb36b" stroke="#fff" stroke-width="4"/>
  <circle cx="28.8" cy="78.0" r="12" fill="#f2d45c" stroke="#fff" stroke-width="4"/>
  <circle cx="28.8" cy="42.0" r="12" fill="#e76f51" stroke="#fff" stroke-width="4"/>
</svg>`;

/**
 * Full-screen card with a title, an optional icon, and one button. Resolves on tap. With `guardSeconds` the
 * button pops in only after that long, so a child still tapping from before cannot close a once-only card
 * (a chapter's end) before seeing it.
 */
export function showCard(root: HTMLElement, title: string, button: string, icon?: CardIcon, guardSeconds = 0): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay card';
    el.id = 'card';
    if (icon) el.insertAdjacentHTML('beforeend', icon === 'ring' ? RING : BADGE);
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
    let open = guardSeconds <= 0;
    if (!open) {
      btn.classList.add('is-guarded');
      window.setTimeout(() => {
        open = true;
        btn.classList.remove('is-guarded');
        btn.classList.add('is-popping');
      }, guardSeconds * 1000);
    }
    btn.addEventListener('click', () => {
      if (!open) return;
      el.remove();
      resolve();
    });
    el.append(h, btn);
    root.appendChild(el);
  });
}
