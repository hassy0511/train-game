#!/usr/bin/env node
/**
 * Stage 6-2 "つながったせかい": builds src/stages/6-2.json from docs/PHASE9_CHAPTER5_6.md 第 3 部 第 B 部 (B3–B14), read
 * with §0 and docs/PHASE9_0_FREE_ABILITIES.md. Version 1 of the stage: the headquarters' ring (`hub`) and three gates,
 * one a map page, each to a section of its own 3 km away (`sections`, joined by `portal` ends only):
 *
 *   hub  はじまりの まち: the ring (960 m) round the headquarters' town, its station ほんぶえき (45), the back siding
 *        `hub-ura` with the back platform うらの ホーム, the three gates out (`g1`–`g3`) and back in (`r1`–`r3`).
 *   p1   そらと もり (1・2しょう): the dino valley, the cloud islands (a jump), the forest, a rocket slope, もりの えき,
 *        the back siding `p1-ura` (record ① in a big tree's hollow).
 *   p2   うみと ゆき (3・4しょう): the sea (a floating stretch, driftwood to dive under), みなとえき, the back siding
 *        `p2-ura` (record ② in a cove), the snow (a snow wall, a snowman), ゆきの むらえき.
 *   p3   ふしぎと しろ (5・6しょう): night; the firefly wood (fog: the light), the toy town, おもちゃの えき, the toy-block
 *        bridge (the magnet), the mirror gate, the castle far off, the back siding `p3-ura` (record ③, Sakasa's den).
 *
 *   M1 うしろむきの ホーム: ほんぶえき → backing into うらの ホーム → the green gate → もりの えき.
 *   M2 うみと ゆきへ: もりの えき → back to the ring → the blue gate → みなとえき → ゆきの むらえき.
 *   M3 みんなで ほんぶへ: ゆきの むらえき → the ring → the purple gate → おもちゃの えき → back home to ほんぶえき.
 *
 * Differences from the design's tables (reported in docs/PHASE9_CHAPTER5_6.md B16's notes for PR11b):
 *   - p1's rocket slope is 480–550 (not 600–680): its top must be ROCKET.stationQuiet (200 m) before もりの えき
 *     (760). The squirrel moved with it to 670.
 *   - The gates' forks take their side per step (`steps[].junctions`): M1 stays on the ring at the green gate while it
 *     goes to the back platform (so missing it comes round again, B5) and turns there after; M3 turns at the purple gate
 *     on the way to おもちゃの えき and not on the way home.
 *
 *   node scripts/layout-6-2.mjs         write src/stages/6-2.json and print the checks
 *   node scripts/layout-6-2.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, keyed, Line, mulberry32, pretty, RAD, round, walk, waterSpans } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/6-2.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

// ---------------------------------------------------------------------------------------------------------------
// Rails (B4)
// ---------------------------------------------------------------------------------------------------------------

/** Moves a walked polyline by (dx, dz). */
const shift = (pts, dx, dz) => pts.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));
/** A walked polyline turned round: s 0 at its far end (a siding walked from its mouth, a rail walked back from its merge). */
const turnRound = (pts) => {
  const length = pts[pts.length - 1].s;
  return pts
    .slice()
    .reverse()
    .map((p) => ({ ...p, s: length - p.s }));
};
/** A rail laid in a section: walked at the origin, then its box's middle put on the section's middle. */
function centred(id, segments, height, centre) {
  const pts = walk(0, 0, 0, segments, height);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const mz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return new Line(id, shift(pts, centre[0] - mx, centre[1] - mz));
}

/** B4.2 the ring: 300 m straights, half circles of 57.3 m (960 m), round to the left (the town inside it). */
const HUB_R = 180 / Math.PI;
const hub = new Line('hub', walk(-HUB_R, -150, 0, [['S', 300], ['L', HUB_R, 180], ['S', 300], ['L', HUB_R, 180]], () => 0));

/** Where things are on the ring (B4.2; r3 as in the table, the forks' sides per step: see the header). */
const HONBU_AT = 45;
const URA_AT = 90;
const GATES = [
  { n: 1, fork: 220, merge: 160, to: 'p1', colour: 'みどり' },
  { n: 2, fork: 420, merge: 360, to: 'p2', colour: 'あお' },
  { n: 3, fork: 660, merge: 600, to: 'p3', colour: 'むらさき' },
];
/** A gate's way out (90 m): off the ring to the right (outside), the arch at 50, the cloud tunnel 50–90, the gate. */
const G_LENGTH = 90;
const G_ARCH = 50;
/** A gate's way back in (100 m): the cloud tunnel 0–40 (the train arrives at 45), the arch at 40, onto the ring. */
const R_LENGTH = 100;
const R_ARCH = 40;
const TURN_R = 60;
const gLines = GATES.map((g) => {
  const q = hub.at(g.fork);
  const arc = TURN_R * 45 * RAD;
  return new Line(`g${g.n}`, walk(q.x, q.z, q.h / RAD, [['R', TURN_R, 45], ['S', G_LENGTH - arc]], () => 0));
});
const rLines = GATES.map((g) => {
  const q = hub.at(g.merge);
  const arc = TURN_R * 60 * RAD;
  // Walked back from the merge (heading the other way, off to the outside: a left turn going backwards), turned round.
  return new Line(`r${g.n}`, turnRound(walk(q.x, q.z, q.h / RAD + 180, [['L', TURN_R, 60], ['S', R_LENGTH - arc]], () => 0)));
});

/**
 * A back siding of `length` m from its mouth at `at` on `line`, lying `side` as seen reversing ('left' or 'right'):
 * walked from the mouth backwards (R60 45°, then straight), turned round (s 0 at its buffer).
 */
