import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, NORMAL, recordLines, setNotch, stopAt, tapUntil, waitDriving, waitWelcome } from './drive';

/**
 * PR8b「ドアを あけて まつ」(PHASE9_CHAPTER5_6 第 7 部 §4.3・§16.3) on the hidden test stage 0-6's mission 2 (resumed
 * there: "つづき" from mission 2 also brings on what mission 1 left, うしろむき and Sakasa on her bench), plus the
 * mission's own junction default (t-wakare's arrow chosen from the start) and the ending's friends riding along
 * ("crew") and the train rolling off by itself ("depart").
 *
 * Built for about 10 fps software GL: the beats (1 s each on 0-6) are kept by a MutationObserver in the page
 * (window.__welcomeLog, with the round buttons glowing at each change) and looked at afterwards; a press that must land
 * in a beat is made in the page on the frame it starts.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

/** 0-6's places (scripts/layout-0-6.mjs). */
const SHIMA_EKI = 100;
const ABILITIES = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight', 'reverse'];

interface WelcomeEntry {
  t: number;
  beat: string;
  glow: string[];
}

async function recordWelcome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.__welcomeLog = log;
    w.__preset = '';
    let last = '';
    new MutationObserver(() => {
      const app = document.getElementById('app');
      if (!app) return;
      const beat = app.dataset.welcome ?? '';
      if (beat && beat !== last) {
        last = beat;
        const glow = [...document.querySelectorAll<HTMLElement>('.round-button, #reverse-switch')].filter((b) => b.dataset.glow === '1' && !b.hidden).map((b) => b.id);
        log.push({ t: Number(app.dataset.time), beat, glow });
      }
      const junction = document.getElementById('junction');
      if (junction && !junction.hidden && junction.dataset.preset) {
        const selected = junction.querySelector<HTMLElement>('.arrow.is-selected')?.dataset.side ?? '';
        w.__preset = `${junction.dataset.preset}:${selected}`;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-welcome', 'data-glow', 'hidden', 'data-preset', 'class'] });
  });
}

const welcomeLog = (page: Page): Promise<WelcomeEntry[]> => page.evaluate(() => (window as unknown as { __welcomeLog: WelcomeEntry[] }).__welcomeLog);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** "つづき" from 0-6's mission 2, driven to しまの えき, standing with the door button up. */
async function toTheDoor(page: Page): Promise<() => Promise<string>> {
  await page.addInitScript((abilities) => {
    localStorage.setItem(
      'train-game.progress.v1',
      JSON.stringify({ schema: 1, cleared: ['5-3'], abilities, records: [], mapLinks: [], resume: { stage: '0-6', mission: 1 } }),
    );
  }, ABILITIES);
  await recordWelcome(page);
  const lines = await recordLines(page);
  await page.goto('/?stage=0-6&go=1&resume=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ミッション 2');
  await waitDriving(page);
  // Sakasa sits on her bench already (what mission 1 left; a resume brings it on).
  await expect.poll(async () => (await page.locator('#app').getAttribute('data-cutscene-actors')) ?? '', { timeout: 10_000 }).toContain('sakasa');
  await setNotch(page, NORMAL);
  await stopAt(page, 't-shima', SHIMA_EKI);
  await expect(page.locator('#door')).toBeVisible({ timeout: 30_000 });
  await expect.poll(lines, { timeout: 20_000 }).toContain('ドアを あけて、まって みよう');
  await expect(page.locator('#app')).toHaveAttribute('data-welcome', 'ask');
  return lines;
}

async function openDoor(page: Page): Promise<void> {
  await page.locator('#door').dispatchEvent('pointerdown');
  await expect(page.locator('#app')).not.toHaveAttribute('data-welcome', 'ask', { timeout: 10_000 });
}

