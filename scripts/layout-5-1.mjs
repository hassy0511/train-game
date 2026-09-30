#!/usr/bin/env node
/**
 * Stage 5-1 "よるのもり": builds src/stages/5-1.json from docs/PHASE9_CHAPTER5_6.md 第 4 部 (§3–§13), read with
 * PHASE9_0 (every button works anywhere; a glow or a hush mark is only a hint) and the coordinator's 2026-09-30 notes
 * (tanuki group A at 1540, §6.2).
 *
 * The rails are the design's straights and arcs (§5.1, §5.2) walked 1 m at a time: level until the root slope, up
 * 15.4 m over 2860–2930, level again. Trees, bushes, mushrooms and the rest are placed with a seeded generator, so every
 * run writes the same file. The rails are checked against three.js's centripetal Catmull-Rom (what the game's Rail
 * measures), and every line is checked to be 20 characters at most.
 *
 * Differences from the design's text (small, noted here and in the report):
 * - the ground is at −0.6 (as the other flat forests) instead of 0, so the rails' bed shows and the log bridge's brook
 *   and the pond sit a little lower than the track;
 * - the moon is at azimuth 350°, elevation 18° (the design's 20° / 32° is out of the cab's view on the northward
 *   stretches and in the opening's camera);
 * - the fawns face across the track (rotationY −90, as 0-1), so they walk head first.
 *
 *   node scripts/layout-5-1.mjs         write src/stages/5-1.json and print the checks
 *   node scripts/layout-5-1.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 *
 * Conventions (scripts/layout-lib.mjs): three.js world, y up, +Z north. Heading 0 = +Z, a left turn goes towards +X;
 * `lateral` is positive to the right of the direction of travel.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, inArea, Line, mulberry32, pretty, RAD, round, walk, waterSpans } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/5-1.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

const GROUND_Y = -0.6;

// ---------------------------------------------------------------------------------------------------------------
// Rails (§5.1, §5.2)
// ---------------------------------------------------------------------------------------------------------------

/** §5.1 `main`: from (0, 0) north; 3,210 m. */
const MAIN_SEGMENTS = [
  ['S', 250],
  ['R', 286.5, 30],
  ['S', 300],
  ['L', 191, 30],
  ['S', 300],
  ['R', 248, 30],
  ['S', 170],
  ['R', 153, 30],
  ['S', 220],
  ['L', 191, 60],
  ['S', 350],
  ['L', 95.5, 30],
  ['S', 120],
  ['R', 95.5, 30],
  ['S', 360],
  ['R', 124, 60],
  ['S', 250],
];
const SLOPE = { from: 2860, to: 2930, rise: 15.4 };
const MAIN_Y = (s) => (s <= SLOPE.from ? 0 : s >= SLOPE.to ? SLOPE.rise : (SLOPE.rise * (s - SLOPE.from)) / (SLOPE.to - SLOPE.from));
const main = new Line('main', walk(0, 0, 0, MAIN_SEGMENTS, MAIN_Y));
check(Math.abs(main.length - 3210) < 3, `main ${main.length.toFixed(1)} m (design 3,210)`);
// The design's table (§5.1) is along the ground; s runs along the slope, a few centimetres more past it.
for (const [s, x, z] of [[250, 0, 250], [400, -38.4, 393.2], [700, -188.4, 653.0], [1100, -214.0, 1048.5], [1480, -388.2, 1375.8], [1900, -674.2, 1651.2], [2250, -674.2, 2001.2], [2830, -588.6, 2560.6], [3209.9, -867.2, 2793.2]]) {
  const p = main.at(s);
  // Past the root slope the ground distance is 1.7 m shorter than s (the table counts it flat): up to 4 m there.
  check(Math.hypot(p.x - x, p.z - z) < (s > SLOPE.to ? 4.5 : 3), `main ${s} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) (design (${x}, ${z}))`);
}
/** How far the end of main (and so the square and the great tree past it) is from the design's table. */
const END_SHIFT = (() => {
  const e = main.at(main.length);
  return { x: e.x - -867.2, z: e.z - 2793.2 };
})();

