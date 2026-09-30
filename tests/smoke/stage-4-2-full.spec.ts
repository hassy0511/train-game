import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { magnetRecordRun } from './drive';

/**
 * Stage 4-2 "おおゆきの むら" played through (docs/PHASE8_CHAPTER3_4.md 第 6 部 §15): the snowplow learned in the
 * opening; a wall bumped on purpose ("ぽすっ", the snowy window and the wiper, back 60 m with the button glowing), then
 * burst ("ずぼーん！"); a long buried stretch cleared; the buried station; "こんどは ジャンプ！" and the jump
 * for the stream; the side way whose wall hides the mitten; the ski jump called out with the whistle over the snowy
 * valley; two walls with one press; the buried uphill (the wall stays open after slipping back without the rocket);
 * the snow shed's swirl marks in the light; the ice station of the plaza; the evening festival.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const FRONT = 6; // data-s is the lead car center; stations and zones are measured at the front
const STOP = 1;
const SLOW = 2;
const NORMAL = 3;
const FAST = 4;
const DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '4-1'];

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

async function setNotch(page: Page, notch: number): Promise<void> {
  const box = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
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

async function camera(page: Page, mode: 'cab' | 'chase' | 'side' | 'top'): Promise<void> {
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator(`.camera-tile[data-mode="${mode}"]`).dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-camera', mode);
}

/** A fail: wait until the train is put back on `rail` before `below` (front) and driving again. */
async function waitRewound(page: Page, rail: string, below: number): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) < Number(t) && el?.dataset.phase === 'failing';
    },
    [rail, below - FRONT] as const,
    { timeout: 180_000 },
  );
  await waitDriving(page);
}

async function stopAt(page: Page, rail: string, at: number, slowFrom = 55, brake = 4.5): Promise<void> {
  await waitFront(page, rail, at - slowFrom);
  await setNotch(page, SLOW);
  await waitFront(page, rail, at - brake);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

async function doors(page: Page): Promise<void> {
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

/**
 * Presses a round button (`id`: jump, plow, rocket ...) each time it glows until the train front
 * reaches `at` on `rail` (in the page, so no frame is missed on a slow machine). Returns the presses.
 */
async function pressOnGlow(page: Page, id: string, rail: string, at: number): Promise<number> {
  await page.evaluate(() => {
    (window as unknown as { __glow: { presses: number; last: number } }).__glow = { presses: 0, last: -1 };
  });
  await page.waitForFunction(
    ([button, r, t]) => {
      const app = document.getElementById('app');
      const b = document.getElementById(button as string);
      const g = (window as unknown as { __glow: { presses: number; last: number } }).__glow;
      if (!app || !b) return false;
      const now = Number(app.dataset.time);
      if (b.dataset.glow === '1' && app.dataset.phase === 'driving' && app.dataset.burn !== '1' && now - g.last > 0.5) {
        g.last = now;
        g.presses += 1;
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
      return app.dataset.rail === r && Number(app.dataset.s) >= Number(t);
    },
    [id, rail, at - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  return page.evaluate(() => (window as unknown as { __glow: { presses: number } }).__glow.presses);
}

/** An ice station: the lever goes to the notch that glows, "ゆっくり" then "とまる". */
async function iceStop(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const poll = (): void => {
          if (document.getElementById('app')?.dataset.iceHint === 'stop') return done();
          requestAnimationFrame(poll);
        };
        poll();
      }),
  );
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 30_000 });
}

