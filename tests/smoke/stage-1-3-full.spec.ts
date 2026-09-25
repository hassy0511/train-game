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
const MAX = 5;

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

test('stage 1-3 full run: island hops, the whistle pad, upside down, the updraft, the fog', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?stage=1-3');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#jump')).toBeVisible(); // learned in 1-2 (opened directly, so inherited)
  await page.locator('#title-start').click();
  await card(page, 'しまから');
  await waitDriving(page);

  // M1: three gaps in a row, then the hidden pad: it glows the whistle, the whistle brings it back.
  await setNotch(page, NORMAL);
  await jumpGap(page, '30-sky-jump.png');
  await setNotch(page, FAST);
  await jumpGap(page);
  await jumpGap(page);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 20_000 }); // the pad launched us
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '31-pad-jump.png') });
  await expect(app).toHaveAttribute('data-air', '0', { timeout: 15_000 });
  await stopAt(page, 'main', 460, 60);
  await card(page, 'できた！');

  // M2: round the island's end onto its underside, stop at the upside-down station.
  await card(page, 'さかさま');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFor(page, 'flip', 130);
  await expect(app).toHaveAttribute('data-camera', 'side');
  await page.screenshot({ path: resolve(OUT, '32-loop.png') });
  await waitFor(page, 'flip', 190);
  await expect(app).toHaveAttribute('data-camera', 'chase');
  await page.screenshot({ path: resolve(OUT, '33-upside-down.png') });
  await stopAt(page, 'flip', 262, 40);
  await page.screenshot({ path: resolve(OUT, '34-sakasa-station.png') });
  await card(page, 'できた！');

  // M3: the plain way cannot be jumped (back before the junction); the updraft way can.
  await card(page, 'かぜに');
  await waitDriving(page);
  await setNotch(page, MAX);
  await waitFor(page, 'main2', 200 - FRONT + 3);
  await page.waitForFunction(
    () => {
      const el = document.getElementById('app');
      return el?.dataset.rail === 'main2' && Number(el?.dataset.s) < 20;
    },
    null,
    { timeout: 60_000 },
  );
  console.log('1-3: plain way fell, back before the junction');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await expect(page.locator('#junction')).toBeVisible({ timeout: 30_000 });
  await page.locator('#junction .arrow[data-side="right"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'wind', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-updraft', '1', { timeout: 30_000 });
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) > 25, null, { timeout: 30_000 });
  await jumpGap(page, '35-updraft-jump.png');
  await expect(app).toHaveAttribute('data-rail', 'main2', { timeout: 30_000 });
  // Into the fog with the light on; a small gap inside.
  await page.locator('#light').dispatchEvent('pointerdown');
  await expect(page.locator('#light')).toHaveAttribute('data-on', '1');
  await setNotch(page, FAST);
  await waitFor(page, 'main2', 360);
  await page.screenshot({ path: resolve(OUT, '36-fog-light.png') });
  await jumpGap(page);
  await stopAt(page, 'main2', 520, 50, 3);
  await card(page, 'できた！');

  await card(page, '1しょう', 120_000);
  await tapUntil(page, '#card', 60_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '37-clear.png') });
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(progress.records).toEqual(expect.arrayContaining(['cloud-crystal', 'weathervane']));
  await page.locator('#card-button').click();
  // The map: the rail runs on to chapter 2's "?" island, which only wiggles; back to the title.
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('[data-link="1-3>2-1"]')).toHaveClass(/is-laid/);
  await page.locator('.map-island[data-island="2-1"]').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.locator('#map-close').click();
  await page.waitForURL((url) => !url.search.includes('stage=1-3'), { timeout: 30_000 });
  console.log('smoke 1-3 full: cleared');
  expect(errors).toEqual([]);
});
