import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * "とちゅうから つづける" and "▶▶" (docs/PHASE7_FINISH.md §4 items 3 and 7), from prepared saves: the title offers the
 * saved mission, which starts at the last station of the mission before with what the train would carry, the
 * abilities the fast-forwarded cutscenes teach, their figures and the flower bridges already open; a clear forgets
 * it. On a stage cleared before, "▶▶" skips the rest of a cutscene to the next card.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const FRONT = 6; // data-s is the lead car center; stations are measured at the front
const STOP = 1;
const SLOW = 2;
const NORMAL = 3;
const FAST = 4;
const ALL_LINKS = ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1'];

interface Save {
  cleared: string[];
  abilities: string[];
  mapLinks: string[];
  resume?: { stage: string; mission: number };
}

/** Puts the save in before the game reads it (only into an empty storage, so reloads keep what the game saved). */
async function seed(page: Page, save: Save): Promise<void> {
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schema: 1, records: [], ...data }));
    },
    [KEY, save] as const,
  );
}

const saved = (page: Page): Promise<Save & { records: string[] }> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), KEY);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

async function ready(page: Page, stage: string): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-stage', stage);
}

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

async function setNotch(page: Page, notch: number): Promise<void> {
  const box = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
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
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if ((await page.locator('#app').getAttribute('data-phase')) === 'driving') return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  throw new Error('not driving');
}

/** Waits `seconds` of game time (the sim clock, data-time), not wall time: the machine may be slow. */
async function waitGame(page: Page, seconds: number): Promise<void> {
  const t0 = Number(await page.locator('#app').getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + seconds, {
    timeout: 90_000,
  });
}

async function stopAt(page: Page, rail: string, at: number, slowFrom = 55, brake = 4.5): Promise<void> {
  await waitFor(page, rail, at - FRONT - slowFrom);
  await setNotch(page, SLOW);
  await waitFor(page, rail, at - FRONT - brake);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

async function doors(page: Page): Promise<void> {
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

/** The train stands at `at` (front) on `rail`, stopped. */
async function standsAt(page: Page, rail: string, at: number): Promise<void> {
  const app = page.locator('#app');
  // Polled: the hooks are written once a frame, and the card can come up before the next one.
  await expect
    .poll(async () => Math.abs(Number(await app.getAttribute('data-s')) - (at - FRONT)), { timeout: 10_000 })
    .toBeLessThanOrEqual(0.5);
  await expect(app).toHaveAttribute('data-rail', rail);
  await expect(app).toHaveAttribute('data-speed', '0.0');
}

/** "▶▶" never shows on a stage not cleared before: checked every frame while `run` goes on. */
async function watchSkip(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const w = window as unknown as { skipSeen: boolean };
    w.skipSeen = false;
    const poll = (): void => {
      const skip = document.getElementById('skip');
      if (skip && !skip.hidden) w.skipSeen = true;
      requestAnimationFrame(poll);
    };
    poll();
  });
  return () => page.evaluate(() => (window as unknown as { skipSeen: boolean }).skipSeen);
}

test('resume 1-2 mission 2 from the 1-1 title: the opening fast-forwarded teaches the jump', async ({ page }) => {
  const errors = watchErrors(page);
  // The jump is not in the save: only the fast-forwarded opening of 1-2 can give it.
  await seed(page, { cleared: ['1-1'], abilities: ['whistle'], mapLinks: ['1-1>1-2'], resume: { stage: '1-2', mission: 1 } });
  await page.goto('/');
  await ready(page, '1-1');
  const cont = page.locator('#title-continue');
  await expect(cont).toHaveText('つづきから（1-2 ミッション 2）');
  await expect(cont).toHaveClass(/is-primary/);
  await expect(page.locator('#title-start')).toHaveText('はじめから（1-2）');
  await page.screenshot({ path: resolve(OUT, '90-title-resume.png') });
  await cont.click();

  await page.waitForURL(/stage=1-2&go=1&resume=1/);
  await ready(page, '1-2');
  const seen = await watchSkip(page);
  const app = page.locator('#app');
  // Straight to mission 2's card: no opening.
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('ミッション 2');
  await expect(page.locator('#card')).toContainText('ねぼすけ');
  await expect(app).toHaveAttribute('data-mission', '1');
  await standsAt(page, 'main', 560);
  await expect(page.locator('#jump')).toBeVisible();
  // The light comes with mission 2's own end.
  await expect(page.locator('#light')).toBeHidden();
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  expect((await saved(page)).abilities).toContain('jump');
  await page.screenshot({ path: resolve(OUT, '91-resume-1-2.png') });
  await page.locator('#card-button').click();

  // It drives on from there.
  await waitDriving(page);
  await setNotch(page, SLOW);
  await waitFor(page, 'main', 590 - FRONT);
  await setNotch(page, STOP);
  expect(await seen()).toBe(false);
  expect((await saved(page)).resume).toEqual({ stage: '1-2', mission: 1 });
  expect(errors).toEqual([]);
});

