import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, doors, FRONT, NORMAL, pressOnGlow, recordLines, setNotch, stopAt, tapUntil, waitDriving, waitFront } from './drive';

/**
 * PR4「おもちゃの まち」の しくみ on the hidden test stage 0-2 てすとの おもちゃ (PHASE9_CHAPTER5_6 §0.8, 第 5 部 §15): the
 * cutscene press that winds a figure (fx "windup"), a plain cat (the whistle does not glow for it) and a reverse-wound
 * chick walking back (it does), the spinning fork (no arrows; let be at "ふつう" it sends the train round the loop, then
 * waits the good way; mashing the whistle before it glows does not stop it, a press on the glow does), the toy band
 * (held behind it until wound, then followed at its pace whatever the lever says, "ゆっくり" glowing), and the ending's
 * big key winding the town.
 *
 * Built for about 10 fps software GL: every press that must land in a window is checked and made in the same page
 * callback, and the short states (the band turning, the fork's states, the speeds behind the band) are kept by a
 * MutationObserver in the page (window.__toy) and looked at afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

/** 0-2's places (main s; scripts/layout-0-2.mjs). */
const NEKO = 150;
const KURU = 400;
const OWARI = 800;
/** The lever notches (src/train/params.ts LEVER_NOTCHES). */
const SLOW_NOTCH = 2;
const TOP_NOTCH = 5;

interface ToyLog {
  parade: string[];
  spins: string[];
  paradeMaxSpeed: number;
  paradeMinGap: number;
  leverHintSeen: number[];
  /** The whistle glowed while the front was in reach of the plain cat (it must not). */
  catGlow: boolean;
  /** The junction arrows showed near the spinning fork (they must not). */
  arrowsNearSpin: boolean;
}

