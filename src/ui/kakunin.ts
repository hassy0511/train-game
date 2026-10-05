import { checkKakuninCode, KAKUNIN_DIGITS, kakuninMovieSearch, kakuninSearch, rememberKakunin } from '../core/kakunin';
import { listMovieIds, listStageIds, peekMovie, peekStage } from '../stage/loader';
import world from '../world/world.json';
import type { WorldFile } from '../world/types';

/*
 * 「かくにん モード」 screens (docs/TECH_SPEC.md §かくにん モード), all DOM overlays: the number pad for the 4-digit
 * code (an iPad has no keyboard here) and the stage list. The list is every stage by chapter (released or not) and
 * the hidden test courses; a stage opens its missions, and a tap starts that mission in the sandbox run.
 */

/** A big number pad. A right code is remembered on the device and `onOk` runs; a wrong one shakes gently and clears. */
export function showKakuninPad(root: HTMLElement, handlers: { onOk(): void; onClose(): void }): void {
  const el = document.createElement('div');
  el.id = 'kakunin-pad';
  el.className = 'overlay kakunin kakunin-pad-overlay';
  const panel = document.createElement('div');
  panel.className = 'kakunin-pad-panel';

  const h = document.createElement('h1');
  h.textContent = 'かくにん モード';
  const note = document.createElement('p');
  note.className = 'kakunin-note';
  note.textContent = `${KAKUNIN_DIGITS}けたの 番号を 入れてください。`;
  const dots = document.createElement('div');
  dots.id = 'kakunin-dots';
  dots.className = 'kakunin-dots';
  dots.setAttribute('aria-live', 'polite');
  const dotEls = Array.from({ length: KAKUNIN_DIGITS }, () => {
    const d = document.createElement('span');
    d.className = 'kakunin-dot';
    dots.appendChild(d);
    return d;
  });
  const message = document.createElement('p');
  message.id = 'kakunin-message';
  message.className = 'kakunin-note kakunin-message';

  let digits = '';
  let checking = false;
  const draw = (): void => dotEls.forEach((d, i) => d.classList.toggle('is-filled', i < digits.length));

  const press = async (digit: string): Promise<void> => {
    if (checking || digits.length >= KAKUNIN_DIGITS) return;
    digits += digit;
    message.textContent = '';
    draw();
    if (digits.length < KAKUNIN_DIGITS) return;
    checking = true;
    const ok = await checkKakuninCode(digits);
    if (ok) {
      rememberKakunin();
      el.remove();
      handlers.onOk();
      return;
    }
    // Wrong: a gentle shake, then clear. No lockout.
    dots.classList.add('is-shaking');
    message.textContent = '番号が ちがうようです。';
    window.setTimeout(() => {
      dots.classList.remove('is-shaking');
      digits = '';
      draw();
      checking = false;
    }, 450);
  };

  const pad = document.createElement('div');
  pad.className = 'kakunin-keys';
  const key = (label: string, id: string, onTap: () => void, extra = ''): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kakunin-key ${extra}`.trim();
    b.dataset.key = id;
    b.textContent = label;
    b.addEventListener('click', onTap);
    pad.appendChild(b);
  };
  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) key(d, d, () => void press(d));
  key('けす', 'clear', () => {
    if (checking) return;
    digits = '';
    message.textContent = '';
    draw();
  }, 'is-small');
  key('0', '0', () => void press('0'));
  key('←', 'back', () => {
    if (checking) return;
    digits = digits.slice(0, -1);
    draw();
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'kakunin-pad-close';
  close.className = 'parents-button kakunin-close';
  close.textContent = 'やめる';
  close.addEventListener('click', () => {
    el.remove();
    handlers.onClose();
  });

  // The head (title, dots, message) and the keys: side by side on a short landscape screen (a phone).
  const head = document.createElement('div');
  head.className = 'kakunin-pad-head';
  head.append(h, note, dots, message);
  panel.append(head, pad);
  el.append(panel, close);
  root.appendChild(el);
}

interface ListedStage {
  id: string;
  /** Null: the stage file is not there yet (a later chapter). */
  title: string | null;
  missions: string[];
}

interface ListedGroup {
  key: string;
  label: string;
  stages: ListedStage[];
  /** A line under the label (an empty chapter). */
  note?: string;
}

const byStageOrder = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

/** Every chapter of the world map with its stages (those without a file too), then the hidden test courses. */
async function listing(): Promise<ListedGroup[]> {
  const file = world as unknown as WorldFile;
  const ids = listStageIds();
  const seen = new Set<string>();
  const stageOf = async (id: string): Promise<ListedStage> => {
    seen.add(id);
    const peek = await peekStage(id);
    return { id, title: peek ? peek.title : null, missions: peek ? peek.missionTitles : [] };
  };
  const groups: ListedGroup[] = [];
  for (const chapter of file.chapters) {
    const stageIds = file.islands
      .filter((i) => i.chapter === chapter.id)
      .map((i) => i.id)
      .sort(byStageOrder);
    const stages = await Promise.all(stageIds.map(stageOf));
    groups.push({
      key: String(chapter.id),
      label: chapter.title,
      stages,
      note: stages.length === 0 ? 'まだ ステージが ありません。' : undefined,
    });
  }
  // A stage file the map does not know (yet), outside the test courses.
  const others = await Promise.all(ids.filter((id) => !id.startsWith('0-') && !seen.has(id)).sort(byStageOrder).map(stageOf));
  if (others.length > 0) groups.push({ key: 'other', label: 'ちずに まだ ない ステージ', stages: others });
  const tests = await Promise.all(ids.filter((id) => id.startsWith('0-')).sort(byStageOrder).map(stageOf));
  groups.push({ key: 'test', label: 'てすとの コース', stages: tests });
  return groups;
}

/**
 * The stage list. `open`: a stage whose missions are shown at once (the one just played). `onClose` runs on "もどる"
 * (the list is removed first). A stage or mission tapped starts that run: the page goes to `?stage=…&kakunin=1…`.
 */
export function showKakuninList(root: HTMLElement, options: { open?: string; onClose(): void }): void {
  const el = document.createElement('div');
  el.id = 'kakunin-list';
  el.className = 'overlay kakunin kakunin-list-overlay';
  const inner = document.createElement('div');
  inner.className = 'kakunin-inner';
  const h = document.createElement('h1');
  h.textContent = 'かくにん モード';
  const note = document.createElement('p');
  note.className = 'kakunin-note';
  note.textContent = 'ステージと ミッションを えらぶと、そこから あそべます。きろくは かわりません。';
  const body = document.createElement('div');
  body.className = 'kakunin-body';
  body.textContent = 'よみこみ ちゅう…';
  inner.append(h, note, body);

  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'kakunin-close';
  close.className = 'parents-button kakunin-close';
  close.textContent = 'もどる';
  close.addEventListener('click', () => {
    el.remove();
    options.onClose();
  });
  el.append(inner, close);
  root.appendChild(el);

  const start = (id: string, mission: number): void => {
    location.search = kakuninSearch(id, mission);
  };
  const missionButton = (stage: ListedStage, mission: number, label: string, extra = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kakunin-mission ${extra}`.trim();
    b.dataset.stage = stage.id;
    b.dataset.mission = String(mission);
    b.textContent = label;
    b.addEventListener('click', () => start(stage.id, mission));
    return b;
  };

  void listing().then((groups) => {
    body.textContent = '';
    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'kakunin-chapter';
      section.dataset.chapter = group.key;
      const h2 = document.createElement('h2');
      h2.textContent = group.label;
      section.appendChild(h2);
      if (group.note) {
        const p = document.createElement('p');
        p.className = 'kakunin-note';
        p.textContent = group.note;
        section.appendChild(p);
      }
      for (const stage of group.stages) {
        const row = document.createElement('div');
        row.className = 'kakunin-stage-row';
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'kakunin-stage';
        head.dataset.stage = stage.id;
        head.disabled = stage.title === null;
        head.setAttribute('aria-expanded', 'false');
        const id = document.createElement('span');
        id.className = 'kakunin-stage-id';
        id.textContent = stage.id;
        const title = document.createElement('span');
        title.className = 'kakunin-stage-title';
        title.textContent = stage.title ?? 'まだ ありません';
        head.append(id, title);
        const missions = document.createElement('div');
        missions.className = 'kakunin-missions';
        missions.hidden = true;
        if (stage.title !== null) {
          if (stage.missions.length === 0) {
            missions.appendChild(missionButton(stage, 0, 'はしる（ミッションは ありません）', 'is-first'));
          } else {
            missions.appendChild(missionButton(stage, 0, `はじめから（ミッション 1: ${stage.missions[0]}）`, 'is-first'));
            stage.missions.forEach((title, i) => {
              if (i > 0) missions.appendChild(missionButton(stage, i, `ミッション ${i + 1}: ${title}`));
            });
          }
        }
        const toggle = (open: boolean): void => {
          missions.hidden = !open;
          head.setAttribute('aria-expanded', String(open));
          row.classList.toggle('is-open', open);
        };
        head.addEventListener('click', () => toggle(missions.hidden !== false));
        row.append(head, missions);
        section.appendChild(row);
        if (options.open === stage.id && stage.title !== null) {
          toggle(true);
          window.setTimeout(() => row.scrollIntoView({ block: 'center' }), 0);
        }
      }
      body.appendChild(section);
    }
    // v1.12 (えんしゅつ): the movies (src/movies/), each a tap away (「エンディング」).
    void movieSection().then((section) => body.appendChild(section));
  });
}

