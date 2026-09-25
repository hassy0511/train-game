#!/usr/bin/env node
/**
 * Rendering budget probe (TECH_SPEC §6: at most 200 draw calls and 100,000 triangles per frame):
 *   npm run budget                 # every playable stage
 *   npm run budget -- 1-2 2-1      # just some
 * For each stage (src/stages/*.json without "hidden") and each camera, puts the train on every rail every 50 m
 * (every 20 m within 60 m of a station), draws one frame and reads renderer.info. Prints the heaviest frames per
 * stage and camera, the worst one of each with its draw calls and triangles per object, and exits 1 when any
 * frame is over budget.
 * Every camera is measured everywhere, also where a stage zone would pick the view for the player, so the probe
 * errs on the heavy side. The opening is not started: actors stand where the stage JSON puts them.
 * Runs the dev server, since the __debugView / __debugTrain handles only exist in dev builds.
 * Needs Playwright's Chromium (PW_CHROMIUM_PATH to reuse an installed one). BUDGET_ROWS=40 lists more objects.
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const MAX_CALLS = 200;
const MAX_TRIANGLES = 100_000;
const CAMERAS = ['cab', 'chase', 'side', 'top'];
/** Spacing of the probe points along a rail (m), and the finer one near stations. */
const STEP = 50;
const STATION_STEP = 20;
const STATION_REACH = 60;
/** Rows of the per-object breakdown printed for each worst frame (the rest are summed up in one line). */
const BREAKDOWN_ROWS = Number(process.env.BUDGET_ROWS) || 12;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageDir = resolve(root, 'src/stages');
const playable = readdirSync(stageDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(resolve(stageDir, file), 'utf8')))
  .filter((stage) => !stage.hidden)
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
const wanted = process.argv.slice(2);
for (const id of wanted) {
  if (!playable.some((stage) => stage.id === id)) {
    console.error(`no playable stage ${id} (have: ${playable.map((stage) => stage.id).join(', ')})`);
    process.exit(2);
  }
}
const stages = wanted.length > 0 ? playable.filter((stage) => wanted.includes(stage.id)) : playable;

/** Front positions (m) to probe on one rail: the regular steps plus the finer ones around its stations. */
function probePoints(rail, stations) {
  const points = new Set();
  const add = (s) => {
    if (rail.loop) points.add(Math.round((((s % rail.length) + rail.length) % rail.length) * 10) / 10);
    else if (s >= 0 && s <= rail.length) points.add(Math.round(s * 10) / 10);
  };
  for (let s = 0; s < rail.length; s += STEP) add(s);
  if (!rail.loop) add(Math.floor(rail.length));
  for (const station of stations) {
    for (let d = -STATION_REACH; d <= STATION_REACH; d += STATION_STEP) add(station.at + d);
  }
  return [...points].sort((a, b) => a - b);
}

