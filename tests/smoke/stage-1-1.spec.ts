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
  await page.locator('#title-start').click();

  // Opening: four partner lines, then the mission 1 card.
  await expect(page.locator('#bubble')).toBeVisible();
  await page.screenshot({ path: resolve(OUT, '11-opening.png') });
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('はじめての うんてん');
  await page.locator('#card-button').click();
  await expect(app).toHaveAttribute('data-phase', 'driving');

  // Drive slowly and stop just before the mark: station "sakura" is at 130 m.
  await setNotch(page, 1);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.s) >= 125, null, { timeout: 90_000 });
  await setNotch(page, 0);

  const toast = page.locator('#toast');
  await expect(toast).toBeVisible({ timeout: 20_000 });
  const grade = await toast.textContent();
  expect(['ぴったり！', 'とまれた！']).toContain(grade);
  await page.screenshot({ path: resolve(OUT, '12-stopped.png') });

  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('できた！');
  await page.locator('#card-button').click();
  await expect(page.locator('#card')).toContainText('おきゃくを のせて');
  console.log(`smoke 1-1: stop grade=${grade}, s=${await app.getAttribute('data-s')}`);

  expect(errors).toEqual([]);
});
