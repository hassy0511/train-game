/**
 * v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A3, PHASE9_0 §2): the まえ／うしろ switch beside the lever (うしろむき). A tall
 * rounded switch: "まえ" on top (yellow, an arrow ahead), "うしろ" below (pink, an arrow turning back); the round knob
 * sits on the side it is on. A tap anywhere on it asks for the other side (a small child does not read the words).
 * Hidden until うしろむき is learned. Its place is the lever's screen-middle side, level with the lever's lower half
 * (CSS; mirrored left-handed); it may still move once the layout is settled (PHASE9_0 §2), by CSS alone.
 * Test hooks: `#reverse-switch[data-dir]` ("front" / "back"), `[data-pending]` ("1" braking to turn), `[data-glow]`.
 */
export interface ReverseSwitch {
  readonly element: HTMLButtonElement;
  show(): void;
  /** The side it is on, and whether it waits (braking) to turn to the other one. */
  set(dir: 1 | -1, pending: boolean): void;
  /** Glow (a hint only: the child decides). */
  setGlow(on: boolean): void;
}

const FRONT_ICON = `<svg class="rs-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 26V8" stroke="#2b3a4a" stroke-width="3.2" stroke-linecap="round"/><path d="M8 15l8-8 8 8" fill="none" stroke="#2b3a4a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const BACK_ICON = `<svg class="rs-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 7v10a6 6 0 0 1-6 6h-9" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M12 18l-5 5 5 5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function createReverseSwitch(root: HTMLElement, onPress: () => void): ReverseSwitch {
  const button = document.createElement('button');
  button.id = 'reverse-switch';
  button.className = 'reverse-switch';
  button.type = 'button';
  button.hidden = true;
  button.dataset.dir = 'front';
  button.dataset.pending = '0';
  button.dataset.glow = '0';
  button.setAttribute('aria-label', 'まえ');
  button.innerHTML =
    `<span class="rs-half rs-front">${FRONT_ICON}<span class="rs-word">まえ</span></span>` +
    `<span class="rs-half rs-back">${BACK_ICON}<span class="rs-word">うしろ</span></span>` +
    `<span class="rs-knob" aria-hidden="true"></span>`;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPress();
  });
  root.appendChild(button);
  return {
    element: button,
    show(): void {
      button.hidden = false;
    },
    set(dir, pending): void {
      const d = dir === 1 ? 'front' : 'back';
      if (button.dataset.dir !== d) {
        button.dataset.dir = d;
        button.setAttribute('aria-label', dir === 1 ? 'まえ' : 'うしろ');
      }
      const p = pending ? '1' : '0';
      if (button.dataset.pending !== p) button.dataset.pending = p;
    },
    setGlow(on): void {
      const g = on ? '1' : '0';
      if (button.dataset.glow !== g) button.dataset.glow = g;
    },
  };
}
