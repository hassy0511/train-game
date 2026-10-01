#!/usr/bin/env node
/**
 * Consist probe (PHASE9_CHAPTER5_6 第 3 部 A5.5): the cars placed along the trail (src/train/consist.ts) against the
 * old placement, and the cars' heights along the way the lead car went.
 *   node scripts/probe-consist.mjs              # every stage (hidden ones too)
 *   node scripts/probe-consist.mjs 1-3 2-2      # just some (the runs are always the ones below)
 *
 * (1) Placement: the train is put (rewindTo) on every rail every 50 m, and each trailing car is compared with where the
 *     old rule put it ("s − 12.5 × i on the lead car's rail", run on straight past the rail's start). Within 40 m of a
 *     rail's start that a junction or a merge feeds (the lead car centre less than 40 + 37 m in), the trail puts the
 *     cars on the rail they came from, so a difference there is the point: it is listed apart (the largest sideways,
 *     up/down and along-the-rail parts), and anywhere else the difference must be 0 (within 0.01 m).
 * (2) Runs: the train drives through places where the rails fork or merge while it jumps or dives (1-3 `wind` →
 *     `main2` over the updraft's gap, 2-2's gap then `to-mizutamari`, 3-1's dive fork `ring-1`, 4-1's first thin ice
 *     with the rocket), and every 0.1 s of game time each trailing car's height is compared with the lead car's height
 *     at the same trail distance (Train.carLiftErr, the test hook data-car-lift-err). Up to 0.05 m.
 * (3) Retracing (PR8a, うしろむき): the train drives forward through a junction or a merge, stops, turns round and
 *     reverses back along its trail to the floor; every frame each car's position is compared with where that car was
 *     at the same trail distance going forward (up to 0.05 m), and the rails must be the same (0-0 to-jishaku,
 *     1-3 kaze-michi, 2-2 to-mizutamari, 3-1 the loop uso-1 back into umi).
 * Runs the dev server (the __debugTrain handle only exists in dev builds). Needs Playwright's Chromium
 * (PW_CHROMIUM_PATH to reuse an installed one). Exits 1 when (1) or (2) is out of bounds.
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const STEP = 50;
const JOIN_ZONE = 40 + 37;
const PLACE_TOLERANCE = 0.01;
const LIFT_TOLERANCE = 0.05;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageDir = resolve(root, 'src/stages');
const every = readdirSync(stageDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(resolve(stageDir, file), 'utf8')))
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
const wanted = process.argv.slice(2);
const stages = wanted.length > 0 ? every.filter((s) => wanted.includes(s.id)) : every;

/**
 * The runs of (2): where to put the train (its front), the notch, what to press and choose on the way, and where the
 * run ends (the lead car centre on `until.rail` at `until.s` or beyond, or `seconds` of game time).
 */
const RUNS = [
  { stage: '1-3', name: 'wind → main2 (updraft, gap, merge)', rail: 'main2', at: 40, notch: 3, choose: { 'kaze-michi': 'right' }, jump: true, until: { rail: 'main2', s: 330 }, seconds: 60 },
  { stage: '2-2', name: 'gap 340, then to-mizutamari', rail: 'main', at: 300, notch: 3, choose: { 'to-mizutamari': 'left' }, jump: true, until: { rail: 'mizutamari', s: 70 }, seconds: 40 },
  { stage: '3-1', name: 'dive at the dive fork ring-1', rail: 'umi', at: 520, notch: 3, dive: true, until: { rail: 'umi', s: 700 }, seconds: 60 },
  { stage: '4-1', name: 'thin ice 940-980 with the rocket', rail: 'main', at: 880, notch: 3, rocketAt: 905, until: { rail: 'main', s: 1030 }, seconds: 40 },
];

/** The runs of (3): forward from `at` on `rail` (arrows chosen as `choose`) until `until`, then back to the floor. */
const RETRACES = [
  { stage: '0-0', name: 'main → to-jishaku (right) → jishaku, and back', rail: 'main', at: 500, choose: { 'to-jishaku': 'right' }, until: { rail: 'jishaku', s: 150 } },
  { stage: '1-3', name: 'main2 → kaze-michi (right) → wind, and back', rail: 'main2', at: 40, choose: { 'kaze-michi': 'right' }, until: { rail: 'wind', s: 40 } },
  { stage: '2-2', name: 'main → to-mizutamari (left) → mizutamari, and back', rail: 'main', at: 360, choose: { 'to-mizutamari': 'left' }, until: { rail: 'mizutamari', s: 80 } },
  { stage: '3-1', name: 'umi → awa-1 → the loop uso-1 → merge into umi, and back', rail: 'umi', at: 2380, choose: {}, until: { rail: 'umi', s: 2400, after: 'uso-1' } },
];

