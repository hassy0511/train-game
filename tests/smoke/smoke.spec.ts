import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const START_CENTER = 40 - 6; // stage 0-0 start.at is the train front; data-s is the lead car center

test('boots stage 0-0, drives for 5 s, passes the sensor, whistle cools down', async ({ page }) => {
  const logs: string[] = [];
  const errors: string[] = [];
  page.on('console', (m) => {
    logs.push(m.text());
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });

  await page.goto('/?stage=0-0');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#hud-speed')).toHaveText('とまる');
  // The test course has every ability: four round buttons at most, none on top of another (PHASE7 §1).
  const rounds = await page.locator('.round-button:visible').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  expect(rounds.map((r) => r.id).sort()).toEqual(['jump', 'light', 'rocket', 'whistle']);
  for (let i = 0; i < rounds.length; i++) {
    for (let j = i + 1; j < rounds.length; j++) {
      const a = rounds[i];
      const b = rounds[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  }
  await page.screenshot({ path: resolve(OUT, '00-start.png') });

  // Drag the lever knob up to the "ふつう" detent, the way a thumb would.
  const knob = page.locator('#lever-knob');
  const detent = page.locator('.lever-detent[data-notch="3"]');
  const kb = await knob.boundingBox();
  const db = await detent.boundingBox();
  if (!kb || !db) throw new Error('lever not laid out');
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, db.y, { steps: 12 });
  await page.mouse.up();
  await expect(app).toHaveAttribute('data-notch', '3');
  await expect(page.locator('#hud-speed')).toHaveText('ふつう');
  const t0 = Number(await app.getAttribute('data-time'));

  // Wait for 5 s of simulated time after the lever moved (software rendering may run below real time).
  await page.waitForFunction((until) => Number(document.getElementById('app')?.dataset.time) >= until, t0 + 5, {
    timeout: 60_000,
  });
  const s = Number(await app.getAttribute('data-s'));
  expect(s - START_CENTER).toBeGreaterThanOrEqual(20);
  expect(logs.some((l) => l.includes('sensor: sensor-1 enter'))).toBe(true);

  const whistle = page.locator('#whistle');
  await whistle.dispatchEvent('pointerdown');
  await expect(whistle).toHaveAttribute('data-cooldown', '1');

  await page.screenshot({ path: resolve(OUT, '01-after-5s.png') });
  console.log(`smoke: s=${s.toFixed(1)} m, fps=${await app.getAttribute('data-fps')}`);

  expect(errors).toEqual([]);
});

test('junction: tapping the right arrow switches to the branch and the train stops at the buffer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?stage=0-0');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });

  // Tap the "はやい" detent label directly (the lever also accepts taps).
  const detent = page.locator('.lever-detent[data-notch="4"]');
  const db = await detent.boundingBox();
  if (!db) throw new Error('lever not laid out');
  await page.mouse.click(db.x + 30, db.y);
  await expect(app).toHaveAttribute('data-notch', '4');

  const junction = page.locator('#junction');
  await expect(junction).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.arrow[data-side="left"]')).toHaveClass(/is-default/);
  await page.screenshot({ path: resolve(OUT, '02-junction.png') });

  await page.locator('.arrow[data-side="right"]').dispatchEvent('pointerdown');
  await expect(page.locator('.arrow[data-side="right"]')).toHaveClass(/is-selected/);
  await expect(app).toHaveAttribute('data-rail', 'branch', { timeout: 60_000 });
  await expect(junction).toBeHidden();

  await expect(page.locator('#end-overlay')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#hud-speed')).toHaveText('とまる');
  await page.screenshot({ path: resolve(OUT, '03-end-of-line.png') });
  console.log(`smoke: stopped at s=${await app.getAttribute('data-s')} m on ${await app.getAttribute('data-rail')}`);

  expect(errors).toEqual([]);
});

/** Lead car center (data-s) to train front. */
const FRONT = 6;

async function tapNotch(page: Page, notch: number): Promise<void> {
  const db = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!db) throw new Error('lever not laid out');
  await page.mouse.click(db.x + 30, db.y);
}

async function waitFront(page: Page, at: number): Promise<void> {
  await page.waitForFunction((s) => Number(document.getElementById('app')?.dataset.s) >= s, at - FRONT, { timeout: 90_000 });
}

test('2-3 on the test course: the rocket, an uphill, a slide and a quiet zone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const app = page.locator('#app');
  const rocket = page.locator('#rocket');

  // The layout with the lever on the left, then on the right (PHASE7 §1): four round buttons, the camera in the corner.
  for (const leftHanded of [true, false]) {
    await page.goto('/?stage=0-0');
    await page.evaluate((lh) => {
      localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: lh }));
    }, leftHanded);
    await page.goto('/?stage=0-0');
    await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
    await expect(rocket).toBeVisible();
    await expect(app).toHaveAttribute('data-has-rocket', '1');
    await page.screenshot({ path: resolve(OUT, leftHanded ? '00-start-lever-right.png' : '00-start-lever-left.png') });
  }

  // Uphill (main 240-310) without the rocket: the train slips and is put back before the slope, flames full.
  await tapNotch(page, 4);
  await expect(app).toHaveAttribute('data-notch', '4');
  await expect(app).toHaveAttribute('data-slip', '1', { timeout: 90_000 });
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.slip === '0' && Number(d.s) < 200;
  }, undefined, { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-rocket-pips', '3');

  // Again: the button glows before the slope; pressed, it burns and the lever stays put.
  await tapNotch(page, 4);
  await expect(app).toHaveAttribute('data-notch', '4');
  await expect(rocket).toHaveAttribute('data-glow', '1', { timeout: 90_000 });
  await rocket.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-burn', '1');
  await expect(app).toHaveAttribute('data-rocket-pips', '2');
  await tapNotch(page, 1);
  await expect(app).toHaveAttribute('data-notch', '4');
  await page.screenshot({ path: resolve(OUT, '04-rocket.png') });
  await waitFront(page, 312);
  await expect(app).toHaveAttribute('data-slip', '0');

  // The slide (main 350-410): the lever does nothing there.
  await expect(app).toHaveAttribute('data-slope', 'down', { timeout: 60_000 });
  await tapNotch(page, 1);
  await expect(app).toHaveAttribute('data-notch', '4');
  await page.screenshot({ path: resolve(OUT, '05-slide.png') });

  // The quiet zone (main 450-520): a press does not fire and keeps the flames.
  await waitFront(page, 455);
  await expect(rocket).toHaveAttribute('data-why', 'zone');
  await rocket.dispatchEvent('pointerdown');
  const t0 = Number(await app.getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + 1, { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-burn', '0');
  await expect(app).toHaveAttribute('data-rocket-pips', '2');

  expect(errors).toEqual([]);
});
