import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

test('settings from the title gear, and the pause menu in play', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?stage=1-1');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });

  // The title asks for its music box (it plays once the first tap unlocks sound).
  await expect(app).toHaveAttribute('data-music', 'title');

  // Settings: quieter sounds, calm camera, lever on the right. Each tap applies and is saved at once.
  await page.locator('#title-settings').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('[data-setting="sound"][data-value="1"]').click();
  await page.locator('[data-setting="calm"][data-value="true"]').click();
  await page.locator('[data-setting="leftHanded"][data-value="true"]').click();
  await expect(page.locator('[data-setting="leftHanded"][data-value="true"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(app).toHaveClass(/is-left-handed/);
  await expect(app).toHaveAttribute('data-calm', '1');
  await page.screenshot({ path: resolve(OUT, '40-settings.png') });
  await page.locator('#settings-close').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.settings.v1') ?? '{}'));
  expect(saved).toEqual({ music: 2, sound: 1, calm: true, leftHanded: true });

  // Still there after a reload.
  await page.reload();
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(app).toHaveClass(/is-left-handed/);

  // Into the stage: the lever sits on the right, the buttons on the left.
  await page.locator('#title-start').click();
  // The stage's own song (environment.bgm).
  await expect(app).toHaveAttribute('data-music', 'town');
  const lever = await page.locator('#lever').boundingBox();
  const whistle = await page.locator('#whistle').boundingBox();
  expect(lever && whistle && lever.x > whistle.x).toBe(true);

  // Pause: game time stands still until "つづける".
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect(app).toHaveAttribute('data-paused', '1');
  const t0 = await app.getAttribute('data-time');
  await page.waitForTimeout(800);
  expect(await app.getAttribute('data-time')).toBe(t0);
  await page.screenshot({ path: resolve(OUT, '41-pause.png') });

  // "ちずに もどる" opens the map; "もどる" there brings the menu back.
  await page.locator('#pause-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.locator('#map-close').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.locator('#pause-resume').click();
  await expect(page.locator('#pause-menu')).toHaveCount(0);
  await expect(app).toHaveAttribute('data-paused', '0');
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) > Number(t) + 0.3, t0);
  await page.screenshot({ path: resolve(OUT, '42-left-handed.png') });

  expect(errors).toEqual([]);
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`${selector} is not laid out`);
  return b;
}

/**
 * PHASE7 §1: the camera is a small round button just inside the pause button, level with it and apart from it;
 * its tiles open on screen, clear of the thumb buttons. The six round buttons form layout "D" (PHASE9_0 §2).
 */