function siding(id, line, at, side, length, height = 0) {
  const q = line.at(at);
  const arc = 60 * 45 * RAD;
  // Walking backwards: a left turn goes off to the left as seen reversing (scripts/layout-6-1.mjs `ura`).
  const pts = walk(q.x, q.z, q.h / RAD + 180, [[side === 'left' ? 'L' : 'R', 60, 45], ['S', length - arc]], () => height);
  return new Line(id, turnRound(pts));
}
const hubUra = siding('hub-ura', hub, URA_AT, 'left', 80);

/** The sections' middles (B4.1): 3 km out east, north and west. */
const CENTRES = { p1: [3000, 0], p2: [0, 3000], p3: [-3000, 0] };

/**
 * p1 (B4.3): a U round to the left. The valley at ground level; 215–470 up on the cloud islands (8 m) with the gap
 * 262–276; the rocket slope 480–550 up 10 m, a short top and down again 575–630 (looks only); the forest.
 */
const P1_KEYS = [
  [0, 0],
  [215, 0],
  [245, 8],
  [440, 8],
  [470, 0],
  [480, 0],
  [550, 10],
  [575, 10],
  [630, 0],
];
const U = (first, last) => [['S', first], ['L', 80, 90], ['S', 300], ['L', 80, 90], ['S', last]];
const ARC80 = 80 * 90 * RAD;
const lastLeg = (first) => 960 - first - 300 - 2 * ARC80;
const p1 = centred('p1', U(120, lastLeg(120)), keyed(P1_KEYS), CENTRES.p1);
/** p2 (B4.4): flat; the floating stretch 200–300 on the U's bottom straight (from 205.7). */
const p2 = centred('p2', U(80, lastLeg(80)), () => 0, CENTRES.p2);
/** p3 (B4.5): flat, night. */
const p3 = centred('p3', U(150, lastLeg(150)), () => 0, CENTRES.p3);
const P1_URA_AT = 800;
const P2_URA_AT = 370;
const P3_URA_AT = 760;
const p1Ura = siding('p1-ura', p1, P1_URA_AT, 'right', 70);
const p2Ura = siding('p2-ura', p2, P2_URA_AT, 'left', 70);
const p3Ura = siding('p3-ura', p3, P3_URA_AT, 'right', 80);

const LINES = Object.fromEntries([hub, hubUra, ...gLines, ...rLines, p1, p1Ura, p2, p2Ura, p3, p3Ura].map((l) => [l.id, l]));

// ---------------------------------------------------------------------------------------------------------------
// Places (B4, B5)
// ---------------------------------------------------------------------------------------------------------------

const at = (line, s, lateral = 0, up = 0) => {
  const q = line.point(s, lateral, up);
  return [round(q.x), round(q.y), round(q.z)];
};

/** The side of a siding away from its main rail (the record's and the den's side), +1 right of its +s, −1 left. */
function awaySide(sidingLine, main) {
  const nearest = (p) => {
    let best = Infinity;
    for (let s = 0; s <= main.length; s += 2) {
      const m = main.at(s);
      best = Math.min(best, Math.hypot(p.x - m.x, p.z - m.z));
    }
    return best;
  };
  return nearest(sidingLine.point(20, 4)) > nearest(sidingLine.point(20, -4)) ? 1 : -1;
}
const HUB_URA_SIDE = awaySide(hubUra, hub);

const STATIONS = [
  { id: 'honbu', name: 'ほんぶえき', railId: 'hub', at: HONBU_AT, platformSide: 'left' },
  // The back platform: on the side away from the ring (its +s runs from the buffer to the mouth).
  { id: 'ura-home', name: 'うらの ホーム', railId: 'hub-ura', at: 0.5, platformSide: HUB_URA_SIDE > 0 ? 'right' : 'left', reverse: true },
  { id: 'mori-eki', name: 'もりの えき', railId: 'p1', at: 760, platformSide: 'right' },
  { id: 'minato', name: 'みなとえき', railId: 'p2', at: 320, platformSide: 'right' },
  { id: 'yuki-mura', name: 'ゆきの むらえき', railId: 'p2', at: 790, platformSide: 'left' },
  { id: 'omocha', name: 'おもちゃの えき', railId: 'p3', at: 520, platformSide: 'left' },
];

const DINO = 205;
const GAP = { from: 262, to: 276 };
const ISLANDS = { from: 245, to: 440 };
const SLOPE = { from: 480, to: 550 };
const HILL = { from: 470, to: 630 };
const SQUIRREL = 670;
const SEA = { from: 200, to: 300 };
const LOGS = [230, 270];
const SNOW_WALL = { from: 590, to: 630 };
const SNOWMAN = 700;
const FOG = { from: 100, to: 360 };
const TOY = { from: 380, to: 620 };
const TOY_BRIDGE = { from: 640, to: 648, rewind: 580 };
const MIRROR_GATE = 660;
const CASTLE_FROM = 700;

/**
 * The sea of p2 (B4.4): a hole in the ground on the inside of the U (to the left), the rail on its surface from 200 to
 * 300 (the rect's near edge 12 m to the right of the rail, its far edge out in the U's middle).
 */
const SEA_MID = p2.at((SEA.from + SEA.to) / 2);
const SEA_ACROSS = 120;
const SEA_CENTRE = p2.point((SEA.from + SEA.to) / 2, -(SEA_ACROSS / 2 - 12));
const WATERS = [
  {
    y: -0.4,
    floor: -6,
    look: 'sea',
    area: { rect: { center: [round(SEA_CENTRE.x, 1), round(SEA_CENTRE.z, 1)], size: [SEA_ACROSS, SEA.to - SEA.from], rotationY: round(SEA_MID.h / RAD, 1), corner: 6 } },
    under: { color: '#2a86b8', far: 40 },
  },
];

