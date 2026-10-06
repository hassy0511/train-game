import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budget,
  card,
  doors,
  FRONT,
  lightOnGlow,
  lightTo,
  NORMAL,
  pressOnGlowBefore,
  progress,
  recordLines,
  reverseIntoSiding,
  setDirection,
  setNotch,
  SLOW,
  standStill,
  STOP,
  stopAt,
  tapUntil,
  waitDriving,
  waitFront,
  waitReverseStop,
} from './drive';

/**
 * Stage 6-2 "つながったせかい" played through (docs/PHASE9_CHAPTER5_6.md 第 3 部 B15, read with §0 and PHASE9_0): the
 * headquarters' ring and its three gates, one a map page, each to a section of its own. M1 backs into the back platform
 * behind the headquarters (the switch glows, the rear window, Sakasa at the back, the siding picked from the start),
 * then the green gate (its fork chosen and glowing), the dino valley, the cloud islands' gap, the rocket slope, the
 * squirrel, もりの えき; M2 record ① in the big tree's hollow (the back siding, Sakasa's and the partner's lines at the
 * buffer), the blue gate, the driftwood dived under, みなとえき, record ② in the cove, the snow wall, the snowman,
 * ゆきの むらえき (the lantern); M3 the purple gate, the firefly wood with the light, おもちゃの えき, the toy-block bridge
 * with the magnet, Sakasa's den (record ③), home to ほんぶえき, the ending, the clear card's 「やったね！」; then (だいさん,
 * 2026-10-06) the ending movie 「せかいの わ」 the first time, and after its card the map with chapter 6's end (a card
 * only, the fanfare) and the title with every star and 「もういちど みる」.
 * A second test: M1 forgetting the back platform (Sakasa's step-0 line at hub 290), backing up into it from there, then
 * the wrong gate on purpose ("こっちの せかいも みて いこう！" once) and round the blue section back to the ring and the
 * green gate: never a fail.
 *
 * Built for about 10 fps software GL: presses that must land in a window are checked and made in the same page
 * callback (drive.ts); short states are kept by the page's own records.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3', '6-1'];
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
  '5-1>5-2',
  '5-2>5-3',
  'finale:4',
  'finale:5',
  '5-3>6-1',
  'finale:world',
  '6-1>6-2',
];
const EIGHT = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight', 'reverse'];

/** 6-2's places (scripts/layout-6-2.mjs). */
const HONBU = 45;
const URA = 90;
const GAP = 262;
const SLOPE = 480;
const SQUIRREL = 670;
const MORI = 760;
const P1_URA = 800;
const LOGS = [230, 270];
const MINATO = 320;
const P2_URA = 370;
const SNOW_WALL = 590;
const SNOWMAN = 700;
const YUKI = 790;
const FOG = 100;
const OMOCHA = 520;
const TOY_BRIDGE = 640;
const P3_URA = 760;
/** The whole train past a back siding's mouth (the front end 38 m on) and a little more. */
const PAST = 45;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function seedSave(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, done, links, abilities]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: done, abilities, records: [], mapLinks: links }));
    },
    [KEY, DONE, LINKS, EIGHT] as const,
  );
}

/**
 * Keeps in the page (window.__six2): the sections in turn, the gates gone through, the fails, the forks' preset arrows
 * and the back arrows' default (short states at 10 fps), Sakasa's lines.
 */
