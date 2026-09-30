import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { budget, card, FRONT, lightOnGlow, lightTo, NORMAL, pressOnGlow, progress, recordLines, setNotch, SLOW, STOP, waitCaught, waitDriving, waitFront } from './drive';

/**
 * PR5「じしゃくライトの 土台」(PHASE9_CHAPTER5_6 第 2 部 M20, PHASE9_0): the light button's three steps (ライト → じしゃく →
 * けす; two before the magnet light is learned), the green glow before an iron thing (a hint only), the magnet pulling
 * one target at a time by itself (the train slower while it pulls), a gap and a gate that "ぽよん" the train without it
 * (in the air too) and open with it, the iron odds and ends ("びよん" … "からん"), the records it fetches; on the test
 * course 0-0's side way `jishaku`, and on the hidden test stage 0-4 てすとの じしゃく the partner's lines, the soft fail
 * and its rewind, the mirror that turns round, the side way that needs the magnet, a save without the magnet, and the
 * cutscene's first go ("press": "magnet") played and skipped.
 *
 * Built for about 10 fps software GL: presses that must land in a window are checked and made in the same page callback
 * (drive.ts), and short states are kept by a MutationObserver in the page (window.__magnet) and read afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const ALL = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'];

interface MagnetLog {
  /** The light's step each time it changed, with the front (rail, s). */
  steps: { mode: string; rail: string; front: number }[];
  /** Where the green glow first showed (rail, front), per rail. */
  firstGlow: Record<string, number>;
  glowedGreen: boolean;
  minPullSpeed: number;
  maxSpeedInIron: number;
  fails: { reason: string; front: number }[];
}

/** Keeps the light's steps, the first green glow, the slowest speed while pulling, the fails (window.__magnet). */
async function recordMagnet(page: Page, ironFrom = Infinity, ironTo = -Infinity, ironRail = 'jishaku'): Promise<void> {
  await page.addInitScript(
    ([from, to, rail]) => {
      const log = { steps: [] as { mode: string; rail: string; front: number }[], firstGlow: {} as Record<string, number>, glowedGreen: false, minPullSpeed: Infinity, maxSpeedInIron: 0, fails: [] as { reason: string; front: number }[] };
      (window as unknown as { __magnet: typeof log }).__magnet = log;
      let mode = '';
      let fails = 0;
      new MutationObserver(() => {
        const app = document.getElementById('app');
        const b = document.getElementById('light');
        if (!app || !b) return;
        const d = app.dataset;
        const front = Number(d.s) + 6;
        if (b.dataset.light && b.dataset.light !== mode) {
          mode = b.dataset.light;
          log.steps.push({ mode, rail: d.rail ?? '', front });
        }
        if (b.dataset.glow === '1' && b.dataset.glowFor === 'magnet' && d.phase !== 'cutscene') {
          log.glowedGreen = true;
          const r = d.rail ?? '';
          if (log.firstGlow[r] === undefined) log.firstGlow[r] = front;
        }
        if (d.magnet === 'pull') log.minPullSpeed = Math.min(log.minPullSpeed, Number(d.speed));
        if (d.rail === rail && front >= Number(from) && front <= Number(to) && d.magnet !== 'pull') log.maxSpeedInIron = Math.max(log.maxSpeedInIron, Number(d.speed));
        const n = Number(d.fails ?? 0);
        if (n > fails) {
          fails = n;
          log.fails.push({ reason: d.failReason ?? '', front });
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-s', 'data-light', 'data-glow', 'data-magnet', 'data-fails', 'data-speed'] });
    },
    [ironFrom, ironTo, ironRail] as const,
  );
}

function magnetLog(page: Page): Promise<MagnetLog> {
  return page.evaluate(() => (window as unknown as { __magnet: MagnetLog }).__magnet);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** A save with these abilities (and cleared stages) before the page loads. */
async function seed(page: Page, abilities: string[], cleared: string[] = []): Promise<void> {
  await page.addInitScript(
    ([a, c]) => localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: c, abilities: a, records: [], mapLinks: [] })),
    [abilities, cleared] as const,
  );
}

/** The round buttons on screen do not overlap. */
async function roundsApart(page: Page): Promise<string[]> {
  const rounds = await page.locator('.round-button:visible').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: Math.min(r.width, r.height) / 2 };
    }),
  );
  for (let i = 0; i < rounds.length; i++) {
    for (let j = i + 1; j < rounds.length; j++) {
      const a = rounds[i];
      const b = rounds[j];
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(a.r + b.r - 0.5);
    }
  }
  return rounds.map((r) => r.id).sort();
}

