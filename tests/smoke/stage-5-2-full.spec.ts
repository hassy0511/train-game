import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budget,
  card,
  doors,
  FAST,
  NORMAL,
  pressOnGlow,
  pressOnGlowBefore,
  progress,
  recordLines,
  setNotch,
  stopAt,
  tapUntil,
  waitDriving,
  waitFront,
  waitRewound,
  lightOnGlow,
  waitCaught,
} from './drive';

/**
 * Stage 5-2 "おもちゃのまち" played through (docs/PHASE9_CHAPTER5_6.md 第 5 部 §15, read with §0 and PHASE9_0): the
 * opening (the child winds a chick with the whistle); M1 the reverse-wound chick walking back (wound on the glow), the
 * block gap A over the ball pit (a jump), the wind-up car let be on purpose (a soft stop, back 80 m, then wound), the
 * gold screw, three chicks wound by one whistle; M2 gap B, the side track that needs the magnet light (its arrow grey,
 * "じしゃくライトが あれば いけそう…"), the band let be (the train held softly behind it), wound, followed at "はやい" at the
 * band's pace with "ゆっくり" glowing, the glimpse of Sakasa with a block train; M3 the spinning fork let be (round the
 * loop, then it waits the good way and is stopped with the whistle), gap C at "はやい", the screw hill without the
 * rocket (a slip) and with it, the slide over the line below, the dark toy box (the light, the glowing marble), the
 * second spinning fork stopped on its glow; the ending (the castle's big key wound: the town turns round, the trumpet
 * player's line), the clear card, the map (island 5-2 cleared, "きろく 2/3 ？").
 *
 * The save seeded as a child who has cleared chapters 1–4 and 5-1 (5-1's stage is on another branch: 5-2 needs it
 * cleared). Built for about 10 fps software GL: presses that must land in a window are checked and made in the same
 * page callback; the short states are kept by a MutationObserver in the page (window.__toy) and read afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1'];
const LINKS = [
  '1-1>1-2',
  '1-2>1-3',
  '1-3>2-1',
  '2-1>2-2',
  '2-2>2-3',
  '2-3>1-1',
  '1-1>3-1',
  '3-1>3-2',
  '3-2>3-3',
  '3-3>4-1',
  '4-1>4-2',
  '4-2>4-3',
  '4-3>5-1',
  'finale:4',
];
/** The lever's "ゆっくり" and "びゅーん" (src/train/params.ts LEVER_NOTCHES). */
const SLOW_NOTCH = 2;

interface ToyLog {
  parade: string[];
  spins: string[];
  paradeMaxSpeed: number;
  paradeMinGap: number;
  leverHintSeen: number[];
  fails: { reason: string; soft: string; s: number }[];
  figures: string[];
  named: string[];
}

/** Keeps the short states in window.__toy (set up before the page loads). */
async function recordToys(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { parade: [] as string[], spins: [] as string[], paradeMaxSpeed: 0, paradeMinGap: 999, leverHintSeen: [] as number[], fails: [] as { reason: string; soft: string; s: number }[], figures: [] as string[], named: [] as string[] };
    (window as unknown as { __toy: typeof log }).__toy = log;
    const push = (list: string[], v: string | undefined): void => {
      if (v !== undefined && v !== '' && list[list.length - 1] !== v) list.push(v);
    };
    let fails = 0;
    new MutationObserver(() => {
      const app = document.getElementById('app');
      if (!app) return;
      const d = app.dataset;
      push(log.parade, d.parade);
      push(log.spins, d.spins);
      push(log.figures, d.cutsceneActors);
      if (d.parade === 'march' || d.parade === 'wait') {
        log.paradeMaxSpeed = Math.max(log.paradeMaxSpeed, Number(d.speed));
        if (d.paradeGap) log.paradeMinGap = Math.min(log.paradeMinGap, Number(d.paradeGap));
      }
      for (const el of document.querySelectorAll<HTMLElement>('.lever-detent[data-hint="1"]')) {
        const n = Number(el.dataset.notch);
        if (!log.leverHintSeen.includes(n)) log.leverHintSeen.push(n);
      }
      const n = Number(d.fails ?? 0);
      if (n > fails) {
        fails = n;
        log.fails.push({ reason: d.failReason ?? '', soft: d.failSoft ?? '', s: Number(d.s) + 6 });
      }
      const bubble = document.getElementById('bubble');
      if (bubble?.dataset.line) push(log.named, `${bubble.querySelector('.bubble-name')?.textContent ?? ''}|${bubble.dataset.line}`);
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-s', 'data-parade', 'data-spins', 'data-speed', 'data-hint', 'data-fails', 'data-cutscene-actors', 'data-line'],
    });
  });
}

