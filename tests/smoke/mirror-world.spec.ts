import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, doors, FAST, FRONT, NORMAL, pressOnGlow, pressOnGlowBefore, progress, recordLines, setNotch, stopAt, tapUntil, waitDriving, waitFront } from './drive';

/**
 * PR6a「かがみの せかいの 土台」 on the hidden test stage 0-3 てすとの かがみ (PHASE9_CHAPTER5_6 §0.8, 第 6 部 §17): glass
 * (see-through, plain rails in its mirror), "かがみの なか" (the 3D view mirrored between two gates while the lever and
 * the round buttons stay exactly where they were), a phantom fork (the false way with no light is a soft dead end and
 * the light glows after it; with the light it pops and the true way is taken; a tap on the true arrow also works and
 * leaves the phantom be), a false bridge (it pops under a train that did not jump, then at a jump), the whistle gate
 * (bounced off and held before it, never a fail; mashing the whistle opens it once), and the ending: Sakasa with her
 * back to the big mirror and the mirror Sakasa in it, the mirror turned over (never broken), the notes held up to a
 * mirror ("のせて").
 *
 * Built for about 10 fps software GL: the short states (the shimmer, a phantom's pop, the gate's bounce) are kept by a
 * MutationObserver in the page (window.__mirror) and looked at afterwards; presses that must land in a window are made in
 * the page (pressOnGlow and friends). The bits of the page are data-* on #app only (no debug hooks in the build).
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

/** 0-3's places (main s; scripts/layout-0-3.mjs). */
const GLASS = { from: 140, to: 200 };
const FLIP1 = { from: 260, to: 440 };
const J1 = 540;
const GAP = { from: 700, to: 706 };
const NAKA = 900;
const J2 = 1000;
const FLIP2 = { from: 1200, to: 1380 };
const OWARI = 1560;

interface MirrorLog {
  log: { t: number; kind: string; id: string; s: number }[];
  shimmers: number;
  glassFrom: number;
  glassTo: number;
  /** The front positions (main) while #view was mirrored. */
  flippedFrom: number;
  flippedTo: number;
  /** Arrows showed / the light glowed yellow near fork k-j2 (a tap test). */
  failing: { rail: string; s: number }[];
  whistleGlowHeld: boolean;
}

/** Keeps the mirror world's short states in window.__mirror (set up before the page loads). */
async function recordMirror(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const m = {
      log: [] as { t: number; kind: string; id: string; s: number }[],
      shimmers: 0,
      glassFrom: Infinity,
      glassTo: -Infinity,
      flippedFrom: Infinity,
      flippedTo: -Infinity,
      failing: [] as { rail: string; s: number }[],
      whistleGlowHeld: false,
    };
    (window as unknown as { __mirror: typeof m }).__mirror = m;
    let flips = 0;
    let bumps = 0;
    let flip = '';
    let gate = '';
    let facing = '';
    const phantoms = new Map<string, string>();
    let shimmerOn = false;
    new MutationObserver(() => {
      const app = document.getElementById('app');
      if (!app) return;
      const d = app.dataset;
      const t = Number(d.time);
      const s = Number(d.s) + 6;
      const push = (kind: string, id = ''): void => {
        m.log.push({ t, kind, id, s });
      };
      if (d.flips !== undefined && Number(d.flips) > flips) {
        flips = Number(d.flips);
        push('flip-in');
      }
      if (flip === '1' && d.flip === '') push('flip-out');
      flip = d.flip ?? '';
      if (gate === 'shut' && d.flipGate === 'open') push('gate-open');
      gate = d.flipGate ?? '';
      if (d.gateBumps !== undefined && Number(d.gateBumps) > bumps) {
        bumps = Number(d.gateBumps);
        push('gate-bump');
      }
      for (const entry of (d.phantoms ?? '').split(',')) {
        const k = entry.lastIndexOf(':');
        if (k < 0) continue;
        const id = entry.slice(0, k);
        const state = entry.slice(k + 1);
        if (phantoms.get(id) !== state && state !== 'solid') push(`phantom-${state === 'gone' ? 'gone' : 'fall'}`, id);
        phantoms.set(id, state);
      }
      if ((d.mirrorFacing ?? '') !== facing) {
        facing = d.mirrorFacing ?? '';
        push('fx-turn', facing);
      }
      if (d.glass === '1' && d.rail === 'main') {
        m.glassFrom = Math.min(m.glassFrom, s);
        m.glassTo = Math.max(m.glassTo, s);
      }
      if (document.getElementById('view')?.classList.contains('is-flipped') && d.rail === 'main') {
        m.flippedFrom = Math.min(m.flippedFrom, s);
        m.flippedTo = Math.max(m.flippedTo, s);
      }
      const on = document.getElementById('mirror-fade')?.classList.contains('is-on') ?? false;
      if (on && !shimmerOn) m.shimmers += 1;
      shimmerOn = on;
      if (d.phase === 'failing' && d.rail) m.failing.push({ rail: d.rail, s: Number(d.s) });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-s', 'data-flips', 'data-flip', 'data-flip-gate', 'data-gate-bumps', 'data-phantoms', 'data-mirror-facing', 'data-glass', 'class', 'data-phase'] });
  });
}

