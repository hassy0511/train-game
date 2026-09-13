export interface WhistleButton {
  setProgress(progress: number): void;
}

const ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M4 14h12l8-6v16l-8-6H4z" fill="#2b3a4a"/>
  <path d="M26 10c2 1.6 3 3.6 3 6s-1 4.4-3 6" fill="none" stroke="#2b3a4a" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

/** Round whistle button with a cooldown ring. Fires on pointerdown so it feels instant on touch. */
export function createWhistleButton(root: HTMLElement, onPress: () => void): WhistleButton {
  const button = document.createElement('button');
  button.id = 'whistle';
  button.className = 'round-button';
  button.type = 'button';
  button.dataset.cooldown = '0';
  button.setAttribute('aria-label', 'きてき');
  button.innerHTML = `<span class="ring"></span><span class="face">${ICON}<span class="label">きてき</span></span>`;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPress();
  });
  root.appendChild(button);

  let last = -1;
  return {
    setProgress(progress: number): void {
      const p = Math.round(progress * 100) / 100;
      if (p === last) return;
      last = p;
      button.style.setProperty('--cd', String(p));
      button.dataset.cooldown = p < 1 ? '1' : '0';
    },
  };
}
