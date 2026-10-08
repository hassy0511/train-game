#!/usr/bin/env node
/**
 * Writes src/movies/opening.json: the opening movie 「ワンダーごうと ふしぎな せかい」 (v1.12 えんしゅつ, docs/STAGE_SCHEMA.md
 * §25; だいさん GO 2026-10-08, docs/STORY.md §4). It plays the first time a new save starts 1-1 (`movie.before`), then
 * the game goes on into 1-1.
 *   node scripts/layout-opening.mjs
 *
 * The ending's diorama (scripts/ring-diorama.mjs): six round islands in a calm sea on a ring of rail "wa", here before
 * the story, so with no rainbow (the last bridge stands on piers like the others) and glowing softly (the World Rail's
 * own light, gimmick "rail-glow"). Chapter 1's island has its own town for the opening: the headquarters inside the
 * ring with their platform and notice board, on the World Rail "sora" that comes down out of the sky over the inner
 * sea to them (it glows brighter: the camera follows it down). The Wonder train waits on it and rolls into the
 * headquarters' platform with its light on.
 *
 * Conventions as scripts/layout-lib.mjs: y up, heading 0 = +Z, a left turn goes towards +X; `lateral` positive to the
 * right of the way the train runs. The town is laid out in its own frame: `u` along the ring's way at the island (+X),
 * `v` into the ring (−Z), from the island's middle.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Line, RAD, keyed, pretty, round, walk } from './layout-lib.mjs';
import { RAIL_Y, RING, SEA, creatureSpawns, islandProps, makeRing, ringRail } from './ring-diorama.mjs';

const ring = makeRing({ rainbow: false });
const { at, yawAt } = ring;

// ---- the town's frame ---------------------------------------------------------------------------------------------
/** A world place [x, y, z] from the town's frame (u along the ring's way, v into the ring), at height y. */
const uv = (u, v, y = 0) => [round(u, 2), round(y, 2), round(RING - v, 2)];
/** The platform's top (the stations' platforms are 1 m above the rail top). */
const DECK = RAIL_Y + 1;

// ---- the World Rail "sora": from the sky down to the headquarters' platform ------------------------------------------
/**
 * Walked from the buffer stop by the headquarters back up into the sky, then turned round (the train runs down it,
 * towards the platform): a level straight through the platform at v = SORA_V, a level turn into the ring, then a long
 * climb over the inner sea to a cloud high above the ring's middle.
 */
const SORA_V = 10;
const BUFFER_U = 24;
const STRAIGHT = 48;
const TURN = { radius: 24, deg: 90 };
const CLIMB = [
  ['R', 70, 38],
  ['S', 70],
];
/** How high the climb goes (m above the rail top) and where it starts (m from the buffer). */
const TOP = 52;
const LEVEL = STRAIGHT + TURN.radius * TURN.deg * RAD + 10;
const back = walk(BUFFER_U, RING - SORA_V, -90, [['S', STRAIGHT], ['R', TURN.radius, TURN.deg], ...CLIMB], () => 0);
const backLength = back[back.length - 1].s;
/** Height by the distance from the buffer: level through the platform and the turn, then up into the sky. */
const height = keyed([
  [0, RAIL_Y],
  [LEVEL, RAIL_Y],
  [backLength, RAIL_Y + TOP],
]);
// Turned round (s from the sky down to the buffer) and measured with the heights, as the game measures it.
const soraPts = [];
for (const p of back.slice().reverse()) {
  const q = { x: p.x, y: height(p.s), z: p.z };
  const last = soraPts[soraPts.length - 1];
  soraPts.push({ ...q, s: last ? last.s + Math.hypot(q.x - last.x, q.y - last.y, q.z - last.z) : 0 });
}
const soraLine = new Line('sora', soraPts);
const SORA_L = soraLine.length;
/** s on the World Rail at a place u along its straight (the straight ends at the buffer, BUFFER_U). */
const soraAtU = (u) => round(SORA_L - (BUFFER_U - u), 1);
/** A world place on (or `lateral` m right of, `up` m above) the World Rail at s. */
const onSora = (s, lateral = 0, up = 0) => {
  const q = soraLine.point(s, lateral, up);
  return [round(q.x, 2), round(q.y, 2), round(q.z, 2)];
};

