import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, doors, FAST, FRONT, NORMAL, progress, recordLines, setNotch, STOP, stopAt, tapUntil, waitDriving, waitFront } from './drive';

/**
 * PR2c「夜の 土台」on the hidden test stage 0-1 てすとの よる (PHASE9_CHAPTER5_6 §0.8, 第 4 部 §16): the night look (and
 * back to day), the hush stretch (the light's hush glow and mark, the sleepers, the fawn gazing at the light), the
 * whistle-reversed stretch and its tanukis, the firefly forks (a true one and Sakasa's fake one), the hedgehog's glow,
 * `hints[].unless`, the soft fails "glare" and "lure", and the mercy after two fails in a row.
 *
 * Built for about 10 fps software GL: every press that must land in a window is checked and made in the same page
 * callback (drive.ts), and short states (a tanuki coming, a fawn blinking, a lost firefly cloud) are kept by a
 * MutationObserver in the page (window.__night) and looked at afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

/** 0-1's places (main s; scripts/layout-0-1.mjs). */
const HUSH = { from: 260, to: 380, glowFrom: 190, rewind: 190 };
const REVERSED = { from: 500, to: 620, rewind: 440 };
const HOTARU = 780;
const NISE = 960;
const OWARI = 1150;

interface NightLog {
  lure: string[];
  fawns: string[];
  fails: { reason: string; s: number }[];
  lighting: string[];
  fireflies: string[];
  lightToggles: number;
  whistleGlowInReversed: boolean;
  whistleGlowInFake: boolean;
}