function toys(page: Page): Promise<ToyLog> {
  return page.evaluate(() => (window as unknown as { __toy: ToyLog }).__toy);
}

/** A cutscene waits for the whistle: press it on its glow; the figure is wound. */
async function cutscenePress(page: Page, windups: number): Promise<void> {
  await tapUntil(page, '#app[data-cutscene-press="whistle"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, `5-2-press-${windups}.png`) });
  await pressOnGlow(page, 'whistle');
  await expect(page.locator('#app')).toHaveAttribute('data-windups', String(windups), { timeout: 20_000 });
}

/** Every visible round button is apart from the others (six with chapters 1–4's abilities). */
async function roundButtonsApart(page: Page): Promise<void> {
  const rounds = await page.locator('.action-buttons > .round-button:visible').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: Math.min(r.width, r.height) / 2 };
    }),
  );
  expect(rounds.map((r) => r.id).sort()).toEqual(['dive', 'jump', 'light', 'plow', 'rocket', 'whistle']);
  for (let i = 0; i < rounds.length; i++) {
    for (let j = i + 1; j < rounds.length; j++) {
      expect(Math.hypot(rounds[i].cx - rounds[j].cx, rounds[i].cy - rounds[j].cy)).toBeGreaterThanOrEqual(rounds[i].r + rounds[j].r - 0.5);
    }
  }
}