test('0-6 ドアを あけて まつ: the doors stay open, she comes in five beats and boards; nothing glows; the ending rolls off with her', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const lines = await toTheDoor(page);
  const app = page.locator('#app');
  // The mission's own default at t-wakare: its left arrow (the siding) was chosen from the start.
  expect(await page.evaluate(() => (window as unknown as { __preset: string }).__preset)).toBe('left:left');
  // A whistle before the doors open: she only hides her face (no flinch counted, still asking).
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await page.waitForTimeout(500);
  await expect(app).toHaveAttribute('data-welcome-flinches', '0');
  await expect(app).toHaveAttribute('data-welcome', 'ask');
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.time) > 0, null);
  // Wait out the whistle's rest before the doors open (a press later must not be one from here).
  await page.waitForTimeout(2500);
  await openDoor(page);
  // The music softer, the whistle marked "しーっ", nothing glowing, the doors open until she is in.
  await expect(app).toHaveAttribute('data-music-gain', '0.3', { timeout: 5_000 });
  await expect(page.locator('#whistle')).toHaveAttribute('data-mark', 'hush');
  await waitWelcome(page, 'peek', 30_000);
  await page.screenshot({ path: `${OUT}/welcome-peek.png` });
  await waitWelcome(page, 'done', 30_000);
  await expect(page.locator('#cargo')).toHaveAttribute('data-passengers', '1', { timeout: 10_000 });
  const log = await welcomeLog(page);
  expect(log.map((e) => e.beat)).toEqual(['ask', 'look', 'stand', 'walk', 'peek', 'board', 'done']);
  for (const e of log.filter((x) => x.beat !== 'ask')) expect(e.glow, `glowing at ${e.beat}`).toEqual([]);
  await expect(app).toHaveAttribute('data-music-gain', '1', { timeout: 10_000 });
  await expect(page.locator('#whistle')).not.toHaveAttribute('data-mark', 'hush', { timeout: 10_000 });
  // The mission's card, then the ending: "…こんにちは", she sits behind the driver, the train rolls off by itself.
  await card(page, 'できた');
  await tapUntil(page, '#app[data-crew="sakasa"]', 60_000);
  await expect.poll(lines, { timeout: 10_000 }).toContain('…こんにちは');
  await tapUntil(page, '#app[data-depart="done"]', 60_000);
  expect(Number(await app.getAttribute('data-s')) + 6).toBeGreaterThan(130);
  await tapUntil(page, '#card', 60_000);
  await expect(page.locator('#card')).toContainText('クリア');
  expect(errors).toEqual([]);
});

test('0-6 ドアを あけて まつ: calling out while she walks sends her one beat back; she still boards', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const lines = await toTheDoor(page);
  const app = page.locator('#app');
  await openDoor(page);
  // The whistle on the frame "walk" starts (in the page).
  await page.waitForFunction(
    () => {
      const d = document.getElementById('app')?.dataset;
      if (d?.welcome !== 'walk') return false;
      document.getElementById('whistle')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    null,
    { timeout: 30_000, polling: 'raf' },
  );
  await expect(app).toHaveAttribute('data-welcome-flinches', '1', { timeout: 5_000 });
  await expect.poll(lines, { timeout: 10_000 }).toContain('しーっ… なにも いわないで まとう');
  await waitWelcome(page, 'done', 30_000);
  const beats = (await welcomeLog(page)).map((e) => e.beat);
  const walk = beats.indexOf('walk');
  expect(beats[walk + 1]).toBe('stand');
  expect(beats.slice(-3)).toEqual(['peek', 'board', 'done']);
  expect(errors).toEqual([]);
});

test('0-6 ドアを あけて まつ: mashing the whistle: two flinches at most, "まつ だけで いいよ" once, then she boards', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const lines = await toTheDoor(page);
  const app = page.locator('#app');
  await openDoor(page);
  // Ten presses a second for three seconds (the whistle's own rest lets one in every 2 s).
  await page.evaluate(async () => {
    const b = document.getElementById('whistle') as HTMLElement;
    for (let i = 0; i < 30; i++) {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  await waitWelcome(page, 'done', 40_000);
  expect(Number(await app.getAttribute('data-welcome-flinches'))).toBeLessThanOrEqual(2);
  const said = (await lines()).split('\n');
  expect(said.filter((l) => l === 'まつ だけで いいよ').length).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('0-6 ドアを あけて まつ: pressing on and on every 2 s, she still boards within 25 s (giggling)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await toTheDoor(page);
  const app = page.locator('#app');
  await openDoor(page);
  const opened = Number(await app.getAttribute('data-time'));
  // In the page: a press every 2.05 s of game time, never stopping, until she is aboard.
  await page.evaluate(() => {
    const app = document.getElementById('app') as HTMLElement;
    const b = document.getElementById('whistle') as HTMLElement;
    let last = -99;
    const tick = (): void => {
      if (app.dataset.welcome === 'done') return;
      const t = Number(app.dataset.time);
      if (t - last >= 2.05) {
        last = t;
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await waitWelcome(page, 'done', 60_000);
  const done = (await welcomeLog(page)).find((e) => e.beat === 'done');
  expect((done?.t ?? 999) - opened).toBeLessThanOrEqual(25);
  expect(Number(await app.getAttribute('data-welcome-flinches'))).toBeLessThanOrEqual(2);
  expect(Number(await app.getAttribute('data-welcome-giggles'))).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