function mirrorLog(page: Page): Promise<MirrorLog> {
  return page.evaluate(() => (window as unknown as { __mirror: MirrorLog }).__mirror);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
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

/** Where the lever and the round buttons are on screen (x and y of each). */
function controls(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.evaluate(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const el of [document.getElementById('lever'), ...document.querySelectorAll<HTMLElement>('.action-buttons > .round-button')]) {
      if (!el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      out[el.id] = { x: Math.round(r.x), y: Math.round(r.y) };
    }
    return out;
  });
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
      const a = rounds[i];
      const b = rounds[j];
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(a.r + b.r - 0.5);
    }
  }
  // The jump button is never greyed out for a gate (PHASE9_0).
  await expect(page.locator('#jump')).not.toHaveAttribute('data-block', /.+/);
}

/** Taps the true arrow of the fork `id` (its side that is not the default) as soon as the arrows show. */
async function tapArrow(page: Page, side: 'left' | 'right'): Promise<void> {
  const tapped = await page.waitForFunction(
    (sd) => {
      const box = document.getElementById('junction');
      const b = box?.querySelector<HTMLElement>(`.arrow[data-side="${sd}"]`);
      if (!box || box.hidden || !b || b.hidden) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    side,
    { timeout: 180_000, polling: 'raf' },
  );
  expect(await tapped.jsonValue()).toBe(true);
}

test('0-3 m1: glass, the mirror world with the controls where they were, a phantom fork, a false bridge', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  const lines = await recordLines(page);
  await recordMirror(page);
  const app = page.locator('#app');
  await page.goto('/?stage=0-3&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ミッション 1');
  await waitDriving(page);
  await roundButtonsApart(page);
  await expect(app).toHaveAttribute('data-flip', '');
  await expect(app).toHaveAttribute('data-phantoms', 'k-j1:solid,k-j2:solid,gap:main:700:solid');
  const before = await controls(page);
  expect(Object.keys(before).length).toBe(7);

  // Glass: see-through here, plain rails in its mirror (k-m-glass); "しゃららん" going onto it.
  await setNotch(page, NORMAL);
  await waitFront(page, 'main', GLASS.from + 25);
  await page.screenshot({ path: resolve(OUT, 'mirror-glass.png') });
  await waitFront(page, 'main', GLASS.to + 5);
  let m = await mirrorLog(page);
  expect(m.glassFrom).toBeGreaterThanOrEqual(GLASS.from - 1.5);
  expect(m.glassFrom).toBeLessThan(GLASS.from + 12);
  expect(m.glassTo).toBeLessThanOrEqual(GLASS.to + 1.5);

  // "かがみの なか": through the open gate the view turns round behind a shimmer; the controls do not move at all.
  await waitFront(page, 'main', FLIP1.from + 40);
  await expect(app).toHaveAttribute('data-flip', '1');
  await expect(page.locator('#view')).toHaveClass(/is-flipped/);
  expect(await controls(page)).toEqual(before);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, 'mirror-flip.png') });
  await expect.poll(async () => (await progress(page)).records ?? [], { timeout: 60_000 }).toContain('test-kanban');
  await waitFront(page, 'main', FLIP1.to + 15);
  await expect(app).toHaveAttribute('data-flip', '');
  await expect(page.locator('#view')).not.toHaveClass(/is-flipped/);
  m = await mirrorLog(page);
  expect(m.log.filter((e) => e.kind === 'flip-in')).toHaveLength(1);
  expect(m.log.filter((e) => e.kind === 'flip-out')).toHaveLength(1);
  expect(m.shimmers).toBeGreaterThanOrEqual(2);
  expect(m.flippedFrom).toBeGreaterThanOrEqual(FLIP1.from - 1.5);
  expect(m.flippedTo).toBeLessThanOrEqual(FLIP1.to + 1.5);

  // The phantom fork with no light and no arrow: the false way, "あれ？ かがみに せんろが ない！", the soft cushion, back
  // 80 m before the fork; the light glows then, and with it on the phantom pops and the true way is taken.
  await expect(app).toHaveAttribute('data-rail', 'k-maboroshi1', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-fail-reason', 'deadEnd', { timeout: 120_000 });
  await waitRewound(page, 'main', J1 - 70);
  await page.screenshot({ path: resolve(OUT, 'mirror-phantom-back.png') });
  await setNotch(page, NORMAL);
  await pressOnGlow(page, 'light', 30_000);
  await expect(app).toHaveAttribute('data-phantoms', /k-j1:gone/, { timeout: 60_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'mirror-phantom-pop.png') });
  await waitFront(page, 'main', J1 + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  // The light off again (else it pops the false bridge before the gap).
  await page.locator('#light').dispatchEvent('pointerdown');
  await expect(page.locator('#light')).toHaveAttribute('data-on', '0', { timeout: 10_000 });

  // The false bridge: no jump, it pops under the train ("まぼろしの はし だった〜！"), back 80 m before the gap; then at
  // "はやい" a jump on the glow gets across and pops it at take-off, no fail.
  await expect(app).toHaveAttribute('data-fail-reason', 'fellNoJump', { timeout: 120_000 });
  await waitRewound(page, 'main', GAP.from - 70);
  const fails = Number(await app.getAttribute('data-fails'));
  await setNotch(page, FAST);
  await pressOnGlowBefore(page, 'jump', 'main', GAP.from);
  await waitFront(page, 'main', GAP.to + 20);
  expect(Number(await app.getAttribute('data-fails'))).toBe(fails);
  m = await mirrorLog(page);
  expect(m.log.some((e) => e.kind === 'phantom-fall' && e.id === 'gap:main:700')).toBe(true);
  expect(m.log.some((e) => e.kind === 'phantom-gone' && e.id === 'gap:main:700')).toBe(true);

  await stopAt(page, 'main', NAKA);
  await doors(page);
  await card(page, 'できた');

  const said = await lines();
  for (const line of [
    'あれ？ せんろが すけてる…',
    'かがみを みて！ ちゃんと ある！',
    'かがみに はいっちゃう〜！',
    'かがみの なかに はいった！',
    'ぜんぶ はんたい！',
    'あっ！ かんばんが よめる！',
    'もどって きた！',
    'まっすぐの せんろ、ピンク…？',
    'あれ？ かがみに せんろが ない！',
    'まぼろし だった〜！',
    'まぼろし だった！ こっちが ほんもの！',
    'まぼろしの はし だった〜！',
    'はやいで ジャンプ！',
  ]) expect(said, line).toContain(line);
  expect(errors).toEqual([]);
});

