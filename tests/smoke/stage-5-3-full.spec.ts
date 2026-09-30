import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  budget,
  card,
  doors,
  FAST,
  FRONT,
  lightOnGlow,
  lightTo,
  NORMAL,
  pressOnGlow,
  pressOnGlowBefore,
  progress,
  recordLines,
  setNotch,
  stopAt,
  tapUntil,
  waitCaught,
  waitDriving,
  waitFront,
} from './drive';

/**
 * Stage 5-3 "かがみのせかい" played through (docs/PHASE9_CHAPTER5_6.md 第 6 部 §17, read with §0 and PHASE9_0): the
 * opening teaches the magnet light (its card, then the light button glowing green: one press and the star on the mirror
 * shelf flies over); M1 in the magnet step the whole way (the two stars pulled without a glow, the glass bridge, the
 * parted rail pulled into place, "かがみの なか" 1 with record ①); M2 the first phantom fork seen through with the light
 * (the button glows yellow in the magnet step), the iron door, record ② the hand mirror pulled off its tall shelf, the
 * second phantom fork left to the false way on purpose (the soft cushion, back 80 m, the light glows), the glimpse (Sakasa
 * looking away, the mirror Sakasa waving with hearts round her); M3 the whistle gate not whistled on purpose (bounced off
 * and held, never a fail), "かがみの なか" 2 and its star, the phantom bridge jumped at "はやい", the turned-away mirror
 * turned round by the magnet (its fork shows no arrows); the ending (the mirror Sakasa: "ほんとうは のりたい" with a
 * picture, the big mirror turned over and never broken, the notes held up to a mirror read "のせて", "5しょう おしまい！"),
 * the clear card and the map.
 *
 * The save is a child who has cleared chapters 1–4, 5-1 and 5-2 (six abilities). Built for about 10 fps software GL:
 * presses that must land in a window are checked and made in the same page callback (drive.ts); the short states (the
 * shimmer, a phantom's pop, the gate's bounce, the fails, the arrows by the turned-away mirror's fork) are kept by a
 * MutationObserver in the page (window.__mirror) and looked at afterwards.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2'];
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
  'finale:4',
];
const SIX = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'];

/** 5-3's places (main s; scripts/layout-5-3.mjs). */
const GLASS = { from: 470, to: 530 };
const FLIP1 = { from: 840, to: 1060 };
const KIRAKIRA = 1250;
const J1 = 1500;
const J2 = 2000;
const MEIRO = 2250;
const FLIP2 = { from: 2400, to: 2640 };
const GAP = { from: 2800, to: 2806 };
const J3 = 3100;
const OOGAGAMI = 3500;

interface MirrorLog {
  log: { t: number; kind: string; id: string; s: number }[];
  shimmers: number;
  glassFrom: number;
  glassTo: number;
  fails: { reason: string; soft: string; rail: string; s: number }[];
  failing: { rail: string; s: number }[];
  /** #junction shown with the front on main between these (the turned-away mirror's fork). */
  arrowsNearTurn: number[];
  /** #light glowing yellow ("light") there. */
  yellowNearTurn: number[];
  named: string[];
  icons: string[];
  figures: string[];
}

