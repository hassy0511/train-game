import { expect, test, type Page } from '@playwright/test';
import { card, FRONT, NORMAL, pressOnGlowBefore, setNotch, waitDriving, waitFront } from './drive';

/**
 * PR7「車両の 置き方と 通った 道」(PHASE9_CHAPTER5_6 第 3 部 A5): the cars sit along the trail the train came by
 * (src/train/consist.ts), and jump arcs are kept by trail distance, so every car rides them where the lead car did.
 * - On 0-0's straight the first two cars are 12.5 m apart (#app[data-car-gap]).
 * - 1-3 M3: over the updraft's gap on `wind` (a junction behind, a merge ahead) no car behind is higher or lower than
 *   the lead car was at the same trail distance (#app[data-car-lift-err] ≤ 0.05 m, kept every frame in the page).
 */

interface LiftLog {
  maxErr: number;
  at: string;
  inAir: number;
}

/** Keeps the largest data-car-lift-err (and where) from when the train is on `from` on (window.__lift). */
async function recordLift(page: Page, from: string): Promise<void> {
  await page.addInitScript((rail) => {
    const log = { maxErr: 0, at: '', inAir: 0 };
    (window as unknown as { __lift: typeof log }).__lift = log;
    let on = false;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d) return;
      if (d.rail === rail) on = true;
      if (!on) return;
      const err = Number(d.carLiftErr ?? 0);
      if (d.air === '1') log.inAir += 1;
      if (err > log.maxErr) {
        log.maxErr = err;
        log.at = `${d.rail} ${(Number(d.s) + 6).toFixed(1)} air ${d.air}`;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-car-lift-err', 'data-s'] });
  }, from);
}

test('0-0: the cars 12.5 m apart on the straight', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?stage=0-0');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  // Standing at the start (the trail traced back from the start): already 12.5 m.
  expect(Math.abs(Number(await app.getAttribute('data-car-gap')) - 12.5)).toBeLessThanOrEqual(0.05);
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 80);
  // Read in the page while the whole train is on the straight (main 0–120).
  const seen = await page.waitForFunction(
    () => {
      const d = document.getElementById('app')?.dataset;
      if (!d || d.rail !== 'main') return false;
      const front = Number(d.s) + 6;
      if (front < 80 || front > 115) return false;
      return { gap: Number(d.carGap), err: Number(d.carLiftErr), front };
    },
    null,
    { timeout: 60_000, polling: 'raf' },
  );
  const v = (await seen.jsonValue()) as { gap: number; err: number; front: number };
  console.log(`0-0 straight: car gap ${v.gap} m, lift err ${v.err} m at front ${v.front.toFixed(1)}`);
  expect(Math.abs(v.gap - 12.5)).toBeLessThanOrEqual(0.05);
  expect(v.err).toBeLessThanOrEqual(0.05);
  expect(errors).toEqual([]);
});

test('1-3 M3: over the updraft gap every car rides the lead car arc', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'train-game.progress.v1',
      JSON.stringify({ schema: 1, cleared: ['1-1', '1-2'], abilities: ['whistle', 'jump', 'light'], records: [], mapLinks: ['1-1>1-2', '1-2>1-3'], resume: { stage: '1-3', mission: 2 } }),
    );
  });
  await recordLift(page, 'wind');
  const app = page.locator('#app');
  await page.goto('/?stage=1-3&go=1&resume=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'かぜに', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The right arrow at kaze-michi (main2 80): onto `wind`, tapped in the page the moment it shows.
  const tapped = await page.waitForFunction(
    () => {
      const box = document.getElementById('junction');
      const b = box?.querySelector<HTMLElement>('.arrow[data-side="right"]');
      if (!box || box.hidden || !b || b.hidden) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    null,
    { timeout: 120_000, polling: 'raf' },
  );
  expect(await tapped.jsonValue()).toBe(true);
  await expect(app).toHaveAttribute('data-rail', 'wind', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-updraft', '1', { timeout: 60_000 });
  await pressOnGlowBefore(page, 'jump', 'wind', 122);
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 10_000 });
  // On past the landing and the merge into main2 (280), until the last car is on main2 too.
  await waitFront(page, 'main2', 280 + 37 + FRONT, 180_000);
  const log = await page.evaluate(() => (window as unknown as { __lift: LiftLog }).__lift);
  console.log(`1-3 updraft: max car lift err ${log.maxErr.toFixed(3)} m (${log.at}); ${log.inAir} frames in the air`);
  expect(log.inAir).toBeGreaterThan(0);
  expect(log.maxErr).toBeLessThanOrEqual(0.05);
  expect(errors).toEqual([]);
});
