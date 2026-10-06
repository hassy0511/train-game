import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The picture book from the title (docs/PHASE7_FINISH.md §4 item 2), from a prepared save: one row per island,
 * 「みつけた n/48」, the pictures of found records, "?" cards with the grey picture of the ability they still need,
 * and 「とじる」 in sight at the bottom however far down the child has scrolled.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const CHAIN = ['1-1>1-2', '1-2>1-3', '1-3>2-1'];

type Save = { cleared: string[]; abilities: string[]; records: string[]; mapLinks: string[] };

async function seed(page: Page, save: Save): Promise<void> {
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schema: 1, ...data }));
    },
    [KEY, save] as const,
  );
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

async function openZukan(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-zukan').click();
  await expect(page.locator('#zukan')).toBeVisible();
}

/** The picture of a found card has loaded (a 256 px PNG from public/zukan). */
async function pictureWidth(page: Page, id: string): Promise<number> {
  const img = page.locator(`.zukan-card[data-record="${id}"] img`);
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth)).toBe(256);
  return img.evaluate((e) => (e as HTMLImageElement).naturalWidth);
}

/** 「とじる」 lies fully inside the screen. */
async function closeInSight(page: Page): Promise<void> {
  const box = await page.locator('#zukan-close').boundingBox();
  const view = page.viewportSize();
  expect(box && view).toBeTruthy();
  if (!box || !view) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
}