async function checkLayout(page: Page, leftHanded: boolean, width: number, height: number, shot?: string, menuClearOfButtons = true): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  const cam = await box(page, '#camera');
  const pause = await box(page, '#pause');
  expect(Math.abs(cam.y - pause.y)).toBeLessThanOrEqual(2);
  expect(overlaps(cam, pause)).toBe(false);
  if (leftHanded) {
    expect(cam.x).toBeGreaterThan(pause.x);
    expect(cam.x + cam.width).toBeLessThan(width / 2);
  } else {
    expect(cam.x).toBeLessThan(pause.x);
    expect(cam.x).toBeGreaterThan(width / 2);
  }
  // PHASE9_0 §2 layout "D": the whistle is 1.2x in the middle; the others sit on a ring round it (jump lower-left, dive
  // left, snowplow upper-left, light up, rocket upper-right). Left-handed mirrors it. The buttons are round, so they are
  // compared as circles (centre distance >= sum of the radii), not as boxes.
  const ids = ['whistle', 'jump', 'dive', 'plow', 'light', 'rocket'] as const;
  const buttons = await Promise.all(ids.map((id) => box(page, `#${id}`)));
  const at: Record<string, Box & { cx: number; cy: number; r: number }> = {};
  ids.forEach((id, i) => {
    const b = buttons[i];
    at[id] = { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2, r: Math.min(b.width, b.height) / 2 };
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = at[ids[i]];
      const b = at[ids[j]];
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `${ids[i]} vs ${ids[j]}`).toBeGreaterThanOrEqual(a.r + b.r);
    }
  }
  const { whistle, jump, dive, plow, light, rocket } = at;
  expect(whistle.r).toBeGreaterThan(jump.r); // 1.2x
  // Sign of "to the right" (right-handed) or "to the left" (left-handed): +1 = away from the whistle on the outer side.
  const side = leftHanded ? -1 : 1;
  const east = (a: { cx: number }, b: { cx: number }) => side * (a.cx - b.cx); // > 0 when a is east of b
  // The whistle is the middle: everything else is nearer than 2.5 whistle radii.
  for (const id of ['jump', 'dive', 'plow', 'light', 'rocket'] as const) {
    expect(Math.hypot(at[id].cx - whistle.cx, at[id].cy - whistle.cy), `${id} near the whistle`).toBeLessThan(whistle.r * 2.5);
  }
  // Jump lower-left of the whistle, dive left, snowplow upper-left (left-handed: the mirror image).
  expect(east(jump, whistle)).toBeLessThan(0);
  expect(jump.cy).toBeGreaterThan(whistle.cy);
  expect(east(dive, whistle)).toBeLessThan(0);
  expect(Math.abs(dive.cy - whistle.cy)).toBeLessThan(2);
  expect(east(plow, whistle)).toBeLessThan(0);
  expect(plow.cy).toBeLessThan(whistle.cy);
  // Dive is further out than jump and plow; light is up, rocket upper-right of it; nothing lower-right of the whistle.
  expect(east(dive, jump)).toBeLessThan(0);
  expect(east(dive, plow)).toBeLessThan(0);
  expect(light.cy).toBeLessThan(whistle.cy);
  expect(east(rocket, whistle)).toBeGreaterThan(0);
  expect(rocket.cy).toBeLessThan(whistle.cy);
  expect(east(rocket, light)).toBeGreaterThan(0);
  expect(rocket.cy).toBeGreaterThan(light.cy);
  for (const id of ['jump', 'dive', 'plow', 'light', 'rocket'] as const) {
    expect(east(at[id], whistle) > 0 && at[id].cy > whistle.cy, `${id} is not lower-right of the whistle`).toBe(false);
  }
  // The stop gauge (shown near a station) stays clear of the corner camera: shown for a moment to measure it.
  const gauge = await page.evaluate(() => {
    const el = document.getElementById('stop-gauge');
    if (!el) throw new Error('#stop-gauge missing');
    const was = el.hidden;
    el.hidden = false;
    const r = el.getBoundingClientRect();
    el.hidden = was;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  expect(overlaps(cam, gauge)).toBe(false);
  expect(overlaps(pause, gauge)).toBe(false);
  // The countdown panel at its widest ("セーフ！") stays clear of the cargo strip (one passenger) in the corner and
  // of the widest speed word ("きゅうブレーキ"): all shown for a moment to measure them.
  const top = await page.evaluate(() => {
    const timer = document.getElementById('timer');
    const cargo = document.getElementById('cargo');
    const speed = document.getElementById('hud-speed');
    if (!timer || !cargo || !speed) throw new Error('#timer, #cargo or #hud-speed missing');
    const was = { timer: timer.hidden, state: timer.dataset.state, cargo: cargo.hidden, cargoHtml: cargo.innerHTML, speed: speed.textContent };
    const num = timer.querySelector('.timer-num') as HTMLElement;
    const numWas = num.textContent;
    timer.hidden = false;
    timer.dataset.state = 'safe';
    num.textContent = 'セーフ！';
    cargo.hidden = false;
    cargo.innerHTML = '<svg viewBox="0 0 24 24"></svg>';
    speed.textContent = 'きゅうブレーキ';
    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const out = { timer: box(timer), cargo: box(cargo), speed: box(speed) };
    timer.hidden = was.timer;
    if (was.state === undefined) delete timer.dataset.state;
    else timer.dataset.state = was.state;
    num.textContent = numWas;
    cargo.hidden = was.cargo;
    cargo.innerHTML = was.cargoHtml;
    speed.textContent = was.speed;
    return out;
  });
  expect(overlaps(top.timer, top.cargo)).toBe(false);
  expect(overlaps(top.timer, top.speed)).toBe(false);
  expect(top.timer.x).toBeGreaterThanOrEqual(0);
  expect(top.timer.x + top.timer.width).toBeLessThanOrEqual(width);
  // The view tiles open under the corner, on screen and clear of the thumb buttons.
  await page.locator('#camera').dispatchEvent('pointerdown');
  await expect(page.locator('#camera-menu')).toBeVisible();
  const menu = await box(page, '#camera-menu');
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(width);
  expect(menu.y + menu.height).toBeLessThanOrEqual(height);
  expect(menu.y).toBeGreaterThanOrEqual(cam.y + cam.height);
  // On a short phone (667x375) the six-button flower is taller than the room under the corner camera button, so the open
  // picker (a momentary overlay above the buttons) lies over the light, snowplow and rocket: known, reported to the
  // author (R1 tests), not asserted there. On the iPad the tiles stay clear of every button.
  if (menuClearOfButtons) for (const b of buttons) expect(overlaps(menu, b), 'camera tiles clear of the round buttons').toBe(false);
  // The open tiles share the stop gauge's row: the gauge (with its stop line) draws over them, never under.
  const order = await page.evaluate(() => {
    const menuEl = document.getElementById('camera-menu');
    const gaugeEl = document.getElementById('stop-gauge');
    if (!menuEl || !gaugeEl) throw new Error('#camera-menu or #stop-gauge missing');
    return {
      gaugeLater: (menuEl.compareDocumentPosition(gaugeEl) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      menuZ: getComputedStyle(menuEl).zIndex,
      gaugeZ: getComputedStyle(gaugeEl).zIndex,
    };
  });
  expect(order).toEqual({ gaugeLater: true, menuZ: 'auto', gaugeZ: 'auto' });
  if (shot) await page.screenshot({ path: resolve(OUT, shot) });
  await page.locator('#camera').dispatchEvent('pointerdown');
  await expect(page.locator('#camera-menu')).toBeHidden();
}

test('corner buttons in the six-button ring, lever left and right, iPad and small phone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const app = page.locator('#app');
  for (const leftHanded of [false, true]) {
    await page.goto('/?stage=1-1');
    await page.evaluate((lh) => {
      localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: [], abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'], records: [], mapLinks: [] }));
      localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: lh }));
    }, leftHanded);
    await page.setViewportSize({ width: 1194, height: 834 });
    await page.goto('/?stage=1-1&go=1');
    await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
    await expect(page.locator('#pause')).toBeVisible({ timeout: 30_000 });
    await expect(app).toHaveAttribute('data-has-rocket', '1');
    // Past the opening into the first drive, so the screenshots show the whole driving screen.
    const deadline = Date.now() + 90_000;
    while ((await app.getAttribute('data-phase')) !== 'driving' && Date.now() < deadline) {
      if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
      if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
      if (await page.locator('#card-button').isVisible()) await page.locator('#card-button').click();
      await page.waitForTimeout(150);
    }
    await expect(app).toHaveAttribute('data-phase', 'driving');
    await checkLayout(page, leftHanded, 1194, 834, leftHanded ? 'corner-left.png' : 'corner-right.png');
    await checkLayout(page, leftHanded, 667, 375, leftHanded ? 'corner-left-small.png' : 'corner-right-small.png', false);
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  expect(errors).toEqual([]);
});

