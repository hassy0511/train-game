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
 * its tiles open on screen, clear of the thumb buttons (on the iPad). The six round buttons follow PHASE9_0 §2.
 */
/** Each button's distance from the screen edge on the thumb's side, per viewport size, from the right-handed pass. */
const layoutEdges = new Map<string, Record<string, number>>();

async function checkLayout(page: Page, leftHanded: boolean, width: number, height: number, shot?: string, menuClearOfButtons = true, buttonsOnly = false): Promise<void> {
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
  // PHASE9_0 §2: the six round buttons tucked round the whistle (the layout itself may still change, so only its
  // rules are checked). They are round, so they are compared as circles (centre distance >= sum of the radii), not as
  // boxes; all on screen; the whistle is the biggest and the one nearest the thumb's corner (bottom-right, or
  // bottom-left left-handed); the others within 2.2 button widths of it; the top one under the camera button.
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
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `${ids[i]} vs ${ids[j]}`).toBeGreaterThanOrEqual(a.r + b.r - 1);
    }
  }
  const whistle = at.whistle;
  const corner = { x: leftHanded ? 0 : width, y: height };
  const toCorner = (c: { cx: number; cy: number }) => Math.hypot(c.cx - corner.x, c.cy - corner.y);
  for (const id of ids) {
    const b = at[id];
    expect(b.x >= 0 && b.y >= cam.y + cam.height && b.x + b.width <= width && b.y + b.height <= height, `${id} on screen, under the camera`).toBe(true);
    if (id === 'whistle') continue;
    expect(whistle.r, `the whistle is bigger than ${id}`).toBeGreaterThan(b.r);
    expect(toCorner(whistle), `the whistle is nearer the corner than ${id}`).toBeLessThan(toCorner(b));
    expect(Math.hypot(b.cx - whistle.cx, b.cy - whistle.cy), `${id} near the whistle`).toBeLessThanOrEqual(b.r * 2 * 2.2);
  }
  // Left-handed mirrors right-handed (remembered from the right-handed pass at the same size).
  const mirrorKey = `${width}x${height}`;
  const edges = Object.fromEntries(ids.map((id) => [id, leftHanded ? at[id].x : width - (at[id].x + at[id].width)]));
  if (!leftHanded) layoutEdges.set(mirrorKey, edges);
  else {
    const right = layoutEdges.get(mirrorKey);
    if (right) for (const id of ids) expect(Math.abs(edges[id] - right[id]), `${id} mirrored`).toBeLessThanOrEqual(2);
  }
  // v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A3): the まえ／うしろ switch sits beside the lever on the screen's middle side
  // (left-handed: with the lever, on the right), on screen, clear of the lever and its words, the round buttons, the
  // door (shown for a moment to measure it) and the corner buttons; mirrored left-handed. On the iPad also clear of the
  // partner's bubble (a two-line one, shown for a moment); on the phones the bubble lies over the lever already.
  const sw = page.locator('#reverse-switch');
  if (await sw.isVisible()) {
    const s = await box(page, '#reverse-switch');
    const lever = await box(page, '#lever');
    expect(s.x >= 0 && s.y >= cam.y + cam.height && s.x + s.width <= width && s.y + s.height <= height, 'the switch on screen, under the corner').toBe(true);
    expect(leftHanded ? s.x + s.width <= lever.x : s.x >= lever.x + lever.width, 'the switch on the middle side of the lever').toBe(true);
    if (leftHanded) expect(s.x).toBeGreaterThan(width / 2);
    else expect(s.x + s.width).toBeLessThan(width / 2);
    const labels = await page.locator('.lever-label').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, text: el.textContent ?? '' };
    }));
    for (const l of labels) expect(overlaps(s, l), `the switch clear of the lever's "${l.text}"`).toBe(false);
    for (let i = 0; i < ids.length; i++) expect(overlaps(s, buttons[i]), `the switch clear of #${ids[i]}`).toBe(false);
    expect(overlaps(s, cam)).toBe(false);
    expect(overlaps(s, pause)).toBe(false);
    const door = await page.evaluate(() => {
      const el = document.getElementById('door');
      if (!el) throw new Error('#door missing');
      const was = el.hidden;
      el.hidden = false;
      const r = el.getBoundingClientRect();
      el.hidden = was;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(overlaps(s, door), 'the switch clear of the door button').toBe(false);
    if (width >= 1000) {
      const bubble = await page.evaluate(() => {
        const el = document.getElementById('bubble');
        if (!el?.parentElement) throw new Error('#bubble missing');
        // A copy of it with a long line, measured and taken away (the real one keeps what it is saying).
        const copy = document.createElement('div');
        copy.className = el.className;
        copy.textContent = 'いきすぎ〜！ うしろで もどって！ うしろむきで いって みよう！';
        el.parentElement.appendChild(copy);
        const r = copy.getBoundingClientRect();
        copy.remove();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      expect(overlaps(s, bubble), 'the switch clear of the bubble').toBe(false);
    }
    const edge = leftHanded ? width - (s.x + s.width) : s.x;
    const key = `switch:${width}x${height}`;
    if (!leftHanded) layoutEdges.set(key, { edge });
    else {
      const right = layoutEdges.get(key);
      if (right) expect(Math.abs(edge - right.edge), 'the switch mirrored').toBeLessThanOrEqual(2);
    }
  }
  // (The smallest phone checks the buttons only; the top bar's own rules are checked at the two sizes above.)
  if (buttonsOnly) return;
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
  // On a short phone (667x375) six buttons are taller than the room under the corner camera button, so the open picker
  // (a moment's overlay above them) may lie over the top ones: accepted (PHASE9_0 §2); on the iPad it stays clear.
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
      // v1.11 (PR8a): with うしろむき too, so the まえ／うしろ switch is laid out with the rest.
      localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: [], abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'reverse'], records: [], mapLinks: [] }));
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
    await expect(page.locator('#reverse-switch')).toBeVisible();
    await checkLayout(page, leftHanded, 1194, 834, leftHanded ? 'corner-left.png' : 'corner-right.png');
    await checkLayout(page, leftHanded, 667, 375, leftHanded ? 'corner-left-small.png' : 'corner-right-small.png', false);
    await checkLayout(page, leftHanded, 568, 320, undefined, false, true);
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  expect(errors).toEqual([]);
});

