import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
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
 * its tiles open on screen, clear of the thumb buttons. The rocket sits in the 2×2 block (upper, outer seat).
 */
async function checkLayout(page: Page, leftHanded: boolean, width: number, height: number, shot?: string): Promise<void> {
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
  const buttons = await Promise.all(['#light', '#rocket', '#jump', '#whistle'].map((id) => box(page, id)));
  const [light, rocket, jump, whistle] = buttons;
  for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) expect(overlaps(buttons[i], buttons[j])).toBe(false);
  expect(rocket.y).toBeLessThan(whistle.y);
  expect(Math.abs(rocket.x - whistle.x)).toBeLessThan(2);
  expect(leftHanded ? rocket.x < light.x : rocket.x > light.x).toBe(true);
  expect(leftHanded ? whistle.x < jump.x : whistle.x > jump.x).toBe(true);
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
  for (const b of buttons) expect(overlaps(menu, b)).toBe(false);
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

test('corner buttons and the rocket seat, lever left and right, iPad and small phone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const app = page.locator('#app');
  for (const leftHanded of [false, true]) {
    await page.goto('/?stage=1-1');
    await page.evaluate((lh) => {
      localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: [], abilities: ['whistle', 'jump', 'light', 'rocket'], records: [], mapLinks: [] }));
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
    await checkLayout(page, leftHanded, 667, 375, leftHanded ? 'corner-left-small.png' : 'corner-right-small.png');
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  expect(errors).toEqual([]);
});
