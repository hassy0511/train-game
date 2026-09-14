export interface CameraButton {
  setLabel(label: string): void;
}

const ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="4" y="9" width="24" height="16" rx="3" fill="none" stroke="#2b3a4a" stroke-width="2.4"/>
  <circle cx="16" cy="17" r="5" fill="none" stroke="#2b3a4a" stroke-width="2.4"/>
  <rect x="11" y="5" width="10" height="4" rx="1.5" fill="#2b3a4a"/>
</svg>`;

/** Always-visible round button that cycles camera modes (second of the four allowed). */
export function createCameraButton(root: HTMLElement, onPress: () => void): CameraButton {
  const button = document.createElement('button');
  button.id = 'camera';
  button.className = 'round-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'カメラ');
  button.innerHTML = `<span class="ring is-camera"></span><span class="face">${ICON}<span class="label">カメラ</span></span>`;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPress();
  });
  root.appendChild(button);
  const label = button.querySelector('.label') as HTMLElement;
  return {
    setLabel(text: string): void {
      label.textContent = text;
    },
  };
}
