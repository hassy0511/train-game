import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endingBridges, endingDue, ENDING_SEEN, knownPages, openingPage, seenMapLinks, validateWorld, visibleWorld, type PageFacts } from '../../src/world/pages';
import type { WorldFile } from '../../src/world/types';

/**
 * The world's end on the map 「せかいの わ」 (docs/PHASE9_CHAPTER5_6.md 第 1 部 §5.2–§5.3, §11; PR10): the first time the
 * map opens after 6-1 (chapters 1–5 done) it opens on page 3 and plays once — the song "sekai", the three pages shrink
 * side by side onto one sheet, rainbow rails join them (1-1>3-1 over page 1, 4-3>5-1 next door, and the long rail home
 * 6-1 → 1-1 under the pages), a golden light runs from 1-1 through every island back to 1-1, all glow, the card
 * 「ワールドレールが／ぜんぶ つながった！／サカサも いっしょだよ！」; closed, "finale:world" is saved and the pages come
 * back to page 3. Then (PR11b, §5.2 の 8) the rail 6-1 → 6-2 grows from the castle up into the sky and 6-2's island pops
 * up and bounces (it is not on the map, not even as a "?", until 6-1 is cleared: `islands[].after`); a child who saw
 * the world's end before 6-2 came sees that rail grow once as a new one. 6-2 cleared: chapter 6's end, a card only with
 * the fanfare, every star on the title and its 「もういちど みる」.
 * And the title: once 6-1 is cleared Sakasa rides in the first car behind the title (§5.7).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'output');
mkdirSync(OUT, { recursive: true });
const WORLD = JSON.parse(readFileSync(resolve(HERE, '../../src/world/world.json'), 'utf8')) as WorldFile;
const KEY = 'train-game.progress.v1';
const SEVEN = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'];
const ALL = WORLD.islands.map((i) => i.id);
const TO_61 = ALL.filter((id) => id !== '6-2');
const TO_53 = TO_61.filter((id) => id !== '6-1');
const RAIL_62 = '6-1>6-2';
const TRAIL = '1-1,1-2,1-3,2-1,2-2,2-3,1-1,3-1,3-2,3-3,4-1,4-2,4-3,5-1,5-2,5-3,6-1,1-1';

type Save = { cleared: string[]; abilities: string[]; records: string[]; mapLinks: string[] };

async function seed(page: Page, save: Save): Promise<void> {
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schema: 1, ...data }));
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
  return errors;
}

async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#title-screen')).toBeVisible();
}

async function openTitleMap(page: Page): Promise<void> {
  await toTitle(page);
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
}

/** Keeps what came and went while the end played (the confetti, the hops, the music, the moving pages). */
async function watchEnding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __end: { confetti: number; hops: number; music: string[]; duration: string[] } };
    w.__end = { confetti: 0, hops: 0, music: [], duration: [] };
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof HTMLElement) w.__end.confetti += n.querySelectorAll('.map-confetto').length;
        const t = r.target;
        if (r.type === 'attributes' && t instanceof HTMLElement) {
          if (t.classList.contains('map-island') && t.classList.contains('is-hop')) w.__end.hops += 1;
          if (t.id === 'app' && t.dataset.music && w.__end.music[w.__end.music.length - 1] !== t.dataset.music) w.__end.music.push(t.dataset.music);
          if (t.id === 'map' && t.classList.contains('is-world-moving')) {
            const p = t.querySelector('.map-page');
            if (p) w.__end.duration.push(getComputedStyle(p).transitionDuration);
          }
        }
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-music'] });
  });
}

const ended = (page: Page): Promise<{ confetti: number; hops: number; music: string[]; duration: string[] }> =>
  page.evaluate(() => (window as unknown as { __end: { confetti: number; hops: number; music: string[]; duration: string[] } }).__end);

/** A child who has just cleared 6-1: everything before seen (chapter 5's end too), the world's end not yet (nor 6-2's rail). */
function justCleared61(): Save {
  const links = seenMapLinks(WORLD, TO_61).filter((k) => k !== ENDING_SEEN && k !== RAIL_62);
  expect(links).toContain('finale:5');
  return { cleared: TO_61, abilities: [...SEVEN, 'reverse'], records: [], mapLinks: links };
}

