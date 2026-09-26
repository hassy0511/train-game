import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const FRONT = 6; // data-s is the lead car center; stations and gaps are measured at the front
const STOP = 1;
const SLOW = 2; // ゆっくり 5 m/s
const NORMAL = 3; // ふつう 10 m/s
const FAST = 4; // はやい 15 m/s
const MAX = 5; // びゅーん 22 m/s

async function tapUntil(page: Page, selector: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const target = page.locator(selector);
  while (Date.now() < deadline) {
    if (await target.isVisible()) return;
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
  const detent = page.locator(`.lever-detent[data-notch="${notch}"]`);
  const box = await detent.boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
  await expect(page.locator('#app')).toHaveAttribute('data-notch', String(notch));
}

async function waitForS(page: Page, s: number, timeoutMs = 120_000): Promise<void> {
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.s) >= t, s, { timeout: timeoutMs });
}

async function waitStopped(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getElementById('app')?.dataset.speed === '0.0', null, { timeout: 30_000 });
}

/** After a fail the bubbles play, the screen fades and the train is put back; wait until driving again. */
async function waitDriving(page: Page): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await page.locator('#app').getAttribute('data-phase')) === 'driving') return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  throw new Error('not driving again');
}

/** Waits for the jump button to glow (jumping now clears the gap), presses it, waits for the landing. */
async function jumpGap(page: Page, shot?: string): Promise<void> {
  const jump = page.locator('#jump');
  await expect(jump).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await jump.dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-air', '1', { timeout: 5_000 });
  if (shot) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(OUT, shot) });
  }
  await expect(page.locator('#app')).toHaveAttribute('data-air', '0', { timeout: 30_000 });
}

