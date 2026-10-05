import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { knownPages, openingPage, seenMapLinks, type PageFacts } from '../../src/world/pages';
import type { WorldFile } from '../../src/world/types';

/**
 * The map's pages (docs/PHASE8_CHAPTER3_4.md 第 1 部 §3–§5), from prepared saves: page 1 alone until chapter 2 is
 * done; then the rail grows from the first town to the cloud gate, the map turns to page 2 and the rail grows on to
 * 3-1 (once). ◀ ▶, a swipe or a tap on the gate turn the pages. Chapter 3's end (the water light, snow on chapter
 * 4) and chapter 4's end (the aurora) play once each with their cards. Page 3 (chapters 5 and 6,
 * docs/PHASE9_CHAPTER5_6.md 第 1 部 §3, §11): once chapter 4 is done, the rail grows from 4-3 to the gate where
 * chapter 5's "?" used to be, the map turns to page 3 and the rail grows on to 5-1 (once).
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORLD = JSON.parse(readFileSync(resolve(ROOT, 'src/world/world.json'), 'utf8')) as WorldFile;

const KEY = 'train-game.progress.v1';
const CH1 = ['1-1', '1-2', '1-3'];
const CH2 = ['2-1', '2-2', '2-3'];
const CH3 = ['3-1', '3-2', '3-3'];
const CH4 = ['4-1', '4-2', '4-3'];
const RING = ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1'];
const GATE = '1-1>3-1';
/** The rail from chapter 4 through the gate to page 3 (docs/PHASE9_CHAPTER5_6.md 第 1 部 §3.3). */
const GATE5 = '4-3>5-1';
/**
 * Whether 5-1's stage is there yet: the map and the あいことば come before it (the island is a "?" until then, like
 * chapters 3 and 4's islands were before their stages). The tests below hold either way.
 */
const HAS_5_1 = existsSync(resolve(ROOT, 'src/stages/5-1.json'));
const ABILITIES = ['whistle', 'jump', 'light', 'rocket'];

type Save = { cleared: string[]; abilities: string[]; mapLinks: string[]; resume?: { stage: string; mission: number } };

/** Puts the save in before the game reads it (only into an empty storage, so reloads keep what the game saved). */
async function seed(page: Page, save: Save): Promise<void> {
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schema: 1, records: [], ...data }));
    },
    [KEY, save] as const,
  );
}

const saved = (page: Page): Promise<Save> => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), KEY);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#title-screen')).toBeVisible();
}

async function openMap(page: Page): Promise<Locator> {
  await page.locator('#title-map').click();
  const map = page.locator('#map');
  await expect(map).toBeVisible();
  return map;
}

/** Waits for the page strip to stop sliding. */
async function turned(page: Page, n: number): Promise<void> {
  await expect(page.locator('#map')).toHaveAttribute('data-page', String(n));
  await page.locator('.map-pages').evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

/**
 * A finger drawn across the map: pointer down where it starts, up `ms` later where it ends, then the click a browser
 * may send when both are on the same thing (the worst case: a swipe that starts and ends on an island). Sent in the
 * page, so the timing is the page's own (the title's 3D drawn behind the map makes real input slow here).
 */
async function swipe(page: Page, from: { x: number; y: number }, dx: number, dy = 0, ms = 250): Promise<void> {
  await page.evaluate(
    async ({ from, dx, dy, ms }) => {
      const at = (x: number, y: number): PointerEventInit => ({
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 7,
        isPrimary: true,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      });
      const start = document.elementFromPoint(from.x, from.y) ?? document.body;
      start.dispatchEvent(new PointerEvent('pointerdown', at(from.x, from.y)));
      await new Promise((ok) => window.setTimeout(ok, ms));
      const end = document.elementFromPoint(from.x + dx, from.y + dy) ?? document.body;
      end.dispatchEvent(new PointerEvent('pointerup', at(from.x + dx, from.y + dy)));
      const common = start.contains(end) ? start : end.contains(start) ? end : null;
      common?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: from.x + dx, clientY: from.y + dy }));
    },
    { from, dx, dy, ms },
  );
}

/**
 * From now on, keeps what each element matching `selector` looks like the moment it is added (its island, its text
 * and its box with its pop-in finished): the snow and the bubble come and go in a second or two, quicker than a slow
 * screenshot, so the test reads these instead of looking for them afterwards.
 */
async function recordAdded(page: Page, selector: string): Promise<void> {
  await page.evaluate((selector) => {
    const w = window as unknown as { __added?: Record<string, { island?: string; text: string; box: DOMRect }[]> };
    const seen: { island?: string; text: string; box: DOMRect }[] = [];
    (w.__added ??= {})[selector] = seen;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement) || !n.matches(selector)) continue;
          for (const a of n.getAnimations()) a.finish();
          seen.push({ island: n.dataset.island, text: n.textContent ?? '', box: n.getBoundingClientRect().toJSON() as DOMRect });
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }, selector);
}

type Added = { island?: string; text: string; box: { x: number; width: number } };

/** What `recordAdded` kept for `selector`, once there are at least `count`. */
async function added(page: Page, selector: string, count = 1): Promise<Added[]> {
  const handle = await page.waitForFunction(
    ([selector, count]) => {
      const seen = (window as unknown as { __added?: Record<string, unknown[]> }).__added?.[selector as string] ?? [];
      return seen.length >= (count as number) ? seen : null;
    },
    [selector, count] as const,
    { timeout: 20_000 },
  );
  return (await handle.jsonValue()) as Added[];
}