test('the world end is due once, on page 3, after 6-1 with chapters 1–5 done (pages.ts)', () => {
  const links = seenMapLinks(WORLD, TO_61);
  // Seen with the clears (a child typing an あいことば in does not watch it again)...
  expect(links).toContain(ENDING_SEEN);
  expect(links).not.toContain('finale:6');
  // ...but not up to page 2 only (a version 2 code had no page 3).
  expect(seenMapLinks(WORLD, TO_61, 2)).not.toContain(ENDING_SEEN);
  expect(seenMapLinks(WORLD, TO_53)).not.toContain(ENDING_SEEN);
  expect(endingDue(WORLD, TO_61, links.filter((k) => k !== ENDING_SEEN))).toBe(true);
  expect(endingDue(WORLD, TO_61, links)).toBe(false);
  expect(endingDue(WORLD, TO_53, [])).toBe(false);
  // 6-1 cleared on its own (?stage=, 5-2 missing): no world end.
  expect(endingDue(WORLD, TO_61.filter((id) => id !== '5-2'), [])).toBe(false);
  // It opens on the castle's page, before a chapter's end or a new rail.
  const facts: PageFacts = { unlocked: TO_61, cleared: TO_61, laid: [], fresh: ['1-1>1-2'], next: '1-1', finale: 2, ending: true };
  expect(openingPage(WORLD, facts, [1, 2, 3])).toBe(3);
  expect(openingPage(WORLD, { ...facts, ending: false }, [1, 2, 3])).not.toBe(3);
  expect(knownPages(WORLD, facts)).toEqual([1, 2, 3]);
  // The rainbow rails on the one sheet (第 1 部 §5.3): the gates and the long rail home, in % of the map area.
  const bridges = endingBridges(WORLD, [1, 2, 3]);
  expect(bridges.map((b) => b.key)).toEqual(['1-1>3-1', '4-3>5-1', '6-1>1-1']);
  const near = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(0.15);
  const [over, next, home] = bridges;
  near(over.from.x, 4.5);
  near(over.from.y, 42.3);
  near(over.to.x, 35.6);
  near(over.to.y, 51.3);
  expect(over.via[1]).toBe(6);
  near(next.from.x, 63.1);
  near(next.to.x, 69.6);
  near(next.via[1], 43);
  near(home.from.x, 84);
  near(home.from.y, 45.5);
  near(home.to.x, 5.8);
  near(home.to.y, 55.8);
  expect(home.home).toBe(true);
  // Its middle runs under the pages (they end at 66 %).
  expect(0.25 * home.from.y + 0.5 * home.via[1] + 0.25 * home.to.y).toBeGreaterThan(70);
  // PR11b: 6-2 is not on the map until 6-1 is cleared (`after`), then its rail is laid; chapter 6 ends with 6-2.
  expect(visibleWorld(WORLD, TO_53).islands.map((i) => i.id)).not.toContain('6-2');
  expect(visibleWorld(WORLD, TO_53).links.some(([a, b]) => a === '6-2' || b === '6-2')).toBe(false);
  expect(visibleWorld(WORLD, TO_61).islands.map((i) => i.id)).toContain('6-2');
  expect(links).toContain(RAIL_62);
  expect(seenMapLinks(WORLD, ALL)).toEqual(expect.arrayContaining(['finale:6', ENDING_SEEN, RAIL_62]));
  // world.json passes its checks; a trail with a jump, or a castle twice as wide, does not.
  expect(validateWorld(WORLD)).toEqual([]);
  const broken = structuredClone(WORLD);
  broken.ending!.trail = ['1-1', '1-3', '1-1'];
  broken.islands.find((i) => i.id === '6-1')!.size = 2;
  broken.islands.find((i) => i.id === '6-2')!.after = '9-9';
  const why = validateWorld(broken).join('\n');
  expect(why).toContain('trail 1-1 → 1-3');
  expect(why).toContain('size 2');
  expect(why).toContain('"after" "9-9" is not an island');
});

