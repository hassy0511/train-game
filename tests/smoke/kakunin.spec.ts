import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, NORMAL, setNotch, stopAt, tapUntil, waitDriving, waitWelcome } from './drive';

/**
 * 「かくにん モード」 (docs/TECH_SPEC.md §かくにん モード) on the production build: the number pad refuses a wrong code;
 * with the device's flag the list shows every chapter and the test courses, a mission picked starts there with the
 * abilities it needs, the run leaves the progress save byte for byte as it was, the small 「かくにん」 mark shows
 * (clear of the buttons, also left-handed), and the clear card goes back to the list. The `?stage=` lock (only
 * without the flag and with `navigator.webdriver` forced false, as on a kid's iPad) sends a test stage, a stage the
 * save has not opened and the check mode's own parameters back to the title.
 *
 * The code's digits are written nowhere (only its hash is in src/core/kakunin.ts): the right-code path is not
 * typed here; the flag is set in an init script, as a device that was unlocked before.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const SAVE_KEY = 'train-game.progress.v1';
const SETTINGS_KEY = 'train-game.settings.v1';
const FLAG_KEY = 'train-game.kakunin.v1';
/** The hash the flag must hold (src/core/kakunin.ts KAKUNIN_HASH): a stray value is not the flag. */
const FLAG_VALUE = '80eaae856b4fc19a430f4f92ea3a592073d382618d7915a5397176eb6c7a1f0f';
/** A wrong code, checked below not to be the right one. */
const WRONG = '0000';

/** Written in another key order and spacing than the game writes it, so any rewrite changes the bytes. */
const SEED_SAVE =
  '{ "records": ["town-board"], "schema": 1, "cleared": ["1-1"], "abilities": ["whistle"], "mapLinks": ["1-1>1-2"] }';

const stageFile = (id: string): { missions: { title: string }[]; title: string } =>
  JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), `../../src/stages/${id}.json`), 'utf8'));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** The device was unlocked before, with the progress save (and settings) as given. */
async function unlocked(page: Page, options: { save?: string; leftHanded?: boolean } = {}): Promise<void> {
  await page.addInitScript(
    ([flagKey, flag, saveKey, save, settingsKey, left]) => {
      localStorage.setItem(flagKey, flag);
      if (save && !localStorage.getItem(saveKey)) localStorage.setItem(saveKey, save);
      if (left) localStorage.setItem(settingsKey, JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: true }));
    },
    [FLAG_KEY, FLAG_VALUE, SAVE_KEY, options.save ?? '', SETTINGS_KEY, options.leftHanded ?? false] as const,
  );
}

/** A kid's iPad: no `navigator.webdriver` (the smoke tests' browser has it, and that skips the lock). */
async function notAutomated(page: Page): Promise<void> {
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
}

const save = (page: Page): Promise<string | null> => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);

async function ready(page: Page, stage: string): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-stage', stage);
}

/** Title → the gear → 「おうちの かたへ」 (held) → its page. */
async function openParents(page: Page): Promise<void> {
  await page.goto('/');
  await ready(page, '1-1');
  await page.locator('#title-settings').click();
  await page.locator('#settings-parents').dispatchEvent('pointerdown');
  await expect(page.locator('#parents')).toBeVisible({ timeout: 15_000 });
  await page.locator('#settings-parents').dispatchEvent('pointerup');
}