const centre = async (target: Locator): Promise<{ x: number; y: number }> => {
  const b = await target.boundingBox();
  if (!b) throw new Error('no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test('the page to open on and the pages known (§3.4–3.5), one rule at a time', () => {
  const facts = (f: Partial<PageFacts>): PageFacts => ({ unlocked: [], cleared: [], laid: [], fresh: [], ...f });
  const open = (f: Partial<PageFacts>): number => openingPage(WORLD, facts(f));
  // Known: page 1 always; page 2 once the rail through the gate is laid, or an island there is open, or the "?" is there.
  expect(knownPages(WORLD, facts({ unlocked: ['1-1'] }))).toEqual([1]);
  expect(knownPages(WORLD, facts({ laid: RING }))).toEqual([1]);
  expect(knownPages(WORLD, facts({ laid: [...RING, GATE] }))).toEqual([1, 2]);
  expect(knownPages(WORLD, facts({ unlocked: ['3-1'] }))).toEqual([1, 2]);
  // Page 3 once the rail through the second gate is laid.
  expect(knownPages(WORLD, facts({ laid: [...RING, GATE, GATE5] }))).toEqual([1, 2, 3]);
  expect(knownPages(WORLD, facts({ laid: [...RING, GATE] }))).toEqual([1, 2]);
  const both = { laid: [...RING, GATE] };
  // 1. A chapter's end not seen yet: its page.
  expect(open({ ...both, finale: 3, fresh: ['1-1>1-2'], next: '1-2' })).toBe(2);
  expect(open({ ...both, finale: 2, next: '3-2' })).toBe(1);
  // 2. A new rail: the page it starts from (through the gate: page 1, then it turns by itself).
  expect(open({ ...both, fresh: [GATE], next: '3-1' })).toBe(1);
  expect(openingPage(WORLD, facts({ laid: [...RING, GATE, GATE5], fresh: [GATE5], next: '5-1' }))).toBe(2);
  expect(open({ ...both, fresh: ['3-1>3-2'], next: '1-2' })).toBe(2);
  // 3. The next island's page.
  expect(open({ ...both, next: '3-2', cleared: ['1-1', '2-3'] })).toBe(2);
  expect(open({ ...both, next: '1-2', cleared: ['3-1'] })).toBe(1);
  // 4. The page of the cleared island with the highest number.
  expect(open({ ...both, cleared: ['1-1', '2-3', '3-1'] })).toBe(2);
  expect(open({ ...both, cleared: [...CH1, ...CH2] })).toBe(1);
  // 5. Else page 1; and never a page the child does not know about.
  expect(open({ ...both })).toBe(1);
  expect(open({ next: '3-2' })).toBe(1);
});

test('the rails an あいことば counts as seen stop at the pages its version had (第 1 部 §7.3)', () => {
  const all4 = [...CH1, ...CH2, ...CH3, ...CH4];
  // Version 2 came out with two pages: the rail through the gate to page 3 is still to grow.
  const v2 = seenMapLinks(WORLD, all4, 2);
  expect(v2).toContain(GATE);
  expect(v2).toContain('4-2>4-3');
  expect(v2).toContain('finale:4');
  expect(v2).not.toContain(GATE5);
  // Version 3 (three pages), and no limit: seen.
  expect(seenMapLinks(WORLD, all4, 3)).toContain(GATE5);
  expect(seenMapLinks(WORLD, all4)).toEqual(seenMapLinks(WORLD, all4, 3));
  // Chapter 4 not done: its rail out waits either way.
  expect(seenMapLinks(WORLD, [...CH1, ...CH2, ...CH3, '4-3'], 3)).not.toContain(GATE5);
});

