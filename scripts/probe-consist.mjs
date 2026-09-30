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
 * (3) Reversing along the trail comes with うしろむき (PR8a).
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
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${bad === 0 ? 'OK' : `${bad} out of bounds`} (${Math.round((Date.now() - started) / 1000)} s)`);
process.exit(bad === 0 ? 0 : 1);
