import type { WorldChapter, WorldFile, WorldLinkOptions } from './types';

/*
 * The map's pages (docs/PHASE8_CHAPTER3_4.md 第 1 部 §3): which page each island, "?" island and rail is on, which
 * pages the child knows about, and which page the map opens on. Pure (no DOM), so the smoke tests use it directly.
 */

const byNumber = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

/** The page a chapter's islands are on (1 when the chapter is not in the world file). */
export function chapterPage(world: WorldFile, chapter: number): number {
  return world.chapters.find((c) => c.id === chapter)?.page ?? 1;
}

/** The page of an island, or of a "?" island ("teaser:<chapter>": the page of the island its dotted line starts from). */
export function nodePage(world: WorldFile, id: string): number | undefined {
  if (id.startsWith('teaser:')) {
    const from = world.chapters.find((c) => `teaser:${c.id}` === id)?.teaser?.from;
    return from === undefined ? undefined : nodePage(world, from);
  }
  const island = world.islands.find((i) => i.id === id);
  return island ? chapterPage(world, island.chapter) : undefined;
}

export function linkOptions(world: WorldFile, key: string): WorldLinkOptions | undefined {
  return world.links.find(([from, to]) => `${from}>${to}` === key)?.[2];
}

/** A rail from one page to another (through the cloud gate): the pages at its two ends, else null. */
export function crossPages(world: WorldFile, key: string): { from: number; to: number } | null {
  const [a, b] = key.split('>');
  const from = nodePage(world, a);
  const to = nodePage(world, b);
  return from !== undefined && to !== undefined && from !== to ? { from, to } : null;
}

/**
 * A chapter is done when all its islands are cleared, and every island of its ring (the ring's rails exist).
 * v1.11 (PR9, docs/PHASE9_CHAPTER5_6.md 第 1 部 §3.4) guards, so a chapter whose islands are not all on the map yet
 * never ends early (6-1 alone must not end chapter 6): with `count` (its planned number of stages) the chapter waits
 * until the world has that many of its islands; and a chapter with a `finale` waits until the world has as many of
 * its islands as there are stage files of the chapter (`stageIds`, "<chapter>-<n>", when the caller knows them). The
 * islands an `after` holds back count like the others.
 */
export function chapterDone(world: WorldFile, chapter: WorldChapter, cleared: string[], stageIds?: string[]): boolean {
  const own = world.islands.filter((i) => i.chapter === chapter.id).map((i) => i.id);
  if (chapter.count !== undefined && own.length < chapter.count) return false;
  if (chapter.finale && stageIds && stageIds.filter((id) => id.startsWith(`${chapter.id}-`)).length !== own.length) return false;
  const ids = [...own, ...(chapter.finale?.ring ?? [])];
  return ids.length > 0 && ids.every((id) => cleared.includes(id));
}

/**
 * v1.11 (PR11b, PHASE9_CHAPTER5_6 第 1 部 §3.6・§5.4): the world as the map shows it for these clears: without the islands
 * an `after` still holds back (6-2 until 6-1 is cleared: no island, no "?") and the rails to and from them.
 */
export function visibleWorld(world: WorldFile, cleared: string[]): WorldFile {
  const hidden = new Set(world.islands.filter((i) => i.after !== undefined && !cleared.includes(i.after)).map((i) => i.id));
  if (hidden.size === 0) return world;
  return {
    ...world,
    islands: world.islands.filter((i) => !hidden.has(i.id)),
    links: world.links.filter(([from, to]) => !hidden.has(from) && !hidden.has(to)),
  };
}

/**
 * The rails laid for these clears ("from>to"): a rail once its `from` is cleared, and a rail out of a chapter
 * (`afterChapter`) once that chapter is done. Never the dotted line to a "?" island.
 */