/** Presses #light (one step) the moment the front passes `at` on `rail`. */
async function lightAt(page: Page, rail: string, at: number): Promise<void> {
  const pressed = await page.waitForFunction(
    ([r, t]) => {
      const app = document.getElementById('app');
      const b = document.getElementById('light');
      if (!app || !b || app.dataset.rail !== r || Number(app.dataset.s) < Number(t)) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    [rail, at - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe(true);
}

/** Jumps the moment the front passes `at` on `rail` (checked and pressed in one callback). */
async function jumpAt(page: Page, rail: string, at: number): Promise<void> {
  const pressed = await page.waitForFunction(
    ([r, t]) => {
      const app = document.getElementById('app');
      const b = document.getElementById('jump');
      if (!app || !b || app.dataset.rail !== r || Number(app.dataset.s) < Number(t)) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    [rail, at - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe(true);
}

test('0-0 jishaku: three steps, the green hint, the pull, mashing, the gap (in the air too), the gate, the odds and ends, a record not by light', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await recordMagnet(page, 300, 560);
  const app = page.locator('#app');
  const light = page.locator('#light');
  await page.goto('/?stage=0-0');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  // The test course has the magnet light: three steps, the dots under the button; six round buttons, none overlapping.
  await expect(light).toHaveAttribute('data-light', 'off');
  await expect(light).toHaveAttribute('data-steps', '3');
  expect(await roundsApart(page)).toEqual(['dive', 'jump', 'light', 'plow', 'rocket', 'whistle']);
  // ライト → じしゃく → けす → ライト (0.4 s apart), and back off.
  await lightTo(page, 'light');
  await expect(light).toHaveAttribute('data-on', '1');
  await lightTo(page, 'magnet');
  await expect(light).toHaveAttribute('data-on', '0');
  await expect(light).toHaveAttribute('aria-label', 'じしゃく');
  await page.locator('#light').screenshot({ path: resolve(OUT, 'magnet-button.png') });
  await lightTo(page, 'off');
  await lightTo(page, 'light');
  await lightTo(page, 'off');
  expect((await magnetLog(page)).steps.map((s) => s.mode)).toEqual(['off', 'light', 'magnet', 'off', 'light', 'magnet', 'off']);

  // Main: the rocket up the steep bit (240–310), then right at to-jishaku (560). The odds and ends on main never move
  // with the light off.
  await setNotch(page, NORMAL);
  await pressOnGlow(page, 'rocket');
  await waitFront(page, 'main', 505);
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('.arrow[data-side="right"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'jishaku', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-iron', '0');

  // The star (jishaku 90, 7 right, 3 up): the green glow from 80 m before it; pressed on to the magnet it is pulled by
  // itself, the train slower meanwhile; the step stays the child's.
  await lightOnGlow(page, 'magnet', 'jishaku', 80);
  await expect(app).toHaveAttribute('data-magnet', 'pull', { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, 'magnet-pull.png') });
  await waitCaught(page, 'hoshi');
  await expect(light).toHaveAttribute('data-light', 'magnet');
  let log = await magnetLog(page);
  expect(log.firstGlow.jishaku).toBeGreaterThanOrEqual(90 - 80 - 1);
  expect(log.firstGlow.jishaku).toBeLessThanOrEqual(90 - 75);
  expect(log.minPullSpeed).toBeLessThanOrEqual(6);
  await expect(app).toHaveAttribute('data-magnet-pulls', '1');

  // Mashing: ten taps in a second change the step no faster than one per 0.4 s; then to the light (no magnet).
  const before = log.steps.length;
  await page.evaluate(async () => {
    const b = document.getElementById('light') as HTMLElement;
    for (let i = 0; i < 10; i++) {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  log = await magnetLog(page);
  expect(log.steps.length - before).toBeLessThanOrEqual(4);
  expect(log.steps.length - before).toBeGreaterThanOrEqual(1);
  await lightTo(page, 'light');
  await expect(app).toHaveAttribute('data-magnet-pulls', '1');

  // The gap (jishaku 200–208) with the light: "ぽよん" off the soap film, back 60 m, green at once.
  await expect(app).toHaveAttribute('data-magnet-bumps', '1', { timeout: 60_000 });
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.rail === 'jishaku' && Number(d.s) + 6 < 145 && d.speed === '0.0';
  }, undefined, { timeout: 30_000 });
  await expect(light).toHaveAttribute('data-glow-for', 'magnet', { timeout: 10_000 });
  await expect(light).toHaveAttribute('data-light', 'light');
  await expect(app).toHaveAttribute('data-magnet-hanare', 'idle');
  // In the air too: jumping 30 m before the film still bumps it (it is too tall).
  await setNotch(page, 5);
  await jumpAt(page, 'jishaku', 170);
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-magnet-bumps', '2', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.rail === 'jishaku' && Number(d.s) + 6 < 145 && d.speed === '0.0';
  }, undefined, { timeout: 30_000 });
  // The magnet: the piece flies into the gap; the train goes over it.
  await lightTo(page, 'magnet');
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator('.camera-tile[data-mode="chase"]').dispatchEvent('pointerdown');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-magnet-hanare', 'open', { timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, 'magnet-bridge.png') });
  await waitFront(page, 'jishaku', 215);
  await expect(app).toHaveAttribute('data-magnet-bumps', '2');
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator('.camera-tile[data-mode="cab"]').dispatchEvent('pointerdown');

  // The gate (jishaku 380): with the light slowly, the magnet only 5 m before it: no "ぽよん", it opens.
  await lightTo(page, 'light');
  await setNotch(page, SLOW);
  await lightAt(page, 'jishaku', 375);
  await expect(light).toHaveAttribute('data-light', 'magnet');
  await expect(app).toHaveAttribute('data-magnet-tobira', 'open', { timeout: 10_000 });
  await waitFront(page, 'jishaku', 390);
  await expect(app).toHaveAttribute('data-magnet-bumps', '2');
  await page.screenshot({ path: resolve(OUT, 'magnet-gate.png') });

  // The odds and ends (jishaku 300–560: the scattered ones and the sign's bell at 450): "びよん" … "からん", no fail,
  // no slowing below the light's.
  await setNotch(page, NORMAL);
  await waitFront(page, 'jishaku', 560);
  expect(Number(await app.getAttribute('data-iron'))).toBeGreaterThanOrEqual(1);
  log = await magnetLog(page);
  expect(log.fails).toEqual([]);
  expect(log.maxSpeedInIron).toBeLessThanOrEqual(7.05);
  await page.screenshot({ path: resolve(OUT, 'magnet-iron.png') });

  // The record (jishaku 620, 12 right, 6 up) is not found by passing it with the light.
  await lightTo(page, 'light');
  await waitFront(page, 'jishaku', 640);
  expect((await app.getAttribute('data-records')) ?? '').not.toContain('test-bell');
  const b = await budget(page);
  console.log(`0-0 jishaku: draws ${b.draws}, triangles ${b.tris}`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100_000);
  expect(errors).toEqual([]);
});

/** Opens 0-4 straight into play, through its opening (the first go of the magnet), to driving. */
async function start04(page: Page): Promise<void> {
  const app = page.locator('#app');
  await page.goto('/?stage=0-4&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  // The opening waits for the light button, glowing green, the light already on.
  await page.waitForFunction(() => document.getElementById('app')?.dataset.cutscenePress === 'magnet', undefined, { timeout: 90_000 });
  await expect(page.locator('#light')).toHaveAttribute('data-light', 'light');
  await expect(page.locator('#light')).toHaveAttribute('data-glow-for', 'magnet');
  await page.locator('#light').dispatchEvent('pointerdown');
  await page.waitForFunction(() => !(document.getElementById('app')?.dataset.cutsceneActors ?? '').includes('tut-star'), undefined, { timeout: 30_000 });
  await card(page, 'ミッション 1');
  await waitDriving(page);
}

test('0-4 with the magnet: the first go, the lines, the side way and its record, the soft ぽよん and its rewind, the gate, the mirror', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await seed(page, [...ALL, 'magnetLight'], ['4-3']);
  await recordMagnet(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  const light = page.locator('#light');
  await start04(page);
  // The first go left the light on the magnet (the child's step).
  await expect(light).toHaveAttribute('data-light', 'magnet');
  await expect(light).toHaveAttribute('data-steps', '3');

  // The side way that needs the magnet (main 180, right): its record up high is pulled to the train and found; its
  // hint is said when nothing else is.
  await setNotch(page, NORMAL);
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('.arrow[data-side="right"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'yoko', { timeout: 60_000 });
  await waitCaught(page, 'record:test-suzu');
  await expect.poll(async () => (await progress(page)).records, { timeout: 30_000 }).toContain('test-suzu');
  // The spur's end puts the train back on main (past the fork).
  await expect(app).toHaveAttribute('data-rail', 'main', { timeout: 120_000 });
  await waitDriving(page);

  // The star (main 420, no line of its own): magnetNear, then "きゅいーん… くっついた！".
  await setNotch(page, NORMAL);
  await waitCaught(page, 'hoshi');
  // Off for the gap: "ぽよん" is a soft fail with its two lines, back 60 m, green at once.
  await lightTo(page, 'off');
  await expect(app).toHaveAttribute('data-fail-reason', 'magnet', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-fail-soft', '1');
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.phase === 'driving' && d.rail === 'main' && Math.abs(Number(d.s) + 6 - 540) < 1.5;
  }, undefined, { timeout: 60_000 });
  await expect(light).toHaveAttribute('data-glow-for', 'magnet', { timeout: 10_000 });
  await lightOnGlow(page, 'magnet', 'main', 600);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-magnet-hanare', 'open', { timeout: 60_000 });
  // The gate (780) with its own line and "あいた！"; the mirror (980) turns round and the fork (1012) takes the true way.
  await expect(app).toHaveAttribute('data-magnet-tobira', 'open', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-magnet-kurutto', 'open', { timeout: 120_000 });
  await waitFront(page, 'main', 1040);
  await expect(page.locator('#junction')).toBeHidden();
  await page.screenshot({ path: resolve(OUT, 'magnet-04.png') });
  const said = await lines();
  for (const line of [
    'たかい ところに すず！',
    'てつの ものだ！ じしゃくに しよう！',
    'きゅいーん… くっついた！',
    'ぽよん！ レールが たりない〜',
    'ひかったら じしゃくに してね',
    'てつの とびら！ じしゃく！',
    'あいた！',
    'くるっ！ ほんとうの みちが みえた！',
  ]) {
    expect(said, line).toContain(line);
  }
  expect(Number(await app.getAttribute('data-iron'))).toBeGreaterThanOrEqual(1);
  expect(said).toContain('びよん！ くっついちゃった！');
  const log = await magnetLog(page);
  expect(log.fails.map((f) => f.reason)).toEqual(['spur', 'magnet']);
  expect(errors).toEqual([]);
});

test('0-4 without the magnet: two steps, no green, the side way refused, the gap is ぽよん again and again', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await seed(page, ALL, ['4-3']);
  await recordMagnet(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  const light = page.locator('#light');
  await start04(page);
  // Without the magnet the first go's press is only the light (two steps).
  await expect(light).toHaveAttribute('data-light', 'light');
  await expect(light).toHaveAttribute('data-steps', '2');
  await lightTo(page, 'off');
  await lightTo(page, 'light');
  await lightTo(page, 'off');
  expect((await magnetLog(page)).steps.map((s) => s.mode)).toEqual(['off', 'light', 'off', 'light', 'off']);
  expect(await roundsApart(page)).toEqual(['dive', 'jump', 'light', 'plow', 'rocket', 'whistle']);

  // The side way needs the magnet: the arrow says so.
  await setNotch(page, NORMAL);
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('.arrow[data-side="right"]').dispatchEvent('pointerdown');
  await expect.poll(lines, { timeout: 20_000 }).toContain('じしゃくライトが あれば いけそう…');
  await waitFront(page, 'main', 230);
  // Past the star: no green, nothing pulled.
  await waitFront(page, 'main', 440);
  await expect(app).toHaveAttribute('data-magnet-hoshi', 'idle');
  // The gap: "ぽよん" and back, twice.
  await expect(app).toHaveAttribute('data-magnet-bumps', '1', { timeout: 120_000 });
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-magnet-bumps', '2', { timeout: 120_000 });
  const log = await magnetLog(page);
  expect(log.glowedGreen).toBe(false);
  expect(log.fails.map((f) => f.reason)).toEqual(['magnet', 'magnet']);
  expect(await app.getAttribute('data-magnet-pulls')).toBe('0');
  expect(errors).toEqual([]);
});

test('0-4 cleared: "▶▶" through the first go takes the star away and leaves the light off', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await seed(page, [...ALL, 'magnetLight'], ['4-3', '0-4']);
  const app = page.locator('#app');
  await page.goto('/?stage=0-4&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.waitForFunction(() => document.getElementById('app')?.dataset.cutscenePress === 'magnet', undefined, { timeout: 90_000 });
  await expect(page.locator('#skip')).toBeVisible({ timeout: 20_000 });
  await page.locator('#skip').dispatchEvent('pointerdown');
  await page.waitForFunction(() => !(document.getElementById('app')?.dataset.cutsceneActors ?? '').includes('tut-star'), undefined, { timeout: 30_000 });
  await card(page, 'ミッション 1');
  await expect(page.locator('#light')).toHaveAttribute('data-light', 'off');
  await expect(app).not.toHaveAttribute('data-cutscene-press', 'magnet');
  await setNotch(page, STOP);
  expect(errors).toEqual([]);
});
