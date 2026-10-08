#!/usr/bin/env node
/**
 * Writes src/movies/ending.json: the ending movie "つながった ワールドレール" (renamed 2026-10-07 by だいさん; the map's world end keeps 「せかいの わ」) (v1.12 えんしゅつ, docs/STAGE_SCHEMA.md §25).
 *   node scripts/layout-ending.mjs
 *
 * A small diorama (scripts/ring-diorama.mjs, shared with the opening movie): six round islands in a calm sea, one for
 * each chapter, on a ring of rail (radius RING m, one loop rail "wa"), the last stretch from the castle back to the
 * town a rainbow arching over the water. The Wonder train
 * runs once round from the headquarters and stops there again. The movie (cutscene "movie"): the shot list below.
 *
 * Conventions as scripts/layout-lib.mjs: y up, heading 0 = +Z, a left turn goes towards +X; `lateral` positive to the
 * right of the way the train runs. The ring turns left, so lateral + is OUTSIDE the ring (where the camera mostly is).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAD, pretty, round } from './layout-lib.mjs';
import { BOW, OUT, RAIL_Y, RING, SEA, creatureSpawns, islandProps, makeRing, rainbowGimmick, ringRail } from './ring-diorama.mjs';

// The ring with the rainbow lifting its last stretch, its islands and their props, the creatures (scripts/ring-diorama.mjs).
const ring = makeRing({ rainbow: true });
const { L, sAt, at, yawAt, before } = ring;
const props = islandProps(ring);
const spawnSteps = creatureSpawns(ring);

// ---- the movie ------------------------------------------------------------------------------------------------------
/** Where the train stands at the start and stops at the end (its front), by the headquarters. */
const HOME = round(sAt(4), 1);
/** The train's speed round the ring (m/s). */
const SPEED = 10;
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
  rails: [ringRail(ring, { rainbow: true })],
  junctions: [],
  stations: [],
  props,
  actors: [],
  records: [],
  missions: [],
  gimmicks: [rainbowGimmick(ring)],
  cutscenes: { movie },
  movie: { play: 'movie', card: { title: 'おしまい\nワールドレールは\nぜんぶ つながった！', button: 'やったね！' } },
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/movies/ending.json');
writeFileSync(out, `${pretty(file)}\n`);
console.log(`wrote ${out}: ring ${round(L, 1)} m, home at ${HOME} m, ${props.length} props, ${movie.length} steps`);
