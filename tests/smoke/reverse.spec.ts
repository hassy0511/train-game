import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backArrow,
  card,
  doors,
  FRONT,
  lightTo,
  NORMAL,
  recordLines,
  recordReverse,
  reverseLog,
  setDirection,
  setNotch,
  SLOW,
  STOP,
  waitDriving,
  waitFront,
  waitReverseStop,
  waitTail,
} from './drive';

/**
 * PR8a「うしろむきの 土台」(PHASE9_CHAPTER5_6 第 3 部 A18, PHASE9_0 §5): the まえ／うしろ switch beside the lever; the train
 * retraces the way it came, slowly; it stops gently before a gap, at the last station passed, at the start (the
 * floor); the back siding (a switchback) and its record; going forward again over the way reversed along
 * (retracing); the switch pressed while moving (it stops first) and pressed again (cancelled); mashing it; the rocket,
 * the jump and the dive while reversing; on the hidden test stage 0-5 the partner's lines, a save without うしろむき,
 * backing up to an overshot station, the reverse platform, the animals passed staying still, a fail's rewind putting
 * the train forward again, and reversing into the snow wave.
 *
 * Built for about 10 fps software GL: presses that must land in a window are made in the page (drive.ts), and short
 * states are kept by MutationObservers in the page (window.__reverseLog, window.__lines) and read afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const MAX = 5;
const ALL = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Speed and hop extremes (window.__revSpeed), from when `arm()` is called. */
async function recordExtremes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const x = { on: false, maxBack: 0, maxHop: 0, air: 0 };
    (window as unknown as { __rev: typeof x }).__rev = x;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d || !x.on) return;
      if (d.direction === '-1' && d.reverse !== 'turning') x.maxBack = Math.max(x.maxBack, Number(d.speed));
      x.maxHop = Math.max(x.maxHop, Number(d.hop ?? 0));
      if (d.air === '1') x.air += 1;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-speed', 'data-hop', 'data-air'] });
  });
}

async function extremes(page: Page, reset = false): Promise<{ maxBack: number; maxHop: number; air: number }> {
  return page.evaluate((r) => {
    const x = (window as unknown as { __rev: { on: boolean; maxBack: number; maxHop: number; air: number } }).__rev;
    const out = { maxBack: x.maxBack, maxHop: x.maxHop, air: x.air };
    if (r) {
      x.on = true;
      x.maxBack = 0;
      x.maxHop = 0;
      x.air = 0;
    }
    return out;
  }, reset);
}

/**
 * Presses round button `id` the moment it glows (checked and pressed in the page every frame); the test course has no
 * runner (no data-phase): there it counts as driving. Fails when the front passes `latest` on `rail` first.
 */
async function pressOnGlowAnywhere(page: Page, id: string, rail: string, latest: number): Promise<void> {
  const pressed = await page.waitForFunction(
    ([bid, r, t]) => {
      const d = document.getElementById('app')?.dataset;
      const b = document.getElementById(bid);
      if (!d || !b) return false;
      if (d.rail === r && Number(d.s) + 6 >= Number(t)) return 'late';
      if (b.dataset.glow === '1' && (d.phase ?? 'driving') === 'driving') {
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        return 'pressed';
      }
      return false;
    },
    [id, rail, latest] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe('pressed');
}

/** Presses round button `id` once the front reaches `at` on `rail` (in the page, the same frame). */
async function pressAt(page: Page, id: string, rail: string, at: number): Promise<void> {
  await page.waitForFunction(
    ([bid, r, t]) => {
      const d = document.getElementById('app')?.dataset;
      if (!d || d.rail !== r || Number(d.s) + 6 < Number(t)) return false;
      document.getElementById(bid)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    [id, rail, at] as const,
    { timeout: 240_000, polling: 'raf' },
  );
}

/** Presses the rocket the moment it glows (for 0-0's uphill, main 240–310). */
async function rocketOverTheSlope(page: Page): Promise<void> {
  await pressOnGlowAnywhere(page, 'rocket', 'main', 240);
  await expect(page.locator('#app')).toHaveAttribute('data-burn', '1', { timeout: 10_000 });
}

/** Stops the train where it is (the lever to "とまる") and waits until it stands. */
async function standStill(page: Page): Promise<void> {
  await setNotch(page, STOP);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) === 0, null, { timeout: 60_000 });
}

