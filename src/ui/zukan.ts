import type { AbilityId, RecordDef } from '../stage/types';
import type { WorldFile } from '../world/types';
import world from '../world/world.json';
import { abilityIcon } from './ability-buttons';

export interface ZukanEntry {
  stageId: string;
  stageTitle: string;
  record: RecordDef;
  found: boolean;
}

/** Records that have a picture (public/zukan/<id>.png, scripts/render-zukan.mjs). */
const pictures = new Set<string>(__ZUKAN_PICTURES__);

/**
 * v1.11 (PR11b, PHASE9_CHAPTER5_6 第 1 部 §5.4): the islands whose rows the picture book holds back: an island with an
 * `after` stage not cleared yet (6-2 before 6-1), the same as the map.
 */
export function zukanHidden(cleared: readonly string[]): Set<string> {
  return new Set((world as unknown as WorldFile).islands.filter((i) => i.after !== undefined && !cleared.includes(i.after)).map((i) => i.id));
}

/**
 * The picture book: one row per island, every record of it — found ones with their picture, name and line, the
 * others as "？" (with the grey picture of the ability they need, while the player does not have it yet). The
 * heading counts them all: 「みつけた 11/21」. v1.11 (PR11b): an island the map still holds back (`after`, see
 * zukanHidden: `cleared` is the save's) has no row and is not counted.
 */
export function showZukan(root: HTMLElement, all: ZukanEntry[], abilities: ReadonlySet<AbilityId>, cleared: readonly string[] = []): void {
  const hidden = zukanHidden(cleared);
  const entries = all.filter((e) => !hidden.has(e.stageId));
  const el = document.createElement('div');
  el.id = 'zukan';
  el.className = 'overlay zukan';
  const h = document.createElement('h1');
  h.textContent = 'ずかん';
  const count = document.createElement('div');
  count.className = 'zukan-count';
  count.id = 'zukan-count';
  count.textContent = `みつけた ${entries.filter((e) => e.found).length}/${entries.length}`;
  const rows = document.createElement('div');
  rows.className = 'zukan-rows';
  const stageIds = [...new Set(entries.map((e) => e.stageId))];
  for (const stageId of stageIds) {
    const own = entries.filter((e) => e.stageId === stageId);
    const row = document.createElement('section');
    row.className = 'zukan-row';
    row.dataset.stage = stageId;
    const head = document.createElement('h2');
    head.className = 'zukan-row-title';
    head.textContent = own[0].stageTitle;
    const small = document.createElement('span');
    small.className = 'zukan-row-count';
    small.textContent = `${own.filter((e) => e.found).length}/${own.length}`;
    head.appendChild(small);
    const grid = document.createElement('div');
    grid.className = 'zukan-grid';
    for (const entry of own) grid.appendChild(card(entry, abilities));
    row.append(head, grid);
    rows.appendChild(row);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'zukan-close';
  close.className = 'big-button';
  close.textContent = 'とじる';
  close.addEventListener('click', () => el.remove());
  el.append(h, count, rows, close);
  root.appendChild(el);
}

function card(entry: ZukanEntry, abilities: ReadonlySet<AbilityId>): HTMLElement {
  const { record } = entry;
  const el = document.createElement('div');
  el.className = entry.found ? 'zukan-card is-found' : 'zukan-card';
  el.dataset.record = record.id;
  const picture = document.createElement('div');
  picture.className = 'zukan-picture';
  const name = document.createElement('div');
  name.className = 'zukan-name';
  if (entry.found) {
    name.textContent = record.name;
    if (pictures.has(record.id)) {
      const img = document.createElement('img');
      img.src = `${import.meta.env.BASE_URL}zukan/${record.id}.png`;
      img.alt = '';
      img.loading = 'lazy';
      picture.appendChild(img);
    }
    el.append(picture, name);
    if (record.note) {
      const note = document.createElement('div');
      note.className = 'zukan-note';
      note.textContent = record.note;
      el.appendChild(note);
    }
    return el;
  }
  const mark = document.createElement('span');
  mark.className = 'zukan-mark';
  mark.textContent = '？';
  picture.appendChild(mark);
  // Needs an ability the player has not learned yet: its picture, grey, as a promise of what comes.
  const later = record.requires !== null && !abilities.has(record.requires) ? abilityIcon(record.requires) : '';
  if (later) {
    const badge = document.createElement('span');
    badge.className = 'zukan-later';
    badge.dataset.ability = record.requires ?? '';
    badge.innerHTML = later;
    picture.appendChild(badge);
  }
  el.append(picture);
  return el;
}