test('before chapter 2 is done: page 1 alone, as it always was', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { cleared: [...CH1, '2-1'], abilities: ABILITIES, mapLinks: RING.slice(0, 4) });
  await toTitle(page);
  // Stars: chapters 3, 4 and 5 are there, faint (their first island is not open).
  await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ☆\s*3しょう ☆\s*4しょう ☆\s*5しょう ☆/);
  await expect(page.locator('.title-chapter.is-faint')).toHaveCount(3);
  const map = await openMap(page);
  await expect(map).toHaveAttribute('data-page', '1');
  await expect(page.locator('.map-page')).toHaveCount(1);
  for (const sel of ['#map-prev', '#map-next', '.map-dots', '#map-page-title', '.map-gate', '.map-island.is-teaser']) {
    await expect(page.locator(sel)).toHaveCount(0);
  }
  for (const id of [...CH3, ...CH4]) await expect(page.locator(`.map-island[data-island="${id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-link="${GATE}"]`)).toHaveCount(0);
  // A swipe does nothing.
  await swipe(page, { x: 900, y: 420 }, -300);
  await expect(map).toHaveAttribute('data-page', '1');
  await page.screenshot({ path: resolve(OUT, 'map-pages-page1-only.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('chapter 2 done (its ring seen before): the rail to the gate, the page turns, then ◀ ▶, the gate and a swipe', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { cleared: [...CH1, ...CH2], abilities: ABILITIES, mapLinks: RING, resume: { stage: '2-1', mission: 1 } });
  await toTitle(page);
  await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ★\s*3しょう ☆\s*4しょう ☆/);
  const map = await openMap(page);
  // It opens on page 1 (the new rail starts there); hands off while the rail grows to the gate.
  await expect(map).toHaveAttribute('data-page', '1');
  await expect(map).toHaveAttribute('data-growing', '1');
  const out = page.locator(`[data-link="${GATE}"]`);
  await expect(out).toHaveClass(/is-growing/);
  // Not saved while it still grows (read together: the save and the end of growing come in the same moment).
  const early = await page.evaluate(
    (key) => ({ growing: document.getElementById('map')?.dataset.growing, links: (JSON.parse(localStorage.getItem(key) ?? '{}').mapLinks ?? []) as string[] }),
    KEY,
  );
  expect(early.growing).toBe('1');
  expect(early.links).not.toContain(GATE);
  await expect(page.locator('#map-close')).toBeHidden();
  await expect(page.locator('#map-next')).toBeHidden();
  await expect(page.locator('.map-gate[data-gate="exit"]')).toBeVisible();
  // No swipe and no taps on the islands meanwhile.
  await swipe(page, { x: 900, y: 420 }, -300);
  await page.locator('.map-island[data-island="1-2"]').click({ force: true });
  expect(new URL(page.url()).search).toBe('');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, 'map-page1-gate.png') });
  // Then page 2 by itself, and the rail grows on from the gate there to 3-1.
  await turned(page, 2);
  await expect(page.locator(`[data-link-enter="${GATE}"]`)).toHaveClass(/is-growing/);
  await expect(map).not.toHaveAttribute('data-growing', /.+/, { timeout: 10_000 });
  expect((await saved(page)).mapLinks).toContain(GATE);
  await expect(page.locator('#map-close')).toBeVisible();
  await expect(page.locator('#map-page-title')).toHaveText('3しょう みず・4しょう こおりと ゆき');
  await expect(page.locator('.map-dot')).toHaveCount(2);
  await expect(page.locator('.map-dot.is-on')).toHaveAttribute('data-page', '2');
  await expect(page.locator('#map-prev')).toBeVisible();
  await expect(page.locator('#map-next')).toBeHidden();
  // 3-1 (its stage is there) is open, the next island to play; 3-2, 3-3 and chapter 4's islands (their stages are
  // all there now) show their names, locked. No "?" island on the page, none for chapter 5 yet.
  await expect(page.locator('.map-island[data-island="3-1"]')).toHaveClass(/is-next/);
  await expect(page.locator('.map-page[data-page="2"] .map-island.is-unknown')).toHaveCount(0);
  for (const id of [...CH3.slice(1), ...CH4]) {
    await expect(page.locator(`.map-island[data-island="${id}"]`)).not.toHaveClass(/is-unknown/);
    await expect(page.locator(`.map-island[data-island="${id}"]`)).toHaveClass(/is-locked/);
  }
  await expect(page.locator('.map-island.is-teaser')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, 'map-page2.png') });

  // Turning: ◀ back to page 1 (its heading), ▶ again, the gate on each side.
  await page.locator('#map-prev').click();
  await turned(page, 1);
  await expect(page.locator('#map-page-title')).toHaveText('1しょう・2しょう');
  await expect(page.locator('#map-prev')).toBeHidden();
  await expect(page.locator('#map-next')).toBeVisible();
  // 3-1, the next island, is over on page 2: ▶ beckons (it bobs, so the clicks on it are forced).
  await expect(page.locator('#map-next')).toHaveClass(/is-beckon/);
  await page.screenshot({ path: resolve(OUT, 'map-page1-with-gate.png') });
  await page.locator('#map-next').click({ force: true });
  await turned(page, 2);
  await page.locator('.map-gate[data-gate="enter"]').click();
  await turned(page, 1);
  await page.locator('.map-gate[data-gate="exit"]').click();
  await turned(page, 2);

  // A swipe: to the right goes back, a slow or steep one does nothing; the tap it ends with reaches no island.
  await swipe(page, { x: 400, y: 420 }, 250, 0, 1200);
  await page.waitForTimeout(300);
  await expect(map).toHaveAttribute('data-page', '2');
  await swipe(page, { x: 400, y: 300 }, 80, 200);
  await page.waitForTimeout(300);
  await expect(map).toHaveAttribute('data-page', '2');
  await swipe(page, { x: 400, y: 420 }, 250);
  await turned(page, 1);
  // Started on an open island (2-1 has a saved mission): the page turns, no bubble, no stage.
  const from = await centre(page.locator('.map-island[data-island="2-1"] img'));
  await swipe(page, from, -120);
  await turned(page, 2);
  await expect(page.locator('.map-choose')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
  // Turning closes the "つづきから / はじめから" bubble.
  await swipe(page, { x: 400, y: 420 }, 250);
  await turned(page, 1);
  await page.locator('.map-island[data-island="2-1"]').click();
  await expect(page.locator('.map-choose')).toBeVisible();
  await page.locator('#map-next').click({ force: true });
  await expect(page.locator('.map-choose')).toHaveCount(0);
  await turned(page, 2);

  // Once only: opened again, nothing grows; it opens on page 2 (§3.5: the next island, 3-1, is there).
  await page.locator('#map-close').click();
  await openMap(page);
  await expect(map).toHaveAttribute('data-page', '2');
  await expect(map).not.toHaveAttribute('data-growing', /.+/);
  await expect(page.locator(`[data-link-enter="${GATE}"]`)).toHaveClass(/is-laid/);
  await expect(page.locator(`[data-link-enter="${GATE}"]`)).not.toHaveClass(/is-growing/);
  await expect(page.locator('#map-prev')).toBeVisible();
  expect(errors).toEqual([]);
});

