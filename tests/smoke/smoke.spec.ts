import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const START_AT = 6; // stage 0-0 start.at

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
  await page.screenshot({ path: resolve(OUT, '00-start.png') });

  // Drag the lever knob up to the "ふつう" detent, the way a thumb would.
  const knob = page.locator('#lever-knob');
  const detent = page.locator('.lever-detent[data-notch="2"]');
  const kb = await knob.boundingBox();
  const db = await detent.boundingBox();
  if (!kb || !db) throw new Error('lever not laid out');
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, db.y, { steps: 12 });
  await page.mouse.up();
  await expect(app).toHaveAttribute('data-notch', '2');
  await expect(page.locator('#hud-speed')).toHaveText('ふつう');
  const t0 = Number(await app.getAttribute('data-time'));

  // Wait for 5 s of simulated time after the lever moved (software rendering may run below real time).
  await page.waitForFunction((until) => Number(document.getElementById('app')?.dataset.time) >= until, t0 + 5, {
    timeout: 60_000,
  });
  const s = Number(await app.getAttribute('data-s'));
  expect(s - START_AT).toBeGreaterThanOrEqual(20);
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
  const detent = page.locator('.lever-detent[data-notch="3"]');
  const db = await detent.boundingBox();
  if (!db) throw new Error('lever not laid out');
  await page.mouse.click(db.x + 30, db.y);
  await expect(app).toHaveAttribute('data-notch', '3');

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
