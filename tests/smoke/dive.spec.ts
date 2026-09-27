import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v1.10 diving ("もぐる", PHASE8 §0.2 and part 2 §2) on the test course 0-0: from the branch a way turns off to a
 * pond. On the pond's surface rail the jump seat is "もぐる": each press dives under the floating log; forgetting
 * it is a soft "ぽよん" and the train is put back. A dive fork (a ring, no arrows) takes a diving train down a short
 * seabed loop (the dome on under water, a record found there) and any other train on along the surface.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

/** Lead car center (data-s) to train front. */
const FRONT = 6;

async function tapNotch(page: Page, notch: number): Promise<void> {
  const db = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!db) throw new Error('lever not laid out');
  await page.mouse.click(db.x + 30, db.y);
  await expect(page.locator('#app')).toHaveAttribute('data-notch', String(notch));
}

/** Waits until the train front is at least at `at` on `railId`. */
async function waitFront(page: Page, railId: string, at: number, timeout = 90_000): Promise<void> {
  await page.waitForFunction(
    ([rail, s]) => {
      const d = document.getElementById('app')?.dataset;
      return d?.rail === rail && Number(d.s) >= s;
    },
    [railId, at - FRONT] as const,
    { timeout },
  );
}

async function waitTime(page: Page, seconds: number): Promise<void> {
  const t0 = Number(await page.locator('#app').getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + seconds, { timeout: 60_000 });
}

async function camera(page: Page, mode: 'cab' | 'chase' | 'side' | 'top'): Promise<void> {
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator(`.camera-tile[data-mode="${mode}"]`).dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-camera', mode);
}

/** From the start: right at j1 onto the branch, then left onto the pond rail, at `notch`. */
async function toThePond(page: Page, notch: number): Promise<void> {
  const app = page.locator('#app');
  await tapNotch(page, notch);
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('.arrow[data-side="right"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'branch', { timeout: 60_000 });
  // The way to the pond (branch 130, on the left).
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.s) > 80, undefined, { timeout: 60_000 });
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('.arrow[data-side="left"]').dispatchEvent('pointerdown');
  await expect(page.locator('.arrow[data-side="left"]')).toHaveClass(/is-selected/);
  await expect(app).toHaveAttribute('data-rail', 'pond', { timeout: 60_000 });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('the seat turns into もぐる near water; forgetting to dive under the log is ぽよん, diving passes under it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const app = page.locator('#app');
  const seat = page.locator('#jump');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(seat).toHaveAttribute('data-mode', 'jump');

  await toThePond(page, 4);
  // 80 m before the water the jump seat is "もぐる" (blue), still one of four round buttons, none on another.
  await expect(seat).toHaveAttribute('data-mode', 'dive', { timeout: 30_000 });
  await expect(seat).toHaveAttribute('aria-label', 'もぐる');
  await expect(app).toHaveAttribute('data-dive', 'near');
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
  await page.screenshot({ path: resolve(OUT, 'dive-button.png') });

  // Not pressed: the log (pond 150) bounces the train back softly; it never goes under water, and is put back
  // 60 m before the log (front at 90), the seat still "もぐる".
  await expect(app).toHaveAttribute('data-dive-bounces', '1', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-submerged', '0');
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.rail === 'pond' && Math.abs(Number(d.s) + 6 - 90) < 1 && d.speed === '0.0';
  }, undefined, { timeout: 30_000 });
  await expect(seat).toHaveAttribute('data-mode', 'dive');
  await page.screenshot({ path: resolve(OUT, 'dive-bounced.png') });

  // Again at "ふつう": the seat glows when a dive now passes under the log; pressed, the dome goes on.
  await tapNotch(page, 3);
  await expect(seat).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await seat.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-dive', 'on');
  await expect(app).toHaveAttribute('data-dives', '1');
  // Mashing while the front is in its dive does nothing more.
  for (let i = 0; i < 10; i++) await seat.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-dives', '1');
  await expect(app).toHaveAttribute('data-underwater', '1', { timeout: 10_000 });
  await page.screenshot({ path: resolve(OUT, 'dive-cab-log.png') });
  await waitFront(page, 'pond', 175);
  await expect(app).toHaveAttribute('data-dive-bounces', '1');
  // Up again ("ぷかっ"): the dome goes when the last car is up, and a press 0.6 s later dives again, harmlessly.
  await expect(app).toHaveAttribute('data-dive', 'near', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-underwater', '0');
  await waitTime(page, 0.7);
  await seat.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-dives', '2');
  await camera(page, 'chase');
  await waitTime(page, 0.6);
  await page.screenshot({ path: resolve(OUT, 'dive-chase-quick.png') });
  expect(errors).toEqual([]);
});

test('dive fork: on along the surface without diving; diving, down the seabed loop under the dome, the record, ぷはっ', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const app = page.locator('#app');
  const seat = page.locator('#jump');

  // Not diving at the ring: the train simply runs on along the surface (no fail).
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await toThePond(page, 3);
  await expect(seat).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await seat.dispatchEvent('pointerdown');
  await waitFront(page, 'pond', 175);
  await waitFront(page, 'pond', 245);
  await expect(app).toHaveAttribute('data-rail', 'pond');
  await expect(app).toHaveAttribute('data-dive-bounces', '0');
  await camera(page, 'chase');
  await page.screenshot({ path: resolve(OUT, 'dive-fork-surface.png') });

  // Diving at the ring: down the seabed loop.
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await toThePond(page, 3);
  await expect(seat).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await seat.dispatchEvent('pointerdown');
  await waitFront(page, 'pond', 180);
  // The seat glows again just before the ring (a dive now is still going on there).
  await expect(seat).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  const s = Number(await app.getAttribute('data-s')) + FRONT;
  expect(s).toBeGreaterThan(205);
  await seat.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'deep', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-dive', 'on');
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-underwater', '1');
  // On the seabed the dome stays on; a press only bobs the train (no rule).
  const bobs = Number((await app.getAttribute('data-bobs')) ?? 0);
  await seat.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-bobs', String(bobs + 1));
  await expect(app).toHaveAttribute('data-records', /pond-feather/, { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, 'dive-cab.png') });
  await camera(page, 'chase');
  await waitTime(page, 0.8);
  await expect(app).toHaveAttribute('data-underwater', '1');
  await page.screenshot({ path: resolve(OUT, 'dive-chase.png') });
  await camera(page, 'top');
  await waitTime(page, 0.8);
  await page.screenshot({ path: resolve(OUT, 'dive-top.png') });
  await camera(page, 'side');
  await waitTime(page, 0.8);
  await page.screenshot({ path: resolve(OUT, 'dive-side.png') });
  // Up the far side: the last car out of the water, the dome off ("ぷはっ"), then back onto the pond rail.
  await expect(app).toHaveAttribute('data-submerged', '0', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-dive', /^(near|)$/, { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-rail', 'pond', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-dive-bounces', '0');
  const load = await app.evaluate((el) => ({ draws: Number(el.dataset.drawsMax), tris: Number(el.dataset.trisMax) }));
  console.log(`dive: heaviest frame ${load.draws} draws, ${load.tris} triangles`);
  expect(load.draws).toBeLessThanOrEqual(200);
  expect(load.tris).toBeLessThanOrEqual(100_000);
  expect(errors).toEqual([]);
});
