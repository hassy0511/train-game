import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, doors, NORMAL, recordLines, recordReverse, setDirection, setNotch, standStill, stopAt, waitDriving, waitFront, waitReverseStop } from './drive';

/**
 * PR11a「区画と もん」(PHASE9_CHAPTER5_6 第 3 部 B6・B15) on the hidden test stage 0-7 てすとの もん: two sections 3 km
 * apart (a day one where the train starts, a night one), joined by a pair of gates. Through a gate: the white comes and
 * goes (#fade[data-kind="gate"]), the section and its sky change, the speed is kept (no braking before the gate), the
 * cars stay together; reversing there stops where the gate arrived (it never goes back through); the reverse platform
 * at the end of the night section's back siding (no gauge, no fail, the platform along +s); hints said only during
 * one step (`whileStep`) and by Sakasa riding along (`who`, `crew`); an `ambience` stretch. A second test (a dev
 * server of its own: the train is put anywhere through the dev-only `__debugTrain`) jumps between the sections and
 * checks the look follows and comes back the same.
 *
 * Built for about 10 fps software GL: short states (the white, the section changing) are kept by a MutationObserver
 * in the page (window.__portalLog) and read afterwards.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const ALL = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight', 'reverse'];
const DAY_SKY = '#4f9dff';
const NIGHT_SKY = '#141c46';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function seed(page: Page): Promise<void> {
  await page.addInitScript((a) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: ['6-1'], abilities: a, records: [], mapLinks: [] }));
  }, ALL);
}

interface PortalRow {
  t: number;
  section: string;
  sky: string;
  lighting: string;
  kind: string;
  portals: string;
  rail: string;
  front: number;
  speed: number;
}

/**
 * Keeps a row in window.__portalLog each time the section, the sky, the gate's white (#fade[data-kind]) or the gate
 * count changes; and the lowest speed seen in the last 30 m before each gate's end (window.__gateSpeed: rail → m/s).
 */
async function recordPortals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: PortalRow[] = [];
    const lowest: Record<string, number> = {};
    const gateEnd: Record<string, number> = { main: 420, yoru: 700 };
    Object.assign(window, { __portalLog: log, __gateSpeed: lowest });
    let last = '';
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d) return;
      const front = Number(d.s) + 6;
      const end = gateEnd[d.rail ?? ''];
      if (end !== undefined && front >= end - 30 && front <= end) lowest[d.rail as string] = Math.min(lowest[d.rail as string] ?? Infinity, Number(d.speed));
      const kind = document.getElementById('fade')?.dataset.kind ?? '';
      const key = `${d.section}|${d.sky}|${kind}|${d.portals}`;
      if (key === last) return;
      last = key;
      log.push({ t: Number(d.time), section: d.section ?? '', sky: d.sky ?? '', lighting: d.lighting ?? '', kind, portals: d.portals ?? '', rail: d.rail ?? '', front, speed: Number(d.speed) });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-section', 'data-sky', 'data-kind', 'data-portals', 'data-s'] });
  });
}

const portalLog = (page: Page): Promise<PortalRow[]> => page.evaluate(() => (window as unknown as { __portalLog: PortalRow[] }).__portalLog);
const gateSpeed = (page: Page): Promise<Record<string, number>> => page.evaluate(() => (window as unknown as { __gateSpeed: Record<string, number> }).__gateSpeed);

/** Whether the stop gauge showed while reversing into the siding (window.__gaugeBack); Sakasa's lines (__sakasaLines). */
async function recordGauge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sakasa: string[] = [];
    (window as unknown as { __sakasaLines: string[] }).__sakasaLines = sakasa;
    new MutationObserver(() => {
      const b = document.getElementById('bubble');
      const line = b?.dataset.line;
      if (b && line && b.classList.contains('is-amanojaku') && sakasa[sakasa.length - 1] !== line) sakasa.push(line);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-line'] });
    const seen = { shown: 0 };
    (window as unknown as { __gaugeBack: typeof seen }).__gaugeBack = seen;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      const g = document.getElementById('stop-gauge');
      if (d?.direction === '-1' && d.tailRail === 'yoru-ura' && g && !g.hidden) seen.shown += 1;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-tail-s', 'hidden'] });
  });
}

