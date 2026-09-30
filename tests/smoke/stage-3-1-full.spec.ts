import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stage 3-1 "うみのそこ" from start to the map (docs/PHASE8_CHAPTER3_4.md 第 3 部 §15, read with §0.2): the opening
 * teaches "もぐる"; M1 dives under a log, bumps a raft on purpose ("ぽよん"), misses the red ring on purpose (the loop
 * on the surface), then goes down at the ring to the sea floor; M2 greets the whale (its current), falls into the
 * gap on purpose without the whale's spout, then rides it; M3 dives for the pearl, takes the sinking bubbles on
 * purpose (the loop), then the rising ones, and in the dark the light shows the swirl; the ending's mirror-written
 * note. The budget (TECH_SPEC §6) holds all the way.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const FRONT = 6; // data-s is the lead car center; stations, floaters and forks are measured at the front
const STOP = 1;
const SLOW = 2;
const NORMAL = 3;
const FAST = 4;

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

/** Waits until the train is on `rail` with its front at `at` or beyond. */
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
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await page.locator('#app').getAttribute('data-phase')) === 'driving') return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
  }
  throw new Error('not driving again');
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
  await expect(door).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'doors', { timeout: 10_000 });
  await door.dispatchEvent('pointerdown');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase !== 'doors', null, { timeout: 60_000 });
}

