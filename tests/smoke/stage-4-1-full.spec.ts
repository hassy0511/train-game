import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stage 4-1 "こおりのみずうみ" played through (docs/PHASE8_CHAPTER3_4.md 第 7 部 §15): ice (weak brakes, the two-step
 * glow at ice stations), thin ice (only the rocket gets across, "ぽちゃん" otherwise), the side way under the ice
 * hole (diving under a floe to the glowing shell), the mirror junctions (a train coming the other way in the mirror,
 * "かがみ だった〜", the light's "きらーん") and the ending with the big mirror. The gentle fails are made on purpose:
 * past an ice station, too slow on thin ice, the mirror's false way.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const FRONT = 6; // data-s is the lead car center; stations and zones are measured at the front
const STOP = 1;
const SLOW = 2;
const NORMAL = 3;
const FAST = 4;
const CH1 = ['1-1', '1-2', '1-3'];
const CH2 = ['2-1', '2-2', '2-3'];
const RING = ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1'];

async function tapUntil(page: Page, selector: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const line = /^#bubble:has-text\("(.+)"\)$/.exec(selector)?.[1];
  while (Date.now() < deadline) {
    if (await page.locator(selector).isVisible()) return;
    if (line !== undefined) {
      await page.evaluate((text) => {
        const bubble = document.getElementById('bubble');
        if (bubble && !bubble.hidden && !(bubble.textContent ?? '').includes(text)) {
          bubble.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        }
      }, line);
    } else if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  const said = await page.evaluate(() => ((window as unknown as { __lines?: string[] }).__lines ?? []).slice(-8).join(' / '));
  throw new Error(`timed out waiting for ${selector} (last lines: ${said})`);
}

async function card(page: Page, text: string, timeoutMs = 90_000): Promise<void> {
  await tapUntil(page, '#card', timeoutMs);
  await expect(page.locator('#card')).toContainText(text);
  await page.locator('#card-button').click();
}

async function tapNotch(page: Page, notch: number): Promise<void> {
  const box = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
}

async function setNotch(page: Page, notch: number): Promise<void> {
  await tapNotch(page, notch);
  await expect(page.locator('#app')).toHaveAttribute('data-notch', String(notch));
}

/** Waits until the train front is on `rail` at `at` or beyond. */
async function waitFront(page: Page, rail: string, at: number, timeoutMs = 240_000): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) >= Number(t);
    },
    [rail, at - FRONT] as const,
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
  throw new Error('not driving again');
}

async function waitGame(page: Page, seconds: number): Promise<void> {
  const t0 = Number(await page.locator('#app').getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + seconds, { timeout: 60_000 });
}

async function camera(page: Page, mode: 'cab' | 'chase' | 'side' | 'top'): Promise<void> {
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator(`.camera-tile[data-mode="${mode}"]`).dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-camera', mode);
}

/**
 * A fail: wait until the train is put back on `rail` before `below` (front) and driving again. The page keeps where the
 * train was while failing (see the init script), so a put-back that came and went during a slow screenshot still
 * counts; the list starts afresh after each one.
 */
async function waitRewound(page: Page, rail: string, below: number): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const seen = (window as unknown as { __failing: { rail: string; s: number }[] }).__failing;
      return seen.some((f) => f.rail === r && f.s < Number(t));
    },
    [rail, below - FRONT] as const,
    { timeout: 180_000 },
  );
  await waitDriving(page);
  await page.evaluate(() => {
    (window as unknown as { __failing: unknown[] }).__failing.length = 0;
  });
}

/**
 * An ice station: the lever goes to the notch that glows, "ゆっくり" then "とまる" (in the page, so no frame is missed
 * on a slow machine). Returns whether "ゆっくり" glowed first.
 */
async function iceStop(page: Page): Promise<boolean> {
  const slowFirst = await page.evaluate(
    () =>
      new Promise<boolean>((done) => {
        let slow = false;
        const poll = (): void => {
          const d = document.getElementById('app')?.dataset;
          if (d?.iceHint === 'slow') slow = true;
          if (d?.iceHint === 'stop') return done(slow);
          requestAnimationFrame(poll);
        };
        poll();
      }),
  );
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 30_000 });
  return slowFirst;
}