/** Keeps the short states in window.__mirror (set up before the page loads). */
async function recordMirror(page: Page): Promise<void> {
  await page.addInitScript(
    ([turnFrom, turnTo]) => {
      const m = {
        log: [] as { t: number; kind: string; id: string; s: number }[],
        shimmers: 0,
        glassFrom: Infinity,
        glassTo: -Infinity,
        fails: [] as { reason: string; soft: string; rail: string; s: number }[],
        failing: [] as { rail: string; s: number }[],
        arrowsNearTurn: [] as number[],
        yellowNearTurn: [] as number[],
        named: [] as string[],
        icons: [] as string[],
        figures: [] as string[],
      };
      (window as unknown as { __mirror: typeof m }).__mirror = m;
      let flips = 0;
      let bumps = 0;
      let flip = '';
      let gate = '';
      let facing = '';
      let fails = 0;
      let shimmerOn = false;
      const phantoms = new Map<string, string>();
      const push = (list: string[], v: string | undefined): void => {
        if (v !== undefined && v !== '' && list[list.length - 1] !== v) list.push(v);
      };
      new MutationObserver(() => {
        const app = document.getElementById('app');
        if (!app) return;
        const d = app.dataset;
        const t = Number(d.time);
        const s = Number(d.s) + 6;
        const add = (kind: string, id = ''): void => {
          m.log.push({ t, kind, id, s });
        };
        if (d.flips !== undefined && Number(d.flips) > flips) {
          flips = Number(d.flips);
          add('flip-in');
        }
        if (flip === '1' && d.flip === '') add('flip-out');
        flip = d.flip ?? '';
        if (gate === 'shut' && d.flipGate === 'open') add('gate-open');
        gate = d.flipGate ?? '';
        if (d.gateBumps !== undefined && Number(d.gateBumps) > bumps) {
          bumps = Number(d.gateBumps);
          add('gate-bump');
        }
        for (const entry of (d.phantoms ?? '').split(',')) {
          const k = entry.lastIndexOf(':');
          if (k < 0) continue;
          const id = entry.slice(0, k);
          const state = entry.slice(k + 1);
          if (phantoms.get(id) !== state && state !== 'solid') add(`phantom-${state === 'gone' ? 'gone' : 'fall'}`, id);
          phantoms.set(id, state);
        }
        if ((d.mirrorFacing ?? '') !== facing) {
          facing = d.mirrorFacing ?? '';
          add('mirror-facing', facing);
        }
        if (d.glass === '1' && d.rail === 'main') {
          m.glassFrom = Math.min(m.glassFrom, s);
          m.glassTo = Math.max(m.glassTo, s);
        }
        const on = document.getElementById('mirror-fade')?.classList.contains('is-on') ?? false;
        if (on && !shimmerOn) m.shimmers += 1;
        shimmerOn = on;
        const n = Number(d.fails ?? 0);
        if (n > fails) {
          fails = n;
          m.fails.push({ reason: d.failReason ?? '', soft: d.failSoft ?? '', rail: d.rail ?? '', s });
        }
        if (d.phase === 'failing' && d.rail) m.failing.push({ rail: d.rail, s: Number(d.s) });
        if (d.rail === 'main' && s >= Number(turnFrom) && s <= Number(turnTo) && d.phase === 'driving') {
          const box = document.getElementById('junction');
          if (box && !box.hidden && box.offsetParent !== null) m.arrowsNearTurn.push(s);
          const light = document.getElementById('light');
          if (light?.dataset.glow === '1' && light.dataset.glowFor === 'light') m.yellowNearTurn.push(s);
        }
        const bubble = document.getElementById('bubble');
        if (bubble?.dataset.line) {
          push(m.named, `${bubble.querySelector('.bubble-name')?.textContent ?? ''}|${bubble.dataset.line}`);
          if (bubble.dataset.icon) push(m.icons, `${bubble.dataset.icon}|${bubble.dataset.line}`);
        }
        push(m.figures, d.cutsceneActors);
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-s', 'data-flips', 'data-flip', 'data-flip-gate', 'data-gate-bumps', 'data-phantoms', 'data-mirror-facing', 'data-glass', 'class', 'data-phase', 'data-fails', 'data-line', 'data-cutscene-actors', 'data-glow', 'hidden'],
      });
    },
    [2990, J3] as const,
  );
}

function mirrorLog(page: Page): Promise<MirrorLog> {
  return page.evaluate(() => (window as unknown as { __mirror: MirrorLog }).__mirror);
}

/** A fail: the train is put back on `rail` with its front before `below` (seen while failing), then driving again. */
async function waitRewound(page: Page, rail: string, below: number): Promise<void> {
  await page.waitForFunction(
    ([r, t]) => (window as unknown as { __mirror: MirrorLog }).__mirror.failing.some((f) => f.rail === r && f.s < Number(t)),
    [rail, below - FRONT] as const,
    { timeout: 180_000 },
  );
  await waitDriving(page);
  await page.evaluate(() => {
    (window as unknown as { __mirror: MirrorLog }).__mirror.failing.length = 0;
  });
}

/** Every visible round button is apart from the others (six: the magnet is the light button's third step). */
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
  await expect(page.locator('#jump')).not.toHaveAttribute('data-block', /.+/);
}

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
    [KEY, DONE, LINKS, SIX, extra] as const,
  );
}

