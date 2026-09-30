import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { budget, card, doors, FAST, NORMAL, pressOnGlow, progress, recordLines, pressOnGlowBefore, setNotch, stopAt, tapUntil, waitDriving, waitFront, waitRewound, magnetRecordRun } from './drive';

/**
 * Stage 3-3 "ほしのうみ" from start to chapter 3's end on the map (docs/PHASE8_CHAPTER3_4.md 第 5 部 §15, read with §0.2,
 * and 第 1 部 §4.2): M1 the seabird, the pier's gaps, forgets to dive once ("ぽよん"), dives into
 * the sea, wakes the sleeping turtle with the whistle; M2 misses the red ring once (the loop on the water), goes down
 * at it, lets the false sign fool the train once in the dark (the loop), then the light shows the swirl and finds the
 * star sand; the glimpse; M3 slips on the underwater slope once, climbs it with the rocket, greets the whale, rides
 * its current, and beats the moon's countdown (the breakwater's gap, two festival rafts dived under); the ending:
 * the child lights the lighthouse with the light, the festival, Sakasa at the door, the second note; then the map's
 * water light and "3しょう クリア！", 4-1 opening. A second test lets the moon come up (the time-up).
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
/** A save that has come this far: chapters 1 and 2, 3-1 and 3-2 cleared, "もぐる" learned. */
const SAVE = {
  schema: 1,
  cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2'],
  abilities: ['whistle', 'jump', 'light', 'rocket', 'dive'],
  records: [],
  mapLinks: ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1', '3-1>3-2', '3-2>3-3'],
};

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function whistle(page: Page): Promise<void> {
  await page.locator('#whistle').dispatchEvent('pointerdown');
}

