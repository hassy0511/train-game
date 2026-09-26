import type { AbilityId } from '../stage/types';
import type { JunctionSide } from '../train/train';
import { abilityIcon } from './ability-buttons';

export interface JunctionArrows {
  /**
   * `needs` (v1.8): that side's way needs an ability; its arrow carries the ability's picture, and is grey while the
   * player does not have it (`has` false).
   */
  show(options: { left: boolean; right: boolean; default: JunctionSide; needs?: { side: JunctionSide; ability: AbilityId; has: boolean } }): void;
  markSelected(side: JunctionSide): void;
  /** The light showed the true way: highlight it instead of the (reversed) sign's. */
  reveal(side: JunctionSide): void;
  hide(): void;
}

const LEFT_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M40 8 16 32l24 24V42h16V22H40z"/></svg>`;
const RIGHT_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 8l24 24-24 24V42H8V22h16z"/></svg>`;

/**
 * Big left/right arrows shown before a junction. The default route is highlighted until the player taps.
 * `onSelect` returns false when that way cannot be taken (it needs an ability): the arrow then stays unselected.
 */
export function createJunctionArrows(root: HTMLElement, onSelect: (side: JunctionSide) => boolean): JunctionArrows {
  const box = document.createElement('div');
  box.id = 'junction';
  box.className = 'junction';
  box.hidden = true;
  const make = (side: JunctionSide, svg: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'arrow';
    b.dataset.side = side;
    b.setAttribute('aria-label', side === 'left' ? 'ひだり' : 'みぎ');
    b.innerHTML = `${svg}<span class="arrow-needs" aria-hidden="true"></span>`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (onSelect(side)) markSelected(side);
    });
    box.appendChild(b);
    return b;
  };
  const left = make('left', LEFT_SVG);
  const right = make('right', RIGHT_SVG);
  root.appendChild(box);

  const markSelected = (side: JunctionSide): void => {
    left.classList.toggle('is-selected', side === 'left');
    right.classList.toggle('is-selected', side === 'right');
  };

  return {
    show(options): void {
      left.hidden = !options.left;
      right.hidden = !options.right;
      left.classList.remove('is-selected', 'is-true');
      right.classList.remove('is-selected', 'is-true');
      left.classList.toggle('is-default', options.default === 'left');
      right.classList.toggle('is-default', options.default === 'right');
      for (const b of [left, right]) {
        const needs = options.needs?.side === b.dataset.side ? options.needs : undefined;
        b.querySelector('.arrow-needs')!.innerHTML = needs ? abilityIcon(needs.ability) : '';
        if (needs) {
          b.dataset.needs = needs.ability;
          b.dataset.locked = needs.has ? '0' : '1';
        } else {
          delete b.dataset.needs;
          delete b.dataset.locked;
        }
      }
      box.hidden = false;
    },
    markSelected,
    reveal(side): void {
      left.classList.toggle('is-default', side === 'left');
      right.classList.toggle('is-default', side === 'right');
      left.classList.toggle('is-true', side === 'left');
      right.classList.toggle('is-true', side === 'right');
      markSelected(side);
    },
    hide(): void {
      box.hidden = true;
    },
  };
}
