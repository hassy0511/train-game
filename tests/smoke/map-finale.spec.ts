import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The chapter ends on the map (docs/PHASE7_FINISH.md §3), from a prepared save: the closing rail grows in, the
 * golden light runs round the ring, the card shows over the map, then chapter 3's single "?" island floats in.
 * It plays once; leaving before the card is closed plays it again.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const CHAPTER_1 = ['1-1', '1-2', '1-3'];
const CHAPTER_2 = ['2-1', '2-2', '2-3'];
const CHAIN = ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3'];

type Save = { cleared: string[]; abilities: string[]; mapLinks: string[] };

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

async function openTitleMap(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#title-screen')).toBeVisible();
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
}

/** Waits until the element's one-off animations (a fade-in, a pop) are over; endless ones (the float) do not count. */
async function settled(target: Locator): Promise<void> {
  await target.evaluate((e) =>
    Promise.all(
      e
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/**
 * Taps the "?" island and checks it really wiggles (the animation starts, whatever else it was doing), then
 * floats on again once the wiggle is over.
 */
async function tapTeaser(page: Page, teaser: Locator): Promise<void> {
  await teaser.evaluate((e) => {
    const w = window as unknown as { teaserAnims: string[] };
    w.teaserAnims = [];
    e.addEventListener('animationstart', (ev) => w.teaserAnims.push((ev as AnimationEvent).animationName));
  });
  // It floats (never "stable" for a click), like the bouncing next island in the other specs.
  await teaser.dispatchEvent('click');
  await expect(page.locator('.map-say')).toHaveText('つづきは また こんど！');
  await expect.poll(() => page.evaluate(() => (window as unknown as { teaserAnims: string[] }).teaserAnims)).toContain('island-wiggle');
  await expect(teaser).not.toHaveClass(/is-wiggle|is-appear/, { timeout: 10_000 });
  await expect.poll(() => teaser.evaluate((e) => getComputedStyle(e).animationName)).toBe('island-float');
}

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

test('chapter 2 finale: the ring, the card, the "?" island, once', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, {
    cleared: [...CHAPTER_1, ...CHAPTER_2],
    abilities: ['whistle', 'jump', 'light', 'rocket'],
    mapLinks: CHAIN,
  });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  // Both chapters done: two gold stars on the title.
  await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ★/);
  await page.screenshot({ path: resolve(OUT, 'map-finale-title.png') });

  // First look: the closing rail grows, then the card. Leaving before closing it keeps the link unsaved.
  await page.locator('#title-map').click();
  await expect(page.locator('[data-link="2-3>1-1"]')).toHaveClass(/is-laid/);
  await expect(page.locator('[data-link="2-3>1-1"]')).toHaveClass(/is-growing/);
  await expect(page.locator('#map')).toHaveAttribute('data-finale', 'playing');
  await expect(page.locator('#card')).toContainText('2しょう クリア', { timeout: 20_000 });
  expect((await saved(page)).mapLinks).not.toContain('2-3>1-1');
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  expect((await saved(page)).mapLinks).not.toContain('2-3>1-1');

  // Second look: it plays again, all the way.
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
  // No way out and no taps on the islands until the card has been seen; the "?" island waits.
  await expect(page.locator('#map-close')).toBeHidden();
  await expect(page.locator('.map-island.is-teaser')).toBeHidden();
  await expect(page.locator('#map')).toHaveClass(/(^|\s)is-finale(\s|$)/, { timeout: 20_000 });
  // The light runs round the six islands in order (1-1 hops first, then the light sets off).
  await expect(page.locator('[data-link="1-1>1-2"]')).toHaveClass(/is-lit/, { timeout: 20_000 });
  await page.waitForTimeout(1_300);
  await page.screenshot({ path: resolve(OUT, 'map-finale-ring.png') });
  await expect(page.locator('[data-link="2-3>1-1"]')).toHaveClass(/is-lit/, { timeout: 20_000 });
  for (const id of CHAPTER_1.concat(CHAPTER_2)) await expect(page.locator(`.map-island[data-island="${id}"]`)).toHaveClass(/is-hop/);

  const card = page.locator('#card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('2しょう クリア！');
  await expect(card).toContainText('ぜんぶ つながった！');
  await expect(card.locator('svg.card-icon')).toBeVisible();
  await expect(page.locator('#card-button')).toHaveText('やったね！');
  // Its button pops in a moment later (a child still tapping cannot close it unseen).
  expect(await page.locator('#card-button').evaluate((b) => b.matches('.is-guarded, .is-popping'))).toBe(true);
  await expect(page.locator('#card-button')).toBeVisible();
  // The card is on top of the map: its button is what a tap there hits.
  const onTop = await page.evaluate(() => {
    const b = document.getElementById('card-button')?.getBoundingClientRect();
    return b ? document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.id : null;
  });
  expect(onTop).toBe('card-button');
  await page.screenshot({ path: resolve(OUT, 'map-finale-card.png') });
  expect((await saved(page)).mapLinks).not.toContain('2-3>1-1');
  await page.locator('#card-button').click();
  await expect(card).toHaveCount(0);
  expect((await saved(page)).mapLinks).toContain('2-3>1-1');

  // Then chapter 3's "?" island floats in with its dotted line from the first town; tapping it only says "later".
  await expect(page.locator('#map')).toHaveAttribute('data-finale', 'done');
  const teaser = page.locator('.map-island.is-teaser');
  await expect(teaser).toBeVisible();
  await expect(teaser).toContainText('3しょう');
  await expect(page.locator('[data-link="1-1>teaser:3"]')).toBeVisible();
  await expect(page.locator('#map-close')).toBeVisible();
  // Tapped straight away, while it is still floating in: it wiggles all the same, then floats on.
  await tapTeaser(page, teaser);
  await expect(page.locator('.map-say')).toHaveCount(0, { timeout: 10_000 });
  // Once it has faded in for good (opacity 1), the tap again for the picture.
  await settled(page.locator('[data-link="1-1>teaser:3"]'));
  await expect.poll(() => teaser.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await tapTeaser(page, teaser);
  await settled(page.locator('.map-say'));
  await expect(page.locator('#map')).toBeVisible();
  await page.screenshot({ path: resolve(OUT, 'map-finale-teaser.png') });
  await expect(page.locator('.map-say')).toHaveCount(0, { timeout: 10_000 });

  // Once only: the map opened again shows the ring and the "?" island at once, no light and no card.
  await page.locator('#map-close').click();
  await expect(page.locator('#map')).toHaveCount(0);
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('[data-link="2-3>1-1"]')).toHaveClass(/is-laid/);
  await expect(page.locator('[data-link="2-3>1-1"]')).not.toHaveClass(/is-growing/);
  await expect(page.locator('.map-island.is-teaser')).toBeVisible();
  await page.waitForTimeout(3_000);
  await expect(page.locator('#card')).toHaveCount(0);
  await expect(page.locator('#map')).not.toHaveAttribute('data-finale', /.+/);
  await expect(page.locator('#map')).not.toHaveClass(/(^|\s)is-finale/);
  // On a later visit too it wiggles, and then floats on (not stuck after the first tap).
  await tapTeaser(page, teaser);
  await tapTeaser(page, teaser);
  await page.locator('#map-close').click();
  expect(errors).toEqual([]);
});

test('chapter 1 finale: a small card when the rail reaches chapter 2', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { cleared: CHAPTER_1, abilities: ['whistle', 'jump', 'light'], mapLinks: CHAIN.slice(0, 2) });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ☆/);
  await page.locator('#title-map').click();
  await expect(page.locator('[data-link="1-3>2-1"]')).toHaveClass(/is-growing/);
  // No ring: the card comes as soon as the rail is in.
  await expect(page.locator('#card')).toContainText('1しょう クリア！', { timeout: 20_000 });
  await expect(page.locator('#card')).toContainText('いきものの せかい');
  await expect(page.locator('#card-button')).toHaveText('つぎへ');
  await page.screenshot({ path: resolve(OUT, 'map-finale-chapter1.png') });
  await page.locator('#card-button').click();
  expect((await saved(page)).mapLinks).toContain('1-3>2-1');
  // No "?" island before chapter 2 is done; 2-1 is next and bounces.
  await expect(page.locator('.map-island.is-teaser')).toHaveCount(0);
  await expect(page.locator('.map-island[data-island="2-1"]')).toHaveClass(/is-next/);
  await expect(page.locator('#map-close')).toBeVisible();
  // Once only.
  await page.locator('#map-close').click();
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.waitForTimeout(2_500);
  await expect(page.locator('#card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a closing rail from a stage opened on its own does not end the chapter', async ({ page }) => {
  const errors = watchErrors(page);
  // Only the last stage of each chapter cleared (opened straight with ?stage=, e.g. to try it out).
  await seed(page, { cleared: ['1-3', '2-3'], abilities: [], mapLinks: [] });
  await openTitleMap(page);
  // The rails are drawn, but they are not new and no finale plays; nothing about them is saved.
  await expect(page.locator('[data-link="2-3>1-1"]')).toHaveClass(/is-laid/);
  await expect(page.locator('[data-link="2-3>1-1"]')).not.toHaveClass(/is-growing/);
  await expect(page.locator('[data-link="1-3>2-1"]')).not.toHaveClass(/is-growing/);
  await page.waitForTimeout(3_000);
  await expect(page.locator('#card')).toHaveCount(0);
  await expect(page.locator('#map')).not.toHaveAttribute('data-finale', /.+/);
  await expect(page.locator('.map-island.is-teaser')).toHaveCount(0);
  await expect(page.locator('#map-close')).toBeVisible();
  await page.screenshot({ path: resolve(OUT, 'map-finale-not-yet.png') });
  const links = (await saved(page)).mapLinks;
  expect(links).not.toContain('2-3>1-1');
  expect(links).not.toContain('1-3>2-1');
  await page.locator('#map-close').click();

  // When the whole of chapter 2 is really cleared, its finale still plays (the latest chapter's, with the ring).
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}');
    save.cleared = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'];
    localStorage.setItem(key, JSON.stringify(save));
  }, KEY);
  await page.locator('#title-map').click();
  await expect(page.locator('[data-link="2-3>1-1"]')).toHaveClass(/is-growing/);
  await expect(page.locator('#card')).toContainText('2しょう クリア', { timeout: 20_000 });
  await page.locator('#card-button').click();
  expect((await saved(page)).mapLinks).toContain('2-3>1-1');
  await expect(page.locator('.map-island.is-teaser')).toBeVisible();
  expect(errors).toEqual([]);
});

/** The title, a fresh save: no chapter row at all. */
test('title without a finished chapter has no stars', async ({ page }) => {
  await openTitleMap(page);
  await expect(page.locator('#title-chapters')).toHaveCount(0);
  await expect(page.locator('.map-island.is-teaser')).toHaveCount(0);
  await expect(page.locator('#map')).not.toHaveAttribute('data-finale', /.+/);
});