const server = spawn(resolve(root, 'node_modules/.bin/vite'), ['--port', '5196', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
const origin = await new Promise((ok, fail) => {
  let out = '';
  server.stdout.on('data', (d) => {
    out += String(d).replace(/\x1b\[[0-9;]*m/g, '');
    const match = out.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) ok(match[0]);
  });
  server.on('exit', (code) => fail(new Error(`vite exited ${code}`)));
});

/** In the page: every rail every STEP m, the trail's cars against the old rule. */
function placeAll([step, zone]) {
  const train = window.__debugTrain;
  const net = train.network;
  const rows = [];
  const wrapFrame = (rail, s) => {
    const loop = rail.end.type === 'merge' && rail.end.railId === rail.id;
    const L = rail.length;
    return rail.frameAt(loop ? ((s % L) + L) % L : s);
  };
  for (const rail of net.rails.values()) {
    const fed = net.feeder(rail.id) !== null || net.mergesInto(rail.id).some((m) => Math.abs(m.at) < 0.5);
    for (let front = 6.5; front <= rail.length; front += step) {
      train.rewindTo(front, rail.id);
      const pose = train.getPose();
      const centre = train.state.s;
      pose.cars.forEach((car, i) => {
        const c = centre - 12.5 * (i + 1);
        const f = wrapFrame(rail, c + 4);
        const r = wrapFrame(rail, c - 4);
        const old = f.position.clone().add(r.position).multiplyScalar(0.5);
        const d = car.position.clone().sub(old);
        const mid = wrapFrame(rail, c);
        const joinZone = fed && centre < zone;
        rows.push({
          rail: rail.id,
          front: Math.round(front * 10) / 10,
          car: i + 1,
          joinZone,
          dist: d.length(),
          side: Math.abs(d.dot(mid.right)),
          up: Math.abs(d.dot(mid.up)),
          along: Math.abs(d.dot(mid.tangent)),
        });
      });
    }
  }
  return rows;
}

/** In the page: one run of (2); samples every 0.1 s of game time. */
async function runOne(run) {
  const train = window.__debugTrain;
  train.rewindTo(run.at, run.rail);
  await new Promise((r) => requestAnimationFrame(() => r()));
  train.setNotch(run.notch);
  const app = document.getElementById('app');
  const t0 = Number(app.dataset.time);
  let next = t0;
  let max = 0;
  let at = null;
  let samples = 0;
  let seenAfter = !run.until.after;
  let rocketFired = false;
  const events = [];
  const onJump = () => events.push(`jump ${train.state.railId} ${train.frontS.toFixed(1)}`);
  train.events.on('jumped', onJump);
  train.events.on('dived', () => events.push(`dive ${train.state.railId} ${train.frontS.toFixed(1)}`));
  train.events.on('railChanged', ({ railId }) => events.push(`rail ${railId}`));
  train.events.on('fell', () => events.push('FELL'));
  while (true) {
    await new Promise((r) => requestAnimationFrame(() => r()));
    const t = Number(app.dataset.time);
    const st = train.state;
    if (run.choose && train.announcedJunction && run.choose[train.announcedJunction.id] !== undefined) train.chooseJunction(run.choose[train.announcedJunction.id]);
    if (run.jump && train.jumpWouldClear) train.jump();
    if (run.dive && train.diveWouldHelp) train.dive();
    if (run.rocketAt !== undefined && !rocketFired && st.railId === run.rail && train.frontS >= run.rocketAt) rocketFired = train.startRocket();
    if (st.railId === run.until.after) seenAfter = true;
    if (t >= next) {
      next = t + 0.1;
      samples += 1;
      if (!train.isFalling && train.carLiftErr > max) {
        max = train.carLiftErr;
        at = `${st.railId} ${train.frontS.toFixed(1)}`;
      }
    }
    if (train.isFalling) break;
    if (seenAfter && st.railId === run.until.rail && st.s >= run.until.s) break;
    if (t - t0 > run.seconds) break;
  }
  train.setNotch(1);
  return { max, at, samples, events, end: `${train.state.railId} ${train.frontS.toFixed(1)}`, fell: train.isFalling };
}

/** In the page: one run of (3). */
async function retraceOne(run) {
  const train = window.__debugTrain;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  train.rewindTo(run.at, run.rail);
  await frame();
  train.setNotch(3);
  const ahead = [];
  const rails = [];
  let seenAfter = !run.until.after;
  let t0 = performance.now();
  while (performance.now() - t0 < 120000) {
    await frame();
    const j = train.announcedJunction;
    if (j && run.choose[j.id]) train.chooseJunction(run.choose[j.id]);
    const pose = train.getPose();
    ahead.push({ x: train.trail.head, cars: [pose.position, ...pose.cars.map((c) => c.position)].map((p) => [p.x, p.y, p.z]), rail: train.state.railId });
    if (train.state.railId === run.until.after) seenAfter = true;
    if (seenAfter && train.state.railId === run.until.rail && train.state.s >= run.until.s) break;
  }
  train.setNotch(1);
  t0 = performance.now();
  while (train.state.speed > 0 && performance.now() - t0 < 60000) await frame();
  const turned = train.pressSwitch();
  for (let i = 0; i < 20; i++) await frame();
  train.setNotch(3);
  let max = 0;
  let at = '';
  let samples = 0;
  // Going forward, the lead car's front bogie (4 m ahead of its centre, past the trail's head) runs on along the rail
  // it is on until the lead car centre changes rail (as before PR7): up to 4 m before a branch taken it is a little
  // off the branch. Retracing it is on the branch (the way back is known). Those samples are kept apart.
  const changes = [];
  for (let i = 1; i < ahead.length; i++) if (ahead[i].rail !== ahead[i - 1].rail) changes.push(ahead[i].x);
  const bogie = 4;
  let lead = 0;
  let leadAt = '';
  const railsBack = [];
  t0 = performance.now();
  while (performance.now() - t0 < 180000) {
    await frame();
    const x = train.trail.head;
    let k = ahead.findIndex((a) => a.x >= x);
    if (k > 0) {
      const a = ahead[k - 1];
      const b = ahead[k];
      const u = b.x - a.x > 1e-9 ? (x - a.x) / (b.x - a.x) : 0;
      const pose = train.getPose();
      [pose.position, ...pose.cars.map((c) => c.position)].forEach((p, i) => {
        const q = a.cars[i].map((v, n) => v + (b.cars[i][n] - v) * u);
        const d = Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
        if (i === 0 && changes.some((c) => x >= c - bogie - 1 && x <= c + 1)) {
          if (d > lead) {
            lead = d;
            leadAt = `${train.state.railId} ${train.state.s.toFixed(1)}`;
          }
        } else if (d > max) {
          max = d;
          at = `${train.state.railId} ${train.state.s.toFixed(1)} car ${i}`;
        }
      });
      samples += 1;
    }
    if (railsBack[railsBack.length - 1] !== train.state.railId) railsBack.push(train.state.railId);
    if (train.atReverseStop) break;
  }
  for (const a of ahead) if (rails[rails.length - 1] !== a.rail) rails.push(a.rail);
  const result = { turned: `${turned}${turned === 'turned' ? '' : ` (${train.inputLock ?? 'speed ' + train.state.speed.toFixed(2)} falling ${!!train.falling} emergency ${!!train.emergency} turnT ${train.turnT} at ${train.state.railId} ${train.state.s.toFixed(1)})`}`, max, at, lead, leadAt, samples, forward: rails.join(' → '), back: railsBack.join(' → '), stop: train.lastReverseStop };
  train.setNotch(1);
  return result;
}

const started = Date.now();
let bad = 0;
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  console.log(`(1) placement: every rail every ${STEP} m; trail vs the old rule (m). "join" = within 40 m after a rail's fed start`);
  console.log('stage  points  elsewhere max (at)            join zone: max sideways / up-down / along (at)');
  for (const stage of stages) {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    page.on('pageerror', (e) => console.error(`  [${stage.id}] ${e.message}`));
    await page.goto(`${origin}/?stage=${stage.id}`);
    await page.waitForSelector('#app[data-ready="1"]', { state: 'attached', timeout: 120_000 });
    const rows = await page.evaluate(placeAll, [STEP, JOIN_ZONE]);
    const out = rows.filter((r) => !r.joinZone);
    const zone = rows.filter((r) => r.joinZone);
    const worst = out.reduce((a, r) => (r.dist > (a?.dist ?? -1) ? r : a), null);
    const zs = zone.reduce((a, r) => (r.side > (a?.side ?? -1) ? r : a), null);
    const zu = Math.max(0, ...zone.map((r) => r.up));
    const za = Math.max(0, ...zone.map((r) => r.along));
    const where = (r) => (r ? `${r.rail} ${r.front} car ${r.car}` : '-');
    if (worst && worst.dist > PLACE_TOLERANCE) bad++;
    console.log(
      `${stage.id.padEnd(6)} ${String(rows.length / 2).padStart(6)}  ${(worst ? worst.dist.toFixed(3) : '0.000').padStart(6)} (${where(worst)})`.padEnd(46) +
        `  ${zs ? `${zs.side.toFixed(2)} / ${zu.toFixed(2)} / ${za.toFixed(2)} (${where(zs)})` : '-'}${worst && worst.dist > PLACE_TOLERANCE ? '  OUT OF BOUNDS' : ''}`,
    );
    await page.close();
  }

  console.log(`\n(2) runs: the trailing cars' height against the lead car's at the same trail distance, every 0.1 s (up to ${LIFT_TOLERANCE} m)`);
  for (const run of RUNS) {
    if (wanted.length > 0 && !wanted.includes(run.stage)) continue;
    const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    page.on('pageerror', (e) => console.error(`  [${run.stage}] ${e.message}`));
    await page.goto(`${origin}/?stage=${run.stage}`);
    await page.waitForSelector('#app[data-ready="1"]', { state: 'attached', timeout: 120_000 });
    const r = await page.evaluate(runOne, run);
    const over = r.max > LIFT_TOLERANCE || r.fell;
    if (over) bad++;
    console.log(`${run.stage} ${run.name}: max ${r.max.toFixed(3)} m${r.at ? ` (front ${r.at})` : ''}, ${r.samples} samples, ended ${r.end}${r.fell ? ' FELL' : ''}${over ? '  OUT OF BOUNDS' : ''}`);
    console.log(`    ${r.events.join(', ')}`);
    await page.close();
  }

  console.log(`\n(3) retracing: each car against where it was at the same trail distance going forward, every frame (up to ${LIFT_TOLERANCE} m)`);
  for (const run of RETRACES) {
    if (wanted.length > 0 && !wanted.includes(run.stage)) continue;
    const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    page.on('pageerror', (e) => console.error(`  [${run.stage}] ${e.message}`));
    await page.goto(`${origin}/?stage=${run.stage}`);
    await page.waitForSelector('#app[data-ready="1"]', { state: 'attached', timeout: 120_000 });
    // The switch is there once うしろむき is learned (the test course has it; a stage's title screen does not ask).
    await page.evaluate(() => window.__debugView.onStageEvent({ type: 'ability', id: 'reverse' }));
    const r = await page.evaluate(retraceOne, run);
    const back = r.back.split(' → ').reverse().join(' → ');
    const over = r.max > LIFT_TOLERANCE || back !== r.forward || r.turned !== 'turned';
    if (r.turned !== 'turned') console.log(`    the switch: ${r.turned}`);
    if (over) bad++;
    console.log(`${run.stage} ${run.name}: max ${r.max.toFixed(3)} m${r.at ? ` (${r.at})` : ''}, ${r.samples} frames; forward ${r.forward}; back ${r.back}; stopped: ${r.stop}${over ? '  OUT OF BOUNDS' : ''}`);
    if (r.lead > 0) console.log(`    lead car, 4 m before a branch taken (forward its front bogie was still on the old rail): ${r.lead.toFixed(3)} m (${r.leadAt})`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${bad === 0 ? 'OK' : `${bad} out of bounds`} (${Math.round((Date.now() - started) / 1000)} s)`);
process.exit(bad === 0 ? 0 : 1);
