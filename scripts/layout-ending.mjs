#!/usr/bin/env node
/**
 * Writes src/movies/ending.json: the ending movie "つながった ワールドレール" (renamed 2026-10-07 by だいさん; the map's world end keeps 「せかいの わ」) (v1.12 えんしゅつ, docs/STAGE_SCHEMA.md §25).
 *   node scripts/layout-ending.mjs
 *
 * A small diorama: six round islands in a calm sea, one for each chapter, on a ring of rail (radius RING m, one loop
 * rail "wa"), the last stretch from the castle back to the town a rainbow arching over the water. The Wonder train
 * runs once round from the headquarters and stops there again. The movie (cutscene "movie"): the shot list below.
 *
 * Conventions as scripts/layout-lib.mjs: y up, heading 0 = +Z, a left turn goes towards +X; `lateral` positive to the
 * right of the way the train runs. The ring turns left, so lateral + is OUTSIDE the ring (where the camera mostly is).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Line, RAD, pretty, round } from './layout-lib.mjs';

const RING = 92;
/** Rail top on the islands and the bridges (m); the islands' ground is at 0, the sea at SEA. */
const RAIL_Y = 0.45;
const SEA = -1.6;
/** The rainbow: from the castle island's edge to the town's (degrees round the ring) and how high it arches (m). */
const BOW = { from: 294, to: 342, height: 10 };

// ---- the rail: a horizontal circle, the rainbow lifting it ----------------------------------------------------
const lift = (deg) => {
  if (deg <= BOW.from || deg >= BOW.to) return 0;
  const t = (deg - BOW.from) / (BOW.to - BOW.from);
  return (BOW.height * (1 - Math.cos(2 * Math.PI * t))) / 2;
};
const pts = [];
let s = 0;
for (let i = 0; i <= 3600; i++) {
  const deg = i / 10;
  const p = { x: RING * Math.sin(deg * RAD), y: RAIL_Y + lift(deg), z: RING * Math.cos(deg * RAD) };
  if (i > 0) {
    const q = pts[pts.length - 1];
    s += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  }
  pts.push({ ...p, s, deg });
}
// Exactly closed (the last point is the first).
pts[pts.length - 1] = { ...pts[0], s, deg: 360 };
const line = new Line('wa', pts);
const L = line.length;
/** s (m) at a ring angle (degrees). */
const sAt = (deg) => {
  const d = ((deg % 360) + 360) % 360;
  const i = Math.round(d * 10);
  return pts[i].s;
};
/** A world place `lateral` m right of the rail (outside the ring) at ring angle `deg`, at height y (default ground). */
const at = (deg, lateral, y = 0) => {
  const q = line.point(sAt(deg), lateral);
  return [round(q.x, 2), round(y, 2), round(q.z, 2)];
};
/** World rotationY (degrees) for something facing `turn` degrees off the way the train runs (0: along it). */
const yawAt = (deg, turn = 0) => round(line.at(sAt(deg)).h / RAD + turn, 1);
const OUT = -90; // facing out of the ring (to the right of the way: rotationY turns +Z towards +X, the left)
const IN = 90;

// ---- the islands ------------------------------------------------------------------------------------------------
const ISLES = [
  { id: 1, model: 'ring-isle-town', deg: 0, r: 34 },
  { id: 2, model: 'ring-isle-forest', deg: 58, r: 30 },
  { id: 3, model: 'ring-isle-sea', deg: 113, r: 28 },
  { id: 4, model: 'ring-isle-snow', deg: 166, r: 28 },
  { id: 5, model: 'ring-isle-night', deg: 220, r: 30 },
  { id: 6, model: 'ring-isle-castle', deg: 275, r: 30 },
];
const props = [];
const prop = (model, deg, lateral, turn = 0, extra = {}) => {
  const { y = 0, scale, ...rest } = extra;
  props.push({ model, position: at(deg, lateral, y), rotationY: yawAt(deg, turn), ...(scale ? { scale } : {}), ...rest });
};
for (const isle of ISLES) props.push({ model: isle.model, position: at(isle.deg, 0, 0), rotationY: round(isle.deg * 7, 1) });