export function laidLinks(world: WorldFile, cleared: string[], stageIds?: string[]): string[] {
  const done = (id: number): boolean => {
    const chapter = world.chapters.find((c) => c.id === id);
    return !!chapter && chapterDone(world, chapter, cleared, stageIds);
  };
  return world.links
    .filter(([from, to, opts]) => !to.startsWith('teaser:') && cleared.includes(from) && (opts?.afterChapter === undefined || done(opts.afterChapter)))
    .map(([from, to]) => `${from}>${to}`);
}

/**
 * The save's mapLinks of a child who has seen everything these clears open (あいことば versions 2 and 3 carry no
 * rails and rebuild them from the clears, docs/PHASE8_CHAPTER3_4.md 第 1 部 §5): every laid rail, and
 * "finale:<id>" for a done chapter whose end has no rail. A chapter's closing rail is left out while the chapter is
 * not done (the map draws it but does not save it then), so its finale still plays when the chapter is really done.
 * `maxPage`: only what was on the map when the code's version came out (docs/PHASE9_CHAPTER5_6.md 第 1 部 §7.3): a
 * rail with an end on a later page, or the end of a chapter on a later page, is not seen yet, so a child typing in
 * a version 2 code still watches the rail grow through the gate to page 3 once.
 */
export function seenMapLinks(world: WorldFile, cleared: string[], maxPage = Infinity, stageIds?: string[]): string[] {
  const done = world.chapters.filter((c) => chapterDone(world, c, cleared, stageIds));
  const waiting = new Set(world.chapters.filter((c) => c.finale?.link && !done.includes(c)).map((c) => c.finale?.link));
  const within = (key: string): boolean => key.split('>').every((id) => (nodePage(world, id) ?? Infinity) <= maxPage);
  // v1.11 (PR10): the world's end too, once its clears are there (a child typing the code in does not watch it again).
  const ending = world.ending && endingReady(world, cleared, stageIds) && (nodePage(world, world.ending.after) ?? Infinity) <= maxPage;
  return [
    ...laidLinks(world, cleared, stageIds).filter((key) => !waiting.has(key) && within(key)),
    ...done.filter((c) => c.finale && !c.finale.link && c.page <= maxPage).map((c) => `finale:${c.id}`),
    ...(ending ? [ENDING_SEEN] : []),
  ];
}

/** v1.11 (PR10): the save's mapLinks mark of the world's end seen. */
export const ENDING_SEEN = 'finale:world';

/**
 * v1.11 (PR10, docs/PHASE9_CHAPTER5_6.md 第 1 部 §3.7): the world's end can play: its `after` stage is cleared and every
 * chapter before that stage's chapter is done.
 */
function endingReady(world: WorldFile, cleared: string[], stageIds?: string[]): boolean {
  const ending = world.ending;
  if (!ending || !cleared.includes(ending.after)) return false;
  const chapter = world.islands.find((i) => i.id === ending.after)?.chapter;
  if (chapter === undefined) return false;
  return world.chapters.filter((c) => c.id < chapter).every((c) => chapterDone(world, c, cleared, stageIds));
}

/** v1.11 (PR10): the world's end plays when the map opens now: it can, and it was not seen ("finale:world"). */
export function endingDue(world: WorldFile, cleared: string[], mapLinks: string[], stageIds?: string[]): boolean {
  return endingReady(world, cleared, stageIds) && !mapLinks.includes(ENDING_SEEN);
}

/** A point in % of the map area. */
export interface MapPoint {
  x: number;
  y: number;
}

/** v1.11 (PR10): a rainbow rail of the world's end, on the one sheet of all the pages side by side. */
export interface WorldBridge {
  /** "from>to": the rail through the gate it stands for ("1-1>3-1"), or "<after>><home>" for the long rail home. */
  key: string;
  from: MapPoint;
  to: MapPoint;
  /** The curve's control point. */
  via: [number, number];
  /** The long rail home (`after` → `home`), under the pages. */
  home?: boolean;
  /** How long it takes to grow (s): over a page 0.8, to the page next to it 0.4, the long rail home 1.0. */
  seconds: number;
}