type Saved = { schema: 1; cleared: string[]; abilities: string[]; records: string[]; mapLinks: string[] };

interface WorldData {
  chapters: { id: number; page: number; finale?: { link?: string; ring?: string[] } }[];
  islands: { id: string; chapter: number }[];
  links: [string, string, { afterChapter?: number }?][];
  /** v1.11 (PR10): the world's end after `after` (its mark "finale:world"). */
  ending?: { after: string };
}

/** Everything of chapters 5 and 6 the あいことば version 3 has a place for (docs/PHASE9_CHAPTER5_6.md 第 1 部 §7.2). */
const V3_LATER = {
  cleared: ['5-1', '5-2', '5-3', '6-1', '6-2'],
  abilities: ['magnetLight', 'reverse'],
  records: [
    ...['moon-bunnies', 'pond-moonstone', 'lantern-bell'],
    ...['gold-screw', 'glow-marble', 'tin-key'],
    ...['kagami-kanban', 'hand-mirror', 'sakasa-doodle'],
    ...['up-raindrop', 'upside-top', 'backward-book'],
    ...['swirl-acorn', 'left-shell', 'sakasa-tag'],
  ],
};

/**
 * Everything there is to have in the stage files (`only`: the stages whose id matches; `extra`: more, e.g. of
 * stages not built yet), with the map seen as the game saves it once the map has shown it all: every rail laid by
 * the clears (a rail out of a chapter once the chapter is done; a chapter's closing rail once it is done), and
 * "finale:<id>" for a done chapter whose end has no rail, the world's end, and "movie:<id>" for a movie the clears
 * have opened. The fullest progress. `maxPage`: only rails and ends on pages up to it (what a rail-less あいことば of
 * that many pages brings back).
 */