test('leaving while the rail grows through the gate shows it again next time', async ({ page }) => {
  await seed(page, { cleared: [...CH1, ...CH2], abilities: ABILITIES, mapLinks: RING });
  await toTitle(page);
  await openMap(page);
  await expect(page.locator(`[data-link="${GATE}"]`)).toHaveClass(/is-growing/);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  expect((await saved(page)).mapLinks).not.toContain(GATE);
  await openMap(page);
  await expect(page.locator(`[data-link="${GATE}"]`)).toHaveClass(/is-growing/);
  await turned(page, 2);
  await expect(page.locator('#map')).not.toHaveAttribute('data-growing', /.+/, { timeout: 10_000 });
  expect((await saved(page)).mapLinks).toContain(GATE);
});

test("chapter 2's end first: the ring and its card, and only then the rail to the gate", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { cleared: [...CH1, ...CH2], abilities: ABILITIES, mapLinks: RING.slice(0, 5) });
  await toTitle(page);
  const map = await openMap(page);
  await expect(map).toHaveAttribute('data-page', '1');
  await expect(map).toHaveAttribute('data-finale', 'playing');
  const card = page.locator('#card');
  await expect(card).toContainText('2しょう クリア', { timeout: 20_000 });
  // While the card is up the gate's rail waits (not growing, not there).
  await expect(page.locator(`[data-link="${GATE}"]`)).not.toHaveClass(/is-growing/);
  await expect(page.locator(`[data-link="${GATE}"]`)).toHaveClass(/is-pending/);
  await expect(page.locator('.map-gate[data-gate="exit"]')).toBeHidden();
  await page.locator('#card-button').click();
  await expect(page.locator(`[data-link="${GATE}"]`)).toHaveClass(/is-growing/);
  await expect(page.locator('.map-gate[data-gate="exit"]')).toBeVisible();
  await expect(page.locator('#map-close')).toBeHidden();
  await turned(page, 2);
  await expect(map).toHaveAttribute('data-finale', 'done', { timeout: 10_000 });
  await expect(page.locator('#map-close')).toBeVisible();
  const links = (await saved(page)).mapLinks;
  expect(links).toContain('2-3>1-1');
  expect(links).toContain(GATE);
  expect(errors).toEqual([]);
});

const CH3_DONE: Save = {
  cleared: [...CH1, ...CH2, ...CH3],
  abilities: [...ABILITIES, 'dive'],
  mapLinks: [...RING, GATE, '3-1>3-2', '3-2>3-3'],
};

test("chapter 3's end: the water light 3-1 → 4-1, snow on chapter 4, the card, once", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, CH3_DONE);
  await toTitle(page);
  await expect(page.locator('#title-chapters')).toHaveText(/3しょう ★\s*4しょう ☆/);
  await recordAdded(page, '.map-snow');
  const map = await openMap(page);
  // It opens on chapter 3's page; the long rail down to 4-1 grows, then the light runs along the road.
  await expect(map).toHaveAttribute('data-page', '2');
  await expect(map).toHaveAttribute('data-finale', 'playing');
  await expect(page.locator('[data-link="3-3>4-1"]')).toHaveClass(/is-growing/);
  await expect(page.locator('#map-close')).toBeHidden();
  await expect(page.locator('#map-prev')).toBeHidden();
  await expect(page.locator('.map-link.is-lit.is-water').first()).toBeAttached({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, 'map-ch3-finale.png') });
  expect((await added(page, '.map-snow', CH4.length)).map((s) => s.island)).toEqual(CH4);
  await page.screenshot({ path: resolve(OUT, 'map-ch3-snow.png') });
  await expect(map).toHaveAttribute('data-trail', '3-1,3-2,3-3,4-1');
  for (const key of ['3-1>3-2', '3-2>3-3', '3-3>4-1']) await expect(page.locator(`[data-link="${key}"]`)).toHaveClass(/is-lit/);
  const card = page.locator('#card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('3しょう クリア！');
  await expect(card).toContainText('みずの せかいが');
  await expect(card).toContainText('ぜんぶ つながった！');
  await expect(card.locator('svg.card-icon')).toBeVisible();
  await expect(page.locator('#card-button')).toHaveText('つぎへ');
  await expect(page.locator('#card-button')).toBeVisible();
  await page.screenshot({ path: resolve(OUT, 'map-ch3-card.png') });
  expect((await saved(page)).mapLinks).not.toContain('3-3>4-1');
  await page.locator('#card-button').click();
  expect((await saved(page)).mapLinks).toContain('3-3>4-1');
  await expect(map).toHaveAttribute('data-finale', 'done');
  await expect(page.locator('#map-close')).toBeVisible();
  await expect(page.locator('.map-island.is-teaser')).toHaveCount(0);

  // Once only.
  await page.locator('#map-close').click();
  await openMap(page);
  await expect(map).toHaveAttribute('data-page', '2');
  await page.waitForTimeout(2_500);
  await expect(card).toHaveCount(0);
  await expect(map).not.toHaveAttribute('data-finale', /.+/);
  expect(errors).toEqual([]);
});