test('0-3 m2 from つづき (left-handed): the true arrow at a phantom fork, the whistle gate, the mirror Sakasa and the notes in the mirror', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  const lines = await recordLines(page);
  await recordMirror(page);
  await page.addInitScript(() => {
    localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: [], abilities: [], records: [], mapLinks: [], resume: { stage: '0-3', mission: 1 } }));
    localStorage.setItem('train-game.settings.v1', JSON.stringify({ music: 2, sound: 2, calm: false, leftHanded: true }));
  });
  const app = page.locator('#app');
  await page.goto('/?stage=0-3&go=1&resume=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ミッション 2');
  await waitDriving(page);
  await expect(app).toHaveClass(/is-left-handed/);
  await roundButtonsApart(page);

  // The phantom fork k-j2 seen in its mirror: a tap on the true arrow (left) takes the true way; the phantom stays.
  await setNotch(page, NORMAL);
  await tapArrow(page, 'left');
  await waitFront(page, 'main', J2 + 20);
  await expect(app).toHaveAttribute('data-rail', 'main');
  expect((await app.getAttribute('data-phantoms')) ?? '').toContain('k-j2:solid');

  // The whistle gate: shut (frosted), the whistle glows as it comes; not whistled, the train bounces off ("ぽよん"),
  // it is not a fail, and it is held 4 m before the gate whatever the lever says.
  await expect(app).toHaveAttribute('data-flip-gate', 'shut', { timeout: 60_000 });
  const fails = Number((await app.getAttribute('data-fails')) ?? '0');
  await expect(app).toHaveAttribute('data-gate-bumps', '1', { timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, 'mirror-gate-bump.png') });
  const t0 = Number(await app.getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t + 2, t0, { timeout: 60_000 });
  const heldAt = Number(await app.getAttribute('data-s')) + FRONT;
  expect(heldAt).toBeLessThanOrEqual(FLIP2.from - 4 + 0.6);
  expect(heldAt).toBeGreaterThan(FLIP2.from - 8);
  await expect(app).toHaveAttribute('data-notch', String(NORMAL));
  await expect(app).toHaveAttribute('data-phase', 'driving');
  expect(Number((await app.getAttribute('data-fails')) ?? '0')).toBe(fails);
  await expect(page.locator('#whistle')).toHaveAttribute('data-glow', '1');

  // Mashing the whistle (ten a second for a second and a half): the gate opens once, the whistle keeps its rest.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let n = 0;
        const id = window.setInterval(() => {
          document.getElementById('whistle')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          if (++n >= 15) {
            window.clearInterval(id);
            done();
          }
        }, 100);
      }),
  );
  await expect(app).toHaveAttribute('data-flip-gate', 'open', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-flip', '1', { timeout: 60_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'mirror-flip-2.png') });
  let m = await mirrorLog(page);
  expect(m.log.filter((e) => e.kind === 'gate-open')).toHaveLength(1);
  expect(m.log.filter((e) => e.kind === 'gate-bump')).toHaveLength(1);
  await waitFront(page, 'main', FLIP2.to + 10);
  await expect(app).toHaveAttribute('data-flip', '');

  // The end station, then the ending: Sakasa with her back to the big mirror, the mirror Sakasa waving in it; the
  // mirror turned over (never broken); the notes held up to a mirror read "のせて".
  await stopAt(page, 'main', OWARI);
  await doors(page);
  await card(page, 'できた');
  await tapUntil(page, '#bubble:has-text("にこにこ")');
  await expect(app).toHaveAttribute('data-cutscene-actors', /sakasa-mirror/);
  await expect(app).toHaveAttribute('data-cutscene-actors', /(^|,)sakasa(,|$)/);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, 'mirror-sakasa.png') });
  await tapUntil(page, '#card.is-reflect');
  await expect(app).toHaveAttribute('data-mirror-facing', 'm-oo:back');
  await expect(page.locator('#card.is-reflect h1')).toHaveText('のせて');
  await expect(page.locator('#card')).toHaveAttribute('aria-label', 'かがみに うつった てがみ');
  await expect(page.locator('#card .reflect-note')).toHaveCount(2);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(OUT, 'mirror-card.png') });
  await page.locator('#card-button').click();
  await tapUntil(page, '#card');
  await expect(page.locator('#card')).toContainText('クリア');
  m = await mirrorLog(page);
  expect(m.log.some((e) => e.kind === 'fx-turn' && e.id === 'm-oo:back')).toBe(true);

  const said = await lines();
  for (const line of ['また まぼろし かも…？', 'かがみの もん！ きてきで あいずだ！', 'ぽよん！ かがみが かたい〜', 'きてきで あいず しよう！', 'かがみが ぷるん！ はいれる！', 'のせて… だったんだ！']) {
    expect(said, line).toContain(line);
  }
  expect(errors).toEqual([]);
});

