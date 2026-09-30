import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The sounds page (sounds.html): every effect has a button and plays without errors, and rendered offline each
 * one is heard (not silent) and does not clip. The running sound clicks over rail joints at "びゅーん" on every
 * kind of track. Every island's ambience stays well under the train. Every song has a button, plays, and
 * rendered offline is heard and does not clip.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

interface Measure {
  id: string;
  peak: number;
  rms: number;
  bright: number;
  joints?: number;
}

const SONG_IDS = ['title', 'town', 'valley', 'forest', 'meadow', 'volcano', 'hurry', 'sky', 'umi', 'kawa', 'hoshimatsuri', 'koori', 'mura', 'yuki', 'yoru', 'omocha'];
/** v1.11 (5-2): the toy town's effects (PHASE9_CHAPTER5_6 第 5 部 §10). */
const TOY_SOUNDS = ['wind-up', 'band-fanfare', 'band-step', 'spin-turn', 'spin-good', 'spin-stop', 'ball-pit', 'toy-puff'];
/** v1.11 (PR5): the magnet light's effects (PHASE9_CHAPTER5_6 第 2 部 M13, the group "じしゃく"). */
const MAGNET_SOUNDS = ['magnet-on', 'magnet-pull', 'magnet-catch', 'rail-snap', 'gate-open', 'magnet-bounce', 'iron-biyon', 'iron-karan', 'sign-bell'];
/** v1.11 (5-3): the mirror world's effects, the group「かがみ」(PHASE9_CHAPTER5_6 第 6 部 §10; the turn with and without the flash). */
const MIRROR_SOUNDS = ['mirror-gate', 'mirror-ripple', 'mirror-bump', 'phantom-pop', 'glass-on', 'mirror-turn', 'mirror-turn-back', 'letter-reflect'];

