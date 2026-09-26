import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const FRONT = 6; // data-s is the lead car center; stations, slopes and rocks are measured at the front
const STOP = 1;
const SLOW = 2;
const NORMAL = 3;
const FAST = 4;

async function tapUntil(page: Page, selector: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.locator(selector).isVisible()) return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  throw new Error(`timed out waiting for ${selector}`);
}

async function card(page: Page, text: string, timeoutMs = 90_000): Promise<void> {
  await tapUntil(page, '#card', timeoutMs);
  await expect(page.locator('#card')).toContainText(text);
  await page.locator('#card-button').click();
}

/** Taps a lever detent without expecting it to take (the lever is locked under the rocket and on a slide). */
async function tapNotch(page: Page, notch: number): Promise<void> {
  const box = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
}

async function setNotch(page: Page, notch: number): Promise<void> {
  await tapNotch(page, notch);
  await expect(page.locator('#app')).toHaveAttribute('data-notch', String(notch));
}

/** Waits until the train is on `rail` with its center at `s` or beyond. */
async function waitFor(page: Page, rail: string, s: number, timeoutMs = 240_000): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) >= Number(t);
    },
    [rail, s] as const,
    { timeout: timeoutMs },
  );
}

async function waitDriving(page: Page): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await page.locator('#app').getAttribute('data-phase')) === 'driving') return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  throw new Error('not driving again');
}

/** Waits `seconds` of game time (the sim clock, data-time), not wall time: the machine may be slow. */
async function waitGame(page: Page, seconds: number): Promise<void> {
  const t0 = Number(await page.locator('#app').getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + seconds, {
    timeout: 60_000,
  });
}

async function jumpGap(page: Page, shot?: string): Promise<void> {
  const jump = page.locator('#jump');
  await expect(jump).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await jump.dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-air', '1', { timeout: 5_000 });
  if (shot) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(OUT, shot) });
  }
  await expect(page.locator('#app')).toHaveAttribute('data-air', '0', { timeout: 15_000 });
}

async function stopAt(page: Page, rail: string, at: number, slowFrom = 55, brake = 4.5): Promise<void> {
  await waitFor(page, rail, at - FRONT - slowFrom);
  await setNotch(page, SLOW);
  await waitFor(page, rail, at - FRONT - brake);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

/** At a station with passengers or a parcel: the glowing door button, then wait for the doors to finish. */
async function doors(page: Page): Promise<void> {
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 20_000 });
  await expect(door).toHaveAttribute('data-glow', '1');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

/** A fail (slip, bump or time-up): the train is put back before it; wait until it is back on `rail` before `below`. */
async function waitRewound(page: Page, rail: string, below: number): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) < Number(t) && el?.dataset.phase === 'failing';
    },
    [rail, below] as const,
    { timeout: 180_000 },
  );
}

async function pressRocket(page: Page): Promise<void> {
  await page.locator('#rocket').dispatchEvent('pointerdown');
}

/**
 * Presses the rocket every time it glows until the train center reaches `s` on `rail` (in the page, so no glow is
 * missed on a slow machine). Returns the presses made and whether the train slipped meanwhile.
 */