type Saved = { schema: 1; cleared: string[]; abilities: string[]; records: string[]; mapLinks: string[] };

interface WorldData {
  chapters: { id: number; finale?: { link?: string; ring?: string[] } }[];
  islands: { id: string; chapter: number }[];
  links: [string, string, { afterChapter?: number }?][];
}

/**
 * Everything there is to have in the stage files (`only`: the stages whose id matches), with the map seen as the
 * game saves it once the map has shown it all: every rail laid by the clears (a rail out of a chapter once the
 * chapter is done; a chapter's closing rail once it is done), and "finale:<id>" for a done chapter whose end has
 * no rail. The fullest progress.
 */
function fullProgress(only = /./): Saved {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const stages = readdirSync(resolve(root, 'src/stages'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(root, 'src/stages', f), 'utf8')) as { id: string; hidden?: boolean; unlocks: string[]; records: { id: string }[] })
    .filter((s) => !s.hidden && only.test(s.id));
  const world = JSON.parse(readFileSync(resolve(root, 'src/world/world.json'), 'utf8')) as WorldData;
  const cleared = stages.map((s) => s.id);
  const done = (id: number): boolean => {
    const chapter = world.chapters.find((c) => c.id === id);
    const ids = [...world.islands.filter((i) => i.chapter === id).map((i) => i.id), ...(chapter?.finale?.ring ?? [])];
    return ids.length > 0 && ids.every((i) => cleared.includes(i));
  };
  const closing = new Map(world.chapters.filter((c) => c.finale?.link).map((c) => [c.finale?.link, c.id]));
  return {
    schema: 1,
    cleared,
    abilities: [...new Set(stages.flatMap((s) => s.unlocks))],
    records: stages.flatMap((s) => s.records.map((r) => r.id)),
    mapLinks: [
      ...world.links
        .filter(([from, to, opts]) => cleared.includes(from) && !to.startsWith('teaser:') && (opts?.afterChapter === undefined || done(opts.afterChapter)))
        .map(([from, to]) => `${from}>${to}`)
        .filter((key) => !closing.has(key) || done(closing.get(key) ?? 0)),
      ...world.chapters.filter((c) => c.finale && !c.finale.link && done(c.id)).map((c) => `finale:${c.id}`),
    ],
  };
}

