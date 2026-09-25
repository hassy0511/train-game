import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

/** Taps through speech bubbles until the given element shows up. */
async function tapUntil(page: Page, selector: string, timeoutMs = 60_000): Promise<void> {
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

test('stage 1-1: title, opening, and a graded stop at the first station', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });

  await page.goto('/?stage=1-1');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#title-screen')).toBeVisible();
  await page.screenshot({ path: resolve(OUT, '10-title.png') });
  // The map from the title: a fresh save has only 1-1 open; 1-2 is locked and only wiggles.
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.map-island[data-island="1-1"]')).not.toHaveClass(/is-locked/);
  await expect(page.locator('.map-island[data-island="1-2"]')).toHaveClass(/is-locked/);
  await page.locator('.map-island[data-island="1-2"]').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.screenshot({ path: resolve(OUT, '10b-map.png') });
  await page.locator('#map-close').click();
  await expect(page.locator('#map')).toHaveCount(0);
  await page.locator('#title-start').click();

  // Opening: caption, partner lines with camera moves, the badge card, then the mission 1 card.
  await expect(page.locator('#caption')).toBeVisible();
  await page.locator('#caption').dispatchEvent('click');
  await expect(page.locator('#bubble')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: resolve(OUT, '11-opening.png') });
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('にゅうたい');
  await page.screenshot({ path: resolve(OUT, '11c-badge.png') });
  await page.locator('#card-button').click();
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('はじめての うんてん');
  await page.locator('#card-button').click();
  await expect(app).toHaveAttribute('data-phase', 'driving');

  // The stop gauge appears 150 m before the line; the camera button cycles views.
  await setNotch(page, 2);
  await expect(page.locator('#stop-gauge')).toBeVisible({ timeout: 60_000 });
  await page.locator('#camera').dispatchEvent('pointerdown');
  await expect(page.locator('#camera-menu')).toBeVisible();
  await page.screenshot({ path: resolve(OUT, '11a-camera-menu.png') });
  await page.locator('.camera-tile[data-mode="chase"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-camera', 'chase');
  await expect(page.locator('#camera-menu')).toBeHidden();
  await page.screenshot({ path: resolve(OUT, '11b-chase-gauge.png') });
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator('.camera-tile[data-mode="cab"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-camera', 'cab');

  // Stop with the train front on the line: station "sakura" stop line is at 155 m (front);
  // data-s is the lead car center (front - 6). Braking from 5 m/s takes ~4.2 m.
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.s) >= 155 - 6 - 4.5, null, {
    timeout: 90_000,
  });
  await setNotch(page, 1);

  const toast = page.locator('#toast');
  await expect(toast).toBeVisible({ timeout: 20_000 });
  const grade = await toast.textContent();
  expect(['ぴったり！', 'とまれた！']).toContain(grade);
  await page.screenshot({ path: resolve(OUT, '12-stopped.png') });

  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('できた！');
  await page.locator('#card-button').click();
  await expect(page.locator('#card')).toContainText('なかまを のせて');
  console.log(`smoke 1-1: stop grade=${grade}, s=${await app.getAttribute('data-s')}`);

  expect(errors).toEqual([]);
});