test('stage 3-3 full run: jump and dive, the star trench, the moon, the festival, chapter 3 end', async ({ page }) => {
  test.setTimeout(3_600_000);
  const errors = watchErrors(page);
  await page.addInitScript(
    ([key, save]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, save);
    },
    [KEY, JSON.stringify(SAVE)] as const,
  );
  const saidSoFar = await recordLines(page);

  await page.goto('/?stage=3-3');
  const app = page.locator('#app');
  const diveButton = page.locator('#dive');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '120-hoshi-title.png') });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'hoshimatsuri');

  // ---- M1 ジャンプと もぐる ----
  await card(page, 'ジャンプと もぐる', 120_000);
  // Five round buttons (whistle, jump, light, rocket, dive), none changing face; the dive is not glowing yet.
  await expect(diveButton).toBeVisible();
  await expect(diveButton).toHaveAttribute('data-glow', '0');
  await expect(page.locator('.round-button:visible')).toHaveCount(5);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '121-hoshi-sunset.png') });
  // The seabird on the pier: the whistle.
  await waitFront(page, 'main', 100);
  await whistle(page);
  await expect(app).toHaveAttribute('data-actors', /umidori:awake/, { timeout: 10_000 });
  // The pier's first gap: the jump button glows.
  await pressOnGlowBefore(page, 'jump', 'main', 230);
  await waitFront(page, 'main', 250);
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  // The もぐる button lights up (hint: water within 80 m); on purpose not pressed — "ぽよん" at the water, back before it.
  await expect(app).toHaveAttribute('data-dive', 'near', { timeout: 150_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('もぐるが ひかった！');
  await page.screenshot({ path: resolve(OUT, '122-hoshi-dive-button.png') });
  await expect(app).toHaveAttribute('data-dive-bounces', '1', { timeout: 240_000 });
  await expect(app).toHaveAttribute('data-submerged', '0');
  await waitRewound(page, 'main', 400);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぽよん！ もぐるの わすれた〜');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlowBefore(page, 'dive', 'main', 453);
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '123-hoshi-into-the-sea.png') });
  // The sleeping turtle: the whistle wakes it (under water too).
  await waitFront(page, 'main', 505);
  await page.screenshot({ path: resolve(OUT, '124-hoshi-turtle.png') });
  await whistle(page);
  await expect(app).toHaveAttribute('data-actors', /kame:awake/, { timeout: 10_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('およいで いった〜！');
  // Up on the pier again (the hint is over, "つぎは ジャンプだよ"); the second gap at はやい.
  await waitFront(page, 'main', 690);
  await expect(app).toHaveAttribute('data-dive', '', { timeout: 10_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぷはっ！ つぎは ジャンプだよ');
  await setNotch(page, FAST);
  await pressOnGlowBefore(page, 'jump', 'main', 770);
  await waitFront(page, 'main', 800);
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  await setNotch(page, NORMAL);
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('sunset-starfish');
  console.log('3-3: the seabird, the gaps, "ぽよん" once, the turtle');
  await stopAt(page, 'main', 980);
  await doors(page);
  await card(page, 'できた');

  // ---- M2 ほしの みぞ ----
  await card(page, 'ほしの みぞ');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The red ring: on purpose not diving — round the loop on the water and back before it (no fail).
  await expect(app).toHaveAttribute('data-rail', 'wa', { timeout: 240_000 });
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  await expect(app).toHaveAttribute('data-rail', 'main', { timeout: 240_000 });
  await pressOnGlowBefore(page, 'dive', 'main', 1150);
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-rail', 'main');
  // The star trench is dark: the light glows (not pressed yet). The false sign sends the train round the loop.
  await waitFront(page, 'main', 1350);
  await expect(page.locator('#light')).toHaveAttribute('data-glow', '1', { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '125-hoshi-trench-dark.png') });
  await expect(app).toHaveAttribute('data-rail', 'uso', { timeout: 240_000 });
  await expect(app).toHaveAttribute('data-camera', 'top', { timeout: 20_000 });
  await expect(app).toHaveAttribute('data-rail', 'main', { timeout: 240_000 });
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  await page.locator('#light').dispatchEvent('pointerdown');
  await expect.poll(saidSoFar, { timeout: 90_000 }).toContain('ぐるぐる もよう！ サカサの いたずらだ');
  await page.screenshot({ path: resolve(OUT, '126-hoshi-sign-light.png') });
  await waitFront(page, 'main', 1600);
  await expect(app).toHaveAttribute('data-rail', 'main');
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('star-sand');
  console.log('3-3: missed the ring once, the false sign once, the light, the star sand');
  await stopAt(page, 'main', 1930);
  await page.locator('#light').dispatchEvent('pointerdown');
  await doors(page);
  await card(page, 'できた');
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/, { timeout: 150_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, '127-hoshi-glimpse.png') });
  await expect.poll(saidSoFar, { timeout: 90_000 }).toContain('でんしゃを じっと みてた…');

  // ---- M3 ほしまつりに まにあえ ----
  await card(page, 'ほしまつりに まにあえ', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The underwater slope: on purpose no rocket — "ずるずる", back to 1950 with the dome on.
  await expect(app).toHaveAttribute('data-slip', '1', { timeout: 240_000 });
  await waitRewound(page, 'main', 1956);
  await expect(app).toHaveAttribute('data-dive', 'on');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlow(page, 'rocket');
  await expect(app).toHaveAttribute('data-burn', '1', { timeout: 5_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '128-hoshi-bubble-jet.png') });
  // The whale again: the whistle, then its current.
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-whales', 'kujira:follow', { timeout: 20_000 });
  await waitFront(page, 'main', 2300);
  await expect(app).toHaveAttribute('data-updraft', '1');
  await page.screenshot({ path: resolve(OUT, '129-hoshi-whale-current.png') });
  console.log('3-3: slipped once, the rocket, the whale and its current');
  await stopAt(page, 'main', 2710);
  await doors(page);
  // The moon's countdown to the lighthouse.
  await expect(app).toHaveAttribute('data-timer-state', 'run', { timeout: 150_000 });
  await expect(app).toHaveAttribute('data-timer-icon', 'moon');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The jump right away (its glow can come and go during a slow screenshot); the moon still counts down after it.
  await pressOnGlowBefore(page, 'jump', 'main', 2790);
  await waitFront(page, 'main', 2815);
  await page.screenshot({ path: resolve(OUT, '130-hoshi-moon-timer.png') });
  for (const at of [2985, 3035]) {
    await pressOnGlowBefore(page, 'dive', 'main', at - 3);
    if (at === 2985) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(OUT, '131-hoshi-under-rafts.png') });
    }
    await waitFront(page, 'main', at + 6);
  }
  await expect(app).toHaveAttribute('data-timer-state', 'safe', { timeout: 150_000 });
  await stopAt(page, 'main', 3180);
  await doors(page);
  await card(page, 'できた');

  // ---- The ending: the lighthouse, the festival, Sakasa at the door, the second note ----
  await expect(app).toHaveAttribute('data-cutscene-press', 'light', { timeout: 240_000 });
  await expect(page.locator('#light')).toHaveAttribute('data-glow', '1');
  await page.screenshot({ path: resolve(OUT, '132-hoshi-press-light.png') });
  await page.locator('#light').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-beacon', '1', { timeout: 10_000 });
  await expect(app).not.toHaveAttribute('data-cutscene-press', /.+/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '133-hoshi-beacon.png') });
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('ほしまつりの はじまり〜！');
  await page.screenshot({ path: resolve(OUT, '134-hoshi-festival.png') });
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/, { timeout: 150_000 });
  // Sakasa has walked up the platform to the door.
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('…あれ？ うしろの ドアに…');
  await page.screenshot({ path: resolve(OUT, '135-hoshi-sakasa-door.png') });
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toHaveClass(/is-mirror/);
  await expect(page.locator('#card h1')).toHaveText('のせて');
  await page.locator('#card-button').click();
  await card(page, '3しょう おしまい！', 120_000);
  await tapUntil(page, '#card', 90_000);
  await expect(page.locator('#card')).toContainText('クリア');

  const saved = await progress(page);
  expect(saved.records).toEqual(expect.arrayContaining(['sunset-starfish', 'star-sand']));
  expect(saved.records).not.toContain('festival-bell');
  const b = await budget(page);
  console.log(`3-3 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();

  // ---- Chapter 3's end on the map: the water light 3-1 → 3-2 → 3-3 → 4-1, the card, 4-1 opens ----
  const map = page.locator('#map');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('data-page', '2', { timeout: 20_000 });
  await expect(map).toHaveAttribute('data-finale', 'playing', { timeout: 20_000 });
  await expect(page.locator('.map-link.is-lit.is-water').first()).toBeAttached({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, '136-hoshi-map-water-light.png') });
  await expect(page.locator('#card')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#card')).toContainText('3しょう クリア');
  await expect(page.locator('#card')).toContainText('みずの せかいが');
  await page.screenshot({ path: resolve(OUT, '137-hoshi-ch3-card.png') });
  await page.locator('#card-button').click({ timeout: 10_000 });
  await expect(page.locator('.map-island[data-island="4-1"]')).toHaveClass(/is-next/, { timeout: 20_000 });
  await expect(page.locator('.map-island[data-island="4-1"]')).not.toHaveClass(/is-asleep/);
  const after = await progress(page);
  expect(after.cleared).toContain('3-3');
  expect(after.mapLinks).toContain('3-3>4-1');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, '138-hoshi-map-4-1.png') });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  console.log('smoke 3-3 full: cleared, chapter 3 ended');
  expect(errors).toEqual([]);
});

test('stage 3-3: the moon comes up when the countdown runs out (not the volcano), then more time', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchErrors(page);
  await page.addInitScript(
    ([key, save]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, save);
    },
    [KEY, JSON.stringify({ ...SAVE, resume: { stage: '3-3', mission: 2 } })] as const,
  );
  await page.goto('/?stage=3-3&go=1&resume=1');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ほしまつりに まにあえ', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlow(page, 'rocket');
  await pressOnGlow(page, 'whistle');
  await stopAt(page, 'main', 2710);
  await doors(page);
  await expect(app).toHaveAttribute('data-timer-state', 'run', { timeout: 150_000 });
  await waitDriving(page);
  // Standing still at the breakwater station: the time runs out.
  await expect(app).toHaveAttribute('data-timer-state', 'low', { timeout: 600_000 });
  await expect(app).toHaveAttribute('data-timeup', 'moon', { timeout: 300_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '139-hoshi-moon-up.png') });
  expect(await app.getAttribute('data-volcano-puffs')).toBeNull();
  await waitRewound(page, 'main', 2716);
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-timer', '85');
  expect(errors).toEqual([]);
});

// v1.11 (PR6b, PHASE9_CHAPTER5_6 第 2 部 M20): with the magnet light (5-3) a child comes back for the festival bell in the trench wall (M2: dive at the ring into the star trench).
test('stage 3-3 with the magnet light: festival-bell is pulled to the train', async ({ page }) => {
  test.setTimeout(900_000);
  await magnetRecordRun(
    page,
    {
      stage: '3-3',
      mission: 1,
      title: 'ほしの みぞ',
      record: 'festival-bell',
      hint: 'すきまに すず！ じしゃくライト！',
      riddle: 'かべの すきまで なにか ちりん…',
      cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2'],
      press: ['dive'],
      arrows: [],
      rail: 'main',
      latest: 1430,
      shot: 'magnet-festival-bell.png',
    },
    OUT,
  );
});
