export interface CargoStrip {
  set(passengers: number, parcel: boolean): void;
}

const FACE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6" fill="#f6d6b8"/><path d="M3 23c1-5 4-8 9-8s8 3 9 8z" fill="#4f7fb0"/></svg>`;
const BOX = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="2" fill="#c89b6d"/><rect x="11" y="6" width="2" height="15" fill="#e9573f"/></svg>`;

/** Small row of icons at the top left: who and what is aboard. Hidden when empty. */
export function createCargoStrip(root: HTMLElement): CargoStrip {
  const el = document.createElement('div');
  el.id = 'cargo';
  el.className = 'cargo-strip';
  el.hidden = true;
  root.appendChild(el);
  return {
    set(passengers, parcel): void {
      el.innerHTML = FACE.repeat(passengers) + (parcel ? BOX : '');
      el.dataset.passengers = String(passengers);
      el.dataset.parcel = parcel ? '1' : '0';
      el.hidden = passengers === 0 && !parcel;
    },
  };
}