// 1 はじまりの まち (chapter 1: the town, the dino valley, the clouds): the headquarters by the stop, houses, the
// dinosaurs' corner past it, a cloud or two over it.
prop('hq', -4, -24, OUT);
prop('house-a', -20, -14, OUT);
prop('house-b', -12, 18, IN);
prop('shop', 6, -16, OUT);
prop('tower', -16, -30, OUT);
prop('tree-a', -14, 12, 0);
prop('tree-b', -2, 14, 0);
prop('tree-a', 6, 30, 0);
prop('tree-b', -24, 20, 0);
prop('cycad', 12, 16, 0);
prop('fern-a', 15, 9, 0);
prop('fern-b', 9, 10, 30);
prop('cycad', 17, -12, 0);
prop('fern-a', 14, -8, 0);
prop('rock-a', 19, 13, 0);
prop('dino-egg', 13, 11.5, 0);
props.push({ model: 'cloud-a', position: [round(at(-8, -10)[0], 2), 22, round(at(-8, -10)[2], 2)], rotationY: 30 });
props.push({ model: 'cloud-b', position: [round(at(12, -26)[0], 2), 26, round(at(12, -26)[2], 2)], rotationY: 70 });

// 2 いきものの せかい (chapter 2: the big trees, the meadow, the volcano): a big tree inside the ring, giant flowers
// and clover outside (the meadow seen small), a little volcano across the island.
prop('tree-trunk', 54, -18, 0, { scale: 0.16 });
prop('canopy', 54, -18, 0, { scale: 0.16, y: 0.16 * 90 - 3 });
prop('meadow-flower', 62, 15, 0, { scale: 0.16 });
prop('meadow-flower', 49, 18, 40, { scale: 0.12 });
prop('clover', 66, 9, 0, { scale: 0.22 });
prop('acorn-big', 57, 7.5, 0, { scale: 0.5 });
prop('volcano', 70, -14, 0, { scale: 0.032 });
prop('mushroom', 52, 9, 0);
prop('tree-b', 46, -8, 0);
prop('tree-a', 64, -9, 0);

// 3 みずの せかい (chapter 3: the sea, the river): palms on the sand, a little lighthouse at the point, coral and a
// rock by the water, lily pads on the sea, a whale out at sea.
prop('palm', 106, 14, 0);
prop('palm', 120, 17, 40);
prop('palm', 112, -14, 0);
prop('lighthouse', 122, -18, 0, { scale: 0.45 });
prop('coral-a', 117, 10, 0, { scale: 0.6 });
prop('river-rock', 108, 8, 0, { scale: 0.8 });
prop('lily-pad', 102, 30, 0, { y: SEA + 0.02, scale: 0.5 });
prop('lily-pad', 105, 33, 30, { y: SEA + 0.02, scale: 0.35 });
props.push({ model: 'whale', position: [...at(118, 52, SEA - 1.5)], rotationY: yawAt(118, 160) });

// 4 こおりと ゆき (chapter 4): snowy pines, a snow house and a kamakura, a snowman by the line.
prop('snow-pine', 158, 14, 0);
prop('snow-pine', 172, 15, 0);
prop('snow-pine', 162, -16, 0);
prop('snow-pine', 176, -10, 0);
prop('snow-house', 168, -18, OUT, { scale: 0.7 });
prop('kamakura', 156, -10, OUT);
prop('snowman', 173, 8, OUT);
prop('ice-hut', 152, 18, IN, { scale: 0.8 });

