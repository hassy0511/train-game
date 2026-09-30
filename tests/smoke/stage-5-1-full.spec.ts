import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budget,
  card,
  doors,
  FRONT,
  NORMAL,
  pressOnGlow,
  pressOnGlowBefore,
  progress,
  recordLines,
  setNotch,
  STOP,
  stopAt,
  tapUntil,
  waitDriving,
  waitFront,
} from './drive';

/**
 * Stage 5-1 "よるのもり" played through (docs/PHASE9_CHAPTER5_6.md 第 4 部 §16, read with PHASE9_0: every button works
 * anywhere; a glow or the hush mark is only a hint): M1 the light on in the dark forest (Sakasa's upside-down birdhouse),
 * off in the moonlit meadow (the sleeping rabbits' record, the fawn crossing), on again, the jump over the broken log
 * bridge; M2 the hedgehog (the whistle), two dives under the lily pads (the moonstone), the whistle-reversed wood
 * whistled on purpose once (the tanukis come and dance; stopped, they go home), Sakasa walking alone with the lantern;
 * M3 the firefly forks (the first let be on purpose: the dark dead end, back, whistled), the fake pink light seen
 * through with the light, the meadow again with the light off, the rocket up the roots; the ending (the fireflies light
 * Sakasa up; it runs, looks back), the clear card, the map's page 3.
 *
 * Built for about 10 fps software GL: every press that must land in a window is checked and made in the same page
 * callback, and short states (the tanukis coming, the fawns, the fireflies) are kept by a MutationObserver in the page
 * (window.__night) and looked at afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3'];
const LINKS = ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1', '3-1>3-2', '3-2>3-3', '3-3>4-1', '4-1>4-2', '4-2>4-3', '4-3>5-1'];

/** 5-1's places (main s; scripts/layout-5-1.mjs). */
const HUSH1 = { from: 470, to: 650 };
const GAP = 830;
const REVERSED = { from: 1480, to: 1680 };
const HOTARU = { one: 2180, two: 2340, three: 2500 };
const HUSH2 = { from: 2680, to: 2800 };

interface NightLog {
  lure: string[];
  fawns: string[];
  fireflies: string[];
  fails: { reason: string; s: number; rail: string }[];
  whistleGlowInFake: boolean;
}