test("chapter 3's last stage played on its own does not end the chapter", async ({ page }) => {
  await seed(page, { cleared: [...CH1, ...CH2, '3-3'], abilities: ABILITIES, mapLinks: [...RING, GATE] });
  await toTitle(page);
  const map = await openMap(page);
  await expect(page.locator('[data-link="3-3>4-1"]')).toHaveClass(/is-laid/);
  await expect(page.locator('[data-link="3-3>4-1"]')).not.toHaveClass(/is-growing/);
  await page.waitForTimeout(3_000);
  await expect(page.locator('#card')).toHaveCount(0);
  await expect(map).not.toHaveAttribute('data-finale', /.+/);
  expect((await saved(page)).mapLinks).not.toContain('3-3>4-1');
});

const CH4_DONE: Save = {
  cleared: [...CH1, ...CH2, ...CH3, ...CH4],
  abilities: [...ABILITIES, 'dive', 'plow'],
  mapLinks: [...RING, GATE, '3-1>3-2', '3-2>3-3', '3-3>4-1', '4-1>4-2', '4-2>4-3'],
};

test("chapter 4's end: the aurora and the islands twinkling, the card, then the rail through the gate to page 3", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, CH4_DONE);
  await toTitle(page);
  await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ★\s*3しょう ★\s*4しょう ★\s*5しょう ☆/);
  const map = await openMap(page);
  await expect(map).toHaveAttribute('data-page', '2');
  await expect(map).toHaveAttribute('data-finale', 'playing');
  await expect(map).toHaveClass(/is-dusk/);
  // The rail out of chapter 4 waits for the card: not growing, its gate not there.
  await expect(page.locator(`[data-link="${GATE5}"]`)).toHaveClass(/is-pending/);
  await expect(page.locator(`.map-gate[data-gate-link="${GATE5}"][data-gate="exit"]`)).toBeHidden();
  await page.waitForSelector('.map-aurora', { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, 'map-ch4-finale.png') });
  const card = page.locator('#card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  // The gate (the one into this page), then every island of the page in turn.
  await expect(map).toHaveAttribute('data-trail', `gate:${GATE},3-1,3-2,3-3,4-1,4-2,4-3`);
  await expect(card).toContainText('4しょう クリア！');
  await expect(card).toContainText('こおりと ゆきの せかいも');
  await expect(card).toContainText('ぜんぶ つながった！');
  await expect(page.locator('#card-button')).toHaveText('やったね！');
  await expect(page.locator('#card-button')).toBeVisible();
  await expect(page.locator(`[data-link="${GATE5}"]`)).not.toHaveClass(/is-growing/);
  await page.screenshot({ path: resolve(OUT, 'map-ch4-card.png') });
  expect((await saved(page)).mapLinks).not.toContain('finale:4');
  await page.locator('#card-button').click();
  expect((await saved(page)).mapLinks).toContain('finale:4');
  await expect(map).not.toHaveClass(/is-dusk/);

  // Only after the card: the rail grows from 4-3 to the gate where chapter 5's "?" was, the page turns, and it
  // grows on from the gate to 5-1.
  await expect(page.locator(`[data-link="${GATE5}"]`)).toHaveClass(/is-growing/);
  await expect(page.locator(`.map-gate[data-gate-link="${GATE5}"][data-gate="exit"]`)).toBeVisible();
  await expect(page.locator('#map-close')).toBeHidden();
  await turned(page, 3);
  await expect(page.locator(`[data-link-enter="${GATE5}"]`)).toHaveClass(/is-growing/);
  await expect(map).toHaveAttribute('data-finale', 'done', { timeout: 10_000 });
  await expect(page.locator('#map-close')).toBeVisible();
  expect((await saved(page)).mapLinks).toContain(GATE5);
  await expect(page.locator('#map-page-title')).toHaveText('5しょう ふしぎ・6しょう さいご');
  await expect(page.locator('.map-island.is-teaser')).toHaveCount(0);
  await expect(page.locator('[data-island="teaser:5"]')).toHaveCount(0);

  // Once only.
  await page.locator('#map-close').click();
  await openMap(page);
  await page.waitForTimeout(2_000);
  await expect(card).toHaveCount(0);
  await expect(map).not.toHaveAttribute('data-finale', /.+/);
  await expect(map).not.toHaveAttribute('data-growing', /.+/);
  await expect(page.locator('#map .is-growing')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/**
 * A child who finished chapter 4 before page 3 came (its end seen, chapter 5's "?" seen): the update grows the
 * rail through the gate once, the map turns to page 3 by itself (第 1 部 §3.5, §11).
 */
test('page 3: the rail from 4-3 through the gate, the page turns, then ◀ ▶ and a swipe over three pages, once', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { ...CH4_DONE, mapLinks: [...CH4_DONE.mapLinks, 'finale:4'] });
  await toTitle(page);
  const map = await openMap(page);
  // It opens on page 2 (the new rail starts there); hands off while it grows to the gate.
  await expect(map).toHaveAttribute('data-page', '2');
  await expect(map).toHaveAttribute('data-growing', '1');
  await expect(map).not.toHaveAttribute('data-finale', /.+/);
  await expect(page.locator(`[data-link="${GATE5}"]`)).toHaveClass(/is-growing/);
  await expect(page.locator('#map-close')).toBeHidden();
  const exit = page.locator(`.map-gate[data-gate-link="${GATE5}"][data-gate="exit"]`);
  await expect(exit).toBeVisible();
  // The gate stands where chapter 5's "?" was (91 %, 42 % of the map).
  const area = (await page.locator('.map-page[data-page="2"]').boundingBox())!;
  const gateAt = await centre(exit);
  expect(Math.abs(gateAt.x - (area.x + 0.91 * area.width))).toBeLessThan(area.width * 0.06);
  await expect(page.locator('.map-island.is-teaser')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, 'map-page2-exit5.png') });
  // Page 3 by itself; the rail grows on from the gate there to 5-1.
  await turned(page, 3);
  await expect(page.locator(`[data-link-enter="${GATE5}"]`)).toHaveClass(/is-growing/);
  await expect(page.locator(`.map-page[data-page="3"] .map-gate[data-gate="enter"]`)).toBeVisible();
  await expect(map).not.toHaveAttribute('data-growing', /.+/, { timeout: 10_000 });
  expect((await saved(page)).mapLinks).toContain(GATE5);
  await expect(page.locator('#map-close')).toBeVisible();
  await expect(page.locator('#map-page-title')).toHaveText('5しょう ふしぎ・6しょう さいご');
  await expect(page.locator('.map-dot')).toHaveCount(3);
  await expect(page.locator('.map-dot.is-on')).toHaveAttribute('data-page', '3');
  await expect(page.locator('#map-prev')).toBeVisible();
  await expect(page.locator('#map-next')).toBeHidden();
  // 5-1: the next island once its stage is there; until then a "?" that only wiggles.
  const island51 = page.locator('.map-island[data-island="5-1"]');
  await expect(island51).toBeVisible();
  if (HAS_5_1) {
    await expect(island51).not.toHaveClass(/is-unknown/);
    await expect(island51).toHaveClass(/is-next/);
  } else {
    await expect(island51).toHaveClass(/is-unknown/);
    await expect(island51.locator('.map-label')).toHaveCount(0);
    await island51.evaluate((e) => {
      const w = window as unknown as { islandAnims: string[] };
      w.islandAnims = [];
      e.addEventListener('animationstart', (ev) => w.islandAnims.push((ev as AnimationEvent).animationName));
    });
    await island51.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { islandAnims: string[] }).islandAnims)).toContain('island-wiggle');
    await page.waitForTimeout(300);
    expect(new URL(page.url()).search).toBe('');
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, 'map-page3.png') });

  // Turning: ◀ to page 2, ◀ to page 1, ▶ ▶ back; the gates on page 2 and 3; a swipe each way.
  await page.locator('#map-prev').click();
  await turned(page, 2);
  await expect(page.locator('#map-page-title')).toHaveText('3しょう みず・4しょう こおりと ゆき');
  await expect(page.locator('#map-next')).toBeVisible();
  await page.locator('#map-prev').click();
  await turned(page, 1);
  await expect(page.locator('#map-prev')).toBeHidden();
  await page.locator('#map-next').click({ force: true });
  await turned(page, 2);
  await page.locator('#map-next').click({ force: true });
  await turned(page, 3);
  await page.locator('.map-page[data-page="3"] .map-gate[data-gate="enter"]').click();
  await turned(page, 2);
  await page.locator(`.map-page[data-page="2"] .map-gate[data-gate-link="${GATE5}"]`).click();
  await turned(page, 3);
  await swipe(page, { x: 600, y: 420 }, 250);
  await turned(page, 2);
  await swipe(page, { x: 600, y: 420 }, -250);
  await turned(page, 3);
  // Nothing beyond page 3: a swipe on does nothing (and the tap it ends with reaches nothing for half a second).
  await swipe(page, { x: 600, y: 420 }, -250);
  await page.waitForTimeout(700);
  await expect(map).toHaveAttribute('data-page', '3');

  // Once only: opened again, nothing grows.
  await page.locator('#map-close').click();
  await openMap(page);
  await expect(map).not.toHaveAttribute('data-growing', /.+/);
  await expect(page.locator(`[data-link-enter="${GATE5}"]`)).toHaveClass(/is-laid/);
  await expect(page.locator('#map .is-growing')).toHaveCount(0);
  // It opens on 5-1's page when 5-1 is next; else on the page of the highest cleared island (4-3's).
  await expect(map).toHaveAttribute('data-page', HAS_5_1 ? '3' : '2');
  expect(errors).toEqual([]);
});

