import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const LOOP = 712;

async function tapUntil(page: Page, selector: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const target = page.locator(selector);
  const bubble = page.locator('#bubble');
  while (Date.now() < deadline) {
    if (await target.isVisible()) return;
    if (await bubble.isVisible()) await bubble.dispatchEvent('pointerdown');
    if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  throw new Error(`timed out waiting for ${selector}`);
}

async function setNotch(page: Page, notch: number): Promise<void> {
  const detent = page.locator(`.lever-detent[data-notch="${notch}"]`);
  const box = await detent.boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
  await expect(page.locator('#app')).toHaveAttribute('data-notch', String(notch));
}

/** Waits until the train's s (loop-aware) reaches `target` going forward. */
async function waitForS(page: Page, target: number, timeoutMs = 120_000): Promise<void> {
  await page.waitForFunction(
    ([t, loop]) => {
      const el = document.getElementById('app');
      const s = Number(el?.dataset.s);
      return t < loop ? s >= t : s >= t - loop && s < loop / 2;
    },
    [target, LOOP] as const,
    { timeout: timeoutMs },
  );
}

const FRONT = 6; // data-s is the lead car center; the stop line is where the front stops
const FAST = 4; // はやい 15 m/s
const SLOW = 2; // ゆっくり 5 m/s
const STOP = 1; // とまる

/** Drives from the current stop to the stop line `at` (m, train front): fast, slow at 55 m, brake at 4.5 m. */
async function driveTo(page: Page, at: number, opts: { whistleAt?: number } = {}): Promise<void> {
  await setNotch(page, FAST);
  if (opts.whistleAt !== undefined) {
    await waitForS(page, opts.whistleAt);
    await setNotch(page, SLOW);
    await page.locator('#whistle').dispatchEvent('pointerdown');
  }
  await waitForS(page, at - FRONT - 55);
  await setNotch(page, SLOW);
  await waitForS(page, at - FRONT - 4.5);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

async function doors(page: Page, shot?: string, checkAsk = false): Promise<void> {
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 20_000 });
  // The game waits for this tap: the button glows and the partner asks for it.
  await expect(door).toHaveAttribute('data-glow', '1');
  if (checkAsk) {
    const bubble = page.locator('#bubble');
    const deadline = Date.now() + 30_000;
    while (!((await bubble.getAttribute('data-line')) ?? '').includes('ドアの ボタン')) {
      if (Date.now() > deadline) throw new Error('no door ask line');
      if (await bubble.isVisible()) await bubble.dispatchEvent('pointerdown');
      await page.waitForTimeout(150);
    }
  }
  // The phase attribute is written once per frame; wait for it before pressing so the
  // "doors finished" wait below cannot pass on a stale value from the previous frame.
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await expect(door).toBeHidden();
  if (shot) {
    // Doors switch the camera to the side view; passengers are mid-walk after ~1.2 s.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(OUT, shot) });
  }
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

test('stage 1-1 full run: all three missions and the ending', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?stage=1-1');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  await tapUntil(page, '#card'); // badge card
  await page.locator('#card-button').click();
  await tapUntil(page, '#card'); // mission 1 card
  await page.locator('#card-button').click();

  // M1: hq(45) -> sakura(155)
  await driveTo(page, 155);
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('できた！');
  await page.locator('#card-button').click();

  // M2: board at sakura (already there), minato(425), oka(525)
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('なかまを のせて');
  await page.locator('#card-button').click();
  await doors(page, '12b-sakura-boarding.png', true);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '2');
  await driveTo(page, 425);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '3');
  await driveTo(page, 525);
  await page.screenshot({ path: resolve(OUT, '13-oka-doors.png') });
  await doors(page);
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('できた！');
  await page.locator('#card-button').click();

  // M3: load at oka, cat at 615 (whistle when the front is ~54 m away), unload at hq (45 + loop)
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('おとどけもの');
  await page.locator('#card-button').click();
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-parcel', '1');
  await driveTo(page, LOOP + 45, { whistleAt: 555 });
  await page.screenshot({ path: resolve(OUT, '14-hq-arrival.png') });
  await doors(page);
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('できた！');
  await page.locator('#card-button').click();

  // Ending cutscene, then the clear card.
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '15-clear.png') });
  console.log('smoke 1-1 full: cleared');

  // Rendering budget (TECH_SPEC §6): the heaviest frame of the whole run.
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`1-1 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  // "つづく" opens the map: the rail to 1-2 grows in and 1-2 bounces; tapping it goes on (no title).
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('[data-link="1-1>1-2"]')).toHaveClass(/is-growing/);
  await expect(page.locator('.map-island[data-island="1-2"]')).toHaveClass(/is-next/);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: resolve(OUT, '16-map.png') });
  // The next island bounces, so Playwright never sees it "stable": tap it directly.
  await page.locator('.map-island[data-island="1-2"]').dispatchEvent('click');
  await page.waitForURL(/stage=1-2/, { timeout: 30_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-stage', '1-2', { timeout: 90_000 });
  await expect(page.locator('#title-screen')).toHaveCount(0);
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('ジャンプ');

  expect(errors).toEqual([]);
});