// 5 ふしぎな せかい (chapter 5: the night forest, the toy town, the mirror world): dark trees and glowing mushrooms,
// block houses, a crystal tree and a big mirror (it reflects nothing here: a stand-in), fireflies.
prop('night-tree-a', 212, 15, 0, { scale: 0.7 });
prop('night-tree-b', 206, -12, 0, { scale: 0.6 });
prop('night-bush', 214, 8.5, 0, { scale: 0.7 });
prop('glow-mushroom', 216, 7.5, 0, { scale: 1.4 });
prop('glow-mushroom', 210, 9.5, 0, { scale: 1.1 });
prop('block-house-a', 226, -16, OUT, { scale: 0.6 });
prop('block-house-b', 232, -10, OUT, { scale: 0.6 });
prop('toy-block-train', 228, 9, 30);
prop('mirror-frame', 233, 16, IN, { scale: 0.32 });
prop('crystal-tree-a', 236, 10, 0);
prop('crystal-tree-b', 221, -8, 0, { scale: 0.7 });
props.push({ model: 'firefly-swarm', position: [...at(213, 12, 1)], rotationY: 0 });

// 6 さかさまの しろ (chapter 6): 6-1's upside-down castle ("sakasa-castle" at 0.42 of its size: as tall as the stand-in was), pink-roofed with its
// swirl, an upside-down birdhouse and Sakasa's doodle by the line.
prop('sakasa-castle', 275, -15, OUT, { scale: 0.42 });
prop('birdhouse-upside', 268, 8, OUT, { y: 0 });
prop('sakasa-doodle', 281, 9, OUT);
prop('tree-b', 266, 16, 0);
prop('tree-a', 285, -6, 0);
prop('tree-b', 289, 14, 0);

// ---- the figures the movie brings on (they move: the props above stand still) ----------------------------------
/** Where each creature stands: ring angle, lateral, which way it looks (degrees off the train's way), its size. */
const CREATURES = {
  dino: { model: 'dino-mid-stand', deg: 16, lat: 11, turn: -120 },
  'dino-small': { model: 'dino-small-walk', deg: 19.5, lat: 6.5, turn: -140 },
  squirrel: { model: 'squirrel', deg: 59.5, lat: 6.2, turn: -110 },
  butterfly: { model: 'butterfly', deg: 62.5, lat: 9, turn: -60, scale: 0.35, y: 1.6 },
  seal: { model: 'seal', deg: 115, lat: 6.5, turn: -120 },
  hare: { model: 'snow-hare', deg: 168, lat: 5.6, turn: -115, scale: 1.4 },
  tanuki: { model: 'tanuki', deg: 218, lat: 5.6, turn: -115, scale: 1.3 },
  chick: { model: 'windup-chick', deg: 224, lat: 6, turn: -120 },
};
const spawnSteps = Object.entries(CREATURES).map(([id, c]) => ({
  spawn: id,
  model: c.model,
  position: at(c.deg, c.lat, c.y ?? 0),
  rotationY: yawAt(c.deg, c.turn),
  ...(c.scale ? { scale: c.scale } : {}),
}));

// ---- the movie ------------------------------------------------------------------------------------------------------
/** Where the train stands at the start and stops at the end (its front), by the headquarters. */
const HOME = round(sAt(4), 1);
/** The train's speed round the ring (m/s). */
const SPEED = 10;
/** s a little before a ring angle (the train front reaches it `ahead` m later). */
const before = (deg, ahead) => round((sAt(deg) - ahead + L) % L, 1);
const CENTER = [0, 2, 0];
/** Ring angle below Sakasa's window (the second car's middle is 18.5 m behind the front; her window 1.65 m ahead of it). */
const UNDER_WINDOW = 4 - (18.5 - 1.65) / RING / RAD;