/** Keeps the short night states in window.__night (set up before the page loads). */
async function recordNight(page: Page): Promise<void> {
  await page.addInitScript(
    ([fake]) => {
      const log = { lure: [] as string[], fawns: [] as string[], fireflies: [] as string[], fails: [] as { reason: string; s: number; rail: string }[], whistleGlowInFake: false };
      (window as unknown as { __night: typeof log }).__night = log;
      const push = (list: string[], v: string | undefined): void => {
        if (v !== undefined && list[list.length - 1] !== v) list.push(v);
      };
      let fails = 0;
      new MutationObserver(() => {
        const app = document.getElementById('app');
        if (!app) return;
        const d = app.dataset;
        push(log.lure, d.lure);
        push(log.fawns, d.fawns);
        push(log.fireflies, d.fireflies);
        const n = Number(d.fails ?? 0);
        if (n > fails) {
          fails = n;
          log.fails.push({ reason: d.failReason ?? '', s: Number(d.s) + 6, rail: d.rail ?? '' });
        }
        const glow = document.getElementById('whistle')?.dataset.glow === '1';
        const front = Number(d.s) + 6;
        if (glow && d.rail === 'main' && front >= fake - 100 && front <= fake - 15 && !(d.fakeOut ?? '').includes('hotaru-3')) log.whistleGlowInFake = true;
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-s', 'data-lure', 'data-fawns', 'data-fails', 'data-fireflies', 'data-glow'] });
    },
    [HOTARU.three] as const,
  );
}

function night(page: Page): Promise<NightLog> {
  return page.evaluate(() => (window as unknown as { __night: NightLog }).__night);
}

/** Presses the round button `id` the moment `when` holds (a predicate over #app's data `d` and the button's `b`). */
async function pressWhen(page: Page, id: string, when: string, timeoutMs = 240_000): Promise<void> {
  const pressed = await page.waitForFunction(
    ([bid, src]) => {
      const app = document.getElementById('app');
      const b = document.getElementById(bid);
      if (!app || !b) return false;
      const ok = new Function('d', 'b', `return (${src});`)(app.dataset, b.dataset) as boolean;
      if (!ok) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    [id, when] as const,
    { timeout: timeoutMs, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe(true);
}

/** A fail (the reason), then the train put back and standing still, front within ±5 m of `at` on main. */
async function waitFailAndRewind(page: Page, reason: string, at: number, count: number): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-fails', String(count), { timeout: 180_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-fail-reason', reason);
  await page.waitForFunction(
    ([t]) => {
      const d = document.getElementById('app')?.dataset;
      return d?.phase === 'failing' && d.rail === 'main' && Math.abs(Number(d.s) + 6 - t) <= 5 && d.speed === '0.0';
    },
    [at] as const,
    { timeout: 90_000 },
  );
  await waitDriving(page);
}

test('stage 5-1 full run: the light on and off, the hush, the tanukis, the fireflies, the fake light, the ending', async ({ page }) => {
  test.setTimeout(3_600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // A save that has come this far: chapters 1–4 cleared (5-1 is open through the gate), the six buttons learned.
  await page.addInitScript(
    ([key, done, links]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: done, abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'], records: [], mapLinks: links }));
    },
    [KEY, DONE, LINKS] as const,
  );
  const saidSoFar = await recordLines(page);
  await recordNight(page);

  await page.goto('/?stage=5-1');
  const app = page.locator('#app');
  const light = page.locator('#light');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  // The opening: the night forest from above the station, the moon ("くらい… ライトの でばんだ！").
  await tapUntil(page, '#bubble:has-text("ライトの でばんだ")', 120_000);
  await expect(app).toHaveAttribute('data-lighting', 'night');
  await expect(app).toHaveAttribute('data-music', 'yoru');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '5-1-01-moriguchi-night.png') });

  // ---- M1 くらやみ ----
  await card(page, 'くらやみ', 120_000);
  await waitDriving(page);
  await expect(page.locator('.round-button:visible')).toHaveCount(6);
  await setNotch(page, NORMAL);
  // The dark forest A: the light glows; on, the mushrooms and the trees show 70 m ahead.
  await pressWhen(page, 'light', "b.glow === '1' && d.phase === 'driving' && Number(d.s) + 6 >= 195");
  await expect(light).toHaveAttribute('data-on', '1');
  await waitFront(page, 'main', 225);
  await page.screenshot({ path: resolve(OUT, '5-1-02-dark-forest-light.png') });
  // Sakasa's upside-down birdhouse: its swirl glows in the light ("さかさまの すばこ… サカサかな？").
  await expect(app).toHaveAttribute('data-trace', '1', { timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '5-1-03-birdhouse.png') });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('さかさまの すばこ… サカサかな？');
  // The moonlit meadow ①: with the light on, the light glows "dim" with the moon mark (a hint); pressed, off.
  await page.waitForFunction(() => {
    const l = document.getElementById('light')?.dataset;
    return l?.mark === 'hush' && l.glow === '1' && l.glowFor === 'dim';
  }, undefined, { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '5-1-04-hush-mark.png') });
  await pressWhen(page, 'light', "b.glow === '1' && b.glowFor === 'dim'");
  await expect(light).toHaveAttribute('data-on', '0');
  expect(Number(await app.getAttribute('data-s')) + FRONT).toBeLessThan(HUSH1.from);
  // The fawn crosses in front (the light off: it never stops).
  await expect.poll(async () => (await night(page)).fawns.some((f) => f.includes('kojika-1:cross')), { timeout: 90_000 }).toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '5-1-05-fawn-crossing.png') });
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 90_000 }).toContain('moon-bunnies');
  await waitFront(page, 'main', HUSH1.to + 5);
  await expect(app).toHaveAttribute('data-hush-startles', '0');
  await expect(app).toHaveAttribute('data-fawns', /kojika-1:gone/, { timeout: 20_000 });
  expect((await night(page)).fawns.join(' ')).not.toContain('kojika-1:freeze');
  // The dark forest B: the light on again; the broken log bridge: the jump at "ふつう" (with the light, 7 m/s).
  await pressWhen(page, 'light', "b.glow === '1' && d.phase === 'driving' && Number(d.s) + 6 >= 730");
  await expect(light).toHaveAttribute('data-on', '1');
  await pressOnGlowBefore(page, 'jump', 'main', GAP);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '5-1-06-log-bridge.png') });
  await waitFront(page, 'main', GAP + 30);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await expect(app).not.toHaveAttribute('data-fails', /[1-9]/);
  await waitFront(page, 'main', 905);
  await light.dispatchEvent('pointerdown');
  await expect(light).toHaveAttribute('data-on', '0');
  await stopAt(page, 'main', 990);
  await doors(page);
  await card(page, 'できた');

  // ---- M2 よってくる ----
  await card(page, 'よってくる', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The hedgehog on the rail: the whistle glows; it rolls aside.
  await pressWhen(page, 'whistle', "b.glow === '1' && d.phase === 'driving'");
  await expect(app).toHaveAttribute('data-actors', /harinezumi:awake/, { timeout: 20_000 });
  // The pond: dive under both lily pads (a press each); under the first, the moonstone on the pond's floor.
  await pressOnGlowBefore(page, 'dive', 'main', 1270);
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '5-1-07-pond-dive.png') });
  await waitFront(page, 'main', 1285);
  await pressOnGlowBefore(page, 'dive', 'main', 1315);
  await waitFront(page, 'main', 1340);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('pond-moonstone');
  // The tanukis' sign ("たぬきの ふだ… さかさ きてき？").
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('たぬきの ふだ… さかさ きてき？');
  await waitFront(page, 'main', 1445);
  await page.screenshot({ path: resolve(OUT, '5-1-08-tanuki-sign.png') });
  // The whistle-reversed wood, whistled on purpose 10 m in at "ふつう": the tanukis come and dance; stopped at once,
  // they dance and go home ("ばいばい！ きてきは がまんだね"), no fail.
  await page.waitForFunction(() => document.getElementById('app')?.dataset.reversed === '1' && document.getElementById('whistle')?.dataset.mark === 'hush', undefined, { timeout: 60_000 });
  await pressWhen(page, 'whistle', `d.phase === 'driving' && d.rail === 'main' && Number(d.s) + 6 >= ${REVERSED.from + 10}`);
  await page.waitForFunction(() => ['come', 'dance'].includes(document.getElementById('app')?.dataset.lure ?? ''), undefined, { timeout: 10_000 });
  await setNotch(page, STOP);
  await expect(app).toHaveAttribute('data-lure', 'dance', { timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '5-1-09-tanukis-dance.png') });
  await expect(app).toHaveAttribute('data-lure', '', { timeout: 30_000 });
  await expect.poll(saidSoFar, { timeout: 20_000 }).toContain('ばいばい！ きてきは がまんだね');
  expect((await night(page)).lure).toContain('dance');
  await expect(app).not.toHaveAttribute('data-fails', /[1-9]/);
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', REVERSED.to + 10);
  await stopAt(page, 'main', 1990);
  await doors(page);
  await card(page, 'できた');
  // Sakasa alone in the forest, with 4-2's lantern still lit.
  await tapUntil(page, '#bubble:has-text("サカサだ！")', 90_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '5-1-10-lantern-sakasa.png') });

  // ---- M3 ほたるのみち ----
  await card(page, 'ほたるのみち', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The dark forest C: the light on (both the light and the whistle glow at the first firefly fork).
  await pressWhen(page, 'light', "b.glow === '1' && d.phase === 'driving' && Number(d.s) + 6 >= 2075");
  await expect(light).toHaveAttribute('data-on', '1');
  // Firefly fork ①, let be on purpose: the default way is the dark dead end ("くらい いきどまり… ほたるに きこう"),
  // back 80 m before the fork, where the whistle glows at once; whistled, the fireflies show the true way (left).
  await expect(app).toHaveAttribute('data-rail', 'kurai1', { timeout: 180_000 });
  await waitFailAndRewind(page, 'deadEnd', HOTARU.one - 80, 1);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  await pressWhen(page, 'whistle', "b.glow === '1' && d.phase === 'driving'");
  await expect(app).toHaveAttribute('data-fireflies', /hotaru-1:home/, { timeout: 15_000 });
  await setNotch(page, NORMAL);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '5-1-11-fireflies-way.png') });
  await waitFront(page, 'main', HOTARU.one + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // Firefly fork ② (no words): whistled when it glows.
  await pressWhen(page, 'whistle', `b.glow === '1' && d.phase === 'driving' && d.rail === 'main' && Number(d.s) + 6 >= ${HOTARU.two - 100}`);
  await expect(app).toHaveAttribute('data-fireflies', /hotaru-2:home/, { timeout: 15_000 });
  await waitFront(page, 'main', HOTARU.two + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // Fork ③, Sakasa's pink lanterns: the whistle does not glow until the light sees through them (40 m, the light on);
  // then the lanterns go out, the swirl glows, and the whistle glows: whistled, the fireflies go home on the true way.
  await expect(app).toHaveAttribute('data-fake-out', /hotaru-3/, { timeout: 120_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '5-1-12-fake-lanterns-out.png') });
  expect((await night(page)).whistleGlowInFake).toBe(false);
  await pressWhen(page, 'whistle', "b.glow === '1' && d.phase === 'driving'", 60_000);
  await expect(app).toHaveAttribute('data-fireflies', /hotaru-3:home/, { timeout: 15_000 });
  await waitFront(page, 'main', 2520);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // The moonlit meadow ②: the light off when it glows "dim"; the second fawn crosses.
  await pressWhen(page, 'light', "b.glow === '1' && b.glowFor === 'dim'");
  await expect(light).toHaveAttribute('data-on', '0');
  await waitFront(page, 'main', HUSH2.to + 5);
  await expect(app).toHaveAttribute('data-fawns', /kojika-2:gone/, { timeout: 20_000 });
  await expect(app).toHaveAttribute('data-hush-startles', '0');
  // The great tree's roots: the rocket when it glows (the chase camera turns with the climb).
  await pressOnGlow(page, 'rocket');
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(OUT, '5-1-13-roots-rocket.png') });
  await waitFront(page, 'main', 2940);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await stopAt(page, 'main', 3140);
  await doors(page);
  await card(page, 'できた');

  // ---- The ending: the fireflies gather at the great tree and light Sakasa up; it runs, then looks back ----
  await tapUntil(page, '#bubble:has-text("ほたるが いっぱい")', 120_000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '5-1-14-great-tree.png') });
  await tapUntil(page, '#bubble:has-text("こ、こんにちは")', 90_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '5-1-15-fireflies-sakasa.png') });
  await tapUntil(page, '#bubble:has-text("こっちを みてた")', 90_000);
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await expect(page.locator('#card')).not.toContainText('おしまい');
  await expect(page.locator('#reward-records .reward-record')).toHaveCount(3);

  const saved = await progress(page);
  expect(saved.cleared).toContain('5-1');
  expect(saved.records).toEqual(expect.arrayContaining(['moon-bunnies', 'pond-moonstone']));
  expect(saved.records).not.toContain('lantern-bell');
  const b = await budget(page);
  console.log(`5-1 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  const log = await night(page);
  console.log(`5-1 fails: ${JSON.stringify(log.fails)}`);
  expect(log.fails.map((f) => f.reason)).toEqual(['deadEnd']);
  await page.locator('#card-button').click();

  // The map, page 3: 5-1 cleared.
  const map = page.locator('#map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-page', '3', { timeout: 20_000 });
  await expect(page.locator('.map-island[data-island="5-1"]')).toHaveClass(/is-cleared/, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, '5-1-16-map-page3.png') });

  const said = await saidSoFar();
  for (const line of [
    'こんやは もりの ほたるの よる！',
    'くらい もり！ ライトを つけよう',
    'つきの はらっぱ… みんな ねてる',
    'ライトを けして、しーっ',
    'しーっ… うさぎの おやこが ねてる',
    'しずかに とおれたね！',
    'また くらい もり！ ライトを つけよう',
    'ほたるを みに いくの！',
    'はりねずみさん、どいて〜！ きてき！',
    'はすの はっぱ！ もぐって くぐろう',
    'ここは きてき がまんだよ',
    'わわっ、よってきちゃった！ とまって！',
    'わたしたちも のせて！',
    'あの ちょうちん、まだ もってる！',
    'くらい いきどまり… ほたるに きこう',
    'きてきで ほたるに あいず！',
    'ほたるが とんだ！ みちを おしえてる！',
    'ピンクの ひかり…？ へんだね',
    'にせものの ひかりだ！ サカサの かな',
    'たかい えだで なにか ちりん…',
    'また つきの はらっぱ… しーっ',
    'きの ねっこの さか！ ロケット！',
    'おおきな き！ ほたるの ひろばだ！',
    'ありがとう！ ほたる きれい！',
    'なにか いいたそう だったね',
  ]) {
    expect(said, line).toContain(line);
  }
  expect(said).not.toContain('あっ、びっくりして かくれちゃった');
  expect(said).not.toContain('えだの うえに すず！ ひっぱろう！');
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  console.log('smoke 5-1 full: cleared');
  expect(errors).toEqual([]);
});

/** Every 5-1 model (code stand-ins until ticket 0018) opens on the model page without an error. */
test('5-1 models on the model page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const names = [
    'night-tree-a',
    'night-tree-b',
    'night-bush',
    'glow-mushroom',
    'moon-meadow',
    'great-tree',
    'plaza-deck',
    'big-stump',
    'log-bridge-end',
    'thicket',
    'birdhouse-upside',
    'bell-branch',
    'moonstone',
    'lantern-bell',
    'firefly-wait',
    'amanojaku-lantern',
    'amanojaku-lantern-off',
  ];
  for (const name of names) {
    await page.goto(`/models.html?model=${name}`);
    await expect(page.locator('#name')).toHaveText(name, { timeout: 60_000 });
    await expect(page.locator('#dims')).toContainText('三角形', { timeout: 60_000 });
    const tris = Number(/(\d+) 三角形/.exec((await page.locator('#dims').textContent()) ?? '')?.[1]);
    expect(tris, name).toBeGreaterThan(0);
  }
  await page.goto('/models.html?compare=night-tree-a,night-tree-b,night-bush,glow-mushroom,big-stump,thicket');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '5-1-models.png') });
  await page.goto('/models.html?compare=moonstone,lantern-bell,birdhouse-upside,amanojaku-lantern,amanojaku-lantern-off');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '5-1-models-b.png') });
  expect(errors).toEqual([]);
});
