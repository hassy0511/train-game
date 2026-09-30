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
      if (app.dataset.rail === r && Number(app.dataset.s) >= Number(t)) return 'late';
      if (button.dataset.glow === '1' && app.dataset.phase === 'driving') {
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        return 'pressed';
      }
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