/** A save with these abilities (a mission to go on from, when `resume`). */
async function seed(page: Page, abilities: string[], resume?: { stage: string; mission: number }): Promise<void> {
  await page.addInitScript(
    ([a, r]) => {
      if (localStorage.getItem('seeded')) return;
      localStorage.setItem('seeded', '1');
      localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: ['5-3'], abilities: a, records: [], mapLinks: [], ...(r ? { resume: r } : {}) }));
    },
    [abilities, resume ?? null] as const,
  );
}

test('0-0: the switch, turning round, the rear window, ゆっくり only, the light, back to the start', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  await recordReverse(page);
  await recordExtremes(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  const sw = page.locator('#reverse-switch');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  // The test course has うしろむき: the switch beside the lever, on まえ; the round buttons stay six.
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute('data-dir', 'front');
  expect(await page.locator('.round-button:visible').count()).toBe(6);
  await page.screenshot({ path: resolve(OUT, 'reverse-switch.png') });

  // Forward a little, then standing: a press turns it round at once (the lever stays where it is).
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 150);
  await standStill(page);
  await setDirection(page, 'back');
  await expect(app).toHaveAttribute('data-direction', '-1');
  await expect(app).toHaveAttribute('data-camera', 'rear');
  await expect(app).toHaveAttribute('data-notch', String(STOP));
  const log = await reverseLog(page);
  expect(log.some((r) => r.reverse === 'turning'), 'a "turning" row').toBe(true);

  // びゅーん reversing is ゆっくり: at most 5 m/s; with the light on at most 3.5.
  await extremes(page, true);
  await setNotch(page, MAX);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) >= 4.9, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, 'reverse-rear.png') });
  expect((await extremes(page, true)).maxBack).toBeLessThanOrEqual(5.05);
  await lightTo(page, 'light');
  // (Down from 5 to 3.5 m/s first: half a second.)
  await page.waitForTimeout(1500);
  await extremes(page, true);
  await page.waitForTimeout(2000);
  expect((await extremes(page)).maxBack).toBeLessThanOrEqual(3.55);
  await lightTo(page, 'off');
  // Back to where the train was put at the start: "おっとっと", no fail.
  await waitReverseStop(page, 'floor');
  expect(Math.abs(Number(await app.getAttribute('data-s')) + FRONT - 40)).toBeLessThanOrEqual(1);
  await expect.poll(lines, { timeout: 20_000 }).toContain('おっとっと！ ここまで');
  expect(await app.getAttribute('data-fails')).toBeNull();
  // Forward again: the cab.
  await setDirection(page, 'front');
  await expect(app).toHaveAttribute('data-camera', 'cab');
  // Left-handed: the switch goes over to the right with the lever.
  await page.evaluate(() => localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: true })));
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  const b = await sw.boundingBox();
  const lever = await page.locator('#lever').boundingBox();
  expect(b && lever && b.x > 1194 / 2 && b.x + b.width <= lever.x).toBe(true);
  await page.screenshot({ path: resolve(OUT, 'reverse-switch-left.png') });
  expect(errors).toEqual([]);
});