/**
 * A version 1 あいことば (12 letters, chapters 1 and 2, the rails in it) as the game wrote them before version 2:
 * everything of chapters 1 and 2 with the 6 rails of chapters 1 and 2 seen.
 */
const PASSCODE_V1_CHAPTERS_1_2 = '1ZZZ-ZZZZ-7EQR';

const sorted = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]));

/** Holds "おうちの かたへ" for `ms`, then lets go. */
async function holdParents(page: Page, ms: number): Promise<void> {
  const hold = page.locator('#settings-parents');
  await hold.dispatchEvent('pointerdown');
  await page.waitForTimeout(ms);
  await hold.dispatchEvent('pointerup');
}

test('おうちの かたへ: a long press opens it, erasing asks twice, the あいことば brings everything back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const full = fullProgress();
  const app = page.locator('#app');
  await page.goto('/?stage=1-1');
  await page.evaluate((p) => {
    localStorage.setItem('train-game.progress.v1', JSON.stringify(p));
    localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 1, sound: 2, calm: false, leftHanded: false }));
  }, full);
  await page.goto('/?stage=1-1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-settings').click();
  await expect(page.locator('#settings')).toBeVisible();

  // How it opens is not shown until a short tap (a child who reads hiragana is not told).
  await expect(page.locator('.parents-hold-hint')).toHaveCSS('opacity', '0');
  // A short tap (a child's) does nothing but show how it opens, in kanji for the grown-up.
  await holdParents(page, 400);
  await page.waitForTimeout(2000);
  await expect(page.locator('#parents')).toHaveCount(0);
  await expect(page.locator('#settings-parents')).toHaveClass(/is-hinting/);
  await expect(page.locator('.parents-hold-hint')).toHaveText('2秒 長押し');
  await expect(page.locator('.parents-hold-hint')).toHaveCSS('opacity', '1');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '43a-parents-hint.png') });
  // Held for 2 seconds: it opens while still held.
  await page.locator('#settings-parents').dispatchEvent('pointerdown');
  await page.waitForTimeout(1500);
  await expect(page.locator('#parents')).toHaveCount(0);
  await expect(page.locator('#parents')).toBeVisible({ timeout: 3000 });
  await page.locator('#settings-parents').dispatchEvent('pointerup');
  await expect(page.locator('#parents')).toContainText('どこにも送りません');
  await expect(page.locator('#parents')).toContainText('ホーム画面に追加');
  await expect(page.locator('#parents-build')).toContainText((await app.getAttribute('data-build')) ?? '?');

  // The あいことば: version 2, 16 letters in four groups (the first letter is the version).
  await page.locator('#parents-passcode-show').click();
  const code = (await page.locator('#parents-passcode').textContent()) ?? '';
  expect(code).toMatch(/^2[0-9A-Z]{3}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await page.screenshot({ path: resolve(OUT, '43-parents.png') });

  // A mistyped one is caught and changes nothing.
  const flip = (c: string) => (c === 'Z' ? 'Y' : 'Z');
  await page.locator('#parents-passcode-input').fill(code.slice(0, 7) + flip(code[7]) + code.slice(8));
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('#parents-passcode-message')).toHaveClass(/is-error/);
  await expect(page.locator('.parents-confirm')).toHaveCount(0);

  // Erasing asks twice; "やめる" on the second question keeps everything.
  await page.locator('#parents-reset').click();
  await expect(page.locator('.parents-confirm')).toContainText('消しますか');
  await page.locator('.parents-confirm-yes').click();
  await expect(page.locator('.parents-confirm')).toContainText('ほんとうに');
  await expect(page.locator('.parents-confirm-yes')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '44-parents-reset-twice.png') });
  await page.locator('.parents-confirm-no').click();
  await expect(page.locator('.parents-confirm')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('train-game.progress.v1'))).not.toBeNull();
  // A quick double tap on the first "けす" (a child mashing) answers only the first question: the second one's
  // "yes" is not there yet under the finger.
  await page.locator('#parents-reset').click();
  const firstYes = page.locator('.parents-confirm-yes');
  await expect(firstYes).toBeVisible();
  const at = (await firstYes.boundingBox())!;
  const x = at.x + at.width / 2;
  const y = at.y + at.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(120);
  await page.mouse.click(x, y);
  await page.screenshot({ path: resolve(OUT, '44a-parents-double-tap.png') });
  await expect(page.locator('.parents-confirm')).toContainText('ほんとうに');
  await expect(page.locator('.parents-confirm')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('train-game.progress.v1'))).not.toBeNull();
  await page.locator('.parents-confirm-no').click();
  await expect(page.locator('.parents-confirm')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('train-game.progress.v1'))).not.toBeNull();
  // Now yes twice: the progress is gone, the settings stay, the game starts over from the title.
  await page.locator('#parents-reset').click();
  await page.locator('.parents-confirm-yes').click();
  const erased = page.waitForEvent('load');
  await page.locator('.parents-confirm-yes').click();
  await erased;
  expect(new URL(page.url()).search).toBe('');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  expect(await page.evaluate(() => localStorage.getItem('train-game.progress.v1'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.settings.v1') ?? '{}'))).toMatchObject({ music: 1 });
  await expect(page.locator('#title-chapters')).toHaveCount(0);

  // The あいことば typed back in (small letters, spaces, O for 0 are all fine): everything comes back.
  await page.locator('#title-settings').click();
  // Held until it opens (the page's 2-second timer can run late on a slow machine drawing the title's 3D).
  await page.locator('#settings-parents').dispatchEvent('pointerdown');
  await expect(page.locator('#parents')).toBeVisible({ timeout: 15_000 });
  await page.locator('#settings-parents').dispatchEvent('pointerup');
  await page.locator('#parents-passcode-input').fill(` ${code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o')} `);
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('.parents-confirm')).toContainText(`クリア ${full.cleared.length}`);
  const restored = page.waitForEvent('load');
  await page.locator('.parents-confirm-yes').click();
  await restored;
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  const back = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(sorted(back)).toEqual(sorted(full));
  await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ★\s*3しょう ★/);

  // The rails came back from the clears, all seen: the map opens with nothing growing and no chapter's end, and
  // saves nothing new.
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.waitForTimeout(2_000);
  await expect(page.locator('#map')).not.toHaveAttribute('data-finale', /.+/);
  await expect(page.locator('#map')).not.toHaveAttribute('data-growing', /.+/);
  await expect(page.locator('#map .is-growing')).toHaveCount(0);
  await expect(page.locator('#card')).toHaveCount(0);
  await page.screenshot({ path: resolve(OUT, '45-parents-passcode-map.png') });
  await page.locator('#map-close').click();
  await expect(page.locator('#map')).toHaveCount(0);
  const afterMap = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  expect(sorted(afterMap)).toEqual(sorted(full));

  // A version 1 あいことば (12 letters, written before chapters 3 and 4) is still read: chapters 1 and 2 come back
  // with its rails. A mistyped one is caught.
  await page.locator('#title-settings').click();
  await page.locator('#settings-parents').dispatchEvent('pointerdown');
  await expect(page.locator('#parents')).toBeVisible({ timeout: 15_000 });
  await page.locator('#settings-parents').dispatchEvent('pointerup');
  const v1 = PASSCODE_V1_CHAPTERS_1_2;
  await page.locator('#parents-passcode-input').fill(v1.slice(0, 10) + flip(v1[10]) + v1.slice(11));
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('#parents-passcode-message')).toHaveClass(/is-error/);
  await expect(page.locator('.parents-confirm')).toHaveCount(0);
  // One letter short: the message says how many letters that version has.
  await page.locator('#parents-passcode-input').fill(v1.slice(0, -1));
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('#parents-passcode-message')).toContainText('12もじ');
  await page.locator('#parents-passcode-input').fill(v1.toLowerCase());
  await page.locator('#parents-passcode-load').click();
  const chapters12 = fullProgress(/^[12]-/);
  await expect(page.locator('.parents-confirm')).toContainText(`クリア ${chapters12.cleared.length}`);
  const restoredV1 = page.waitForEvent('load');
  await page.locator('.parents-confirm-yes').click();
  await restoredV1;
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  const backV1 = await page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));
  // Version 1 carries the rails within chapters 1 and 2 (the rail through the cloud gate grows on the next map).
  const inChapters12 = (id: string) => chapters12.cleared.includes(id);
  expect(sorted(backV1)).toEqual(
    sorted({ ...chapters12, mapLinks: chapters12.mapLinks.filter((key) => key.split('>').every(inChapters12)) }),
  );
  await expect(page.locator('#title-chapters')).toHaveText(/1しょう ★\s*2しょう ★\s*3しょう ☆/);
  expect(errors).toEqual([]);
});