test('resume 2-2 in place: grass grown, the flowers passed in bloom, the passengers of the missions before', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, {
    cleared: ['1-1', '1-2', '1-3', '2-1'],
    abilities: ['whistle', 'jump', 'light'],
    mapLinks: ALL_LINKS.slice(0, 4),
    resume: { stage: '2-2', mission: 2 },
  });
  await page.goto('/?stage=2-2');
  await ready(page, '2-2');
  const app = page.locator('#app');
  await expect(page.locator('#title-continue')).toHaveText('つづきから（2-2 ミッション 3）');
  await expect(page.locator('#title-start')).toHaveText('はじめから（2-2）');
  // The same stage: it goes on in place (no reload).
  await page.locator('#title-continue').click();
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('くもの いとの せんろ');
  expect(page.url()).not.toContain('resume=1');
  await expect(app).toHaveAttribute('data-mission', '2');
  await standsAt(page, 'main', 1960);
  // Both flowers on the way here bloomed in mission 2; the one on the silk rail is still ahead, closed.
  await expect(app).toHaveAttribute('data-bridges', '1,1,0');
  // The opening's grass (the "shrinking" figures) stands grown.
  const actors = (await app.getAttribute('data-cutscene-actors'))?.split(',') ?? [];
  expect(actors).toEqual(expect.arrayContaining(['kusa-1', 'kusa-8', 'hana-1', 'hana-3']));
  expect(actors).toHaveLength(11);
  // Two got on at the clover station (mission 1) and off at the flower field (mission 2).
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  await expect(app).toHaveAttribute('data-camera', 'cab');
  await page.locator('#card-button').click();
  await waitDriving(page);
  // Looking back from the front: the flower bridge at 1790–1840 is open behind the train.
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator('.camera-tile[data-mode="chase"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-camera', 'chase');
  await waitGame(page, 1.5);
  await page.screenshot({ path: resolve(OUT, '92-resume-2-2-m3.png') });

  // Mission 2 of 2-2: the two passengers of mission 1 ride along; no flower is open yet.
  await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key) ?? '{}');
    data.resume = { stage: '2-2', mission: 1 };
    localStorage.setItem(key, JSON.stringify(data));
  }, KEY);
  await page.goto('/?stage=2-2&go=1&resume=1');
  await ready(page, '2-2');
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('ちょうちょの はなばし');
  await standsAt(page, 'main', 1070);
  await expect(app).toHaveAttribute('data-bridges', '0,0,0');
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '2');
  await page.screenshot({ path: resolve(OUT, '93-resume-2-2-m2.png') });
  expect(errors).toEqual([]);
});

test('resume 2-3 mission 3 (the countdown) to the clear: "▶▶" on the ending, the resume forgotten', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  // 2-3 cleared before (going back for the records): the ending can be skipped. No rocket in the save: only the
  // fast-forwarded opening gives it.
  await seed(page, {
    cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'],
    abilities: ['whistle', 'jump', 'light'],
    mapLinks: ALL_LINKS,
    resume: { stage: '2-3', mission: 2 },
  });
  await page.goto('/?stage=2-3');
  await ready(page, '2-3');
  const app = page.locator('#app');
  const rocket = page.locator('#rocket');
  await expect(page.locator('#title-continue')).toHaveText('つづきから（2-3 ミッション 3）');
  await page.locator('#title-continue').click();
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('はしが おちる');
  await standsAt(page, 'main', 1810);
  await expect(rocket).toBeVisible();
  await expect(app).toHaveAttribute('data-has-rocket', '1');
  // Mission 2's glimpse of the round hat came and went.
  expect(await app.getAttribute('data-cutscene-actors')).not.toContain('sakasa');
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  expect((await saved(page)).abilities).toContain('rocket');
  await page.screenshot({ path: resolve(OUT, '94-resume-2-3-m3.png') });
  await page.locator('#card-button').click();

  // Down the slide (jump rock E), the observatory, then the countdown to the cape.
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-rocket-pips', '3');
  await setNotch(page, NORMAL);
  await waitFor(page, 'kudari', 45 - FRONT);
  await expect(app).toHaveAttribute('data-slope', 'down', { timeout: 30_000 });
  const jump = page.locator('#jump');
  await expect(jump).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await jump.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 5_000 });
  await stopAt(page, 'kudari', 450);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '1');
  await tapUntil(page, '#timer', 60_000);
  await expect(app).toHaveAttribute('data-timer-state', 'run');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Rolling rock F: wait in front of it (as Pico asks) until it has rolled by.
  await waitFor(page, 'kudari', 532 - FRONT);
  await setNotch(page, STOP);
  await expect(app).toHaveAttribute('data-rocks', /rock-f:roll/, { timeout: 60_000 });
  await waitGame(page, 4.5);
  await setNotch(page, NORMAL);
  await waitFor(page, 'kudari', 640 - FRONT);
  await setNotch(page, FAST);
  await expect(rocket).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await rocket.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-timer-state', 'safe', { timeout: 120_000 });
  await stopAt(page, 'kudari', 1035);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  await card(page, 'できた');

  // The ending, skipped at its first line: the bridge is down at once (no fall), the fixed camera is gone, the
  // round hat came and went, and the next card is the clear card (the chapter card was part of the rest).
  const skip = page.locator('#skip');
  await expect(skip).toBeVisible({ timeout: 60_000 });
  await expect(app).toHaveAttribute('data-camera', 'fixed');
  await page.screenshot({ path: resolve(OUT, '95-skip-ending.png') });
  await skip.dispatchEvent('pointerdown');
  await skip.dispatchEvent('pointerdown');
  await expect(page.locator('#card')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#card')).toContainText('クリア');
  // Its button waits a moment after a skip.
  await expect(page.locator('#card-button')).toHaveClass(/is-guarded/);
  await expect(app).toHaveAttribute('data-rail-cut', 'kudari:765-865');
  expect(await app.getAttribute('data-cutscene-actors')).not.toContain('sakasa');
  await expect(app).not.toHaveAttribute('data-camera', 'fixed');
  await expect(page.locator('#bubble')).toBeHidden();
  await expect(page.locator('#caption')).toBeHidden();
  await expect(skip).toBeHidden();
  await expect(page.locator('#card-button')).not.toHaveClass(/is-guarded/, { timeout: 5_000 });
  await page.screenshot({ path: resolve(OUT, '96-skip-clear-card.png') });
  expect((await saved(page)).resume).toEqual({ stage: '2-3', mission: 2 });
  await page.locator('#card-button').click();

  // Cleared: the resume is forgotten; the title offers the map again (everything is cleared).
  await expect(page.locator('#map')).toBeVisible({ timeout: 30_000 });
  const after = await saved(page);
  expect(after.resume).toBeUndefined();
  expect(after.cleared).toContain('2-3');
  await page.goto('/');
  await ready(page, '1-1');
  await expect(page.locator('#title-continue')).toHaveCount(0);
  await expect(page.locator('#title-map')).toHaveClass(/is-primary/);
  await expect(page.locator('#title-start')).toHaveText('はじめる');
  expect(errors).toEqual([]);
});

