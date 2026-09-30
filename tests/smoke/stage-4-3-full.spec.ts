import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budget,
  card,
  doors,
  FAST,
  FRONT,
  NORMAL,
  pressOnGlow,
  progress,
  recordLines,
  pressOnGlowBefore,
  setNotch,
  SLOW,
  STOP,
  stopAt,
  tapUntil,
  waitDriving,
  waitFront,
  waitRewound,
  magnetRecordRun,
} from './drive';

/**
 * Stage 4-3 "ゆきやまのトンネル" played through (docs/PHASE8_CHAPTER3_4.md 第 8 部 §15, read with §0), then chapter 4's
 * end on the map: M1 the snowman on the rail (the whistle), the steep snow slope (the rocket), the rolling upside-down
 * snowmen (wait) and the snow on the rail (jump); M2 the dive for the ice flower in the melting pond, the snow wall at
 * the tunnel's mouth (the snowplow), the dark tunnel (without the light the false exit leads round the ice hall; with it
 * the true exit), the glimpse; M3 the snow wave: caught once on purpose ("もふっ", soft, back to a retry place, the wave
 * slower), then away at "はやい" with the rocket and the jumps, "セーフ！" at the fence; the ending (the child's whistle
 * rolls the big snowman, "なかまだから"), "4しょう おしまい！", and on the map the aurora, "4しょう クリア！" and the rail through the gate to page 3.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2'];
const LINKS = ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1', '3-1>3-2', '3-2>3-3', '3-3>4-1', '4-1>4-2', '4-2>4-3'];

async function camera(page: Page, mode: 'cab' | 'chase' | 'side' | 'top'): Promise<void> {
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator(`.camera-tile[data-mode="${mode}"]`).dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-camera', mode);
}

/**
 * Drives on its own in the page until the front reaches `at` on `rail`: presses the rocket each time it glows and the
 * jump button each time it glows (every frame, so a short window on a slow machine is not missed). Returns
 * how many times each was pressed.
 */
async function autoPress(page: Page, rail: string, at: number): Promise<{ rocket: number; jump: number }> {
  await page.evaluate(() => {
    (window as unknown as { __auto: { rocket: number; jump: number; last: number } }).__auto = { rocket: 0, jump: 0, last: -1 };
  });
  await page.waitForFunction(
    ([r, t]) => {
      const app = document.getElementById('app');
      const a = (window as unknown as { __auto: { rocket: number; jump: number; last: number } }).__auto;
      if (!app) return false;
      const now = Number(app.dataset.time);
      if (app.dataset.phase === 'driving' && now - a.last > 0.4) {
        const rocket = document.getElementById('rocket');
        const jump = document.getElementById('jump');
        if (rocket?.dataset.glow === '1' && app.dataset.burn !== '1') {
          a.rocket += 1;
          a.last = now;
          rocket.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        } else if (jump?.dataset.glow === '1' && app.dataset.air !== '1') {
          a.jump += 1;
          a.last = now;
          jump.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        }
      }
      return app.dataset.rail === r && Number(app.dataset.s) >= Number(t);
    },
    [rail, at - FRONT] as const,
    { timeout: 300_000, polling: 'raf' },
  );
  return page.evaluate(() => {
    const a = (window as unknown as { __auto: { rocket: number; jump: number } }).__auto;
    return { rocket: a.rocket, jump: a.jump };
  });
}

