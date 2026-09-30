import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { budget, card, doors, FAST, NORMAL, progress, recordLines, pressOnGlowBefore, pressOnGlow, setNotch, stopAt, tapUntil, waitDriving, waitFront, waitRewound } from './drive';

/**
 * Stage 3-2 "たきのかわ" from start to the map (docs/PHASE8_CHAPTER3_4.md 第 4 部 §15, read with §0.2): M1 bumps the raft
 * on purpose ("ぽよん"), dives under it, falls into the rapids on purpose, jumps them,
 * dives under the three lily pads one press each, finds the kingfisher's feather; M2 dives into the plunge pool,
 * slips on the underwater slope on purpose, climbs it with the rocket, gets the shower behind the falls, the glimpse;
 * M3 stops the ducks on purpose, takes the jade's side track and dives for it, goes the wrong way in the dark pond
 * once, then puts the reversed signs right with the light, is refused at the snow's side track; the crayon drawing,
 * and the map with 3-3 next. The budget (TECH_SPEC §6) holds all the way.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

test('stage 3-2 full run: dives, the rapids, the falls, the ducks, the pond, the drawing', async ({ page }) => {
  test.setTimeout(3_600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // A save that has come this far: chapters 1, 2 and 3-1 cleared, "もぐる" learned, the rails drawn.
  await page.addInitScript(() => {
    const key = 'train-game.progress.v1';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        schema: 1,
        cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1'],
        abilities: ['whistle', 'jump', 'light', 'rocket', 'dive'],
        records: [],
        mapLinks: ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1', '1-1>3-1'],
      }),
    );
  });
  const saidSoFar = await recordLines(page);

  await page.goto('/?stage=3-2');
  const app = page.locator('#app');
  const diveButton = page.locator('#dive');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'kawa');

  // ---- M1 ぴょこぴょこ もぐれ ----
  await card(page, 'ぴょこぴょこ もぐれ');
  // Five round buttons (whistle, jump, light, rocket, dive), each with its own face; the dive is not glowing yet.
  await expect(diveButton).toBeVisible();
  await expect(diveButton).toHaveAttribute('data-glow', '0');
  await expect(page.locator('.round-button:visible')).toHaveCount(5);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Water within 80 m ahead: the もぐる button lights up (hint); the jump stays the jump.
  await expect(app).toHaveAttribute('data-dive', 'near', { timeout: 150_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('もぐるが ひかった！');
  await page.screenshot({ path: resolve(OUT, '100-kawa-dive-button.png') });
  // The raft: on purpose not pressed — "ぽよん", back before it.
  await expect(app).toHaveAttribute('data-dive-bounces', '1', { timeout: 240_000 });
  await expect(app).toHaveAttribute('data-submerged', '0');
  await waitRewound(page, 'kawa', 236);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぽよん！ ぶつかっちゃった〜');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlowBefore(page, 'dive', 'kawa', 302);
  await expect(app).toHaveAttribute('data-diving', '1', { timeout: 5_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '101-under-the-raft.png') });
  await waitFront(page, 'kawa', 312);
  await expect(app).toHaveAttribute('data-dive-bounces', '1');
  console.log('3-2: bumped the raft once, then dived under it');

  // Off the water the hint is over ("ぷかっ！ つぎは ジャンプ！"). The rapids: on purpose not jumped — "ぽちゃん", back to 390.
  await expect(app).toHaveAttribute('data-dive', '', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-phase', 'failing', { timeout: 150_000 });
  await waitRewound(page, 'kawa', 396);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぽちゃん！ ジャンプで とびこえよう');
  expect(await saidSoFar()).toContain('ぷかっ！ つぎは ジャンプ！');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlowBefore(page, 'jump', 'kawa', 470);
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 5_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '102-rapids-jump.png') });
  await waitFront(page, 'kawa', 500);
  await expect(app).not.toHaveAttribute('data-phase', 'failing');
  console.log('3-2: fell at the rapids once, then jumped them');

  // The three lily pads: one press each (§0.2: diving many times).
  const dives = Number(await app.getAttribute('data-dives'));
  for (const at of [767, 883, 999]) {
    await pressOnGlowBefore(page, 'dive', 'kawa', at - 3);
    if (at === 883) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(OUT, '103-lily-pads.png') });
    }
    await waitFront(page, 'kawa', at + 8);
  }
  expect(Number(await app.getAttribute('data-dives'))).toBe(dives + 3);
  await expect(app).toHaveAttribute('data-dive-bounces', '1');
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 30_000 }).toContain('kingfisher-feather');
  console.log('3-2: dived under the three lily pads; the kingfisher feather');
  await stopAt(page, 'kawa', 1120);
  await doors(page);
  await card(page, 'できた');

  // ---- M2 たきのぼり ----
  await card(page, 'たきのぼり');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFront(page, 'kawa', 1300);
  await page.screenshot({ path: resolve(OUT, '104-falls-ahead.png') });
  // Into the plunge pool from the floating stretch: press when it glows.
  await pressOnGlowBefore(page, 'dive', 'kawa', 1472);
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-camera', 'chase');
  await page.screenshot({ path: resolve(OUT, '105-plunge-pool.png') });
  // The underwater slope: on purpose no rocket — "ずるずる", back under water with the dome on.
  await expect(app).toHaveAttribute('data-slip', '1', { timeout: 240_000 });
  await waitRewound(page, 'kawa', 1506);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ずるずる〜… のぼれなかった');
  await expect(app).toHaveAttribute('data-dive', 'on');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlow(page, 'rocket');
  await expect(app).toHaveAttribute('data-burn', '1', { timeout: 5_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '106-bubble-jet.png') });
  await waitFront(page, 'kawa', 1630);
  // Behind the falls: the shower on the roof.
  await expect(app).toHaveAttribute('data-shower', '1', { timeout: 150_000 });
  await page.screenshot({ path: resolve(OUT, '107-shower-cab-or-side.png') });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ぷはっ！ たきの うらがわだ！');
  await expect(app).toHaveAttribute('data-shower', '0', { timeout: 150_000 });
  console.log('3-2: slipped once, climbed with the rocket, the shower behind the falls');
  await stopAt(page, 'kawa', 1889.7);
  await doors(page);
  await card(page, 'できた');
  // The glimpse: Sakasa floats pink paper boats on the upper river.
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/, { timeout: 150_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '108-glimpse-boats.png') });
  await expect.poll(saidSoFar, { timeout: 90_000 }).toContain('いっちゃった… ふね、だれにかな？');

  // ---- M3 もりの いけの さかさ ふだ ----
  await card(page, 'さかさ ふだ', 120_000);
  await waitDriving(page);
  // The ducks: on purpose at はやい — the sudden stop, back to 1980.
  await setNotch(page, FAST);
  await expect(app).toHaveAttribute('data-phase', 'failing', { timeout: 240_000 });
  await page.screenshot({ path: resolve(OUT, '109-ducks.png') });
  await waitRewound(page, 'kawa', 1986);
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('びっくりした〜。ゆっくり いこう');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitFront(page, 'kawa', 2080);
  // The jade's side track (needs "もぐる"): take it, dive for the jade, back from its buffer.
  await expect(page.locator('#junction')).toBeVisible({ timeout: 150_000 });
  await page.locator('.arrow[data-side="right"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'fuchi', { timeout: 150_000 });
  await pressOnGlowBefore(page, 'dive', 'fuchi', 110);
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 30_000 }).toContain('river-jade');
  await page.screenshot({ path: resolve(OUT, '110-jade.png') });
  await expect(app).toHaveAttribute('data-phase', 'failing', { timeout: 240_000 });
  await waitRewound(page, 'kawa', 2186);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  console.log('3-2: the ducks once, the jade on the side track');

  // The forest pond, the light off: the reversed sign sends the train into the weeds (a soft stop, back before it).
  await pressOnGlowBefore(page, 'dive', 'kawa', 2472);
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-rail', 'dead-1', { timeout: 150_000 });
  await expect(app).toHaveAttribute('data-phase', 'failing', { timeout: 150_000 });
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('みずくさで いきどまり！ ライト！');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlowBefore(page, 'dive', 'kawa', 2472);
  await page.locator('#light').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-submerged', '1', { timeout: 90_000 });
  await waitFront(page, 'kawa', 2462);
  await page.screenshot({ path: resolve(OUT, '111-pond-light.png') });
  await expect.poll(saidSoFar, { timeout: 60_000 }).toContain('なおった！ こっちが ほんとう！');
  await waitFront(page, 'kawa', 2520);
  await expect(app).toHaveAttribute('data-rail', 'kawa');
  await waitFront(page, 'kawa', 2630);
  await expect(app).toHaveAttribute('data-rail', 'kawa');
  await page.locator('#light').dispatchEvent('pointerdown');
  console.log('3-2: the dead end once, then the light put both signs right');
  // The snow's side track needs the snowplow (chapter 4): grey, and the partner says so.
  await expect(page.locator('#junction')).toBeVisible({ timeout: 240_000 });
  await page.locator('.arrow[data-side="left"]').dispatchEvent('pointerdown');
  await expect.poll(saidSoFar, { timeout: 30_000 }).toContain('ゆきを どかせたら いけそう…');
  await waitFront(page, 'kawa', 2800);
  await expect(app).toHaveAttribute('data-rail', 'kawa');
  await stopAt(page, 'kawa', 2922);
  await card(page, 'できた');

  // ---- The ending: the paper boat, the crayon drawing on its sail ----
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toHaveClass(/is-drawing/);
  await expect(page.locator('#card svg.card-drawing')).toHaveCount(1);
  await expect(page.locator('#card h1')).toHaveText('ふねに えが かいてある');
  await page.screenshot({ path: resolve(OUT, '112-drawing.png') });
  await page.locator('#card-button').click();
  await tapUntil(page, '#card', 90_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await page.screenshot({ path: resolve(OUT, '113-clear.png') });

  const saved = await progress(page);
  expect(saved.records).toEqual(expect.arrayContaining(['kingfisher-feather', 'river-jade']));
  expect(saved.records).not.toContain('snow-bud');
  const b = await budget(page);
  console.log(`3-2 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#map')).toHaveAttribute('data-page', '2', { timeout: 20_000 });
  await expect(page.locator('.map-island[data-island="3-3"]')).toHaveClass(/is-next/, { timeout: 20_000 });
  expect((await progress(page)).cleared).toContain('3-2');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, '114-map.png') });
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  console.log('smoke 3-2 full: cleared');
  expect(errors).toEqual([]);
});