async function recordSix2(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const rec = { sections: [] as string[], portals: [] as string[], fails: [] as string[], presets: [] as string[], back: [] as string[], sakasa: [] as string[] };
    (window as unknown as { __six2: typeof rec }).__six2 = rec;
    let fails = 0;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d) return;
      if (d.section && rec.sections[rec.sections.length - 1] !== d.section) rec.sections.push(d.section);
      if (d.portal && rec.portals[rec.portals.length - 1] !== d.portal) rec.portals.push(d.portal);
      if (d.fails !== undefined && Number(d.fails) > fails) {
        fails = Number(d.fails);
        rec.fails.push(d.failReason ?? '');
      }
      const j = document.getElementById('junction');
      if (j && !j.hidden) {
        if (j.dataset.back === '1') {
          const def = j.querySelector<HTMLElement>('.arrow.is-default:not([hidden])')?.dataset.side ?? '';
          const key = `${d.backArrows}:${def}`;
          if (rec.back[rec.back.length - 1] !== key) rec.back.push(key);
        } else if (j.dataset.preset) {
          const key = `${d.rail}@${Math.round(Number(d.s))}:${j.dataset.preset}`;
          if (!rec.presets.some((p) => p.split(':')[1] === j.dataset.preset && p.split('@')[0] === d.rail && Math.abs(Number(p.split('@')[1].split(':')[0]) - Number(d.s)) < 80)) rec.presets.push(key);
        }
      }
      const b = document.getElementById('bubble');
      const line = b?.dataset.line;
      if (b && line && b.classList.contains('is-amanojaku') && rec.sakasa[rec.sakasa.length - 1] !== line) rec.sakasa.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-section', 'data-portal', 'data-fails', 'data-preset', 'data-back', 'hidden', 'data-line', 'data-s'] });
  });
}

type Six2 = { sections: string[]; portals: string[]; fails: string[]; presets: string[]; back: string[]; sakasa: string[] };
const six2 = (page: Page): Promise<Six2> => page.evaluate(() => (window as unknown as { __six2: Six2 }).__six2);

/**
 * The front at `at` on the ring `hub` coming round it again (s grows to 960 and starts at 0): waits until the front is
 * past `at` but no further than `within` m on (a plain waitFront would hold at once on the ring's far side).
 */
async function waitRingFront(page: Page, at: number, within = 120): Promise<void> {
  await page.waitForFunction(
    ([t, w]) => {
      const d = document.getElementById('app')?.dataset;
      const front = Number(d?.s) + 6;
      return d?.rail === 'hub' && front >= Number(t) && front <= Number(t) + Number(w);
    },
    [at, within] as const,
    { timeout: 240_000 },
  );
}

/** Stops at ほんぶえき coming round the ring (stopAt, with the ring's wrap in mind: slow from the ring's last 30 m). */
async function stopAtHonbu(page: Page): Promise<void> {
  await waitRingFront(page, 930, 40);
  await setNotch(page, SLOW);
  await waitRingFront(page, HONBU - 4.5, 30);
  await setNotch(page, STOP);
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
}