test('the world end after 6-1: page 3, the pages side by side, rainbow rails, the golden light round the world, the card, once', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await seed(page, justCleared61());
  await watchEnding(page);
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-page', '3');
  await expect(map).toHaveAttribute('data-ending', 'playing');
  // No chapter end with it (chapter 5's was seen; chapter 6 is not over with 6-1 alone).
  expect(await map.getAttribute('data-finale')).toBeNull();
  // Hands off: no way out, no turning, no island to tap, no heading.
  await expect(page.locator('#map-close')).toBeHidden();
  await expect(page.locator('#map-prev')).toBeHidden();
  await expect(page.locator('#map-next')).toBeHidden();
  await expect(page.locator('#map-page-title')).toBeHidden();
  // The pages side by side: all three on the screen, a third of their size.
  await expect(map).toHaveClass(/is-world/);
  const pages = page.locator('.map-page');
  await expect(pages).toHaveCount(3);
  const area = (await page.locator('.map-area').boundingBox())!;
  // (At the CI's few frames a second the 1.2 s slide takes a little longer to show: wait until every page has both
  // shrunk and slid into its place, not just the first one's size.)
  await expect
    .poll(
      async () => {
        const now = await Promise.all((await pages.all()).map((p) => p.boundingBox()));
        return now.every((b, i) => b !== null && b.width < area.width * 0.34 && Math.abs(b.x - (area.x + area.width * 0.34 * i)) < 3);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const boxes = await Promise.all((await pages.all()).map((p) => p.boundingBox()));
  boxes.forEach((b, i) => {
    expect(b, `page ${i + 1}`).not.toBeNull();
    if (!b) return;
    expect(b.width).toBeGreaterThan(area.width * 0.3);
    expect(b.width).toBeLessThan(area.width * 0.34);
    expect(b.x).toBeGreaterThanOrEqual(area.x - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(area.x + area.width + 1);
    expect(Math.abs(b.x - (area.x + area.width * 0.34 * i))).toBeLessThan(3);
  });
  // The rainbow rails grow: over page 1, next door, and the long rail home.
  const bridges = page.locator('.map-bridge');
  await expect(bridges).toHaveCount(3);
  for (const key of ['1-1>3-1', '4-3>5-1']) await expect(page.locator(`.map-bridge[data-bridge="${key}"]`)).toHaveClass(/is-growing/, { timeout: 10_000 });
  await expect(page.locator('.map-bridge.is-home')).toHaveClass(/is-growing/, { timeout: 10_000 });
  // A tap on an island or a swipe does nothing now.
  const castle = (await page.locator('.map-island[data-island="6-1"]').boundingBox())!;
  await page.mouse.click(castle.x + castle.width / 2, castle.y + castle.height / 2);
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('data-page', '3');
  // The golden light runs round the whole world.
  await expect(map).toHaveAttribute('data-trail', /^1-1,1-2,1-3,2-1/, { timeout: 15_000 });
  await page.screenshot({ path: resolve(OUT, 'map-world.png') });
  await expect(map).toHaveAttribute('data-trail', TRAIL, { timeout: 20_000 });
  await expect(page.locator('.map-island.is-gold')).toHaveCount(16);
  // The card.
  const card = page.locator('#card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('ワールドレールが');
  await expect(card).toContainText('ぜんぶ つながった！');
  await expect(card).toContainText('サカサも いっしょだよ！');
  await expect(card.locator('svg.card-icon')).toHaveCount(1);
  await page.screenshot({ path: resolve(OUT, 'map-world-card.png') });
  expect((await saved(page)).mapLinks).not.toContain(ENDING_SEEN);
  await expect(page.locator('#card-button')).toHaveText('やったね！');
  await page.locator('#card-button').click();
  await expect(map).toHaveAttribute('data-ending', 'done', { timeout: 10_000 });
  expect((await saved(page)).mapLinks).toContain(ENDING_SEEN);
  // Back to page 3, everything where it was; then (PR11b) the rail from the castle into the sky, and 6-2 pops up.
  await expect(map).not.toHaveClass(/is-world/);
  await expect(map).toHaveAttribute('data-page', '3');
  const island62 = page.locator('.map-island[data-island="6-2"]');
  await expect(page.locator(`[data-link="${RAIL_62}"]`)).toHaveClass(/is-growing/, { timeout: 15_000 });
  await expect(island62).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await saved(page)).mapLinks, { timeout: 15_000 }).toContain(RAIL_62);
  await expect(island62).toHaveClass(/is-next/, { timeout: 10_000 });
  await expect(page.locator('#map-close')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, 'map-6-2.png') });
  const e = await ended(page);
  expect(e.music).toContain('sekai');
  expect(e.confetti).toBeGreaterThan(0);
  expect(e.hops).toBeGreaterThanOrEqual(16);
  // Back to the title: its music box again. And the map once more: no end.
  await page.locator('#map-close').click();
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-music', 'title');
  await page.locator('#title-map').click();
  await expect(map).toBeVisible();
  await page.waitForTimeout(800);
  expect(await map.getAttribute('data-ending')).toBeNull();
  await expect(map).not.toHaveClass(/is-world/);
  expect(errors).toEqual([]);
});

