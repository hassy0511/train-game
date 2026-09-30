import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, FAST, NORMAL, pressOnGlow, progress, recordLines, setNotch, SLOW, STOP, stopAt, tapUntil, waitDriving, waitFront, waitLead } from './drive';

/**
 * PR8b「おいかけっこ」(PHASE9_CHAPTER5_6 第 7 部 §4.1・§4.2・§16.2) on the hidden test stage 0-6 てすとの おいかけっこ, on
 * the production build. うしろむき is PR8a's: here the train never reverses, so after "ぎゃくだ！" Sakasa always comes
 * back by herself (`autoFollowAfter`, 12 s on 0-6) and the stage plays to its end that way; following a train that
 * backs up is checked on a dev server with the dev-only fake (lead-reverse.spec.ts).
 *
 * Built for about 10 fps software GL: presses that must land in a window are checked and made in one page callback
 * (pressOnGlow), and the short states (a 3 s dash, the 0.3 s wait after the picture) are kept by a MutationObserver in
 * the page (window.__leadLog, window.__icons) and looked at afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

/** 0-6's places (scripts/layout-0-6.mjs). */
const EKI = 310;
const ABILITIES = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'];

interface LeadEntry {
  t: number;
  lead: string;
  gap: number;
  front: number;
  calls: number;
  closed: string;
  speed: number;
}

/** Keeps the lead's states in window.__leadLog and the bubble's pictures in window.__icons (set up before load). */
async function recordLead(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    const icons: { t: number; icon: string }[] = [];
    const arrows: number[] = [];
    const modes: string[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.__leadLog = log;
    w.__icons = icons;
    w.__arrows = arrows;
    w.__modes = modes;
    let last = '';
    new MutationObserver(() => {
      const app = document.getElementById('app');
      if (!app) return;
      const d = app.dataset;
      const t = Number(d.time);
      if (d.lead !== undefined) {
        const e = { t, lead: d.lead, gap: Number(d.leadGap), front: Number(d.s) + 6, calls: Number(d.leadCalls), closed: d.stationClosed ?? '', speed: Number(d.speed) };
        const key = `${e.lead}|${e.gap}|${e.closed}|${e.calls}`;
        if (key !== last && log.length < 20000) {
          last = key;
          log.push(e);
        }
      }
      const icon = document.getElementById('bubble')?.dataset.icon;
      if (icon && icons[icons.length - 1]?.icon !== icon) icons.push({ t, icon });
      if (!icon && icons.length && icons[icons.length - 1].icon !== '') icons.push({ t, icon: '' });
      const junction = document.getElementById('junction');
      if (junction && !junction.hidden && d.mission === '0') arrows.push(t);
      const mode = document.getElementById('whistle')?.dataset.mode;
      if (mode) modes.push(mode);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-lead', 'data-lead-gap', 'data-station-closed', 'data-icon', 'hidden', 'data-mode', 'data-time'] });
  });
}

/** Waits until the lead's log saw `phase` (a state may last a single frame: met, then gone at once on the stop line). */
async function seenLead(page: Page, phase: string, timeoutMs = 60_000): Promise<void> {
  await page.waitForFunction((p) => (window as unknown as { __leadLog: LeadEntry[] }).__leadLog.some((e) => e.lead === p), phase, { timeout: timeoutMs });
}

const leadLog = (page: Page): Promise<LeadEntry[]> => page.evaluate(() => (window as unknown as { __leadLog: LeadEntry[] }).__leadLog);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

// On a failure: where the lead was (the log's last entries and the page's hooks), for the CI log.
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const d = await page.evaluate(() => {
    const a = document.getElementById('app')?.dataset ?? {};
    return { lead: a.lead, gap: a.leadGap, calls: a.leadCalls, auto: a.leadAuto, closed: a.stationClosed, s: a.s, speed: a.speed, phase: a.phase, time: a.time };
  });
  console.log('lead hooks', JSON.stringify(d));
  console.log('lead log', JSON.stringify((await leadLog(page).catch(() => [])).slice(-30)));
});

