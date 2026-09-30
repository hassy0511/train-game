import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// PHASE9 B6.1: the scene's look (EnvironmentState) can be applied again and again without leaking objects or GPU
// memory. The view is reached through the dev-only `__debugView` handle, so this spec runs a Vite dev server of its
// own (the suite's server is the production build, where the handle must not exist; checked first).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENV = JSON.parse(readFileSync(resolve(ROOT, 'src/stages/0-0.json'), 'utf8')).environment;
/** Another look, with every piece 0-0 does not have: evening, no fog, snow on the ground and falling, stars, clouds. */
const OTHER = {
  ...ENV,
  sky: { top: '#3b4a8c', bottom: '#f3b7a4' },
  fog: null,
  lighting: 'evening',
  ground: { ...ENV.ground, color: '#f4f8fb' },
  surface: 'snow',
  cloudSea: { y: -60 },
  stars: { count: 300 },
  snow: { count: 400 },
};

let server: ChildProcess | null = null;
let origin = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  server = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(Number(process.env.PW_PORT || 4173) + 1000), '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  origin = await new Promise<string>((ok, fail) => {
    let out = '';
    server?.stdout?.on('data', (d) => {
      // Vite moves to the next free port when this one is taken, so read the address it prints.
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

/** What this spec uses of the dev-only `__debugView` (the ThreeSceneView). */
interface DebugView {
  getScene(): {
    children: unknown[];
    traverse(visit: () => void): void;
    fog: { near: number; far: number } | null;
    background: { getHexString(): string };
  };
  renderer: { info: { memory: { geometries: number; textures: number }; programs?: unknown[] } };
  camera: { far: number };
  applyEnvironment(env: unknown): void;
}

interface Snapshot {
  children: number;
  objects: number;
  geometries: number;
  textures: number;
  programs: number;
  fog: [number, number] | null;
  far: number;
  background: string;
}

test('apply(env) can switch the look back and forth without leaking', async ({ page }) => {
  test.setTimeout(300_000);
  // Production: no debug handles.
  await page.goto('/?stage=0-0');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  expect(await page.evaluate(() => '__debugView' in window || '__debugTrain' in window)).toBe(false);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${origin}/?stage=0-0`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 150_000 });

  /** A few frames drawn with the look, then what the scene and the renderer hold. */
  const snapshot = (): Promise<Snapshot> =>
    page.evaluate(async () => {
      const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
      for (let i = 0; i < 3; i++) await frame();
      const view = (window as unknown as { __debugView: DebugView }).__debugView;
      const scene = view.getScene();
      let objects = 0;
      scene.traverse(() => (objects += 1));
      const { memory, programs } = view.renderer.info;
      return {
        children: scene.children.length,
        objects,
        geometries: memory.geometries,
        textures: memory.textures,
        programs: programs?.length ?? 0,
        fog: scene.fog ? [scene.fog.near, scene.fog.far] : null,
        far: view.camera.far,
        background: scene.background.getHexString(),
      };
    });
  const apply = (env: unknown): Promise<void> =>
    page.evaluate((e) => (window as unknown as { __debugView: DebugView }).__debugView.applyEnvironment(e), env);

  /** The scene and the look, without the renderer's counts of what it has drawn so far. */
  const look = ({ children, objects, textures, fog, far, background }: Snapshot): Partial<Snapshot> => ({ children, objects, textures, fog, far, background });

  const start = await snapshot();
  expect(start.fog).toEqual([ENV.fog.near, ENV.fog.far]);
  // The same look again changes nothing.
  await apply(ENV);
  await apply(ENV);
  expect(await snapshot()).toEqual(start);

  // The first round draws some things for the first time (a far plane without fog reaches further; materials get
  // their no-fog shader variant, which three.js keeps with the material): the renderer's counts settle after it.
  // From then on every round ends where the one before did.
  let other: Snapshot | null = null;
  let back: Snapshot | null = null;
  for (let round = 1; round <= 3; round++) {
    await apply(OTHER);
    const now = await snapshot();
    // Stars, the cloud sea and the falling snow came in; no fog, so the camera draws to its full reach.
    expect(now.objects).toBe(start.objects + 3);
    expect(now.fog).toBeNull();
    expect(now.far).toBe(600);
    expect(now.background).toBe('f3b7a4');
    if (other) expect(now, `round ${round}, other look`).toEqual(other);
    other = now;
    await apply(ENV);
    const then = await snapshot();
    expect(look(then), `round ${round}, back`).toEqual(look(start));
    if (back) expect(then, `round ${round}, back`).toEqual(back);
    back = then;
  }
  expect(errors).toEqual([]);
});