test('the world end left before its card plays again next time', async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, justCleared61());
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-ending', 'playing');
  await expect(map).toHaveAttribute('data-trail', /1-1,1-2/, { timeout: 15_000 });
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  expect((await saved(page)).mapLinks).not.toContain(ENDING_SEEN);
  await page.locator('#title-map').click();
  await expect(map).toHaveAttribute('data-ending', 'playing');
});

test('the world end at 568×320: the three pages fit on the screen', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 568, height: 320 });
  await seed(page, justCleared61());
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveClass(/is-world/);
  await expect.poll(async () => (await page.locator('.map-page').first().boundingBox())?.width ?? 0, { timeout: 10_000 }).toBeLessThan(400 * 0.34);
  for (const p of await page.locator('.map-page').all()) {
    const b = (await p.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(568);
    expect(b.y + b.height).toBeLessThanOrEqual(320);
  }
  await expect(map).toHaveAttribute('data-trail', TRAIL, { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, 'map-world-568.png') });
});

test('the world end with calm motion: the pages do not slide, no confetti, no hops; the islands turn gold in turn', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, justCleared61());
  await watchEnding(page);
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-trail', TRAIL, { timeout: 30_000 });
  await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
  const e = await ended(page);
  expect(e.duration.length).toBeGreaterThan(0);
  expect(e.duration.every((d) => d === '0s')).toBe(true);
  expect(e.confetti).toBe(0);
  expect(e.hops).toBe(0);
  await expect(page.locator('.map-island.is-gold')).toHaveCount(16);
});

test("chapter 5's end not seen yet and 6-1 cleared: chapter 5's end first, then the world end", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const links = seenMapLinks(WORLD, TO_61).filter((k) => k !== ENDING_SEEN && k !== 'finale:5' && k !== '5-3>6-1');
  await seed(page, { cleared: TO_61, abilities: [...SEVEN, 'reverse'], records: [], mapLinks: links });
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-light', 'firefly');
  await expect(page.locator('#card')).toContainText('5しょう クリア！', { timeout: 30_000 });
  expect(await map.getAttribute('data-ending')).toBeNull();
  await page.locator('#card-button').click();
  // The rail to the castle grows first, then the world end runs along it.
  await expect.poll(async () => (await saved(page)).mapLinks, { timeout: 15_000 }).toContain('5-3>6-1');
  await expect(map).toHaveAttribute('data-ending', 'playing', { timeout: 15_000 });
  await expect(map).toHaveAttribute('data-trail', TRAIL, { timeout: 30_000 });
  await expect(page.locator('#card')).toContainText('ワールドレールが', { timeout: 20_000 });
  await page.locator('#card-button').click();
  await expect(map).toHaveAttribute('data-ending', 'done', { timeout: 10_000 });
  const s = await saved(page);
  expect(s.mapLinks).toEqual(expect.arrayContaining(['finale:5', ENDING_SEEN]));
  expect(errors).toEqual([]);
});