test('0-0: pressed while moving it stops first; pressed again it cancels; mashing it standing', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await recordReverse(page);
  const app = page.locator('#app');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await setNotch(page, NORMAL);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) >= 9.9, null, { timeout: 60_000 });
  // One press at ふつう (10 m/s): the knob blinks (waiting), the train brakes to a stop (3 m/s²: 17 m), then turns.
  await page.evaluate(() => document.getElementById('reverse-switch')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
  await expect(page.locator('#reverse-switch')).toHaveAttribute('data-pending', '1');
  await expect(app).toHaveAttribute('data-direction', '-1', { timeout: 30_000 });
  const log = await reverseLog(page);
  const pending = log.find((r) => r.reverse === 'pending');
  const turned = log.find((r) => r.direction === '-1');
  expect(pending && turned).toBeTruthy();
  const braked = (turned?.front ?? 0) - (pending?.front ?? 0);
  console.log(`reverse: pressed at 10 m/s, turned after ${braked.toFixed(1)} m`);
  expect(Math.abs(braked - 17)).toBeLessThanOrEqual(3);
  // Forward again (standing: at once), up to ふつう, a press and a second one while it waits: cancelled.
  await setDirection(page, 'front');
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) >= 9.9, null, { timeout: 60_000 });
  const cancelled = await page.evaluate(async () => {
    const b = document.getElementById('reverse-switch') as HTMLElement;
    const d = (document.getElementById('app') as HTMLElement).dataset;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const first = b.dataset.pending;
    await new Promise((r) => setTimeout(r, 300));
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return { first, second: b.dataset.pending, direction: d.direction };
  });
  expect(cancelled).toEqual({ first: '1', second: '0', direction: '1' });
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) >= 9.5, null, { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-direction', '1');
  // Mashing while it stands: 10 presses in a second turn it round twice at most (the half-second turn is locked).
  await standStill(page);
  const before = Number(await app.getAttribute('data-reverse-toggles'));
  await page.evaluate(async () => {
    const b = document.getElementById('reverse-switch') as HTMLElement;
    for (let i = 0; i < 10; i++) {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  await page.waitForTimeout(1500);
  const after = Number(await app.getAttribute('data-reverse-toggles'));
  console.log(`reverse: mashed 10 times in a second, turned ${after - before} time(s)`);
  expect(after - before).toBeGreaterThanOrEqual(1);
  expect(after - before).toBeLessThanOrEqual(2);
  expect(await app.getAttribute('data-fails')).toBeNull();
  expect(errors).toEqual([]);
});

test('0-0: the back siding and its record, retracing, a gap it stops before; the jump, the rocket and the dive reversing', async ({ page }) => {
  test.setTimeout(720_000);
  const errors = watchErrors(page);
  await recordReverse(page);
  await recordExtremes(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  const sw = page.locator('#reverse-switch');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await setNotch(page, NORMAL);
  await rocketOverTheSlope(page);
  // Past the back junction at main 470 (the whole train past the point): the switch glows (its siding has a record).
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 120_000 });
  const glowFront = Number(await app.getAttribute('data-s')) + FRONT;
  console.log(`reverse: the switch glows past ura-guchi (front ${glowFront.toFixed(1)})`);
  expect(glowFront).toBeGreaterThanOrEqual(470 + 37);
  await expect.poll(lines, { timeout: 20_000 }).toContain('うしろに わきみちが ある！');
  await page.screenshot({ path: resolve(OUT, 'reverse-post.png') });
  await standStill(page);
  await setDirection(page, 'back');
  await expect(sw).toHaveAttribute('data-glow', '0');
  await setNotch(page, NORMAL);
  // The arrows of the back junction; the right one (the siding, on the right as seen from the rear window).
  await expect(app).toHaveAttribute('data-back-arrows', 'ura-guchi', { timeout: 60_000 });
  await expect(page.locator('#junction')).toHaveAttribute('data-back', '1');
  await backArrow(page, 'right');
  await expect(app).toHaveAttribute('data-tail-rail', 'ura', { timeout: 60_000 });
  await waitReverseStop(page, 'buffer');
  // The rear end 0.5 m from the buffer: the tail car's centre 6.5 m in.
  expect(Math.abs(Number(await app.getAttribute('data-tail-s')) - 6.5)).toBeLessThanOrEqual(1);
  await expect(app).toHaveAttribute('data-records', /test-ura/, { timeout: 10_000 });
  await expect(sw).toHaveAttribute('data-glow', '1');
  await page.screenshot({ path: resolve(OUT, 'reverse-siding.png') });
  // Forward again: out of the siding onto main at its mouth, retracing until past the furthest point.
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-rail', 'main', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-retracing', '1');
  await expect(app).toHaveAttribute('data-retracing', '0', { timeout: 60_000 });
  // On (to-jishaku on its default way) over the gap at main 620–632, then back: it stops 1 m before the gap.
  await pressOnGlowAnywhere(page, 'jump', 'main', 622);
  await waitFront(page, 'main', 670);
  await standStill(page);
  await setDirection(page, 'back');
  await extremes(page, true);
  await setNotch(page, NORMAL);
  // A jump while reversing: a little hop where it is (not in the air); the rocket: "ぷすっ" and a word; a dive: a dig.
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) >= 2, null, { timeout: 30_000 });
  const pips = await app.getAttribute('data-rocket-pips');
  const bobs = Number(await app.getAttribute('data-bobs'));
  const dives = Number(await app.getAttribute('data-dives'));
  await page.evaluate(() => {
    for (const id of ['jump', 'rocket', 'dive']) document.getElementById(id)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  });
  await waitReverseStop(page, 'gap');
  const x = await extremes(page);
  console.log(`reverse: hop ${x.maxHop.toFixed(2)} m, in the air ${x.air} times`);
  expect(x.air).toBe(0);
  expect(x.maxHop).toBeGreaterThan(0);
  expect(x.maxHop).toBeLessThanOrEqual(0.31);
  await expect(app).toHaveAttribute('data-rocket-pips', pips ?? '');
  await expect(page.locator('#rocket')).toHaveAttribute('data-why', 'reverse');
  expect(Number(await app.getAttribute('data-bobs'))).toBe(bobs + 1);
  expect(Number(await app.getAttribute('data-dives'))).toBe(dives);
  // The rear end 1 ± 1 m before the gap's far edge (632).
  const tailEnd = Number(await app.getAttribute('data-s')) + FRONT - 37;
  console.log(`reverse: stopped before the gap, rear end at main ${tailEnd.toFixed(1)}`);
  expect(Math.abs(tailEnd - 633)).toBeLessThanOrEqual(1);
  await expect.poll(lines, { timeout: 20_000 }).toContain('おっとっと！ きれめだ');
  await expect.poll(lines, { timeout: 20_000 }).toContain('うしろでは つかえないよ');
  expect(await app.getAttribute('data-fails')).toBeNull();
  expect(errors).toEqual([]);
});

