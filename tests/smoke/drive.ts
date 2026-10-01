import { expect, type Page } from '@playwright/test';

/**
 * Driving helpers shared by the chapter 3 full-run smoke tests (stage-3-2-full, stage-3-3-full): the same moves as
 * the earlier stages' specs (tap through lines and cards, set the lever, wait for the train front, stop at a station,
 * open the doors, wait for a fail's rewind, press a round button the moment it glows).
 */

/** data-s is the lead car's centre; stations, floaters and forks are measured at the front. */
export const FRONT = 6;
export const STOP = 1;
export const SLOW = 2;
export const NORMAL = 3;
export const FAST = 4;

export async function tapUntil(page: Page, selector: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.locator(selector).isVisible()) return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  const said = await page.evaluate(() => ((window as unknown as { __lines?: string[] }).__lines ?? []).slice(-8).join(' / '));
  throw new Error(`timed out waiting for ${selector} (last lines: ${said})`);
}

export async function card(page: Page, text: string, timeoutMs = 90_000): Promise<void> {
  await tapUntil(page, '#card', timeoutMs);
  await expect(page.locator('#card')).toContainText(text);
  await page.locator('#card-button').click();
}

export async function setNotch(page: Page, notch: number): Promise<void> {
  const box = await page.locator(`.lever-detent[data-notch="${notch}"]`).boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
  await expect(page.locator('#app')).toHaveAttribute('data-notch', String(notch));
}

/** Waits until the train is on `rail` with its front at `at` or beyond. */
export async function waitFront(page: Page, rail: string, at: number, timeoutMs = 240_000): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) >= Number(t);
    },
    [rail, at - FRONT] as const,
    { timeout: timeoutMs },
  );
}

export async function waitDriving(page: Page): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if ((await page.locator('#app').getAttribute('data-phase')) === 'driving') return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  throw new Error('not driving again');
}

export async function stopAt(page: Page, rail: string, at: number, slowFrom = 55, brake = 4.5): Promise<void> {
  await waitFront(page, rail, at - slowFrom);
  await setNotch(page, SLOW);
  await waitFront(page, rail, at - brake);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

export async function doors(page: Page): Promise<void> {
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

/** A fail: the train is put back; wait until it stands on `rail` with its front before `below`. */
export async function waitRewound(page: Page, rail: string, below: number): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const el = document.getElementById('app');
      return el?.dataset.rail === r && Number(el?.dataset.s) < Number(t) && el?.dataset.phase === 'failing';
    },
    [rail, below - FRONT] as const,
    { timeout: 180_000 },
  );
}

/**
 * Presses the round button `id` the moment it glows and the game is driving (polled every frame in the page, so a short
 * window is not missed; checking and pressing happen in the same callback). Fails when the front passes `latest` on
 * `rail` without a glow. Since PHASE9_0 the jump, dive and snowplow are separate buttons (no seat that changes face).
 */
