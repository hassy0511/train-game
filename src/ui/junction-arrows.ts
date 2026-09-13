import type { JunctionSide } from '../train/train';

export interface JunctionArrows {
  show(options: { left: boolean; right: boolean; default: JunctionSide }): void;
  markSelected(side: JunctionSide): void;
  hide(): void;
}

const LEFT_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M40 8 16 32l24 24V42h16V22H40z"/></svg>`;
const RIGHT_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 8l24 24-24 24V42H8V22h16z"/></svg>`;

/** Big left/right arrows shown before a junction. The default route is highlighted until the player taps. */
export function createJunctionArrows(root: HTMLElement, onSelect: (side: JunctionSide) => void): JunctionArrows {
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
    b.innerHTML = svg;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onSelect(side);
      markSelected(side);
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
      left.classList.remove('is-selected');
      right.classList.remove('is-selected');
      left.classList.toggle('is-default', options.default === 'left');
      right.classList.toggle('is-default', options.default === 'right');
      box.hidden = false;
    },
    markSelected,
    hide(): void {
      box.hidden = true;
    },
  };
}