/** Opens 0-6 with a save that has every ability up to chapter 5 (and `extra`), into driving mission 1. */
async function start(page: Page, options: { extra?: string[]; leftHanded?: boolean } = {}): Promise<void> {
  await page.addInitScript(
    ([abilities, leftHanded]) => {
      localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: ['5-3'], abilities, records: [], mapLinks: [] }));
      if (leftHanded) localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: true }));
    },
    [[...ABILITIES, ...(options.extra ?? [])], options.leftHanded ?? false] as const,
  );
  await page.goto('/?stage=0-6&go=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ミッション 1');
  await waitDriving(page);
}

/** Game time now (s). */
const gameTime = async (page: Page): Promise<number> => Number(await page.locator('#app').getAttribute('data-time'));

/** Waits `seconds` of game time. */
async function gameWait(page: Page, seconds: number): Promise<void> {
  const t0 = await gameTime(page);
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + seconds, { timeout: seconds * 1000 * 12 + 10_000 });
}

/** The learn cutscene: the partner works it out, the card, and the switch appears (stand-in until PR8a). */
async function learn(page: Page, shot?: string): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-inline-cutscene', 't-gyaku', { timeout: 60_000 });
  await tapUntil(page, '#card', 60_000);
  await expect(page.locator('#card')).toContainText('うしろむき うんてんを');
  await expect(page.locator('#card')).toContainText('おぼえた！');
  await expect(page.locator('#reverse-switch')).toBeVisible();
  if (shot) await page.screenshot({ path: `${OUT}/${shot}` });
  await page.locator('#card-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-inline-cutscene', '', { timeout: 30_000 });
  await expect.poll(async () => (await progress(page)).abilities, { timeout: 10_000 }).toContain('reverse');
}

test('0-6 おいかけっこ: "とまって" twice makes her run off, "ぎゃくだ！" teaches うしろむき, she comes back, the station opens', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await recordLead(page);
  const lines = await recordLines(page);
  await start(page);
  const app = page.locator('#app');
  // The switch waits until うしろむき is learned; the whistle never changes its face.
  await expect(page.locator('#reverse-switch')).toBeHidden();
  await setNotch(page, NORMAL);
  await waitLead(page, 'tease');
  await expect.poll(lines, { timeout: 20_000 }).toContain('さようなら〜！');
  await expect.poll(lines, { timeout: 20_000 }).toContain('でた！ まてまて〜！');
  const teaseAt = await gameTime(page);
  await gameWait(page, 4);
  await page.screenshot({ path: `${OUT}/lead-tease.png` });
  // Always ahead on the rubber band (never caught, never out of reach).
  const teasing = (await leadLog(page)).filter((e) => e.lead === 'tease' && e.t >= teaseAt + 0.5);
  expect(teasing.length).toBeGreaterThan(0);
  for (const e of teasing) expect(e.gap, `tease gap at ${e.t}`).toBeGreaterThanOrEqual(25);
  for (const e of teasing) expect(e.gap, `tease gap at ${e.t}`).toBeLessThanOrEqual(60);

  // "きてきで よんで みよう！": the whistle glows; a press calls "とまって〜！" (an open hand) and she dashes off.
  await pressOnGlow(page, 'whistle', 30_000);
  await expect(app).toHaveAttribute('data-lead-calls', '1', { timeout: 10_000 });
  const called = await gameTime(page);
  await gameWait(page, 4);
  const icons = await page.evaluate(() => (window as unknown as { __icons: { t: number; icon: string }[] }).__icons);
  const hand = icons.find((i) => i.icon === 'hand-stop');
  expect(hand, 'the call has the open hand').toBeTruthy();
  const log = await leadLog(page);
  expect(log.some((e) => e.lead === 'dash')).toBe(true);
  const dash = log.filter((e) => e.t >= called - 0.2 && e.t <= called + 4);
  expect(Math.max(...dash.map((e) => e.gap))).toBeGreaterThanOrEqual(60);
  // She moves off after the picture (the gap grows only from 0.3 s after it).
  const atCall = log.filter((e) => e.t <= (hand?.t ?? 0)).pop()?.gap ?? 0;
  const early = log.filter((e) => e.t > (hand?.t ?? 0) && e.t < (hand?.t ?? 0) + 0.25);
  for (const e of early) expect(e.gap - atCall).toBeLessThan(2);
  await expect.poll(lines, { timeout: 10_000 }).toContain('あれれ？ もっと にげた！');

  // Again ("もう いっかい！"), then "ぎゃくだ！": the train is braked to a stop and the cutscene teaches うしろむき.
  await waitLead(page, 'tease', 20_000);
  await pressOnGlow(page, 'whistle', 30_000);
  await expect(app).toHaveAttribute('data-lead-calls', '2', { timeout: 10_000 });
  await expect.poll(lines, { timeout: 15_000 }).toContain('ぎゃくだ！');
  await learn(page, 'lead-learn-card.png');
  expect((await leadLog(page)).some((e) => e.lead === 'learn' || e.lead === 'backup')).toBe(true);
  await expect(app).toHaveAttribute('data-lead', 'backup');
  await expect(app).toHaveAttribute('data-notch', String(STOP));
  // The switch glows ("うしろへ"); a whistle now only makes her hop (the calls stay 2).
  await expect(page.locator('#reverse-switch')).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  await gameWait(page, 2.2);
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await gameWait(page, 0.5);
  await expect(app).toHaveAttribute('data-lead-calls', '2');
  // Nobody backs up (うしろむき is PR8a's): she comes back by herself ("あれ？ もどって きた！") and stops before the train.
  await expect.poll(lines, { timeout: 20_000 }).toContain('うしろへ さがって みよう！');
  await waitLead(page, 'met', 90_000);
  await expect.poll(lines, { timeout: 10_000 }).toContain('あれ？ もどって きた！');
  await expect(app).toHaveAttribute('data-station-closed', '', { timeout: 10_000 });
  await expect.poll(async () => Number(await app.getAttribute('data-lead-gap')), { timeout: 20_000 }).toBeLessThanOrEqual(14);
  await page.screenshot({ path: `${OUT}/lead-met.png` });
  // On to the station: past her, she goes home ("おしろの ほうへ いった…"); the station grades the stop again.
  await setNotch(page, NORMAL);
  await stopAt(page, 't-wa', EKI);
  await expect(app).toHaveAttribute('data-lead', 'gone');
  await expect.poll(lines, { timeout: 10_000 }).toContain('おしろの ほうへ いった…');
  await card(page, 'できた');
  // Never a face on the whistle.
  expect(await page.evaluate(() => (window as unknown as { __modes: string[] }).__modes)).toEqual([]);
  expect(errors).toEqual([]);
});