/** A fail: the train is put back; wait until it stands on `rail` with its front before `below`. */
async function waitRewound(page: Page, rail: string, below: number): Promise<void> {
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
 * Presses "もぐる" the moment it glows (in the page, polled every frame, so a short window is not missed on a slow
 * machine). Fails when the front passes `latest` on `rail` without a glow.
 */
async function diveOnGlow(page: Page, rail: string, latest: number): Promise<void> {
  const pressed = await page.waitForFunction(
    ([r, t]) => {
      const app = document.getElementById('app');
      const button = document.getElementById('dive');
      if (!app || !button) return false;
      if (app.dataset.rail === r && Number(app.dataset.s) >= Number(t)) return 'late';
      if (button.dataset.glow === '1' && app.dataset.phase === 'driving') {
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        return 'pressed';
      }
      return false;
    },
    [rail, latest - FRONT] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await pressed.jsonValue()).toBe('pressed');
}

/** Whistles once the whistle glows (something in reach answers it). */
async function whistleOnGlow(page: Page): Promise<void> {
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1', { timeout: 120_000 });
  await page.locator('#whistle').dispatchEvent('pointerdown');
}

async function camera(page: Page, mode: 'cab' | 'chase' | 'side' | 'top'): Promise<void> {
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator(`.camera-tile[data-mode="${mode}"]`).dispatchEvent('pointerdown');
}

test('stage 3-1 full run: diving, the whale, the bubbles, the note', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // A save that has come this far: chapters 1 and 2 cleared, their ring and the rail through the gate drawn.
  await page.addInitScript(() => {
    const key = 'train-game.progress.v1';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        schema: 1,
        cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'],
        abilities: ['whistle', 'jump', 'light', 'rocket'],
        records: [],
        mapLinks: ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1'],
      }),
    );
  });
  await page.addInitScript(() => {
    const lines: string[] = [];
    (window as unknown as { __lines: string[] }).__lines = lines;
    new MutationObserver(() => {
      const line = document.getElementById('bubble')?.dataset.line;
      if (line && lines[lines.length - 1] !== line) lines.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-line'] });
  });
  const saidSoFar = () => page.evaluate(() => (window as unknown as { __lines: string[] }).__lines.join('\n'));

  await page.goto('/?stage=3-1');
  const app = page.locator('#app');
  const diveButton = page.locator('#dive');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'umi');

  // Opening: Pico fits the diving gear: the もぐる button is new (five round buttons: whistle, jump, light, rocket,
  // dive), not glowing yet (no water within 80 m of the beach station).
  await card(page, 'もぐるを');
  await expect(diveButton).toBeVisible();
  await expect(diveButton).toHaveAttribute('data-glow', '0');
  await expect(page.locator('.round-button:visible')).toHaveCount(5);
  await expect.poll(saidSoFar, { timeout: 10_000 }).toContain('もぐるの ボタンが ふえた！');

  // ---- M1 もぐって くぐれ ----
  await card(page, 'もぐって くぐれ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Out over the sea the もぐる button lights up (its hint; the jump stays the jump).
  await expect(app).toHaveAttribute('data-dive', 'near', { timeout: 60_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('もぐるが ひかった！');
  await page.screenshot({ path: resolve(OUT, '80-dive-button.png') });
  // The log: press when it glows; the train dives under it (no fail).
  await diveOnGlow(page, 'umi', 250);
  await expect(app).toHaveAttribute('data-diving', '1', { timeout: 5_000 });
  await expect(app).toHaveAttribute('data-underwater', '1', { timeout: 5_000 });
  await page.screenshot({ path: resolve(OUT, '81-under-the-log.png') });
  await waitFront(page, 'umi', 262);
  await expect(app).toHaveAttribute('data-dive-bounces', '0');
  await expect.poll(saidSoFar).toContain('ながれぎだ！ もぐって くぐろう');
  console.log('3-1: dived under the log');

  // The raft: on purpose not pressed — "ぽよん", back to 350, gently.
  await expect(app).toHaveAttribute('data-dive-bounces', '1', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-submerged', '0');
  await page.screenshot({ path: resolve(OUT, '82-raft-bump.png') });
  await waitRewound(page, 'umi', 356);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぽよん！ ぶつかっちゃった〜');
  // Again at はやい: dived under it.
  await waitDriving(page);
  await setNotch(page, FAST);
  await diveOnGlow(page, 'umi', 452);
  await waitFront(page, 'umi', 466);
  await expect(app).toHaveAttribute('data-dive-bounces', '1');
  console.log('3-1: bumped the raft once, then dived under it at はやい');

  // The red ring: on purpose not diving — round the surface loop and back before it (no fail).
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-rail', 'wa', { timeout: 120_000 });
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  await expect(app).toHaveAttribute('data-rail', 'umi', { timeout: 120_000 });
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('あれれ、とおりすぎちゃった');
  // Diving at the ring this time: down to the sea floor under the dome.
  await diveOnGlow(page, 'umi', 600);
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-rail', 'umi');
  await expect(app).toHaveAttribute('data-camera', 'chase');
  await page.screenshot({ path: resolve(OUT, '83-ring-down.png') });
  await waitFront(page, 'umi', 720);
  await page.screenshot({ path: resolve(OUT, '84-kelp.png') });
  await waitFront(page, 'umi', 808);
  await page.screenshot({ path: resolve(OUT, '85-coral-arch.png') });
  console.log('3-1: missed the ring once (loop), then went down at it');

  await stopAt(page, 'umi', 1000);
  await page.screenshot({ path: resolve(OUT, '86-sango.png') });
  await doors(page);
  await card(page, 'できた');

  // ---- M2 くじらの ながれ ----
  await card(page, 'くじらの ながれ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await whistleOnGlow(page);
  await expect(app).toHaveAttribute('data-whales', /kujira:(sing|follow)/, { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-whales', 'kujira:follow', { timeout: 20_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('おへんじ してくれた！');
  await waitFront(page, 'umi', 1130);
  await expect(app).toHaveAttribute('data-camera', 'side');
  await page.screenshot({ path: resolve(OUT, '87-whale-side.png') });
  // The current: pushing with the whale along.
  await waitFront(page, 'umi', 1260);
  await expect(app).toHaveAttribute('data-updraft', '1');
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) > 15, null, { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, '88-current.png') });
  console.log('3-1: greeted the whale; its current pushes');
  await waitFront(page, 'umi', 1640);
  await page.screenshot({ path: resolve(OUT, '89-surfacing.png') });

  // The gap: on purpose no whistle — "ぽちゃん", back to 1620.
  await expect(app).toHaveAttribute('data-phase', 'failing', { timeout: 120_000 });
  await waitRewound(page, 'umi', 1626);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぽちゃん！ くじらさんを よぼう');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await whistleOnGlow(page);
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '90-spout.png') });
  await waitFront(page, 'umi', 1810);
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  console.log('3-1: fell into the gap once, then the spout threw the train over');

  await stopAt(page, 'umi', 1950);
  await doors(page);
  await card(page, 'できた');
  // The glimpse: Sakasa blows pink bubbles and hops into the sea.
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '91-sakasa.png') });
  await expect.poll(saidSoFar, { timeout: 90_000 }).toContain('ピンクの あわは サカサの しわざ？');

  // ---- M3 ほんものの あわ ----
  await card(page, 'ほんものの あわ', 120_000);
  await doors(page);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The pearl: dive when "もぐる" glows for it.
  await diveOnGlow(page, 'umi', 2110);
  await expect
    .poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}').records ?? []).includes('sea-pearl')), {
      timeout: 60_000,
    })
    .toBe(true);
  console.log('3-1: dived for the pearl');
  await diveOnGlow(page, 'umi', 2230);
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-rail', 'umi');

  // Bubble fork 1: on purpose nothing tapped — the default is the sinking bubbles' loop (from above), back before it.
  await waitFront(page, 'umi', 2375);
  await expect(page.locator('#junction')).toBeVisible();
  await expect(page.locator('.arrow[data-side="left"]')).toHaveAttribute('data-bubbles', 'rise');
  await expect(page.locator('.arrow[data-side="right"]')).toHaveAttribute('data-bubbles', 'sink');
  await page.screenshot({ path: resolve(OUT, '92-bubble-fork.png') });
  await expect(app).toHaveAttribute('data-rail', 'uso-1', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-camera', 'top', { timeout: 20_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(OUT, '93-sink-loop.png') });
  await expect(app).toHaveAttribute('data-rail', 'umi', { timeout: 120_000 });
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('しずむ あわは サカサの あわ！');
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('.arrow[data-side="left"]').dispatchEvent('pointerdown');
  await waitFront(page, 'umi', 2440);
  await expect(app).toHaveAttribute('data-rail', 'umi');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('せいかい！ ほんものの あわ！');
  console.log('3-1: took the sinking bubbles once (loop), then the rising ones');
  // Bubble fork 2: the rising ones are on the right.
  await expect(page.locator('.arrow[data-side="right"][data-bubbles="rise"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('.arrow[data-side="right"]').dispatchEvent('pointerdown');
  await waitFront(page, 'umi', 2640);
  await expect(app).toHaveAttribute('data-rail', 'umi');
  // The deep, dark place: the light button glows; with the light on, the sinking bubbles' swirl lights up.
  await waitFront(page, 'umi', 2695);
  await expect(page.locator('#light')).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await page.locator('#light').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-bubble-revealed', 'awa-3', { timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '94-swirl-light.png') });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぐるぐる もよう！ サカサの あわだ');
  await expect(page.locator('#junction')).toBeVisible({ timeout: 60_000 });
  await page.locator('.arrow[data-side="left"]').dispatchEvent('pointerdown');
  await waitFront(page, 'umi', 2850);
  await expect(app).toHaveAttribute('data-rail', 'umi');
  await page.locator('#light').dispatchEvent('pointerdown');
  console.log('3-1: the light showed the swirl at the third fork');

  await stopAt(page, 'umi', 3020);
  await doors(page);
  await card(page, 'できた');

  // ---- The ending: the big pink bubble pops, a note written mirror-wise ----
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toHaveClass(/is-mirror/);
  await expect(page.locator('#card h1')).toHaveText('のせて');
  expect(await page.locator('#card h1').evaluate((e) => getComputedStyle(e).transform)).toMatch(/^matrix\(-/);
  await page.screenshot({ path: resolve(OUT, '95-note.png') });
  await page.locator('#card-button').click();
  await tapUntil(page, '#card', 90_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '96-clear.png') });

  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(progress.abilities).toContain('dive');
  expect(progress.records).toEqual(expect.arrayContaining(['rainbow-shell', 'sea-pearl']));
  expect(progress.records).not.toContain('iron-star');
  const budget = await page.evaluate(() => ({
    draws: Number(document.getElementById('app')?.dataset.drawsMax),
    tris: Number(document.getElementById('app')?.dataset.trisMax),
  }));
  console.log(`3-1 budget: draw calls ${budget.draws} / 200, triangles ${budget.tris} / 100000`);
  expect(budget.draws).toBeLessThanOrEqual(200);
  expect(budget.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#map')).toHaveAttribute('data-page', '2', { timeout: 20_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(saved.cleared).toContain('3-1');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '97-map.png') });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  console.log('smoke 3-1 full: cleared');
  expect(errors).toEqual([]);
});