test('before 6-1 is cleared there is no world end, and no Sakasa on the title', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { cleared: TO_53, abilities: SEVEN, records: [], mapLinks: seenMapLinks(WORLD, TO_53) });
  await toTitle(page);
  expect(await page.locator('#app').getAttribute('data-title-crew')).toBeNull();
  await page.locator('#title-map').click();
  const map = page.locator('#map');
  await expect(map).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(await map.getAttribute('data-ending')).toBeNull();
  expect((await saved(page)).mapLinks).not.toContain(ENDING_SEEN);
  expect(errors).toEqual([]);
});

test('6-1 cleared: Sakasa rides in the first car behind the title, and gets off when the stage starts', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await seed(page, { ...justCleared61(), mapLinks: seenMapLinks(WORLD, TO_61) });
  await toTitle(page);
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-title-crew', 'sakasa');
  // The camera circles the train: a few moments, so she is seen through the window from more than one side.
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: resolve(OUT, 'title-sakasa.png') });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: resolve(OUT, 'title-sakasa-2.png') });
  await page.locator('#title-start').click();
  await expect(page.locator('#title-screen')).toHaveCount(0, { timeout: 10_000 });
  // She gets off once the start has checked for a movie to play first (v1.12 the opening: an await after the title
  // closes, so on a slow machine a moment later).
  await expect(app).not.toHaveAttribute('data-title-crew', /./, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('the world end seen before 6-2 came (PR10): the rail from the castle grows once as a new one, and 6-2 pops up', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await seed(page, { cleared: TO_61, abilities: [...SEVEN, 'reverse'], records: [], mapLinks: seenMapLinks(WORLD, TO_61).filter((k) => k !== RAIL_62) });
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-page', '3');
  expect(await map.getAttribute('data-ending')).toBeNull();
  const island62 = page.locator('.map-island[data-island="6-2"]');
  await expect(page.locator(`[data-link="${RAIL_62}"]`)).toHaveClass(/is-growing/, { timeout: 15_000 });
  await expect(island62).toBeVisible({ timeout: 15_000 });
  await expect(island62).toHaveClass(/is-next/, { timeout: 10_000 });
  await expect.poll(async () => (await saved(page)).mapLinks, { timeout: 10_000 }).toContain(RAIL_62);
  // Once only.
  await page.locator('#map-close').click();
  await page.locator('#title-map').click();
  await expect(map).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator(`[data-link="${RAIL_62}"]`)).not.toHaveClass(/is-growing/);
  await expect(island62).toBeVisible();
  expect(errors).toEqual([]);
});

test("6-2 cleared: chapter 6's end, a card only (the fanfare), once; every star on the title and 「もういちど みる」", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await seed(page, { cleared: ALL, abilities: [...SEVEN, 'reverse'], records: [], mapLinks: seenMapLinks(WORLD, ALL).filter((k) => k !== 'finale:6') });
  await toTitle(page);
  await expect(page.locator('#title-chapters')).toHaveText(/5しょう ★\s*6しょう ★/);
  await expect(page.locator('.title-chapter.is-done')).toHaveCount(6);
  await expect(page.locator('#title-movie')).toHaveText('もういちど みる');
  await page.locator('#title-map').click();
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-page', '3');
  await expect(map).toHaveAttribute('data-finale', 'playing');
  // No light runs: straight to the card.
  const card = page.locator('#card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('6しょう クリア！');
  await expect(card).toContainText('ぜんぶの せかいを');
  await expect(card).toContainText('まわったね！');
  await expect(card.locator('svg.card-icon')).toHaveCount(1);
  expect(await map.getAttribute('data-trail')).toBeFalsy();
  await page.screenshot({ path: resolve(OUT, 'map-ch6-card.png') });
  await expect(page.locator('#card-button')).toHaveText('やったね！');
  await page.locator('#card-button').click();
  await expect(map).toHaveAttribute('data-finale', 'done', { timeout: 10_000 });
  expect((await saved(page)).mapLinks).toContain('finale:6');
  await page.locator('#map-close').click();
  await page.locator('#title-map').click();
  await page.waitForTimeout(800);
  expect(await map.getAttribute('data-finale')).toBeNull();
  expect(errors).toEqual([]);
});