test('stage 4-3 full run: snowmen, the tunnel and the false exit, the snow wave, the ending and chapter 4 on the map', async ({ page }) => {
  test.setTimeout(3_600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // A save that has come this far: chapters 1–3, 4-1 and 4-2 cleared (4-3 is open), diving and the snowplow learned.
  await page.addInitScript(
    ([key, done, links]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: done, abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'], records: [], mapLinks: links }));
    },
    [KEY, DONE, LINKS] as const,
  );
  // The snow wave's states (a catch lasts only a moment: kept in the page as they come).
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __chase: string[] }).__chase = seen;
    new MutationObserver(() => {
      const v = document.getElementById('app')?.dataset.chase;
      if (v !== undefined && seen[seen.length - 1] !== v) seen.push(v);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-chase'] });
  });
  const saidSoFar = await recordLines(page);
  const chaseSeen = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __chase: string[] }).__chase);

  await page.goto('/?stage=4-3');
  const app = page.locator('#app');
  const light = page.locator('#light');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '4-3-01-fumoto.png') });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'yuki');
  // The opening: a little snow wave far off ("ぶつかると もふっ").
  await tapUntil(page, '#bubble:has-text("ぶつかると もふっ")', 120_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /nami/);
  await page.screenshot({ path: resolve(OUT, '4-3-02-opening-wave.png') });

  // ---- M1 ころがる ゆきだるま ----
  await card(page, 'ころがる ゆきだるま', 120_000);
  await waitDriving(page);
  // All six round buttons (whistle, jump, light, rocket, dive, snowplow).
  await expect(page.locator('.round-button:visible')).toHaveCount(6);
  await setNotch(page, NORMAL);
  // The snowman on the rail: the whistle, and it rolls aside.
  await waitFront(page, 'main', 196);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ゆきだるまさんが せんろに！ きてき！');
  await page.screenshot({ path: resolve(OUT, '4-3-03-snowman-on-rail.png') });
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-actors', /yukidaruma:awake/, { timeout: 10_000 });
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('snow-hare');
  // The steep snow slope: the rocket when it glows.
  await pressOnGlow(page, 'rocket');
  await waitFront(page, 'main', 455);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  // The upside-down snowman wobbles and rolls across: wait for it ("ゆっくり").
  await waitFront(page, 'main', 480);
  await setNotch(page, SLOW);
  await expect(app).toHaveAttribute('data-rocks', /snow-a:roll/, { timeout: 60_000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: resolve(OUT, '4-3-04-rolling-snowman.png') });
  await page.waitForTimeout(3500);
  await setNotch(page, NORMAL);
  // Snow off the pine onto the rail: jump.
  await pressOnGlowBefore(page, 'jump', 'main', 684);
  await waitFront(page, 'main', 700);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  // The second rolling one (wait), then the snowman sliding down onto the rail (jump).
  await setNotch(page, SLOW);
  await expect(app).toHaveAttribute('data-rocks', /snow-c:roll/, { timeout: 90_000 });
  await page.waitForTimeout(4800);
  await setNotch(page, NORMAL);
  await pressOnGlowBefore(page, 'jump', 'main', 834);
  await waitFront(page, 'main', 850);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await stopAt(page, 'main', 980);
  await card(page, 'できた');

  // ---- M2 にせの でぐち ----
  await card(page, 'にせの でぐち');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The side way into the melting pond: dive for the ice flower.
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('#junction .arrow[data-side="right"]').dispatchEvent('pointerdown');
  await waitFront(page, 'ike', 5);
  await pressOnGlowBefore(page, 'dive', 'ike', 100);
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('ice-flower');
  await page.screenshot({ path: resolve(OUT, '4-3-05-pond-dive.png') });
  // Its buffer: back onto the main line (not a fail).
  await waitRewound(page, 'main', 1130);
  await waitDriving(page);
  expect(await saidSoFar()).toContain('やったね！ もとの みちに もどるよ');
  await setNotch(page, NORMAL);
  // The snow wall in the tunnel's mouth: the snowplow button glows; pressed, "ずぼーん！".
  await pressOnGlowBefore(page, 'plow', 'main', 1226);
  await expect(app).toHaveAttribute('data-plow-bursts', '1', { timeout: 60_000 });
  expect(await saidSoFar()).toContain('トンネルが ゆきで ふさがってる！');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('トンネルだ！ ライトを つけよう');
  await expect(light).toHaveAttribute('data-glow', '1');
  await page.screenshot({ path: resolve(OUT, '4-3-06-tunnel-mouth.png') });
  // Into the dark without the light (never a fail): dark and the light button glowing.
  await waitFront(page, 'main', 1300);
  await expect(app).toHaveAttribute('data-tunnel', '1');
  await expect(light).toHaveAttribute('data-glow', '1');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '4-3-07-tunnel-dark.png') });
  // The fork in the ice hall: the sign lies; without the light the train takes the false exit and goes round.
  await waitFront(page, 'nise', 20);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('あれ？ でぐちが ふたつ…？');
  await waitFront(page, 'nise', 26);
  await page.screenshot({ path: resolve(OUT, '4-3-08-false-exit.png') });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('あれ？ かべに えが かいてある！');
  await waitFront(page, 'main', 1425);
  expect(await saidSoFar()).toContain('もどっちゃった！ ライトで みよう');
  await expect(app).toHaveAttribute('data-phase', 'driving');
  // Now the light: the true exit shines, the false one's swirl too, and the train keeps to main.
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '1');
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('ほんとうの でぐちが ひかった！');
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '4-3-09-tunnel-light.png') });
  await waitFront(page, 'main', 1510);
  await waitFront(page, 'main', 1690);
  await page.screenshot({ path: resolve(OUT, '4-3-10-tunnel-exit.png') });
  await waitFront(page, 'main', 1720);
  await expect(app).toHaveAttribute('data-tunnel', '0');
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '0');
  await stopAt(page, 'main', 1790);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-parcel', '1');
  await card(page, 'できた');
  // The glimpse: Sakasa alone with the upside-down snowmen.
  await tapUntil(page, '#bubble:has-text("ひとりで つくってたの")', 90_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '4-3-11-glimpse.png') });

  // ---- M3 ゆきの なみ ----
  await card(page, 'ゆきの なみ', 120_000);
  await waitDriving(page);
  await expect(app).not.toHaveAttribute('data-chase', /.+/);
  await setNotch(page, FAST);
  // Past 1900 the wave comes out behind: the side camera, the meter, the hurry music.
  await expect(app).toHaveAttribute('data-chase', /run|near/, { timeout: 60_000 });
  await expect(page.locator('#timer')).toHaveAttribute('data-mode', 'chase');
  await expect(app).toHaveAttribute('data-music', 'hurry');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ゆきの なみだ！ はやい で にげよう！');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '4-3-12-wave-out.png') });
  // Caught on purpose (stopped): "もふっ", soft (no shake), back to a retry place; the wave is slower now.
  await setNotch(page, STOP);
  await expect.poll(chaseSeen, { timeout: 60_000 }).toContain('caught');
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '4-3-13-caught.png') });
  await waitRewound(page, 'main', 1890);
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-chase-catches', '1');
  expect(await saidSoFar()).toContain('もふっ！ ゆきまみれ〜');
  expect(await saidSoFar()).toContain('もういっかい！ はやい で にげよう');
  await expect(app).toHaveAttribute('data-chase', /run|near/);
  // Away at "はやい", pressing the rocket and the jump whenever they glow: the snowman, slope ②, the slide's snow, the
  // crack in the snow.
  await setNotch(page, FAST);
  await waitFront(page, 'main', 1960);
  await camera(page, 'chase');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '4-3-14-wave-behind.png') });
  await camera(page, 'cab');
  const run = await autoPress(page, 'main', 2170);
  await page.screenshot({ path: resolve(OUT, '4-3-15-slope-rocket.png') });
  const run2 = await autoPress(page, 'main', 2790);
  console.log(`4-3 M3: rocket ${run.rocket + run2.rocket}, jumps ${run.jump + run2.jump}`);
  expect(run.jump + run2.jump).toBeGreaterThanOrEqual(3);
  await expect.poll(chaseSeen, { timeout: 30_000 }).toContain('safe');
  await expect(app).toHaveAttribute('data-chase-catches', '1');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('さくだ！ セーフ！');
  await expect(app).toHaveAttribute('data-music', 'yuki', { timeout: 20_000 });
  await page.screenshot({ path: resolve(OUT, '4-3-16-safe.png') });
  await stopAt(page, 'main', 2930);
  await doors(page);
  await expect(page.locator('#cargo')).toHaveAttribute('data-parcel', '0');
  await card(page, 'できた');

  // ---- The ending: the child's whistle rolls the big snowman; "なかまだから" ----
  await tapUntil(page, '#app[data-cutscene-press="whistle"]', 120_000);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1');
  await page.screenshot({ path: resolve(OUT, '4-3-17-ending-wait.png') });
  // It waits for the whistle, however long.
  await page.waitForTimeout(5000);
  await expect(app).toHaveAttribute('data-cutscene-press', 'whistle');
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect(app).not.toHaveAttribute('data-cutscene-press', /.+/);
  await tapUntil(page, '#bubble:has-text("なかまだから")', 90_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '4-3-18-nakama.png') });
  await tapUntil(page, '#bubble:has-text("な、なかま")', 60_000);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '4-3-19-blush.png') });
  await card(page, '4しょう おしまい！', 120_000);
  await tapUntil(page, '#card', 90_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await expect(page.locator('#reward-records .reward-record')).toHaveCount(3);

  const saved = await progress(page);
  expect(saved.records).toEqual(expect.arrayContaining(['snow-hare', 'ice-flower']));
  expect(saved.records).not.toContain('sleigh-bell');
  const b = await budget(page);
  console.log(`4-3 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();

  // ---- Chapter 4's end on the map: the aurora, the islands twinkling, the card, then the rail through the gate to
  // page 3 (chapter 5, docs/PHASE9_CHAPTER5_6.md 第 1 部 §3.5) ----
  const map = page.locator('#map');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('data-page', '2', { timeout: 20_000 });
  await expect(map).toHaveAttribute('data-finale', 'playing', { timeout: 20_000 });
  await page.waitForSelector('.map-aurora', { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(OUT, '4-3-20-map-aurora.png') });
  await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
  await expect(map).toHaveAttribute('data-trail', /3-1,3-2,3-3,4-1,4-2,4-3$/);
  await expect(page.locator('#card')).toContainText('4しょう クリア！');
  await expect(page.locator('#card')).toContainText('こおりと ゆきの せかいも');
  expect((await progress(page)).mapLinks).not.toContain('finale:4');
  await page.locator('#card-button').click({ timeout: 10_000 });
  expect((await progress(page)).mapLinks).toContain('finale:4');
  await expect(page.locator('[data-link="4-3>5-1"]')).toHaveClass(/is-growing/, { timeout: 20_000 });
  await expect(page.locator('.map-island[data-island="4-3"]')).not.toHaveClass(/is-unknown/);
  await expect(page.locator('.map-island[data-island="4-3"]')).toHaveClass(/is-cleared/);
  await expect(map).toHaveAttribute('data-page', '3', { timeout: 20_000 });
  await expect(map).toHaveAttribute('data-finale', 'done', { timeout: 20_000 });
  await expect(page.locator('.map-island[data-island="5-1"]')).toBeVisible();
  const after = await progress(page);
  expect(after.cleared).toContain('4-3');
  expect(after.mapLinks).toContain('4-3>5-1');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-3-21-map-page3.png') });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  console.log('smoke 4-3 full: cleared, chapter 4 ended');
  expect(errors).toEqual([]);
});

/** A slow child: caught three times, the wave tires out and the fourth try always gets away (§0.8). */
test('stage 4-3: the snow wave tires out after three catches', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(
    ([key, done, links]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify({ schema: 1, cleared: done, abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'], records: [], mapLinks: links, resume: { stage: '4-3', mission: 2 } }),
      );
    },
    [KEY, DONE, LINKS] as const,
  );
  const saidSoFar = await recordLines(page);
  await page.goto('/?stage=4-3&go=1&resume=1');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ゆきの なみ', 120_000);
  await waitDriving(page);
  for (let i = 1; i <= 3; i++) {
    // "ゆっくり" and no buttons: the wave catches up.
    await setNotch(page, SLOW);
    await expect(app).toHaveAttribute('data-chase-catches', String(i), { timeout: 300_000 });
    await waitDriving(page);
  }
  expect(await saidSoFar()).toContain('もこもこ、つかれてきた みたい');
  // Tired out: even "ゆっくり" with no rocket keeps ahead (the wave, slower than the train, falls behind) down to the
  // snowman sliding onto the rail at 2080.
  await setNotch(page, SLOW);
  const start = Number(await app.getAttribute('data-chase-gap'));
  await waitFront(page, 'main', 2030);
  await expect(app).toHaveAttribute('data-chase-catches', '3');
  const gap = Number(await app.getAttribute('data-chase-gap'));
  console.log(`4-3 tired wave: gap ${start} m after the third catch, ${gap} m at main 2030`);
  expect(gap).toBeGreaterThan(start);
  expect(errors).toEqual([]);
});

/** Every 4-3 model (code stand-ins until ticket 0017) opens on the model page without an error. */
test('4-3 models on the model page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const names = [
    'snow-wave',
    'snow-wave-small',
    'snowman',
    'snowman-big',
    'snowman-upside',
    'snow-pile',
    'snow-ridge',
    'snow-knoll',
    'tunnel-portal',
    'ice-hall',
    'ice-pillar',
    'fake-exit',
    'exit-glow',
    'snow-fence',
    'lodge',
    'snow-hare',
    'ice-flower',
    'sleigh-bell',
    'amanojaku-blush',
  ];
  for (const name of names) {
    await page.goto(`/models.html?model=${name}`);
    await expect(page.locator('#name')).toHaveText(name, { timeout: 60_000 });
    await expect(page.locator('#dims')).toContainText('三角形', { timeout: 60_000 });
    const tris = Number(/(\d+) 三角形/.exec((await page.locator('#dims').textContent()) ?? '')?.[1]);
    expect(tris, name).toBeGreaterThan(0);
  }
  await page.goto('/models.html?compare=snowman,snowman-upside,snow-pile,snow-hare,ice-flower,sleigh-bell');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-3-models.png') });
  await page.goto('/models.html?compare=snow-wave,tunnel-portal,fake-exit,snow-fence,lodge,amanojaku-blush');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '4-3-models-b.png') });
  expect(errors).toEqual([]);
});

// v1.11 (PR6b, PHASE9_CHAPTER5_6 第 2 部 M20): with the magnet light (5-3) a child comes back for the sleigh bells in the snow (M3 standing at とうげえき: 40 m off, green at once).
test('stage 4-3 with the magnet light: sleigh-bell is pulled to the train', async ({ page }) => {
  test.setTimeout(900_000);
  await magnetRecordRun(
    page,
    {
      stage: '4-3',
      mission: 2,
      title: 'ゆきの なみ',
      record: 'sleigh-bell',
      hint: 'ゆきの なかに すず！ ひっぱろう！',
      cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2'],
      notch: 1,
      press: [],
      arrows: [],
      rail: 'main',
      latest: 1822,
      shot: 'magnet-sleigh-bell.png',
    },
    OUT,
  );
});