function fullProgress(only = /./, extra?: { cleared: string[]; abilities: string[]; records: string[] }, maxPage = Infinity): Saved {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const stages = readdirSync(resolve(root, 'src/stages'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(root, 'src/stages', f), 'utf8')) as { id: string; hidden?: boolean; unlocks: string[]; records: { id: string }[] })
    .filter((s) => !s.hidden && only.test(s.id));
  const world = JSON.parse(readFileSync(resolve(root, 'src/world/world.json'), 'utf8')) as WorldData;
  const movies = readdirSync(resolve(root, 'src/movies'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(root, 'src/movies', f), 'utf8')) as { id: string; unlock: { requires: string[] } });
  const more = (have: string[], add: string[] | undefined): string[] => [...have, ...(add ?? []).filter((id) => !have.includes(id))];
  const cleared = more(
    stages.map((s) => s.id),
    extra?.cleared,
  );
  const page = (id: string): number => {
    const chapter = world.chapters.find((c) => c.id === world.islands.find((i) => i.id === id)?.chapter);
    return chapter?.page ?? Infinity;
  };
  const done = (id: number): boolean => {
    const chapter = world.chapters.find((c) => c.id === id);
    const ids = [...world.islands.filter((i) => i.chapter === id).map((i) => i.id), ...(chapter?.finale?.ring ?? [])];
    return ids.length > 0 && ids.every((i) => cleared.includes(i));
  };
  const closing = new Map(world.chapters.filter((c) => c.finale?.link).map((c) => [c.finale?.link, c.id]));
  // PR10: the world's end is seen once its stage is cleared and every chapter before its chapter is done.
  const endAfter = world.ending?.after;
  const endChapter = world.islands.find((i) => i.id === endAfter)?.chapter ?? 0;
  const endSeen =
    !!endAfter && cleared.includes(endAfter) && page(endAfter) <= maxPage && world.chapters.filter((c) => c.id < endChapter).every((c) => done(c.id));
  return {
    schema: 1,
    cleared,
    abilities: more([...new Set(stages.flatMap((s) => s.unlocks))], extra?.abilities),
    records: more(
      stages.flatMap((s) => s.records.map((r) => r.id)),
      extra?.records,
    ),
    mapLinks: [
      ...world.links
        .filter(([from, to, opts]) => cleared.includes(from) && !to.startsWith('teaser:') && (opts?.afterChapter === undefined || done(opts.afterChapter)))
        .filter(([from, to]) => page(from) <= maxPage && page(to) <= maxPage)
        .map(([from, to]) => `${from}>${to}`)
        .filter((key) => !closing.has(key) || done(closing.get(key) ?? 0)),
      ...world.chapters.filter((c) => c.finale && !c.finale.link && done(c.id) && c.page <= maxPage).map((c) => `finale:${c.id}`),
      ...(endSeen ? ['finale:world'] : []),
      // PR12: a movie the clears have opened (the ending after 6-2) counts as watched, as the game marks it.
      ...movies.filter((m) => m.unlock.requires.length > 0 && m.unlock.requires.every((id) => cleared.includes(id))).map((m) => `movie:${m.id}`),
    ],
  };
}

/**
 * A version 1 あいことば (12 letters, chapters 1 and 2, the rails in it) as the game wrote them before version 2:
 * everything of chapters 1 and 2 with the 6 rails of chapters 1 and 2 seen.
 */
const PASSCODE_V1_CHAPTERS_1_2 = '1ZZZ-ZZZZ-7EQR';
/**
 * A version 2 あいことば (16 letters, chapters 1 to 4, no rails) as the game wrote them before version 3 (2026-09-28
 * to 2026-09-30): every clear, ability and record of chapters 1 to 4.
 */
const PASSCODE_V2_CHAPTERS_1_4 = '2ZZZ-ZZZZ-ZZZZ-XAF9';

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

  // The あいことば: version 3, 20 letters in five groups (the first letter is the version).
  await expect(page.locator('#parents')).toContainText('20文字の「あいことば」');
  await expect(page.locator('#parents')).toContainText('12文字・16文字の あいことばも');
  await page.locator('#parents-passcode-show').click();
  const code = (await page.locator('#parents-passcode').textContent()) ?? '';
  expect(code).toMatch(/^3[0-9A-Z]{3}(-[0-9A-Z]{4}){4}$/);
  await expect(page.locator('#parents-passcode-input')).toHaveAttribute('placeholder', 'XXXX-XXXX-XXXX-XXXX-XXXX');
  await page.screenshot({ path: resolve(OUT, '43-parents.png') });

  // A mistyped one is caught and changes nothing.
  const flip = (c: string) => (c === 'Z' ? 'Y' : 'Z');
  await page.locator('#parents-passcode-input').fill(code.slice(0, 7) + flip(code[7]) + code.slice(8));
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('#parents-passcode-message')).toHaveClass(/is-error/);
  await expect(page.locator('.parents-confirm')).toHaveCount(0);
  // One letter too many: the message gives version 3's 20 letters. A version never published ("4…"): caught too.
  await page.locator('#parents-passcode-input').fill(`${code}Z`);
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('#parents-passcode-message')).toContainText('20もじ');
  await page.locator('#parents-passcode-input').fill(`4${code.slice(1)}`);
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('#parents-passcode-message')).toContainText('1もじめ');
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

/** From the title: the settings, then "おうちの かたへ" held until it opens. */
async function openParents(page: Page): Promise<void> {
  await page.locator('#title-settings').click();
  await page.locator('#settings-parents').dispatchEvent('pointerdown');
  await expect(page.locator('#parents')).toBeVisible({ timeout: 15_000 });
  await page.locator('#settings-parents').dispatchEvent('pointerup');
}

