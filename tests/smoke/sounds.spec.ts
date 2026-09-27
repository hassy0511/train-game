import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The sounds page (sounds.html): every effect has a button and plays without errors, and rendered offline each
 * one is heard (not silent) and does not clip. The running sound clicks over rail joints at "びゅーん" on every
 * kind of track.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

interface Measure {
  id: string;
  peak: number;
  rms: number;
  joints?: number;
}

test('sounds page: every effect plays, is heard and does not clip; the running sound on each track', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/sounds.html');
  await expect(page.locator('#build')).toContainText('build');
  const effects = page.locator('button[data-sound]');
  expect(await effects.count()).toBeGreaterThanOrEqual(30);
  // A few taps: the lever up, a track, an effect.
  await page.locator('button[data-notch="5"]').click();
  await page.locator('button[data-surface="wood"]').click();
  await page.locator('button[data-sound="whistle"]').click();
  await expect.poll(async () => Number(await page.locator('body').getAttribute('data-joints')), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: resolve(OUT, '95-sounds-page.png'), fullPage: true });

  const measured = await page.evaluate(() => (window as unknown as { __measure: () => Promise<Measure[]> }).__measure());
  for (const m of measured) console.log(`sound ${m.id}: peak ${m.peak.toFixed(3)}, rms ${m.rms.toFixed(4)}${m.joints ? `, joints ${m.joints}` : ''}`);
  for (const m of measured) {
    expect(m.peak, `${m.id} clips`).toBeLessThan(0.98);
    expect(m.rms, `${m.id} is silent`).toBeGreaterThan(0.001);
  }
  const runs = measured.filter((m) => m.id.startsWith('run-'));
  expect(runs.map((m) => m.id)).toEqual(['run-rail', 'run-bridge', 'run-wood', 'run-silk', 'run-soft', 'run-rocket']);
  // 4 s at 22 m/s from half a joint: 88 m, a joint every 12 m.
  for (const m of runs) expect(m.joints).toBe(7);
  // Silk and petals are hushed; the bridge rings louder than plain rail.
  const rms = Object.fromEntries(runs.map((m) => [m.id, m.rms]));
  expect(rms['run-silk']).toBeLessThan(rms['run-rail'] * 0.7);
  expect(rms['run-bridge']).toBeGreaterThan(rms['run-rail']);
  // The rocket's roar is heard over the rails.
  expect(rms['run-rocket']).toBeGreaterThan(rms['run-rail'] * 1.2);
  // Each island's ambience is there, and well under the running train.
  const around = measured.filter((m) => m.id.startsWith('ambience-'));
  expect(around.map((m) => m.id)).toEqual(['ambience-town', 'ambience-valley', 'ambience-sky', 'ambience-forest', 'ambience-meadow', 'ambience-sea']);
  for (const m of around) expect(m.rms, `${m.id} too loud`).toBeLessThan(rms['run-rail'] * 0.6);
  await page.locator('button[data-ambience="forest"]').click();
  await expect(page.locator('button[data-ambience="forest"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