test('leaving while the rail grows through the gate to page 3 shows it again next time', async ({ page }) => {
  await seed(page, { ...CH4_DONE, mapLinks: [...CH4_DONE.mapLinks, 'finale:4'] });
  await toTitle(page);
  await openMap(page);
  await expect(page.locator(`[data-link="${GATE5}"]`)).toHaveClass(/is-growing/);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  expect((await saved(page)).mapLinks).not.toContain(GATE5);
  await openMap(page);
  await expect(page.locator(`[data-link="${GATE5}"]`)).toHaveClass(/is-growing/);
  await turned(page, 3);
  await expect(page.locator('#map')).not.toHaveAttribute('data-growing', /.+/, { timeout: 10_000 });
  expect((await saved(page)).mapLinks).toContain(GATE5);
});

test("chapter 4's end with calm motion: the aurora does not sway, no snow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, CH4_DONE);
  await toTitle(page);
  await openMap(page);
  await page.waitForSelector('.map-aurora', { state: 'attached', timeout: 10_000 });
  expect(await page.locator('.map-aurora-ribbon').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  expect(await page.locator('.map-aurora').evaluate((e) => getComputedStyle(e).animationName)).toBe('aurora-still');
  await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#map')).toHaveAttribute('data-trail', /4-3$/);
});