test('0-6 おいかけっこ: nobody calls — the partner does, she comes back by herself; the closed station on the way', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await recordLead(page);
  const lines = await recordLines(page);
  await start(page);
  const app = page.locator('#app');
  // Fast, then stop at the closed station before anyone calls: "えきは あとで！", no gauge, no grading.
  await setNotch(page, FAST);
  await waitFront(page, 't-wa', 200);
  await setNotch(page, SLOW);
  await waitFront(page, 't-wa', EKI - 4.5);
  await setNotch(page, STOP);
  await expect.poll(lines, { timeout: 30_000 }).toContain('えきは あとで！ サカサを おいかけよう');
  await expect(app).toHaveAttribute('data-station-closed', 't-eki');
  await expect(page.locator('#toast')).toBeHidden();
  await expect(page.locator('#stop-gauge')).toBeHidden();
  // The partner calls by himself ("とまって〜！", data-lead-auto), twice, then "ぎゃくだ！".
  await expect.poll(async () => Number(await app.getAttribute('data-lead-auto')), { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => Number(await app.getAttribute('data-lead-calls')), { timeout: 60_000 }).toBe(2);
  expect(Number(await app.getAttribute('data-lead-auto'))).toBe(2);
  await learn(page);
  // Standing on its stop line when she comes back: the station opens and the stop counts ("とまれた！").
  await seenLead(page, 'met', 90_000);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
  await card(page, 'できた');
  expect(Number(await app.getAttribute('data-fails') ?? '0')).toBe(0);
  expect(errors).toEqual([]);
});