// ---- the headquarters' platform, the train's stop ----------------------------------------------------------------
/** The train front stops here (the platform's stop line), 6 m before the buffer. */
const STOP_U = 18;
const STOP = soraAtU(STOP_U);
/** The train waits here (its front) at the start: on the level turn, out of the town, 50 m before the stop. */
const WAIT = round(STOP - 50, 1);
/** The cars' middles on the platform (u), lead first: the doors the friends walk to. */
const CAR_U = [STOP_U - 6, STOP_U - 6 - 12.5, STOP_U - 6 - 25];
/** The platform's side edge towards the train (v) and its back edge (towards the headquarters). */
const EDGE_V = SORA_V + 1.6;
const BACK_V = SORA_V + 5.2;

// ---- the town's props (chapter 1's island for the opening) -------------------------------------------------------
const props = islandProps(ring, { town: false });
const townProp = (model, u, v, rotationY = 0, extra = {}) => {
  const { y = 0, ...rest } = extra;
  props.push({ model, position: uv(u, v, y), rotationY, ...rest });
};
// The headquarters face the platform (their +Z towards the ring); their notice board stands on the platform.
const HQ = { u: -3, v: 23.2 };
townProp('hq', HQ.u, HQ.v, 0);
const BOARD = { u: 9.5, v: BACK_V - 0.35 };
townProp('notice-board', BOARD.u, BOARD.v, 0, { y: DECK });
townProp('tower', -21, 25, 0);
townProp('tree-a', -14, 23, 0);
townProp('tree-b', 10, 24, 0);
townProp('tree-a', 17, 21, 0);
// Outside the ring: houses and trees by the line (as the ending's town).
const ringProp = (model, deg, lateral, turn = 0) => props.push({ model, position: at(deg, lateral), rotationY: yawAt(deg, turn) });
ringProp('house-b', -12, 18, 90);
ringProp('house-a', 6, 17, 90);
ringProp('tree-a', -14, 12);
ringProp('tree-b', -2, 13);
ringProp('tree-a', 8, 28);
ringProp('tree-b', -24, 20);
// The World Rail's top: it goes up into a cloud.
const SKY_END = onSora(0);
props.push({ model: 'cloud-b', position: [SKY_END[0], round(SKY_END[1] - 1.5, 2), SKY_END[2]], rotationY: 20, scale: 1.6 });
props.push({ model: 'cloud-a', position: [round(SKY_END[0] + 9, 2), round(SKY_END[1] + 2, 2), round(SKY_END[2] - 6, 2)], rotationY: 60, scale: 1.3 });

// ---- the movie ------------------------------------------------------------------------------------------------------
const CENTER = [0, 2, 0];
/** World yaw (degrees, from +Z towards +X) from `from` to `to` ([x, y, z]). */
const yawTo = (from, to) => round(Math.atan2(to[0] - from[0], to[2] - from[2]) / RAD, 1);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/**
 * A shot that flies down the World Rail: it frames the rail at part `k` of its length from up the rail and above
 * (`height` degrees), `distance` m back, turned `turn` degrees off straight behind.
 */
const downRail = (k, distance, height, extra = {}) => {
  const s = SORA_L * k;
  const h = soraLine.at(s).h / RAD;
  const { turn = 0, ...rest } = extra;
  return { shot: 'medium', target: onSora(s, 0, 1), distance, angle: round(h + 180 + turn, 1), height, world: true, ...rest };
};
/** Sakasa's glimpse: on the ring's bridge from the town to the big trees' island, far ahead across the water. */
const KAGE_DEG = 31;
const KAGE = at(KAGE_DEG, 0, RAIL_Y);
/** Where Piko looks out from: the lead car's front window (the train stands at the stop). */
const CAB = uv(STOP_U - 6 + 4.25, SORA_V, RAIL_Y + 2.4);
/** The light's look: low, by the rail ahead of the stop (on the ring's side), down the straight at the train coming. */
const LOOK_AT = onSora(STOP - 34, 0, 1.6);
const LOOK_FROM = uv(STOP_U + 5, SORA_V - 6, RAIL_Y + 2.2);
/** The friends boarding: from the platform's front end at a child's eye height (under the sign's board), at the door. */
const CREW_AT = uv(STOP_U - 6.5, SORA_V + 2.6, DECK + 0.85);
const CREW_FROM = uv(STOP_U + 2, SORA_V + 5.5, DECK + 1.3);