const amanojaku = (text) => ({ who: 'amanojaku', text });
const JUNCTIONS = [
  // The back platform's siding (outside the ring: to the left as seen reversing). M1 picks it from the start.
  { id: 'ura-guchi', railId: 'hub', at: URA_AT, back: true, left: 'hub-ura', right: 'hub', default: 'right', line: amanojaku('うしろむきで はいる のだ！') },
  ...GATES.map((g) => ({ id: `mon-${g.n}`, railId: 'hub', at: g.fork, left: 'hub', right: `g${g.n}`, default: 'left' })),
  { id: 'p1-ura-guchi', railId: 'p1', at: P1_URA_AT, back: true, left: 'p1', right: 'p1-ura', default: 'left', line: amanojaku('ひみつの みちが ある のだ…') },
  { id: 'p2-ura-guchi', railId: 'p2', at: P2_URA_AT, back: true, left: 'p2-ura', right: 'p2', default: 'right', line: amanojaku('うしろに いりえが ある のだ') },
  { id: 'p3-ura-guchi', railId: 'p3', at: P3_URA_AT, back: true, left: 'p3', right: 'p3-ura', default: 'left', line: amanojaku('ひみつきちは うしろ なのだ！') },
];

const GIMMICKS = [
  // p1: the rocket slope up the hill (back to the cloud islands' end if it slips), the camera behind on it.
  { type: 'slope', railId: 'p1', from: SLOPE.from, to: SLOPE.to, params: { pull: -6, rewind: { railId: 'p1', at: 420 }, line: 'のぼりざか！ ロケット！' } },
  { type: 'camera', railId: 'p1', from: SLOPE.from - 10, to: SLOPE.to + 10, params: { mode: 'chase' } },
  { type: 'camera', railId: 'p1', from: GAP.from - 12, to: GAP.to + 12, params: { mode: 'side' } },
  // p2: the snow wall over the buried rail; the sea's floating stretch seen from behind.
  { type: 'plow-wall', railId: 'p2', from: SNOW_WALL.from, to: SNOW_WALL.to, params: { line: 'ゆきの かべ！ ゆきかき！' } },
  { type: 'camera', railId: 'p2', from: SEA.from + 10, to: SEA.to - 10, params: { mode: 'chase' } },
  // p3: the firefly wood (dark: the light sees further), the toy-block bridge for the magnet.
  { type: 'fog', railId: 'p3', from: FOG.from, to: FOG.to, params: { near: 4, far: 32, lightFar: 70, color: '#2a3566', glow: true } },
  {
    type: 'magnet',
    railId: 'p3',
    from: TOY_BRIDGE.from,
    to: TOY_BRIDGE.to,
    params: {
      id: 'tsumiki-hashi',
      kind: 'bridge',
      look: 'toy-blocks',
      piece: { lateral: 8, height: 0, rotationY: -40 },
      line: 'つみきが たりない！ じしゃく！',
      done: 'つながった！',
      rewind: { railId: 'p3', at: TOY_BRIDGE.rewind },
    },
  },
  // The sounds round the train change inside a section (B4.1).
  { type: 'ambience', railId: 'p1', from: 430, to: 955, params: { kind: 'forest' } },
  { type: 'ambience', railId: 'p2', from: 440, to: 955, params: { kind: 'snow' } },
  { type: 'ambience', railId: 'p3', from: TOY.from, to: CASTLE_FROM, params: { kind: 'toy' } },
  { type: 'ambience', railId: 'p3', from: CASTLE_FROM, to: 955, params: { kind: 'castle' } },
];

const ACTORS = [
  // p1 205: the dino child crosses the line (1-2's); the train waits for it.
  { id: 'dino-kodomo', type: 'dino-small', onRail: { railId: 'p1', at: DINO }, rotationY: 90, reactsTo: 'none', params: { startDistance: 60, crossSeconds: 4, dangerDistance: 6, lateral: 8 } },
  // p1 670: the squirrel with its nut over the rail (2-1's): the whistle and it drops the nut aside.
  { id: 'risu', type: 'squirrel', onRail: { railId: 'p1', at: SQUIRREL }, reactsTo: 'whistle', params: { whistleRange: 70, drop: 28 } },
  // p2 700: the snowman on the line (4-3's): the whistle and it waddles aside.
  {
    id: 'yukidaruma',
    type: 'cat',
    reactsTo: 'whistle',
    onRail: { railId: 'p2', at: SNOWMAN, heightFromRail: 0 },
    // The whistle glows while it is in the way (a hint, PHASE9_0); the partner says so once.
    params: { look: 'snowman', wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2, glow: true, say: 'ゆきだるまさんが せんろに！ きてき！' },
  },
];

const FLOATERS = [
  { id: 'nagaregi-1', railId: 'p2', at: LOGS[0], look: 'log', length: 2.4, rewind: 160, say: 'ながれぎだ！ もぐって くぐろう' },
  { id: 'nagaregi-2', railId: 'p2', at: LOGS[1], look: 'log', length: 2.4, rewind: 160 },
];

/** B7: the three records, 8 m from each siding's buffer, on its side away from the main rail. */
const RECORDS = [
  {
    id: 'swirl-acorn',
    name: 'ぐるぐるの どんぐり',
    note: 'サカサが きの うろに かくして いた',
    requires: 'reverse',
    model: 'swirl-acorn',
    onRail: { railId: 'p1-ura', at: 8, lateral: 2.5 * awaySide(p1Ura, p1), heightFromRail: 2 },
    endLines: [amanojaku('ここ、おれの かくれば なのだ'), { text: 'どんぐりが ぐるぐる！' }],
  },
  {
    id: 'left-shell',
    name: 'ひだりまきの まきがい',
    note: 'ふつうと ぎゃくに まいて いる かい',
    requires: 'reverse',
    model: 'left-shell',
    onRail: { railId: 'p2-ura', at: 8, lateral: 2.5 * awaySide(p2Ura, p2), heightFromRail: 0.5 },
    endLines: [amanojaku('さかさまきの かい なのだ！'), { text: 'ほんとだ、ぎゃくに まいてる！' }],
  },
  {
    id: 'sakasa-tag',
    name: 'サカサの しけんの ふだ',
    note: 'ずっと たいせつに もって いた',
    requires: 'reverse',
    model: 'sakasa-tag',
    onRail: { railId: 'p3-ura', at: 8, lateral: 2.5 * awaySide(p3Ura, p3), heightFromRail: 1.5 },
    endLines: [amanojaku('……しけんの ふだ なのだ'), { text: 'ずっと もってたんだね' }, amanojaku('いまは たんけんたいの なかま なのだ！')],
  },
];

