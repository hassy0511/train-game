import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const FRONT = 6; // data-s is the lead car center; stations and gaps are measured at the front
const STOP = 1;
const SLOW = 2;
const NORMAL = 3;
const FAST = 4;

async function tapUntil(page: Page, selector: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.locator(selector).isVisible()) return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  throw new Error(`timed out waiting for ${selector}`);
}

async function card(page: Page, text: string, timeoutMs = 90_000): Promise<void> {
  await tapUntil(page, '#card', timeoutMs);
  await expect(page.locator('#card')).toContainText(text);
  await page.locator('#card-button').click();
}

async function setNotch(page: Page, notch: number): Promise<void> {
  const box = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
  await expect(page.locator('#app')).toHaveAttribute('data-notch', String(notch));
}

/** Waits until the train is on `rail` with its center at `s` or beyond. */
async function waitFor(page: Page, rail: string, s: number, timeoutMs = 120_000): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) >= Number(t);
    },
    [rail, s] as const,
    { timeout: timeoutMs },
  );
}

async function waitDriving(page: Page): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await page.locator('#app').getAttribute('data-phase')) === 'driving') return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  throw new Error('not driving again');
}

async function jumpGap(page: Page, shot?: string): Promise<void> {
  const jump = page.locator('#jump');
  await expect(jump).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await jump.dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-air', '1', { timeout: 5_000 });
  if (shot) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(OUT, shot) });
  }
  await expect(page.locator('#app')).toHaveAttribute('data-air', '0', { timeout: 15_000 });
}

async function stopAt(page: Page, rail: string, at: number, slowFrom = 55, brake = 4.5): Promise<void> {
  await waitFor(page, rail, at - FRONT - slowFrom);
  await setNotch(page, SLOW);
  await waitFor(page, rail, at - FRONT - brake);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

/** At a station with passengers or a parcel: the glowing door button, then wait for the doors to finish. */
async function doors(page: Page): Promise<void> {
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 20_000 });
  await expect(door).toHaveAttribute('data-glow', '1');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

/** A fail (fall or bump): the train is put back before it; wait until it is back on `rail` before `below`. */
async function waitRewound(page: Page, rail: string, below: number): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) < Number(t) && el?.dataset.phase === 'failing';
    },
    [rail, below] as const,
    { timeout: 60_000 },
  );
}

test('stage 2-1 full run: the springy bough, rolling nuts, the squirrel, upside down, the treetop', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?stage=2-1');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-music', 'title');
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'forest');
  await card(page, 'みきを');

  // M1: up the spiral round the trunk. At ふつう the bough throws the train short: it falls onto a leaf and
  // comes back before the bough.
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFor(page, 'main', 380);
  await page.screenshot({ path: resolve(OUT, '50-spiral.png') });
  await waitFor(page, 'main', 600);
  // On the bough the jump button does nothing: the bough does the throwing.
  await expect(page.locator('#jump')).not.toHaveAttribute('data-glow', '1');
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 20_000 });
  await waitRewound(page, 'main', 600);
  console.log('2-1: thrown short at ふつう, back before the bough');

  // At はやい it reaches the next branch.
  await waitDriving(page);
  await setNotch(page, FAST);
  await waitFor(page, 'main', 612);
  await page.screenshot({ path: resolve(OUT, '51-bough-bend.png') });
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '52-bough-throw.png') });
  await expect(app).toHaveAttribute('data-air', '0', { timeout: 15_000 });
  expect(Number(await app.getAttribute('data-s'))).toBeGreaterThan(667 - FRONT);
  await stopAt(page, 'main', 745.3);
  await card(page, 'できた！');

  // M2: nuts roll down the branch. Jump the first; bump into the second (ぽこん, back), then jump it.
  await card(page, 'きのみ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await jumpGap(page, '53-nut-jump.png');
  console.log('2-1: jumped the first nut');
  await waitFor(page, 'main', 900);
  await waitRewound(page, 'main', 900);
  console.log('2-1: bumped the second nut, back before it');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await jumpGap(page);
  // The squirrel: whistle while the whistle glows, and it drops its nut off the rail.
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, '54-squirrel.png') });
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect(page.locator('#whistle')).not.toHaveAttribute('data-glow', '1', { timeout: 5_000 });
  await stopAt(page, 'main', 1205.3);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-parcel', '1');
  await card(page, 'できた！');

  // M3: round the bough's end and along its underside upside down, then the last bough at はやい.
  await card(page, 'さかさえだ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFor(page, 'flip', 205);
  await page.screenshot({ path: resolve(OUT, '55-upside-down.png') });
  await waitFor(page, 'top', 2);
  await setNotch(page, FAST);
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 20_000 });
  await expect(app).toHaveAttribute('data-air', '0', { timeout: 15_000 });
  expect(Number(await app.getAttribute('data-s'))).toBeGreaterThan(116 - FRONT);
  await stopAt(page, 'top', 240);
  await doors(page);
  await card(page, 'できた！');

  // Ending, clear, and the map: the rail runs on to chapter 2's next "?" island.
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '56-clear.png') });
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(progress.records).toEqual(expect.arrayContaining(['squirrel-nest']));
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`2-1 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  expect(budget.draws).toBeLessThanOrEqual(200);
  expect(budget.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('[data-link="2-1>2-2"]')).toHaveClass(/is-laid/);
  await page.locator('#map-close').click();
  await page.waitForURL((url) => !url.search.includes('stage=2-1'), { timeout: 30_000 });
  console.log('smoke 2-1 full: cleared');
  expect(errors).toEqual([]);
});