test('stage 5-2 full run: wind-up toys, the band, the spinning forks, the screw hill, the slide, the toy box, the castle', async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // A child who has come this far: chapters 1–4 and 5-1 cleared, chapter 4's end seen, six abilities.
  await page.addInitScript(
    ([key, done, links]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: done, abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'], records: [], mapLinks: links }));
    },
    [KEY, DONE, LINKS] as const,
  );
  const lines = await recordLines(page);
  await recordToys(page);

  await page.goto('/?stage=5-2');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '5-2-01-title.png') });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'omocha', { timeout: 30_000 });

  // ---- The opening: the chick on the platform wound with the whistle ----
  await cutscenePress(page, 1);
  await page.waitForTimeout(1_300);
  await page.screenshot({ path: resolve(OUT, '5-2-02-opening-wound.png') });
  await card(page, 'ミッション 1');
  await waitDriving(page);
  await roundButtonsApart(page);

  // ---- M1 ぎゃくまきを なおせ ----
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-actors', /hiyoko:walk/, { timeout: 60_000 });
  await page.screenshot({ path: resolve(OUT, '5-2-03-chick-walks-back.png') });
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-actors', /hiyoko:awake/, { timeout: 20_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '5-2-04-chick-wound.png') });
  // Gap A over the ball pit, at "ふつう" (the jump glows when it would clear it); seen from the side.
  await pressOnGlowBefore(page, 'jump', 'main', 336);
  await expect(app).toHaveAttribute('data-air', '1', { timeout: 5_000 });
  await page.screenshot({ path: resolve(OUT, '5-2-05-gap-a.png') });
  await waitFront(page, 'main', 360);
  // The wind-up car let be on purpose: a soft stop (no shake), back 80 m before it, and wound on the glow.
  await waitRewound(page, 'main', 575);
  const failCar = (await toys(page)).fails.at(-1);
  expect(failCar?.reason).toBe('cat');
  expect(failCar?.soft).toBe('1');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-actors', /kuruma:awake/, { timeout: 20_000 });
  // The gold screw on the short screw post (passed, found).
  await waitFront(page, 'main', 740);
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('gold-screw');
  // Three chicks walking together: one whistle winds all three.
  const before = Number(await app.getAttribute('data-windups'));
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-actors', /hiyoko-2:awake,hiyoko-3:awake,hiyoko-4:awake/, { timeout: 20_000 });
  await expect(app).toHaveAttribute('data-windups', String(before + 3));
  await page.screenshot({ path: resolve(OUT, '5-2-06-three-chicks.png') });
  await stopAt(page, 'main', 1090);
  await doors(page);
  await card(page, 'できた');

  // ---- M2 がくたいの パレード ----
  await card(page, 'ミッション 2');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlowBefore(page, 'jump', 'main', 1181);
  await waitFront(page, 'main', 1200);
  // The side track to the third record needs the magnet light: its arrow is grey; tapped, the partner says so.
  const right = page.locator('#junction .arrow[data-side="right"]');
  await expect(right).toBeVisible({ timeout: 60_000 });
  await expect(right).toHaveAttribute('data-needs', 'magnetLight');
  await expect(right).toHaveAttribute('data-locked', '1');
  await right.dispatchEvent('pointerdown');
  await waitFront(page, 'main', 1300);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // The band let be: it walks back towards the train, which is held softly behind it; the whistle glows.
  await page.waitForFunction(
    () => {
      const d = document.getElementById('app')?.dataset;
      return d?.paradeHeld === '1' && Math.abs(Number(d.speed)) < 0.3 && Number(d.paradeGap) >= 12;
    },
    undefined,
    { timeout: 180_000 },
  );
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1');
  await page.screenshot({ path: resolve(OUT, '5-2-07-band-backwards.png') });
  const failsBeforeBand = (await toys(page)).fails.length;
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-parade', /turn|march/, { timeout: 10_000 });
  await setNotch(page, FAST);
  await expect(app).toHaveAttribute('data-parade', 'march', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-camera', 'chase', { timeout: 20_000 });
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: resolve(OUT, '5-2-08-parade.png') });
  await expect(app).toHaveAttribute('data-parade', 'gone', { timeout: 120_000 });
  await setNotch(page, NORMAL);
  const band = await toys(page);
  expect(band.parade).toContain('turn');
  expect(band.parade).toContain('march');
  expect(band.paradeMaxSpeed).toBeLessThanOrEqual(5.6);
  expect(band.paradeMinGap).toBeGreaterThanOrEqual(11.5);
  expect(band.leverHintSeen).toContain(SLOW_NOTCH);
  expect(band.fails.length).toBe(failsBeforeBand);
  await stopAt(page, 'main', 1790);
  await doors(page);
  await card(page, 'できた');
  // The glimpse: Sakasa alone with a block train in the square, gone again ("こ、こんにちは〜！"); the train stays.
  await tapUntil(page, '#bubble:has-text("でんしゃ ごっこ")', 120_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.screenshot({ path: resolve(OUT, '5-2-09-glimpse.png') });

  // ---- M3 くるくる ポイント ----
  await card(page, 'ミッション 3');
  expect((await toys(page)).figures.some((f) => f.includes('sakasa'))).toBe(true);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The first spinning fork let be at "ふつう": round the loop (seen from above), then it waits the good way.
  await expect(app).toHaveAttribute('data-spins', /kuru-1:(stay-other|turn|stay-good)/, { timeout: 90_000 });
  await page.waitForFunction(() => /kuru-1:stay-good/.test(document.getElementById('app')?.dataset.spins ?? ''), undefined, { timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, '5-2-10-spin-good.png') });
  await expect(app).toHaveAttribute('data-spin-taken', /kuru-1:loop/, { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-rail', 'kuru-wa1');
  await expect(app).toHaveAttribute('data-camera', 'top', { timeout: 20_000 });
  await waitFront(page, 'main', 2025);
  await expect(app).toHaveAttribute('data-spins', /kuru-1:mercy/);
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-spins', /kuru-1:fixed/, { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-spin-taken', /kuru-1:loop,kuru-1:good/, { timeout: 60_000 });
  // Gap C at "はやい".
  await waitFront(page, 'main', 2090);
  await setNotch(page, FAST);
  await pressOnGlowBefore(page, 'jump', 'main', 2210);
  await waitFront(page, 'main', 2230);
  // The screw hill without the rocket: "ずるずる〜", back to 2300; then the rocket on its glow.
  await expect(app).toHaveAttribute('data-slip', '1', { timeout: 90_000 });
  await page.screenshot({ path: resolve(OUT, '5-2-11-screw-hill.png') });
  await waitRewound(page, 'main', 2305);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await pressOnGlow(page, 'rocket');
  await waitFront(page, 'main', 2440);
  // The slide: over the line below (main 2308) at main 2509.7, no fail.
  await expect(app).toHaveAttribute('data-slope', 'down', { timeout: 60_000 });
  await waitFront(page, 'main', 2506);
  await page.screenshot({ path: resolve(OUT, '5-2-12-slide-over.png') });
  const failsBeforeBox = (await toys(page)).fails.length;
  // The dark toy box: the light on its glow; the glowing marble in a corner.
  await pressOnGlow(page, 'light');
  await expect(app).toHaveAttribute('data-tunnel', '1', { timeout: 60_000 });
  await waitFront(page, 'main', 2700);
  await page.screenshot({ path: resolve(OUT, '5-2-13-toybox.png') });
  await waitFront(page, 'main', 2760);
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('glow-marble');
  // The second spinning fork, stopped on its glow (the light still on).
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-spins', /kuru-2:fixed/, { timeout: 10_000 });
  await page.screenshot({ path: resolve(OUT, '5-2-14-spin-fixed.png') });
  await expect(app).toHaveAttribute('data-spin-taken', /kuru-2:good/, { timeout: 60_000 });
  expect((await toys(page)).fails.length).toBe(failsBeforeBox);
  await stopAt(page, 'main', 3060);
  await doors(page);
  await card(page, 'できた');

  // ---- The ending: the castle's big key wound with the whistle; the town turns round; the band, the trumpet player ----
  await cutscenePress(page, Number(await app.getAttribute('data-windups')) + 1);
  await expect(app).toHaveAttribute('data-town', 'wound');
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await expect(page.locator('#reward-records .reward-record')).toHaveCount(3);
  await page.screenshot({ path: resolve(OUT, '5-2-15-clear.png') });

  const said = await lines();
  for (const line of [
    'ぜんまい、ぜんぶ ぎゃくまき！',
    'おもちゃが うしろに あるいてる〜',
    'ひよこさんが うしろあるき！ きてき！',
    'くるりん！ まえむきに なった！',
    'わわっ、くるまさん！',
    'ぶーん！ いって らっしゃい〜',
    '3ば いっぺんに くるりん！',
    'じしゃくライトが あれば いけそう…',
    'みぎの ほうで なにか きらっ…',
    'がくたいさんが うしろあるき〜！',
    'がくたいさんを きてきで まきなおそう',
    'くるりん！ ぱっぱかぱーん！',
    'パレードだ！ ゆっくり ついていこう',
    'ありがとう〜 がくたいさん！',
    'サカサも、でんしゃ ごっこ？',
    'こ、こんにちは〜！',
    'くるくる ポイント！ よく みてね',
    'あれれ、ぐるっと まわってる…',
    'ぴたっ！ とまった！',
    'ずるずる〜… のぼれなかった',
    'すべりだい〜！ しゅーっ！',
    'おもちゃばこだ！ ライトを つけよう',
    'あの こは、みんなと あそびたい だけ',
    'サカサ、ずっと ひとり だったんだ',
  ]) {
    expect(said, line).toContain(line);
  }
  expect((await toys(page)).named).toContain('おもちゃの ラッパふき|あの こは、みんなと あそびたい だけ');
  const b = await budget(page);
  console.log(`5-2 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();

  // ---- The map: page 3, island 5-2 cleared with two records of three (the third waits for the magnet light) ----
  const map = page.locator('#map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-page', '3', { timeout: 20_000 });
  const island = page.locator('.map-island[data-island="5-2"]');
  await expect(island).toHaveClass(/is-cleared/);
  await expect(island.locator('.map-badge')).toHaveText('きろく 2/3 ？');
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: resolve(OUT, '5-2-16-map.png') });
  const saved = await progress(page);
  expect(saved.cleared).toContain('5-2');
  expect(saved.records).toEqual(expect.arrayContaining(['gold-screw', 'glow-marble']));
  expect(saved.records).not.toContain('tin-key');
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  expect(errors).toEqual([]);
});

// v1.11 (PR6b, 第 5 部 §15 and 第 2 部 M20): with the magnet light (5-3) a child comes back to the shelf way: the block
// bridge forgotten once ("ぽよん", back to main 1230 before the fork), then pulled into place; the tin key on the shelf.
test('stage 5-2 with the magnet light: the block bridge on the shelf way (forgotten once), then the tin key', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(
    ([key, done]) => {
      localStorage.setItem(
        key,
        JSON.stringify({ schema: 1, cleared: [...done, '5-2'], abilities: ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'], records: [], mapLinks: [], resume: { stage: '5-2', mission: 1 } }),
      );
    },
    [KEY, DONE] as const,
  );
  const lines = await recordLines(page);
  await recordToys(page);
  const app = page.locator('#app');
  await page.goto('/?stage=5-2&go=1&resume=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'がくたいの パレード', 120_000);
  await waitDriving(page);
  await expect(page.locator('#light')).toHaveAttribute('data-light', 'off');
  await setNotch(page, NORMAL);
  await pressOnGlowBefore(page, 'jump', 'main', 1181);
  // The shelf way's arrow is not grey any more: tapped, the train goes up it.
  const right = page.locator('#junction .arrow[data-side="right"]');
  await expect(right).toBeVisible({ timeout: 90_000 });
  await expect(right).not.toHaveAttribute('data-locked', '1');
  await right.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'tana', { timeout: 60_000 });
  // The block bridge forgotten: "ぽよん" off it (a soft fail), back on main before the fork.
  await expect(app).toHaveAttribute('data-magnet-bumps', '1', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-fail-reason', 'magnet');
  await waitRewound(page, 'main', 1235);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await expect(right).toBeVisible({ timeout: 90_000 });
  await right.dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-rail', 'tana', { timeout: 60_000 });
  // Green: to the magnet; the blocks fly into the gap ("つながった！"), then the tin key flies over from the shelf.
  await lightOnGlow(page, 'magnet', 'tana', 75);
  await expect(app).toHaveAttribute('data-magnet-tsumiki-hashi', 'open', { timeout: 60_000 });
  await waitCaught(page, 'record:tin-key');
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'magnet-tin-key.png') });
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 30_000 }).toContain('tin-key');
  // The buffer puts the train back on main past the fork (no fail).
  await expect(app).toHaveAttribute('data-rail', 'main', { timeout: 180_000 });
  const said = await lines();
  for (const line of ['つみきが たりない！ ひっぱろう！', 'つながった！', 'たなの うえに ねじまき！ ひっぱろう！']) expect(said, line).toContain(line);
  expect(said).not.toContain('みぎの ほうで なにか きらっ…');
  expect(said).not.toContain('じしゃくライトが あれば いけそう…');
  expect((await toys(page)).fails.map((f) => f.reason)).toContain('magnet');
  expect(errors).toEqual([]);
});