test('"▶▶" only on a stage cleared before: 1-1 opening skipped to the first card, then a resume is written', async ({ page }) => {
  const errors = watchErrors(page);
  const app = page.locator('#app');
  // Not cleared yet: no "▶▶" through the opening.
  await page.goto('/?stage=1-1');
  await ready(page, '1-1');
  await expect(page.locator('#title-continue')).toHaveCount(0);
  await page.locator('#title-start').click();
  const seen = await watchSkip(page);
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('にゅうたい');
  expect(await seen()).toBe(false);

  // Cleared before: "▶▶" over the caption, tapped twice.
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: ['1-1'], abilities: ['whistle'], records: [], mapLinks: [] }));
  }, KEY);
  await page.goto('/?stage=1-1&go=1');
  await ready(page, '1-1');
  const skip = page.locator('#skip');
  await expect(skip).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, '97-skip-opening.png') });
  // Next to the camera and the pause button, the same size, not over them.
  const [s, c] = await Promise.all([skip.boundingBox(), page.locator('#camera').boundingBox()]);
  if (!s || !c) throw new Error('corner buttons not laid out');
  expect(Math.abs(s.y - c.y)).toBeLessThanOrEqual(2);
  expect(s.x + s.width).toBeLessThan(c.x);
  await skip.dispatchEvent('pointerdown');
  await skip.dispatchEvent('pointerdown');
  // The badge card was part of the rest: straight to mission 1, its button held back a moment.
  await expect(page.locator('#card')).toContainText('はじめての うんてん', { timeout: 30_000 });
  await expect(page.locator('#card-button')).toHaveClass(/is-guarded/);
  await expect(page.locator('#caption')).toBeHidden();
  await expect(page.locator('#bubble')).toBeHidden();
  await expect(skip).toBeHidden();
  await expect(app).toHaveAttribute('data-camera', 'cab');
  await expect(page.locator('#card-button')).not.toHaveClass(/is-guarded/, { timeout: 5_000 });
  await page.screenshot({ path: resolve(OUT, '98-skip-first-card.png') });
  expect((await saved(page)).resume).toBeUndefined();
  await page.locator('#card-button').click();

  // Mission 1 to the cherry station; its "できた！" card writes the resume at mission 2.
  await waitDriving(page);
  await setNotch(page, SLOW);
  await waitFor(page, 'loop', 155 - FRONT - 4.5);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('できた');
  expect((await saved(page)).resume).toBeUndefined();
  await page.locator('#card-button').click();
  await expect(page.locator('#card')).toContainText('なかまを のせて');
  expect((await saved(page)).resume).toEqual({ stage: '1-1', mission: 1 });
  await expect(skip).toBeHidden();
  expect(errors).toEqual([]);
});