/** Types an あいことば in, says yes, and waits for the game to come back with it. */
async function typePasscode(page: Page, code: string, clears: number): Promise<void> {
  await page.locator('#parents-passcode-input').fill(code);
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('.parents-confirm')).toContainText(`クリア ${clears}`);
  const restored = page.waitForEvent('load');
  await page.locator('.parents-confirm-yes').click();
  await restored;
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
}

const progressNow = (page: Page): Promise<Saved> => page.evaluate(() => JSON.parse(localStorage.getItem('train-game.progress.v1') ?? '{}'));

test('あいことば version 3: all of chapters 1 to 6 in 20 letters, on a small phone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Every clear, ability and record the version has a place for (17 clears, 8 abilities, 51 records): since 6-2
  // (PR11b) all of them are in the stage files (PR12: nothing of version 3 is missing from them any more).
  const full = fullProgress();
  expect([full.cleared.length, full.abilities.length, full.records.length]).toEqual([17, 8, 51]);
  expect(sorted(full)).toEqual(sorted(fullProgress(/./, V3_LATER)));
  expect(full.mapLinks).toEqual(expect.arrayContaining(['finale:5', 'finale:world', 'finale:6', 'movie:ending']));
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/');
  await page.evaluate((p) => localStorage.setItem('train-game.progress.v1', JSON.stringify(p)), full);
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await openParents(page);
  await page.locator('#parents-passcode-show').click();
  const shown = page.locator('#parents-passcode');
  const code = (await shown.textContent()) ?? '';
  expect(code).toMatch(/^3[0-9A-Z]{3}(-[0-9A-Z]{4}){4}$/);
  // The 20 letters stay on the screen of the smallest phone.
  await shown.scrollIntoViewIfNeeded();
  const box = (await shown.boundingBox())!;
  const text = await shown.evaluate((e) => {
    const r = document.createRange();
    r.selectNodeContents(e);
    return r.getBoundingClientRect().toJSON() as DOMRect;
  });
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(text.x).toBeGreaterThanOrEqual(0);
  expect(text.x + text.width).toBeLessThanOrEqual(568);
  await page.screenshot({ path: resolve(OUT, '46-parents-passcode-v3-small.png') });

  // Typed back in over an empty progress: everything comes back, the rails from the clears all seen.
  await page.evaluate(() => localStorage.removeItem('train-game.progress.v1'));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await openParents(page);
  await typePasscode(page, code, 17);
  expect(sorted(await progressNow(page))).toEqual(sorted(full));
  await expect(page.locator('#title-chapters')).toHaveText(/4しょう ★\s*5しょう ★\s*6しょう ★/);
  // The map shows nothing new: no rail grows, no chapter's end.
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.waitForTimeout(2_000);
  await expect(page.locator('#map')).not.toHaveAttribute('data-finale', /.+/);
  await expect(page.locator('#map')).not.toHaveAttribute('data-growing', /.+/);
  await expect(page.locator('#map .is-growing')).toHaveCount(0);
  await expect(page.locator('#card')).toHaveCount(0);
  await page.locator('#map-close').click();
  expect(sorted(await progressNow(page))).toEqual(sorted(full));
  expect(errors).toEqual([]);
});

test('あいことば version 2 (16 letters) is still read; the rail through the gate to page 3 grows once after it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await openParents(page);
  // One letter short: version 2's 16 letters.
  await page.locator('#parents-passcode-input').fill(PASSCODE_V2_CHAPTERS_1_4.slice(0, -1));
  await page.locator('#parents-passcode-load').click();
  await expect(page.locator('#parents-passcode-message')).toContainText('16もじ');
  // Version 2 came out with two map pages: what it brings back is seen only up to page 2 (第 1 部 §7.3).
  const chapters14 = fullProgress(/^[1-4]-/, undefined, 2);
  await typePasscode(page, PASSCODE_V2_CHAPTERS_1_4.toLowerCase(), 12);
  const back = await progressNow(page);
  expect(sorted(back)).toEqual(sorted(chapters14));
  expect(back.mapLinks).toContain('finale:4');
  expect(back.mapLinks).not.toContain('4-3>5-1');
  // So the map grows it once: 4-3 to the gate, the page turns, on to 5-1; then it is saved.
  await page.locator('#title-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('[data-link="4-3>5-1"]')).toHaveClass(/is-growing/);
  await expect(page.locator('#map')).toHaveAttribute('data-page', '3', { timeout: 10_000 });
  await expect(page.locator('#map')).not.toHaveAttribute('data-growing', /.+/, { timeout: 10_000 });
  await expect(page.locator('#map')).not.toHaveAttribute('data-finale', /.+/);
  expect((await progressNow(page)).mapLinks).toContain('4-3>5-1');
  expect(errors).toEqual([]);
});