/** Keeps the short toy states in window.__toy (set up before the page loads). */
async function recordToys(page: Page): Promise<void> {
  await page.addInitScript(
    ([neko, kuru]) => {
      const log = { parade: [] as string[], spins: [] as string[], paradeMaxSpeed: 0, paradeMinGap: 999, leverHintSeen: [] as number[], catGlow: false, arrowsNearSpin: false };
      (window as unknown as { __toy: typeof log }).__toy = log;
      const push = (list: string[], v: string | undefined): void => {
        if (v !== undefined && v !== '' && list[list.length - 1] !== v) list.push(v);
      };
      new MutationObserver(() => {
        const app = document.getElementById('app');
        if (!app) return;
        const d = app.dataset;
        push(log.parade, d.parade);
        push(log.spins, d.spins);
        const front = Number(d.s) + 6;
        if (d.parade === 'march' || d.parade === 'wait') {
          log.paradeMaxSpeed = Math.max(log.paradeMaxSpeed, Number(d.speed));
          if (d.paradeGap) log.paradeMinGap = Math.min(log.paradeMinGap, Number(d.paradeGap));
        }
        for (const el of document.querySelectorAll<HTMLElement>('.lever-detent[data-hint="1"]')) {
          const n = Number(el.dataset.notch);
          if (!log.leverHintSeen.includes(n)) log.leverHintSeen.push(n);
        }
        const glow = document.getElementById('whistle')?.dataset.glow === '1';
        if (glow && d.phase === 'driving' && d.rail === 'main' && front >= neko - 62 && front <= neko - 8 && !(d.actors ?? '').includes('neko:awake')) log.catGlow = true;
        const arrows = document.getElementById('junction');
        if (arrows && !arrows.hidden && d.rail === 'main' && front >= kuru - 80 && front <= kuru + 10) log.arrowsNearSpin = true;
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-s', 'data-parade', 'data-spins', 'data-speed', 'data-hint', 'data-glow', 'hidden'] });
    },
    [NEKO, KURU] as const,
  );
}

function toys(page: Page): Promise<ToyLog> {
  return page.evaluate(() => (window as unknown as { __toy: ToyLog }).__toy);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** A cutscene waits for the whistle ("きてきを ならして みて！"): press it on its glow; the figure is wound. */
async function cutscenePress(page: Page, windups: number): Promise<void> {
  await tapUntil(page, '#app[data-cutscene-press="whistle"]');
  await pressOnGlow(page, 'whistle');
  await expect(page.locator('#app')).toHaveAttribute('data-windups', String(windups), { timeout: 20_000 });
}

/** Opens 0-2 straight into play: the opening (the child winds a chick with the whistle), the mission card, driving. */
async function start(page: Page, options: { leftHanded?: boolean } = {}): Promise<void> {
  if (options.leftHanded) {
    await page.addInitScript(() => localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: true })));
  }
  await page.goto('/?stage=0-2&go=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await cutscenePress(page, 1);
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

/**
 * Presses the whistle each time it glows (at most every 0.3 s of game time) until `done` holds in the page: a press that
 * lands in the whistle's cooldown does nothing, so the next frame's glow presses again.
 */
async function whistleOnGlowUntil(page: Page, done: string): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __lastPress: number }).__lastPress = -1;
  });
  await page.waitForFunction(
    (src) => {
      const app = document.getElementById('app');
      const b = document.getElementById('whistle');
      if (!app || !b) return false;
      if (new Function('d', `return (${src});`)(app.dataset) as boolean) return true;
      const w = window as unknown as { __lastPress: number };
      const now = Number(app.dataset.time);
      if (b.dataset.glow === '1' && app.dataset.phase === 'driving' && now - w.__lastPress > 0.3) {
        w.__lastPress = now;
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
      return false;
    },
    done,
    { timeout: 240_000, polling: 'raf' },
  );
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

test('0-2: the chick wound on its glow, the spinning fork round the loop then the good way, the band held, wound and followed, the town wound', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  const lines = await recordLines(page);
  await recordToys(page);
  const app = page.locator('#app');
  await start(page);
  await expect(app).toHaveAttribute('data-music', 'omocha');
  await roundButtonsApart(page);
  await page.screenshot({ path: resolve(OUT, 'toy-start.png') });

  // A plain cat: the whistle does not glow for it; whistled, it wakes. The wind-up chick walks back; the whistle glows
  // for it and a press winds it ("くるりん！").
  await setNotch(page, NORMAL);
  await pressAt(page, 'whistle', NEKO - 45);
  await expect(app).toHaveAttribute('data-actors', /neko:awake/, { timeout: 20_000 });
  await expect(app).toHaveAttribute('data-actors', /hiyoko:walk/, { timeout: 60_000 });
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-actors', /hiyoko:awake/, { timeout: 20_000 });
  await expect(app).toHaveAttribute('data-windups', '2');
  expect((await toys(page)).catGlow).toBe(false);

  // The spinning fork let be at "ふつう": it wakes on the loop side, turns, and at the lock points the loop side again:
  // round the loop (not a fail), seen from above; back on main it waits the good way (mercy) and the whistle glows;
  // not pressed, the train goes on the good way anyway. No arrows show for it.
  await expect(app).toHaveAttribute('data-spins', /t-kuru:(stay-other|turn|stay-good)/, { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-spin-taken', /t-kuru:loop/, { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-rail', 't-kuru-wa');
  await expect(app).toHaveAttribute('data-camera', 'top', { timeout: 20_000 });
  await page.screenshot({ path: resolve(OUT, 'toy-spin-loop.png') });
  await waitFront(page, 'main', KURU - 55);
  await expect(app).toHaveAttribute('data-spins', /t-kuru:mercy/);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 20_000 });
  await expect(app).toHaveAttribute('data-spin-taken', 't-kuru:loop,t-kuru:good', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-rail', 'main');
  expect((await toys(page)).arrowsNearSpin).toBe(false);
  const failsBefore = Number((await app.getAttribute('data-fails')) ?? '0');

  // The band, let be: it walks back and the train is held behind it (softly, no fail); then wound on the whistle's glow
  // it turns and marches; at "びゅーん" the train still follows at the band's pace, "ゆっくり" glowing on the lever.
  await page.waitForFunction(
    () => {
      const d = document.getElementById('app')?.dataset;
      return d?.paradeHeld === '1' && Math.abs(Number(d.speed)) < 0.3 && Number(d.paradeGap) >= 12;
    },
    undefined,
    { timeout: 120_000 },
  );
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1');
  await page.screenshot({ path: resolve(OUT, 'toy-band-held.png') });
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-parade', /turn|march/, { timeout: 10_000 });
  await setNotch(page, TOP_NOTCH);
  await expect(app).toHaveAttribute('data-parade', 'march', { timeout: 10_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: resolve(OUT, 'toy-band-march.png') });
  await expect(app).toHaveAttribute('data-parade', 'gone', { timeout: 120_000 });
  // The band gone, the lever is the child's again.
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) > 6, undefined, { timeout: 30_000 });
  await setNotch(page, NORMAL);
  const log = await toys(page);
  expect(log.parade).toContain('turn');
  expect(log.parade).toContain('march');
  expect(log.paradeMaxSpeed).toBeLessThanOrEqual(5.6);
  expect(log.paradeMinGap).toBeGreaterThanOrEqual(11.5);
  expect(log.leverHintSeen).toContain(SLOW_NOTCH);
  expect(Number((await app.getAttribute('data-fails')) ?? '0')).toBe(failsBefore);

  // The end station, then the ending: the big key wound with the whistle winds the whole town.
  await stopAt(page, 'main', OWARI);
  await doors(page);
  await card(page, 'できた');
  await cutscenePress(page, 4);
  await expect(app).toHaveAttribute('data-town', 'wound');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, 'toy-town-wound.png') });
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('クリア');

  const said = await lines();
  expect(said).toContain('ひよこさんが うしろあるき！ きてき！');
  expect(said).toContain('くるりん！ まえむきに なった！');
  expect(said).toContain('くるくる ポイント！ よく みてね');
  expect(said).toContain('あれれ、ぐるっと まわってる…');
  expect(said).toContain('ポイントが まってて くれるよ！');
  expect(said).toContain('がくたいさんが うしろあるき〜！');
  expect(said).toContain('がくたいさんを きてきで まきなおそう');
  expect(said).toContain('くるりん！ ぱっぱかぱーん！');
  expect(said).toContain('パレードだ！ ゆっくり ついていこう');
  expect(said).toContain('ありがとう〜 がくたいさん！');
  expect(errors).toEqual([]);
});