test('0-3 m2 from つづき: a jump into the shut gate bounces off in the air and is held', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  await recordMirror(page);
  await page.addInitScript(() => {
    localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: [], abilities: [], records: [], mapLinks: [], resume: { stage: '0-3', mission: 1 } }));
  });
  const app = page.locator('#app');
  await page.goto('/?stage=0-3&go=1&resume=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ミッション 2');
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await tapArrow(page, 'left');
  await waitFront(page, 'main', J2 + 20);
  // A jump 8 m before the gate (checked and pressed in the same frame): the arc runs into the glass.
  const jumped = await page.waitForFunction(
    (at) => {
      const d = document.getElementById('app')?.dataset;
      if (!d || d.rail !== 'main' || Number(d.s) + 6 < at) return false;
      document.getElementById('jump')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return d.air === '1' || Number(d.gateBumps) > 0 ? true : false;
    },
    FLIP2.from - 8,
    { timeout: 180_000, polling: 'raf' },
  );
  expect(await jumped.jsonValue()).toBe(true);
  await expect(app).toHaveAttribute('data-gate-bumps', '1', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-air', '0', { timeout: 10_000 });
  const t0 = Number(await app.getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t + 1.5, t0, { timeout: 60_000 });
  expect(Number(await app.getAttribute('data-s')) + FRONT).toBeLessThanOrEqual(FLIP2.from - 4 + 0.6);
  await expect(app).toHaveAttribute('data-phase', 'driving');
  await pressOnGlow(page, 'whistle');
  await expect(app).toHaveAttribute('data-flip-gate', 'open', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-flip', '1', { timeout: 60_000 });
  expect(errors).toEqual([]);
});