/** §5.2 the dark dead ends: a 30 m arc of 25°, then 60 m straight (90 m, `deadEnd`, a buffer). */
const KURAI_R = 30 / (25 * RAD);
const deadEnd = (id, at, turn) => {
  const p = main.at(at);
  return new Line(id, walk(p.x, p.z, p.h / RAD, [[turn, KURAI_R, 25], ['S', 60]], () => 0));
};
const HOTARU = [
  { id: 'hotaru-1', at: 2180, rail: 'kurai1', turn: 'R' },
  { id: 'hotaru-2', at: 2340, rail: 'kurai2', turn: 'L' },
  { id: 'hotaru-3', at: 2500, rail: 'kurai3', turn: 'R' },
];
const kurai = Object.fromEntries(HOTARU.map((f) => [f.rail, deadEnd(f.rail, f.at, f.turn)]));
const LINES = { main, ...kurai };
for (const [id, x, z] of [['kurai1', -706.0, 2014.7], ['kurai2', -572.1, 2140.0], ['kurai3', -620.4, 2314.1]]) {
  const e = kurai[id].at(kurai[id].length);
  check(Math.hypot(e.x - x, e.z - z) < 3, `${id} ${kurai[id].length.toFixed(1)} m ends at (${e.x.toFixed(1)}, ${e.z.toFixed(1)}) (design (${x}, ${z}))`);
}

