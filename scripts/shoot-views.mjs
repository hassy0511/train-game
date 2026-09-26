#!/usr/bin/env node
/**
 * Screenshots fixed viewpoints of each stage together with that frame's draw calls and triangles, so a change
 * to the scene (baked models, smaller cells, lighter flocks: docs/PHASE7_FINISH.md §2) can be compared
 * before/after picture by picture:
 *   node scripts/shoot-views.mjs <outDir>            # every stage below
 *   node scripts/shoot-views.mjs <outDir> 1-2 2-1    # just some
 * Writes <outDir>/<stage>-<rail>-<s>-<camera>.png and one JSON line per shot to <outDir>/stats.jsonl (lines of
 * the stages shot this time are replaced, the others kept). "animated" marks shots whose picture changed
 * between two captures half a second apart (flocks, bending boughs, ...): compare those by eye, not by pixel.
 * Runs the dev server, since the __debugView / __debugTrain handles only exist in dev builds.
 * Needs Playwright's Chromium (PW_CHROMIUM_PATH to reuse an installed one).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * [railId, s (train front, m), camera] per stage. Spread along the main rails, near stations and the scenes
 * measured heaviest in PHASE7_FINISH §2 (1-1 side s=300, 1-2 cab s=550 / chase s=640). Every s keeps the whole
 * train clear of gaps, jump pads and the ends of the line.
 */
const VIEWS = {
  '1-1': [
    ['loop', 100, 'cab'],
    ['loop', 160, 'chase'], // さくらえき
    ['loop', 300, 'side'], // the town: heaviest in draw calls
    ['loop', 300, 'chase'],
    ['loop', 430, 'side'], // みなとえき
    ['loop', 620, 'top'],
  ],
  '1-2': [
    ['main', 360, 'side'], // first flock overhead
    ['main', 550, 'cab'], // just before きょうりゅうえき: heaviest in triangles
    ['main', 550, 'chase'],
    ['main', 640, 'chase'],
    ['main', 1000, 'top'], // いわのえき, second flock
    ['main', 1340, 'cab'], // たにのおく
  ],
  '1-3': [
    ['main', 120, 'chase'],
    ['main', 470, 'side'], // しまのえき
    ['flip', 120, 'side'],
    ['flip', 200, 'chase'], // upside down on the loop
    ['main2', 180, 'cab'],
    ['main2', 520, 'top'], // かぜのえき
  ],
  '2-1': [
    ['main', 200, 'chase'],
    ['main', 600, 'side'], // on the springy bough
    ['main', 750, 'cab'], // えだのえき
    ['main', 1100, 'top'],
    ['flip', 200, 'chase'],
    ['top', 240, 'side'], // こずえのえき
  ],
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [outArg, ...wanted] = process.argv.slice(2);
if (!outArg) {
  console.error('usage: node scripts/shoot-views.mjs <outDir> [stage...]');
  process.exit(1);
}
const outDir = resolve(outArg);
const stages = wanted.length > 0 ? wanted : Object.keys(VIEWS);
for (const id of stages) {
  if (!VIEWS[id]) {
    console.error(`no viewpoints for stage ${id} (have: ${Object.keys(VIEWS).join(', ')})`);
    process.exit(1);
  }
}
mkdirSync(outDir, { recursive: true });
const PORT = 5191;

const server = spawn(resolve(root, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => String(d).includes('Local') && ok());
  server.on('exit', (code) => fail(new Error(`vite exited ${code}`)));
});

/** Resolves after `n` animation frames (the game renders once per frame). */
const frames = (page, n) =>
  page.evaluate((count) => new Promise((done) => {
    const step = (k) => (k <= 0 ? done() : requestAnimationFrame(() => step(k - 1)));
    step(count);
  }), n);

/**
 * Lets the opening run up to its first card (tapping lines along), then takes the card away without answering
 * it: the story stays parked there for good, so no scripted camera or line interferes with the shots.
 */
async function parkStory(page) {
  const deadline = Date.now() + 90_000;
  while (!(await page.locator('#card').isVisible())) {
    if (Date.now() > deadline) {
      console.warn('  no card within 90 s; shooting anyway');
      break;
    }
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => {
    for (const id of ['card', 'caption']) document.getElementById(id)?.remove();
  });
  // Lines, record toasts and the dev stats panel (its fps changes every frame) would only add noise.
  await page.addStyleTag({ content: '#bubble, #toast, .debug-panel { visibility: hidden !important; }' });
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const rows = [];
try {
  for (const id of stages) {
    console.log(`stage ${id}`);
    // Same size as the smoke tests (iPad Pro 11" landscape, DPR 1).
    const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    page.on('pageerror', (e) => console.error(`  [${id}] ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && console.error(`  [${id}] ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/?stage=${id}&go=1`);
    await page.waitForSelector('#app[data-ready="1"]', { state: 'attached', timeout: 120_000 });
    await parkStory(page);

    for (const [rail, s, camera] of VIEWS[id]) {
      await page.evaluate(([r, at]) => window.__debugTrain.rewindTo(at, r), [rail, s]);
      // The game re-applies stage camera zones on the next tick; set ours after that.
      await frames(page, 1);
      await page.evaluate((mode) => window.__debugView.setCamera(mode, true), camera);
      await frames(page, 4);
      const stats = await page.evaluate(() => window.__debugView.getStats());
      const file = `${id}-${rail}-${s}-${camera}.png`;
      const shot = await page.screenshot({ path: resolve(outDir, file) });
      await page.waitForTimeout(500);
      const animated = !shot.equals(await page.screenshot());
      const row = { stage: id, rail, s, camera, file, drawCalls: stats?.drawCalls ?? null, triangles: stats?.triangles ?? null, animated };
      rows.push(row);
      console.log(`  ${file.padEnd(28)} ${String(row.drawCalls).padStart(4)} draws ${String(row.triangles).padStart(7)} tris${animated ? '  (animated)' : ''}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

const statsPath = resolve(outDir, 'stats.jsonl');
const kept = existsSync(statsPath)
  ? readFileSync(statsPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() && !stages.includes(JSON.parse(line).stage))
  : [];
writeFileSync(statsPath, [...kept, ...rows.map((r) => JSON.stringify(r))].join('\n') + '\n');
console.log(`${rows.length} shots → ${outDir}`);