const server = spawn(resolve(root, 'node_modules/.bin/vite'), ['--port', '5195', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
const origin = await new Promise((ok, fail) => {
  let out = '';
  server.stdout.on('data', (d) => {
    // Vite moves to the next free port when this one is taken, so read the address it prints.
    out += String(d).replace(/\x1b\[[0-9;]*m/g, '');
    const match = out.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) ok(match[0]);
  });
  server.on('exit', (code) => fail(new Error(`vite exited ${code}`)));
});

/** In the page: counts draw calls and triangles per object, by wrapping the renderer's draw and its info. */
function instrument() {
  const view = window.__debugView;
  const renderer = view.renderer;
  const scene = view.getScene();
  const names = new WeakMap();
  const clean = (name) => name.split(':')[0].replace(/-\d+$/, '');
  /** "<scene child> / <item under it>", e.g. "props / house-a", "actors / stations", "train / partner". */
  const label = (object) => {
    const cached = names.get(object);
    if (cached) return cached;
    const path = [];
    for (let o = object; o && o !== scene; o = o.parent) path.unshift(o);
    const top = path[0];
    // The item: the first real name below the scene child (baked meshes and glTF roots carry generic ones).
    const named = path.slice(1).find((o) => o.name && !o.name.startsWith('baked') && o.name !== 'Scene');
    const item = named ? clean(named.name) : '';
    const key = `${clean(top.name || top.type)}${item ? ` / ${item}` : ''}`;
    names.set(object, key);
    return key;
  };
  let current = null;
  let tally = null;
  const draw = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (...args) {
    current = args[4];
    try {
      return draw.apply(this, args);
    } finally {
      current = null;
    }
  };
  const info = renderer.info;
  const update = info.update;
  info.update = function (...args) {
    const before = info.render.triangles;
    update.apply(this, args);
    if (!tally || !current) return;
    const key = label(current);
    const row = tally.get(key) ?? { calls: 0, tris: 0 };
    row.calls += 1;
    row.tris += info.render.triangles - before;
    tally.set(key, row);
  };

  const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
  /** Puts the train at `s` on `railId` and returns one measured frame per camera. */
  window.__probeAt = async (railId, s, cameras) => {
    window.__debugTrain.rewindTo(s, railId);
    // The game applies the stage's camera zones on its next tick; the probe's camera goes on after that.
    await frame();
    const out = [];
    for (const camera of cameras) {
      view.setCamera(camera, true);
      tally = new Map();
      // The game's frame runs before this callback (it asked for it first), so info holds that frame.
      await frame();
      const { calls, triangles } = renderer.info.render;
      out.push({ camera, calls, tris: triangles, objects: [...tally] });
      tally = null;
    }
    return out;
  };
  return [...window.__debugTrain.network.rails.values()].map((rail) => ({
    id: rail.id,
    length: rail.length,
    loop: rail.end.type === 'merge' && rail.end.railId === rail.id,
  }));
}

const k = (tris) => `${(tris / 1000).toFixed(1)}k`;
const over = (f) => f.calls > MAX_CALLS || f.tris > MAX_TRIANGLES;
/** A frame's load against the budget: 1 = exactly at the limit of calls or triangles, whichever is nearer. */
const load = (f) => Math.max(f.calls / MAX_CALLS, f.tris / MAX_TRIANGLES);

const started = Date.now();
/** Per stage and camera: frames measured, the heaviest by calls, by triangles and against the budget. */
const results = [];
const failures = [];
let pageErrors = 0;
let browser = null;
try {
  browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  for (const stage of stages) {
    // Same size as the smoke tests (iPad Pro 11" landscape, DPR 1): the view's aspect decides what is culled.
    const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    page.on('pageerror', (e) => {
      pageErrors += 1;
      console.error(`  [${stage.id}] ${e.message}`);
    });
    await page.goto(`${origin}/?stage=${stage.id}`);
    await page.waitForSelector('#app[data-ready="1"]', { state: 'attached', timeout: 120_000 });
    const rails = await page.evaluate(instrument);
    const byCamera = new Map(CAMERAS.map((camera) => [camera, { stage: stage.id, camera, frames: 0, calls: null, tris: null, worst: null }]));
    let points = 0;
    for (const rail of rails) {
      const stations = stage.stations.filter((station) => station.railId === rail.id);
      for (const s of probePoints(rail, stations)) {
        points += 1;
        const frames = await page.evaluate(([id, at, cameras]) => window.__probeAt(id, at, cameras), [rail.id, s, CAMERAS]);
        for (const f of frames) {
          const frame = { ...f, stage: stage.id, rail: rail.id, s };
          const row = byCamera.get(f.camera);
          row.frames += 1;
          if (!row.calls || f.calls > row.calls.calls) row.calls = frame;
          if (!row.tris || f.tris > row.tris.tris) row.tris = frame;
          if (!row.worst || load(f) > load(row.worst)) row.worst = frame;
          if (over(f)) failures.push(frame);
        }
      }
    }
    console.log(`stage ${stage.id}: ${rails.map((r) => `${r.id} ${Math.round(r.length)} m`).join(', ')}; ${points} points × ${CAMERAS.length} cameras`);
    for (const row of byCamera.values()) results.push({ ...row, stage: stage.id });
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
}

const at = (f) => `${f.rail} ${f.s}`;
console.log(`\nheaviest frames (budget ${MAX_CALLS} calls, ${k(MAX_TRIANGLES)} triangles)`);
console.log('stage  camera  frames   calls (at)            triangles (at)');
for (const r of results) {
  const calls = `${String(r.calls.calls).padStart(4)} (${at(r.calls)})`;
  const tris = `${k(r.tris.tris).padStart(6)} (${at(r.tris)})`;
  console.log(`${r.stage.padEnd(6)} ${r.camera.padEnd(7)} ${String(r.frames).padStart(6)}   ${calls.padEnd(21)} ${tris}`);
}

console.log('\nworst frame per stage and camera (nearest the budget), by object: calls, triangles');
for (const r of results) {
  const w = r.worst;
  console.log(`${r.stage} ${r.camera} at ${at(w)}: ${w.calls} calls, ${k(w.tris)} triangles${over(w) ? '  OVER BUDGET' : ''}`);
  const rows = [...w.objects].sort((a, b) => b[1].calls - a[1].calls || b[1].tris - a[1].tris);
  for (const [name, v] of rows.slice(0, BREAKDOWN_ROWS)) console.log(`  ${String(v.calls).padStart(4)} ${k(v.tris).padStart(7)}  ${name}`);
  const rest = rows.slice(BREAKDOWN_ROWS);
  if (rest.length > 0) {
    const calls = rest.reduce((sum, [, v]) => sum + v.calls, 0);
    const tris = rest.reduce((sum, [, v]) => sum + v.tris, 0);
    console.log(`  ${String(calls).padStart(4)} ${k(tris).padStart(7)}  (${rest.length} more)`);
  }
}

const seconds = Math.round((Date.now() - started) / 1000);
if (pageErrors > 0) console.error(`\n${pageErrors} page error(s) while probing (see above)`);
if (failures.length > 0) {
  console.error(`\nOVER BUDGET: ${failures.length} frame(s) (${seconds} s)`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f.stage} ${f.camera.padEnd(6)} ${at(f)}: ${f.calls} calls, ${k(f.tris)} triangles`);
  process.exit(1);
}
console.log(`\nOK: every frame within ${MAX_CALLS} calls and ${k(MAX_TRIANGLES)} triangles (${seconds} s)`);
if (pageErrors > 0) process.exit(1);