/** Boxes (x, y, w, h) of the in-game controls that are on the screen now, by name. */
async function controlBoxes(page: Page): Promise<{ name: string; x: number; y: number; w: number; h: number }[]> {
  return page.evaluate(() => {
    const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
    const sel = '.round-button, .lever, .lever-detent, .corner-button, .reverse-switch, .cargo-strip, .hud-speed, .stop-gauge, .timer, .bubble, .junction-arrows, #door, #junction';
    for (const el of document.querySelectorAll<HTMLElement>(`#ui ${sel.split(', ').join(', #ui ')}`)) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (el.hidden || style.display === 'none' || style.visibility === 'hidden' || r.width < 2 || r.height < 2) continue;
      out.push({ name: el.id || el.className, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  });
}

/** The 「かくにん」 mark is on the screen and touches none of the controls shown (right- and left-handed alike). */
async function badgeClear(page: Page): Promise<void> {
  const badge = page.locator('#kakunin-badge');
  await expect(badge).toBeVisible();
  const box = await badge.boundingBox();
  if (!box) throw new Error('no badge');
  const view = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(view?.height ?? 0);
  for (const other of await controlBoxes(page)) {
    const apart = box.x + box.width <= other.x || other.x + other.w <= box.x || box.y + box.height <= other.y || other.y + other.h <= box.y;
    expect(apart, `badge over ${other.name}`).toBe(true);
  }
}

test('the number pad turns a wrong code away: it shakes, clears, and nothing is remembered', async ({ page }) => {
  // The wrong code must not be the right one (only the hash is known here).
  expect(createHash('sha256').update(`train-game-kakunin:${WRONG}`).digest('hex')).not.toBe(FLAG_VALUE);
  const errors = watchErrors(page);
  await openParents(page);
  await expect(page.locator('#parents')).toContainText('かくにん モード');
  // Not unlocked: no 「やめる」, and the button asks for the number.
  await expect(page.locator('#parents-kakunin-off')).toBeHidden();
  await page.locator('#parents-kakunin').click();
  await expect(page.locator('#kakunin-pad')).toBeVisible();
  await expect(page.locator('.kakunin-key')).toHaveCount(12);
  // Big touch targets.
  for (const box of await page.locator('.kakunin-key').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.height).toBeGreaterThanOrEqual(64);
  }
  // 「もどる」 takes the last digit back, 「けす」 all of them.
  await page.locator('.kakunin-key[data-key="1"]').click();
  await page.locator('.kakunin-key[data-key="2"]').click();
  await expect(page.locator('.kakunin-dot.is-filled')).toHaveCount(2);
  await page.locator('.kakunin-key[data-key="back"]').click();
  await expect(page.locator('.kakunin-dot.is-filled')).toHaveCount(1);
  await page.locator('.kakunin-key[data-key="clear"]').click();
  await expect(page.locator('.kakunin-dot.is-filled')).toHaveCount(0);

  for (const d of WRONG) await page.locator(`.kakunin-key[data-key="${d}"]`).click();
  await expect(page.locator('#kakunin-dots')).toHaveClass(/is-shaking/);
  await expect(page.locator('#kakunin-message')).toContainText('ちがう');
  // Cleared by itself, and the pad is still there to try again (no lockout).
  await expect(page.locator('.kakunin-dot.is-filled')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator('#kakunin-pad')).toBeVisible();
  await expect(page.locator('#kakunin-list')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), FLAG_KEY)).toBeNull();
  // Again, wrong again: still just a shake.
  for (const d of WRONG) await page.locator(`.kakunin-key[data-key="${d}"]`).click();
  await expect(page.locator('#kakunin-dots')).toHaveClass(/is-shaking/);
  await expect(page.locator('.kakunin-dot.is-filled')).toHaveCount(0, { timeout: 5_000 });
  expect(await page.evaluate((key) => localStorage.getItem(key), FLAG_KEY)).toBeNull();
  await page.screenshot({ path: resolve(OUT, 'kakunin-pad.png') });
  await page.locator('#kakunin-pad-close').click();
  await expect(page.locator('#kakunin-pad')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the number pad fits a phone, portrait and landscape', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await openParents(page);
  await page.locator('#parents-kakunin').click();
  await expect(page.locator('#kakunin-pad')).toBeVisible();
  for (const size of [
    { width: 375, height: 667 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    // Every key inside the screen, no sideways scroll.
    for (const box of await page.locator('.kakunin-key').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.getElementById('kakunin-pad')!.scrollWidth <= document.getElementById('kakunin-pad')!.clientWidth)).toBe(true);
    await page.screenshot({ path: resolve(OUT, `kakunin-pad-${size.width}x${size.height}.png`) });
  }
});

test('with the flag: the list shows every chapter and the test courses; a mission starts there with its abilities, the save untouched, the badge clear', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await unlocked(page, { save: SEED_SAVE });
  await openParents(page);
  await expect(page.locator('#parents-kakunin-off')).toBeVisible();
  await page.locator('#parents-kakunin').click();
  // Unlocked before: no number asked, the list comes up.
  await expect(page.locator('#kakunin-pad')).toHaveCount(0);
  await expect(page.locator('#kakunin-list')).toBeVisible();
  await expect(page.locator('.kakunin-stage').first()).toBeVisible();

  // Every chapter of the world map (6 has no stage yet) and the test courses.
  for (const chapter of ['1', '2', '3', '4', '5', '6', 'test']) await expect(page.locator(`.kakunin-chapter[data-chapter="${chapter}"]`)).toHaveCount(1);
  for (const id of ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3']) {
    await expect(page.locator(`.kakunin-chapter[data-chapter="${id[0]}"] .kakunin-stage[data-stage="${id}"]`)).toBeEnabled();
  }
  for (let i = 0; i <= 6; i++) await expect(page.locator(`.kakunin-chapter[data-chapter="test"] .kakunin-stage[data-stage="0-${i}"]`)).toBeEnabled();
  await expect(page.locator('.kakunin-chapter[data-chapter="test"] h2')).toHaveText('てすとの コース');
  await page.screenshot({ path: resolve(OUT, 'kakunin-list.png') });
  // It scrolls (more rows than the screen).
  expect(await page.evaluate(() => document.getElementById('kakunin-list')!.scrollHeight > document.getElementById('kakunin-list')!.clientHeight)).toBe(true);

  // A stage shows its missions by title from the stage file, and 「はじめから」.
  const file = stageFile('5-3');
  const row = page.locator('.kakunin-stage[data-stage="5-3"]');
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const missions = page.locator('.kakunin-mission[data-stage="5-3"]');
  await expect(missions).toHaveCount(file.missions.length);
  await expect(missions.first()).toContainText('はじめから');
  for (let i = 0; i < file.missions.length; i++) await expect(missions.nth(i)).toContainText(file.missions[i].title);
  await missions.nth(2).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(OUT, 'kakunin-missions.png') });

  // The third mission: the page goes to the check run's address and plays from there.
  await missions.nth(2).click();
  await page.waitForURL(/stage=5-3&go=1&kakunin=1&mission=2/);
  const app = page.locator('#app');
  await ready(page, '5-3');
  await expect(app).toHaveAttribute('data-kakunin', '1');
  await card(page, 'ミッション 3');
  await waitDriving(page);
  // Every ability the stage needs at that mission: the save only had the whistle; the stages before give the rest, and
  // 5-3's own opening the magnet light. うしろむき comes later (6-x).
  await expect(app).toHaveAttribute('data-abilities', 'dive,jump,light,magnetLight,plow,rocket,whistle');
  for (const id of ['#whistle', '#jump', '#light', '#rocket', '#dive', '#plow']) await expect(page.locator(id)).toBeVisible();
  await expect(page.locator('#reverse-switch')).toBeHidden();
  // The partner's mission start line, from the file (it is mission 3).
  await setNotch(page, NORMAL);
  await page.waitForTimeout(1500);
  await badgeClear(page);
  await page.screenshot({ path: resolve(OUT, 'kakunin-badge.png') });
  // Nothing was written: the save is the very same bytes, and no resume or clear was added.
  expect(await save(page)).toBe(SEED_SAVE);
  expect(errors).toEqual([]);
});