test('0-0: reversing retraces the way it came through a junction (no arrows)', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  await recordReverse(page);
  const app = page.locator('#app');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await setNotch(page, NORMAL);
  await rocketOverTheSlope(page);
  // Right at to-jishaku (main 560, the magnet's side way), 100 m along it.
  const tapped = await page.waitForFunction(
    () => {
      const box = document.getElementById('junction');
      const b = box?.querySelector<HTMLElement>('.arrow[data-side="right"]');
      const d = document.getElementById('app')?.dataset;
      if (!box || box.hidden || !b || b.hidden || d?.rail !== 'main' || Number(d.s) < 480) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    null,
    { timeout: 180_000, polling: 'raf' },
  );
  expect(await tapped.jsonValue()).toBe(true);
  await waitFront(page, 'jishaku', 100);
  await standStill(page);
  await setDirection(page, 'back');
  const from = (await reverseLog(page)).length;
  await setNotch(page, NORMAL);
  await waitTail(page, 'main', 540);
  const rows = (await reverseLog(page)).slice(from);
  const tails: string[] = [];
  for (const r of rows) if (tails[tails.length - 1] !== r.tailRail) tails.push(r.tailRail);
  console.log(`reverse: the tail car went ${tails.join(' → ')}`);
  expect(tails).toEqual(['jishaku', 'main']);
  expect(rows.some((r) => r.junction), 'no arrows reversing through an ordinary junction').toBe(false);
  expect(errors).toEqual([]);
});