async function doors(page: Page): Promise<void> {
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

/** Presses the rocket every time it glows until the train front reaches `at` on `rail`. */
async function rocketOnGlow(page: Page, rail: string, at: number): Promise<{ presses: number; cracked: boolean }> {
  type Glow = { presses: number; cracked: boolean; last: number };
  await page.evaluate(() => {
    (window as unknown as { __glow: Glow }).__glow = { presses: 0, cracked: false, last: -1 };
  });
  await page.waitForFunction(
    ([r, t]) => {
      const app = document.getElementById('app');
      const rocket = document.getElementById('rocket');
      const g = (window as unknown as { __glow: Glow }).__glow;
      if (!app || !rocket) return false;
      if (app.dataset.thin === 'crack') g.cracked = true;
      const now = Number(app.dataset.time);
      if (rocket.dataset.glow === '1' && app.dataset.burn !== '1' && app.dataset.phase === 'driving' && now - g.last > 0.5) {
        g.last = now;
        g.presses += 1;
        rocket.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
      return app.dataset.rail === r && Number(app.dataset.s) >= Number(t);
    },
    [rail, at - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  return page.evaluate(() => {
    const g = (window as unknown as { __glow: Glow }).__glow;
    return { presses: g.presses, cracked: g.cracked };
  });
}

/** Presses "もぐる" each time it glows until the train front reaches `at` on `rail`. Returns the dives made. */
async function diveOnGlow(page: Page, rail: string, at: number): Promise<number> {
  await page.evaluate(() => {
    (window as unknown as { __dive: { last: number } }).__dive = { last: -1 };
  });
  await page.waitForFunction(
    ([r, t]) => {
      const app = document.getElementById('app');
      const seat = document.getElementById('jump');
      const g = (window as unknown as { __dive: { last: number } }).__dive;
      if (!app || !seat) return false;
      const now = Number(app.dataset.time);
      if (seat.dataset.mode === 'dive' && seat.dataset.glow === '1' && now - g.last > 0.5) {
        g.last = now;
        seat.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
      return app.dataset.rail === r && Number(app.dataset.s) >= Number(t);
    },
    [rail, at - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  return Number(await page.locator('#app').getAttribute('data-dives'));
}

const saved = (page: Page): Promise<{ cleared: string[]; records: string[]; mapLinks: string[] }> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));

test('stage 4-1 full run: ice, thin ice and the rocket, the ice hole, the mirror junctions, the ending', async ({ page }) => {
  test.setTimeout(3_600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // A save that has come this far: chapters 1 and 2 and 3-3 cleared (4-1 is open), with diving learned in 3-1.
  await page.addInitScript(
    ([ch, ring]) => {
      const key = 'train-game.progress.v1';
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          schema: 1,
          cleared: [...ch, '3-3'],
          abilities: ['whistle', 'jump', 'light', 'rocket', 'dive'],
          records: [],
          mapLinks: [...ring, '1-1>3-1'],
        }),
      );
    },
    [[...CH1, ...CH2], RING] as const,
  );
  await page.addInitScript(() => {
    const lines: string[] = [];
    (window as unknown as { __lines: string[] }).__lines = lines;
    new MutationObserver(() => {
      const line = document.getElementById('bubble')?.dataset.line;
      if (line && lines[lines.length - 1] !== line) lines.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-line'] });
  });
  // Where the train is while a fail plays (put back included), for waitRewound.
  await page.addInitScript(() => {
    const failing: { rail: string; s: number }[] = [];
    (window as unknown as { __failing: typeof failing }).__failing = failing;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (d?.phase === 'failing' && d.rail) failing.push({ rail: d.rail, s: Number(d.s) });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-s', 'data-phase', 'data-rail'] });
  });
  const saidSoFar = (): Promise<string> => page.evaluate(() => (window as unknown as { __lines: string[] }).__lines.join('\n'));

  await page.goto('/?stage=4-1');
  const app = page.locator('#app');
  const rocket = page.locator('#rocket');
  const light = page.locator('#light');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'koori');
  // Four round buttons at most, the jump seat among them.
  await expect(page.locator('.round-button:visible')).toHaveCount(4);

  // ---- M1 つるつる こおり ----
  await card(page, 'つるつる こおり', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Onto the ice: the knob's snow crystal, the sign and the pale blue bed.
  await waitFront(page, 'main', 215);
  await expect(app).toHaveAttribute('data-ice', '1');
  await expect(page.locator('#lever-knob')).toHaveAttribute('data-mark', 'ice');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('こおりの うえだ！');
  await page.screenshot({ path: resolve(OUT, '4-1-01-ice.png') });
  // Braking on ice the first time: "しゃーっ…".
  await setNotch(page, SLOW);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('しゃーっ');
  await setNotch(page, NORMAL);
  // The frost flower (record ①) on the way.
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}').records ?? []).includes('frost-flower'), null, { timeout: 120_000 });
  // The seal sunning itself on the rail slides off at the whistle.
  await waitFront(page, 'main', 365);
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('すいーっと どいて');
  await camera(page, 'side');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '4-1-02-seal.png') });
  await camera(page, 'cab');
  // Snowbirds crossing: slow down early (90 m before) and they get across in time.
  await waitFront(page, 'main', 472);
  await setNotch(page, SLOW);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('とりさんだ！');
  await waitFront(page, 'main', 520);
  await page.screenshot({ path: resolve(OUT, '4-1-03-snowbirds.png') });
  await waitFront(page, 'main', 575);
  expect(await saidSoFar()).not.toContain('びっくり');
  await expect(app).toHaveAttribute('data-phase', 'driving');

  // つりばえき on purpose too fast (ふつう into the stop zone): "つるーん", soft, back 80 m before it.
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-ice-hint', 'slow', { timeout: 120_000 });
  await expect(page.locator('.lever-detent[data-notch="2"]')).toHaveAttribute('data-hint', '1');
  await page.screenshot({ path: resolve(OUT, '4-1-04-ice-slow-glow.png') });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('つるつる！ はやめに ブレーキ！');
  await waitRewound(page, 'main', 700);
  expect(await saidSoFar()).toContain('つるーん！');
  expect(await saidSoFar()).toContain('こおりは はやめに ブレーキ ね');
  console.log('4-1: past つりばえき on the ice ("つるーん"), back before it');
  // Again: ゆっくり, and "とまる" when it glows.
  await setNotch(page, SLOW);
  const slowFirst = await iceStop(page);
  console.log(`4-1: stopped at つりばえき on the glow (ゆっくり glowed first: ${slowFirst})`);
  await page.screenshot({ path: resolve(OUT, '4-1-05-ice-stop.png') });
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '2');
  await card(page, 'できた');

  // ---- M2 われる こおり ----
  await card(page, 'われる こおり');
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-rocket-pips', '3');
  // Thin ice ① without the rocket: "ぴしぴし" then "ぽちゃん" (the cars bob up like a toy boat), back 150 m before it.
  await setNotch(page, FAST);
  await expect(app).toHaveAttribute('data-thin', /on|crack/, { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-cracks', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-camera', 'chase');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-1-06-pochan.png') });
  await waitRewound(page, 'main', 800);
  expect(await saidSoFar()).toContain('ぴしぴし！');
  expect(await saidSoFar()).toContain('ぽちゃん！ ぷかぷか〜');
  await expect(app).toHaveAttribute('data-rocket-pips', '3');
  console.log('4-1: too slow on thin ice ①: ぽちゃん, back before it');
  // Again: the rocket glows, pressed it gets across; the ice breaks into floes behind.
  await setNotch(page, FAST);
  await expect(rocket).toHaveAttribute('data-glow', '1', { timeout: 120_000 });
  const glowAt = Number(await app.getAttribute('data-s')) + FRONT;
  const one = await rocketOnGlow(page, 'main', 1000);
  console.log(`4-1: thin ice ① glowed at main ${glowAt.toFixed(0)}, ${one.presses} press(es)`);
  expect(one.cracked).toBe(false);
  expect(one.presses).toBe(1);
  await page.screenshot({ path: resolve(OUT, '4-1-07-thin-broken.png') });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('わたれた！');
  // Thin ice ②, 120 m: two presses ("もういっかい！").
  const two = await rocketOnGlow(page, 'main', 1580);
  console.log(`4-1: thin ice ② ${two.presses} press(es)`);
  expect(two.cracked).toBe(false);
  expect(two.presses).toBe(2);
  await expect(app).toHaveAttribute('data-rocket-pips', '0');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('まだ こおりの うえ！');
  await expect(app).toHaveAttribute('data-phase', 'driving');

  // The side way under the ice hole: dive under the floe, find the glowing shell.
  await setNotch(page, NORMAL);
  await expect(page.locator('#junction')).toBeVisible({ timeout: 120_000 });
  await page.locator('#junction .arrow[data-side="left"]').dispatchEvent('pointerdown');
  await waitFront(page, 'ana', 5);
  await expect(page.locator('#jump')).toHaveAttribute('data-mode', 'dive', { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, '4-1-08-ice-hole.png') });
  const dives = await diveOnGlow(page, 'ana', 140);
  console.log(`4-1: dived ${dives} time(s) in the ice hole`);
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}').records ?? []).includes('glow-shell'), null, { timeout: 60_000 });
  expect(Number(await app.getAttribute('data-dive-bounces'))).toBe(0);
  await waitFront(page, 'main', 1905);
  // こじまえき: slow down on the island's snow, then on the glow.
  await setNotch(page, SLOW);
  await iceStop(page);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  await card(page, 'できた');
  // The glimpse: Sakasa skating alone on the ice.
  await tapUntil(page, '#bubble:has-text("ひとりで すべってる")', 90_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '4-1-09-glimpse.png') });

  // ---- M3 かがみの わかれみち ----
  await card(page, 'かがみの わかれみち', 120_000);
  await waitDriving(page);
  await setNotch(page, FAST);
  const three = await rocketOnGlow(page, 'main', 2490);
  expect(three.cracked).toBe(false);
  expect(three.presses).toBe(1);
  // The first mirror junction, without the light: the false way, a train coming the other way in the mirror.
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 2560);
  await expect(light).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('むこうにも ワンダーごう');
  await page.screenshot({ path: resolve(OUT, '4-1-10-mirror-ahead.png') });
  await waitFront(page, 'kagami1', 20, 120_000);
  await expect(app).toHaveAttribute('data-mirror', /\d+/);
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('もう 1だい');
  await page.screenshot({ path: resolve(OUT, '4-1-11-mirror-train.png') });
  await expect(app).toHaveAttribute('data-phase', 'failing', { timeout: 60_000 });
  await page.screenshot({ path: resolve(OUT, '4-1-12-mirror-face.png') });
  await camera(page, 'chase');
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '4-1-13-mirror-chase.png') });
  await camera(page, 'cab');
  await waitRewound(page, 'main', 2600);
  expect(await saidSoFar()).toContain('かがみ だった〜！');
  console.log('4-1: took the mirror way: かがみ だった〜, back before the junction');
  // Again with the light: "きらーん", the true way lights up and the train takes it.
  await setNotch(page, NORMAL);
  await expect(light).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '1');
  await expect(app).toHaveAttribute('data-mirror-flash', /[1-9]/, { timeout: 60_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '4-1-14-kiraan.png') });
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('きらーん！');
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('ほんとうの みちが ひかった！');
  await waitFront(page, 'main', 2700);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // The second mirror junction, the light still on: the true way again.
  await waitFront(page, 'main', 2900);
  await expect(app).toHaveAttribute('data-rail', 'main');
  await waitGame(page, 0.6);
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '0');
  expect(await saidSoFar()).not.toContain('ちりん…'.repeat(2));
  // きしべえき on the cove's ice.
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 3060);
  await setNotch(page, SLOW);
  await iceStop(page);
  await card(page, 'できた');

  // The ending: Sakasa's back in the big mirror, then off to the tunnel.
  await tapUntil(page, '#bubble:has-text("サカサだ！")', 120_000);
  await expect(app).toHaveAttribute('data-camera', 'fixed');
  await expect(app).toHaveAttribute('data-mirror', /\d+/);
  await page.screenshot({ path: resolve(OUT, '4-1-15-ending-mirror.png') });
  await tapUntil(page, '#bubble:has-text("こんにちは")', 120_000);
  await page.screenshot({ path: resolve(OUT, '4-1-16-ending-tunnel.png') });
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await expect(page.locator('#reward-records .reward-record')).toHaveCount(3);
  await page.screenshot({ path: resolve(OUT, '4-1-17-clear.png') });

  const progress = await saved(page);
  expect(progress.records).toEqual(expect.arrayContaining(['frost-flower', 'glow-shell']));
  expect(progress.records).not.toContain('ice-bell');
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`4-1 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  expect(budget.draws).toBeLessThanOrEqual(200);
  expect(budget.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  expect((await saved(page)).cleared).toContain('4-1');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-1-18-map.png') });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  expect(errors).toEqual([]);
});

/** Every 4-1 model (code stand-ins until ticket 0015) opens on the model page without an error. */
test('4-1 models on the model page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const names = [
    'snow-pine',
    'snow-bank',
    'snow-island',
    'snow-mountain',
    'tunnel-mouth',
    'ice-hut',
    'ice-hole',
    'ice-wall',
    'seal',
    'seal-sleep',
    'snowbird',
    'frost-flower',
    'glow-shell',
    'ice-bell',
    'sign-ice',
    'sign-thin-ice',
  ];
  for (const name of names) {
    await page.goto(`/models.html?model=${name}`);
    await expect(page.locator('#name')).toHaveText(name, { timeout: 60_000 });
    await expect(page.locator('#dims')).toContainText('三角形', { timeout: 60_000 });
    const tris = Number(/(\d+) 三角形/.exec((await page.locator('#dims').textContent()) ?? '')?.[1]);
    expect(tris, name).toBeGreaterThan(0);
  }
  await page.goto('/models.html?compare=seal-sleep,seal,snowbird,frost-flower,glow-shell,ice-bell');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-1-models.png') });
  expect(errors).toEqual([]);
});