const movie = [
  { letterbox: true },
  ...spawnSteps,
  // Sakasa rides in the second car, standing on a seat at a window on the camera's side (she faces out: -X).
  { spawn: 'sakasa', model: 'amanojaku', ride: { car: 1, at: [-0.95, 1.5, 1.65] }, rotationY: -90 },

  // 1. The ring of the worlds, from far out and high, turning slowly; the train waits by the headquarters.
  { beat: 'ring' },
  { shot: 'wide', target: CENTER, distance: 255, angle: 200, height: 30, world: true, orbit: 24, hold: 9 },
  { fade: 'in', seconds: 2.5 },
  { say: 'せかいを ぐるっと いっしゅう しよう！' },

  // 2. Off it goes: beside the train, then behind it as it leaves the town.
  { beat: 'depart' },
  { shot: 'medium', target: 'train', angle: 62, height: 10, distance: 34 },
  { drive: { speed: SPEED } },
  { wait: 1.6 },
  { shot: 'medium', target: 'train', angle: 150, height: 28, distance: 32, seconds: 3 },

  // 3. Chapter 1: the dinosaurs watch it go by; the big one bows, the little one hops.
  { trainAt: before(16, 34) },
  { beat: 'dino' },
  { shot: 'close', target: 'dino', angle: 25, height: 6, side: -0.25, distance: 9.5, push: 0.15, hold: 5 },
  { act: 'turn', id: 'dino-small', toward: 'train', seconds: 0.8, nowait: true },
  { act: 'nod', id: 'dino', times: 2 },
  { act: 'hop', id: 'dino-small', times: 3 },

  // 4. Chapter 2: the squirrel on its big acorn hops, the butterfly flutters.
  { trainAt: before(59.5, 30) },
  { beat: 'squirrel' },
  { shot: 'close', target: 'squirrel', angle: 20, height: 6, side: 0.25, push: 0.12, hold: 4 },
  { act: 'hop', id: 'squirrel', times: 3 },
  { act: 'wiggle', id: 'butterfly', times: 4, nowait: true },
  { wait: 0.6 },
  { act: 'turn', id: 'squirrel', toward: 'train', seconds: 0.6 },

  // 5. Chapter 3: the seal by the water waggles hello; the whale out at sea.
  { trainAt: before(115, 28) },
  { beat: 'seal' },
  { shot: 'close', target: 'seal', angle: 30, height: 7, side: -0.2, push: 0.12, hold: 4 },
  { act: 'wiggle', id: 'seal', times: 4 },
  { act: 'nod', id: 'seal', times: 1 },

  // 6. Chapter 4: the snow hare hops in the snow.
  { trainAt: before(168, 28) },
  { beat: 'hare' },
  { shot: 'close', target: 'hare', angle: 18, height: 6, side: 0.2, push: 0.12, hold: 4 },
  { act: 'hop', id: 'hare', times: 4 },

  // 7. Chapter 5: the little tanuki bows, the wind-up chick hops.
  { trainAt: before(218, 28) },
  { beat: 'tanuki' },
  { shot: 'close', target: 'tanuki', angle: 22, height: 6, side: -0.2, push: 0.12, hold: 3.5 },
  { act: 'nod', id: 'tanuki', times: 2 },
  { wait: 1.6 },
  { beat: 'chick' },
  { shot: 'close', target: 'chick', angle: 340, height: 8, side: 0.2, seconds: 1.4 },
  { act: 'hop', id: 'chick', times: 3 },

  // 8. Chapter 6: past the upside-down castle; Sakasa waves to it from her window.
  { trainAt: before(270, 20) },
  { beat: 'castle' },
  { shot: 'medium', target: 'train', angle: -70, height: 12, distance: 46 },
  { act: 'wave', id: 'sakasa' },
  { wait: 3 },
  { beat: 'sakasa' },
  { shot: 'close', target: 'sakasa', angle: 0, height: 4, distance: 3.4, push: 0.08, hold: 4 },
  { say: 'さかさまの おしろ、またね なのだ！', who: 'amanojaku' },

  // 9. Over the rainbow, back to the town.
  { trainAt: before(BOW.from + 6, 0) },
  { beat: 'rainbow' },
  { shot: 'medium', target: 'train', angle: 95, height: 6, distance: 70, reach: 2 },
  { wait: 2 },
  { shot: 'medium', target: 'train', angle: 120, height: 10, distance: 48, seconds: 3.5 },
  { drive: { speed: SPEED, stopAt: HOME } },
  { trainAt: before(-12, 0) },

  // 10. Home: the partner hops out and cheers; Sakasa waves from her window; both together.
  { beat: 'home' },
  { shot: 'medium', target: 'car-0', angle: 70, height: 8, distance: 20 },
  { trainAt: HOME, max: 20 },
  { spawn: 'piko', model: 'partner', position: at(4 - 6 / RING / RAD, 1.6, RAIL_Y + 0.6), rotationY: yawAt(4, OUT) },
  { move: 'piko', position: at(4 - 6 / RING / RAD, 3.4, 0), seconds: 0.7, bob: true },
  { beat: 'piko' },
  { shot: 'close', target: 'piko', angle: 0, height: 8, push: 0.1, hold: 4 },
  { act: 'cheer', id: 'piko', times: 2, nowait: true },
  { say: 'ぜんぶの せかいが つながったね！' },
  { beat: 'window' },
  { shot: 'close', target: 'sakasa', angle: 0, height: 4, distance: 3.2 },
  { say: 'みんな、ありがとう なのだ！', who: 'amanojaku' },
  // The partner hops along to below her window: both in one picture.
  { beat: 'together' },
  { move: 'piko', position: at(UNDER_WINDOW, 3.6, 0), seconds: 1.6, bob: true, face: true, nowait: true },
  { shot: 'medium', target: at(UNDER_WINDOW, 2, 1.25), angle: yawAt(UNDER_WINDOW, OUT + 8), height: 10, distance: 9, seconds: 1.8 },
  { act: 'turn', id: 'piko', toward: 'sakasa', seconds: 0.5 },
  { say: 'サカサ、いっしょに いおう！' },
  { act: 'turn', id: 'piko', toward: 'camera', seconds: 0.4 },
  { act: 'jump', id: 'piko', nowait: true },
  { say: 'ワンダーごう、しゅっぱつ！', who: 'amanojaku' },
  { move: 'piko', position: at(4 - 6 / RING / RAD, 1.6, RAIL_Y + 0.6), seconds: 1.4, bob: true, face: true },
  { remove: 'piko' },

  // 11. Away again, and the camera rises far out over the whole ring.
  { beat: 'pullback' },
  { drive: { speed: SPEED } },
  { wait: 1 },
  { shot: 'wide', target: CENTER, distance: 280, angle: 160, height: 34, world: true, seconds: 8, ease: 'inOut', orbit: 10, hold: 10 },
  { beat: 'end' },
  { wait: 2 },
];