const MISSIONS = [
  {
    id: 'm1',
    type: 'pickup',
    title: 'うしろむきの ホーム',
    // The back platform's siding is picked from the start; the green gate's side changes with the step (see the header).
    junctions: { 'ura-guchi': { default: 'left' } },
    steps: [
      { stationId: 'ura-home', board: 2, say: 'いっしょに よびに いこう！', junctions: { 'mon-1': { default: 'left' } } },
      { stationId: 'mori-eki', board: 1, junctions: { 'mon-1': { default: 'right' } } },
    ],
    lines: { start: 'まずは ほんぶの うらの ホーム！', stationNear: '{station}だ。ゆっくり！' },
    hints: [
      { railId: 'hub', at: 170, text: 'みどりの もんへ！', whileStep: 1 },
      { railId: 'hub', at: 290, who: 'amanojaku', text: 'うしろの ホーム、わすれてる のだ！', whileStep: 0 },
      { railId: 'p1', at: 50, text: 'わあっ、もんを くぐった！' },
    ],
    onComplete: 'mori',
  },
  {
    id: 'm2',
    type: 'pickup',
    title: 'うみと ゆきへ',
    junctions: { 'mon-1': { default: 'left' }, 'mon-2': { default: 'right' } },
    steps: [
      { stationId: 'minato', board: 2 },
      { stationId: 'yuki-mura', board: 1 },
    ],
    lines: { start: 'つぎは あおの もん！ うみと ゆき！', stationNear: '{station}だ。ゆっくり！' },
    hints: [{ railId: 'hub', at: 350, text: 'あおの もんへ！' }],
    onComplete: 'kamakura',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'みんなで ほんぶへ',
    junctions: { 'mon-1': { default: 'left' }, 'mon-2': { default: 'left' } },
    steps: [
      { stationId: 'omocha', board: 2, junctions: { 'mon-3': { default: 'right' } } },
      { stationId: 'honbu', alight: 8, junctions: { 'mon-3': { default: 'left' } } },
    ],
    lines: { start: 'さいごは むらさきの もん！', stationNear: '{station}だ。ゆっくり！' },
    hints: [
      { railId: 'hub', at: 590, text: 'むらさきの もんへ！', whileStep: 0 },
      { railId: 'p3', at: 90, text: 'くらい… ライト！' },
      { railId: 'p3', at: 680, who: 'amanojaku', text: 'おれの おしろ なのだ' },
      { railId: 'p3', at: 720, who: 'amanojaku', text: 'もう ひとりじゃ ない のだ' },
      { railId: 'p3', at: 721, text: 'うん！ みんな いっしょ！' },
      { railId: 'hub', at: 900, text: 'ほんぶえきへ かえろう！', whileStep: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (B8)
// ---------------------------------------------------------------------------------------------------------------

const cam = (from, to, reach = 1.5) => ({ camera: 'fixed', at: from, lookAt: to, reach });
const passenger = (name, text) => ({ say: text, who: 'passenger', name });
/** From outside the ring by ほんぶえき: the train and, beyond it, the platform with everyone on it and the festival. */
const honbuCam = cam(at(hub, HONBU_AT - 27, 16, 6), at(hub, HONBU_AT - 15, -8, 2), 1.2);
/** The festival's glowing balls over the town beside ほんぶえき (inside the ring, beyond the platform). */
const BURSTS = [at(hub, HONBU_AT - 5, -38, 2), at(hub, HONBU_AT + 15, -50, 2), at(hub, HONBU_AT - 25, -48, 2)];

const opening = [
  { caption: 'つながったせかい', seconds: 2.5 },
  // From above the ring, the town inside it and the Wonder train at ほんぶえき.
  cam(at(hub, HONBU_AT - 40, 30, 22), at(hub, HONBU_AT + 30, -30, 2), 1),
  { say: 'きょうは サカサも いっしょ！', emote: 'jump' },
  { say: 'こんにちは、なのだ！', who: 'amanojaku' },
  { card: { title: 'つながった おいわい', button: 'いこう！' } },
  { say: 'せかいの みんなを よびに いこう！', emote: 'cheer' },
  { say: 'もんを くぐると、べつの せかい！', emote: 'tilt' },
  { camera: 'cab' },
  { say: 'しゅっぱつ なのだ！', who: 'amanojaku' },
];

/** M1's end at もりの えき (the doors closed): the forest child, Sakasa shy. */
const mori = [
  { camera: 'side' },
  passenger('もりの こ', 'さかさの ひょうしき、たのしかった！'),
  { say: '……', who: 'amanojaku' },
  { say: 'よかったね、サカサ', emote: 'cheer' },
];

/** M2's end at ゆきの むらえき: the lantern from 4-2 is given back, and given again. */
const kamakura = [
  { camera: 'side' },
  { say: 'ちょうちん、かえす のだ', who: 'amanojaku' },
  passenger('かまくらの こ', 'あげる！ いっしょに もって いこう'),
  { say: '……うれしい のだ', who: 'amanojaku' },
  { say: 'ちょうちん、ぴかぴか だね', emote: 'cheer' },
];

/** The ending at ほんぶえき, everyone off (B8): the platform and the train, the festival's lights (no bang). */
const ending = [
  honbuCam,
  { fx: 'festival' },
  { say: 'ワールドレール、ぜんぶ つながった！', emote: 'cheer' },
  { say: 'みんな、ありがとう なのだ', who: 'amanojaku' },
  passenger('もりの こ', 'また さかさの ひょうしき みせて！'),
  { say: 'こんどは ただしい ひょうしき なのだ', who: 'amanojaku' },
  { camera: 'cab' },
  { say: 'きょうの しごと、おしまい！', emote: 'jump' },
  { say: 'また あそぼうね！' },
  { say: 'さようなら、なのだ！', who: 'amanojaku' },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (B11)
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(62);
const between = (a, b) => a + (b - a) * rand();
const props = [];
function addOnRail(model, railId, s, { lateral = 0, height, rotationY, scale = 1 } = {}) {
  const onRail = { railId, at: round(s) };
  if (lateral) onRail.lateral = round(lateral, 2);
  if (height !== undefined) onRail.heightFromRail = round(height, 2);
  const p = { model, onRail };
  if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
}
function addWorld(model, [x, y, z], { rotationY, scale = 1 } = {}) {
  const p = { model, position: [round(x), round(y, 2), round(z)] };
  if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
}
const SAMPLES = [];
for (const line of Object.values(LINES)) for (let s = 0; s <= line.length; s += 2) SAMPLES.push({ rail: line.id, s, ...line.at(s) });
const nearRail = (x, z) => SAMPLES.reduce((best, q) => Math.min(best, Math.hypot(q.x - x, q.z - z)), Infinity);
const placed = [];
const pointOf = (line, s, lateral = 0) => {
  const q = line.point(s, lateral);
  return { x: q.x, z: q.z };
};
/** Kept clear: the platforms' far sides, the sea, the sidings' far ends (the rear window looks there), the cameras. */
const reserved = [
  ...STATIONS.map((st) => ({ ...pointOf(LINES[st.railId], st.reverse ? st.at + 22 : st.at - 22, st.platformSide === 'left' ? -9 : 9), r: 16 })),
  { x: SEA_CENTRE.x, z: SEA_CENTRE.z, r: SEA_ACROSS / 2 + 10 },
  ...[hubUra, p1Ura, p2Ura, p3Ura].map((l) => ({ ...pointOf(l, -14), r: 16 })),
  { x: honbuCam.at[0], z: honbuCam.at[2], r: 8 },
  ...BURSTS.map(([x, , z]) => ({ x, z, r: 8 })),
];
function scatter(models, count, { zones, lat, footprint, minRail = 12, side = 0, y = 0, scale = [1, 1] }) {
  const total = zones.reduce((a, z) => a + (z[2] - z[1]), 0);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 300; tries++) {
    let pick = rand() * total;
    let zone = zones[0];
    for (const z of zones) {
      pick -= z[2] - z[1];
      if (pick <= 0) {
        zone = z;
        break;
      }
    }
    const s = between(zone[1], zone[2]);
    const sign = side || (rand() < 0.5 ? -1 : 1);
    const q = LINES[zone[0]].point(s, sign * between(lat[0], lat[1]));
    if (nearRail(q.x, q.z) < Math.max(minRail, footprint + 4)) continue;
    if (reserved.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + footprint)) continue;
    if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + footprint + 1)) continue;
    placed.push({ x: q.x, z: q.z, r: footprint });
    addWorld(models[Math.floor(rand() * models.length)], [q.x, y, q.z], { rotationY: round(rand() * 360), scale: round(between(scale[0], scale[1]), 2) });
    n++;
  }
  if (n < count) problems.push(`${models.join('/')}: placed ${n} of ${count}`);
}
/** A gate's look: its arch and cloud tunnel on the rail (the tunnel 40 m long, its middle at `mid`). */
const tunnel = (railId, mid) => addOnRail('cloud-tunnel', railId, mid, { height: 0 });

// The headquarters' town (1-1's), inside the ring and round it.
addOnRail('hq', 'hub', HONBU_AT + 62, { lateral: -24, rotationY: 90 });
addOnRail('tower', 'hub', 540, { lateral: -30 });
for (const g of GATES) {
  const n = g.n;
  addOnRail(`world-gate-${n}`, `g${n}`, G_ARCH, { height: 0 });
  tunnel(`g${n}`, (G_ARCH + G_LENGTH) / 2);
  tunnel(`r${n}`, R_ARCH / 2);
  addOnRail(`world-gate-${n}`, `r${n}`, R_ARCH, { height: 0, rotationY: 180 });
  // The gate's board before its fork, outside the ring (the pictures of its page's worlds).
  addOnRail(`gate-board-${n}`, 'hub', g.fork - 35, { lateral: 7, rotationY: -90 });
}
addOnRail('bunting', 'hub-ura', 22, { lateral: HUB_URA_SIDE * 6, rotationY: HUB_URA_SIDE > 0 ? -90 : 90 });
// The back of the headquarters' town behind the back platform's buffer (what the rear window looks at).
{
  const b = hubUra.at(0);
  const back = (d, side) => [b.x - Math.sin(b.h) * d - Math.cos(b.h) * side, 0, b.z - Math.cos(b.h) * d + Math.sin(b.h) * side];
  addWorld('house-a', back(34, -10), { rotationY: b.h / RAD });
  addWorld('tree-b', back(24, 6));
  addWorld('tree-a', back(26, -4));
}
scatter(['house-a', 'house-b', 'shop'], 5, { zones: [['hub', 0, 960]], lat: [14, 24], footprint: 6, side: -1 });
scatter(['house-a', 'shop'], 8, { zones: [['hub', 0, 960]], lat: [18, 45], footprint: 7, side: 1 });
scatter(['tree-a', 'tree-b'], 11, { zones: [['hub', 0, 960]], lat: [10, 45], footprint: 2.5, side: 1 });
scatter(['tree-a'], 4, { zones: [['hub', 0, 960]], lat: [9, 26], footprint: 2.5, side: -1 });
addOnRail('crossing-sign', 'hub', 760, { lateral: 4 });

// p1: the valley, the cloud islands, the forest.
tunnel('p1', 20);
addOnRail('world-gate-1', 'p1', 900, { height: 0 });
tunnel('p1', 930);
scatter(['cliff-a', 'cliff-b'], 14, { zones: [['p1', 60, 240]], lat: [22, 45], footprint: 6 });
scatter(['fern-a', 'fern-b'], 16, { zones: [['p1', 50, 250]], lat: [6, 22], footprint: 1.5, minRail: 5 });
for (const s of [90, 150, 190]) addOnRail('cycad', 'p1', s, { lateral: s % 20 === 10 ? -8 : 9 });
scatter(['rock-a', 'boulder'], 12, { zones: [['p1', 50, 250]], lat: [8, 36], footprint: 2 });
for (const s of [300, 360, 410]) addOnRail('island-b', 'p1', s, { height: -9, scale: 0.6 });
addOnRail('cloud-a', 'p1', (GAP.from + GAP.to) / 2, { height: -6 });
addOnRail('cloud-b', 'p1', GAP.from - 6, { lateral: 6, height: -7 });
scatter(['cloud-a'], 8, { zones: [['p1', ISLANDS.from, ISLANDS.to]], lat: [10, 36], footprint: 4, y: 3 });
scatter(['tree-a', 'tree-b'], 50, { zones: [['p1', 470, 900], ['p1-ura', 0, 60]], lat: [8, 40], footprint: 2.5, scale: [1.2, 1.8] });
scatter(['mushroom'], 12, { zones: [['p1', 630, 900]], lat: [4, 16], footprint: 1, minRail: 4.5 });
// Record ①'s big tree behind the siding's buffer (its hollow towards the rear window).
{
  const b = p1Ura.at(0);
  addWorld('great-tree', [b.x - Math.sin(b.h) * 14, 0, b.z - Math.cos(b.h) * 14], { rotationY: (b.h / RAD + 180) % 360, scale: 0.3 });
}
// The squirrel's tree beside the rail.
addOnRail('tree-b', 'p1', SQUIRREL, { lateral: -6, scale: 1.6 });

// p2: the beach and the sea, the harbour, the snow.
tunnel('p2', 20);
addOnRail('world-gate-2', 'p2', 900, { height: 0 });
tunnel('p2', 930);
scatter(['palm'], 20, { zones: [['p2', 50, 200], ['p2', 300, 440]], lat: [8, 36], footprint: 2.5 });
scatter(['rock-a', 'rock-b'], 10, { zones: [['p2', 50, 440]], lat: [8, 40], footprint: 2 });
addOnRail('lighthouse', 'p2', 350, { lateral: -40 });
addOnRail('harbour-house', 'p2', 300, { lateral: 18, rotationY: -90 });
addOnRail('harbour-house', 'p2', 340, { lateral: -16, rotationY: 90 });
scatter(['snow-pine'], 80, { zones: [['p2', 460, 900]], lat: [9, 55], footprint: 2.5 });
scatter(['snow-bank'], 20, { zones: [['p2', 450, 900]], lat: [6, 26], footprint: 3, minRail: 6 });
scatter(['snow-house', 'snow-house-b', 'kamakura'], 16, { zones: [['p2', 740, 880]], lat: [14, 45], footprint: 6 });
scatter(['lantern'], 10, { zones: [['p2', 750, 850]], lat: [5, 9], footprint: 0.6, minRail: 4.5 });
// Record ②'s cove: rocks round the siding's far end.
{
  const b = p2Ura.at(0);
  const back = (d, side) => [b.x - Math.sin(b.h) * d - Math.cos(b.h) * side, 0, b.z - Math.cos(b.h) * d + Math.sin(b.h) * side];
  addWorld('coral-arch', back(10, 0), { rotationY: b.h / RAD });
  addWorld('rock-a', back(8, 7));
  addWorld('rock-b', back(9, -7));
}

// p3: the firefly wood, the toy town, the mirror gate, the castle far off.
tunnel('p3', 20);
addOnRail('world-gate-3', 'p3', 900, { height: 0 });
tunnel('p3', 930);
scatter(['night-tree-a', 'night-tree-b'], 80, { zones: [['p3', 50, 380]], lat: [7, 45], footprint: 2.5 });
scatter(['glow-mushroom'], 30, { zones: [['p3', 60, 380]], lat: [3.5, 12], footprint: 0.8, minRail: 3.5 });
addOnRail('lantern-post', 'p3', 95, { lateral: 4 });
scatter(['block-house-a', 'block-house-b', 'block-house-c'], 26, { zones: [['p3', TOY.from, TOY.to]], lat: [12, 42], footprint: 6 });
scatter(['screw-post', 'block-folk-a'], 20, { zones: [['p3', TOY.from, TOY.to]], lat: [5, 14], footprint: 0.8, minRail: 4.5 });
addOnRail('band-trumpet', 'p3', 520 - 12, { lateral: -4.5, rotationY: 90 });
addOnRail('band-drum', 'p3', 520 - 15, { lateral: -4.5, rotationY: 90 });
addOnRail('mirror-frame', 'p3', MIRROR_GATE, { height: 0 });
scatter(['crystal-tree-a', 'crystal-tree-b'], 16, { zones: [['p3', 620, 700]], lat: [8, 30], footprint: 2 });
scatter(['tree-upside', 'house-upside-a'], 20, { zones: [['p3', CASTLE_FROM, 900]], lat: [14, 50], footprint: 5 });
const CASTLE = { at: 820, lateral: -110 };
addOnRail('castle-island', 'p3', CASTLE.at, { lateral: CASTLE.lateral, height: 0 });
addOnRail('sakasa-castle', 'p3', CASTLE.at, { lateral: CASTLE.lateral, height: 0, rotationY: 90 });
// Record ③'s den behind the siding's buffer: the hut, the toy-block train, a lantern.
{
  const b = p3Ura.at(0);
  const back = (d, side) => [b.x - Math.sin(b.h) * d - Math.cos(b.h) * side, 0, b.z - Math.cos(b.h) * d + Math.sin(b.h) * side];
  addWorld('sakasa-hideout', back(12, 0), { rotationY: b.h / RAD });
  addWorld('toy-block-train', back(7, 5), { rotationY: b.h / RAD + 70 });
  addWorld('lantern', back(6, -4));
}
// Iron odds and ends for the magnet's play (PHASE9_0 §3), one in each section.
for (const [railId, s, lat, model] of [
  ['hub', 330, 6, 'iron-can'],
  ['p1', 700, -6, 'iron-bucket'],
  ['p2', 720, 6, 'iron-can'],
]) props.push({ model, onRail: { railId, at: s, lateral: lat }, iron: model === 'iron-can' ? 'can' : 'bucket' });

// ---------------------------------------------------------------------------------------------------------------
// Checks (B4, B6.7, B9)
// ---------------------------------------------------------------------------------------------------------------

check(Math.abs(hub.length - 960) < 0.5, `hub ${hub.length.toFixed(1)} m (960)`);
{
  const end = hub.at(hub.length);
  const start = hub.at(0);
  check(Math.hypot(end.x - start.x, end.z - start.z) < 0.5, `hub closes on itself (${Math.hypot(end.x - start.x, end.z - start.z).toFixed(2)} m)`);
  const { worst } = gameCurveCheck(hub, [HONBU_AT, URA_AT, ...GATES.flatMap((g) => [g.fork, g.merge])]);
  check(worst.d < 0.3, `hub as the game's curve: ${worst.d.toFixed(2)} m off at ${worst.s}`);
}
for (const line of [p1, p2, p3]) {
  check(Math.abs(line.length - 960) < 1, `${line.id} ${line.length.toFixed(1)} m (960)`);
  const { worst } = gameCurveCheck(line, [45, 200, 300, 400, 500, 600, 700, 760, 800, 900]);
  check(worst.d < 0.3, `${line.id} as the game's curve: ${worst.d.toFixed(2)} m off at ${worst.s}`);
}
for (const l of [...gLines, ...rLines, hubUra, p1Ura, p2Ura, p3Ura]) report.push(`${l.id} ${l.length.toFixed(1)} m`);
for (const [l, main, mouth] of [[hubUra, hub, URA_AT], [p1Ura, p1, P1_URA_AT], [p2Ura, p2, P2_URA_AT], [p3Ura, p3, P3_URA_AT]]) {
  const end = l.at(l.length);
  const m = main.at(mouth);
  check(Math.hypot(end.x - m.x, end.z - m.z) < 0.5, `${l.id} merges on ${main.id} ${mouth}`);
}
{
  // The sections' rails far apart (B6.7: the farthest fog 500 × 4 + 40, and 100).
  const need = 500 * 4 + 40 + 100;
  const sections = { hub: [hub, hubUra, ...gLines, ...rLines], p1: [p1, p1Ura], p2: [p2, p2Ura], p3: [p3, p3Ura] };
  const ids = Object.keys(sections);
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      let best = Infinity;
      for (const la of sections[ids[a]]) for (let s = 0; s <= la.length; s += 10) {
        const p = la.at(s);
        for (const lb of sections[ids[b]]) for (let t = 0; t <= lb.length; t += 10) {
          const q = lb.at(t);
          best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
        }
      }
      check(best >= need, `sections ${ids[a]} and ${ids[b]} ${best.toFixed(0)} m apart (${need})`);
    }
  }
}
{
  // No two stretches of rail come near each other apart from where they meet (forks and merges).
  const joints = [
    ...GATES.flatMap((g) => [hub.at(g.fork), hub.at(g.merge)]),
    hub.at(URA_AT),
    hub.at(0),
    p1.at(P1_URA_AT),
    p2.at(P2_URA_AT),
    p3.at(P3_URA_AT),
  ];
  let worst = { d: Infinity };
  const lines = Object.values(LINES);
  for (const a of lines) {
    for (const b of lines) {
      if (a.id > b.id) continue;
      for (let s = 0; s <= a.length; s += 2) {
        const p = a.at(s);
        for (let t = 0; t <= b.length; t += 2) {
          if (a === b && (Math.abs(s - t) < 150 || (a === hub && a.length - Math.abs(s - t) < 150))) continue;
          const q = b.at(t);
          if (a !== b && joints.some((j) => Math.hypot(p.x - j.x, p.z - j.z) < 45 || Math.hypot(q.x - j.x, q.z - j.z) < 45)) continue;
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d < worst.d) worst = { d, a: a.id, s, b: b.id, t };
        }
      }
    }
  }
  check(worst.d > 12, `nearest two stretches of rail apart from the joints: ${worst.d.toFixed(1)} m (${worst.a} ${worst.s} / ${worst.b} ${worst.t})`);
}
{
  const { surfaces, dives } = waterSpans(p2, WATERS);
  report.push(`p2 on water: ${surfaces.map((x) => `${x.from}–${x.to}`).join(', ')}; under: ${dives.map((x) => `${x.from}–${x.to}`).join(', ') || 'none'}`);
  check(surfaces.length === 1 && Math.abs(surfaces[0].from - SEA.from) <= 3 && Math.abs(surfaces[0].to - SEA.to) <= 3, `the sea's stretch is p2 ${SEA.from}–${SEA.to}`);
  for (const line of Object.values(LINES)) {
    if (line === p2) continue;
    const w = waterSpans(line, WATERS);
    check(w.surfaces.length === 0 && w.dives.length === 0, `${line.id} has no water stretch`);
  }
  for (const k of LOGS) check(k - 20 >= SEA.from && k + 20 <= SEA.to, `driftwood ${k} well inside the sea`);
}
check(STATIONS.find((s) => s.id === 'mori-eki').at - SLOPE.to >= 200, `the slope's top is ${760 - SLOPE.to} m before もりの えき (200 at least)`);
check(SLOPE.from >= HILL.from && SLOPE.to <= HILL.to, 'the slope is on the hill');
{
  // B9: lines 20 letters at most.
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints ?? []) texts.push(h.text);
    for (const st of m.steps) if (st.say) texts.push(st.say);
  }
  for (const g of GIMMICKS) for (const k of ['line', 'done']) if (g.params?.[k]) texts.push(g.params[k]);
  for (const r of RECORDS) texts.push(r.name, r.note, ...(r.endLines ?? []).map((l) => l.text));
  for (const f of FLOATERS) if (f.say) texts.push(f.say);
  for (const a of ACTORS) if (a.params?.say) texts.push(a.params.say);
  for (const j of JUNCTIONS) if (j.line) texts.push(j.line.text);
  for (const steps of [opening, mori, kamakura, ending]) for (const st of steps) {
    if (st.say) texts.push(st.say);
    if (st.card) texts.push(...st.card.title.split('\n'), st.card.button);
  }
  const long = texts.map((t) => t.replace('{station}', 'ゆきの むらえき')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
}
{
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The stage (B14)
// ---------------------------------------------------------------------------------------------------------------

const rail = (line, end, extra = {}) => ({ id: line.id, points: line.points(), ...extra, end });
const stage = {
  schemaVersion: 1,
  id: '6-2',
  title: 'つながったせかい',
  chapter: 6,
  unlock: { requires: ['6-1'], purchase: null },
  unlocks: [],
  clearButton: 'やったね！',
  crew: ['sakasa'],
  environment: {
    sky: { top: '#4f9fe8', bottom: '#eaf6ff' },
    fog: { color: '#eaf6ff', near: 140, far: 420 },
    lighting: 'day',
    ground: { y: 0, size: 1400, color: '#8fc26a' },
    water: WATERS,
    festival: { bursts: BURSTS },
    bgm: 'tsunagari',
    ambience: 'town',
    surface: 'rail',
    fall: 'cloud',
  },
  start: { railId: 'hub', at: HONBU_AT, direction: 1 },
  sections: [
    { id: 'hub', rails: ['hub', 'hub-ura', ...gLines.map((l) => l.id), ...rLines.map((l) => l.id)], environment: {} },
    {
      id: 'p1',
      rails: ['p1', 'p1-ura'],
      environment: {
        sky: { top: '#5aa8f0', bottom: '#eaf7ee' },
        fog: { color: '#eaf7ee', near: 140, far: 480 },
        lighting: 'day',
        ground: { y: 0, size: 1400, color: '#7fb069' },
        ambience: 'valley',
        surface: 'rail',
        fall: 'leaf',
      },
    },
    {
      id: 'p2',
      rails: ['p2', 'p2-ura'],
      environment: {
        sky: { top: '#5fb4f4', bottom: '#f0f8ff' },
        fog: { color: '#f0f8ff', near: 150, far: 500 },
        lighting: 'day',
        ground: { y: 0, size: 1400, color: '#efede2' },
        ambience: 'sea',
        surface: 'rail',
        fall: 'water',
      },
    },
    {
      id: 'p3',
      rails: ['p3', 'p3-ura'],
      environment: {
        sky: { top: '#141c46', bottom: '#3d3f7e' },
        fog: { color: '#2a3566', near: 90, far: 360 },
        lighting: 'night',
        ground: { y: 0, size: 1400, color: '#2f4a3a' },
        stars: { count: 300 },
        moon: { azimuth: 20, elevation: 24, size: 1 },
        fireflies: { count: 80, radius: 60 },
        ambience: 'night',
        fall: 'cloud',
      },
    },
  ],
  rails: [
    rail(hub, { type: 'merge', railId: 'hub', at: 0 }),
    rail(hubUra, { type: 'merge', railId: 'hub', at: URA_AT }),
    ...GATES.map((g, i) => rail(gLines[i], { type: 'portal', railId: g.to, at: 45 })),
    ...GATES.map((g, i) => rail(rLines[i], { type: 'merge', railId: 'hub', at: g.merge })),
    rail(p1, { type: 'portal', railId: 'r1', at: 45 }, {
      gaps: [{ from: GAP.from, to: GAP.to, hint: 'normal' }],
      base: [
        { look: 'rock', toGround: true, from: 215, to: GAP.from },
        { look: 'rock', toGround: true, from: GAP.to, to: 470 },
        { look: 'rock', toGround: true, from: HILL.from + 10, to: HILL.to },
      ],
    }),
    rail(p1Ura, { type: 'merge', railId: 'p1', at: P1_URA_AT }),
    rail(p2, { type: 'portal', railId: 'r2', at: 45 }),
    rail(p2Ura, { type: 'merge', railId: 'p2', at: P2_URA_AT }),
    rail(p3, { type: 'portal', railId: 'r3', at: 45 }),
    rail(p3Ura, { type: 'merge', railId: 'p3', at: P3_URA_AT }),
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
  cutscenes: { opening, mori, kamakura, ending },
};

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY && !problems.length) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}
