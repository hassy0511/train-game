import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seenMapLinks } from '../../src/world/pages';
import type { WorldFile } from '../../src/world/types';

/**
 * v1.12 (えんしゅつ, docs/STAGE_SCHEMA.md §25) on the production build: the ending movie "せかいの わ" plays from
 * 「▶ みる」 to its card with the letterbox on, every beat of its shot list happens in order (a screenshot at each:
 * output/movie-ending-<n>.png), the lines are the usual bubbles above the bottom bar, nothing throws; "▶▶" skips to the
 * card; prefers-reduced-motion plays it with cuts; the check mode's list opens it; the `?movie=` lock bounces it on a
 * kid's iPad until 6-2 is cleared. v1.11 (PR11b): after 6-2's clear the game sends the child here (`then=map`): the
 * first time there is no "▶▶", its card marks it seen ("movie:ending") and the map follows with chapter 6's end; from
 * the title's 「もういちど みる」 it plays again with "▶▶" and goes back to the title.
 */
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'output');
mkdirSync(OUT, { recursive: true });

interface MovieFile {
  cutscenes: Record<string, Record<string, unknown>[]>;
  movie: { play: string; card: { title: string; button: string } };
}
const MOVIE = JSON.parse(readFileSync(resolve(here, '../../src/movies/ending.json'), 'utf8')) as MovieFile;
const STEPS = MOVIE.cutscenes[MOVIE.movie.play];
/** The beats in the order the shot list has them. */
const BEATS = STEPS.flatMap((st) => (typeof st.beat === 'string' ? [st.beat] : []));
/**
 * How long after a beat its shot has settled (ms): the longest camera move or fade in the steps just after it (a
 * dolly, the opening's fade-in), and a little more.
 */
const SETTLE = new Map(
  STEPS.flatMap((st, i) => {
    if (typeof st.beat !== 'string') return [];
    let longest = 0;
    for (const next of STEPS.slice(i + 1, i + 5)) {
      if (typeof next.beat === 'string') break;
      if (typeof next.shot === 'string' || typeof next.fade === 'string') longest = Math.max(longest, Number(next.seconds ?? 0));
    }
    return [[st.beat, 900 + longest * 1000 * 0.6]] as [string, number][];
  }),
);
/** Every line the movie says. */
const LINES = STEPS.flatMap((st) => (typeof st.say === 'string' ? [st.say] : []));

const FLAG_KEY = 'train-game.kakunin.v1';
const FLAG_VALUE = '80eaae856b4fc19a430f4f92ea3a592073d382618d7915a5397176eb6c7a1f0f';
const SAVE_KEY = 'train-game.progress.v1';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Records every line a bubble shows (with where the bubble sat) and the shots, in the page. */
async function recordBubbles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __lines: { text: string; bottom: number }[]; __shots: string[] };
    w.__lines = [];
    w.__shots = [];
    const observer = new MutationObserver(() => {
      const bubble = document.getElementById('bubble');
      const line = bubble?.dataset.line;
      if (bubble && line && w.__lines[w.__lines.length - 1]?.text !== line) w.__lines.push({ text: line, bottom: bubble.getBoundingClientRect().bottom });
      const shot = document.getElementById('app')?.dataset.shot;
      if (shot && w.__shots[w.__shots.length - 1] !== shot) w.__shots.push(shot);
    });
    // The init script runs before the document has its root.
    document.addEventListener('DOMContentLoaded', () =>
      observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-line', 'data-shot'] }),
    );
  });
}

