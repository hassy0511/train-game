export interface DoorButton {
  show(onPress: () => void): void;
  hide(): void;
}

const ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="6" y="4" width="20" height="24" rx="2" fill="none" stroke="#2b3a4a" stroke-width="2.4"/>
  <line x1="16" y1="4" x2="16" y2="28" stroke="#2b3a4a" stroke-width="2.4"/>
  <circle cx="12.5" cy="16" r="1.6" fill="#2b3a4a"/><circle cx="19.5" cy="16" r="1.6" fill="#2b3a4a"/>
</svg>`;

/** Temporary round button shown while stopped at a station. Not one of the always-visible four. */
export function createDoorButton(root: HTMLElement): DoorButton {
  const button = document.createElement('button');
  button.id = 'door';
  button.className = 'round-button';
  button.type = 'button';
  button.hidden = true;
  button.setAttribute('aria-label', 'ドア');
  button.innerHTML = `<span class="ring is-static"></span><span class="face">${ICON}<span class="label">ドア</span></span>`;
  let handler: (() => void) | null = null;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handler?.();
  });
  root.prepend(button);
  return {
    show(onPress): void {
      handler = () => {
        handler = null;
        onPress();
      };
      button.hidden = false;
    },
    hide(): void {
      handler = null;
      button.hidden = true;
    },
  };
}
