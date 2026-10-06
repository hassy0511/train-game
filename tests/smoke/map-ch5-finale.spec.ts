import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seenMapLinks } from '../../src/world/pages';
import type { WorldFile } from '../../src/world/types';

/**
 * Chapter 5's end on the map (docs/PHASE9_CHAPTER5_6.md 第 1 部 §4, read with §0.9 の 1; PR6c): with 5-1, 5-2 and 5-3
 * cleared the map opens on page 3 at night; fireflies rise from 5-1, 5-2 and 5-3 in turn and gather into one big light
 * that flies to the castle 6-1 (asleep, grey, until it lands: then it wakes and its windows light, PR9); the night
 * lifts; the card 「5しょう クリア！」 (its firefly picture); closed, "finale:5" is saved, the new rail 5-3 → 6-1 grows and
 * the castle hops. Once only. With calm motion no dots fly. And the badges of the
 * islands whose "?" the magnet light can fetch now glow softly (§0.4, `.map-badge.is-takeable`).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'output');
mkdirSync(OUT, { recursive: true });
const WORLD = JSON.parse(readFileSync(resolve(HERE, '../../src/world/world.json'), 'utf8')) as WorldFile;
const KEY = 'train-game.progress.v1';
const SIX = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'];
const TO_53 = WORLD.islands.filter((i) => i.chapter <= 5).map((i) => i.id);

/** Every record of the playable stages, with the ability it needs. */
const RECORDS: { id: string; stage: string; requires: string | null }[] = readdirSync(resolve(HERE, '../../src/stages'))
  .filter((f) => /^[1-9]-\d\.json$/.test(f))
  .flatMap((f) => {
    const stage = JSON.parse(readFileSync(resolve(HERE, '../../src/stages', f), 'utf8')) as { id: string; records: { id: string; requires: string | null }[] };
    return stage.records.map((r) => ({ id: r.id, stage: stage.id, requires: r.requires }));
  });

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

async function openTitleMap(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#title-screen')).toBeVisible();
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
}

/** Keeps how many fireflies and big lights were ever on the map (they come and go in a second). */
async function countFlies(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __flies: { dots: number; big: number; night: boolean } };
    w.__flies = { dots: 0, big: 0, night: false };
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.classList.contains('map-firefly')) w.__flies.dots += 1;
          if (n.classList.contains('map-bigfly')) w.__flies.big += 1;
        }
      }
      if (document.getElementById('map')?.classList.contains('is-night')) w.__flies.night = true;
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}

const flies = (page: Page): Promise<{ dots: number; big: number; night: boolean }> =>
  page.evaluate(() => (window as unknown as { __flies: { dots: number; big: number; night: boolean } }).__flies);

/** A child who has just cleared 5-3: everything up to 5-2's rail seen, chapter 5's end not yet. */
function justCleared(): Save {
  const links = seenMapLinks(WORLD, TO_53).filter((k) => k !== 'finale:5');
  return { cleared: TO_53, abilities: [...SIX, 'magnetLight'], records: [], mapLinks: links };
}

test("chapter 5's end: night, the fireflies from 5-1, 5-2 and 5-3 into one big light on the castle, which wakes; the card, once", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await seed(page, justCleared());
  await countFlies(page);
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-page', '3');
  await expect(map).toHaveAttribute('data-light', 'firefly');
  await expect(map).toHaveAttribute('data-finale', 'playing');
  // The castle (6-1) is there from the start, asleep (grey); no "?" island any more. Its rail waits for the card.
  await expect(page.locator('.map-island[data-island="teaser:6"]')).toHaveCount(0);
  const castle = page.locator('.map-island[data-island="6-1"]');
  await expect(castle).toBeVisible();
  await expect(castle).toHaveClass(/is-asleep/);
  // PR9b: asleep, its windows are dark.
  await expect(castle.locator('.map-window')).toHaveCount(0);
  await expect(map).toHaveClass(/is-night/, { timeout: 10_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, 'map-ch5-finale-1-night.png') });
  await expect(map).toHaveAttribute('data-trail', '5-1,5-2,5-3,6-1', { timeout: 20_000 });
  await expect(castle).toHaveClass(/is-lit/);
  // It wakes: its colour back and four windows lit ("ちりりん").
  await expect(map).toHaveAttribute('data-windows', '6-1', { timeout: 10_000 });
  await expect(castle).not.toHaveClass(/is-asleep/);
  await expect(castle.locator('.map-window')).toHaveCount(4);
  const f = await flies(page);
  expect(f.dots).toBe(18);
  expect(f.big).toBe(1);
  expect(f.night).toBe(true);
  // The card: its three lines and the firefly picture; its button a moment later.
  const card = page.locator('#card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('5しょう クリア！');
  await expect(card).toContainText('ふしぎな せかいが');
  await expect(card).toContainText('ぜんぶ つながった！');
  await expect(card.locator('svg.card-icon')).toHaveCount(1);
  await expect(map).not.toHaveClass(/is-night/);
  await page.screenshot({ path: resolve(OUT, 'map-ch5-finale-2-card.png') });
  expect((await saved(page)).mapLinks).not.toContain('finale:5');
  await expect(page.locator('#card-button')).toHaveText('つぎへ');
  await page.locator('#card-button').click();
  await expect(map).toHaveAttribute('data-finale', 'done', { timeout: 10_000 });
  expect((await saved(page)).mapLinks).toContain('finale:5');
  // Then the new rail 5-3 → 6-1 grows and the castle hops.
  await expect.poll(async () => (await saved(page)).mapLinks, { timeout: 10_000 }).toContain('5-3>6-1');
  await expect(castle).toHaveClass(/is-next/, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, 'map-ch5-finale-3-after.png') });
  // Back to the title and to the map again: no end this time; the castle awake on its rail.
  await page.locator('#map-close').click();
  await expect(page.locator('#title-screen')).toBeVisible();
  await page.locator('#title-map').click();
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('data-page', '3');
  await expect(map).not.toHaveAttribute('data-finale', /.+/);
  await expect(castle).toBeVisible();
  await expect(castle).not.toHaveClass(/is-asleep/);
  await expect(page.locator('[data-link="5-3>6-1"]')).toHaveClass(/is-laid/);
  // PR9b: "finale:5" seen, the castle stays awake: its four windows are simply lit (no pop, no "ちりりん"), on the
  // castle's picture.
  await expect(castle).toHaveClass(/is-awake/);
  const lit = castle.locator('.map-picture .map-window.is-still');
  await expect(lit).toHaveCount(4);
  const picture = await castle.locator('.map-picture img').boundingBox();
  expect(picture).not.toBeNull();
  for (const w of await lit.all()) {
    const b = await w.boundingBox();
    expect(b).not.toBeNull();
    if (!b || !picture) continue;
    // Small round lights inside the castle's part of the picture (its upper half).
    expect(b.width).toBeLessThan(picture.width * 0.08);
    expect(b.x + b.width / 2).toBeGreaterThan(picture.x + picture.width * 0.3);
    expect(b.x + b.width / 2).toBeLessThan(picture.x + picture.width * 0.7);
    expect(b.y + b.height / 2).toBeGreaterThan(picture.y);
    expect(b.y + b.height / 2).toBeLessThan(picture.y + picture.height * 0.5);
  }
  await expect(map).not.toHaveAttribute('data-windows', /.+/);
  await page.screenshot({ path: resolve(OUT, 'map-ch5-castle-lit.png') });
  if (picture) await page.screenshot({ path: resolve(OUT, 'map-ch5-castle-lit-close.png'), clip: picture });
  expect(errors).toEqual([]);
});