/**
 * v1.11 (PR10, 第 1 部 §5.3): the pages side by side for the world's end: page n (0 = the leftmost) at 0.32 of its size,
 * n × 34 % from the left and 34 % from the top of the map area (three pages and their gaps just fill it).
 */
export const WORLD_SCALE = 0.32;
export const WORLD_PITCH = 34;
export const WORLD_TOP = 34;
/** Where the long rail home dips to (its control point, % of the area: its middle runs about 81 %, under the pages). */
const HOME_DIP = 112;
/** A rainbow over a page reaches this high (its control point, % of the area). */
const OVER_TOP = 6;
/** A rainbow to the very next page rises this much above the higher of its two gates. */
const NEXT_RISE = 4.4;

/** A point on page `slot` (% of the page) on the one sheet (% of the area). */
export function worldPoint(slot: number, p: MapPoint): MapPoint {
  return { x: WORLD_PITCH * slot + WORLD_SCALE * p.x, y: WORLD_TOP + WORLD_SCALE * p.y };
}

/**
 * v1.11 (PR10, 第 1 部 §5.3): the rainbow rails of the world's end, from the rails through the gate (their exit gate to
 * their enter gate: over the top of the page when the exit is in the page's left half, else straight to the page next to
 * it) and the long rail home under the pages (`after` → `home`). `pages`: the pages in order on the sheet.
 */
export function endingBridges(world: WorldFile, pages: number[]): WorldBridge[] {
  const ending = world.ending;
  if (!ending) return [];
  const slotOf = (id: string): number => pages.indexOf(nodePage(world, id) ?? -1);
  const out: WorldBridge[] = [];
  for (const [from, to, opts] of world.links) {
    const key = `${from}>${to}`;
    if (!opts?.exit || !opts.enter || !crossPages(world, key)) continue;
    const a = worldPoint(slotOf(from), opts.exit);
    const b = worldPoint(slotOf(to), opts.enter);
    const over = opts.exit.x < 50;
    const via: [number, number] = [(a.x + b.x) / 2, over ? OVER_TOP : Math.min(a.y, b.y) - NEXT_RISE];
    out.push({ key, from: a, to: b, via, seconds: over ? 0.8 : 0.4 });
  }
  const after = world.islands.find((i) => i.id === ending.after);
  const home = world.islands.find((i) => i.id === ending.home);
  if (after && home) {
    const a = worldPoint(slotOf(after.id), after);
    const b = worldPoint(slotOf(home.id), home);
    out.push({ key: `${after.id}>${home.id}`, from: a, to: b, via: [(a.x + b.x) / 2, HOME_DIP], home: true, seconds: 1 });
  }
  return out;
}

/**
 * v1.11 (PR10, 第 1 部 §3.7): world.json's checks (scripts/check-stages.mjs): the ending's `after` and `home` are islands,
 * each two islands in a row of its `trail` are joined by a link (either way) or are `after` then `home`; an island's
 * `size` is 0.8–1.4. Returns the problems (none: []).
 */