test('0-7: through the gate and back — the white, the section and its sky, the speed kept; reversing stops at the gate; the reverse platform; whileStep hints', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await seed(page);
  await recordReverse(page);
  await recordPortals(page);
  await recordGauge(page);
  const lines = await recordLines(page);
  const app = page.locator('#app');
  const sw = page.locator('#reverse-switch');
  await page.goto('/?stage=0-7&go=1');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  const loadMs = Number(await app.getAttribute('data-load-ms'));
  console.log(`portal: 0-7 ready in ${loadMs} ms (data-load-ms)`);
  expect(loadMs).toBeGreaterThan(0);
  await expect(app).toHaveAttribute('data-section', 'hiru');
  await expect(app).toHaveAttribute('data-sky', DAY_SKY);
  await expect(app).toHaveAttribute('data-sakasa', 'seat');
  // The night section's props are built a slice a frame once the stage is up (B13).
  await expect(app).toHaveAttribute('data-sections-ready', 'hiru,yoru', { timeout: 60_000 });
  await card(page, 'もんの むこうへ', 120_000);
  await waitDriving(page);
  await setNotch(page, NORMAL);

  // ---- Through the gate main → yoru at ふつう (10 m/s). ----
  await expect(app).toHaveAttribute('data-section', 'yoru', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-portal', 'main>yoru');
  await expect(app).toHaveAttribute('data-portals', '1');
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, '0-7-gate.png') });
  await expect(app).toHaveAttribute('data-sky', NIGHT_SKY);
  await expect(app).toHaveAttribute('data-lighting', 'night');
  // The white came and is gone again.
  await expect.poll(async () => (await portalLog(page)).some((r) => r.kind === 'gate'), { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#fade')).not.toHaveAttribute('data-kind', 'gate', { timeout: 10_000 });
  const log = await portalLog(page);
  const arrived = log.find((r) => r.section === 'yoru');
  console.log(`portal: arrived on ${arrived?.rail} front ${arrived?.front.toFixed(1)} at ${arrived?.speed} m/s; the last 30 m before the gate at least ${(await gateSpeed(page)).main} m/s`);
  expect(arrived?.rail).toBe('yoru');
  expect(Math.abs((arrived?.speed ?? 0) - 10)).toBeLessThanOrEqual(0.5);
  // No automatic braking before a gate (it is no buffer).
  expect((await gateSpeed(page)).main).toBeGreaterThanOrEqual(9.5);
  // The three cars together on the new rail.
  await waitFront(page, 'yoru', 70);
  expect(Math.abs(Number(await app.getAttribute('data-car-gap')) - 12.5)).toBeLessThanOrEqual(0.5);

  // ---- Reversing just after the gate: it stops where the gate arrived (never back through it). ----
  await standStill(page);
  await setDirection(page, 'back');
  await expect(app).toHaveAttribute('data-sakasa', 'rear');
  await setNotch(page, NORMAL);
  await waitReverseStop(page, 'portal');
  expect(await app.getAttribute('data-rail')).toBe('yoru');
  expect(await app.getAttribute('data-section')).toBe('yoru');
  const floorFront = Number(await app.getAttribute('data-s')) + 6;
  console.log(`portal: reversing stopped with the front at yoru ${floorFront.toFixed(1)} (the gate arrives at 45 + 6)`);
  expect(Math.abs(floorFront - 51)).toBeLessThanOrEqual(1.5);
  await setDirection(page, 'front');
  await expect(app).toHaveAttribute('data-sakasa', 'seat');

  // ---- Past the back siding's mouth (yoru 250) without going in: Sakasa's step-0 hint at yoru 330. ----
  await setNotch(page, NORMAL);
  await waitFront(page, 'yoru', 345);
  await standStill(page);
  await expect.poll(lines, { timeout: 20_000 }).toContain('うしろの ホーム、わすれてる のだ！');
  // Said by Sakasa riding along (the hint's `who`).
  expect(await page.evaluate(() => (window as unknown as { __sakasaLines: string[] }).__sakasaLines)).toContain('うしろの ホーム、わすれてる のだ！');
  await expect(app).toHaveAttribute('data-ambience', 'night');
  // The reverse platform is the step's station: the switch glows. Back, the mission picked the siding already.
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 60_000 });
  await setDirection(page, 'back');
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-tail-rail', 'yoru-ura', { timeout: 120_000 });
  await waitReverseStop(page, 'buffer');
  await expect(page.locator('#toast')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, '0-7-rear.png') });
  // The platform runs along +s from the stop (beside the train, not behind it): seen from the side.
  await page.locator('#camera').dispatchEvent('pointerdown');
  await page.locator('.camera-tile[data-mode="side"]').dispatchEvent('pointerdown');
  await expect(app).toHaveAttribute('data-camera', 'side');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, '0-7-home.png') });
  expect(await page.evaluate(() => (window as unknown as { __gaugeBack: { shown: number } }).__gaugeBack.shown)).toBe(0);
  expect(await app.getAttribute('data-fails')).toBeNull();
  await doors(page);
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 30_000 });
  await waitDriving(page);
  await setDirection(page, 'front');
  await setNotch(page, NORMAL);

  // ---- On to もりのえき (yoru 560): the step-0 hint at 420 is not said now (step 1); the ambience stretch. ----
  await stopAt(page, 'yoru', 560);
  await expect(app).toHaveAttribute('data-ambience', 'toy');
  await doors(page);
  await card(page, 'できた！', 120_000);
  await card(page, 'もどりの えきへ', 120_000);
  const said = await lines();
  expect(said).not.toContain('ホームは うしろだよ！');
  // The step-1 hint lies on main 200, passed during step 0: never said.
  expect(said).not.toContain('もりのえきへ いこう！');

  // ---- Mission 2: through the gate yoru → kaeri, back in the day. ----
  await waitDriving(page);
  await setNotch(page, NORMAL);
  await expect(app).toHaveAttribute('data-section', 'hiru', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-portal', 'yoru>kaeri');
  await expect(app).toHaveAttribute('data-sky', DAY_SKY);
  await expect(app).toHaveAttribute('data-lighting', 'day');
  expect((await gateSpeed(page)).yoru).toBeGreaterThanOrEqual(9.5);
  await stopAt(page, 'kaeri', 330);
  await doors(page);
  await card(page, 'できた！', 120_000);
  expect(await app.getAttribute('data-fails')).toBeNull();
  const sections = (await portalLog(page)).map((r) => r.section).filter((s, i, a) => s !== a[i - 1]);
  expect(sections).toEqual(['hiru', 'yoru', 'hiru']);
  expect(errors).toEqual([]);
});