test('picture book: rows per island, count, pictures, grey ability pictures, close in sight (iPad landscape)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const errors = watchErrors(page);
  // Chapter 1 and 2-1 played through, no rocket yet: 6 found.
  await seed(page, {
    cleared: ['1-1', '1-2', '1-3', '2-1'],
    abilities: ['whistle', 'jump', 'light'],
    records: ['town-board', 'hq-plans', 'dino-egg', 'footprints', 'cloud-crystal', 'squirrel-nest'],
    mapLinks: CHAIN,
  });
  await openZukan(page);
  await expect(page.locator('#zukan-count')).toHaveText('みつけた 6/48');
  await expect(page.locator('.zukan-row')).toHaveCount(16);
  await expect(page.locator('.zukan-row[data-stage="1-1"] .zukan-row-count')).toHaveText('2/3');
  await expect(page.locator('.zukan-card.is-found')).toHaveCount(6);
  // Needs the rocket (not learned): grey rocket picture. The balloon needs the jump, which the child has: plain "?".
  for (const id of ['cliff-nest', 'treetop']) {
    await expect(page.locator(`.zukan-card[data-record="${id}"] .zukan-later[data-ability="rocket"]`)).toHaveCount(1);
  }
  await expect(page.locator('.zukan-card[data-record="roof-balloon"] .zukan-mark')).toHaveText('？');
  await expect(page.locator('.zukan-card[data-record="roof-balloon"] .zukan-later')).toHaveCount(0);
  // Later chapters' abilities: dive, reverse.
  await expect(page.locator('.zukan-card[data-record="mizutamari"] .zukan-later[data-ability="dive"]')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="upside-island"] .zukan-later[data-ability="reverse"]')).toHaveCount(1);
  // 3-1: the sea pearl needs the dive, the iron star the magnet light (chapter 5).
  await expect(page.locator('.zukan-card[data-record="sea-pearl"] .zukan-later[data-ability="dive"]')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="iron-star"] .zukan-later[data-ability="magnetLight"]')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="iron-star"] .zukan-later svg')).toHaveCount(1);
  // 3-2's butterbur bud waits for chapter 4's snowplow, 3-3's festival bell for chapter 5's magnet light.
  await expect(page.locator('.zukan-card[data-record="snow-bud"] .zukan-later[data-ability="plow"] svg')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="festival-bell"] .zukan-later[data-ability="magnetLight"]')).toHaveCount(1);
  // 4-1's bell on the ice shelf waits for chapter 5's magnet light.
  await expect(page.locator('.zukan-card[data-record="ice-bell"] .zukan-later[data-ability="magnetLight"]')).toHaveCount(1);
  // 5-1's lantern bell on the high branch waits for the magnet light too.
  await expect(page.locator('.zukan-card[data-record="lantern-bell"] .zukan-later[data-ability="magnetLight"] svg')).toHaveCount(1);
  // 4-2: the mitten under the snow needs the snowplow (learned there), the tin shovel the magnet light.
  await expect(page.locator('.zukan-card[data-record="spiral-mitten"] .zukan-later[data-ability="plow"]')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="spiral-mitten"] .zukan-later svg')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="tin-shovel"] .zukan-later[data-ability="magnetLight"]')).toHaveCount(1);
  // 4-3: the ice flower at the bottom of the pond needs the dive, the sleigh bells in the snow the magnet light.
  await expect(page.locator('.zukan-card[data-record="ice-flower"] .zukan-later[data-ability="dive"]')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="sleigh-bell"] .zukan-later[data-ability="magnetLight"]')).toHaveCount(1);
  // 5-2's tin key on the shelf and 5-3's iron hand mirror wait for the magnet light; 5-3's doodle for "うしろむき".
  await expect(page.locator('.zukan-card[data-record="tin-key"] .zukan-later[data-ability="magnetLight"]')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="hand-mirror"] .zukan-later[data-ability="magnetLight"] svg')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="sakasa-doodle"] .zukan-later[data-ability="reverse"] svg')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="kagami-kanban"] .zukan-later')).toHaveCount(0);
  // v1.11 (PR9) 6-1: record ③ the book waits for "うしろむき"; ① the raindrop needs the jump (had), ② the top the magnet.
  await expect(page.locator('.zukan-card[data-record="backward-book"] .zukan-later[data-ability="reverse"] svg')).toHaveCount(1);
  await expect(page.locator('.zukan-card[data-record="up-raindrop"] .zukan-later')).toHaveCount(0);
  await expect(page.locator('.zukan-card[data-record="upside-top"] .zukan-later[data-ability="magnetLight"]')).toHaveCount(1);
  // The book is taller than the screen; 「とじる」 is in sight before any scrolling.
  const tall = await page.locator('#zukan').evaluate((e) => e.scrollHeight > e.clientHeight);
  expect(tall).toBe(true);
  await closeInSight(page);
  expect(await pictureWidth(page, 'town-board')).toBe(256);
  await page.locator('#zukan').evaluate((e) => e.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'zukan-1-top.png') });
  expect(await pictureWidth(page, 'squirrel-nest')).toBe(256);
  await closeInSight(page);
  await page.locator('#zukan').evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'zukan-2-bottom.png') });
  await closeInSight(page);
  await page.locator('#zukan-close').click();
  await expect(page.locator('#zukan')).toHaveCount(0);
  await expect(page.locator('#title-zukan')).toBeVisible();
  expect(errors).toEqual([]);
});

test('picture book with the rocket: the rocket "?" loses its grey picture, a found rocket record shows its picture', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, {
    cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'],
    abilities: ['whistle', 'jump', 'light', 'rocket'],
    records: ['cliff-nest', 'roof-balloon'],
    mapLinks: [...CHAIN, '2-1>2-2', '2-2>2-3'],
  });
  await openZukan(page);
  await expect(page.locator('#zukan-count')).toHaveText('みつけた 2/48');
  await expect(page.locator('.zukan-card[data-record="treetop"] .zukan-later')).toHaveCount(0);
  await expect(page.locator('.zukan-card[data-record="treetop"] .zukan-mark')).toHaveText('？');
  await expect(page.locator('.zukan-card[data-record="cliff-nest"] .zukan-name')).toHaveText('がけの うえの す');
  expect(await pictureWidth(page, 'cliff-nest')).toBe(256);
  expect(await pictureWidth(page, 'roof-balloon')).toBe(256);
  await page.locator('.zukan-row[data-stage="1-2"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'zukan-3-rocket.png') });
  await closeInSight(page);
  expect(errors).toEqual([]);
});