export function validateWorld(world: WorldFile): string[] {
  const errors: string[] = [];
  const islands = new Set(world.islands.map((i) => i.id));
  for (const i of world.islands) {
    if (i.size !== undefined && !(i.size >= 0.8 && i.size <= 1.4)) errors.push(`island "${i.id}": size ${i.size} is not 0.8–1.4`);
    // v1.11 (PR11b): an island held back until a stage is cleared: that stage is an island, and a rail leads to it.
    if (i.after !== undefined) {
      if (!islands.has(i.after)) errors.push(`island "${i.id}": "after" "${i.after}" is not an island`);
      if (!world.links.some(([, to]) => to === i.id)) errors.push(`island "${i.id}": with "after", a link must lead to it (it appears as that rail grows)`);
    }
  }
  for (const c of world.chapters) {
    const sound = c.finale?.sound;
    if (sound !== undefined && sound !== 'fanfare' && sound !== 'card') errors.push(`chapter ${c.id}: finale "sound" must be "fanfare" or "card"`);
  }
  const ending = world.ending;
  if (ending) {
    if (!islands.has(ending.after)) errors.push(`ending: "after" "${ending.after}" is not an island`);
    if (!islands.has(ending.home)) errors.push(`ending: "home" "${ending.home}" is not an island`);
    const joined = (a: string, b: string): boolean =>
      (a === ending.after && b === ending.home) || world.links.some(([from, to]) => (from === a && to === b) || (from === b && to === a));
    for (const id of ending.trail) if (!islands.has(id)) errors.push(`ending: trail "${id}" is not an island`);
    for (let i = 1; i < ending.trail.length; i++) {
      const [a, b] = [ending.trail[i - 1], ending.trail[i]];
      if (!joined(a, b)) errors.push(`ending: trail ${a} → ${b} is not a link (nor "after" → "home")`);
    }
    if (ending.trail[0] !== ending.home || ending.trail[ending.trail.length - 1] !== ending.home) errors.push(`ending: the trail must start and end at "home" (${ending.home})`);
    for (const line of ending.card.split('\n')) if ([...line].length > 20) errors.push(`ending: card line "${line}" is longer than 20 characters`);
  }
  return errors;
}

/** The heading beside "ちず" on a page. */
export function pageTitle(world: WorldFile, page: number): string {
  return world.pages?.find((p) => p.id === page)?.title ?? '';
}

export interface PageFacts {
  /** Islands whose stage can be played now. */
  unlocked: string[];
  /** Islands cleared (the save). */
  cleared: string[];
  /** Links whose rail is laid ("from>to"). */
  laid: string[];
  /** Laid links drawn for the first time now (the rail grows). */
  fresh: string[];
  /** The "?" island shown ("teaser:<chapter>"), if any. */
  teaser?: string;
  /** The island to go to next. */
  next?: string;
  /** The chapter whose end plays now, if any. */
  finale?: number;
  /** v1.11 (PR10): the world's end plays now (it opens on its `after` island's page). */
  ending?: boolean;
}

/**
 * The pages the child knows about (§3.4), in order: one with an open island, one a laid rail comes into (a rail
 * through the gate makes the page beyond it known), one with the "?" island. Page 1 always.
 */
export function knownPages(world: WorldFile, facts: PageFacts): number[] {
  const pages = new Set<number>([1]);
  const add = (page: number | undefined): void => {
    if (page !== undefined) pages.add(page);
  };
  for (const id of facts.unlocked) add(nodePage(world, id));
  for (const key of facts.laid) {
    const [from, to] = key.split('>');
    add(nodePage(world, from));
    add(nodePage(world, to));
  }
  if (facts.teaser) add(nodePage(world, facts.teaser));
  return [...pages].sort((a, b) => a - b);
}

/**
 * The page the map opens on (§3.5), the first that applies: v1.11 (PR10) the page the world's end starts on (第 1 部
 * §3.6 の 0); the page of the chapter ending now; the page a new rail
 * starts from; the next island's page; the page of the cleared island with the highest number; page 1.
 */
export function openingPage(world: WorldFile, facts: PageFacts, known: number[] = knownPages(world, facts)): number {
  const pick = (page: number | undefined): number | undefined => (page !== undefined && known.includes(page) ? page : undefined);
  const latest = [...facts.cleared].filter((id) => nodePage(world, id) !== undefined).sort(byNumber).pop();
  return (
    pick(facts.ending && world.ending ? nodePage(world, world.ending.after) : undefined) ??
    pick(facts.finale === undefined ? undefined : chapterPage(world, facts.finale)) ??
    pick(facts.fresh.length > 0 ? nodePage(world, facts.fresh[0].split('>')[0]) : undefined) ??
    pick(facts.next === undefined ? undefined : nodePage(world, facts.next)) ??
    pick(latest === undefined ? undefined : nodePage(world, latest)) ??
    1
  );
}
