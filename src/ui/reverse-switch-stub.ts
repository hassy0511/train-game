/**
 * v1.11 (PR8b): a stand-in for the "まえ／うしろ" switch beside the lever (PHASE9_CHAPTER5_6 第 3 部 A3), which PR8a
 * builds (src/ui/reverse-switch.ts). It only shows once うしろむき is learned (in this PR only the hidden test stage 0-6
 * teaches it) and only glows as the hint says (`data-glow`); a press does not drive backwards (PR8a does that).
 * PR8a deletes this file and gives main.ts its own switch with the same `show()` and `setGlow()`.
 */
export interface ReverseSwitchStub {
  show(): void;
  setGlow(on: boolean): void;
}

export function createReverseSwitchStub(root: HTMLElement, onPress: () => void): ReverseSwitchStub {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'reverse-switch';
  el.className = 'reverse-switch is-stub';
  el.hidden = true;
  el.dataset.dir = 'front';
  el.dataset.stub = '1';
  el.dataset.glow = '0';
  el.setAttribute('aria-label', 'まえ／うしろ（じゅんびちゅう）');
  el.innerHTML = '<span class="reverse-switch-label">まえ</span><span class="reverse-switch-knob"></span><span class="reverse-switch-label">うしろ</span><span class="reverse-switch-note">じゅんび<br>ちゅう</span>';
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPress();
  });
  root.appendChild(el);
  let glow = false;
  return {
    show(): void {
      el.hidden = false;
    },
    setGlow(on): void {
      if (on === glow) return;
      glow = on;
      el.dataset.glow = on ? '1' : '0';
    },
  };
}