/** Boxes of what sits on the page shown: island pictures, gates, and the arrows. */
async function layout(page: Page): Promise<{ things: { id: string; box: DOMRect }[]; arrows: DOMRect[] }> {
  return page.evaluate(() => {
    const n = document.getElementById('map')?.dataset.page;
    const pageEl = document.querySelector(`.map-page[data-page="${n}"]`);
    const things = [...(pageEl?.querySelectorAll('.map-island img, .map-gate svg') ?? [])].map((e) => ({
      id: (e.parentElement as HTMLElement).dataset.island ?? `gate:${(e.parentElement as HTMLElement).dataset.gate}`,
      box: e.getBoundingClientRect().toJSON() as DOMRect,
    }));
    const arrows = [...document.querySelectorAll<HTMLElement>('.map-turn')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect().toJSON() as DOMRect);
    return { things, arrows };
  });
}

const overlap = (a: DOMRect, b: DOMRect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** The title's stars: on the screen; one row, or two with ceil(n / 2) in the first (3 + 2 for five, 第 1 部 §6). */
async function checkStars(page: Page, w: number): Promise<number> {
  const row = (await page.locator('#title-chapters').boundingBox())!;
  expect(row.x).toBeGreaterThanOrEqual(0);
  expect(row.x + row.width).toBeLessThanOrEqual(w);
  const boxes = await page.locator('.title-chapter').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(w);
  }
  const tops = boxes.map((b) => Math.round(b.top));
  const rows = [...new Set(tops)];
  expect(rows.length === 1 || (rows.length === 2 && tops.filter((t) => t === rows[0]).length === Math.ceil(tops.length / 2))).toBe(true);
  return rows.length;
}