// ---- The look when the train is put anywhere (a rewind, a resume, the budget probe): a dev server of its own. ----

let server: ChildProcess | null = null;
let origin = '';

test.describe('0-7 put anywhere (dev server)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    server = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(Number(process.env.PW_PORT || 4173) + 1100), '--host', '127.0.0.1'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    origin = await new Promise<string>((ok, fail) => {
      let out = '';
      server?.stdout?.on('data', (d) => {
        out += String(d).replace(/\x1b\[[0-9;]*m/g, '');
        const match = out.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) ok(match[0]);
      });
      server?.on('exit', (code) => fail(new Error(`vite exited ${code}`)));
    });
  });

  test.afterAll(() => {
    server?.kill();
  });

  test('put into the other section and back twice: its look at once, the same look again each time; never before a gate', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await seed(page);
    await page.goto(`${origin}/?stage=0-7&go=1`);
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-ready', '1', { timeout: 120_000 });
    type Look = { section: string; sky: string; fog: [number, number] | null; far: number; background: string; lights: [number, number]; stars: boolean; moon: boolean; ground: [number, number, string] };
    const look = (): Promise<Look> =>
      page.evaluate(() => {
        const view = (window as unknown as { __debugView: { getScene(): { fog: { near: number; far: number } | null; background: { getHexString(): string }; getObjectByName(n: string): { position: { x: number; z: number }; material: { color: { getHexString(): string } } } | undefined }; camera: { far: number }; environment: { lightLevels: { hemisphere: number; sun: number }; pieces: Map<string, unknown>; baseFog: { near: number; far: number } | null; baseFar: number } } }).__debugView;
        const scene = view.getScene();
        const d = document.getElementById('app')?.dataset ?? {};
        const ground = scene.getObjectByName('ground');
        const lv = view.environment.lightLevels;
        return {
          section: d.section ?? '',
          sky: d.sky ?? '',
          // As the look sets them (the view eases the scene's fog towards them over a moment).
          fog: view.environment.baseFog ? [view.environment.baseFog.near, view.environment.baseFog.far] : null,
          far: Math.round(view.environment.baseFar),
          background: scene.background.getHexString(),
          lights: [Math.round(lv.hemisphere * 1000) / 1000, Math.round(lv.sun * 1000) / 1000],
          stars: view.environment.pieces.has('stars'),
          moon: view.environment.pieces.has('moon'),
          ground: ground ? [Math.round(ground.position.x), Math.round(ground.position.z), ground.material.color.getHexString()] : [0, 0, ''],
        } as Look;
      });
    const put = async (railId: string, front: number, section: string): Promise<Look> => {
      await page.evaluate(([r, s]) => (window as unknown as { __debugTrain: { rewindTo(s: number, r: string): void } }).__debugTrain.rewindTo(Number(s), r as string), [railId, front] as const);
      await expect(app).toHaveAttribute('data-section', section, { timeout: 30_000 });
      await page.waitForTimeout(300);
      return look();
    };
    const day1 = await put('main', 200, 'hiru');
    const night1 = await put('yoru', 300, 'yoru');
    const day2 = await put('kaeri', 250, 'hiru');
    const night2 = await put('yoru-ura', 30, 'yoru');
    const day3 = await put('main', 120, 'hiru');
    console.log(`portal: day ${JSON.stringify(day1)}`);
    console.log(`portal: night ${JSON.stringify(night1)}`);
    expect(day1.sky).toBe(DAY_SKY);
    expect(night1.sky).toBe(NIGHT_SKY);
    expect(night1.stars && night1.moon).toBe(true);
    expect(day1.stars || day1.moon).toBe(false);
    expect(night1.fog?.[1]).toBe(360);
    expect(day1.fog?.[1]).toBe(450);
    // The ground board sits round each section's middle.
    expect(Math.abs(night1.ground[0] - 3000)).toBeLessThan(20);
    expect(Math.abs(day1.ground[0] + 20)).toBeLessThan(30);
    expect(day2).toEqual(day1);
    expect(day3).toEqual(day1);
    expect(night2).toEqual(night1);
    // Put before where a gate arrives, the train is put at the arrival (never back past a gate).
    await page.evaluate(() => (window as unknown as { __debugTrain: { rewindTo(s: number, r: string): void } }).__debugTrain.rewindTo(10, 'yoru'));
    await expect.poll(async () => Number(await app.getAttribute('data-s')), { timeout: 10_000 }).toBeGreaterThanOrEqual(44.9);
    expect(errors).toEqual([]);
  });
});