test('sounds page: every effect plays, is heard and does not clip; the running sound on each track', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/sounds.html');
  await expect(page.locator('#build')).toContainText('build');
  const effects = page.locator('button[data-sound]');
  expect(await effects.count()).toBeGreaterThanOrEqual(39);
  // A few taps: the lever up, a track, an effect.
  await page.locator('button[data-notch="5"]').click();
  await page.locator('button[data-surface="wood"]').click();
  await page.locator('button[data-sound="whistle"]').click();
  await expect.poll(async () => Number(await page.locator('body').getAttribute('data-joints')), { timeout: 30_000 }).toBeGreaterThan(0);
  // The new tracks and under water, and the new effects, played live.
  for (const surface of ['ice', 'snow', 'tunnel']) {
    await page.locator(`button[data-surface="${surface}"]`).click();
    await expect(page.locator(`button[data-surface="${surface}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
  }
  await page.locator('#dive').click();
  await expect(page.locator('#dive')).toHaveAttribute('aria-pressed', 'true');
  // v1.10 (3-2, 3-3): the river's and the harbour's effects too.
  for (const id of [
    'ice-crack',
    'ice-splash',
    'mirror',
    'plow',
    'plow-bump',
    'snow-wave',
    'snow-catch',
    'shower',
    'boat-bump',
    'duck',
    'frog',
    'fish-leap',
    'sign-flip',
    'turtle-wake',
    'beacon',
    'festival',
    'moon-up',
    'glimmer',
    // v1.11 (chapters 5 and 6): the map's new sounds.
    'firefly',
    'windows',
    'bridge',
    'world-step',
    ...TOY_SOUNDS,
    ...MAGNET_SOUNDS,
    ...MIRROR_SOUNDS,
  ]) {
    await page.locator(`button[data-sound="${id}"]`).click();
  }
  await page.screenshot({ path: resolve(OUT, '95-sounds-page.png'), fullPage: true });

  const measured = await page.evaluate(() => (window as unknown as { __measure: () => Promise<Measure[]> }).__measure());
  for (const m of measured) {
    console.log(`sound ${m.id}: peak ${m.peak.toFixed(3)}, rms ${m.rms.toFixed(4)}, bright ${m.bright.toFixed(3)}${m.joints ? `, joints ${m.joints}` : ''}`);
  }
  for (const m of measured) {
    expect(m.peak, `${m.id} clips`).toBeLessThan(0.98);
    expect(m.rms, `${m.id} is silent`).toBeGreaterThan(0.001);
  }
  const runs = measured.filter((m) => m.id.startsWith('run-'));
  expect(runs.map((m) => m.id)).toEqual([
    'run-rail',
    'run-silk',
    'run-bridge',
    'run-wood',
    'run-soft',
    'run-ice',
    'run-snow',
    'run-tunnel',
    'run-rocket',
    'run-underwater',
  ]);
  // 4 s at 22 m/s from half a joint: 88 m, a joint every 12 m.
  for (const m of runs) expect(m.joints).toBe(7);
  const run = Object.fromEntries(runs.map((m) => [m.id, m]));
  const rms = (id: string): number => run[id].rms;
  // Silk and petals are hushed; the bridge rings louder than plain rail.
  expect(rms('run-silk')).toBeLessThan(rms('run-rail') * 0.7);
  expect(rms('run-bridge')).toBeGreaterThan(rms('run-rail'));
  // The rocket's roar is heard over the rails.
  expect(rms('run-rocket')).toBeGreaterThan(rms('run-rail') * 1.2);
  // Snow is softer than rail; a tunnel is louder; ice hisses brighter; under water is muffled (darker).
  expect(rms('run-snow')).toBeLessThan(rms('run-rail'));
  expect(rms('run-tunnel')).toBeGreaterThan(rms('run-rail'));
  expect(run['run-ice'].bright).toBeGreaterThan(run['run-rail'].bright * 1.2);
  expect(run['run-underwater'].bright).toBeLessThan(run['run-rail'].bright * 0.8);
  // Each island's ambience is there, and well under the running train.
  const around = measured.filter((m) => m.id.startsWith('ambience-'));
  expect(around.map((m) => m.id)).toEqual([
    'ambience-town',
    'ambience-valley',
    'ambience-sky',
    'ambience-forest',
    'ambience-meadow',
    'ambience-sea',
    'ambience-underwater',
    'ambience-river',
    'ambience-ice',
    'ambience-snow',
    'ambience-night',
    'ambience-toy',
    'ambience-mirror',
    'ambience-castle',
    'ambience-sea-underwater',
  ]);
  for (const m of around) expect(m.rms, `${m.id} too loud`).toBeLessThan(rms('run-rail') * 0.6);
  // Going under crossfades the sea's waves to the deep, quieter hush.
  const amb = Object.fromEntries(around.map((m) => [m.id, m]));
  expect(amb['ambience-sea-underwater'].rms).toBeLessThan(amb['ambience-sea'].rms * 0.85);
  await page.locator('button[data-ambience="forest"]').click();
  await expect(page.locator('button[data-ambience="forest"]')).toHaveAttribute('aria-pressed', 'true');
  for (const kind of ['underwater', 'river', 'ice', 'snow', 'night', 'toy', 'mirror', 'castle']) {
    await page.locator(`button[data-ambience="${kind}"]`).click();
    await expect(page.locator(`button[data-ambience="${kind}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  // v1.11: every new effect has a button.
  for (const id of ['firefly', 'windows', 'bridge', 'world-step', ...TOY_SOUNDS, ...MAGNET_SOUNDS]) await expect(page.locator(`button[data-sound="${id}"]`)).toHaveCount(1);
  // v1.11 (PR5): the magnet's are one group on the page, each heard.
  for (const id of MAGNET_SOUNDS) expect(measured.find((m) => m.id === id)?.rms ?? 0, `${id} is heard`).toBeGreaterThan(0.001);
  for (const id of ['firefly', 'windows', 'bridge', 'world-step', ...TOY_SOUNDS, ...MIRROR_SOUNDS]) await expect(page.locator(`button[data-sound="${id}"]`)).toHaveCount(1);
  // v1.11 (5-3): the group「かがみ」on the page.
  await expect(page.locator('button[data-sound="mirror-gate"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('sounds page: every song has a button, plays, and rendered offline is heard and does not clip', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/sounds.html');
  await expect(page.locator('#build')).toContainText('build');
  const ids = await page.locator('#songs button[data-song]').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.song));
  expect([...ids].sort()).toEqual([...SONG_IDS, 'none'].sort());
  // Each song in turn (a moment each, so a few notes are scheduled), then silence.
  for (const id of SONG_IDS) {
    await page.locator(`#songs button[data-song="${id}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-song', id);
    await expect(page.locator(`#songs button[data-song="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(250);
  }
  await page.locator('#songs button[data-song="none"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-song', '');

  const measured = await page.evaluate(() => (window as unknown as { __measureSongs: () => Promise<Measure[]> }).__measureSongs());
  for (const m of measured) console.log(`song ${m.id}: peak ${m.peak.toFixed(3)}, rms ${m.rms.toFixed(4)}`);
  expect(measured.map((m) => m.id).sort()).toEqual(SONG_IDS.map((id) => `song-${id}`).sort());
  for (const m of measured) {
    expect(m.peak, `${m.id} clips`).toBeLessThan(0.98);
    expect(m.rms, `${m.id} is silent`).toBeGreaterThan(0.005);
  }
  expect(errors).toEqual([]);
});

test('sounds page: a song with loop false plays once and stops; without it the song goes round again', async ({ page }) => {
  await page.goto('/sounds.html');
  const ends = await page.evaluate(() => (window as unknown as { __measureSongEnd: () => Promise<{ once: number; loops: number }> }).__measureSongEnd());
  console.log(`song end: once ${ends.once.toFixed(5)}, loops ${ends.loops.toFixed(5)}`);
  expect(ends.loops).toBeGreaterThan(0.005);
  expect(ends.once).toBeLessThan(0.0005);
});