/** Keeps the short night states in window.__night (set up before the page loads). */
async function recordNight(page: Page): Promise<void> {
  await page.addInitScript(
    ([nise]) => {
      const log = {
        lure: [] as string[],
        fawns: [] as string[],
        fails: [] as { reason: string; s: number }[],
        lighting: [] as string[],
        fireflies: [] as string[],
        lightToggles: 0,
        whistleGlowInReversed: false,
        whistleGlowInFake: false,
      };
      (window as unknown as { __night: typeof log }).__night = log;
      const push = (list: string[], v: string | undefined): void => {
        if (v !== undefined && list[list.length - 1] !== v) list.push(v);
      };
      let fails = 0;
      let lightOn = '0';
      new MutationObserver(() => {
        const app = document.getElementById('app');
        if (!app) return;
        const d = app.dataset;
        push(log.lure, d.lure);
        push(log.fawns, d.fawns);
        push(log.lighting, d.lighting);
        push(log.fireflies, d.fireflies);
        const n = Number(d.fails ?? 0);
        if (n > fails) {
          fails = n;
          log.fails.push({ reason: d.failReason ?? '', s: Number(d.s) + 6 });
        }
        const light = document.getElementById('light')?.dataset.on ?? '0';
        if (light !== lightOn) {
          lightOn = light;
          log.lightToggles += 1;
        }
        const glow = document.getElementById('whistle')?.dataset.glow === '1';
        if (glow && d.reversed === '1') log.whistleGlowInReversed = true;
        const front = Number(d.s) + 6;
        if (glow && d.rail === 'main' && front >= nise - 100 && front <= nise - 15 && !(d.fakeOut ?? '').includes('nise')) log.whistleGlowInFake = true;
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-s', 'data-lure', 'data-fawns', 'data-fails', 'data-lighting', 'data-fireflies', 'data-on', 'data-glow'] });
    },
    [NISE] as const,
  );
}

function night(page: Page): Promise<NightLog> {
  return page.evaluate(() => (window as unknown as { __night: NightLog }).__night);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Opens 0-1 straight into play: the opening (day turns to night), the mission card, driving. */
async function start(page: Page, options: { leftHanded?: boolean } = {}): Promise<void> {
  if (options.leftHanded) {
    await page.addInitScript(() => localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: true })));
  }
  await page.goto('/?stage=0-1&go=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  // The title is skipped: the stage starts by day.
  await expect(page.locator('#app')).toHaveAttribute('data-lighting', 'day');
  await card(page, 'ミッション 1');
  await waitDriving(page);
}

/** Presses the round button `id` once the train front passes `at` on main (checked and pressed in one callback). */
async function pressAt(page: Page, id: string, at: number): Promise<void> {
  const pressed = await page.waitForFunction(
    ([bid, t]) => {
      const app = document.getElementById('app');
      const b = document.getElementById(bid);
      if (!app || !b || app.dataset.phase !== 'driving' || app.dataset.rail !== 'main' || Number(app.dataset.s) < t) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    [id, at - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe(true);
}

/** Presses `id` the moment `state` holds in the page (a predicate over #app's data and the button's). */
async function pressWhen(page: Page, id: string, when: string): Promise<void> {
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
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe(true);
}

/** The whistle for the hedgehog (it glows from 60 m before it). */
async function passHedgehog(page: Page): Promise<void> {
  await pressWhen(page, 'whistle', "b.glow === '1' && d.phase === 'driving'");
  await expect(page.locator('#app')).toHaveAttribute('data-actors', /harinezumi:awake/, { timeout: 20_000 });
}

/** The light on (or off), by one press, when it is not so already. */
async function light(page: Page, on: boolean): Promise<void> {
  const b = page.locator('#light');
  if ((await b.getAttribute('data-on')) !== (on ? '1' : '0')) await b.dispatchEvent('pointerdown');
  await expect(b).toHaveAttribute('data-on', on ? '1' : '0', { timeout: 5_000 });
}

/** A fail (the reason), then the train put back and standing still, front within ±5 m of `at` on main. */
async function waitFailAndRewind(page: Page, reason: string, at: number, count: number): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-fails', String(count), { timeout: 120_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-fail-reason', reason);
  await page.waitForFunction(
    ([t]) => {
      const d = document.getElementById('app')?.dataset;
      return d?.phase === 'failing' && d.rail === 'main' && Math.abs(Number(d.s) + 6 - t) <= 5 && d.speed === '0.0';
    },
    [at] as const,
    { timeout: 60_000 },
  );
  await waitDriving(page);
}

/** Every visible round button is apart from the others (six with chapters 1–4's abilities). */
async function roundButtonsApart(page: Page): Promise<void> {
  const rounds = await page.locator('.action-buttons > .round-button:visible').evaluateAll((els) =>
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
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(a.r + b.r - 0.5);
    }
  }
}

test('0-1: day to night, the hush with the light off, the tanukis let be, the fireflies, the fake light, back to day', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  const lines = await recordLines(page);
  await recordNight(page);
  const app = page.locator('#app');
  await start(page);

  // The opening turned the day into night (the look changed once): the moon, the stars, the fireflies round the camera.
  await expect(app).toHaveAttribute('data-lighting', 'night');
  await expect(app).toHaveAttribute('data-look-changes', '1');
  await page.screenshot({ path: resolve(OUT, 'night-start.png') });
  await roundButtonsApart(page);

  // The hedgehog on the rail: the whistle glows for it (cat glow), it rolls aside.
  await setNotch(page, NORMAL);
  await passHedgehog(page);

  // The hush stretch: the light on, the moon mark comes on both buttons and the light glows "dim"; pressed, it goes off.
  await light(page, true);
  await page.waitForFunction(() => {
    const l = document.getElementById('light')?.dataset;
    const w = document.getElementById('whistle')?.dataset;
    return l?.mark === 'hush' && l.glow === '1' && l.glowFor === 'dim' && w?.mark === 'hush';
  }, undefined, { timeout: 60_000 });
  expect(Number(await app.getAttribute('data-s')) + FRONT).toBeLessThan(HUSH.from);
  await page.screenshot({ path: resolve(OUT, 'night-hush.png') });
  await pressWhen(page, 'light', "b.glow === '1' && b.glowFor === 'dim'");
  await expect(page.locator('#light')).toHaveAttribute('data-on', '0');
  // The buttons keep their faces and places (the mark is only a hint).
  await roundButtonsApart(page);
  await waitFront(page, 'main', HUSH.to + 10);
  // "はやい" where nothing needs the train slower (the machine running the tests is slow).
  await setNotch(page, FAST);
  await expect(app).toHaveAttribute('data-hush-startles', '0');
  await expect(app).toHaveAttribute('data-fawns', 'kojika:gone', { timeout: 20_000 });
  expect((await progress(page)).records).toContain('test-bunny');
  expect((await night(page)).fawns).not.toContain('kojika:freeze');

  // The whistle-reversed stretch, let be: the hush mark on the whistle, which never glows there; no tanuki comes.
  await page.waitForFunction(() => document.getElementById('app')?.dataset.reversed === '1' && document.getElementById('whistle')?.dataset.mark === 'hush', undefined, { timeout: 60_000 });
  await waitFront(page, 'main', REVERSED.to + 15);
  await expect(app).toHaveAttribute('data-lure-calls', '0');
  expect((await night(page)).whistleGlowInReversed).toBe(false);

  // The firefly fork: the whistle glows in its calling reach; whistled, the fireflies line the true way (left, main).
  await pressWhen(page, 'whistle', "b.glow === '1' && d.phase === 'driving' && d.rail === 'main' && Number(d.s) + 6 > 650");
  await expect(app).toHaveAttribute('data-fireflies', /hotaru:home/, { timeout: 10_000 });
  await expect(page.locator('.arrow[data-side="left"]')).toHaveClass(/is-true/, { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, 'night-fireflies.png') });
  await waitFront(page, 'main', HOTARU + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');

  // The fake fork (Sakasa's pink lanterns): with the light on, whistled in its reach, the fireflies are lost and the
  // partner says "ちかづくと わかるよ！"; at 40 m the light sees through it: the lanterns go out, the true way is taken.
  await light(page, true);
  await pressAt(page, 'whistle', NISE - 90);
  await expect(app).toHaveAttribute('data-fireflies', /nise:lost/, { timeout: 10_000 });
  await expect(page.locator('#light')).toHaveAttribute('data-on', '1');
  await expect(app).toHaveAttribute('data-fake-out', 'nise', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-fireflies', /nise:home/, { timeout: 5_000 });
  await page.screenshot({ path: resolve(OUT, 'night-fake-out.png') });
  await waitFront(page, 'main', NISE + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  expect((await night(page)).whistleGlowInFake).toBe(false);
  expect((await night(page)).fireflies.some((f) => f.includes('nise:lost'))).toBe(true);

  // The riddle hints: the one for the magnet (not had) is said; the one for the light (had) is not.
  await waitFront(page, 'main', 1060);
  await light(page, false);
  await stopAt(page, 'main', OWARI);
  await doors(page);
  await card(page, 'できた');
  // The ending turns the night back into day (behind a short dusk-blue fade).
  const deadline = Date.now() + 90_000;
  while ((await app.getAttribute('data-lighting')) !== 'day' && Date.now() < deadline) {
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  await expect(app).toHaveAttribute('data-lighting', 'day');
  await expect(app).toHaveAttribute('data-look-changes', '2');
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: resolve(OUT, 'night-day-again.png') });
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('クリア');

  const said = await lines();
  expect(said).toContain('つきの はらっぱ… みんな ねてる');
  expect(said).toContain('ライトを けして、しーっ');
  expect(said).toContain('しずかに とおれたね！');
  expect(said).toContain('ここは きてき がまんだよ');
  expect(said).toContain('しずかに とおれた！ えらい！');
  expect(said).toContain('ほたるが とんだ！ みちを おしえてる！');
  expect(said).toContain('ちかづくと わかるよ！');
  expect(said).toContain('にせものの ひかりだ！ サカサの かな');
  expect(said).toContain('たかい えだで なにか ちりん…');
  expect(said).not.toContain('ライトが あれば みえそう…');
  expect((await night(page)).lighting).toEqual(['day', 'night', 'day']);
  expect(errors).toEqual([]);
});

test('0-1: the fawn gazes at the light (a soft fail), the tanukis come and dance, a firefly dead end', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  const lines = await recordLines(page);
  await recordNight(page);
  const app = page.locator('#app');
  await start(page);
  await setNotch(page, NORMAL);
  await passHedgehog(page);

  // The light left on through the hush stretch: the sleepers hide (not a fail), the record is not found, the fawn stops
  // in the middle to gaze at the light; reached, "ききっ… こじかさん、ぴょーん！" (glare) and back before the stretch.
  await light(page, true);
  await expect(app).toHaveAttribute('data-hush-startles', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-glare-freezes', '1', { timeout: 60_000 });
  await page.screenshot({ path: resolve(OUT, 'night-fawn-freeze.png') });
  await waitFailAndRewind(page, 'glare', HUSH.rewind, 1);
  expect((await night(page)).fawns).toContain('kojika:freeze');
  expect((await progress(page)).records ?? []).not.toContain('test-bunny');
  // Put back with the light still on: its hush glow is there at once.
  await expect(page.locator('#light')).toHaveAttribute('data-on', '1');
  await expect(page.locator('#light')).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  await expect(page.locator('#light')).toHaveAttribute('data-glow-for', 'dim');

  // Again with the light on; while the fawn gazes, the light is pressed ten times in a second: it only changes every
  // LIGHT.cooldown (three times at most); off in the end, the fawn blinks and hops off (no fail).
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-glare-freezes', '2', { timeout: 90_000 });
  const togglesBefore = (await night(page)).lightToggles;
  await page.evaluate(async () => {
    const b = document.getElementById('light') as HTMLElement;
    for (let i = 0; i < 10; i++) {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  expect((await night(page)).lightToggles - togglesBefore).toBeLessThanOrEqual(3);
  await page.waitForTimeout(600);
  await light(page, false);
  await expect(app).toHaveAttribute('data-fawns', 'kojika:gone', { timeout: 20_000 });
  await waitFront(page, 'main', HUSH.to + 5);
  await expect(app).toHaveAttribute('data-fails', '1');
  await setNotch(page, FAST);
  await waitFront(page, 'main', REVERSED.from - 30);
  await setNotch(page, NORMAL);

  // The whistle-reversed stretch: whistled 10 m in at "ふつう" and not stopping: the tanukis come onto the rail and
  // dance; reached, "ききっ… たぬきさん、おどってた〜" (lure) and back 60 m before the stretch.
  await pressAt(page, 'whistle', REVERSED.from + 10);
  await expect(app).toHaveAttribute('data-lure-calls', '1');
  await waitFailAndRewind(page, 'lure', REVERSED.rewind, 2);
  expect((await night(page)).lure).toContain('come');
  const dancesAfterFail = Number(await app.getAttribute('data-lure-dances'));
  expect(dancesAfterFail).toBeGreaterThanOrEqual(1);

  // Again: whistled and stopped at once, then the whistle pressed four more times while they dance: the groups come
  // once each (the extra whistles only make the dance a little longer), they go home within 9 s, "ばいばい！", no fail.
  await setNotch(page, NORMAL);
  await pressAt(page, 'whistle', REVERSED.from + 10);
  await page.waitForFunction(() => document.getElementById('app')?.dataset.lure === 'come' || document.getElementById('app')?.dataset.lure === 'dance', undefined, { timeout: 10_000 });
  const cameAt = Number(await app.getAttribute('data-time'));
  await setNotch(page, STOP);
  await expect(app).toHaveAttribute('data-lure', 'dance', { timeout: 10_000 });
  await page.screenshot({ path: resolve(OUT, 'night-lure.png') });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(2_100);
    await page.locator('#whistle').dispatchEvent('pointerdown');
  }
  await expect(app).toHaveAttribute('data-lure', '', { timeout: 15_000 });
  // On the game clock (the frame rate of the CI does not matter).
  expect(Number(await app.getAttribute('data-time')) - cameAt).toBeLessThan(9.5);
  const dances = Number(await app.getAttribute('data-lure-dances'));
  expect(dances - dancesAfterFail).toBe(2);
  await expect(app).toHaveAttribute('data-fails', '2');
  expect(await lines()).toContain('ばいばい！ きてきは がまんだね');
  await setNotch(page, FAST);

  // The firefly fork not whistled: the default way is the dark dead end; back 80 m before the fork, where the whistle
  // glows at once.
  await expect(app).toHaveAttribute('data-rail', 'kurai', { timeout: 120_000 });
  await waitFailAndRewind(page, 'deadEnd', HOTARU - 80, 3);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  await pressWhen(page, 'whistle', "b.glow === '1' && d.phase === 'driving'");
  await expect(app).toHaveAttribute('data-fireflies', /hotaru:home/, { timeout: 10_000 });
  await setNotch(page, FAST);
  await waitFront(page, 'main', HOTARU + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');

  const said = await lines();
  expect(said).toContain('あっ、びっくりして かくれちゃった');
  expect(said).toContain('こじかさんが ライトに みとれてる！');
  expect(said).toContain('ききっ… こじかさん、ぴょーん！');
  expect(said).toContain('つきの ばしょでは ライトを けしてね');
  expect(said).toContain('わわっ、よってきちゃった！ とまって！');
  expect(said).toContain('ききっ… たぬきさん、おどってた〜');
  expect(said).toContain('くらい いきどまり… ほたるに きこう');
  expect(said).toContain('きてきで ほたるに あいず！');
  expect(errors).toEqual([]);
});

test('0-1: after two fails in a row the fawn crosses and the tanukis dance in the bushes (left-handed layout)', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  const lines = await recordLines(page);
  await recordNight(page);
  const app = page.locator('#app');
  await start(page, { leftHanded: true });
  await expect(app).toHaveClass(/is-left-handed/);
  await roundButtonsApart(page);
  await setNotch(page, NORMAL);
  await passHedgehog(page);

  // Two fawn fails in a row with the light on; the third time it crosses anyway ("こじかさん、こんどは わたれたね").
  await light(page, true);
  await setNotch(page, FAST);
  await waitFailAndRewind(page, 'glare', HUSH.rewind, 1);
  await setNotch(page, FAST);
  await waitFailAndRewind(page, 'glare', HUSH.rewind, 2);
  await setNotch(page, FAST);
  await expect(page.locator('#light')).toHaveAttribute('data-on', '1');
  await roundButtonsApart(page);
  await waitFront(page, 'main', HUSH.to + 5);
  await expect(app).toHaveAttribute('data-fawns', 'kojika:gone');
  await expect(app).toHaveAttribute('data-fails', '2');
  await light(page, false);
  await waitFront(page, 'main', REVERSED.from - 30);
  await setNotch(page, NORMAL);

  // Two tanuki fails in a row; the third whistle brings nobody onto the rail (they dance in their bushes).
  await pressAt(page, 'whistle', REVERSED.from + 10);
  await waitFailAndRewind(page, 'lure', REVERSED.rewind, 3);
  await setNotch(page, NORMAL);
  await pressAt(page, 'whistle', REVERSED.from + 10);
  await waitFailAndRewind(page, 'lure', REVERSED.rewind, 4);
  const dances = await app.getAttribute('data-lure-dances');
  await setNotch(page, NORMAL);
  await pressAt(page, 'whistle', REVERSED.from + 10);
  await waitFront(page, 'main', REVERSED.to + 15);
  await expect(app).toHaveAttribute('data-lure-dances', dances ?? '');
  await expect(app).toHaveAttribute('data-fails', '4');

  const said = await lines();
  expect(said).toContain('こじかさん、こんどは わたれたね');
  expect(said).toContain('たぬきさん、やぶで おどってる！');
  expect(errors).toEqual([]);
});
