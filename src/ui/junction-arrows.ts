import type { AbilityId, BubbleForkDef, BubbleKind } from '../stage/types';
import type { JunctionSide } from '../train/train';
import { abilityIcon } from './ability-buttons';

export interface JunctionArrows {
  /**
   * `needs` (v1.8): that side's way needs an ability; its arrow carries the ability's picture, and is grey while the
   * player does not have it (`has` false).
   */
  show(options: {
    left: boolean;
    right: boolean;
    default: JunctionSide;
    needs?: { side: JunctionSide; ability: AbilityId; has: boolean };
    /** v1.10 (3-1): a bubble fork: each arrow shows its column's bubbles (rising white, sinking pink). */
    bubbles?: BubbleForkDef;
  }): void;
  markSelected(side: JunctionSide): void;
  /** The light showed the true way: highlight it instead of the (reversed) sign's. */
  reveal(side: JunctionSide): void;
  hide(): void;
}

/** v1.10 (3-1): the little bubble marks on a bubble fork's arrows: three rising white ones, three sinking pink swirls. */
const BUBBLE_MARKS: Record<BubbleKind, string> = {
  rise: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 36V14" stroke="#2f7fc0" stroke-width="3" stroke-linecap="round"/><path d="M13 20l7-8 7 8" fill="none" stroke="#2f7fc0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="30" r="4.5" fill="#fff" stroke="#9fddf5" stroke-width="2"/><circle cx="29" cy="24" r="4" fill="#fff" stroke="#9fddf5" stroke-width="2"/><circle cx="24" cy="7" r="3.5" fill="#eaf8ff" stroke="#9fddf5" stroke-width="2"/></svg>`,
  sink: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4v22" stroke="#c0569a" stroke-width="3" stroke-linecap="round"/><path d="M13 20l7 8 7-8" fill="none" stroke="#c0569a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="10" r="4.5" fill="#f7a8d8"/><path d="M8 10a2 2 0 1 1 2 2" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="30" cy="15" r="4" fill="#f7a8d8"/><path d="M28 15a2 2 0 1 1 2 2" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="21" cy="35" r="3.5" fill="#f7a8d8"/></svg>`,
};

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
    b.innerHTML = `${svg}<span class="arrow-needs" aria-hidden="true"></span><span class="arrow-bubbles" aria-hidden="true"></span>`;
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
        const kind = options.bubbles?.[b.dataset.side as JunctionSide];
        b.querySelector('.arrow-bubbles')!.innerHTML = kind ? BUBBLE_MARKS[kind] : '';
        if (kind) b.dataset.bubbles = kind;
        else delete b.dataset.bubbles;
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
