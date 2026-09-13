import type { JunctionSide } from '../train/train';
import { createHud, type Hud } from './hud';
import { createJunctionArrows, type JunctionArrows } from './junction-arrows';
import { createLever, type Lever } from './lever';
import { createOverlays, type Overlays } from './overlays';
import { createWhistleButton, type WhistleButton } from './whistle-button';

export interface UiOptions {
  speedLabels: readonly string[];
  onNotch(notch: number): void;
  onWhistle(): void;
  onJunction(side: JunctionSide): void;
}

export interface Ui {
  lever: Lever;
  whistle: WhistleButton;
  junction: JunctionArrows;
  hud: Hud;
  overlays: Overlays;
}

/** Builds the DOM overlay. Always-visible action buttons: whistle only (limit is 4). */
export function createUi(root: HTMLElement, opts: UiOptions): Ui {
  const hud = createHud(root);
  const lever = createLever(root, { labels: opts.speedLabels, onChange: opts.onNotch });
  const actions = document.createElement('div');
  actions.className = 'action-buttons';
  root.appendChild(actions);
  const whistle = createWhistleButton(actions, opts.onWhistle);
  const junction = createJunctionArrows(root, opts.onJunction);
  const overlays = createOverlays(root);
  window.addEventListener('resize', () => lever.relayout());
  return { lever, whistle, junction, hud, overlays };
}