async function rocketOnGlow(page: Page, rail: string, s: number): Promise<{ presses: number; slipped: boolean }> {
  type Glow = { presses: number; slipped: boolean; last: number };
  await page.evaluate(() => {
    (window as unknown as { __glow: Glow }).__glow = { presses: 0, slipped: false, last: -1 };
  });
  await page.waitForFunction(
    ([r, t]) => {
      const app = document.getElementById('app');
      const rocket = document.getElementById('rocket');
      const g = (window as unknown as { __glow: Glow }).__glow;
      if (!app || !rocket) return false;
      if (app.dataset.slip === '1') g.slipped = true;
      const now = Number(app.dataset.time);
      // One press per glow: the button's flags follow a frame later, so wait a little game time between presses.
      if (rocket.dataset.glow === '1' && app.dataset.burn !== '1' && app.dataset.phase === 'driving' && now - g.last > 0.5) {
        g.last = now;
        g.presses += 1;
        rocket.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
      return app.dataset.rail === r && Number(app.dataset.s) >= Number(t);
    },
    [rail, s] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  return page.evaluate(() => {
    const g = (window as unknown as { __glow: Glow }).__glow;
    return { presses: g.presses, slipped: g.slipped };
  });
}

test('stage 2-3 full run: the rocket, steep slopes and slides, rocks, the countdown, the bridge', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Every line the bubble shows, in order (to check what was NOT said).
  await page.addInitScript(() => {
    const lines: string[] = [];
    (window as unknown as { __lines: string[] }).__lines = lines;
    new MutationObserver(() => {
      const line = document.getElementById('bubble')?.dataset.line;
      if (line && lines[lines.length - 1] !== line) lines.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-line'] });
  });
  const saidSoFar = () => page.evaluate(() => (window as unknown as { __lines: string[] }).__lines.join('\n'));

  await page.goto('/?stage=2-3');
  const app = page.locator('#app');
  const rocket = page.locator('#rocket');
  const light = page.locator('#light');
  const timer = page.locator('#timer');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-music', 'title');
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'volcano');

  // Opening: Pico fits the rocket; its button takes the camera's place and the camera hops to the top right corner.
  await card(page, 'おぼえた');
  await expect(rocket).toBeVisible();
  await expect(app).toHaveAttribute('data-has-rocket', '1');
  await page.waitForTimeout(900);
  const cam = await page.locator('#camera').boundingBox();
  const viewport = page.viewportSize();
  if (!cam || !viewport) throw new Error('camera button not laid out');
  expect(cam.y).toBeLessThan(120);
  expect(cam.x).toBeGreaterThanOrEqual(viewport.width - 200);
  expect(cam.x + cam.width).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({ path: resolve(OUT, '60-rocket-camera.png') });

  // M1 のぼれ.
  await card(page, 'のぼれ');
  await waitDriving(page);
  await setNotch(page, FAST);
  // The seabird sunning itself on the rail flies off at the whistle (no fail).
  // (Like 1-1's cat, the whistle does not glow for it: whistle once the front is within its 60 m.)
  await waitFor(page, 'main', 72 - FRONT);
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await waitFor(page, 'main', 130);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('とんでった');
  console.log('2-3: the seabird flew off at the whistle');

  // On purpose: up the first steep slope without the rocket. The train slips back and starts before it, flames full.
  await expect(app).toHaveAttribute('data-slip', '1', { timeout: 120_000 });
  await page.screenshot({ path: resolve(OUT, '61-slip.png') });
  await waitRewound(page, 'main', 260);
  await expect(app).toHaveAttribute('data-rocket-pips', '3');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ずるずる');
  console.log('2-3: slipped back on the first steep slope without the rocket');

  // Again: the button glows before the slope; pressed, it burns and the lever stays put.
  await waitDriving(page);
  await setNotch(page, FAST);
  await expect(rocket).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  const glowAt = Number(await app.getAttribute('data-s')) + FRONT;
  await pressRocket(page);
  await expect(app).toHaveAttribute('data-burn', '1', { timeout: 5_000 });
  await expect(app).toHaveAttribute('data-rocket-pips', '2');
  await tapNotch(page, STOP);
  await expect(app).toHaveAttribute('data-notch', String(FAST));
  console.log(`2-3: rocket glowed at main ${glowAt.toFixed(0)} (front), the lever stays put while it burns`);
  await waitFor(page, 'main', 290 - FRONT);
  await expect(app).toHaveAttribute('data-camera', 'chase');
  await page.screenshot({ path: resolve(OUT, '62-rocket-chase.png') });
  await waitFor(page, 'main', 335 - FRONT);
  await expect(app).toHaveAttribute('data-burn', '0');
  await expect(app).toHaveAttribute('data-slip', '0');

  // The first slide: nothing but "ひゃっほー"; the lever does nothing there.
  await waitFor(page, 'main', 370 - FRONT);
  await expect(app).toHaveAttribute('data-slope', 'down');
  await tapNotch(page, STOP);
  await expect(app).toHaveAttribute('data-notch', String(FAST));
  await expect(page.locator('#hud-speed')).toContainText('つるつる');
  await page.screenshot({ path: resolve(OUT, '63-slide.png') });

  // The long slope: press each time it glows (twice), never slipping.
  const m1 = await rocketOnGlow(page, 'main', 622 - FRONT);
  console.log(`2-3: long slope, rocket pressed ${m1.presses} time(s)`);
  expect(m1.slipped).toBe(false);
  await expect(app).toHaveAttribute('data-rocket-pips', '0');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('もういっかい');
  await stopAt(page, 'main', 820);
  await card(page, 'できた');

  // M2 いしが ふる: wait for rolling rocks, jump over dropped ones, keep flames for the last slope.
  await card(page, 'いしが ふる');
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-rocket-pips', '3');
  await setNotch(page, NORMAL);
  await waitFor(page, 'main', 880 - FRONT);
  await setNotch(page, SLOW);
  await waitFor(page, 'main', 975);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  console.log('2-3: rock A rolled by at ゆっくり');
  await jumpGap(page, '64-rock-drop.png');
  console.log('2-3: jumped over rock B');
  await waitFor(page, 'main', 1040 - FRONT);
  await setNotch(page, SLOW);
  await jumpGap(page);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  expect(await saidSoFar()).not.toContain('ぽこん');
  console.log('2-3: waited for rock C and jumped over rock D');

  // The side line up to the lookout: one flame, then the light in the steam finds the yellow crystal.
  await expect(page.locator('#junction')).toBeVisible({ timeout: 120_000 });
  await page.locator('#junction .arrow[data-side="left"]').dispatchEvent('pointerdown');
  await waitFor(page, 'miharashi', 0);
  await expect(rocket).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await pressRocket(page);
  await expect(app).toHaveAttribute('data-burn', '1', { timeout: 5_000 });
  await waitFor(page, 'miharashi', 78 - FRONT);
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '1');
  await page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}').records ?? []).includes('sulfur-crystal'),
    null,
    { timeout: 120_000 },
  );
  await waitGame(page, 0.6); // the light's cooldown
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '0');
  await expect(app).toHaveAttribute('data-slope', 'down', { timeout: 120_000 });
  await waitFor(page, 'main', 1358);
  await expect(app).toHaveAttribute('data-rocket-pips', '2');
  console.log('2-3: side line: rocket once, the light found the yellow crystal');

  // The sleeping seabirds' cliff: the rocket rests; a press only says "しーっ" and keeps the flames.
  await waitFor(page, 'main', 1380 - FRONT);
  await expect(rocket).toHaveAttribute('data-why', 'zone');
  await expect(rocket).toHaveAttribute('data-mark', 'sleep');
  await pressRocket(page);
  await waitGame(page, 1);
  await expect(app).toHaveAttribute('data-burn', '0');
  await expect(app).toHaveAttribute('data-rocket-pips', '2');
  await expect(page.locator('#bubble')).toContainText('しーっ');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ロケットは おやすみ');

  // The last slope: press each time it glows, and both flames get it up.
  const m2 = await rocketOnGlow(page, 'main', 1612 - FRONT);
  console.log(`2-3: last slope, rocket pressed ${m2.presses} time(s)`);
  expect(m2.slipped).toBe(false);
  await expect(app).toHaveAttribute('data-rocket-pips', '0');
  await stopAt(page, 'main', 1810);
  await card(page, 'できた');

  // M3 はしが おちる (the glimpse of the round hat plays between the cards).
  await card(page, 'はしが おちる', 180_000);
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-rocket-pips', '3');
  await setNotch(page, NORMAL);
  await waitFor(page, 'kudari', 45 - FRONT);
  await expect(app).toHaveAttribute('data-slope', 'down', { timeout: 30_000 });
  await jumpGap(page, '65-slide-jump.png');
  console.log('2-3: jumped over rock E on the slide');
  await waitFor(page, 'kudari', 175 - FRONT);
  await page.screenshot({ path: resolve(OUT, '66-arch.png') });

  // Near the station the rocket rests.
  await waitFor(page, 'kudari', 300 - FRONT);
  await expect(rocket).toHaveAttribute('data-why', 'station');
  await pressRocket(page);
  await waitGame(page, 1);
  await expect(app).toHaveAttribute('data-burn', '0');
  await expect(app).toHaveAttribute('data-rocket-pips', '3');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('えきの ちかくは ロケット おやすみ');
  await stopAt(page, 'kudari', 450);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '1');

  // The countdown. Out of time on purpose: the volcano sneezes, back to the observatory with 10 s more.
  await tapUntil(page, '#timer', 60_000);
  const t0 = Number(await app.getAttribute('data-timer'));
  expect(t0).toBeGreaterThanOrEqual(69);
  expect(t0).toBeLessThanOrEqual(70);
  await expect(app).toHaveAttribute('data-music', 'hurry');
  await page.screenshot({ path: resolve(OUT, '67-countdown.png') });
  // Ten seconds left: the panel's volcano fidgets and Pico hurries (once), before the sneeze.
  await expect(app).toHaveAttribute('data-timer-state', 'low', { timeout: 300_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('はやく はやく');
  await expect(app).toHaveAttribute('data-timer-state', 'up', { timeout: 300_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '67-sneeze.png') });
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-rail', 'kudari');
  const back = Number(await app.getAttribute('data-s'));
  expect(Math.abs(back - (450 - FRONT))).toBeLessThanOrEqual(3);
  expect(Number(await app.getAttribute('data-timer'))).toBeGreaterThanOrEqual(79);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '1');
  console.log(`2-3: time up, back at kudari ${back} with ${await app.getAttribute('data-timer')} s`);

  const full = Number(await app.getAttribute('data-timer'));

  // Another fail gives the time back with the train: fast into rolling rock F, "ぽこん". The time left when the
  // front passed F's rewind point (612 − 80) is noted in the page, so no frame is missed on a slow machine.
  await setNotch(page, FAST);
  const tAtRewind = await page.evaluate(
    (center) =>
      new Promise<number>((done) => {
        const poll = (): void => {
          const el = document.getElementById('app');
          if (el?.dataset.rail === 'kudari' && Number(el.dataset.s) >= center) done(Number(el.dataset.timer));
          else requestAnimationFrame(poll);
        };
        poll();
      }),
    532 - FRONT,
  );
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase === 'failing', null, {
    timeout: 240_000,
  });
  const t1 = Number(await app.getAttribute('data-timer'));
  await expect(page.locator('#bubble')).toContainText('ぽこん', { timeout: 30_000 });
  await waitDriving(page);
  const t2 = Number(await app.getAttribute('data-timer'));
  console.log(`2-3: bumped rock F with ${t1} s left (${tAtRewind} s at its rewind point), back with ${t2} s`);
  // What was left at the rewind point, plus 3 s (PHASE6 §5.3), not the full time.
  expect(t2).toBeGreaterThan(t1);
  expect(t2).toBeGreaterThanOrEqual(tAtRewind + 3 - 1);
  expect(t2).toBeLessThanOrEqual(tAtRewind + 3 + 1);
  expect(t2).toBeLessThan(full);

  // Put back 80 m before F, the lever at とまる: waiting there as Pico asks, F rolls by all the same.
  await expect(app).toHaveAttribute('data-rocks', /rock-f:roll/, { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-phase', 'driving');
  expect(Number(await app.getAttribute('data-s'))).toBeLessThan(540 - FRONT);
  console.log('2-3: waiting 80 m before F, it rolled by');
  await waitGame(page, 4.5);

  // For real: on at ふつう past F, rocket down the straight, no rocket on the wobbly bridge, safe across.
  await setNotch(page, NORMAL);
  await waitFor(page, 'kudari', 640 - FRONT);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await setNotch(page, FAST);
  await expect(rocket).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await pressRocket(page);
  await expect(app).toHaveAttribute('data-burn', '1', { timeout: 5_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '68-rocket-timer.png') });
  await waitFor(page, 'kudari', 800 - FRONT);
  await expect(rocket).toHaveAttribute('data-mark', 'bridge');
  await pressRocket(page);
  await waitGame(page, 0.5);
  await expect(app).toHaveAttribute('data-burn', '0');
  await expect(page.locator('#bubble')).toContainText('ぐらぐらばし');
  await expect(app).toHaveAttribute('data-timer-state', 'safe', { timeout: 120_000 });
  await expect(timer).toContainText('セーフ');
  await page.screenshot({ path: resolve(OUT, '69-safe.png') });
  await expect(app).toHaveAttribute('data-music', 'volcano', { timeout: 10_000 });
  console.log('2-3: across the wobbly bridge in time');
  await stopAt(page, 'kudari', 1035);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  await card(page, 'できた');

  // Ending: the volcano sneezes and the old bridge falls into the sea; Pico thanks Sakasa.
  // Tap only the bubble here: a tap on the caption would end the sneeze before the picture.
  {
    const deadline = Date.now() + 120_000;
    while (!(await page.locator('#caption:has-text("はっくしょーん")').isVisible())) {
      if (Date.now() > deadline) throw new Error('no sneeze caption');
      if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
      await page.waitForTimeout(150);
    }
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '70-sneeze-ending.png') });
  await tapUntil(page, '#bubble:has-text("はしが おちちゃった")', 60_000);
  // The old bridge's middle (765–865) was cut and fell.
  await expect(app).toHaveAttribute('data-rail-cut', 'kudari:765-865');
  await page.screenshot({ path: resolve(OUT, '70-bridge-fallen.png') });
  await tapUntil(page, '#bubble:has-text("こんにちは")', 120_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '70-sakasa.png') });
  await tapUntil(page, '#card', 120_000);
  // He went down behind the cape's rim and is gone.
  expect(await app.getAttribute('data-cutscene-actors')).not.toContain('sakasa');
  await expect(page.locator('#card')).toContainText('2しょう おしまい');
  await page.screenshot({ path: resolve(OUT, '71-ending.png') });
  await page.locator('#card-button').click();
  await tapUntil(page, '#card', 60_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '72-clear.png') });

  // The volcano puffed its everyday smoke rings along the way (every 12 s, every 4 s in the countdown).
  expect(Number(await app.getAttribute('data-volcano-puffs'))).toBeGreaterThan(10);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(progress.abilities).toContain('rocket');
  expect(progress.records).toEqual(expect.arrayContaining(['pumice-float', 'sulfur-crystal']));
  expect(progress.records).not.toContain('bubble-spring');
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`2-3 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  expect(budget.draws).toBeLessThanOrEqual(200);
  expect(budget.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(saved.cleared).toContain('2-3');
  // The rail on to chapter 3's island (PHASE6 §11) waits for だいさん's answer (PHASE6 2-3 付録 D: show the shadow
  // island 3-1 and the chapter-3 heading now?). Until world.json has the link it is reported as pending, not skipped
  // quietly; once it is there it must be laid.
  const world = JSON.parse(readFileSync(resolve(OUT, '../../../src/world/world.json'), 'utf8')) as { links: string[][] };
  if (world.links.some(([a, b]) => a === '2-3' && b === '3-1')) {
    await expect(page.locator('[data-link="2-3>3-1"]')).toHaveClass(/is-laid/);
  } else {
    test.info().annotations.push({ type: 'pending', description: 'map link 2-3 > 3-1: waiting for the decision in PHASE6 2-3 付録 D (§11)' });
    console.log('2-3: PENDING map link 2-3 > 3-1 (PHASE6 2-3 付録 D / §11): not in world.json yet');
  }
  await page.screenshot({ path: resolve(OUT, '73-map.png') });
  await page.locator('#map-close').click();
  await page.waitForURL((url) => !url.search.includes('stage=2-3'), { timeout: 30_000 });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  console.log('smoke 2-3 full: cleared');
  expect(errors).toEqual([]);
});

/** 付録 C: every 2-3 model (code stand-ins until ticket 0009) opens on the model page without an error. */
test('2-3 models on the model page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const names = [
    'volcano',
    'mesa-a',
    'mesa-b',
    'pumice',
    'old-bridge',
    'observatory',
    'seabird',
    'seabird-sleep',
    'sign-steep',
    'sign-slide',
    'sign-no-rocket',
    'sulfur-crystal',
    'rocket-unit',
  ];
  for (const name of names) {
    await page.goto(`/models.html?model=${name}`);
    await expect(page.locator('#name')).toHaveText(name, { timeout: 60_000 });
    await expect(page.locator('#dims')).toContainText('三角形', { timeout: 60_000 });
    const tris = Number(/(\d+) 三角形/.exec((await page.locator('#dims').textContent()) ?? '')?.[1]);
    expect(tris, name).toBeGreaterThan(0);
  }
  await page.screenshot({ path: resolve(OUT, '74-models-volcano.png') });
  expect(errors).toEqual([]);
});