for (const [w, hgt, oneRow] of [
  [1194, 834, true],
  [667, 375, false],
  [568, 320, false],
] as const) {
  test(`title at ${w}×${hgt}: six stars, ${oneRow ? 'one row' : 'three and three'}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: hgt });
    await seed(page, { ...CH4_DONE, mapLinks: [...CH4_DONE.mapLinks, 'finale:4', GATE5] });
    await toTitle(page);
    await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ★\s*3しょう ★\s*4しょう ★\s*5しょう ☆\s*6しょう ☆/);
    await expect(page.locator('.title-chapter')).toHaveCount(6);
    // 5-1 is open once its stage is there (4-3 is cleared); until then chapter 5 is faint. Chapter 6 (6-1 waits for
    // 5-3) is faint.
    await expect(page.locator('.title-chapter.is-faint')).toHaveCount(HAS_5_1 ? 1 : 2);
    expect(await checkStars(page, w)).toBe(oneRow ? 1 : 2);
    await page.screenshot({ path: resolve(OUT, `map-pages-title6-${w}.png`) });
  });
}

for (const [w, hgt] of [
  [1194, 834],
  [568, 320],
] as const) {
  test(`pages 3, 2 and 1 at ${w}×${hgt}: islands and gates apart; the arrows off the islands`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: hgt });
    await seed(page, { ...CH4_DONE, mapLinks: [...CH4_DONE.mapLinks, 'finale:4', GATE5] });
    await toTitle(page);
    await checkStars(page, w);
    await page.screenshot({ path: resolve(OUT, `map-pages-title-${w}.png`) });
    await openMap(page);
    // Page 3 first (the next island is there once 5-1's stage is; else it opens on page 2 and turns).
    if ((await page.locator('#map').getAttribute('data-page')) !== '3') await page.locator('#map-next').click({ force: true });
    // At least: page 3 its gate and 5-1, page 2 its six islands and two gates, page 1 its six islands and gate.
    const least = { 3: 2, 2: 8, 1: 7 } as const;
    for (const n of [3, 2, 1] as const) {
      if (n < 3) {
        await page.locator('#map-prev').click({ force: true });
      }
      await turned(page, n);
      await page.waitForTimeout(300);
      const { things, arrows } = await layout(page);
      expect(things.length).toBeGreaterThanOrEqual(least[n]);
      for (let i = 0; i < things.length; i++) {
        // Page 1 is as it always was (its islands are close together on purpose); pages 2 and 3 keep them apart.
        for (let j = i + 1; j < things.length && n > 1; j++) {
          const a = things[i].box;
          const b = things[j].box;
          const share = overlap(a, b) / Math.min(a.width * a.height, b.width * b.height);
          expect(share, `${things[i].id} / ${things[j].id}`).toBeLessThanOrEqual(0.1);
        }
        for (const arrow of arrows) expect(overlap(things[i].box, arrow), `arrow on ${things[i].id}`).toBe(0);
      }
      // The heading fits beside the back button.
      const heading = (await page.locator('.map-header').boundingBox())!;
      const back = (await page.locator('#map-close').boundingBox())!;
      expect(heading.x + heading.width).toBeLessThanOrEqual(w);
      expect(heading.x >= back.x + back.width || heading.y >= back.y + back.height).toBe(true);
      await page.screenshot({ path: resolve(OUT, `map-pages-${n}-${w}.png`) });
    }
  });
}

/** v1.11 (PR6b/PR6c, PR9): chapter 5 done, its end seen: page 3 with 5-1, 5-2, 5-3, the gate and the castle 6-1. */
for (const [w, hgt] of [
  [1194, 834],
  [568, 320],
] as const) {
  test(`page 3 with chapter 5 done at ${w}×${hgt}: 5-1, 5-2, 5-3, the gate and the castle 6-1 apart`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: hgt });
    const cleared = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', ...CH3, ...CH4, '5-1', '5-2', '5-3'];
    const links = seenMapLinks(WORLD, cleared);
    expect(links).toEqual(expect.arrayContaining(['5-2>5-3', 'finale:5', '5-3>6-1']));
    await seed(page, { cleared, abilities: [...ABILITIES, 'dive', 'plow', 'magnetLight'], mapLinks: links });
    await toTitle(page);
    await openMap(page);
    await turned(page, 3);
    await page.waitForTimeout(300);
    await expect(page.locator('.map-island[data-island="5-3"]')).toHaveClass(/is-cleared/);
    await expect(page.locator('[data-link="5-2>5-3"]')).toHaveClass(/is-laid/);
    await expect(page.locator('.map-island[data-island="teaser:6"]')).toHaveCount(0);
    await expect(page.locator('.map-island[data-island="6-1"]')).toBeVisible();
    await expect(page.locator('[data-link="5-3>6-1"]')).toHaveClass(/is-laid/);
    // The castle is awake (its windows lit): nothing grew today.
    await expect(page.locator('.map-island[data-island="6-1"]')).not.toHaveClass(/is-asleep/);
    const { things, arrows } = await layout(page);
    expect(things.map((t) => t.id).sort()).toEqual(expect.arrayContaining(['5-1', '5-2', '5-3', '6-1']));
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        const a = things[i].box;
        const b = things[j].box;
        expect(overlap(a, b) / Math.min(a.width * a.height, b.width * b.height), `${things[i].id} / ${things[j].id}`).toBeLessThanOrEqual(0.1);
      }
      for (const arrow of arrows) expect(overlap(things[i].box, arrow), `arrow on ${things[i].id}`).toBe(0);
    }
    await page.screenshot({ path: resolve(OUT, `map-pages-3-ch5-${w}.png`) });
  });
}

/** v1.11 (PR9, 第 1 部 §3.4): a child who saw chapter 5's end before 6-1's island came. */
test("chapter 5's end seen before the castle came: the new rail 5-3 → 6-1 grows, the castle wakes and its windows light", async ({ page }) => {
  const errors = watchErrors(page);
  const cleared = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', ...CH3, ...CH4, '5-1', '5-2', '5-3'];
  const links = seenMapLinks(WORLD, cleared).filter((k) => k !== '5-3>6-1');
  expect(links).toContain('finale:5');
  await seed(page, { cleared, abilities: [...ABILITIES, 'dive', 'plow', 'magnetLight'], mapLinks: links });
  await toTitle(page);
  const map = await openMap(page);
  await turned(page, 3);
  const castle = page.locator('.map-island[data-island="6-1"]');
  // No chapter 5 end again: the rail grows as a new one, the castle asleep until it gets there.
  await expect(map).not.toHaveAttribute('data-light', 'firefly');
  await expect(map).toHaveAttribute('data-windows', '6-1', { timeout: 10_000 });
  await expect(castle).not.toHaveClass(/is-asleep/);
  await expect(castle.locator('.map-window')).toHaveCount(4);
  await expect(castle).toHaveClass(/is-next/);
  await expect.poll(async () => (await saved(page)).mapLinks ?? [], { timeout: 10_000 }).toContain('5-3>6-1');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, 'map-pages-castle-wakes.png') });
  expect(errors).toEqual([]);
});

test('6-1 cleared, no 6-2 island yet: chapter 6 is not over (no finale:6), the title keeps 6しょう ☆', async ({ page }) => {
  const errors = watchErrors(page);
  const cleared = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', ...CH3, ...CH4, '5-1', '5-2', '5-3', '6-1'];
  const links = seenMapLinks(WORLD, cleared);
  expect(links).not.toContain('finale:6');
  await seed(page, { cleared, abilities: [...ABILITIES, 'dive', 'plow', 'magnetLight', 'reverse'], mapLinks: links });
  await toTitle(page);
  await expect(page.locator('#title-chapters')).toHaveText(/5しょう ★\s*6しょう ☆/);
  const map = await openMap(page);
  await turned(page, 3);
  await expect(page.locator('.map-island[data-island="6-1"]')).toHaveClass(/is-cleared/);
  await page.waitForTimeout(1_000);
  expect(await map.getAttribute('data-finale')).toBeNull();
  expect((await saved(page)).mapLinks).not.toContain('finale:6');
  expect(errors).toEqual([]);
});