// The friends with the team's lamp on their caps (the "passenger" model): two come out of the headquarters' side and
// walk across the platform into the lead car; one carries a parcel to the last car.
const friend = (id, u, v) => ({ spawn: id, model: 'passenger', position: uv(u, v, DECK), rotationY: 150 });
const door = (car, along = 0) => uv(CAR_U[car] + along, EDGE_V, DECK);
/** Piko looks out of the lead car's front window on the ring's side (riding the car: the window turns clear). */
const PIKO = { car: 0, at: [-0.95, 2.1, 4.25] };

const movie = [
  { letterbox: true },
  ...creatureSpawns(ring),

  // 1. Black, one line: the world is joined up by the World Rail.
  { beat: 'black' },
  { caption: 'せかいは、ワールドレールで つながっている。', seconds: 4 },

  // 2. From the sky: the six worlds in their ring, the rail glowing round them. The camera glides down over them.
  { beat: 'ring' },
  { shot: 'wide', target: CENTER, distance: 250, angle: 205, height: 32, world: true, orbit: 18, hold: 9 },
  { fade: 'in', seconds: 2.5 },
  { wait: 2.5 },
  { beat: 'dino' },
  { shot: 'close', target: 'dino', angle: 35, height: 24, side: -0.3, distance: 14, seconds: 3, push: 0.1, hold: 4, nowait: true },
  { act: 'nod', id: 'dino', times: 1, nowait: true },
  { wait: 1.5 },
  { act: 'hop', id: 'dino-small', times: 2, nowait: true },
  { say: 'きょうりゅうの たに、うみの そこ、ゆきの くに…' },
  { beat: 'squirrel' },
  { shot: 'close', target: 'squirrel', angle: 25, height: 28, side: -0.3, distance: 9, seconds: 2.4, push: 0.1, hold: 3, nowait: true },
  { act: 'hop', id: 'squirrel', times: 3, nowait: true },
  { act: 'wiggle', id: 'butterfly', times: 4, nowait: true },
  { wait: 2.6 },
  { beat: 'seal' },
  { shot: 'close', target: 'seal', angle: 30, height: 26, side: -0.3, distance: 10, seconds: 2.4, push: 0.1, hold: 3, nowait: true },
  { act: 'wiggle', id: 'seal', times: 4, nowait: true },
  { wait: 2.6 },
  { beat: 'hare' },
  { shot: 'close', target: 'hare', angle: 22, height: 26, side: -0.3, distance: 9, seconds: 2.4, push: 0.1, hold: 3, nowait: true },
  { act: 'hop', id: 'hare', times: 3, nowait: true },
  { wait: 2.6 },
  { beat: 'tanuki' },
  { shot: 'close', target: 'tanuki', angle: 26, height: 26, side: -0.3, distance: 9, seconds: 2.4, push: 0.1, hold: 4, nowait: true },
  { act: 'nod', id: 'tanuki', times: 2, nowait: true },
  { act: 'hop', id: 'chick', times: 3, nowait: true },
  { say: 'いろんな せかいが せんろで つながってるんだ！' },

  // 3. High over the ring's middle, the World Rail comes down out of a cloud: the camera flies down along it to the
  // headquarters in はじまりの まち.
  { beat: 'sky-rail' },
  downRail(0.2, 75, 14, { turn: 95 }),
  { wait: 1.6 },
  downRail(0.42, 40, 42, { turn: -15, seconds: 3.2, ease: 'in' }),
  downRail(0.5, 36, 26, { turn: -8, seconds: 2.6, ease: 'linear' }),
  { beat: 'hq' },
  { shot: 'medium', target: uv(HQ.u, HQ.v - 7.2, 6.5), distance: 44, angle: 12, height: 17, world: true, seconds: 3, ease: 'out', push: 0.12, hold: 8 },
  { say: 'ここは ワールドレール たんけんたいの ほんぶ。' },
  { say: 'せかいから せかいへ いけるのは、たんけんたいの でんしゃ だけ！' },

  // 4. The team's jobs. (a) Looking: the train comes round into the platform, its light shining along the rails.
  { beat: 'job-look' },
  { trainLight: true },
  { shot: 'medium', target: LOOK_AT, distance: round(dist(LOOK_FROM, LOOK_AT), 1), angle: yawTo(LOOK_AT, LOOK_FROM), height: 2, world: true, reach: 2 },
  { drive: { speed: 6, stopAt: STOP } },
  { wait: 0.8 },
  { say: 'たんけんたいの しごとは、せかいを しらべること。' },
  { trainAt: round(STOP - 16, 1), max: 20 },
  { shot: 'medium', target: 'car-0', angle: -40, height: 9, distance: 15, seconds: 2, nowait: true },
  { trainAt: STOP, max: 20 },
  { trainLight: false },
  // (b) Carrying people: two friends come out by the headquarters and walk across the platform into the lead car.
  { beat: 'job-crew' },
  friend('crew-a', 6.4, BACK_V - 0.5),
  friend('crew-b', 4.8, BACK_V - 0.3),
  { shot: 'medium', target: CREW_AT, distance: round(dist(CREW_FROM, CREW_AT), 1), angle: yawTo(CREW_AT, CREW_FROM), height: 3, world: true },
  { door: 'open' },
  { move: 'crew-a', position: door(0, 0.5), seconds: 2.2, bob: true, face: true, nowait: true },
  { wait: 0.6 },
  { move: 'crew-b', position: door(0, -0.4), seconds: 2.6, bob: true, face: true, nowait: true },
  { say: 'ひとや にもつを はこぶこと。' },
  { remove: 'crew-a' },
  { remove: 'crew-b' },
  // (c) Carrying things: a parcel into the last car.
  { beat: 'job-parcel' },
  friend('crew-c', CAR_U[2] - 2.6, BACK_V - 0.6),
  { spawn: 'parcel', model: 'parcel', position: uv(CAR_U[2] - 2.6, BACK_V - 1.15, DECK + 0.62), rotationY: 0 },
  { shot: 'close', target: 'crew-c', angle: 55, height: 12, distance: 8, side: -0.15 },
  { move: 'crew-c', position: door(2, -0.3), seconds: 2.4, bob: true, face: true, nowait: true },
  { move: 'parcel', position: uv(CAR_U[2] + 0.1, EDGE_V + 0.55, DECK + 0.62), seconds: 2.4, bob: true },
  { remove: 'parcel' },
  { remove: 'crew-c' },
  { door: 'close' },
  { spawn: 'piko', model: 'partner', ride: PIKO, rotationY: -90 },
  { shot: 'medium', target: 'train', angle: -55, height: 18, distance: 50, seconds: 2 },
  { say: 'ぜんぶ、せかいを『つなぐ』 しごと なんだ！' },

  // 5. The Wonder train at the platform (Piko at its front window).
  { beat: 'wonder' },
  { shot: 'close', target: 'car-0', angle: -32, height: 8, side: 0.1, push: 0.08, orbit: -10, hold: 6 },
  { act: 'hop', id: 'piko', times: 2, nowait: true },
  { say: 'これが ワンダーごう。なんでも できる でんしゃ！' },

  // 6. Piko through the front window.
  { beat: 'piko' },
  { shot: 'close', target: 'piko', angle: 8, height: 7, distance: 2.8, side: -0.22, push: 0.08, hold: 8 },
  { say: 'きみは きょうから ワンダーごうの うんてんし！' },
  { act: 'cheer', id: 'piko', times: 1, nowait: true },
  { say: 'いろんな せかいに いってみたくて、はいったんだよね！' },
  { act: 'hop', id: 'piko', times: 1, nowait: true },
  { say: 'ぼくは ピコ。きみの あいぼう！' },

  // 7. The notice board: pictures of today's jobs (a station, a friend, a parcel).
  { beat: 'board' },
  { shot: 'close', target: uv(BOARD.u, BOARD.v, DECK + 1.95), distance: 4.2, angle: 4, height: 6, world: true, push: 0.08, hold: 7 },
  { say: 'まずは はじまりの まちで、うんてんの れんしゅう。' },
  { say: 'じょうずに なったら、ほかの せかいへ しゅっぱつだ！' },

  // 8. Far ahead across the water, on the rail: a swirly hat, for a moment (a soft dusky shape, side on), and gone.
  { beat: 'hat' },
  { shot: 'medium', target: [KAGE[0], round(RAIL_Y + 1.2, 2), KAGE[2]], distance: round(dist(KAGE, CAB) * 0.7, 1), angle: yawTo(KAGE, CAB), height: 2, world: true, reach: 2 },
  { wait: 0.7 },
  { spawn: 'kage', model: 'amanojaku', position: KAGE, rotationY: yawAt(KAGE_DEG, 0), silhouette: true },
  { wait: 1.6 },
  { remove: 'kage' },
  { wait: 0.9 },
  { beat: 'what' },
  { shot: 'close', target: 'piko', angle: -12, height: 6, distance: 2.6, side: -0.22 },
  { act: 'tilt', id: 'piko', nowait: true },
  { say: '…あれ？ いま だれか いた？' },
  { beat: 'end' },
  { shot: 'medium', target: 'train', angle: -40, height: 14, distance: 42, seconds: 2.5 },
];