test('stage 5-3 full run: the magnet light learned, the mirror world, phantoms, the whistle gate, the turned-away mirror, the mirror Sakasa', async ({ page }) => {
  test.setTimeout(1_500_000);
  const errors = watchErrors(page);
  await seedSave(page);
  const lines = await recordLines(page);
  await recordMirror(page);

  await page.goto('/?stage=5-3');
  const app = page.locator('#app');
  const light = page.locator('#light');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await page.locator('#title-start').click();
  await expect(app).toHaveAttribute('data-music', 'kagami', { timeout: 30_000 });

  // ---- The opening: the mirror m-start with the train in it; the magnet light learned; its first go ----
  await tapUntil(page, '#bubble:has-text("かがみの せかいだ")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '5-3-01-opening-mirror.png') });
  await card(page, 'じしゃくライト');
  await expect.poll(async () => (await progress(page)).abilities ?? [], { timeout: 30_000 }).toContain('magnetLight');
  await page.waitForFunction(() => document.getElementById('app')?.dataset.cutscenePress === 'magnet', undefined, { timeout: 90_000 });
  await expect(light).toHaveAttribute('data-light', 'light');
  await expect(light).toHaveAttribute('data-glow-for', 'magnet');
  await expect(light).toHaveAttribute('data-steps', '3');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '5-3-02-magnet-button.png') });
  await light.dispatchEvent('pointerdown');
  await page.waitForFunction(() => !(document.getElementById('app')?.dataset.cutsceneActors ?? '').includes('tut-star'), undefined, { timeout: 30_000 });
  await expect(light).toHaveAttribute('data-light', 'magnet');
  await card(page, 'ミッション 1');
  await waitDriving(page);
  await roundButtonsApart(page);

  // ---- M1 じしゃくで つなごう: in the magnet step all the way ----
  await setNotch(page, NORMAL);
  await waitCaught(page, 'hoshi-1');
  await waitCaught(page, 'hoshi-2');
  // The glass bridge: see-through here, plain rails in the mirror m-glass.
  await waitFront(page, 'main', GLASS.from + 20);
  await page.screenshot({ path: resolve(OUT, '5-3-03-glass.png') });
  await waitFront(page, 'main', GLASS.to + 5);
  // The parted rail, pulled into place (seen from behind).
  await expect(app).toHaveAttribute('data-magnet-hanare-1', 'open', { timeout: 120_000 });
  await waitFront(page, 'main', 655);
  await page.screenshot({ path: resolve(OUT, '5-3-04-parted-rail.png') });
  // "かがみの なか" 1 through the gate that opens by itself; record ① readable inside.
  await expect(app).toHaveAttribute('data-flip', '1', { timeout: 120_000 });
  await waitFront(page, 'main', 950);
  await page.screenshot({ path: resolve(OUT, '5-3-05-mirror-world-1.png') });
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('kagami-kanban');
  await waitFront(page, 'main', FLIP1.to + 10);
  await expect(app).toHaveAttribute('data-flip', '');
  let m = await mirrorLog(page);
  expect(m.glassFrom).toBeGreaterThanOrEqual(GLASS.from - 1.5);
  expect(m.glassTo).toBeLessThanOrEqual(GLASS.to + 1.5);
  expect(m.fails).toEqual([]);
  expect(m.log.filter((e) => e.kind === 'flip-in')).toHaveLength(1);
  // A repair: nobody gets on or off (no doors).
  await stopAt(page, 'main', KIRAKIRA);
  await card(page, 'できた');

  // ---- M2 まぼろしの みち ----
  await card(page, 'ミッション 2');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The first phantom fork: in the magnet step the light button glows yellow (the light helps here); twice to the light.
  await lightOnGlow(page, 'light', 'main', J1 - 45);
  await expect(app).toHaveAttribute('data-phantoms', /j-kagami1:gone/, { timeout: 60_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '5-3-06-phantom-pop.png') });
  await waitFront(page, 'main', J1 + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // The iron door: green, one press from the light to the magnet; it slides open. Then the hand mirror on its shelf.
  await lightOnGlow(page, 'magnet', 'main', 1640);
  await expect(app).toHaveAttribute('data-magnet-tobira-1', 'open', { timeout: 60_000 });
  await waitFront(page, 'main', 1690);
  await page.screenshot({ path: resolve(OUT, '5-3-07-iron-door.png') });
  await waitCaught(page, 'record:hand-mirror');
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 30_000 }).toContain('hand-mirror');
  // The second phantom fork left be on purpose, the light off: the false way, the cushion, back 80 m; then the light.
  await waitFront(page, 'main', 1880);
  await lightTo(page, 'off');
  await expect(app).toHaveAttribute('data-rail', 'kagami2', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-fail-reason', 'deadEnd', { timeout: 120_000 });
  await page.screenshot({ path: resolve(OUT, '5-3-08-phantom-cushion.png') });
  await waitRewound(page, 'main', J2 - 70);
  await setNotch(page, NORMAL);
  await lightOnGlow(page, 'light', 'main', J2 - 45);
  await expect(app).toHaveAttribute('data-phantoms', /j-kagami2:gone/, { timeout: 60_000 });
  await waitFront(page, 'main', J2 + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  await stopAt(page, 'main', MEIRO);
  await doors(page);
  await card(page, 'できた');
  // The glimpse: Sakasa looking away, the mirror Sakasa waving in m-meiro with hearts and stars round her.
  await tapUntil(page, '#bubble:has-text("にこにこ")', 120_000);
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa-mirror/);
  await expect(app).toHaveAttribute('data-cutscene-actors', /(^|,)sakasa(,|$)/);
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: resolve(OUT, '5-3-09-glimpse.png') });

  // ---- M3 かがみの なかへ ----
  await card(page, 'ミッション 3');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  // The whistle gate not whistled on purpose: bounced off, held before it (not a fail); then the whistle on its glow.
  const failsBeforeGate = (await mirrorLog(page)).fails.length;
  await expect(app).toHaveAttribute('data-gate-bumps', '1', { timeout: 180_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '5-3-10-gate-bump.png') });
  expect(Number(await app.getAttribute('data-s')) + FRONT).toBeLessThanOrEqual(FLIP2.from - 4 + 0.6);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-flip-gate', 'open', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-flip', '1', { timeout: 60_000 });
  expect((await mirrorLog(page)).fails.length).toBe(failsBeforeGate);
  // Its star inside: green (the light was left on), one press to the magnet.
  await lightOnGlow(page, 'magnet', 'main', 2500);
  await waitCaught(page, 'hoshi-3');
  await waitFront(page, 'main', FLIP2.to + 10);
  await expect(app).toHaveAttribute('data-flip', '');
  // The phantom bridge: "はやい", the jump when it glows (it clears the cut); the false bridge pops at take-off.
  await setNotch(page, FAST);
  await pressOnGlowBefore(page, 'jump', 'main', GAP.from);
  await waitFront(page, 'main', GAP.to + 20);
  await setNotch(page, NORMAL);
  m = await mirrorLog(page);
  expect(m.fails.length).toBe(failsBeforeGate);
  expect(m.log.some((e) => e.kind === 'phantom-gone' && e.id === 'gap:main:2800')).toBe(true);
  // The turned-away mirror: still in the magnet step, pulled round as the train comes ("くるっ"); the fork takes the
  // true way. No arrows by that fork, and no yellow glow.
  await expect(app).toHaveAttribute('data-mirror-facing', /m-turn:front/, { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-magnet-kurutto', 'open');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '5-3-11-turned-mirror.png') });
  await expect(app).toHaveAttribute('data-phantoms', /j-kagami3:gone/, { timeout: 60_000 });
  await waitFront(page, 'main', J3 + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  m = await mirrorLog(page);
  expect(m.arrowsNearTurn).toEqual([]);
  expect(m.yellowNearTurn).toEqual([]);
  expect(m.fails.length).toBe(failsBeforeGate);
  await stopAt(page, 'main', OOGAGAMI);
  await doors(page);
  await card(page, 'できた');

  // ---- The ending: the mirror Sakasa's wish; the big mirror turned over; the notes in the platform's mirror ----
  await tapUntil(page, '#bubble:has-text("ほんとうは のりたい")', 120_000);
  await expect(page.locator('#bubble')).toHaveAttribute('data-icon', 'ride');
  await expect(page.locator('#bubble .bubble-name')).toHaveText('かがみの サカサ');
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa-mirror/);
  await expect(app).toHaveAttribute('data-ambience', '');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '5-3-12-mirror-sakasa.png') });
  await tapUntil(page, '#card.is-reflect', 120_000);
  await expect(app).toHaveAttribute('data-mirror-facing', /m-oo:back/);
  await expect(page.locator('#card.is-reflect h1')).toHaveText('のせて');
  await expect(page.locator('#card-button')).toHaveText('うん');
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: resolve(OUT, '5-3-13-nosete.png') });
  await page.locator('#card-button').click();
  await card(page, '5しょう おしまい！');
  await tapUntil(page, '#card', 120_000);
  await expect(page.locator('#card')).toContainText('クリア');
  await expect(page.locator('#reward-records .reward-record')).toHaveCount(3);
  await page.screenshot({ path: resolve(OUT, '5-3-14-clear.png') });

  const said = await lines();
  for (const line of [
    'わあ… かがみの せかいだ！',
    'ライトに じしゃくを つけた！',
    'おす たびに ライト、じしゃく、けす',
    'くっついた！ じしゃくライト！',
    'みどりに ひかったら じしゃくだよ',
    'あれ？ せんろが すけてる…',
    'かがみを みて！ ちゃんと ある！',
    'かがみに うつる せんろが ほんもの！',
    'つながった！',
    'かがみの なかに はいった！',
    'ぜんぶ はんたい！',
    'あっ！ かんばんが よめる！',
    'もどって きた！',
    'つなげた！ じしゃく じょうず！',
    'まぼろし だった！ こっちが ほんもの！',
    'あいた！',
    'あれ？ かがみに せんろが ない！',
    'まぼろし だった〜！',
    'かがみを みてね',
    'ふたりとも のせた！',
    'わあ！ かがみの サカサ、にこにこ！',
    'サカサ、てれてる みたい',
    'かがみの もん！ きてきで あいずだ！',
    'ぽよん！ かがみが かたい〜',
    'きてきで あいず しよう！',
    'かがみが ぷるん！ はいれる！',
    'かがみを みて！ きれてる！',
    'くるっ！ ほんとうの みちが みえた！',
    'かがみに ひみつの せんろ…？',
    'とどいた！',
    'サカサの きもち…！',
    'のせて… だったんだ！',
    'たんけんたいに はいりたかったんだね',
  ]) {
    expect(said, line).toContain(line);
  }
  m = await mirrorLog(page);
  expect(m.named).toContain('かがみの サカサ|ほんとうは のりたい');
  expect(m.icons).toContain('ride|ほんとうは のりたい');
  expect(m.figures.some((f) => f.includes('sakasa-mirror'))).toBe(true);
  expect(m.fails.map((f) => f.reason)).toEqual(['deadEnd']);
  expect(m.shimmers).toBeGreaterThanOrEqual(4);
  const b = await budget(page);
  console.log(`5-3 budget: draw calls ${b.draws} / 200, triangles ${b.tris} / 100000`);
  expect(b.draws).toBeLessThanOrEqual(200);
  expect(b.tris).toBeLessThanOrEqual(100000);
  await page.locator('#card-button').click();

  // ---- The map: page 3, island 5-3 cleared, two records of three (the third waits for "うしろむき") ----
  const map = page.locator('#map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute('data-page', '3', { timeout: 20_000 });
  const island = page.locator('.map-island[data-island="5-3"]');
  await expect(island).toHaveClass(/is-cleared/, { timeout: 30_000 });
  await expect(island.locator('.map-badge')).toHaveText('きろく 2/3 ？');
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: resolve(OUT, '5-3-15-map.png') });
  const saved = await progress(page);
  expect(saved.cleared).toContain('5-3');
  expect(saved.abilities).toContain('magnetLight');
  expect(saved.records).toEqual(expect.arrayContaining(['kagami-kanban', 'hand-mirror']));
  expect(saved.records).not.toContain('sakasa-doodle');
  expect(await app.getAttribute('data-frame-errors')).toBeNull();
  expect(errors).toEqual([]);
});

