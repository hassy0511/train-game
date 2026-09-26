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
async function waitFor(page: Page, rail: string, s: number, timeoutMs = 240_000): Promise<void> {
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
    { timeout: 180_000 },
  );
}

async function camera(page: Page, mode: string): Promise<void> {
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator(`.camera-tile[data-mode="${mode}"]`).dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-camera', mode);
}

/**
 * Turns the light on or off and waits until it is: the button ignores taps for 0.4 s of game time after a toggle,
 * which on a slow machine can be longer than the test's own wait, so tap again until it takes.
 */
async function setLight(page: Page, on: boolean): Promise<void> {
  const light = page.locator('#light');
  const want = on ? '1' : '0';
  const deadline = Date.now() + 30_000;
  while ((await light.getAttribute('data-on')) !== want) {
    if (Date.now() > deadline) throw new Error(`light did not turn ${on ? 'on' : 'off'}`);
    await light.dispatchEvent('pointerdown');
    await page.waitForTimeout(400);
  }
}

async function bubbleSays(page: Page, text: string, timeoutMs = 60_000): Promise<void> {
  await expect(page.locator('#bubble')).toContainText(text, { timeout: timeoutMs });
}

test('stage 2-2 full run: grasshoppers, butterflies and flower bridges, the silk line', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Every line the bubble shows, in order (to check what was NOT said).
  await page.addInitScript(() => {
    const lines: string[] = [];
    (window as unknown as { __lines: string[] }).__lines = lines;
    new MutationObserver(() => {
      const line = document.getElementById('bubble')?.dataset.line;
      if (line && lines[lines.length - 1] !== line) lines.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-line'] });
  });
  const saidSoFar = () => page.evaluate(() => (window as unknown as { __lines: string[] }).__lines.join('\n'));

  await page.goto('/?stage=2-2');
  const app = page.locator('#app');
  const light = page.locator('#light');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-music', 'title');
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'meadow');

  // Opening: in the morning mist the shrinking device is switched on, and the grass grows up round the train.
  await tapUntil(page, '#bubble:has-text("スイッチ")', 90_000);
  await page.screenshot({ path: resolve(OUT, '70-mist.png') });
  await tapUntil(page, '#bubble:has-text("わわっ")', 90_000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '71-grown.png') });
  await card(page, 'バッタと');

  // M1: the first grasshopper hops on by itself; its jump clears the puddle at はやい.
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFor(page, 'main', 150);
  await expect(page.locator('#toast')).toContainText('たんぽぽ', { timeout: 60_000 });
  await jumpGap(page);
  expect(Number(await app.getAttribute('data-s'))).toBeGreaterThan(352 - FRONT);
  await expect(app).toHaveAttribute('data-hopper', 'batta-1', { timeout: 60_000 });
  await expect(page.locator('#jump')).toHaveAttribute('data-hopper', '1');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '72-hopper-peek.png') });
  await setNotch(page, FAST);
  await jumpGap(page, '73-hopper-jump.png');
  expect(Number(await app.getAttribute('data-s'))).toBeGreaterThan(560 - FRONT);
  await expect(app).toHaveAttribute('data-hopper', '', { timeout: 10_000 });
  console.log('2-2: grasshopper jump over the puddle');

  // The second one waits to be whistled for. Pass it by: no grasshopper, no jump over the pebble step.
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await expect(page.locator('#whistle')).not.toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await bubbleSays(page, 'バッタさんが いないと', 90_000);
  await waitRewound(page, 'main', 850);
  console.log('2-2: fell at the pebble step without the grasshopper, back before it');
  await waitDriving(page);
  await setNotch(page, FAST);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-hopper', 'batta-2', { timeout: 10_000 });
  await jumpGap(page);
  expect(Number(await app.getAttribute('data-s'))).toBeGreaterThan(890 - FRONT);
  await stopAt(page, 'main', 1070);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '2');
  await card(page, 'できた！');

  // M2: the butterfly waits for the light. Without it the stream has no bridge (ぽちゃん, back).
  await card(page, 'ちょうちょ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFor(page, 'main', 1190);
  await expect(light).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-butterfly', 'wait');
  await waitRewound(page, 'main', 1360);
  await expect(app).toHaveAttribute('data-bridges', '0,0,0');
  console.log('2-2: fell into the stream without the flower bridge');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await setLight(page, true);
  await expect(app).toHaveAttribute('data-butterfly', 'follow', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '74-butterfly.png') });
  // Light off: it waits where it is (and the light button glows); light on again: it follows again.
  await page.waitForTimeout(500);
  await setLight(page, false);
  await expect(app).toHaveAttribute('data-butterfly', 'hover', { timeout: 10_000 });
  await expect(light).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  await page.waitForTimeout(600);
  await setLight(page, true);
  await expect(app).toHaveAttribute('data-butterfly', 'follow', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-bridges', '1,0,0', { timeout: 240_000 });
  // Light on at ふつう is just right for a butterfly: it never got flustered.
  expect(await saidSoFar()).not.toContain('あわてる');
  await camera(page, 'chase');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: resolve(OUT, '75-flower-bridge.png') });
  await camera(page, 'cab');
  await waitFor(page, 'main', 1408);
  await expect(page.locator('#toast')).toContainText('よつば', { timeout: 60_000 });
  // The second butterfly follows at once (the light is still on) and opens the second bridge.
  await expect(app).toHaveAttribute('data-bridges', '1,1,0', { timeout: 240_000 });
  await waitFor(page, 'main', 1850);
  await setLight(page, false);
  await expect(light).toHaveAttribute('data-on', '0');
  await stopAt(page, 'main', 1960);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  await card(page, 'できた！');

  // M3: the silk line. A hanging silk bridge at ふつう shakes and bounces the train back (ぼよよーん).
  await card(page, 'くもの いと');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFor(page, 'silk', 90 - FRONT);
  await expect(app).toHaveAttribute('data-fragile', 'near', { timeout: 20_000 });
  await expect(page.locator('.lever-detent[data-notch="2"]')).toHaveAttribute('data-hint', '1');
  await expect(app).toHaveAttribute('data-fragile', 'shake', { timeout: 30_000 });
  await waitRewound(page, 'silk', 170);
  await expect(app).toHaveAttribute('data-bridges', '1,1,0');
  console.log('2-2: bounced back off the silk bridge at ふつう');
  await waitDriving(page);
  await setNotch(page, SLOW);
  await expect(app).toHaveAttribute('data-camera', 'side', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '76-silk-span.png') });
  await waitFor(page, 'silk', 225);
  await expect(page.locator('.lever-detent[data-notch="2"]')).not.toHaveAttribute('data-hint', '1');
  await expect(app).toHaveAttribute('data-camera', 'cab');
  await setNotch(page, NORMAL);

  // The reversed sign sends the train round the wrong thread: a loop back before the junction.
  await waitFor(page, 'loop', 30);
  await expect(app).toHaveAttribute('data-camera', 'top');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '77-loop-top.png') });
  await page.waitForFunction(() => {
    const el = document.getElementById('app');
    return el?.dataset.rail === 'silk' && Number(el?.dataset.s) < 450;
  }, null, { timeout: 180_000 });
  await expect(light).toHaveAttribute('data-glow', '1', { timeout: 20_000 });
  await setLight(page, true);
  await waitFor(page, 'silk', 470);
  console.log('2-2: back round the loop, the light showed the true thread');

  // The third butterfly follows at once (light on) and opens the bridge over the broken thread.
  await expect(app).toHaveAttribute('data-bridges', '1,1,1', { timeout: 240_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, '78-bridge3.png') });
  await waitFor(page, 'silk', 786);
  // With the light on, ふつう (7 m/s) is slow enough for the second silk bridge; the lever still shows ゆっくり.
  await waitFor(page, 'silk', 840);
  await expect(page.locator('.lever-detent[data-notch="2"]')).toHaveAttribute('data-hint', '1', { timeout: 30_000 });
  await waitFor(page, 'silk', 935);
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  await setLight(page, false);
  await stopAt(page, 'silk', 1020);
  await card(page, 'できた！');

  // Ending at the web made of rails, the clear card, the map.
  await tapUntil(page, '#bubble:has-text("せんろで できて")', 120_000);
  await page.screenshot({ path: resolve(OUT, '79-web.png') });
  await tapUntil(page, '#bubble:has-text("くもさん")', 60_000);
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '80-clear.png') });
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(progress.records).toEqual(expect.arrayContaining(['watage', 'yotsuba']));
  expect(progress.records).not.toContain('mizutamari');
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`2-2 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  expect(budget.draws).toBeLessThanOrEqual(200);
  expect(budget.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('[data-link="2-2>2-3"]')).toHaveClass(/is-laid/);
  await page.screenshot({ path: resolve(OUT, '81-map.png') });
  await page.locator('#map-close').click();
  await page.waitForURL((url) => !url.search.includes('stage=2-2'), { timeout: 30_000 });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  console.log('smoke 2-2 full: cleared');
  expect(errors).toEqual([]);
});
