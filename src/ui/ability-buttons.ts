export interface JumpButton {
  show(): void;
  /** `progress` 0..1 for the cooldown ring; `glow` when jumping now clears the gap ahead; `idle` when stopped. */
  set(progress: number, glow: boolean, idle: boolean): void;
  /** A grasshopper rides on the roof: the ring turns green and the icon becomes a grasshopper (2-2). */
  setHopper(on: boolean): void;
}

export interface LightButton {
  show(): void;
  setOn(on: boolean): void;
  /** Something ahead waits for the light (a butterfly, a reversed sign that fooled the train before). */
  setGlow(on: boolean): void;
}

const JUMP_ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M4 24c4-12 20-12 24 0" fill="none" stroke="#2b3a4a" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="3 3"/>
  <rect x="11" y="6" width="10" height="7" rx="2" fill="#2b3a4a"/>
  <path d="M16 15v5M13 18l3 3 3-3" fill="none" stroke="#2b3a4a" stroke-width="2.2" stroke-linecap="round" transform="rotate(180 16 18)"/>
</svg>`;

/** The grasshopper jump: a green grasshopper mid-leap. */
const HOPPER_ICON = `<svg class="icon icon-hopper" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M7 19c3-5 11-7 17-5l3 2-3 2c-6 2-13 3-17 1z" fill="#3f9a3a"/>
  <circle cx="24.5" cy="15.5" r="1.4" fill="#1d3b1a"/>
  <path d="M25 13c1-4 2-6 4-8M24 13c-1-4-1-6 0-9" fill="none" stroke="#1d3b1a" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M13 17l-4-8 8 6M9 9l-3 13" fill="none" stroke="#2f7a2b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 20l1 5M21 19l3 5" stroke="#2f7a2b" stroke-width="1.8" stroke-linecap="round"/>
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
  const button = roundButton(root, 'jump', 'ジャンプ', JUMP_ICON.replace('class="icon"', 'class="icon icon-jump"') + HOPPER_ICON, 'is-jump');
  button.dataset.hopper = '0';
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
    setHopper(on): void {
      button.dataset.hopper = on ? '1' : '0';
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
    setGlow(on): void {
      const v = on ? '1' : '0';
      if (button.dataset.glow !== v) button.dataset.glow = v;
    },
  };
}
