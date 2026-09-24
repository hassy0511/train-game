export interface JumpButton {
  show(): void;
  /** `progress` 0..1 for the cooldown ring; `glow` when jumping now clears the gap ahead; `idle` when stopped. */
  set(progress: number, glow: boolean, idle: boolean): void;
}

export interface LightButton {
  show(): void;
  setOn(on: boolean): void;
}

const JUMP_ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M4 24c4-12 20-12 24 0" fill="none" stroke="#2b3a4a" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="3 3"/>
  <rect x="11" y="6" width="10" height="7" rx="2" fill="#2b3a4a"/>
  <path d="M16 15v5M13 18l3 3 3-3" fill="none" stroke="#2b3a4a" stroke-width="2.2" stroke-linecap="round" transform="rotate(180 16 18)"/>
</svg>`;

const LIGHT_ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="11" cy="16" r="6" fill="#2b3a4a"/>
  <path d="M19 10l9-4M19 16h10M19 22l9 4" stroke="#2b3a4a" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

function roundButton(root: HTMLElement, id: string, label: string, icon: string, ring: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.className = 'round-button';
  button.type = 'button';
  button.hidden = true;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span class="ring ${ring}"></span><span class="face">${icon}<span class="label">${label}</span></span>`;
  root.appendChild(button);
  return button;
}

/** Jump: fires on pointerdown. Grey while stopped, cooldown ring after landing, glows when now is the moment. */
export function createJumpButton(root: HTMLElement, onPress: () => void): JumpButton {
  const button = roundButton(root, 'jump', 'ジャンプ', JUMP_ICON, 'is-jump');
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPress();
  });
  let last = '';
  return {
    show(): void {
      button.hidden = false;
    },
    set(progress, glow, idle): void {
      const p = Math.round(progress * 100) / 100;
      const key = `${p}|${glow}|${idle}`;
      if (key === last) return;
      last = key;
      button.style.setProperty('--cd', String(p));
      button.dataset.cooldown = p < 1 ? '1' : '0';
      button.dataset.glow = glow ? '1' : '0';
      button.dataset.idle = idle ? '1' : '0';
    },
  };
}

/** Light: a toggle. The face lights up while on. */
export function createLightButton(root: HTMLElement, onToggle: () => void): LightButton {
  const button = roundButton(root, 'light', 'ライト', LIGHT_ICON, 'is-light');
  button.dataset.on = '0';
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onToggle();
  });
  return {
    show(): void {
      button.hidden = false;
    },
    setOn(on): void {
      button.dataset.on = on ? '1' : '0';
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    },
  };
}
