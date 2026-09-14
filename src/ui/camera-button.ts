import type { CameraMode } from '../view/camera-rig';

export interface CameraButton {
  setMode(mode: CameraMode): void;
}

const ICON = `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="4" y="9" width="24" height="16" rx="3" fill="none" stroke="#2b3a4a" stroke-width="2.4"/>
  <circle cx="16" cy="17" r="5" fill="none" stroke="#2b3a4a" stroke-width="2.4"/>
  <rect x="11" y="5" width="10" height="4" rx="1.5" fill="#2b3a4a"/>
</svg>`;

/** Simple pictograms for each view: where the eye is relative to the train. */
const MODE_ICONS: Record<CameraMode, string> = {
  cab: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="14" width="28" height="14" rx="4" fill="#3fa7d6"/><rect x="24" y="17" width="8" height="6" rx="1.5" fill="#1f2a44"/><circle cx="29" cy="20" r="2" fill="#ffd166"/></svg>`,
  chase: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="12" y="18" width="22" height="12" rx="4" fill="#3fa7d6"/><rect x="20" y="16" width="14" height="4" rx="2" fill="#f4f4f0"/><circle cx="7" cy="12" r="3.5" fill="#2b3a4a"/><path d="M9 14l5 4" stroke="#2b3a4a" stroke-width="2" stroke-linecap="round"/></svg>`,
  side: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="20" width="32" height="10" rx="3" fill="#3fa7d6"/><rect x="8" y="22" width="5" height="4" fill="#1f2a44"/><rect x="17" y="22" width="5" height="4" fill="#1f2a44"/><rect x="26" y="22" width="5" height="4" fill="#1f2a44"/><circle cx="20" cy="9" r="3.5" fill="#2b3a4a"/></svg>`,
  top: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="16" y="6" width="8" height="28" rx="3" fill="#3fa7d6"/><rect x="17" y="8" width="6" height="8" rx="1.5" fill="#f4f4f0"/><circle cx="8" cy="8" r="3.5" fill="#2b3a4a"/><path d="M11 11l3 3" stroke="#2b3a4a" stroke-width="2" stroke-linecap="round"/></svg>`,
};

/**
 * Always-visible camera button. Tapping it opens a row of four view tiles; tapping a tile
 * picks that view and closes the row. Tapping the button again (or anywhere else) closes it.
 */
export function createCameraButton(
  root: HTMLElement,
  modes: { mode: CameraMode; label: string }[],
  onPick: (mode: CameraMode) => void,
): CameraButton {
  const button = document.createElement('button');
  button.id = 'camera';
  button.className = 'round-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'カメラ');
  button.innerHTML = `<span class="ring is-camera"></span><span class="face">${ICON}<span class="label">カメラ</span></span>`;
  root.appendChild(button);

  const menu = document.createElement('div');
  menu.id = 'camera-menu';
  menu.className = 'camera-menu';
  menu.hidden = true;
  const tiles = new Map<CameraMode, HTMLButtonElement>();
  for (const { mode, label } of modes) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'camera-tile';
    tile.dataset.mode = mode;
    tile.innerHTML = `${MODE_ICONS[mode]}<span>${label}</span>`;
    tile.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPick(mode);
      close();
    });
    menu.appendChild(tile);
    tiles.set(mode, tile);
  }
  root.parentElement?.appendChild(menu);

  const close = (): void => {
    menu.hidden = true;
    button.classList.remove('is-open');
  };
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menu.hidden) {
      menu.hidden = false;
      button.classList.add('is-open');
    } else {
      close();
    }
  });
  window.addEventListener('pointerdown', () => {
    if (!menu.hidden) close();
  });

  return {
    setMode(mode: CameraMode): void {
      for (const [m, tile] of tiles) tile.classList.toggle('is-active', m === mode);
    },
  };
}