async function start(page: Page, query = ''): Promise<void> {
  await page.goto(`/?movie=ending${query}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-movie', 'ending');
  await expect(page.locator('#movie-play')).toBeVisible();
  await page.locator('#movie-play').click();
  await expect(page.locator('#app')).toHaveAttribute('data-movie-state', 'playing');
}

const beats = (page: Page): Promise<string[]> => page.evaluate(() => (document.getElementById('app')?.dataset.beats ?? '').split(',').filter(Boolean));

test('ending movie: plays to its card with the letterbox, every beat in order, a screenshot per shot', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  await recordBubbles(page);
  await start(page);
  await expect(page.locator('#app')).toHaveAttribute('data-letterbox', '1');
  await expect(page.locator('#letterbox')).toHaveClass(/is-on/);
  // No driving controls in a movie.
  for (const id of ['#whistle', '#lever', '#pause']) await expect(page.locator(id)).toHaveCount(0);

  for (const [i, beat] of BEATS.entries()) {
    await page.waitForFunction((b) => (document.getElementById('app')?.dataset.beats ?? '').split(',').includes(b), beat, { timeout: 120_000, polling: 100 });
    // A moment into the shot (after its cut, or well into its move), unless the next one already came.
    await page.waitForTimeout(SETTLE.get(beat) ?? 900);
    const { shot, time } = await page.evaluate(() => ({ shot: document.getElementById('app')?.dataset.shot ?? '', time: document.getElementById('app')?.dataset.time ?? '' }));
    await page.screenshot({ path: resolve(OUT, `movie-ending-${i + 1}.png`) });
    console.log(`movie-ending-${i + 1}.png: beat ${beat}, shot ${shot}, ${time} s`);
  }
  expect(await beats(page)).toEqual(BEATS);

  // The card: 「おしまい」, 「やったね！」.
  await expect(page.locator('#card')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-movie-state', 'card');
  await expect(page.locator('#card')).toContainText('おしまい');
  await expect(page.locator('#card')).toContainText('ぜんぶ つながった');
  await page.screenshot({ path: resolve(OUT, 'movie-ending-card.png') });
  await expect(page.locator('#card-button')).toHaveText(MOVIE.movie.card.button);

  // Every line was said, in the usual bubble, above the bottom bar.
  const { lines, shots } = await page.evaluate(() => {
    const w = window as unknown as { __lines: { text: string; bottom: number }[]; __shots: string[] };
    return { lines: w.__lines, shots: w.__shots };
  });
  expect(lines.map((l) => l.text)).toEqual(LINES);
  const viewport = page.viewportSize()!;
  const bar = await page.locator('.letterbox-bar.is-bottom').boundingBox();
  for (const l of lines) expect(l.bottom, `"${l.text}" above the bottom bar`).toBeLessThanOrEqual((bar?.y ?? viewport.height) + 1);
  // Close shots of the creatures, Piko and Sakasa; wide ones of the ring; the train followed.
  for (const want of ['close:dino', 'close:squirrel', 'close:seal', 'close:hare', 'close:tanuki', 'close:chick', 'close:sakasa', 'close:piko', 'wide:point', 'medium:train']) {
    expect(shots, want).toContain(want);
  }
  const acts = Number(await page.locator('#app').getAttribute('data-acts'));
  expect(acts).toBeGreaterThanOrEqual(15);
  // Within the budget on every frame (TECH_SPEC §6).
  const draws = Number(await page.locator('#app').getAttribute('data-draws-max'));
  const tris = Number(await page.locator('#app').getAttribute('data-tris-max'));
  console.log(`movie budget: ${draws} draw calls, ${tris} triangles at most`);
  expect(draws).toBeLessThanOrEqual(200);
  expect(tris).toBeLessThanOrEqual(100_000);

  await page.locator('#card-button').click();
  // Opened by its address (no check mode): back to the title.
  await expect(page.locator('#app')).toHaveAttribute('data-stage', '1-1', { timeout: 60_000 });
  expect(await page.locator('#app').getAttribute('data-frame-errors')).toBeNull();
  expect(errors).toEqual([]);
});

test('ending movie: "▶▶" skips to the last shot and the card', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await start(page);
  await expect(page.locator('#skip')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (document.getElementById('app')?.dataset.beats ?? '').split(',').includes('dino'), undefined, { timeout: 120_000 });
  await page.locator('#skip').dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-movie-state', /skipped|card/, { timeout: 10_000 });
  await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#skip')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-shot', 'wide:point');
  await page.screenshot({ path: resolve(OUT, 'movie-ending-skip.png') });
  const skippedBeats = await beats(page);
  expect(skippedBeats).not.toContain('end');
  // The card's button waits a moment after a skip (a double tap does not close it unseen), then works.
  await page.locator('#card-button').click();
  // Opened by its address: back to the title.
  await expect(page.locator('#app')).toHaveAttribute('data-stage', '1-1', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('ending movie: prefers-reduced-motion cuts instead of moving; the calm setting', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: true, leftHanded: false })));
  await recordBubbles(page);
  await start(page);
  await expect(page.locator('#app')).toHaveAttribute('data-reduced-motion', '1');
  await expect(page.locator('#app')).toHaveAttribute('data-calm', '1');
  // The bars just appear (no slide).
  const transition = await page.locator('.letterbox-bar.is-top').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(transition).toBe('0s');
  // Through the first island and its creatures (the moves are cuts: no wait for them), then "▶▶".
  await page.waitForFunction(() => (document.getElementById('app')?.dataset.beats ?? '').split(',').includes('squirrel'), undefined, { timeout: 120_000 });
  await page.screenshot({ path: resolve(OUT, 'movie-ending-reduced.png') });
  await page.locator('#skip').dispatchEvent('pointerdown');
  await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('#app').getAttribute('data-frame-errors')).toBeNull();
  expect(errors).toEqual([]);
});

test('ending movie: the check mode lists it; the `?movie=` lock on a kid\'s iPad', async ({ page, context }) => {
  test.setTimeout(180_000);
  // The check mode's list: 「ムービー」 → 「エンディング」 (the device was unlocked before).
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [FLAG_KEY, FLAG_VALUE] as const);
  await page.goto('/?stage=0-0&go=1&kakunin=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#kakunin-badge').click();
  const movie = page.locator('#kakunin-list .kakunin-chapter[data-chapter="movie"]');
  await expect(movie).toContainText('ムービー');
  await expect(movie.locator('[data-movie="ending"]')).toContainText('エンディング');
  await movie.locator('[data-movie="ending"]').click();
  await expect(page).toHaveURL(/\?movie=ending&kakunin=1/);
  await expect(page.locator('#movie-play')).toBeVisible({ timeout: 90_000 });

  // A kid's iPad (no automation flag, no check-mode flag): bounced to the title until 6-2 is cleared.
  const kid = await context.browser()!.newContext({ viewport: { width: 1194, height: 834 }, serviceWorkers: 'block' });
  const p2 = await kid.newPage();
  await p2.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await p2.goto('/?movie=ending');
  await expect(p2.locator('#app')).toHaveAttribute('data-stage', '1-1', { timeout: 90_000 });
  expect(new URL(p2.url()).search).toBe('');
  await p2.goto('/?movie=ending&kakunin=1');
  await expect(p2.locator('#app')).toHaveAttribute('data-stage', '1-1', { timeout: 90_000 });
  // With 6-2 cleared in the save, the ending opens (the game sends the child here after 6-2).
  await p2.evaluate(([k]) => localStorage.setItem(k, JSON.stringify({ schema: 1, cleared: ['1-1', '6-2'], abilities: ['whistle'], records: [], mapLinks: [] })), [SAVE_KEY] as const);
  await p2.goto('/?movie=ending');
  await expect(p2.locator('#movie-play')).toBeVisible({ timeout: 90_000 });
  await kid.close();
});

// ---- v1.11 (PR11b): after 6-2's clear, and again from the title ----

const WORLD = JSON.parse(readFileSync(resolve(here, '../../src/world/world.json'), 'utf8')) as WorldFile;
const ALL = WORLD.islands.map((i) => i.id);
const EIGHT = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight', 'reverse'];
/** A child who has just cleared 6-2 (chapter 6's end not seen yet); `seen`: the movie watched before. */
const after62 = (seen: boolean): string =>
  JSON.stringify({ schema: 1, cleared: ALL, abilities: EIGHT, records: [], mapLinks: [...seenMapLinks(WORLD, ALL).filter((k) => k !== 'finale:6'), ...(seen ? ['movie:ending'] : [])] });
/** A context like a kid's iPad: no automation flag, so the `?movie=` lock and the "▶▶" rule apply. */
async function kidPage(browser: import('@playwright/test').Browser, save: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const kid = await browser.newContext({ viewport: { width: 1194, height: 834 }, serviceWorkers: 'block', hasTouch: true });
  const page = await kid.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await page.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  }, [SAVE_KEY, save] as const);
  return { page, close: () => kid.close() };
}

test('after 6-2 (a kid\'s iPad): the first time the movie has no "▶▶"', async ({ browser }) => {
  test.setTimeout(180_000);
  const { page, close } = await kidPage(browser, after62(false));
  const errors = watchErrors(page);
  await page.goto('/?movie=ending&then=map');
  await expect(page.locator('#movie-play')).toBeVisible({ timeout: 90_000 });
  await page.locator('#movie-play').click();
  await expect(page.locator('#app')).toHaveAttribute('data-movie-state', 'playing');
  await page.waitForFunction(() => (document.getElementById('app')?.dataset.beats ?? '').split(',').includes('dino'), undefined, { timeout: 120_000 });
  await expect(page.locator('#skip')).toHaveCount(0);
  expect(errors).toEqual([]);
  await close();
});

test('after 6-2: the card marks the movie seen, then the map with chapter 6\'s end (a card, the fanfare), then the title', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  }, [SAVE_KEY, after62(false)] as const);
  await start(page, '&then=map');
  // (The automation is the owner's check: "▶▶" is there.)
  await page.locator('#skip').dispatchEvent('pointerdown');
  await expect(page.locator('#card')).toBeVisible({ timeout: 30_000 });
  await page.locator('#card-button').click();
  await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').mapLinks ?? [], SAVE_KEY), { timeout: 10_000 }).toContain('movie:ending');
  const map = page.locator('#map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#card')).toContainText('6しょう クリア！', { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, 'movie-then-map.png') });
  await page.locator('#card-button').click();
  await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').mapLinks ?? [], SAVE_KEY), { timeout: 10_000 }).toContain('finale:6');
  await expect(page.locator('#map-close')).toHaveText('タイトルへ', { timeout: 10_000 });
  await page.locator('#map-close').click();
  await expect(page.locator('#title-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#title-movie')).toBeVisible();
  expect(errors).toEqual([]);
});

test('「もういちど みる」 on the title (a kid\'s iPad, seen before): the movie again with "▶▶", back to the title', async ({ browser }) => {
  test.setTimeout(240_000);
  const { page, close } = await kidPage(browser, after62(true));
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('#title-screen')).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, 'movie-title-again.png') });
  await page.locator('#title-movie').click();
  await expect(page).toHaveURL(/\?movie=ending$/, { timeout: 30_000 });
  await expect(page.locator('#movie-play')).toBeVisible({ timeout: 90_000 });
  await page.locator('#movie-play').click();
  await expect(page.locator('#skip')).toBeVisible({ timeout: 30_000 });
  await page.locator('#skip').dispatchEvent('pointerdown');
  await expect(page.locator('#card')).toBeVisible({ timeout: 30_000 });
  await page.locator('#card-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-stage', '1-1', { timeout: 60_000 });
  await expect(page.locator('#title-screen')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
  await close();
});