test('0-2: mashing the whistle before the spinning fork glows does not stop it; on the glow it stops the good way (left-handed)', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  const lines = await recordLines(page);
  await recordToys(page);
  const app = page.locator('#app');
  await start(page, { leftHanded: true });
  await expect(app).toHaveClass(/is-left-handed/);
  await roundButtonsApart(page);
  await setNotch(page, NORMAL);
  await pressAt(page, 'whistle', NEKO - 45);
  await expect(app).toHaveAttribute('data-actors', /neko:awake/, { timeout: 20_000 });
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-actors', /hiyoko:awake/, { timeout: 20_000 });

  // Awake on its loop side: the whistle pressed five times a second until it starts turning: nothing stops it.
  await expect(app).toHaveAttribute('data-spins', 't-kuru:stay-other', { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const d = document.getElementById('app')?.dataset;
      const w = window as unknown as { __mash?: number };
      if (!d) return false;
      if (d.spins !== 't-kuru:stay-other') return true;
      const now = Number(d.time);
      if (w.__mash === undefined || now - w.__mash >= 0.2) {
        w.__mash = now;
        document.getElementById('whistle')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
      return false;
    },
    undefined,
    { timeout: 60_000, polling: 'raf' },
  );
  expect((await toys(page)).spins.some((s) => s.includes('fixed'))).toBe(false);
  // Pointing the good way it glows: pressed (again if a press fell in the whistle's rest), it stops there ("ぴたっ！").
  await whistleOnGlowUntil(page, "(d.spins ?? '').includes('fixed')");
  await expect(app).toHaveAttribute('data-spins', 't-kuru:fixed');
  await page.screenshot({ path: resolve(OUT, 'toy-spin-fixed.png') });
  await expect(app).toHaveAttribute('data-spin-taken', 't-kuru:good', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-rail', 'main');
  await expect(app).toHaveAttribute('data-windups', '3');
  expect((await toys(page)).arrowsNearSpin).toBe(false);
  expect(await lines()).toContain('ぴたっ！ とまった！');
  expect(errors).toEqual([]);
});