test('0-6 おいかけっこ: past the closed station is no fail; the lock keeps the arrows away; the rubber band holds with the rocket', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await recordLead(page);
  await start(page);
  const app = page.locator('#app');
  await setNotch(page, FAST);
  await waitLead(page, 'tease');
  // The rocket does not get past her (never nearer than 25 m).
  await gameWait(page, 1.5);
  await page.locator('#rocket').dispatchEvent('pointerdown');
  await gameWait(page, 4);
  // Past the closed station at "はやい": no fail, on round the ring.
  await waitFront(page, 't-wa', EKI + 20);
  expect((await leadLog(page)).filter((e) => e.front > EKI - 30 && e.front < EKI + 10).every((e) => e.closed === 't-eki')).toBe(true);
  // The partner's calls, the learn cutscene, then she comes back and the station opens on the next lap.
  await expect.poll(async () => Number(await app.getAttribute('data-lead-calls')), { timeout: 90_000 }).toBe(2);
  await learn(page);
  try {
    await seenLead(page, 'met', 90_000);
  } catch (e) {
    console.log('DBG', JSON.stringify(await page.evaluate(() => ({ ...document.getElementById('app')?.dataset }))));
    console.log('DBG log', JSON.stringify((await leadLog(page)).slice(-40)));
    throw e;
  }
  await expect(app).toHaveAttribute('data-station-closed', '', { timeout: 60_000 });
  await setNotch(page, NORMAL);
  await stopAt(page, 't-wa', EKI);
  await card(page, 'できた');
  const log = await leadLog(page);
  for (const e of log.filter((x) => x.lead === 'tease' || x.lead === 'dash')) expect(e.gap, `gap at ${e.t}`).toBeGreaterThanOrEqual(24.5);
  // Mission 1 locks t-wakare to the ring: its arrows never showed, the train stayed on t-wa.
  expect(await page.evaluate(() => (window as unknown as { __arrows: number[] }).__arrows.length)).toBe(0);
  expect(Number((await app.getAttribute('data-fails')) ?? '0')).toBe(0);
  expect(errors).toEqual([]);
});

test('0-6 おいかけっこ: mashing the whistle counts one call per 2 s; standing, she stands too', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await recordLead(page);
  await start(page);
  const app = page.locator('#app');
  await setNotch(page, NORMAL);
  await waitLead(page, 'tease');
  // Ten presses in about a second: one call (the whistle's own 2 s rest).
  await page.evaluate(async () => {
    const b = document.getElementById('whistle') as HTMLElement;
    for (let i = 0; i < 10; i++) {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  await expect(app).toHaveAttribute('data-lead-calls', '1');
  // Stopped (after the dash), her gap does not grow: she waits, looking back.
  await waitLead(page, 'tease', 20_000);
  await setNotch(page, STOP);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) === 0, null, { timeout: 30_000 });
  await gameWait(page, 1);
  const g0 = Number(await app.getAttribute('data-lead-gap'));
  await gameWait(page, 3);
  expect(Number(await app.getAttribute('data-lead-gap'))).toBeLessThanOrEqual(g0 + 1);
  expect(errors).toEqual([]);
});

test('0-6: the stand-in switch sits beside the lever, left-handed too, and overlaps nothing', async ({ page }) => {
  test.setTimeout(120_000);
  for (const leftHanded of [false, true]) {
    const p = await page.context().newPage();
    const errors = watchErrors(p);
    await start(p, { extra: ['reverse'], leftHanded });
    const sw = p.locator('#reverse-switch');
    await expect(sw).toBeVisible();
    const box = await sw.boundingBox();
    const lever = await p.locator('.lever').boundingBox();
    expect(box && lever).toBeTruthy();
    if (!box || !lever) continue;
    // Beside the lever (on its side of the screen), not on it.
    const apart = box.x >= lever.x + lever.width - 1 || box.x + box.width <= lever.x + 1;
    expect(apart, `switch beside the lever (left-handed ${leftHanded})`).toBe(true);
    const rounds = await p.locator('.round-button:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
    expect(rounds.length).toBe(6);
    for (const r of rounds) {
      const overlap = box.x < r.x + r.w && box.x + box.width > r.x && box.y < r.y + r.h && box.y + box.height > r.y;
      expect(overlap).toBe(false);
    }
    if (leftHanded) await p.screenshot({ path: `${OUT}/lead-switch-left.png` });
    expect(errors).toEqual([]);
    await p.close();
  }
});