test('with the flag: the test course runs in the sandbox too (all buttons, the badge, the save untouched)', async ({ page }) => {
  const errors = watchErrors(page);
  await unlocked(page, { save: SEED_SAVE });
  await page.goto('/?stage=0-0&go=1&kakunin=1');
  await ready(page, '0-0');
  await expect(page.locator('#app')).toHaveAttribute('data-kakunin', '1');
  await expect(page.locator('#app')).toHaveAttribute('data-abilities', 'dive,jump,light,magnetLight,plow,reverse,rocket,whistle');
  await badgeClear(page);
  // The badge opens the list over the game (the way back on a course without missions).
  await page.locator('#kakunin-badge').click();
  await expect(page.locator('#kakunin-list')).toBeVisible();
  await page.locator('#kakunin-close').click();
  await expect(page.locator('#kakunin-list')).toHaveCount(0);
  expect(await save(page)).toBe(SEED_SAVE);
  expect(errors).toEqual([]);
});

test('with the flag, left-handed: 0-6 from mission 2 to the clear card, which goes back to the list; the save untouched', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await unlocked(page, { save: SEED_SAVE, leftHanded: true });
  const settings = await (async () => {
    await page.goto('/?stage=0-6&go=1&kakunin=1&mission=1');
    await ready(page, '0-6');
    return page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY);
  })();
  const app = page.locator('#app');
  await expect(app).toHaveClass(/is-left-handed/);
  await card(page, 'ミッション 2');
  await waitDriving(page);
  // 0-6 asks for 5-3 (all the stages before's abilities), and mission 1 taught うしろむき.
  await expect(app).toHaveAttribute('data-abilities', 'dive,jump,light,magnetLight,plow,reverse,rocket,whistle');
  await badgeClear(page);
  await setNotch(page, NORMAL);
  await stopAt(page, 't-shima', 100);
  await expect(page.locator('#door')).toBeVisible({ timeout: 30_000 });
  await badgeClear(page);
  await page.locator('#door').dispatchEvent('pointerdown');
  await waitWelcome(page, 'done', 60_000);
  await card(page, 'できた');
  await tapUntil(page, '#app[data-depart="done"]', 90_000);
  await tapUntil(page, '#card', 90_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.locator('#card-button').click();
  // After the clear card: the stage list with this stage's missions open, not the map.
  await expect(page.locator('#kakunin-list')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#map')).toHaveCount(0);
  await expect(page.locator('.kakunin-stage[data-stage="0-6"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.kakunin-mission[data-stage="0-6"]')).toHaveCount(stageFile('0-6').missions.length);
  await page.screenshot({ path: resolve(OUT, 'kakunin-after-clear.png') });
  // No clear, no records, no resume: the save is the very bytes it was; the settings kept as they were.
  expect(await save(page)).toBe(SEED_SAVE);
  expect(await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)).toBe(settings);
  // 「もどる」: the title.
  await page.locator('#kakunin-close').click();
  await page.waitForURL((url) => url.search === '');
  expect(errors).toEqual([]);
});