test("chapter 5's end with calm motion: no fireflies fly, the islands glow in turn, the card", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, justCleared());
  await countFlies(page);
  await openTitleMap(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-trail', '5-1,5-2,5-3,6-1', { timeout: 20_000 });
  await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
  const f = await flies(page);
  expect(f.big).toBe(0);
  expect(await page.locator('.map-firefly').count()).toBe(0);
});

test("5-3 cleared on its own (5-2 not yet): no chapter end, no rail to the castle", async ({ page }) => {
  const errors = watchErrors(page);
  const cleared = TO_53.filter((id) => id !== '5-2');
  await seed(page, { cleared, abilities: [...SIX, 'magnetLight'], records: [], mapLinks: seenMapLinks(WORLD, cleared) });
  await openTitleMap(page);
  await expect(page.locator('#map')).not.toHaveAttribute('data-finale', /.+/);
  await expect(page.locator('.map-island[data-island="teaser:6"]')).toHaveCount(0);
  expect((await saved(page)).mapLinks).not.toContain('finale:5');
  expect((await saved(page)).mapLinks).not.toContain('5-3>6-1');
  expect(errors).toEqual([]);
});

test('the magnet light learned: the seven islands with a magnet "?" glow softly (and no others)', async ({ page }) => {
  const errors = watchErrors(page);
  // Every record found but the magnet ones, 5-3's sign (requires nothing) and the ones for "うしろむき" (not learned).
  const records = RECORDS.filter((r) => r.requires !== 'magnetLight' && r.requires !== 'reverse' && r.id !== 'kagami-kanban').map((r) => r.id);
  await seed(page, { cleared: TO_53, abilities: [...SIX, 'magnetLight'], records, mapLinks: seenMapLinks(WORLD, TO_53) });
  await openTitleMap(page);
  const glowing = await page.locator('.map-badge.is-takeable').evaluateAll((els) => els.map((e) => (e.closest('.map-island') as HTMLElement).dataset.island).sort());
  expect(glowing).toEqual(['3-1', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2']);
  // 5-3's hand mirror comes in its own opening's magnet light; its missing sign needs nothing: no glow there.
  await expect(page.locator('.map-island[data-island="5-3"] .map-badge')).not.toHaveClass(/is-takeable/);
  await expect(page.locator('.map-island[data-island="1-3"] .map-badge')).not.toHaveClass(/is-takeable/);
  await page.screenshot({ path: resolve(OUT, 'map-ch5-takeable.png') });
  expect(errors).toEqual([]);
});

test('without the magnet light no badge glows', async ({ page }) => {
  const cleared = TO_53.filter((id) => id !== '5-3');
  await seed(page, { cleared, abilities: SIX, records: [], mapLinks: seenMapLinks(WORLD, cleared) });
  await openTitleMap(page);
  await expect(page.locator('.map-island').first()).toBeVisible();
  // Records for later abilities the child has (the rocket's in 1-2, the dive's in 2-x...) glow, never a magnet one.
  for (const id of ['3-1', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2']) {
    await expect(page.locator(`.map-island[data-island="${id}"] .map-badge`), id).not.toHaveClass(/is-takeable/);
  }
});