/** Slows to ゆっくり and stops with the front at the station line `at`. */
async function stopAt(page: Page, at: number, slowFrom = 55, brake = 4.5): Promise<void> {
  await waitForS(page, at - FRONT - slowFrom);
  await setNotch(page, SLOW);
  await waitForS(page, at - FRONT - brake);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

/** Taps through the partner's bubbles until one says `text`. */
async function waitLine(page: Page, text: string, timeoutMs = 20_000): Promise<void> {
  const bubble = page.locator('#bubble');
  const deadline = Date.now() + timeoutMs;
  while (!((await bubble.getAttribute('data-line')) ?? '').includes(text)) {
    if (Date.now() > deadline) throw new Error(`no line "${text}"`);
    if (await bubble.isVisible()) await bubble.dispatchEvent('pointerdown');
    await page.waitForTimeout(120);
  }
}

/** M1 of 1-2 without the fall: the three gaps at ふつう, はやい, びゅーん, then the stop at きょうりゅうえき. */
async function missionOne(page: Page): Promise<void> {
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await jumpGap(page);
  await setNotch(page, FAST);
  await jumpGap(page);
  await setNotch(page, MAX);
  await jumpGap(page);
  await setNotch(page, SLOW);
  await stopAt(page, 560, 40);
  await card(page, 'できた！');
}

test('stage 1-2 full run: jumps, a fall, dinosaurs, a dead end, the light, records', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?stage=1-2');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#jump')).toBeHidden(); // not learned yet
  await page.locator('#title-start').click();
  await card(page, 'ジャンプ'); // learned in the opening
  await expect(page.locator('#jump')).toBeVisible();
  await card(page, 'とびこえろ');

  // M1. First, no jump: the train drops into the 10 m gap at 150 and comes back 80 m before it.
  await expect(page.locator('#jump')).toHaveAttribute('data-idle', '1');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitForS(page, 150 - FRONT + 2);
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '20-fall.png') });
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.s) < 80, null, { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-notch', String(STOP));
  console.log('1-2: fell and came back');

  // Then the three gaps at the notch the partner names: ふつう, はやい, びゅーん.
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await jumpGap(page, '21-jump-normal.png');
  await setNotch(page, FAST);
  await jumpGap(page);
  await setNotch(page, MAX);
  await jumpGap(page, '22-jump-max.png');
  expect(Number(await app.getAttribute('data-s'))).toBeGreaterThan(458 - FRONT);
  await setNotch(page, SLOW);
  await stopAt(page, 560, 40);
  await card(page, 'できた！');

  // M2: whistle the sleeping one awake, let the young one cross, pass under the big one's neck.
  await card(page, 'ねぼすけ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitForS(page, 680 - FRONT - 52);
  await page.locator('#whistle').dispatchEvent('pointerdown');
  // v1.8: the side track up the cliff (junction at 695) needs the rocket: its arrow is grey with the rocket's
  // picture, tapping it chooses nothing and the partner says so; the train stays on the main line.
  const spurArrow = page.locator('#junction .arrow[data-side="right"]');
  await expect(spurArrow).toBeVisible({ timeout: 30_000 });
  await expect(spurArrow).toHaveAttribute('data-needs', 'rocket');
  await expect(spurArrow).toHaveAttribute('data-locked', '1');
  await spurArrow.dispatchEvent('pointerdown');
  await expect(spurArrow).not.toHaveClass(/is-selected/);
  await waitLine(page, 'ロケットが あれば');
  await page.screenshot({ path: resolve(OUT, '23a-rocket-junction.png') });
  await waitForS(page, 700);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // The big one straddles the rail at 880; its head hangs ~14 m before that and the gate is 20 m.
  await waitForS(page, 880 - FRONT - 70);
  await setNotch(page, SLOW);
  await waitForS(page, 880 - FRONT - 30);
  await setNotch(page, STOP);
  await waitStopped(page);
  await page.screenshot({ path: resolve(OUT, '23-big-dino.png') });
  // Go the moment the neck comes up.
  await page.waitForFunction(() => document.getElementById('app')?.dataset.neck === '1', null, { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById('app')?.dataset.neck === '0', null, { timeout: 20_000 });
  await setNotch(page, NORMAL);
  await waitForS(page, 880 + 10);
  await stopAt(page, 980);
  await card(page, 'できた！');
  await card(page, 'ライト'); // learned after M2
  await expect(page.locator('#light')).toBeVisible();

  // M3: without the light the reversed sign sends the train into a dead end.
  await card(page, 'あべこべ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-rail', 'dead-a', { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('app');
      return el?.dataset.rail === 'main' && Number(el?.dataset.s) < 1000;
    },
    null,
    { timeout: 60_000 },
  );
  console.log('1-2: dead end and back');
  // With the light on, the true way lights up and becomes the route.
  await waitDriving(page);
  await page.locator('#light').dispatchEvent('pointerdown');
  await expect(page.locator('#light')).toHaveAttribute('data-on', '1');
  await setNotch(page, NORMAL);
  await waitForS(page, 1080 - FRONT - 30);
  await page.screenshot({ path: resolve(OUT, '24-sign-light.png') });
  await waitForS(page, 1230);
  await expect(app).toHaveAttribute('data-rail', 'main');
  await stopAt(page, 1360, 40, 2);
  await card(page, 'できた！');

  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '25-clear.png') });
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(progress.abilities).toEqual(expect.arrayContaining(['jump', 'light']));
  expect(progress.records).toEqual(expect.arrayContaining(['dino-egg', 'footprints']));
  // Rendering budget (TECH_SPEC §6): the heaviest frame of the whole run.
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`1-2 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  expect(budget.draws).toBeLessThanOrEqual(200);
  expect(budget.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  // The map: records 2 of 3 here (the third needs a later ability), and on to 1-3.
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.map-island[data-island="1-2"] .map-badge')).toHaveText('きろく 2/3 ？');
  // The next island bounces, so Playwright never sees it "stable": tap it directly.
  await page.locator('.map-island[data-island="1-3"]').dispatchEvent('click');
  await page.waitForURL(/stage=1-3/, { timeout: 30_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(saved.cleared).toContain('1-2');
  console.log('smoke 1-2 full: cleared');

  expect(errors).toEqual([]);
});

test('stage 1-2 again with the rocket: up the cliff side track to the empty nest', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // Back from 2-3 with the rocket (the jump and the light come again in this stage's own story).
  await page.addInitScript(() => {
    const key = 'train-game.progress.v1';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: ['1-1'], abilities: ['whistle', 'rocket'], records: [], mapLinks: ['1-1>1-2'] }));
    }
  });
  await page.goto('/?stage=1-2');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  // The driving controls wait under the title; once it is gone the rocket is there (inherited from 2-3).
  await expect(page.locator('#rocket')).toBeVisible();
  await card(page, 'ジャンプ');
  await card(page, 'とびこえろ');
  await missionOne(page);
  await card(page, 'ねぼすけ');

  // First try: take the side track but never press the rocket. The train slips back down the steep bit and is put
  // back on the main line just past the sleeping one (front 686, 9 m before the junction), which stays awake and
  // aside: no second whistle.
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitForS(page, 680 - FRONT - 52);
  await page.locator('#whistle').dispatchEvent('pointerdown');
  const spurArrow = page.locator('#junction .arrow[data-side="right"]');
  await expect(spurArrow).toBeVisible({ timeout: 30_000 });
  await expect(spurArrow).toHaveAttribute('data-needs', 'rocket');
  await expect(spurArrow).toHaveAttribute('data-locked', '0');
  await spurArrow.dispatchEvent('pointerdown');
  await expect(spurArrow).toHaveClass(/is-selected/);
  await expect(app).toHaveAttribute('data-rail', 'gake', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-slip', '1', { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('app');
      return el?.dataset.rail === 'main' && Math.abs(Number(el?.dataset.s) - (686 - 6)) < 1;
    },
    null,
    { timeout: 60_000 },
  );
  await waitDriving(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '25b-cliff-slip-back.png') });
  console.log('1-2 rocket: slipped on the cliff, back just past the sleeping one, before the junction');

  // Second try, from a standstill: pick the side track, then びゅーん, and fire the rocket the moment the train is on
  // the side track. The burn and the push are over before the nest (about gake 102 of the 145.5 to find it from
  // 120.5), yet the train makes it over the top: the nest must still be found (the rocket fired on this rail).
  await expect(spurArrow).toBeVisible({ timeout: 10_000 });
  await expect(spurArrow).toHaveAttribute('data-locked', '0');
  await spurArrow.dispatchEvent('pointerdown');
  await expect(spurArrow).toHaveClass(/is-selected/);
  await setNotch(page, MAX);
  await expect(app).toHaveAttribute('data-rail', 'gake', { timeout: 30_000 });
  const rocket = page.locator('#rocket');
  await rocket.dispatchEvent('pointerdown');
  const firedAt = Number(await app.getAttribute('data-s'));
  console.log(`1-2 rocket: fired at gake ${firedAt.toFixed(1)} (car centre)`);
  await expect(app).toHaveAttribute('data-burn', '1', { timeout: 5_000 });
  // Later than that the push would still be in the speed at the nest, and this would not test the rule.
  expect(firedAt).toBeLessThan(9);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, '26-cliff-rocket.png') });
  await page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}').records ?? []).includes('cliff-nest'),
    null,
    { timeout: 30_000 },
  );
  const foundAt = Number(await app.getAttribute('data-s'));
  const pushAtFind = await app.getAttribute('data-push');
  console.log(`1-2 rocket: found the nest at gake ${foundAt.toFixed(1)} (push still in the speed: ${pushAtFind})`);
  expect(pushAtFind).toBe('0');
  await page.screenshot({ path: resolve(OUT, '27-cliff-nest.png') });
  await waitLine(page, 'もとの みちに', 60_000);
  await page.waitForFunction(
    () => {
      const el = document.getElementById('app');
      return el?.dataset.rail === 'main' && Math.abs(Number(el?.dataset.s) - (725 - 6)) < 3;
    },
    null,
    { timeout: 60_000 },
  );
  await waitDriving(page);
  await page.screenshot({ path: resolve(OUT, '28-cliff-back.png') });
  console.log('1-2 rocket: back on the main line past the junction');
  expect(errors).toEqual([]);
});