const file = {
  schemaVersion: 1,
  id: 'ending',
  title: 'つながった ワールドレール',
  chapter: 0,
  hidden: true,
  // Opened by the game once 6-2 is cleared (the かくにん list opens it any time).
  unlock: { requires: ['6-2'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#6FBDF5', bottom: '#FFE6C4' },
    fog: { color: '#FFE6C4', near: 320, far: 900 },
    lighting: 'day',
    ground: { y: SEA, size: 2000, color: '#7CC6E6' },
    bgm: 'ending',
  },
  start: { railId: 'wa', at: HOME, direction: 1 },
  rails: [
    {
      id: 'wa',
      points: line.points(),
      // The bridges between the islands stand on wooden piers (the islands' own ground carries the rest).
      base: ISLES.slice(0, -1).map((isle, i) => {
        const next = ISLES[i + 1];
        return { look: 'pier', toGround: true, from: round(sAt(isle.deg) + isle.r * 0.8, 1), to: round(sAt(next.deg) - next.r * 0.8, 1) };
      }),
      end: { type: 'merge', railId: 'wa', at: 0 },
    },
  ],
  junctions: [],
  stations: [],
  props,
  actors: [],
  records: [],
  missions: [],
  gimmicks: [{ type: 'rainbow', railId: 'wa', from: round(sAt(BOW.from), 1), to: round(sAt(BOW.to), 1) }],
  cutscenes: { movie },
  movie: { play: 'movie', card: { title: 'おしまい\nワールドレールは\nぜんぶ つながった！', button: 'やったね！' } },
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/movies/ending.json');
writeFileSync(out, `${pretty(file)}\n`);
console.log(`wrote ${out}: ring ${round(L, 1)} m, home at ${HOME} m, ${props.length} props, ${movie.length} steps`);