/** v1.12: 「ムービー」: a button per movie; a tap plays it (`?movie=…&kakunin=1`; back to this list after its card). */
async function movieSection(): Promise<HTMLElement> {
  const section = document.createElement('section');
  section.className = 'kakunin-chapter';
  section.dataset.chapter = 'movie';
  const h2 = document.createElement('h2');
  h2.textContent = 'ムービー';
  section.appendChild(h2);
  for (const id of listMovieIds()) {
    const movie = await peekMovie(id);
    if (!movie) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kakunin-stage kakunin-movie';
    b.dataset.movie = id;
    const title = document.createElement('span');
    title.className = 'kakunin-stage-title';
    title.textContent = movie.title;
    b.appendChild(title);
    b.addEventListener('click', () => {
      location.search = kakuninMovieSearch(id);
    });
    const row = document.createElement('div');
    row.className = 'kakunin-stage-row';
    row.appendChild(b);
    section.appendChild(row);
  }
  return section;
}

/**
 * The small 「かくにん」 mark while a check run goes on. It also opens the stage list again (no tap by a child can
 * reach it: the mode is behind the code, and a run only starts from the list).
 */
export function createKakuninBadge(root: HTMLElement, onTap: () => void): HTMLButtonElement {
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.id = 'kakunin-badge';
  badge.className = 'kakunin-badge';
  badge.textContent = 'かくにん';
  badge.addEventListener('click', onTap);
  root.appendChild(badge);
  return badge;
}
