import type { AbilityId } from '../stage/types';

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

/** v1.7: the rocket: a round tube with a flame behind it (made up, like nothing in particular). */
const ROCKET_ICON = `<svg class="icon icon-rocket" viewBox="0 0 32 32" aria-hidden="true">
  <path class="flame" d="M11 12c-4 0-7 2-9 4 2 2 5 4 9 4-1.5-1.3-2.2-2.6-2.2-4s.7-2.7 2.2-4z" fill="#ff9f1c"/>
  <path class="flame-core" d="M11 13.6c-2.2.2-3.8 1.2-5 2.4 1.2 1.2 2.8 2.2 5 2.4-.8-.8-1.2-1.6-1.2-2.4s.4-1.6 1.2-2.4z" fill="#ffe066"/>
  <rect x="10" y="10" width="17" height="12" rx="6" fill="#2b3a4a"/>
  <circle cx="21" cy="16" r="2.6" fill="#8fd3f4"/>
  <rect x="12" y="8" width="5" height="3" rx="1.2" fill="#2b3a4a"/>
  <rect x="12" y="21" width="5" height="3" rx="1.2" fill="#2b3a4a"/>
</svg>`;

/** Marks on the rocket button while it rests (data-mark): asleep birds, a wobbly bridge, a slide, a station. */
const ROCKET_MARKS = `<span class="rocket-mark" aria-hidden="true">
  <span class="mark-sleep">zzz</span>
  <svg class="mark-bridge" viewBox="0 0 24 16"><path d="M1 6h22M3 6v8M21 6v8M8 6l-2 8M16 6l2 8M12 6v8" stroke="#6b4e2e" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
  <svg class="mark-slide" viewBox="0 0 24 16"><path d="M4 3l1.5 3 3 1.5-3 1.5L4 12l-1.5-3L-.5 7.5l3-1.5zM16 2l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 9l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="#6fb7e8"/></svg>
  <svg class="mark-station" viewBox="0 0 24 16"><rect x="2" y="2" width="20" height="10" rx="2" fill="#4fb06b"/><rect x="11" y="12" width="2" height="4" fill="#4fb06b"/></svg>
</span>`;

const LIGHT_ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="11" cy="16" r="6" fill="#2b3a4a"/>
  <path d="M19 10l9-4M19 16h10M19 22l9 4" stroke="#2b3a4a" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

/** v1.8: diving (later chapters): a drop going down under a wave line, with bubbles. */
const DIVE_ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M3 11c3-2.5 5-2.5 8 0s5 2.5 8 0 5-2.5 8 0" fill="none" stroke="#2b3a4a" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M15 15v10M11 21l4 4 4-4" fill="none" stroke="#2b3a4a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="19" r="2" fill="#2b3a4a"/><circle cx="26" cy="25" r="1.4" fill="#2b3a4a"/>
</svg>`;

/** v1.8: going backwards (later chapters): an arrow turning back. */
const REVERSE_ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M24 24V14a6 6 0 0 0-6-6h-9" fill="none" stroke="#2b3a4a" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M12 3 7 8l5 5" fill="none" stroke="#2b3a4a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** The whistle's picture (same as its button's). */
const WHISTLE_ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M4 14h12l8-6v16l-8-6H4z" fill="#2b3a4a"/>
  <path d="M26 10c2 1.6 3 3.6 3 6s-1 4.4-3 6" fill="none" stroke="#2b3a4a" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

/**
 * v1.8: each ability's picture as SVG markup (class "icon"): for a junction arrow whose side way needs it and for the
 * picture book's "?" cards. Abilities without a picture yet fall back to "".
 */
export function abilityIcon(ability: AbilityId): string {
  switch (ability) {
    case 'jump':
      return JUMP_ICON;
    case 'light':
      return LIGHT_ICON;
    case 'rocket':
      return ROCKET_ICON;
    case 'whistle':
      return WHISTLE_ICON;
    case 'dive':
      return DIVE_ICON;
    case 'reverse':
      return REVERSE_ICON;
    default:
      return '';
  }
}

/** v1.7: what the rocket button shows this frame. */
export interface RocketButtonState {
  /** Flames left (the three parts of the ring). */
  pips: number;
  /** While burning, the share of the burn left (the ring runs down); 0 when not burning. */
  burn: number;
  glow: boolean;
  /** Grey: no flames, or the rocket rests here. */
  idle: boolean;
  /** Why it would not fire (RocketWhy, test hook). */
  why: string;
  /** Mark while it rests: "sleep" (zzz), "bridge", "slide", "station", or "". */
  mark: string;
}

export interface RocketButton {
  show(): void;
  set(state: RocketButtonState): void;
}

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

/**
 * v1.7 (2-3): the rocket. Fires on pointerdown, one flame per press (no holding). The ring is three flames; while
 * it burns the ring runs down and the flame flickers (data-boost). Grey with a mark where it rests or when empty
 * (data-idle, data-mark); glows when now is the moment (data-glow).
 */
export function createRocketButton(root: HTMLElement, onPress: () => void): RocketButton {
  const button = roundButton(root, 'rocket', 'ロケット', ROCKET_ICON, 'is-rocket');
  button.querySelector('.face')?.insertAdjacentHTML('beforeend', ROCKET_MARKS);
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPress();
  });
  let last = '';
  return {
    show(): void {
      button.hidden = false;
    },
    set(st): void {
      const burn = Math.round(st.burn * 50) / 50;
      const key = `${st.pips}|${burn}|${st.glow}|${st.idle}|${st.why}|${st.mark}`;
      if (key === last) return;
      last = key;
      button.dataset.pips = String(st.pips);
      button.dataset.boost = burn > 0 ? '1' : '0';
      button.dataset.glow = st.glow ? '1' : '0';
      button.dataset.idle = st.idle ? '1' : '0';
      button.dataset.why = st.why;
      button.dataset.mark = st.mark;
      button.style.setProperty('--cd', String(burn));
      // A flame left falls back to the ring's own orange (a var() set here would resolve on the button instead).
      for (let i = 1; i <= 3; i++) {
        if (st.pips >= i) button.style.removeProperty(`--pip${i}`);
        else button.style.setProperty(`--pip${i}`, 'rgba(255, 255, 255, 0.25)');
      }
    },
  };
}
