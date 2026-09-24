import type { RecordDef } from '../stage/types';

export interface ZukanEntry {
  stageTitle: string;
  record: RecordDef;
  found: boolean;
}

// Pictures are the model previews; each one is fetched only when the book shows it.
const pictures = import.meta.glob('../../assets/previews/*.png', { query: '?url', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;

/** The picture book: every record of every world, found ones with a picture and a line, others as "？". */
export function showZukan(root: HTMLElement, entries: ZukanEntry[]): void {
  const el = document.createElement('div');
  el.id = 'zukan';
  el.className = 'overlay zukan';
  const h = document.createElement('h1');
  h.textContent = 'ずかん';
  const grid = document.createElement('div');
  grid.className = 'zukan-grid';
  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = entry.found ? 'zukan-card is-found' : 'zukan-card';
    card.dataset.record = entry.record.id;
    const picture = document.createElement('div');
    picture.className = 'zukan-picture';
    const name = document.createElement('div');
    name.className = 'zukan-name';
    if (entry.found) {
      name.textContent = entry.record.name;
      const load = entry.record.model ? pictures[`../../assets/previews/${entry.record.model}.png`] : undefined;
      if (load) {
        void load().then((url) => {
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          picture.appendChild(img);
        });
      }
      if (entry.record.note) {
        const note = document.createElement('div');
        note.className = 'zukan-note';
        note.textContent = entry.record.note;
        card.append(picture, name, note);
      } else card.append(picture, name);
    } else {
      picture.textContent = '？';
      name.textContent = entry.stageTitle;
      card.append(picture, name);
    }
    grid.appendChild(card);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'zukan-close';
  close.className = 'big-button';
  close.textContent = 'とじる';
  close.addEventListener('click', () => el.remove());
  el.append(h, grid, close);
  root.appendChild(el);
}
