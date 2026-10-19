#!/usr/bin/env node
/**
 * Screenshots fixed viewpoints of each stage together with that frame's draw calls and triangles, so a change
 * to the scene (baked models, smaller cells, lighter flocks: docs/PHASE7_FINISH.md §2) can be compared
 * before/after picture by picture:
 *   node scripts/shoot-views.mjs <outDir>            # every stage below
 *   node scripts/shoot-views.mjs <outDir> 1-2 2-1    # just some
 *   LOOK=<look> node scripts/shoot-views.mjs <outDir> 1-3   # v1.13: with another look of some models (public/looks/)
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
  '2-2': [
    ['main', 240, 'cab'], // the grass tunnel, the dandelion seed ahead
    ['main', 460, 'chase'], // grasshopper 1's leaf, the puddle ahead
    ['main', 1000, 'side'], // on the clover leaves
    ['main', 1300, 'cab'], // stream 1 and its bud ahead
    ['main', 1620, 'top'], // the S bends between tall flowers
    ['silk', 1000, 'cab'], // くものすえき, the web of rails ahead
  ],
  '2-3': [
    ['main', 100, 'chase'], // みなとえき: the seabird on the rail, the floating pumice, the volcano ahead
    ['main', 300, 'side'], // steep slope ①: its sign, the flank of the volcano
    ['main', 1000, 'chase'], // the stony way (rolling pumice waiting by the rail)
    ['main', 1400, 'side'], // the seabird cliff: the sleeping birds, the rocket-rest sign
    ['kudari', 450, 'chase'], // かんそくじょえき on はなれやま, the observatory
    ['kudari', 800, 'side'], // on ぐらぐらばし: the trestle, みさき ahead
  ],
  '3-1': [
    ['umi', 100, 'chase'], // すなはまえき: the beach, its palms, the floating rail out to sea
    ['umi', 400, 'side'], // on the floating rail: the sea floor's kelp and coral through the water
    ['umi', 760, 'cab'], // under the sea: the kelp forest, the coral arch ahead
    ['umi', 1040, 'chase'], // さんごえき among the corals
    ['umi', 1300, 'side'], // the whale's current between the kelp
    ['umi', 1715, 'side'], // up on the reef, the whale's gap and しおふきじま beyond
    ['umi', 1900, 'top'], // しおふきじま: its palms and grass
    ['umi', 2480, 'cab'], // the deep: the bubble forks, the crack of the fallen star
  ],
  '3-2': [
    ['kawa', 60, 'cab'], // ささぶねえき: the valley, the falls far ahead
    ['kawa', 300, 'chase'], // the raft
    ['kawa', 476, 'side'], // the rapids' gap
    ['kawa', 880, 'chase'], // the lily pads
    ['kawa', 1300, 'cab'], // the falls and the rainbow ahead
    ['kawa', 1520, 'chase'], // the plunge pool
    ['kawa', 1700, 'side'], // behind the falls
    ['kawa', 1700, 'cab'],
    ['kawa', 2060, 'cab'], // the meadow, the ducks
    ['kawa', 2560, 'cab'], // the forest pond
    ['fuchi', 100, 'chase'], // the jade's side track
    ['kawa', 2922, 'chase'], // わきみずえき
  ],
  '3-3': [
    ['main', 60, 'cab'], // みさきえき: the pier into the sunset
    ['main', 230, 'side'], // the pier's first gap
    ['main', 470, 'chase'], // into the sea
    ['main', 540, 'cab'], // the sleeping turtle
    ['main', 1150, 'chase'], // the red ring
    ['main', 1560, 'cab'], // the star trench (dark), the false sign
    ['main', 1930, 'side'], // ほしぞこえき
    ['main', 2300, 'side'], // the whale's current
    ['main', 2710, 'cab'], // ていぼうえき
    ['main', 2990, 'chase'], // under the festival rafts
    ['main', 3180, 'chase'], // とうだいえき
  ],
  '4-1': [
    ['main', 60, 'chase'], // みずうみえき, the lake ahead
    ['main', 330, 'cab'], // on the ice, the frost flowers
    ['main', 745, 'side'], // つりばえき and the fishing huts
    ['main', 930, 'chase'], // thin ice ①
    ['main', 1640, 'cab'], // the way off to the ice hole
    ['ana', 110, 'chase'], // the hole and the floe
    ['main', 2075, 'side'], // こじまえき
    ['main', 2600, 'cab'], // the first mirror ahead
    ['kagami1', 75, 'cab'], // face to face with the mirror
    ['main', 3200, 'chase'], // きしべえき, the big mirror
  ],
  '4-2': [
    ['main', 60, 'chase'], // ゆきのはらえき and its village
    ['main', 240, 'chase'], // the first snow wall ahead
    ['main', 740, 'side'], // the frozen waterfall (record ①)
    ['main', 990, 'chase'], // かまくらえき, buried
    ['miharashi', 100, 'chase'], // the side way's buried stretch
    ['main', 1600, 'side'], // the ski hill: lift towers, the folded ski jump
    ['main', 2070, 'side'], // スキーじょうえき (platform on the right)
    ['main', 2460, 'cab'], // inside the snow shed, the upside-down fences
    ['main', 2990, 'chase'], // ひろばえき: the festival plaza, its lanterns
  ],
  '4-3': [
    ['main', 60, 'chase'], // ふもとえき, the snowy ridge ahead
    ['main', 215, 'chase'], // the snowman on the rail ahead
    ['main', 620, 'side'], // the snowmen's way: Sakasa's upside-down snowmen on the bank
    ['main', 980, 'chase'], // もみのきえき (right platform)
    ['ike', 30, 'chase'], // the melting pond on its knoll
    ['main', 1200, 'cab'], // the south mouth ahead: the snow wall, the portal and its icicles
    ['main', 1450, 'cab'], // the ice hall and its pillars, the two exits ahead
    ['nise', 40, 'cab'], // face to face with the false exit
    ['main', 1680, 'cab'], // the north mouth's daylight
    ['main', 1790, 'side'], // とうげえき
    ['main', 2700, 'chase'], // the snow fence ahead
    ['main', 2930, 'chase'], // やまごやえき and the lodge
  ],
  '5-1': [
    ['main', 60, 'chase'], // もりぐちえき at the forest's edge
    ['main', 280, 'cab'], // dark forest A: glowing mushrooms, Sakasa's upside-down birdhouse ahead on the left
    ['main', 545, 'cab'], // the moonlit meadow: sleeping rabbits, the rabbits' nest (record ①) ahead on the right
    ['main', 800, 'chase'], // the broken log bridge ahead
    ['main', 990, 'side'], // つきみえき
    ['main', 1250, 'chase'], // the pond: lily pads, reeds
    ['main', 1515, 'cab'], // the dancing tanukis' wood: their bushes ahead
    ['main', 1990, 'chase'], // きりかぶえき (platform on the right) and the big stump
    ['kurai1', 70, 'cab'], // a dark dead end: the thicket and the fireflies waiting
    ['main', 2575, 'cab'], // the bell on its branch (record ③) ahead on the right
    ['main', 2900, 'chase'], // the root slope, the great tree ahead
    ['main', 3140, 'side'], // ひろばえき: the deck and the great tree
  ],
  '5-2': [
    ['main', 45, 'chase'], // つみきえき: its screw lamp posts, the block town
    ['main', 200, 'cab'], // the reverse-wound chick on the rail ahead
    ['main', 300, 'chase'], // the block bridge and ball pit A
    ['main', 700, 'cab'], // the short screw post with the gold screw (record ①)
    ['main', 1090, 'side'], // ねじまきえき (platform on the right)
    ['main', 1500, 'chase'], // the parade street: the band, the folk watching
    ['main', 1790, 'side'], // ひろばえき and the square
    ['main', 2060, 'chase'], // spinning fork 1: the turntable and its flag
    ['main', 2400, 'side'], // up the screw hill round the big screw
    ['main', 2560, 'chase'], // down the slide over the line below
    ['main', 2625, 'cab'], // the toy box's open lid ahead
    ['main', 3060, 'side'], // おしろえき and the toy castle
  ],
  '5-3': [
    ['main', 60, 'chase'], // かがみぐちえき, the first mirror, the glass trees
    ['main', 450, 'side'], // up onto the glass bridge
    ['main', 670, 'cab'], // the parted rail ahead and its loose piece
    ['main', 950, 'cab'], // inside the mirror: record ①'s board
    ['main', 1250, 'side'], // きらきらえき (platform on the right)
    ['main', 1680, 'cab'], // the iron door ahead
    ['main', 1815, 'chase'], // the tall mirror shelf (record ②)
    ['kagami1', 70, 'cab'], // a false way's cushion
    ['main', 2250, 'chase'], // めいろえき and its mirror
    ['main', 3050, 'cab'], // the turned-away mirror
    ['ura', 40, 'chase'], // the glass side way, record ③
    ['main', 3480, 'chase'], // おおかがみえき, the big mirror
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
// VIEWS_PORT: another port when two run at once (two worktrees).
const PORT = Number(process.env.VIEWS_PORT) || 5191;
// v1.13 LOOK=<look>: draw another look of some models (public/looks/<look>/, みための くらべっこ).
const LOOK = process.env.LOOK ? `&look=${encodeURIComponent(process.env.LOOK)}` : '';

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
    // A cutscene waiting for a press (5-2's opening: the whistle winds the chick): pressed as soon as it glows.
    await page.evaluate(() => {
      const press = document.getElementById('app')?.dataset.cutscenePress;
      const button = press ? document.getElementById(press) : null;
      if (button?.dataset.glow === '1') button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
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
    await page.goto(`http://127.0.0.1:${PORT}/?stage=${id}&go=1${LOOK}`);
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
