import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v1.10 diving ("もぐる", PHASE8 §0.2 and part 2 §2, PHASE9_0) on the test course 0-0: from the branch a way turns off to a
 * pond. "もぐる" is its own button (#dive): on the pond's surface rail each press dives under the floating log; forgetting
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

test('the もぐる button glows near water; forgetting to dive under the log is ぽよん, diving passes under it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const app = page.locator('#app');
  const diveButton = page.locator('#dive');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  // Its own button from the start (PHASE9_0): no seat that changes face; the jump stays the jump.
  await expect(diveButton).toBeVisible();
  await expect(diveButton).toHaveAttribute('data-glow', '0');
  await expect(page.locator('#jump')).toBeVisible();
  await expect(page.locator('#jump')).toHaveAttribute('aria-label', 'ジャンプ');
  await expect(app).toHaveAttribute('data-dive', '');

  await toThePond(page, 4);
  // 80 m before the water the hint starts (data-dive "near"); the button keeps its face and is one of six round buttons.
  await expect(app).toHaveAttribute('data-dive', 'near', { timeout: 30_000 });
  await expect(diveButton).toHaveAttribute('aria-label', 'もぐる');
  await expect(page.locator('#jump')).toHaveAttribute('aria-label', 'ジャンプ');
  const rounds = await page.locator('.round-button:visible').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: Math.min(r.width, r.height) / 2 };
    }),
  );
  expect(rounds.map((r) => r.id).sort()).toEqual(['dive', 'jump', 'light', 'plow', 'rocket', 'whistle']);
  for (let i = 0; i < rounds.length; i++) {
    for (let j = i + 1; j < rounds.length; j++) {
      const a = rounds[i];
      const b = rounds[j];
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(a.r + b.r);
    }
  }
  await page.screenshot({ path: resolve(OUT, 'dive-button.png') });

  // Not pressed: the log (pond 150) bounces the train back softly; it never goes under water, and is put back
  // 60 m before the log (front at 90), the button still hinting.
  await expect(app).toHaveAttribute('data-dive-bounces', '1', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-submerged', '0');
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.rail === 'pond' && Math.abs(Number(d.s) + 6 - 90) < 1 && d.speed === '0.0';
  }, undefined, { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-dive', 'near');
  await page.screenshot({ path: resolve(OUT, 'dive-bounced.png') });

  // Again at "ふつう": the button glows when a dive now passes under the log; pressed, the dome goes on.
  await tapNotch(page, 3);
  await expect(diveButton).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await diveButton.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-dive', 'on');
  await expect(app).toHaveAttribute('data-dives', '1');
  // Mashing while the front is in its dive does nothing more.
  for (let i = 0; i < 10; i++) await diveButton.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-dives', '1');
  await expect(app).toHaveAttribute('data-underwater', '1', { timeout: 10_000 });
  await page.screenshot({ path: resolve(OUT, 'dive-cab-log.png') });
  await waitFront(page, 'pond', 175);
  await expect(app).toHaveAttribute('data-dive-bounces', '1');
  // Up again ("ぷかっ"): the dome goes when the last car is up, and a press 0.6 s later dives again, harmlessly.
  await expect(app).toHaveAttribute('data-dive', 'near', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-underwater', '0');
  await waitTime(page, 0.7);
  await diveButton.dispatchEvent('pointerdown');
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
  const diveButton = page.locator('#dive');

  // Not diving at the ring: the train simply runs on along the surface (no fail).
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await toThePond(page, 3);
  await expect(diveButton).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await diveButton.dispatchEvent('pointerdown');
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
  await expect(diveButton).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await diveButton.dispatchEvent('pointerdown');
  await waitFront(page, 'pond', 180);
  // The button glows again just before the ring (a dive now is still going on there).
  await expect(diveButton).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  const s = Number(await app.getAttribute('data-s')) + FRONT;
  expect(s).toBeGreaterThan(205);
  await diveButton.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'deep', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-dive', 'on');
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-underwater', '1');
  // On the seabed the dome stays on; a press only bobs the train (no rule).
  const bobs = Number((await app.getAttribute('data-bobs')) ?? 0);
  await diveButton.dispatchEvent('pointerdown');
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

/**
 * PHASE9_0 §3, §4 on the test course 0-0 (every ability, a pond, no snow wall): all six round buttons are there from
 * the start; "もぐる" on land is the mole's dig (a bob, never a dive); "ゆきかき" with no snow ahead is the play stroke
 * (petals, the blade down for 1.2 s and up again); in the air a dive does nothing, and while digging a jump does
 * nothing.
 */
test('anywhere: all six buttons; dive on land digs in, plow without snow plays, no dive in the air, no jump while digging', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const app = page.locator('#app');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  const num = async (name: string): Promise<number> => Number((await app.getAttribute(name)) ?? 0);

  // (d) The whistle in the middle and the five others round it, all visible at once.
  for (const id of ['whistle', 'jump', 'dive', 'plow', 'light', 'rocket']) await expect(page.locator(`#${id}`)).toBeVisible();

  // (a) Dive pressed on land (standing): a bob, counted as a bob only; the train never "dives".
  const dive = page.locator('#dive');
  const bobs0 = await num('data-bobs');
  const dives0 = await num('data-dives');
  await dive.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-bobs', String(bobs0 + 1));
  await expect(app).toHaveAttribute('data-diving', '0');
  await expect(dive).toHaveAttribute('data-diving', '0');
  await expect(app).toHaveAttribute('data-dive', '');
  // Mashing during the dig (0.9 s) does nothing more.
  for (let i = 0; i < 5; i++) await dive.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-bobs', String(bobs0 + 1));
  await waitTime(page, 1.2);
  expect(await num('data-dives')).toBe(dives0);
  await expect(app).toHaveAttribute('data-diving', '0');
  await expect(app).toHaveAttribute('data-submerged', '0');

  // (b) Snowplow pressed with no snow within 80 m: the play stroke. Petals fly once, the blade is down, and up again
  // within ~2 s of game time (the stroke is 1.2 s).
  const plow = page.locator('#plow');
  const petals0 = await num('data-petals');
  const tPress = Number(await app.getAttribute('data-time'));
  await plow.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-petals', String(petals0 + 1));
  await expect(plow).toHaveAttribute('data-blade', '1');
  // Pressed again while the blade is down: nothing more.
  await plow.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-petals', String(petals0 + 1));
  await page.waitForFunction(() => document.getElementById('plow')?.dataset.blade === '0', undefined, { timeout: 60_000 });
  const tUp = Number(await app.getAttribute('data-time'));
  expect(tUp - tPress).toBeGreaterThanOrEqual(1);
  expect(tUp - tPress).toBeLessThanOrEqual(2.2);
  await expect(app).toHaveAttribute('data-petals', String(petals0 + 1));
  await expect(app).toHaveAttribute('data-plow-bumps', '0');
  // And a second stroke works once the blade is up.
  await plow.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-petals', String(petals0 + 2));

  // (c) In the air a dive does nothing: jump, then press dive within the same frame callback that sees data-air "1".
  await page.waitForFunction(() => document.getElementById('plow')?.dataset.blade === '0', undefined, { timeout: 60_000 });
  await tapNotch(page, 3);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) >= 2, undefined, { timeout: 60_000 });
  const inAir = await page.evaluate(
    () =>
      new Promise<{ air: boolean; bobs: number; dives: number; diving: string | undefined }>((resolve) => {
        const app = document.getElementById('app') as HTMLElement;
        const press = (id: string): void => {
          document.getElementById(id)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        };
        const bobs = Number(app.dataset.bobs);
        const dives = Number(app.dataset.dives);
        press('jump');
        let frames = 0;
        const tick = (): void => {
          if (app.dataset.air === '1') {
            press('dive');
            press('dive');
            resolve({ air: true, bobs: Number(app.dataset.bobs) - bobs, dives: Number(app.dataset.dives) - dives, diving: app.dataset.diving });
          } else if (++frames > 600) resolve({ air: false, bobs: 0, dives: 0, diving: app.dataset.diving });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(inAir).toEqual({ air: true, bobs: 0, dives: 0, diving: '0' });
  // Still nothing a moment later (the presses did not queue up); on the ground a dive digs in again.
  await expect(app).toHaveAttribute('data-air', '0', { timeout: 30_000 });
  expect(await num('data-bobs')).toBe(bobs0 + 1);
  await page.waitForFunction(() => document.getElementById('jump')?.dataset.cooldown === '0', undefined, { timeout: 30_000 });

  // While digging, a jump does nothing (no air time, no jump cooldown): dive, then jump in the same callback.
  const digging = await page.evaluate(
    () =>
      new Promise<{ bobs: number; airSeen: boolean }>((resolve) => {
        const app = document.getElementById('app') as HTMLElement;
        const press = (id: string): void => {
          document.getElementById(id)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        };
        const bobs = Number(app.dataset.bobs);
        press('dive');
        press('jump');
        const t0 = Number(app.dataset.time);
        let airSeen = false;
        const tick = (): void => {
          if (app.dataset.air === '1') airSeen = true;
          // The dig lasts 0.9 s; watch the first half second of it.
          if (airSeen || Number(app.dataset.time) - t0 >= 0.5) resolve({ bobs: Number(app.dataset.bobs) - bobs, airSeen });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(digging).toEqual({ bobs: 1, airSeen: false });
  expect(errors).toEqual([]);
});