/** Every rail point, 2 m apart, for keeping scenery off the track (with its line and s). */
const TRACK = Object.values(LINES).flatMap((line) => {
  const out = [];
  for (let s = 0; s <= line.length; s += 2) out.push({ ...line.at(s), line: line.id, s });
  return out;
});
/** The nearest rail point to (x, z). */
const nearest = (x, z) => {
  let best = null;
  let d = Infinity;
  for (const p of TRACK) {
    const q = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (q < d) {
      d = q;
      best = p;
    }
  }
  return { d: Math.sqrt(d), p: best };
};
{
  // Different parts of main (300 m or more apart along it) never come close (§5.6: 271 m least).
  let least = Infinity;
  for (let a = 0; a <= main.length; a += 5) {
    for (let b = a + 300; b <= main.length; b += 5) {
      const p = main.at(a);
      const q = main.at(b);
      least = Math.min(least, Math.hypot(p.x - q.x, p.z - q.z));
    }
  }
  check(least > 200, `main never comes back near itself (least ${least.toFixed(0)} m between parts 300 m apart)`);
  for (const f of HOTARU) {
    const e = kurai[f.rail].at(kurai[f.rail].length);
    let d = Infinity;
    for (let t = f.at; t <= f.at + 200; t += 1) {
      const q = main.at(t);
      d = Math.min(d, Math.hypot(e.x - q.x, e.z - q.z));
    }
    check(d > 30, `${f.rail}'s far end is ${d.toFixed(1)} m off main (§5.2: 31.8 or more)`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The pond (§5.4)
// ---------------------------------------------------------------------------------------------------------------

const POND = {
  y: -0.4,
  floor: -7,
  look: 'lake',
  area: { rect: { center: [-277.2, 1224.6], size: [44, 120], rotationY: -30, corner: 8 } },
  under: { color: '#1b2f5a', far: 30 },
};
const WATERS = [POND];
{
  const sp = waterSpans(main, WATERS);
  report.push(`main on the pond: surface ${sp.surfaces.map((x) => `${x.from}–${x.to}`).join(', ') || '—'}; under water ${sp.dives.map((x) => `${x.from}–${x.to}`).join(', ') || '—'}`);
  const s0 = sp.surfaces[0];
  check(sp.surfaces.length === 1 && sp.dives.length === 0 && Math.abs(s0.from - 1230) <= 6 && Math.abs(s0.to - 1350) <= 6, 'main floats over the pond about 1230–1350');
  for (const id of Object.keys(kurai)) check(waterSpans(kurai[id], WATERS).surfaces.length === 0, `${id} keeps off the pond`);
}

// ---------------------------------------------------------------------------------------------------------------
// Stations, gimmicks, actors, records (§4, §5, §7, §9)
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'moriguchi', name: 'もりぐちえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'tsukimi', name: 'つきみえき', railId: 'main', at: 990, platformSide: 'left' },
  { id: 'kirikabu', name: 'きりかぶえき', railId: 'main', at: 1990, platformSide: 'right' },
  { id: 'hiroba', name: 'ひろばえき', railId: 'main', at: 3140, platformSide: 'left' },
];

/** The dark forests (`fog` with `glow`): A, B, C (two parts round a moonlit gap). */
const DARK = [
  { from: 200, to: 370 },
  { from: 740, to: 900 },
  { from: 2080, to: 2270 },
  { from: 2400, to: 2580 },
];
const MEADOWS = [
  { id: 'harappa-1', from: 470, to: 650, rewind: 400 },
  { id: 'harappa-2', from: 2680, to: 2800, rewind: 2610, line: 'また つきの はらっぱ… しーっ' },
];
const REVERSED = { from: 1480, to: 1680 };
const GAP = { from: 830, to: 840 };
const DARK_FOG = { near: 4, far: 32, lightFar: 70, color: '#2a3566', glow: true };
const SLEEP = { allow: false, icon: 'sleep', pressLine: 'ねてる みんなが おきちゃう。おやすみ' };

const GIMMICKS = [
  ...DARK.map((d) => ({ type: 'fog', railId: 'main', from: d.from, to: d.to, params: DARK_FOG })),
  ...Object.keys(kurai).map((id) => ({ type: 'fog', railId: id, from: 0, to: 60, params: DARK_FOG })),
  ...MEADOWS.map((m) => ({
    type: 'hush',
    railId: 'main',
    from: m.from,
    to: m.to,
    params: { id: m.id, rewind: { railId: 'main', at: m.rewind }, ...(m.line ? { line: m.line } : {}) },
  })),
  ...MEADOWS.map((m) => ({ type: 'rocket', railId: 'main', from: m.from, to: m.to, params: SLEEP })),
  { type: 'whistle-reversed', railId: 'main', from: REVERSED.from, to: REVERSED.to, params: { id: 'sakasa-kiteki', rewind: { railId: 'main', at: 1420 } } },
  { type: 'slope', railId: 'main', from: SLOPE.from, to: SLOPE.to, params: { pull: -6, rewind: { railId: 'main', at: 2815 }, line: 'きの ねっこの さか！ ロケット！' } },
  { type: 'camera', railId: 'main', from: 800, to: 850, params: { mode: 'chase' } },
  { type: 'camera', railId: 'main', from: 1240, to: 1340, params: { mode: 'chase' } },
  { type: 'camera', railId: 'main', from: 2845, to: 2945, params: { mode: 'chase' } },
  { type: 'sound', railId: 'main', from: 815, to: 855, params: { surface: 'wood' } },
];

const FLOATERS = [
  { id: 'hasu-1', railId: 'main', at: 1270, look: 'lily', say: 'はすの はっぱ！ もぐって くぐろう' },
  { id: 'hasu-2', railId: 'main', at: 1315, look: 'lily' },
];

/** §6.1 the fawns: they walk from the left (−lateral) to the right, so they face right (−90° from the rail's heading). */
const fawn = (id, at, startDistance, crossSeconds) => ({
  id,
  type: 'dino-small',
  reactsTo: 'light',
  onRail: { railId: 'main', at },
  rotationY: -90,
  params: { look: 'fawn', glare: true, startDistance, crossSeconds, dangerDistance: 12, lateral: 7 },
});
/** §6.2 the little tanukis (A at 1540: the coordinator's note of 2026-09-30). */
const TANUKI = [
  { id: 'tanuki-a', at: 1540, lateral: -6, count: 3 },
  { id: 'tanuki-b', at: 1640, lateral: 6, count: 2 },
];
const ACTORS = [
  fawn('kojika-1', 610, 100, 3),
  {
    id: 'harinezumi',
    type: 'cat',
    reactsTo: 'whistle',
    onRail: { railId: 'main', at: 1090, heightFromRail: 0 },
    params: {
      look: 'hedgehog',
      glow: true,
      wakeDistance: 60,
      dangerDistance: 8,
      fleeLateral: 5,
      fleeSeconds: 1.6,
      say: 'はりねずみさん、どいて〜！ きてき！',
      woke: 'ころころ〜 よけて くれた！',
    },
  },
  ...TANUKI.map((t) => ({ id: t.id, type: 'lure', reactsTo: 'whistle', onRail: { railId: 'main', at: t.at, lateral: t.lateral }, params: { look: 'tanuki', count: t.count } })),
  fawn('kojika-2', 2780, 90, 2.5),
];

const RECORDS = [
  {
    id: 'moon-bunnies',
    name: 'ねむる うさぎの おやこ',
    note: 'しーっ。ライトを けしたら あえた',
    requires: null,
    hush: true,
    model: 'bunny-family',
    onRail: { railId: 'main', at: 580, lateral: 7, heightFromRail: GROUND_Y },
    hint: 'しーっ… うさぎの おやこが ねてる',
  },
  {
    id: 'pond-moonstone',
    name: 'いけの そこの つきいし',
    note: 'つきの ひかりを ためた いし',
    requires: 'dive',
    model: 'moonstone',
    onRail: { railId: 'main', at: 1295, lateral: 2, heightFromRail: round(POND.floor + 0.6, 2) },
  },
  {
    id: 'lantern-bell',
    name: 'ランタンの すず',
    note: 'よるの えだから ひきよせた すず',
    requires: 'magnetLight',
    model: 'lantern-bell',
    onRail: { railId: 'main', at: 2600, lateral: 10, heightFromRail: 9 },
    hint: 'えだの うえに すず！ ひっぱろう！',
  },
];

const JUNCTIONS = [
  { id: 'hotaru-1', railId: 'main', at: 2180, left: 'main', right: 'kurai1', default: 'right', fireflies: { callFrom: 100, callTo: 15 } },
  { id: 'hotaru-2', railId: 'main', at: 2340, left: 'kurai2', right: 'main', default: 'left', fireflies: { callFrom: 100, callTo: 15 } },
  { id: 'hotaru-3', railId: 'main', at: 2500, left: 'main', right: 'kurai3', default: 'right', signReversed: true, fireflies: { fake: true } },
];

// ---------------------------------------------------------------------------------------------------------------
// Missions (§3, §13)
// ---------------------------------------------------------------------------------------------------------------

const COMMON = {
  moving: 'そうそう、その ちょうし！',
  recordFound: 'みつけた！ ずかんに のせよう',
};
const MISSIONS = [
  {
    id: 'm1',
    type: 'pickup',
    title: 'くらやみ',
    steps: [{ stationId: 'tsukimi', board: 3, say: 'ほたるを みに いくの！', reply: 'ひろばまで まかせて！' }],
    lines: {
      ...COMMON,
      start: 'こんやは もりの ほたるの よる！\nまずは つきみえきまで いこう！',
      gapNear: 'きれめ！ {speed} で ジャンプ！',
      stationNear: 'つきみえきだ。ゆっくり！',
      complete: 'ライト、つけたり けしたり できたね！',
    },
    hints: [
      { railId: 'main', at: 185, text: 'くらい もり！ ライトを つけよう' },
      { railId: 'main', at: 725, text: 'また くらい もり！ ライトを つけよう' },
    ],
  },
  {
    id: 'm2',
    type: 'pickup',
    title: 'よってくる',
    steps: [{ stationId: 'kirikabu', board: 2, say: 'わたしたちも のせて！', reply: 'どうぞ！ しーっ だよ' }],
    lines: {
      ...COMMON,
      start: 'つぎは きりかぶえき！\nまた おきゃくさんが まってるよ',
      catDanger: 'とまって〜！',
      catDangerAfter: 'びっくりした〜。きてきで おしえてね',
      diveNear: 'いけだ！ もぐるを おして！',
      stationNear: 'きりかぶえきだ。ゆっくり！',
      complete: 'きてき がまん、できたね！',
    },
    hints: [],
    onComplete: 'lantern',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'ほたるのみち',
    steps: [{ stationId: 'hiroba', alight: 5, say: 'ありがとう！ ほたる きれい！', reply: 'よかったね！' }],
    lines: {
      ...COMMON,
      start: 'さいごは ほたるの ひろば！\nくらい もりを ぬけて いこう',
      deadEnd: 'くらい いきどまり… ほたるに きこう',
      rocketGo: 'ぐいーん！ いけいけ〜！',
      stationNear: 'ひろばえきだ。ゆっくり！',
      complete: 'とどいた！ ……あれ？',
    },
    hints: [
      { railId: 'main', at: 2035, text: 'くらい もり！ ライトを つけよう' },
      { railId: 'main', at: 2545, text: 'たかい えだで なにか ちりん…', unless: 'magnetLight' },
      { railId: 'main', at: 2960, text: 'おおきな き！ ほたるの ひろばだ！' },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

/** A rail placement `lateral` m right of main at `at`, `h` m over the rail. */
const on = (at, lateral = 0, h = 0) => ({ railId: 'main', at, lateral, heightFromRail: h });
/** Degrees about +Y (from the rail's heading at `at`) that turn a figure at (at, lateral) to face (toAt, toLateral). */
const face = (at, lateral, toAt, toLateral) => {
  const a = main.point(at, lateral);
  const b = main.point(toAt, toLateral);
  return round((Math.atan2(b.x - a.x, b.z - a.z) - main.at(at).h) / RAD, 0);
};
/** §5.4 the great tree 50 m past the buffer (straight on), and §12's ending camera: the design's, moved with the end. */
/** A world point `lateral` m right of main at `at`, `up` m over the rail. */
const pt = (at, lateral, up) => {
  const p = main.point(at, lateral, up);
  return [round(p.x, 1), round(p.y, 1), round(p.z, 1)];
};
const GREAT_TREE = (() => {
  const e = main.at(main.length);
  return { x: round(e.x + Math.sin(e.h) * 50, 1), z: round(e.z + Math.cos(e.h) * 50, 1) };
})();
const ENDING_EYE = [round(-777.9 + END_SHIFT.x, 1), 21.4, round(2727.8 + END_SHIFT.z, 1)];
const HIROBA_Y = MAIN_Y(3140);

const CUTSCENES = {
  opening: [
    { caption: 'よるの もり', seconds: 2.5 },
    // From up right of the forest-edge station, north over the forest to the moon.
    { camera: 'fixed', at: [-16, 10, 10], lookAt: [0, 6, 160], reach: 1.5 },
    { say: 'よるの もりだ！ しずかだね', emote: 'tilt' },
    { say: 'くらい… ライトの でばんだ！', emote: 'jump' },
    { camera: 'cab' },
    { say: 'でも てらしすぎは だめ' },
    { say: 'もりの みんな、ねてるからね' },
    { say: 'ほたるの ひろばまで いこう！', emote: 'cheer' },
  ],
  lantern: [
    // From just over the front of the train at the stump station (behind the scene): a lantern walking alone between
    // the trees ahead on the left. Nearer than §12's 2040/16 m → 2090/30 m, so the little figure reads from the cab.
    { camera: 'fixed', at: pt(2002, -2, 4.5), lookAt: pt(2042, -20, 1), reach: 1.5 },
    { spawn: 'sakasa', model: 'amanojaku-lantern', onRail: on(2025, -11, GROUND_Y), rotationY: face(2025, -11, 2060, -27) },
    { say: 'あれ？ あかりが あるいてる…', emote: 'tilt' },
    { move: 'sakasa', onRail: on(2060, -27, GROUND_Y), seconds: 4, nowait: true },
    { say: 'サカサだ！ ひとりで どこへ？' },
    { say: 'あの ちょうちん、まだ もってる！' },
    { remove: 'sakasa' },
    { camera: 'cab' },
  ],
  ending: [
    // From behind the square's station on the right, up at the great tree: the fireflies gather round it.
    { camera: 'fixed', at: ENDING_EYE, lookAt: [GREAT_TREE.x, 35, GREAT_TREE.z], reach: 1.5 },
    { spawn: 'swarm', model: 'firefly-swarm-big', onRail: on(3210, 0, 22) },
    { say: 'わあ… ほたるが いっぱい！', emote: 'cheer' },
    // Sakasa in the roots' shadow on the deck past the train (seen beside the tree), its lantern out; the fireflies
    // flow down and light it up.
    { spawn: 'sakasa', model: 'amanojaku-lantern-off', onRail: on(3204, -9, 0), rotationY: face(3204, -9, 3140, 4) },
    { move: 'swarm', onRail: on(3204, -9, -4), seconds: 2 },
    { say: 'あっ、サカサ！', emote: 'jump' },
    { say: 'こ、こんにちは〜！', who: 'amanojaku' },
    // Off it runs; halfway it turns round and looks back; then away.
    { move: 'sakasa', onRail: on(3208, -26, 0), seconds: 1.2 },
    { remove: 'sakasa' },
    { spawn: 'sakasa', model: 'amanojaku-lantern-off', onRail: on(3208, -26, 0), rotationY: face(3208, -26, 3140, 4) },
    { wait: 1.2 },
    { remove: 'sakasa' },
    { spawn: 'sakasa', model: 'amanojaku-lantern-off', onRail: on(3208, -26, 0), rotationY: face(3208, -26, 3209, -45) },
    // Down off the deck's far side, into the roots' shadow.
    { move: 'sakasa', onRail: on(3209, -45, -8), seconds: 1.5 },
    { remove: 'sakasa' },
    { say: 'いま、こっちを みてた', emote: 'tilt' },
    { say: 'なにか いいたそう だったね' },
    { remove: 'swarm' },
  ],
};
check(Math.abs(HIROBA_Y - SLOPE.rise) < 0.01, 'the square is on the top of the root slope');

// ---------------------------------------------------------------------------------------------------------------
// Scenery (§5.4)
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(0x0501);
const between = (a, b) => a + rand() * (b - a);
const props = [];
const placed = [];
/** A prop at a world spot on the ground. */
const world = (model, x, z, { y = GROUND_Y, rotationY = 0, scale = 1, r = 0 } = {}) => {
  const p = { model, position: [round(x, 1), round(y, 2), round(z, 1)] };
  if (rotationY) p.rotationY = round(rotationY, 0);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
  if (r) placed.push({ x, z, r });
  return p;
};
/** A prop beside a rail (heights over the rail; on the ground unless given). */
const onRail = (model, railId, at, { lateral = 0, height, rotationY = 0, scale = 1, r = 0, ...extra } = {}) => {
  const line = LINES[railId];
  const q = line.point(at, lateral);
  const h = height ?? GROUND_Y - line.at(at).y;
  const p = { model, onRail: { railId, at: round(at, 1), lateral: round(lateral, 1), heightFromRail: round(h, 2) } };
  if (rotationY) p.rotationY = round(rotationY, 0);
  if (scale !== 1) p.scale = round(scale, 2);
  Object.assign(p, extra);
  props.push(p);
  if (r) placed.push({ x: q.x, z: q.z, r });
  return q;
};
const clearOfPlaced = (x, z, d) => placed.every((p) => Math.hypot(p.x - x, p.z - z) >= d + p.r);
const inPond = (x, z, grow = 0) => inArea(POND.area, x, z, grow);

// §5.4 the special pieces.
onRail('birdhouse-upside', 'main', 300, { lateral: -6, height: 3, rotationY: 90, trace: true, traceLine: 'さかさまの すばこ… サカサかな？' });
// The tree the birdhouse hangs on, just behind it.
onRail('night-tree-a', 'main', 300, { lateral: -7.6, rotationY: 40, r: 3 });
for (const [at, lateral] of [[520, -8], [545, 9], [600, -10], [630, 8], [2710, -8], [2740, 9], [2765, -9]]) {
  onRail('bunny-sleep', 'main', at, { lateral, rotationY: round(between(0, 360), 0), sleeper: true });
}
for (const [at, lateral, rotationY] of [[15, -3, 0], [35, 3, 180], [55, -3, 0]]) {
  onRail('fake-lantern', 'kurai3', at, { lateral, height: 0, rotationY, reveal: 'hotaru-3' });
}
onRail('bell-branch', 'main', 2600, { lateral: 11, height: 9.8, rotationY: 90 });
// The branch comes out of a big tree beyond the record.
onRail('night-tree-b', 'main', 2600, { lateral: 15.5, scale: 1.1, r: 4 });
world('great-tree', GREAT_TREE.x, GREAT_TREE.z, { y: HIROBA_Y + GROUND_Y, rotationY: 120, r: 26 });
// The square's deck left of the station and on past it (main 3080–3210).
for (const at of [3090, 3130, 3170, 3209]) onRail('plaza-deck', 'main', at, { lateral: -18, height: -0.9, r: 0 });
placed.push({ ...(() => { const q = main.point(3145, -18); return { x: q.x, z: q.z }; })(), r: 70 });
// Lanterns on each platform (2), the stump by the stump station, the log bridge's broken ends and its brook.
for (const st of STATIONS) {
  const side = st.platformSide === 'left' ? -1 : 1;
  for (const d of [-32, -8]) onRail('lantern-post', 'main', st.at + d, { lateral: side * 7.2, r: 1 });
}
onRail('big-stump', 'main', 1975, { lateral: 17, r: 7 });
onRail('log-bridge-end', 'main', GAP.from - 2.4, { height: -1.45 });
onRail('log-bridge-end', 'main', GAP.to + 2.4, { height: -1.45, rotationY: 180 });
onRail('water-strip', 'main', (GAP.from + GAP.to) / 2, { height: GROUND_Y + 0.08, scale: 0.3 });
// The dead ends: a soft thicket at the far end, the fireflies waiting in front of it.
for (const id of Object.keys(kurai)) {
  const line = kurai[id];
  const e = line.at(line.length);
  world('thicket', e.x + Math.sin(e.h) * 1.8, e.z + Math.cos(e.h) * 1.8, { rotationY: e.h / RAD, r: 5 });
  onRail('firefly-wait', id, line.length - 2, { height: 0.2 });
}
// The little tanukis' bushes (two big ones each).
for (const t of TANUKI) {
  const side = Math.sign(t.lateral);
  onRail('night-bush', 'main', t.at - 3, { lateral: side * 8.5, scale: 1.3, rotationY: between(0, 360), r: 2 });
  onRail('night-bush', 'main', t.at + 4, { lateral: side * 10, scale: 1.2, rotationY: between(0, 360), r: 2 });
}
// The moonlit meadows: boards either side of the track (the model is 60 m across, 100 m along).
let meadowBoards = 0;
for (const [from, to] of [[460, 660], [2670, 2810]]) {
  const n = Math.ceil((to - from) / 100);
  const step = (to - from) / n;
  for (let i = 0; i < n; i++) {
    const at = from + step * (i + 0.5);
    for (const side of [-1, 1]) {
      onRail('moon-meadow', 'main', at, { lateral: side * 32.5, height: GROUND_Y - main.at(at).y + 0.02 * (i % 2), scale: step / 100 > 1 ? round(step / 100, 2) : 1 });
      meadowBoards += 1;
    }
  }
}
// Glowing mushrooms both sides of the dark forests, every 20 m, 4–9 m out (clear of the dead ends).
let mushrooms = 0;
for (const d of DARK) {
  for (let at = d.from + 10; at < d.to; at += 20) {
    for (const side of [-1, 1]) {
      const lateral = side * between(4, 9);
      const q = main.point(at, lateral);
      if (nearest(q.x, q.z).d < 3.5) continue;
      onRail('glow-mushroom', 'main', at, { lateral, rotationY: between(0, 360), scale: between(0.8, 1.3), r: 1 });
      mushrooms += 1;
    }
  }
}
for (const id of Object.keys(kurai)) {
  for (const at of [25, 50, 75]) {
    const lateral = (at === 50 ? 1 : -1) * between(3.5, 5);
    const q = kurai[id].point(at, lateral);
    if (nearest(q.x, q.z).d < 3.2) continue;
    onRail('glow-mushroom', id, at, { lateral, rotationY: between(0, 360), r: 1 });
    mushrooms += 1;
  }
}
// Reeds round the pond, and lily flowers on it (off the track).
let reeds = 0;
{
  const r = POND.area.rect;
  const h = r.rotationY * RAD;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + between(-0.05, 0.05);
    const across = Math.cos(a) * (r.size[0] / 2 + between(0.5, 3));
    const along = Math.sin(a) * (r.size[1] / 2 + between(0.5, 3));
    const x = r.center[0] + across * Math.cos(h) + along * Math.sin(h);
    const z = r.center[1] - across * Math.sin(h) + along * Math.cos(h);
    if (nearest(x, z).d < 5) continue;
    world('reed', x, z, { rotationY: between(0, 360), scale: between(0.8, 1.3), r: 1 });
    reeds += 1;
  }
  for (let i = 0; i < 12; i++) {
    const across = between(-0.4, 0.4) * r.size[0];
    const along = between(-0.4, 0.4) * r.size[1];
    const x = r.center[0] + across * Math.cos(h) + along * Math.sin(h);
    const z = r.center[1] - across * Math.sin(h) + along * Math.cos(h);
    if (nearest(x, z).d < 6) continue;
    world('lily-flower', x, z, { y: POND.y + 0.02, rotationY: between(0, 360) });
  }
}

/** The least distance from the track a tree stands at, by where its nearest rail point is (§5.4). */
const STATION_SPOTS = STATIONS.map((st) => ({ ...main.point(st.at - 20, 0), side: st.platformSide }));
const treeClear = (x, z) => {
  const { d, p } = nearest(x, z);
  if (p.line !== 'main') return d >= 6;
  const s = p.s;
  if (MEADOWS.some((m) => s > m.from - 25 && s < m.to + 25)) return d >= 45;
  if (DARK.some((k) => s >= k.from - 10 && s <= k.to + 10)) return d >= 6;
  if (s > REVERSED.from - 10 && s < REVERSED.to + 10) return d >= 13;
  if (s > SLOPE.from - 20) return d >= 22;
  return d >= 9;
};
const nearStation = (x, z) => STATION_SPOTS.some((st) => Math.hypot(st.x - x, st.z - z) < 36);
let trees = 0;
const tree = (x, z, scale) => {
  world(rand() < 0.55 ? 'night-tree-a' : 'night-tree-b', x, z, { rotationY: between(0, 360), scale, r: 3.2 * scale });
  trees += 1;
};
// The dark forests first: close rows either side (6–14 m out) so the train runs through the trees.
for (const d of DARK) {
  for (let at = d.from; at <= d.to; at += 9) {
    for (const side of [-1, 1]) {
      const q = main.point(at + between(-3, 3), side * between(6.5, 14));
      if (!treeClear(q.x, q.z) || !clearOfPlaced(q.x, q.z, 2.5)) continue;
      tree(q.x, q.z, between(0.9, 1.25));
    }
  }
}
for (const id of Object.keys(kurai)) {
  for (let at = 10; at <= kurai[id].length - 6; at += 12) {
    for (const side of [-1, 1]) {
      const q = kurai[id].point(at, side * between(6, 10));
      if (!treeClear(q.x, q.z) || !clearOfPlaced(q.x, q.z, 2.5)) continue;
      tree(q.x, q.z, between(0.9, 1.2));
    }
  }
}
const darkTrees = trees;
// Then the rest of the forest: near the line (up to 130 m out), thinner further away.
const BOX = { x0: -1000, x1: 150, z0: -120, z1: 2950 };
for (let i = 0; i < 60000 && trees < 420; i++) {
  const x = between(BOX.x0, BOX.x1);
  const z = between(BOX.z0, BOX.z1);
  const { d } = nearest(x, z);
  if (d > 130 || rand() > Math.min(1, 45 / d)) continue;
  if (!treeClear(x, z) || nearStation(x, z) || inPond(x, z, 10) || !clearOfPlaced(x, z, 3)) continue;
  tree(x, z, between(0.8, 1.3));
}
// Bushes between the trees.
let bushes = 0;
for (let i = 0; i < 20000 && bushes < 40; i++) {
  const x = between(BOX.x0, BOX.x1);
  const z = between(BOX.z0, BOX.z1);
  const { d } = nearest(x, z);
  if (d < 7 || d > 60 || nearStation(x, z) || inPond(x, z, 4) || !clearOfPlaced(x, z, 1.5)) continue;
  world('night-bush', x, z, { rotationY: between(0, 360), scale: between(0.8, 1.2), r: 1.5 });
  bushes += 1;
}
report.push(`scenery: ${trees} trees (${darkTrees} in the dark forests), ${bushes} bushes, ${mushrooms} mushrooms, ${reeds} reeds, ${meadowBoards} meadow boards`);

// ---------------------------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------------------------

{
  const keys = [45, 250, 470, 610, 830, 990, 1090, 1230, 1480, 1540, 1640, 1990, 2180, 2340, 2500, 2600, 2780, 2860, 2930, 3140];
  const { total, worst } = gameCurveCheck(main, keys);
  check(Math.abs(total - main.length) < 1 && worst.d < 0.4, `main as the game's curve: ${total.toFixed(2)} m, key places at most ${worst.d.toFixed(2)} m off (main ${worst.s})`);
}
for (const line of Object.values(kurai)) {
  const { total, worst } = gameCurveCheck(line, [0, 30, 60]);
  check(Math.abs(total - line.length) < 1 && worst.d < 0.2, `${line.id} as the game's curve: ${total.toFixed(2)} m (script ${line.length.toFixed(1)})`);
}
for (const f of HOTARU) {
  const a = main.at(f.at);
  const b = kurai[f.rail].at(0);
  check(Math.hypot(a.x - b.x, a.z - b.z) < 0.01, `${f.rail} starts on main ${f.at}`);
}
check(TANUKI.every((t) => t.at >= REVERSED.from + 40 && t.at <= REVERSED.to), 'the tanukis stand in the whistle-reversed stretch, 40 m or more in');
check(HOTARU.every((f, i) => i === 0 || f.at - 100 > HOTARU[i - 1].at - 15 + 50), "the firefly forks' calling reaches are 50 m or more apart");
check(SLOPE.from - 45 === 2815 && 3140 - SLOPE.to >= 200, 'the slope: rewind 45 m before it, 200 m or more of level track before the square');
{
  const bell = main.point(2600, 10, 9);
  const d = Math.hypot(bell.x - main.at(2600).x, bell.y - main.at(2600).y, bell.z - main.at(2600).z);
  check(Math.abs(d - 13.45) < 0.05, `the lantern bell is ${d.toFixed(2)} m off the rail (§6.4: 13.45)`);
}
{
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) texts.push(...[st.say, st.reply].filter(Boolean));
  }
  for (const a of ACTORS) for (const k of ['say', 'woke']) if (a.params?.[k]) texts.push(a.params[k]);
  for (const r of RECORDS) texts.push(...[r.hint, r.note, r.name].filter(Boolean));
  for (const g of GIMMICKS) for (const k of ['line', 'pressLine']) if (g.params?.[k]) texts.push(g.params[k]);
  for (const f of FLOATERS) if (f.say) texts.push(f.say);
  for (const p of props) if (p.traceLine) texts.push(p.traceLine);
  texts.push('もうちょっと はやく！ ふつうで とぼう');
  for (const steps of Object.values(CUTSCENES)) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.map((t) => t.replace('{speed}', 'ふつう')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  check(!texts.some((t) => t.includes('ほたるの ひかり')), 'no line says "ほたるの ひかり" (第 1 部 §4.2)');
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '5-1',
  title: 'よるのもり',
  chapter: 5,
  unlock: { requires: ['4-3'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#141c46', bottom: '#3d3f7e' },
    fog: { color: '#2a3566', near: 60, far: 260 },
    lighting: 'night',
    ground: { y: GROUND_Y, size: 4000, color: '#2f4a3a' },
    stars: { count: 400 },
    moon: { azimuth: 350, elevation: 18, size: 1 },
    fireflies: { count: 160, radius: 60 },
    water: WATERS,
    bgm: 'yoru',
    ambience: 'night',
    fall: 'leaf',
    surface: 'rail',
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    {
      id: 'main',
      points: main.points(),
      base: [{ look: 'rock', toGround: true, from: 2850, to: 3210 }],
      gaps: [{ from: GAP.from, to: GAP.to, hint: 'normal', pit: false, rewind: { railId: 'main', at: 770 }, line: 'もうちょっと はやく！ ふつうで とぼう' }],
      end: { type: 'buffer' },
    },
    ...Object.values(kurai).map((l) => ({ id: l.id, points: l.points(), deadEnd: true, end: { type: 'buffer' } })),
  ],
  junctions: JUNCTIONS,
  stations: STATIONS,
  floaters: FLOATERS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: CUTSCENES,
};

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}

export { LINES };