test('stage 5-3 つづき: M2 with the rail joined and the light off; M3 with the whistle gate shut', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const app = page.locator('#app');
  for (const [mission, title] of [
    [1, 'ミッション 2'],
    [2, 'ミッション 3'],
  ] as const) {
    await page.evaluate(
      ([key, done, links, abilities, m]) =>
        localStorage.setItem(key, JSON.stringify({ schema: 1, cleared: done, abilities, records: ['kagami-kanban'], mapLinks: links, resume: { stage: '5-3', mission: m } })),
      [KEY, DONE, LINKS, [...SIX, 'magnetLight'], mission] as const,
    ).catch(() => undefined);
    if (mission === 1) {
      await seedSave(page, { abilities: [...SIX, 'magnetLight'], records: ['kagami-kanban'], resume: { stage: '5-3', mission: 1 } });
    }
    await page.goto('/?stage=5-3&go=1&resume=1');
    await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
    await card(page, title);
    await waitDriving(page);
    await expect(page.locator('#light')).toHaveAttribute('data-light', 'off');
    await expect(page.locator('#light')).toHaveAttribute('data-steps', '3');
    if (mission === 1) await expect(app).toHaveAttribute('data-magnet-hanare-1', 'open');
    // M3 starts at めいろえき, 150 m before the whistle gate: shut.
    else await expect(app).toHaveAttribute('data-flip-gate', 'shut', { timeout: 10_000 });
  }
  expect(errors).toEqual([]);
});