test('picture book with the magnet light (5-3 on): the seven magnet "?" lose their grey picture; a fetched one has its answer', async ({ page }) => {
  const errors = watchErrors(page);
  // Chapters 1–4, 5-1 and 5-2 cleared and 5-3 played to its opening: the magnet light learned; 4-1's bell fetched.
  await seed(page, {
    cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2'],
    abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'],
    records: ['ice-bell'],
    mapLinks: [...CHAIN, '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1', '3-1>3-2', '3-2>3-3', '3-3>4-1', '4-1>4-2', '4-2>4-3', '4-3>5-1', '5-1>5-2', '5-2>5-3', 'finale:4'],
  });
  await openZukan(page);
  await expect(page.locator('#zukan-count')).toHaveText('みつけた 1/48');
  for (const id of ['iron-star', 'festival-bell', 'tin-shovel', 'sleigh-bell', 'lantern-bell', 'tin-key', 'hand-mirror']) {
    await expect(page.locator(`.zukan-card[data-record="${id}"] .zukan-mark`), id).toHaveText('？');
    await expect(page.locator(`.zukan-card[data-record="${id}"] .zukan-later`), id).toHaveCount(0);
  }
  // Found with the magnet: the note in its answer form (第 2 部 M7.2).
  await expect(page.locator('.zukan-card[data-record="ice-bell"] .zukan-note')).toHaveText('たかい たなから ひきよせた すず');
  // "うしろむき" is still to come.
  await expect(page.locator('.zukan-card[data-record="sakasa-doodle"] .zukan-later[data-ability="reverse"]')).toHaveCount(1);
  await page.locator('.zukan-row[data-stage="5-3"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'zukan-4-magnet.png') });
  await closeInSight(page);
  expect(errors).toEqual([]);
});

test('picture book with うしろむき (6-1 cleared): the three うしろむき "?" lose their grey picture; a found one shows its picture', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, {
    cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3', '6-1'],
    abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight', 'reverse'],
    records: ['backward-book'],
    mapLinks: [...CHAIN, '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1', '3-1>3-2', '3-2>3-3', '3-3>4-1', '4-1>4-2', '4-2>4-3', '4-3>5-1', '5-1>5-2', '5-2>5-3', '5-3>6-1', 'finale:4', 'finale:5'],
  });
  await openZukan(page);
  // PR11b: 6-1 cleared opens 6-2's row (its three records, all うしろむき: no grey picture either).
  await expect(page.locator('#zukan-count')).toHaveText('みつけた 1/51');
  await expect(page.locator('.zukan-row[data-stage="6-2"] .zukan-card')).toHaveCount(3);
  for (const id of ['upside-island', 'sakasa-doodle', 'swirl-acorn', 'left-shell', 'sakasa-tag']) {
    await expect(page.locator(`.zukan-card[data-record="${id}"] .zukan-mark`), id).toHaveText('？');
    await expect(page.locator(`.zukan-card[data-record="${id}"] .zukan-later`), id).toHaveCount(0);
  }
  expect(await pictureWidth(page, 'backward-book')).toBe(256);
  await page.locator('.zukan-row[data-stage="6-1"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'zukan-5-reverse.png') });
  await closeInSight(page);
  expect(errors).toEqual([]);
});

test('picture book before 6-1 is cleared: no row for 6-2 (it is not on the map either: `islands[].after`)', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, {
    cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3'],
    abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'],
    records: [],
    mapLinks: [...CHAIN, '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1', '3-1>3-2', '3-2>3-3', '3-3>4-1', '4-1>4-2', '4-2>4-3', '4-3>5-1', '5-1>5-2', '5-2>5-3', '5-3>6-1', 'finale:4', 'finale:5'],
  });
  await openZukan(page);
  await expect(page.locator('.zukan-row[data-stage="6-1"]')).toHaveCount(1);
  await expect(page.locator('.zukan-row[data-stage="6-2"]')).toHaveCount(0);
  await expect(page.locator('#zukan-count')).toHaveText('みつけた 0/48');
  expect(errors).toEqual([]);
});
