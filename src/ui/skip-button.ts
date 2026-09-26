export interface SkipButton {
  /** Shown only while a cutscene of an already cleared stage plays (never one of the always-visible buttons). */
  setVisible(visible: boolean): void;
}

/** Two triangles: "▶▶". */
const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5v13l9-6.5z"/><path d="M12 5.5v13l9-6.5z"/></svg>`;

/**
 * "▶▶" (PHASE7_FINISH §4 item 7): a small round button in the top corner row, beside the camera, that skips the
 * rest of a cutscene on a stage cleared before. It reacts to the first touch only and hides at once, so a double
 * tap cannot reach what comes next (the next card also holds its button back for a moment, see main.ts).
 */
export function createSkipButton(root: HTMLElement, onSkip: () => void): SkipButton {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'skip';
  button.className = 'corner-button skip-button';
  button.setAttribute('aria-label', 'とばす');
  button.innerHTML = ICON;
  button.hidden = true;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (button.hidden) return;
    button.hidden = true;
    onSkip();
  });
  root.appendChild(button);
  return {
    setVisible(visible: boolean): void {
      if (button.hidden === !visible) return;
      button.hidden = !visible;
    },
  };
}