const file = {
  schemaVersion: 1,
  id: 'opening',
  title: 'ワンダーごうと ふしぎな せかい',
  chapter: 0,
  hidden: true,
  // Plays before the first start of 1-1 (movie.before); needs nothing, so any child who watched it may watch it again.
  unlock: { requires: [], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#6FBDF5', bottom: '#FFF1D6' },
    fog: { color: '#FFF1D6', near: 320, far: 900 },
    lighting: 'day',
    ground: { y: SEA, size: 2000, color: '#7CC6E6' },
    bgm: 'opening',
  },
  start: { railId: 'sora', at: WAIT, direction: 1 },
  rails: [
    ringRail(ring, { rainbow: false }),
    { id: 'sora', points: soraLine.points(), end: { type: 'buffer' } },
  ],
  junctions: [],
  stations: [{ id: 'honbu', name: 'たんけんたい ほんぶ', railId: 'sora', at: STOP, platformSide: 'left' }],
  props,
  actors: [],
  records: [],
  missions: [],
  gimmicks: [
    // The World Rail's light: soft round the ring, brighter on the rail down from the sky (its waves run down towards
    // the headquarters; it fades out before the town, where the train waits). The ring glows all round; its waves fit
    // it a whole number of times (no seam where it closes).
    { type: 'rail-glow', railId: 'wa', from: 0, to: round(ring.L - 0.5, 1), params: { strength: 0.35, speed: 10, spacing: round(ring.L / Math.round(ring.L / 48), 3) } },
    { type: 'rail-glow', railId: 'sora', from: 0, to: round(WAIT - 45, 1), params: { strength: 1, speed: 14, spacing: 30 } },
  ],
  cutscenes: { movie },
  movie: { play: 'movie', before: '1-1', card: { title: 'たんけんたい にゅうたい！', button: 'よろしく！', icon: 'badge' } },
};

// Checks of the layout: the World Rail keeps clear of the ring's rail, the stop is on the straight.
let nearest = Infinity;
for (let s = 0; s <= SORA_L; s += 1) {
  const p = soraLine.at(s);
  if (p.y > RAIL_Y + 4) continue;
  nearest = Math.min(nearest, Math.abs(Math.hypot(p.x, p.z) - RING));
}
if (nearest < 5) throw new Error(`the World Rail comes within ${nearest.toFixed(1)} m of the ring`);
if (STOP > SORA_L - 3 || WAIT < 40) throw new Error('the stop or the wait is off the World Rail');

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/movies/opening.json');
writeFileSync(out, `${pretty(file)}\n`);
console.log(
  `wrote ${out}: World Rail ${round(SORA_L, 1)} m (stop ${STOP}, wait ${WAIT}, top ${SKY_END.join(', ')}), nearest to the ring ${nearest.toFixed(1)} m, ${props.length} props, ${movie.length} steps`,
);