export async function pressOnGlowBefore(page: Page, id: 'jump' | 'dive' | 'plow' | 'whistle' | 'rocket' | 'light', rail: string, latest: number): Promise<void> {
  const pressed = await page.waitForFunction(
    ([bid, r, t]) => {
      const app = document.getElementById('app');
      const button = document.getElementById(bid);
      if (!app || !button) return false;
      // The glow first: it says a press works now (a jump takes off from the lead bogie, 4 m behind the front, so the
      // front may already be a little past `latest`). At a few frames a second the glow's window can be one frame.
      if (button.dataset.glow === '1' && app.dataset.phase === 'driving') {
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        return 'pressed';
      }
      if (app.dataset.rail === r && Number(app.dataset.s) >= Number(t)) return 'late';
      return false;
    },
    [id, rail, latest - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe('pressed');
}

/** Presses `id` (a round button) the moment it glows. */
export async function pressOnGlow(page: Page, id: 'whistle' | 'rocket' | 'light' | 'jump' | 'dive' | 'plow', timeoutMs = 120_000): Promise<void> {
  const pressed = await page.waitForFunction(
    (bid) => {
      const b = document.getElementById(bid);
      if (b?.dataset.glow === '1') {
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    },
    id,
    { timeout: timeoutMs, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe(true);
}

/** Records every line the partner (or anyone) says into window.__lines; returns a reader of them all. */
export async function recordLines(page: Page): Promise<() => Promise<string>> {
  await page.addInitScript(() => {
    const lines: string[] = [];
    (window as unknown as { __lines: string[] }).__lines = lines;
    new MutationObserver(() => {
      const line = document.getElementById('bubble')?.dataset.line;
      if (line && lines[lines.length - 1] !== line) lines.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-line'] });
  });
  return () => page.evaluate(() => (window as unknown as { __lines: string[] }).__lines.join('\n'));
}

/** The saved progress. */
export function progress(page: Page): Promise<{ cleared: string[]; records: string[]; abilities: string[]; mapLinks: string[] }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
}

/** The heaviest frame so far (TECH_SPEC §6). */
export async function budget(page: Page): Promise<{ draws: number; tris: number }> {
  return page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
}

/**
 * v1.11 (PR5, PHASE9_CHAPTER5_6 第 2 部 M15): steps the light button to `mode` ("off" | "light" | "magnet"): a
 * pointerdown on #light every 0.45 s (over its 0.4 s lockout, in game time roughly) until data-light is `mode`; at most
 * four presses. Done in the page, so a slow CI frame does not lose a press.
 */
export async function lightTo(page: Page, mode: 'off' | 'light' | 'magnet'): Promise<void> {
  const ok = await page.evaluate(async (want) => {
    const b = document.getElementById('light');
    if (!b) return false;
    for (let i = 0; i < 5; i++) {
      if (b.dataset.light === want) return true;
      if (i === 4) break;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      // Wait 0.45 s of game time (the lockout is in game time; a slow frame is clamped to 0.1 s).
      const app = document.getElementById('app') as HTMLElement;
      const t0 = Number(app.dataset.time);
      const w0 = performance.now();
      while (Number(app.dataset.time) < t0 + 0.45 && performance.now() - w0 < 10_000) await new Promise((r) => setTimeout(r, 30));
    }
    return b.dataset.light === want;
  }, mode);
  expect(ok, `light to ${mode}`).toBe(true);
}

/**
 * v1.11 (PR5): waits (every frame, in the page) for #light to glow for `mode` ("magnet": green; "light": yellow) while
 * driving or stopped, then steps it to `mode` with lightTo. Fails when the front passes `latest` on `rail` first.
 */
export async function lightOnGlow(page: Page, mode: 'light' | 'magnet', rail: string, latest: number): Promise<void> {
  const seen = await page.waitForFunction(
    ([m, r, t]) => {
      const app = document.getElementById('app');
      const b = document.getElementById('light');
      if (!app || !b) return false;
      if (app.dataset.rail === r && Number(app.dataset.s) >= Number(t)) return 'late';
      const phase = app.dataset.phase ?? 'driving';
      if (b.dataset.glow === '1' && b.dataset.glowFor === m && (phase === 'driving' || phase === 'stopped')) return 'glow';
      return false;
    },
    [mode, rail, latest - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await seen.jsonValue()).toBe('glow');
  await lightTo(page, mode);
}

/** v1.11 (PR5): waits until magnet target `id` has arrived (data-magnet-caught lists it). */
export async function waitCaught(page: Page, id: string, timeoutMs = 120_000): Promise<void> {
  await page.waitForFunction((i) => (document.getElementById('app')?.dataset.magnetCaught ?? '').split(',').includes(i), id, { timeout: timeoutMs });
}

/** v1.11 (PR6b): one of the seven magnet "?" records fetched on a return visit (PHASE9_CHAPTER5_6 第 2 部 M20). */
export interface MagnetRecordRun {
  stage: string;
  /** The mission to resume (0-based) and its card's title. */
  mission: number;
  title: string;
  record: string;
  /** Its hint (said when the light button glows green for it) and the riddle line that must not come any more. */
  hint: string;
  riddle?: string;
  cleared: string[];
  notch?: number;
  /** Round buttons pressed whenever they glow on the way (the obstacles before the record). */
  press?: ('jump' | 'dive' | 'plow' | 'whistle' | 'rocket')[];
  /** Arrows tapped on the way: the side at the fork `at` on `rail` (tapped once the arrows show within 60 m). */
  arrows?: { rail: string; at: number; side: 'left' | 'right' }[];
  /** Where the record's pull ends (the front must not pass it on `rail` before the record arrives). */
  rail: string;
  latest: number;
  shot: string;
  /** Standing where it already glows (4-3): wait for the hint line before stepping to the magnet. */
  waitHint?: boolean;
}

/**
 * v1.11 (PR6b): a child with the magnet light comes back to `run.stage` ("つづき" into `run.mission`) and drives on:
 * the round buttons in `run.press` are pressed whenever they glow, the arrows in `run.arrows` tapped, and the light
 * button stepped whenever it glows (green: to the magnet; yellow: to the light; "dim": off the light), all in the page
 * every frame; until the record has flown to the train. Then: found and saved, its hint said, its riddle not.
 */
export async function magnetRecordRun(page: Page, run: MagnetRecordRun, out: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(
    ([stage, mission, cleared]) => {
      localStorage.setItem(
        'train-game.progress.v1',
        JSON.stringify({ schema: 1, cleared, abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'], records: [], mapLinks: [], resume: { stage, mission } }),
      );
    },
    [run.stage, run.mission, run.cleared] as const,
  );
  const lines = await recordLines(page);
  const app = page.locator('#app');
  await page.goto(`/?stage=${run.stage}&go=1&resume=1`);
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, run.title, 120_000);
  // A mission may start with the doors open (passengers getting on): shut them.
  const deadline = Date.now() + 90_000;
  while ((await app.getAttribute('data-phase')) !== 'driving' && Date.now() < deadline) {
    if ((await app.getAttribute('data-phase')) === 'doors' && (await page.locator('#door').isVisible())) await page.locator('#door').dispatchEvent('pointerdown');
    else if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  await expect(page.locator('#light')).toHaveAttribute('data-steps', '3');
  await setNotch(page, run.notch ?? NORMAL);
  const result = await page.waitForFunction(
    ([id, press, arrows, rail, latest, hint]) => {
      const app = document.getElementById('app');
      if (!app) return false;
      const d = app.dataset;
      if ((d.magnetCaught ?? '').split(',').includes(`record:${id}`)) return 'caught';
      if (d.rail === rail && Number(d.s) + 6 > Number(latest) + 2 && d.magnet !== 'pull') return `late at ${d.rail} ${Number(d.s) + 6}`;
      const w = window as unknown as { __auto?: { last: Record<string, number>; tapped: string[] } };
      w.__auto ??= { last: {}, tapped: [] };
      const now = Number(d.time);
      const ready = (k: string, gap: number): boolean => now - (w.__auto!.last[k] ?? -99) > gap;
      const tap = (el: HTMLElement, k: string): void => {
        w.__auto!.last[k] = now;
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      };
      const moving = d.phase === 'driving';
      for (const bid of press as string[]) {
        const b = document.getElementById(bid);
        if (b && moving && b.dataset.glow === '1' && d.burn !== '1' && ready(bid, 0.6)) tap(b, bid);
      }
      const light = document.getElementById('light');
      if (light && (moving || d.phase === 'stopped') && light.dataset.glow === '1' && ready('light', 0.5)) {
        const f = light.dataset.glowFor;
        const want = f === 'magnet' ? 'magnet' : f === 'light' ? 'light' : null;
        const heard = !hint || ((window as unknown as { __lines?: string[] }).__lines ?? []).includes(hint as string);
        if ((want !== 'magnet' || heard) && (want ? light.dataset.light !== want : light.dataset.light === 'light')) tap(light, 'light');
      }
      for (const a of arrows as { rail: string; at: number; side: string }[]) {
        const key = `${a.rail}:${a.at}`;
        if (w.__auto.tapped.includes(key) || d.rail !== a.rail) continue;
        const front = Number(d.s) + 6;
        const box = document.getElementById('junction');
        const b = box?.querySelector<HTMLElement>(`.arrow[data-side="${a.side}"]`);
        if (front > a.at - 60 && front < a.at && box && !box.hidden && b && !b.hidden) {
          w.__auto.tapped.push(key);
          b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        }
      }
      return false;
    },
    [run.record, run.press ?? [], run.arrows ?? [], run.rail, run.latest, run.waitHint ? run.hint : ''] as const,
    { timeout: 600_000, polling: 'raf' },
  );
  expect(await result.jsonValue()).toBe('caught');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${run.shot}` });
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 30_000 }).toContain(run.record);
  await expect.poll(lines, { timeout: 20_000 }).toContain(run.hint);
  if (run.riddle) expect(await lines()).not.toContain(run.riddle);
  expect(errors).toEqual([]);
}

/**
 * v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A16, A17): keeps what the まえ／うしろ switch and the train did in the page
 * (window.__reverseLog): a row each time the direction, the switch state (#app[data-reverse]), the last stop point, the
 * back arrows or the tail car's rail change, with the time, the front (rail, s) and the tail car (rail, s). At 10 fps
 * the half-second turn still leaves its "turning" row.
 */
export interface ReverseRow {
  t: number;
  direction: string;
  reverse: string;
  stop: string;
  arrows: string;
  rail: string;
  front: number;
  tailRail: string;
  tailS: number;
  speed: number;
  junction: boolean;
}

export async function recordReverse(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: ReverseRow[] = [];
    (window as unknown as { __reverseLog: ReverseRow[] }).__reverseLog = log;
    let last = '';
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d) return;
      const box = document.getElementById('junction');
      const junction = !!box && !box.hidden;
      const key = `${d.direction}|${d.reverse}|${d.reverseStop}|${d.backArrows}|${d.tailRail}|${junction}`;
      if (key === last) return;
      last = key;
      log.push({
        t: Number(d.time),
        direction: d.direction ?? '',
        reverse: d.reverse ?? '',
        stop: d.reverseStop ?? '',
        arrows: d.backArrows ?? '',
        rail: d.rail ?? '',
        front: Number(d.s) + 6,
        tailRail: d.tailRail ?? '',
        tailS: Number(d.tailS),
        speed: Number(d.speed),
        junction,
      });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-direction', 'data-reverse', 'data-reverse-stop', 'data-back-arrows', 'data-tail-rail', 'hidden'] });
  });
}

export function reverseLog(page: Page): Promise<ReverseRow[]> {
  return page.evaluate(() => (window as unknown as { __reverseLog: ReverseRow[] }).__reverseLog ?? []);
}

/**
 * v1.11 (PR8a): turns the switch to `dir` ("front" | "back"): one pointerdown on #reverse-switch (in the page), then
 * waits until #reverse-switch[data-dir] is `dir` (moving, the train first brakes to a stop: no second press while it
 * waits, that would cancel it). Fails when it is locked.
 */
export async function setDirection(page: Page, dir: 'front' | 'back', timeoutMs = 60_000): Promise<void> {
  const sw = page.locator('#reverse-switch');
  await expect(sw).toBeVisible();
  // One press, once a turn in progress is over (the switch is locked for that half second): checked and pressed in
  // the page in one go.
  await page.waitForFunction(
    (want) => {
      const b = document.getElementById('reverse-switch');
      if (!b || b.dataset.dir === want) return true;
      if (document.getElementById('app')?.dataset.reverse === 'turning') return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    dir,
    { timeout: 30_000, polling: 'raf' },
  );
  await expect(sw).toHaveAttribute('data-dir', dir, { timeout: timeoutMs });
  // The turn itself (half a second of game time) is over.
  await page.waitForFunction(() => document.getElementById('app')?.dataset.reverse !== 'turning', null, { timeout: 30_000 });
}

/** v1.11 (PR8a): waits until the train, reversing, stands at a stop point for `why` (#app[data-reverse-stop]). */
export async function waitReverseStop(page: Page, why: string, timeoutMs = 180_000): Promise<void> {
  await page.waitForFunction(
    (w) => {
      const d = document.getElementById('app')?.dataset;
      return d?.reverse === 'stop' && d.reverseStop === w;
    },
    why,
    { timeout: timeoutMs },
  );
}

/** v1.11 (PR8a): waits until the tail car's centre is on `railId` at `at` or before it (reversing: it goes down). */
export async function waitTail(page: Page, railId: string, at: number, timeoutMs = 180_000): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => {
      const d = document.getElementById('app')?.dataset;
      return d?.tailRail === r && Number(d.tailS) <= Number(t);
    },
    [railId, at] as const,
    { timeout: timeoutMs },
  );
}

/**
 * v1.11 (PR8a): taps the `side` arrow of a back junction the moment its arrows show (#junction[data-back="1"]; checked
 * and tapped in the same page callback).
 */
export async function backArrow(page: Page, side: 'left' | 'right', timeoutMs = 180_000): Promise<void> {
  const tapped = await page.waitForFunction(
    (sd) => {
      const box = document.getElementById('junction');
      const b = box?.querySelector<HTMLElement>(`.arrow[data-side="${sd}"]`);
      if (!box || box.hidden || box.dataset.back !== '1' || !b || b.hidden) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    side,
    { timeout: timeoutMs, polling: 'raf' },
  );
  expect(await tapped.jsonValue()).toBe(true);
}
