import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budget,
  card,
  lightOnGlow,
  lightTo,
  NORMAL,
  pressOnGlow,
  pressOnGlowBefore,
  pressWhen,
  progress,
  recordLines,
  reverseIntoSiding,
  setDirection,
  setNotch,
  SLOW,
  standStill,
  stopAt,
  tapUntil,
  waitDriving,
  waitFront,
  waitLead,
  waitRewound,
  waitWelcome,
} from './drive';

/**
 * Stage 6-1 "さかさまのしろ" played through (docs/PHASE9_CHAPTER5_6.md 第 7 部 §16.4, read with §0 and PHASE9_0): the
 * opening (the castle far off, the town upside down); M1 every ability once on something upside down (the chick
 * walking backwards wound with the whistle, the crossing put right by the magnet, the reversed sign left wrong on
 * purpose then seen through with the light, the waterfall flowing up the slope climbed with the rocket, record ② the
 * top pulled off the chimney, the snow piled upwards cleared, the upside-down bridge's cut jumped with record ①, the
 * umbrella boats dived under); the balcony; M2 the chase: "とまって" twice and Sakasa runs further, "ぎゃくだ！", the
 * train stops and うしろむき is learned there; backing up she turns round and follows (the view stays ahead on her),
 * the station opens; M3 the drawbridge put down by the magnet, the doors left open and Sakasa boards after a flinch
 * (a whistle while she walks); the ending ("…こんにちは", she joins, "ワンダーごう、しゅっぱつ！"), the clear card and
 * the map. A second test plays it again with うしろむき: record ③ at the end of the back siding behind the town.
 *
 * Built for about 10 fps software GL: presses that must land in a window are checked and made in the same page
 * callback (drive.ts); the short states (the dash, the turn, the beats, the flinch) are kept by the page's own
 * records and the data-* marks that only go up.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3'];
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
];
const SEVEN = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'];

/** 6-1's places (scripts/layout-6-1.mjs). */
const CHICK = 300;
const CROSSING = 490;
const SIGN = 720;
const SLOPE = 910;
const TOP = 1085;
const SNOW = 1190;
const GAP = 1330;
const KASA = [1670, 1712];
const TOKEI = 1860;
const HORIBATA = 470;
const DRAWBRIDGE = 62;
const OSHIRO = 145;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function seedSave(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([key, done, links, abilities, more]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: done, abilities, records: [], mapLinks: links, ...more }));
    },
    [KEY, DONE, LINKS, SEVEN, extra] as const,
  );
}

/** Keeps the lead's and the welcome's states in the page (window.__six): short ones are not missed at 10 fps. */
async function recordSix(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const six = { lead: [] as { t: number; lead: string; gap: number; direction: string; camera: string }[], welcome: [] as string[], fails: [] as string[] };
    (window as unknown as { __six: typeof six }).__six = six;
    let fails = 0;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d) return;
      const last = six.lead[six.lead.length - 1];
      if (d.lead && (!last || last.lead !== d.lead || last.direction !== d.direction || last.camera !== d.camera)) {
        six.lead.push({ t: Number(d.time), lead: d.lead, gap: Number(d.leadGap), direction: d.direction ?? '', camera: d.camera ?? '' });
      }
      if (d.welcome && six.welcome[six.welcome.length - 1] !== d.welcome) six.welcome.push(d.welcome);
      if (d.fails !== undefined && Number(d.fails) > fails) {
        fails = Number(d.fails);
        six.fails.push(d.failReason ?? '');
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-lead', 'data-direction', 'data-camera', 'data-welcome', 'data-fails'] });
  });
}

type Six = { lead: { t: number; lead: string; gap: number; direction: string; camera: string }[]; welcome: string[]; fails: string[] };
const six = (page: Page): Promise<Six> => page.evaluate(() => (window as unknown as { __six: Six }).__six);

