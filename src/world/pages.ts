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

/** A chapter is done when all its islands are cleared, and every island of its ring (the ring's rails exist). */
export function chapterDone(world: WorldFile, chapter: WorldChapter, cleared: string[]): boolean {
  const ids = world.islands.filter((i) => i.chapter === chapter.id).map((i) => i.id);
  ids.push(...(chapter.finale?.ring ?? []));
  return ids.length > 0 && ids.every((id) => cleared.includes(id));
}

/**
 * The rails laid for these clears ("from>to"): a rail once its `from` is cleared, and a rail out of a chapter
 * (`afterChapter`) once that chapter is done. Never the dotted line to a "?" island.
 */
export function laidLinks(world: WorldFile, cleared: string[]): string[] {
  const done = (id: number): boolean => {
    const chapter = world.chapters.find((c) => c.id === id);
    return !!chapter && chapterDone(world, chapter, cleared);
  };
  return world.links
    .filter(([from, to, opts]) => !to.startsWith('teaser:') && cleared.includes(from) && (opts?.afterChapter === undefined || done(opts.afterChapter)))
    .map(([from, to]) => `${from}>${to}`);
}

/**
 * The save's mapLinks of a child who has seen everything these clears open (あいことば version 2 carries no rails
 * and rebuilds them from the clears, docs/PHASE8_CHAPTER3_4.md 第 1 部 §5): every laid rail, and "finale:<id>" for
 * a done chapter whose end has no rail. A chapter's closing rail is left out while the chapter is not done (the
 * map draws it but does not save it then), so its finale still plays when the chapter is really done.
 */
export function seenMapLinks(world: WorldFile, cleared: string[]): string[] {
  const done = world.chapters.filter((c) => chapterDone(world, c, cleared));
  const waiting = new Set(world.chapters.filter((c) => c.finale?.link && !done.includes(c)).map((c) => c.finale?.link));
  return [
    ...laidLinks(world, cleared).filter((key) => !waiting.has(key)),
    ...done.filter((c) => c.finale && !c.finale.link).map((c) => `finale:${c.id}`),
  ];
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
 * The page the map opens on (§3.5), the first that applies: the page of the chapter ending now; the page a new rail
 * starts from; the next island's page; the page of the cleared island with the highest number; page 1.
 */
export function openingPage(world: WorldFile, facts: PageFacts, known: number[] = knownPages(world, facts)): number {
  const pick = (page: number | undefined): number | undefined => (page !== undefined && known.includes(page) ? page : undefined);
  const latest = [...facts.cleared].filter((id) => nodePage(world, id) !== undefined).sort(byNumber).pop();
  return (
    pick(facts.finale === undefined ? undefined : chapterPage(world, facts.finale)) ??
    pick(facts.fresh.length > 0 ? nodePage(world, facts.fresh[0].split('>')[0]) : undefined) ??
    pick(facts.next === undefined ? undefined : nodePage(world, facts.next)) ??
    pick(latest === undefined ? undefined : nodePage(world, latest)) ??
    1
  );
}