const saved = (page: Page): Promise<{ cleared: string[]; records: string[]; abilities: string[] }> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
const hasRecord = (page: Page, id: string): Promise<unknown> =>
  page.waitForFunction((r) => (JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}').records ?? []).includes(r), id, { timeout: 120_000 });

test('stage 4-2 full run: the snowplow, the buried station, the ski jump, the buried uphill, the festival', async ({ page }) => {
  test.setTimeout(3_600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // A save that has come this far: chapters 1 and 2, 3-1 and 4-1 cleared (4-2 is open), diving learned.
  await page.addInitScript((done) => {
    const key = 'train-game.progress.v1';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: done, abilities: ['whistle', 'jump', 'light', 'rocket', 'dive'], records: [], mapLinks: [] }));
  }, DONE);
  await page.addInitScript(() => {
    const lines: string[] = [];
    (window as unknown as { __lines: string[] }).__lines = lines;
    new MutationObserver(() => {
      const line = document.getElementById('bubble')?.dataset.line;
      if (line && lines[lines.length - 1] !== line) lines.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-line'] });
  });
  const saidSoFar = (): Promise<string> => page.evaluate(() => (window as unknown as { __lines: string[] }).__lines.join('\n'));

  await page.goto('/?stage=4-2');
  const app = page.locator('#app');
  const plow = page.locator('#plow');
  const rocket = page.locator('#rocket');
  const light = page.locator('#light');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '4-2-01-village.png') });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'mura');

  // ---- The opening: the snowplow is learned ----
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('ゆきかき');
  await expect(page.locator('#card')).toContainText('おぼえた');
  await page.screenshot({ path: resolve(OUT, '4-2-02-learned.png') });
  await page.locator('#card-button').click();
  expect((await saved(page)).abilities).toContain('plow');
  // All six round buttons now (whistle, jump, light, rocket, dive, snowplow): the snowplow has its own button.
  await expect(plow).toBeVisible();
  await expect(page.locator('.round-button:visible')).toHaveCount(6);
  await expect.poll(saidSoFar, { timeout: 10_000 }).toContain('むらさきの ボタンが ゆきかき！');

  // ---- M1 ゆきかき しゅっぱつ ----
  await card(page, 'ゆきかき しゅっぱつ', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Wall 1 (main 260): the purple snowplow button glows 80 m before it (until then it does not).
  await expect(plow).toHaveAttribute('data-glow', '0');
  await waitFront(page, 'main', 186);
  await expect(plow).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-plow', 'near');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ゆきの かべ！ ゆきかきを おして！');
  await page.screenshot({ path: resolve(OUT, '4-2-03-plow-button.png') });
  // Not pressed on purpose. A jump does not clear a snow wall either (PHASE9_0 §3, too tall): jump 6 m short of it,
  // seen in the air, and the front still meets it: "ぽすっ", the snowy window and the wiper, soft (no shake), back
  // 60 m before the wall. (Checked in the page every frame, so a slow machine misses nothing.)
  await expect(app).toHaveAttribute('data-plow-bumps', '0');
  const jumpedAtWall = await page.evaluate(
    () =>
      new Promise<{ air: boolean; bumps: string | undefined; timedOut: boolean }>((resolve) => {
        const app = document.getElementById('app') as HTMLElement;
        const deadline = Date.now() + 120_000;
        let pressed = false;
        let air = false;
        const tick = (): void => {
          if (!pressed && app.dataset.rail === 'main' && Number(app.dataset.s) + 6 >= 254 && app.dataset.phase === 'driving') {
            pressed = true;
            document.getElementById('jump')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          }
          if (pressed && app.dataset.air === '1') air = true;
          if (app.dataset.plowBumps !== '0') resolve({ air, bumps: app.dataset.plowBumps, timedOut: false });
          else if (Date.now() > deadline) resolve({ air, bumps: app.dataset.plowBumps, timedOut: true });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(jumpedAtWall).toEqual({ air: true, bumps: '1', timedOut: false });
  await expect(app).toHaveAttribute('data-plow-bumps', '1', { timeout: 60_000 });
  await expect(page.locator('.snow-splat')).toHaveClass(/is-on/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '4-2-04-bump.png') });
  await expect(app).toHaveAttribute('data-wall-0', 'dented');
  await waitRewound(page, 'main', 230);
  expect(await saidSoFar()).toContain('ぽすっ！ ゆきに ささった〜');
  expect(await saidSoFar()).toContain('ひかったら ゆきかきを おしてね');
  // Put back 60 m before the wall with the button already glowing.
  await expect(plow).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  console.log('4-2: bumped wall 1 without the snowplow ("ぽすっ"), back before it');
  // Pressed now (standing still works): "かこん", and ten more presses do nothing.
  await plow.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-plow', 'on');
  for (let i = 0; i < 10; i++) await plow.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-blade-drops', '1');
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-plow-bursts', '1', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-wall-0', 'burst');
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, '4-2-05-burst.png') });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ずぼーん！');
  // Wall 2 and its long buried stretch: plowing all the way ("ざざざ〜！").
  const two = await pressOnGlow(page, 'plow', 'main', 505);
  expect(two).toBe(1);
  await waitFront(page, 'main', 540);
  await expect(app).toHaveAttribute('data-plowing', '1');
  await expect(plow).toHaveAttribute('data-plowing', '1');
  await camera(page, 'chase');
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '4-2-06-plowing.png') });
  await camera(page, 'cab');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ながい ゆきの みち！');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ざざざ〜！');
  // Out of the stretch the blade folds up; the frozen waterfall (record ①).
  await waitFront(page, 'main', 680);
  await expect(app).toHaveAttribute('data-plow', '');
  await hasRecord(page, 'frozen-fall');
  // Wall 3 buries かまくらえき: cleared, the platform comes out of the snow.
  const three = await pressOnGlow(page, 'plow', 'main', 925);
  expect(three).toBe(1);
  await expect(app).toHaveAttribute('data-wall-2', 'burst');
  await stopAt(page, 'main', 1010);
  await page.screenshot({ path: resolve(OUT, '4-2-07-buried-station.png') });
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '2');
  expect(Number(await app.getAttribute('data-plow-bumps'))).toBe(1);
  await card(page, 'できた');

  // ---- M2 ゆきかきと ジャンプ ----
  await card(page, 'ゆきかきと ジャンプ');
  await waitDriving(page);
  // Still in the buried stretch: the blade stays down and clears the way out.
  await expect(app).toHaveAttribute('data-plow', 'on');
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 1085);
  // Past it the blade folds up (the button goes back up and stops glowing); there is no "back to the jump" line any
  // more, but a hint before the gap: "こんどは ジャンプ！" (main 1130).
  await expect(plow).toHaveAttribute('data-blade', '0', { timeout: 20_000 });
  await expect(plow).toHaveAttribute('data-glow', '0');
  expect(await saidSoFar()).not.toContain('ボタンが ジャンプに もどった！');
  await page.screenshot({ path: resolve(OUT, '4-2-08-blade-up.png') });
  await waitFront(page, 'main', 1140);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('こんどは ジャンプ！');
  // The stream (1200–1216): jump when it glows.
  const jumps = await pressOnGlow(page, 'jump', 'main', 1225);
  expect(jumps).toBeGreaterThanOrEqual(1);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  // The side way: up the hill to the left, its wall and the mitten in the snow (record ②).
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('#junction .arrow[data-side="left"]').dispatchEvent('pointerdown');
  await waitFront(page, 'miharashi', 5);
  const side = await pressOnGlow(page, 'plow', 'miharashi', 100);
  expect(side).toBe(1);
  await hasRecord(page, 'spiral-mitten');
  // Its buffer: back onto the main line (no fail).
  await waitRewound(page, 'main', 1320);
  expect(await saidSoFar()).toContain('やったね！ もとの みちに もどるよ');
  await setNotch(page, FAST);
  // The ski jump: the whistle lays it down ("ばたん！"), and the train flies over the snowy valley.
  await waitFront(page, 'main', 1560);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ジャンプだいが でた！');
  await waitFront(page, 'main', 1655);
  await page.screenshot({ path: resolve(OUT, '4-2-09-ski-jump.png') });
  await waitFront(page, 'main', 1700);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  // Two walls in a row: one press bursts both.
  await setNotch(page, NORMAL);
  const bursts = Number(await app.getAttribute('data-plow-bursts'));
  const pair = await pressOnGlow(page, 'plow', 'main', 1990);
  expect(pair).toBe(1);
  expect(Number(await app.getAttribute('data-plow-bursts'))).toBe(bursts + 2);
  expect(await saidSoFar()).toContain('かべが ふたつ！');
  await stopAt(page, 'main', 2080);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '0');
  await card(page, 'できた');
  // The glimpse: Sakasa's snow house on the hill, too small.
  await tapUntil(page, '#bubble:has-text("ちいさすぎて")', 90_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '4-2-10-glimpse.png') });

  // ---- M3 かまくら まつり ----
  await card(page, 'かまくら まつり', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The buried uphill: the wall is burst, but the rocket is not pressed: "ずるずる", back to 2140.
  const seven = await pressOnGlow(page, 'plow', 'main', 2210);
  expect(seven).toBe(1);
  await expect(app).toHaveAttribute('data-wall-6', 'burst');
  await waitRewound(page, 'main', 2200);
  expect(await saidSoFar()).toContain('ずるずる');
  // The wall stays open: this time only the rocket (no "ぽすっ").
  const bumps = Number(await app.getAttribute('data-plow-bumps'));
  await setNotch(page, NORMAL);
  const rockets = await pressOnGlow(page, 'rocket', 'main', 2360);
  expect(rockets).toBe(1);
  expect(Number(await app.getAttribute('data-plow-bumps'))).toBe(bumps);
  await expect(app).toHaveAttribute('data-wall-6', 'burst');
  // The snow shed: dim; the light shows Sakasa's swirl on the upside-down fences.
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '1');
  await expect(app).toHaveAttribute('data-trace', '1', { timeout: 60_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぐるぐるの しるし… サカサだ！');
  // Inside the shed, beside the first swirl fence.
  await waitFront(page, 'main', 2440);
  await page.screenshot({ path: resolve(OUT, '4-2-11-swirl.png') });
  await waitFront(page, 'main', 2600);
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '0');
  // The plaza's ice station: "ゆっくり" glows first (the stop zone takes 9 m/s at most), then "とまる".
  await expect(app).toHaveAttribute('data-ice-hint', 'slow', { timeout: 120_000 });
  await expect(page.locator('.lever-detent[data-notch="2"]')).toHaveAttribute('data-hint', '1');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('こおりの ひろば！ はやめに ブレーキ！');
  await setNotch(page, SLOW);
  await iceStop(page);
  await page.screenshot({ path: resolve(OUT, '4-2-12-ice-plaza.png') });
  await doors(page);
  await card(page, 'できた');

  // The ending: evening, the lanterns, Sakasa takes one and runs off to the mountain.
  await tapUntil(page, '#bubble:has-text("あったかいよ")', 120_000);
  await expect(app).toHaveAttribute('data-sky', 'evening');
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '4-2-13-festival.png') });
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await expect(page.locator('#reward-records .reward-record')).toHaveCount(3);

  const progress = await saved(page);
  expect(progress.records).toEqual(expect.arrayContaining(['frozen-fall', 'spiral-mitten']));
  expect(progress.records).not.toContain('tin-shovel');
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`4-2 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  expect(budget.draws).toBeLessThanOrEqual(200);
  expect(budget.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  expect((await saved(page)).cleared).toContain('4-2');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-2-14-map.png') });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  expect(errors).toEqual([]);
});

/** Every 4-2 model (code stand-ins until ticket 0016) opens on the model page without an error. */
test('4-2 models on the model page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const names = [
    'plow-blade',
    'snow-wall',
    'sign-plow',
    'snow-house',
    'snow-house-b',
    'kamakura',
    'amanojaku-kamakura',
    'lantern',
    'snow-fence-small',
    'snow-fence-trace',
    'snow-shed',
    'ski-ramp',
    'ski-ramp-folded',
    'ski-lift-tower',
    'snow-ravine',
    'frozen-fall',
    'spiral-mitten',
    'tin-shovel',
  ];
  for (const name of names) {
    await page.goto(`/models.html?model=${name}`);
    await expect(page.locator('#name')).toHaveText(name, { timeout: 60_000 });
    await expect(page.locator('#dims')).toContainText('三角形', { timeout: 60_000 });
    const tris = Number(/(\d+) 三角形/.exec((await page.locator('#dims').textContent()) ?? '')?.[1]);
    expect(tris, name).toBeGreaterThan(0);
  }
  await page.goto('/models.html?compare=plow-blade,snow-wall,kamakura,lantern,snow-fence-trace,ski-ramp');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-2-models.png') });
  await page.goto('/models.html?compare=frozen-fall,spiral-mitten,tin-shovel,snow-house,snow-shed,ski-lift-tower');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-2-models-b.png') });
  expect(errors).toEqual([]);
});

// v1.11 (PR6b, PHASE9_CHAPTER5_6 第 2 部 M20): with the magnet light (5-3) a child comes back for the tin shovel on the lift tower (M2: the snowplow and the jump on the way).
test('stage 4-2 with the magnet light: tin-shovel is pulled to the train', async ({ page }) => {
  test.setTimeout(900_000);
  await magnetRecordRun(
    page,
    {
      stage: '4-2',
      mission: 1,
      title: 'ゆきかきと ジャンプ',
      record: 'tin-shovel',
      hint: 'てっぺんに スコップ！ ひっぱろう！',
      riddle: 'たかい ところで なにか きらっ',
      cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2'],
      press: ['plow', 'jump'],
      arrows: [],
      rail: 'main',
      latest: 1582,
      shot: 'magnet-tin-shovel.png',
    },
    OUT,
  );
});