test('stage 6-1 full run: every ability on the upside-down town, the chase where うしろむき is learned, waiting with the door open, Sakasa joins', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchErrors(page);
  await seedSave(page);
  await recordSix(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');

  await page.goto('/?stage=6-1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'shiro', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-lighting', 'day');

  // ---- The opening: the castle far off, the houses on their roofs ----
  await tapUntil(page, '#bubble:has-text("ここが サカサの おしろ")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '6-1-01-opening.png') });
  await card(page, 'ミッション 1');
  await waitDriving(page);
  await expect(page.locator('#reverse-switch')).toBeHidden();

  // ---- M1 ぎゃくのまち ----
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', 200);
  await page.screenshot({ path: resolve(OUT, '6-1-02-town.png') });
  // The chick walking backwards: the whistle on its glow winds it ("くるりん！").
  await pressOnGlowBefore(page, 'whistle', 'main', CHICK);
  await expect(app).toHaveAttribute('data-actors', /hiyoko:awake/, { timeout: 20_000 });
  await page.screenshot({ path: resolve(OUT, '6-1-03-chick.png') });
  // The upside-down crossing: green on the light button, the magnet step, the crossing put right.
  await lightOnGlow(page, 'magnet', 'main', CROSSING);
  await page.screenshot({ path: resolve(OUT, '6-1-04-crossing.png') });
  await expect(app).toHaveAttribute('data-magnet-fumikiri', 'open', { timeout: 60_000 });
  await lightTo(page, 'off');
  // The reversed sign left wrong on purpose (no light): the dead end, soft, back 80 m; then the light on its glow.
  await waitRewound(page, 'main', SIGN - 60);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await lightOnGlow(page, 'light', 'main', SIGN - 5);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '6-1-05-sign.png') });
  await waitFront(page, 'main', SIGN + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  await lightTo(page, 'off');
  // The waterfall flowing up the slope: the rocket on its glow.
  await pressOnGlowBefore(page, 'rocket', 'main', SLOPE);
  await waitFront(page, 'main', SLOPE + 30);
  await page.screenshot({ path: resolve(OUT, '6-1-06-falls.png') });
  // Record ②: the top spinning on its head, pulled off the chimney in the magnet step.
  await lightOnGlow(page, 'magnet', 'main', TOP - 12);
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('upside-top');
  await lightTo(page, 'off');
  // The snow piled upwards: the snowplow on its glow.
  await pressOnGlowBefore(page, 'plow', 'main', SNOW);
  await expect.poll(async () => Number(await app.getAttribute('data-plow-bursts')), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: resolve(OUT, '6-1-07-snow.png') });
  // The upside-down bridge's cut: the jump on its glow; record ① in the air.
  await pressOnGlowBefore(page, 'jump', 'main', GAP);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '6-1-08-jump.png') });
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('up-raindrop');
  // The upside-down pond: dive under both umbrella boats.
  await pressOnGlowBefore(page, 'dive', 'main', KASA[0]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '6-1-09-umbrella.png') });
  await waitFront(page, 'main', KASA[0] + 15);
  await pressOnGlowBefore(page, 'dive', 'main', KASA[1]);
  await waitFront(page, 'main', KASA[1] + 30);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await stopAt(page, 'main', TOKEI);
  await card(page, 'できた');
  // The balcony: Sakasa on top of the castle.
  await tapUntil(page, '#bubble:has-text("さようなら〜")', 120_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '6-1-10-balcony.png') });

  // ---- M2 おいかけっこ ----
  await card(page, 'ミッション 2', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await waitLead(page, 'tease', 120_000);
  await expect(app).toHaveAttribute('data-music', 'oikake', { timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: resolve(OUT, '6-1-11-chase.png') });
  await pressOnGlow(page, 'whistle', 60_000);
  await expect(app).toHaveAttribute('data-lead-calls', '1', { timeout: 10_000 });
  await waitLead(page, 'tease', 30_000);
  await pressOnGlow(page, 'whistle', 60_000);
  // "ぎゃくだ！": the train stops, the cutscene teaches うしろむき.
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('うしろむき うんてんを');
  await page.screenshot({ path: resolve(OUT, '6-1-12-learn-card.png') });
  await page.locator('#card-button').click();
  await tapUntil(page, '#app[data-inline-cutscene=""]', 60_000);
  await expect.poll(async () => (await progress(page)).abilities ?? [], { timeout: 20_000 }).toContain('reverse');
  await waitLead(page, 'backup', 30_000);
  const sw = page.locator('#reverse-switch');
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  // Backing up: she turns round and follows; the view stays ahead on her (lead.followCamera).
  await setDirection(page, 'back');
  await setNotch(page, SLOW);
  await waitLead(page, 'follow', 30_000);
  await expect(app).toHaveAttribute('data-camera-hold', 'lead', { timeout: 10_000 });
  await expect.poll(lines, { timeout: 10_000 }).toContain('ついて きた！');
  await waitLead(page, 'met', 60_000);
  await standStill(page);
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: resolve(OUT, '6-1-13-follow.png') });
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 5_000 });
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  await waitLead(page, 'gone', 120_000);
  await stopAt(page, 'wa', HORIBATA);
  await card(page, 'できた');
  // Sakasa sits on the castle station's bench, across the moat.
  await tapUntil(page, '#bubble:has-text("すわってる")', 120_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '6-1-14-bench.png') });
  const chase = await six(page);
  const follow = chase.lead.filter((r) => r.lead === 'follow');
  expect(follow.some((r) => r.direction === '-1' && r.camera === 'cab')).toBe(true);

  // ---- M3 のせてあげる ----
  await card(page, 'ミッション 3', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The fork to the island: its left arrow chosen and glowing from the start (the mission's default).
  await expect(page.locator('#junction')).toHaveAttribute('data-preset', 'left', { timeout: 180_000 });
  await lightOnGlow(page, 'magnet', 'shiro', DRAWBRIDGE - 5);
  await expect(app).toHaveAttribute('data-magnet-hanebashi', 'open', { timeout: 60_000 });
  await lightTo(page, 'off');
  await stopAt(page, 'shiro', OSHIRO);
  // The door left open; a whistle while she walks to it: she flinches back, then boards all the same.
  const door = page.locator('#door');
  await expect(door).toBeVisible({ timeout: 30_000 });
  await expect.poll(lines, { timeout: 20_000 }).toContain('ドアを あけて、まって みよう');
  await door.dispatchEvent('pointerdown');
  await expect(page.locator('#whistle')).toHaveAttribute('data-mark', 'hush', { timeout: 10_000 });
  await pressWhen(page, 'whistle', "d.welcome === 'walk'", 60_000);
  await expect(app).toHaveAttribute('data-welcome-flinches', '1', { timeout: 10_000 });
  await waitWelcome(page, 'peek', 60_000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '6-1-15-peek.png') });
  await waitWelcome(page, 'done', 60_000);
  const w = await six(page);
  expect(w.welcome.slice(0, 2)).toEqual(['ask', 'look']);
  expect(w.welcome).toContain('board');

  await card(page, 'できた', 60_000);

  // ---- The ending: "…こんにちは", she joins the team, the Wonder train sets off ----
  await tapUntil(page, '#card:has-text("にゅうたい")', 180_000);
  await page.locator('#card-button').click();
  await expect(app).toHaveAttribute('data-crew', 'sakasa', { timeout: 30_000 });
  await tapUntil(page, '#bubble:has-text("しゅっぱつ")', 120_000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '6-1-16-depart.png') });
  await expect(app).toHaveAttribute('data-depart', 'done', { timeout: 60_000 });
  await tapUntil(page, '#card:has-text("クリア")', 120_000);
  const b = await budget(page);
  console.log(`6-1 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();

  // ---- The map: page 3, the castle cleared ----
  const map = page.locator('#map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-page', '3', { timeout: 20_000 });
  await expect(page.locator('.map-island[data-island="6-1"]')).toHaveClass(/is-cleared/, { timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: resolve(OUT, '6-1-17-map.png') });
  const saved = await progress(page);
  expect(saved.cleared).toContain('6-1');
  expect(saved.abilities).toContain('reverse');
  expect(saved.records).toEqual(expect.arrayContaining(['up-raindrop', 'upside-top']));
  expect(saved.records).not.toContain('backward-book');
  // Chapter 6 is not over with 6-1 alone (6-2 comes later): no end saved.
  expect(saved.mapLinks).not.toContain('finale:6');
  const said = await lines();
  for (const line of [
    'まずは とけいだいえきまで！',
    'ピンクの ぐるぐる… なに？',
    'ひよこさんが うしろあるき！ きてき！',
    'ふみきりが さかさ！ じしゃく！',
    'ふみきり、なおった！',
    'いきどまり… ライトで みよう',
    'うえに ながれる たき！ ロケット！',
    'ゆきが うえに つもってる！',
    'ぜんぶの ちから、つかえたね！',
    'こんにちは〜！',
    'でた！ まてまて〜！',
    'ぎゃくだ！',
    'ほんとに ぎゃく だったんだ！',
    'まえに もどして えきへ！',
    'おしろの ほうへ いった…',
    'サカサ、ついて きて くれたね',
    'はしが おりた！ つながった！',
    'しーっ… なにも いわないで まとう',
    '…こんにちは',
    'ワンダーごう、しゅっぱつ！',
  ]) {
    expect(said, line).toContain(line);
  }
  expect((await six(page)).fails).toEqual(['deadEnd']);
  expect(errors).toEqual([]);
});

test('stage 6-1 again with うしろむき: the back siding behind the town and record ③ the book read from the back', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await seedSave(page, { cleared: [...DONE, '6-1'], abilities: [...SEVEN, 'reverse'], records: ['up-raindrop', 'upside-top'] });
  const lines = await recordLines(page);
  const app = page.locator('#app');
  await page.goto('/?stage=6-1&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  const skip = page.locator('#skip');
  await expect(skip).toBeVisible({ timeout: 30_000 });
  await skip.dispatchEvent('pointerdown');
  await card(page, 'ミッション 1');
  await waitDriving(page);
  await expect(page.locator('#reverse-switch')).toBeVisible();
  await setNotch(page, NORMAL);
  // The whole train past the siding's mouth (main 90; front end 128): stop, the switch glows.
  await waitFront(page, 'main', 132);
  await standStill(page);
  await expect.poll(lines, { timeout: 30_000 }).toContain('うしろに としょかんが ある！');
  await reverseIntoSiding(page, 'left', 'ura', 'backward-book');
  await expect.poll(lines, { timeout: 30_000 }).toContain('さかさまの としょかんだ！');
  await expect.poll(lines, { timeout: 30_000 }).toContain('えほんも うしろから よむの？');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '6-1-ura.png') });
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-rail', 'main', { timeout: 60_000 });
  await waitFront(page, 'main', 220);
  expect(await app.getAttribute('data-fails')).toBeNull();
  expect(errors).toEqual([]);
});
