import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

test('settings from the title gear, and the pause menu in play', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?stage=1-1');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });

  // Settings: quieter sounds, calm camera, lever on the right. Each tap applies and is saved at once.
  await page.locator('#title-settings').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('[data-setting="sound"][data-value="1"]').click();
  await page.locator('[data-setting="calm"][data-value="true"]').click();
  await page.locator('[data-setting="leftHanded"][data-value="true"]').click();
  await expect(page.locator('[data-setting="leftHanded"][data-value="true"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(app).toHaveClass(/is-left-handed/);
  await expect(app).toHaveAttribute('data-calm', '1');
  await page.screenshot({ path: resolve(OUT, '40-settings.png') });
  await page.locator('#settings-close').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.settings.v1') ?? '{}'));
  expect(saved).toEqual({ music: 2, sound: 1, calm: true, leftHanded: true });

  // Still there after a reload.
  await page.reload();
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(app).toHaveClass(/is-left-handed/);

  // Into the stage: the lever sits on the right, the buttons on the left.
  await page.locator('#title-start').click();
  const lever = await page.locator('#lever').boundingBox();
  const whistle = await page.locator('#whistle').boundingBox();
  expect(lever && whistle && lever.x > whistle.x).toBe(true);

  // Pause: game time stands still until "つづける".
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect(app).toHaveAttribute('data-paused', '1');
  const t0 = await app.getAttribute('data-time');
  await page.waitForTimeout(800);
  expect(await app.getAttribute('data-time')).toBe(t0);
  await page.screenshot({ path: resolve(OUT, '41-pause.png') });

  // "ちずに もどる" opens the map; "もどる" there brings the menu back.
  await page.locator('#pause-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.locator('#map-close').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.locator('#pause-resume').click();
  await expect(page.locator('#pause-menu')).toHaveCount(0);
  await expect(app).toHaveAttribute('data-paused', '0');
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) > Number(t) + 0.3, t0);
  await page.screenshot({ path: resolve(OUT, '42-left-handed.png') });

  expect(errors).toEqual([]);
});