test('0-5 without うしろむき: no switch, the post says "うしろむきに はしれたら…"; overshooting is the old fail', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await seed(page, ALL);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  await page.goto('/?stage=0-5&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'うしろの ホーム', 120_000);
  await waitDriving(page);
  await expect(page.locator('#reverse-switch')).toBeHidden();
  await setNotch(page, NORMAL);
  // The cat at main 250 wakes 60 m off: the whistle 50 m before it.
  await pressAt(page, 'whistle', 'main', 200);
  // Stand by the post (the back junction at main 400).
  await waitFront(page, 'main', 405);
  await standStill(page);
  await expect.poll(lines, { timeout: 30_000 }).toContain('うしろむきに はしれたら…');
  await page.waitForTimeout(2000);
  expect((await lines()).split('\n').filter((l) => l === 'うしろむきに はしれたら…')).toHaveLength(1);
  await page.screenshot({ path: resolve(OUT, 'reverse-post-grey.png') });

  // Mission 2 (from なかのえき): the wave is outrun at ふつう; past おわりのえき by 20 m it is the old overshoot.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}');
    localStorage.setItem('train-game.progress.v1', JSON.stringify({ ...p, resume: { stage: '0-5', mission: 1 } }));
  });
  await page.goto('/?stage=0-5&go=1&resume=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ゆきの なみ', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 1300 + 4);
  await setNotch(page, STOP);
  await expect(app).toHaveAttribute('data-fail-reason', 'overshoot', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('0-5 with うしろむき: the animals passed stay still, the reverse platform, backing up to an overshot station', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await seed(page, [...ALL, 'reverse']);
  await recordReverse(page);
  const lines = await recordLines(page);
  // The animals' states (#app[data-actors]) from when the cat has fled.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __actors: string[] }).__actors = seen;
    new MutationObserver(() => {
      const a = document.getElementById('app')?.dataset.actors;
      if (a !== undefined && seen[seen.length - 1] !== a) seen.push(a);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-actors'] });
  });
  const actors = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __actors: string[] }).__actors);
  const app = page.locator('#app');
  const sw = page.locator('#reverse-switch');
  await page.goto('/?stage=0-5&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'うしろの ホーム', 120_000);
  await waitDriving(page);
  await expect(sw).toBeVisible();
  await setNotch(page, NORMAL);
  // The cat at main 250 wakes 60 m off: the whistle 50 m before it.
  await pressAt(page, 'whistle', 'main', 200);
  // Past the cat (main 250): back over it and forward again. It stays as it is; the hint is not said again.
  await waitFront(page, 'main', 330);
  await standStill(page);
  const passed = await actors();
  await setDirection(page, 'back');
  await setNotch(page, NORMAL);
  await waitTail(page, 'main', 225);
  await standStill(page);
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-retracing', '1');
  // Past the back junction: the switch glows (the step's platform is in its siding), and its line.
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 120_000 });
  expect((await actors()).slice(passed.length)).toEqual([]);
  expect((await lines()).split('\n').filter((l) => l === 'ねこさんだ！ きてき！')).toHaveLength(1);
  await expect.poll(lines, { timeout: 20_000 }).toContain('うしろに ホームが ある！');
  await standStill(page);
  await setDirection(page, 'back');
  await setNotch(page, NORMAL);
  await backArrow(page, 'right');
  // The reverse platform: arriving is stopping at the buffer ("ぴたっ！"), then the doors as ever.
  await waitReverseStop(page, 'buffer');
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, 'reverse-home.png') });
  await doors(page);
  // Doors shut: the switch glows to go forward again.
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await waitDriving(page);
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  // なかのえき (700): 20 m past it. No fail: "うしろで もどって！", the switch glows; backing up, the front stops on the line.
  await waitFront(page, 'main', 700 + 3.5);
  await setNotch(page, STOP);
  await expect.poll(lines, { timeout: 30_000 }).toContain('いきすぎ〜！ うしろで もどって！');
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) === 0, null, { timeout: 60_000 });
  const past = Number(await app.getAttribute('data-s')) + FRONT - 700;
  console.log(`reverse: stopped ${past.toFixed(1)} m past なかのえき`);
  expect(past).toBeGreaterThan(6);
  expect(await app.getAttribute('data-phase')).toBe('driving');
  await setDirection(page, 'back');
  await setNotch(page, SLOW);
  await waitReverseStop(page, 'station');
  const front = Number(await app.getAttribute('data-s')) + FRONT;
  console.log(`reverse: backed up to なかのえき, front at ${front.toFixed(2)}`);
  expect(Math.abs(front - 700)).toBeLessThanOrEqual(0.5);
  await expect(page.locator('#toast')).toContainText('ぴったり', { timeout: 20_000 });
  await doors(page);
  await card(page, 'できた！', 120_000);
  expect(await app.getAttribute('data-fails')).toBeNull();
  expect(errors).toEqual([]);
});

test('0-5 with うしろむき: reversing into the snow wave is caught (soft); the rewind is forward; 70 m past the station is a fail', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await seed(page, [...ALL, 'reverse'], { stage: '0-5', mission: 1 });
  const app = page.locator('#app');
  await page.goto('/?stage=0-5&go=1&resume=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ゆきの なみ', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-chase', /run|near/, { timeout: 120_000 });
  await waitFront(page, 'main', 800);
  await standStill(page);
  await setDirection(page, 'back');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-fail-reason', 'snow', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-fail-soft', '1');
  // Put back facing forward, the trail made again (33 m behind the lead car's centre).
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase === 'driving' || document.getElementById('app')?.dataset.phase === 'failing', null);
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-direction', '1');
  expect(Math.abs(Number(await app.getAttribute('data-trail-m')) - 33)).toBeLessThanOrEqual(1);
  // Away from the wave, and 70 m past おわりのえき: the old overshoot, even with うしろむき.
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 1300 + 62);
  await setNotch(page, STOP);
  await expect(app).toHaveAttribute('data-fail-reason', 'overshoot', { timeout: 60_000 });
  expect(errors).toEqual([]);
});