test('the ?stage= lock (a kid\'s iPad): test stages, unopened stages and the check mode\'s parameters go back to the title; opened ones stay', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await notAutomated(page);
  // The map's own address works: 1-2 is open once 1-1 is cleared; so does the 1-1 default.
  await page.addInitScript(
    ([key, save]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, save);
    },
    [SAVE_KEY, SEED_SAVE] as const,
  );
  const title = async (): Promise<void> => {
    await page.waitForURL((url) => url.search === '', { timeout: 60_000 });
    await ready(page, '1-1');
    await expect(page.locator('#title-screen')).toBeVisible({ timeout: 30_000 });
  };

  // Unlocked: stays (the map's `?stage=…&go=1`).
  await page.goto('/?stage=1-2&go=1');
  await ready(page, '1-2');
  expect(new URL(page.url()).search).toBe('?stage=1-2&go=1');
  await expect(page.locator('#app')).not.toHaveAttribute('data-kakunin', '1');

  // The hidden test stage: back to the title.
  await page.goto('/?stage=0-0');
  await title();
  await page.goto('/?stage=0-3&go=1');
  await title();
  // A stage the save has not opened (5-3 needs 5-2).
  await page.goto('/?stage=5-3&go=1');
  await title();
  // The check mode's parameters without the flag.
  await page.goto('/?stage=1-1&go=1&kakunin=1&mission=2');
  await title();
  await page.goto('/?stage=1-2&go=1&kakunin=1');
  await title();
  await page.goto('/?stage=1-2&go=1&mission=1');
  await title();
  // Not a flag: a stray value in the flag's key.
  await page.evaluate((key) => localStorage.setItem(key, '1'), FLAG_KEY);
  await page.goto('/?stage=0-0&go=1');
  await title();
  expect(await save(page)).toBe(SEED_SAVE);

  // The place of "つづきから" is let through even where its stage is not open by the clears.
  await page.evaluate(
    ([key]) => localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: ['1-1'], abilities: ['whistle'], records: [], mapLinks: [], resume: { stage: '1-2', mission: 1 } })),
    [SAVE_KEY] as const,
  );
  await page.goto('/?stage=1-2&go=1&resume=1');
  await ready(page, '1-2');
  expect(new URL(page.url()).search).toBe('?stage=1-2&go=1&resume=1');
  expect(errors).toEqual([]);
});

test('the flag opens the locked stages; 「かくにん モードを やめる」 forgets it and the lock is back', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await notAutomated(page);
  // The init script sets the flag once (a reload keeps what the page did to it).
  await page.addInitScript(
    ([key, flag]) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(key, flag);
      }
    },
    [FLAG_KEY, FLAG_VALUE] as const,
  );
  // With the flag, a test stage and a check run open (no bounce).
  await page.goto('/?stage=0-0&go=1');
  await ready(page, '0-0');
  expect(new URL(page.url()).search).toBe('?stage=0-0&go=1');
  await openParents(page);
  await expect(page.locator('#parents-kakunin-state')).toContainText('番号なし');
  await page.locator('#parents-kakunin-off').click();
  await expect(page.locator('.parents-confirm')).toContainText('やめますか');
  // The yes pops in after a moment (a double tap cannot answer it).
  await expect(page.locator('.parents-confirm-yes')).toHaveClass(/is-popping/, { timeout: 5_000 });
  await page.locator('.parents-confirm-yes').click();
  await expect(page.locator('#parents-kakunin-off')).toBeHidden();
  expect(await page.evaluate((key) => localStorage.getItem(key), FLAG_KEY)).toBeNull();
  // Forgotten: the test stage bounces again.
  await page.goto('/?stage=0-0&go=1');
  await page.waitForURL((url) => url.search === '', { timeout: 60_000 });
  await ready(page, '1-1');
  expect(errors).toEqual([]);
});