/** Taps the `side` arrow of the fork at `at` on `rail` once its arrows show (checked and tapped in the page). */
async function tapFork(page: Page, rail: string, at: number, side: 'left' | 'right'): Promise<void> {
  const tapped = await page.waitForFunction(
    ([r, t, sd]) => {
      const d = document.getElementById('app')?.dataset;
      const box = document.getElementById('junction');
      const b = box?.querySelector<HTMLElement>(`.arrow[data-side="${sd}"]`);
      const front = Number(d?.s) + 6;
      if (d?.rail !== r || front < Number(t) - 70 || front > Number(t)) return false;
      if (!box || box.hidden || box.dataset.back === '1' || !b || b.hidden) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    [rail, at, side] as const,
    { timeout: 240_000, polling: 'raf' },
  );
  expect(await tapped.jsonValue()).toBe(true);
}

test('stage 6-2 full run: the back platform, three gates, three back sidings, home to the headquarters; the ending movie; chapter 6 ends', async ({ page }) => {
  test.setTimeout(2_400_000);
  const errors = watchErrors(page);
  await seedSave(page);
  await recordSix2(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  const sw = page.locator('#reverse-switch');

  await page.goto('/?stage=6-2');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 120_000 });
  const loadMs = Number(await app.getAttribute('data-load-ms'));
  console.log(`6-2: ready in ${loadMs} ms (data-load-ms)`);
  expect(loadMs).toBeGreaterThan(0);
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'tsunagari', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-section', 'hub');
  await expect(app).toHaveAttribute('data-crew', 'sakasa');
  await expect(app).toHaveAttribute('data-sakasa', 'seat');

  // ---- The opening: the headquarters' town, the board's card ----
  await tapUntil(page, '#bubble:has-text("きょうは サカサも いっしょ")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '6-2-01-opening.png') });
  await card(page, 'つながった おいわい');
  await card(page, 'ミッション 1', 120_000);
  await waitDriving(page);
  await expect(app).toHaveAttribute('data-sections-ready', 'hub,p1,p2,p3', { timeout: 120_000 });

  // ---- M1 うしろむきの ホーム: past the mouth, the switch glows; back into the platform behind the headquarters ----
  await setNotch(page, NORMAL);
  await waitFront(page, 'hub', URA + 44);
  await standStill(page);
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await expect.poll(lines, { timeout: 30_000 }).toContain('うしろむきで はいる のだ！');
  await setDirection(page, 'back');
  await expect(app).toHaveAttribute('data-direction', '-1');
  await expect(app).toHaveAttribute('data-sakasa', 'rear');
  await expect(app).toHaveAttribute('data-camera', 'rear', { timeout: 10_000 });
  await setNotch(page, NORMAL);
  // The back arrows: the siding's (left) chosen from the start (the mission's default); nothing to tap.
  await expect(app).toHaveAttribute('data-tail-rail', 'hub-ura', { timeout: 120_000 });
  expect((await six2(page)).back).toContain('ura-guchi:left');
  await waitReverseStop(page, 'buffer');
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '6-2-rear.png') });
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator('.camera-tile[data-mode="side"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-camera', 'side');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '6-2-home.png') });
  await doors(page);
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await waitDriving(page);
  await setDirection(page, 'front');
  await expect(app).toHaveAttribute('data-sakasa', 'seat');
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator('.camera-tile[data-mode="chase"]').dispatchEvent('pointerdown');
  await setNotch(page, NORMAL);
  // The green gate: its fork chosen and glowing (step 1), through the white into the valley section.
  await expect(page.locator('#junction')).toHaveAttribute('data-preset', 'right', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-section', 'p1', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-portal', 'g1>p1');
  // Out of the cloud tunnel into the valley (the chase camera was inside the tunnel's cloud just after the white).
  await waitFront(page, 'p1', 80);
  await page.screenshot({ path: resolve(OUT, '6-2-gate.png') });
  await expect.poll(lines, { timeout: 20_000 }).toContain('わあっ、もんを くぐった！');
  // The cloud islands' gap: the jump; the rocket slope; the squirrel's nut.
  await pressOnGlowBefore(page, 'jump', 'p1', GAP);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '6-2-p1-jump.png') });
  await pressOnGlowBefore(page, 'rocket', 'p1', SLOPE);
  await waitFront(page, 'p1', SLOPE + 80);
  await pressOnGlowBefore(page, 'whistle', 'p1', SQUIRREL);
  await stopAt(page, 'p1', MORI);
  await doors(page);
  await card(page, 'できた');
  await tapUntil(page, '#bubble:has-text("さかさの ひょうしき、たのしかった")', 120_000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '6-2-p1-mori.png') });

  // ---- M2 うみと ゆきへ ----
  await card(page, 'ミッション 2', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Record ①: past the hidden siding's mouth, back into the big tree's hollow.
  await waitFront(page, 'p1', P1_URA + PAST);
  await standStill(page);
  await expect.poll(lines, { timeout: 30_000 }).toContain('ひみつの みちが ある のだ…');
  await reverseIntoSiding(page, 'right', 'p1-ura', 'swirl-acorn');
  await expect.poll(lines, { timeout: 30_000 }).toContain('ここ、おれの かくれば なのだ');
  await expect.poll(lines, { timeout: 30_000 }).toContain('どんぐりが ぐるぐる！');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '6-2-p1-ura.png') });
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  // Back to the ring, past the green gate (left now), the blue gate (right), the sea.
  await expect(app).toHaveAttribute('data-section', 'hub', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-section', 'p2', { timeout: 180_000 });
  await expect(app).toHaveAttribute('data-portal', 'g2>p2');
  await pressOnGlowBefore(page, 'dive', 'p2', LOGS[0]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '6-2-p2-sea.png') });
  await waitFront(page, 'p2', LOGS[0] + 15);
  await pressOnGlowBefore(page, 'dive', 'p2', LOGS[1]);
  await stopAt(page, 'p2', MINATO);
  await doors(page);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Record ②: the cove behind みなとえき.
  await waitFront(page, 'p2', P2_URA + PAST);
  await standStill(page);
  await reverseIntoSiding(page, 'left', 'p2-ura', 'left-shell');
  await expect.poll(lines, { timeout: 30_000 }).toContain('さかさまきの かい なのだ！');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '6-2-p2-ura.png') });
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  // The snow: the wall (the snowplow), the snowman (the whistle), ゆきの むらえき.
  await pressOnGlowBefore(page, 'plow', 'p2', SNOW_WALL);
  await expect.poll(async () => Number(await app.getAttribute('data-plow-bursts')), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await pressOnGlowBefore(page, 'whistle', 'p2', SNOWMAN);
  await expect(app).toHaveAttribute('data-actors', /yukidaruma:awake/, { timeout: 20_000 });
  await page.screenshot({ path: resolve(OUT, '6-2-p2-snow.png') });
  await stopAt(page, 'p2', YUKI);
  await doors(page);
  await card(page, 'できた');
  await tapUntil(page, '#bubble:has-text("あげる！")', 120_000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '6-2-p2-kamakura.png') });

  // ---- M3 みんなで ほんぶへ ----
  await card(page, 'ミッション 3', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-section', 'hub', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-section', 'p3', { timeout: 180_000 });
  await expect(app).toHaveAttribute('data-portal', 'g3>p3');
  await expect(app).toHaveAttribute('data-lighting', 'night');
  // The firefly wood: the light sees the way.
  await lightOnGlow(page, 'light', 'p3', FOG + 30);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '6-2-p3-fog.png') });
  await waitFront(page, 'p3', 370);
  await lightTo(page, 'off');
  await stopAt(page, 'p3', OMOCHA);
  await doors(page);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The toy-block bridge: the magnet pulls the missing block in.
  await lightOnGlow(page, 'magnet', 'p3', TOY_BRIDGE - 5);
  await expect(app).toHaveAttribute('data-magnet-tsumiki-hashi', 'open', { timeout: 60_000 });
  await lightTo(page, 'off');
  await page.screenshot({ path: resolve(OUT, '6-2-p3-bridge.png') });
  // Sakasa's den: record ③ and her test tag.
  await waitFront(page, 'p3', P3_URA + PAST);
  await standStill(page);
  await reverseIntoSiding(page, 'right', 'p3-ura', 'sakasa-tag');
  await expect.poll(lines, { timeout: 30_000 }).toContain('いまは たんけんたいの なかま なのだ！');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '6-2-p3-den.png') });
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  // Home: the purple gate's fork left this time, round to ほんぶえき, everyone off.
  await expect(app).toHaveAttribute('data-section', 'hub', { timeout: 120_000 });
  await stopAtHonbu(page);
  await doors(page);
  await card(page, 'できた', 60_000);

  // ---- The ending: everyone at the headquarters, "さようなら、なのだ！" ----
  await tapUntil(page, '#bubble:has-text("ワールドレール、ぜんぶ つながった")', 120_000);
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: resolve(OUT, '6-2-ending.png') });
  await tapUntil(page, '#card:has-text("クリア")', 120_000);
  await expect(page.locator('#card-button')).toHaveText('やったね！');
  const b = await budget(page);
  console.log(`6-2 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  const saidInStage = await lines();
  const rec = await six2(page);
  await page.waitForTimeout(1_000);
  await page.locator('#card-button').click();

  // ---- The ending movie the first time, then the map: chapter 6's end ----
  await expect(page).toHaveURL(/\?movie=ending&then=map/, { timeout: 30_000 });
  await expect(page.locator('#movie-play')).toBeVisible({ timeout: 120_000 });
  const saved = await progress(page);
  expect(saved.cleared).toContain('6-2');
  expect(saved.records).toEqual(expect.arrayContaining(['swirl-acorn', 'left-shell', 'sakasa-tag']));
  await page.locator('#movie-play').click();
  await expect(app).toHaveAttribute('data-movie-state', 'playing', { timeout: 30_000 });
  await page.waitForFunction(() => (document.getElementById('app')?.dataset.beats ?? '').split(',').includes('castle'), undefined, { timeout: 600_000, polling: 200 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: resolve(OUT, '6-2-movie-castle.png') });
  // (The automation is the owner's check: "▶▶" is there; a child's first time has none, movie.spec.ts.)
  await page.locator('#skip').dispatchEvent('pointerdown');
  await expect(page.locator('#card')).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: resolve(OUT, '6-2-movie-card.png') });
  await page.locator('#card-button').click();
  const map = page.locator('#map');
  await expect(map).toBeVisible({ timeout: 60_000 });
  await expect(map).toHaveAttribute('data-page', '3');
  await expect(page.locator('#card')).toContainText('6しょう クリア！', { timeout: 60_000 });
  await expect(page.locator('#card')).toContainText('まわったね！');
  await expect(page.locator('#card-button')).toHaveText('やったね！');
  await page.screenshot({ path: resolve(OUT, '6-2-finale6.png') });
  await page.locator('#card-button').click();
  await expect.poll(async () => (await progress(page)).mapLinks ?? [], { timeout: 10_000 }).toEqual(expect.arrayContaining(['finale:6', 'movie:ending']));
  await expect(page.locator('.map-island[data-island="6-2"]')).toHaveClass(/is-cleared/);
  await page.locator('#map-close').click();
  await expect(page.locator('#title-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#title-chapters')).toHaveText(/5しょう ★\s*6しょう ★/);
  await expect(page.locator('#title-movie')).toHaveText('もういちど みる');
  await page.screenshot({ path: resolve(OUT, '6-2-title.png') });

  // The lines along the way (the stage's, before the movie).
  for (const line of [
    'きょうは サカサも いっしょ！',
    'こんにちは、なのだ！',
    'しゅっぱつ なのだ！',
    'まずは ほんぶの うらの ホーム！',
    'うしろむきで はいる のだ！',
    'いっしょに よびに いこう！',
    'みどりの もんへ！',
    'のぼりざか！ ロケット！',
    'さかさの ひょうしき、たのしかった！',
    'よかったね、サカサ',
    'つぎは あおの もん！ うみと ゆき！',
    'あおの もんへ！',
    'ながれぎだ！ もぐって くぐろう',
    'うしろに いりえが ある のだ',
    'ほんとだ、ぎゃくに まいてる！',
    'ゆきの かべ！ ゆきかき！',
    'ちょうちん、かえす のだ',
    'あげる！ いっしょに もって いこう',
    'さいごは むらさきの もん！',
    'むらさきの もんへ！',
    'くらい… ライト！',
    'つみきが たりない！ じしゃく！',
    'おれの おしろ なのだ',
    'もう ひとりじゃ ない のだ',
    'うん！ みんな いっしょ！',
    'ひみつきちは うしろ なのだ！',
    '……しけんの ふだ なのだ',
    'ずっと もってたんだね',
    'みんな、ありがとう なのだ',
    'こんどは ただしい ひょうしき なのだ',
    'さようなら、なのだ！',
  ]) {
    expect(saidInStage, line).toContain(line);
  }
  // Not said: the back platform was not forgotten (M1 step 0 only), nor a wrong gate.
  expect(saidInStage).not.toContain('うしろの ホーム、わすれてる のだ！');
  expect(saidInStage).not.toContain('こっちの せかいも みて いこう！');
  // Sakasa's own lines are hers (the bubble's speaker).
  expect(rec.sakasa).toEqual(expect.arrayContaining(['うしろむきで はいる のだ！', 'ひみつの みちが ある のだ…', 'おれの おしろ なのだ', 'さようなら、なのだ！']));
  // Through the gates in order; the forks' arrows chosen from the start: green (M1 step 1), blue (M2), purple (M3).
  expect(rec.portals).toEqual(['g1>p1', 'p1>r1', 'g2>p2', 'p2>r2', 'g3>p3', 'p3>r3']);
  expect(rec.sections.filter((s, i, a) => s !== a[i - 1])).toEqual(['hub', 'p1', 'hub', 'p2', 'hub', 'p3', 'hub']);
  console.log(`6-2 presets: ${rec.presets.join(' ')}`);
  expect(rec.presets.some((p) => p.startsWith('hub@') && p.endsWith(':right'))).toBe(true);
  expect(rec.fails).toEqual([]);
  expect(errors).toEqual([]);
});

test('stage 6-2 M1 the other way: the back platform forgotten (Sakasa says so), backing up into it; then the wrong gate on purpose and round again, never a fail', async ({ page }) => {
  test.setTimeout(1_500_000);
  const errors = watchErrors(page);
  await seedSave(page);
  await recordSix2(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  await page.goto('/?stage=6-2&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 120_000 });
  await card(page, 'つながった おいわい', 180_000);
  await card(page, 'ミッション 1', 180_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // Past the mouth and on: the green gate's fork stays on the ring (step 0), and Sakasa: "わすれてる のだ！".
  await waitFront(page, 'hub', 300);
  await expect.poll(lines, { timeout: 30_000 }).toContain('うしろの ホーム、わすれてる のだ！');
  expect(await app.getAttribute('data-rail')).toBe('hub');
  await standStill(page);
  // Backing up along the way it came: the back arrows at the mouth take the siding (the mission's default).
  await setDirection(page, 'back');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-tail-rail', 'hub-ura', { timeout: 180_000 });
  await waitReverseStop(page, 'buffer');
  await doors(page);
  await waitDriving(page);
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  // Step 1: the green gate's fork is chosen; the child takes the ring instead, then the blue gate.
  await tapFork(page, 'hub', 220, 'left');
  await waitFront(page, 'hub', 240);
  expect(await app.getAttribute('data-rail')).toBe('hub');
  await tapFork(page, 'hub', 420, 'right');
  await expect(app).toHaveAttribute('data-section', 'p2', { timeout: 120_000 });
  await expect.poll(lines, { timeout: 30_000 }).toContain('こっちの せかいも みて いこう！');
  await page.screenshot({ path: resolve(OUT, '6-2-wrong-gate.png') });
  // Round the blue section (it is all there to play: dive, plow, whistle) and back to the ring.
  await pressOnGlowBefore(page, 'dive', 'p2', LOGS[0]);
  await waitFront(page, 'p2', LOGS[0] + 15);
  await pressOnGlowBefore(page, 'dive', 'p2', LOGS[1]);
  await pressOnGlowBefore(page, 'plow', 'p2', SNOW_WALL);
  await pressOnGlowBefore(page, 'whistle', 'p2', SNOWMAN);
  await expect(app).toHaveAttribute('data-section', 'hub', { timeout: 180_000 });
  // Round the ring to the green gate again (its fork chosen for step 1), into the valley.
  await expect(app).toHaveAttribute('data-section', 'p1', { timeout: 240_000 });
  const said = await lines();
  expect(said.split('\n').filter((l) => l === 'こっちの せかいも みて いこう！')).toHaveLength(1);
  const rec = await six2(page);
  expect(rec.portals).toEqual(['g2>p2', 'p2>r2', 'g1>p1']);
  expect(rec.fails).toEqual([]);
  expect(await app.getAttribute('data-fails')).toBeNull();
  expect(errors).toEqual([]);
});
