#!/usr/bin/env node
/**
 * Stage 6-1 "さかさまのしろ": builds src/stages/6-1.json from docs/PHASE9_CHAPTER5_6.md 第 7 部 (§3, §5–§13), read with
 * §0 and docs/PHASE9_0_FREE_ABILITIES.md (every learned ability works anywhere; a glow is only a hint; うしろむき is
 * learned in M2's chase). Sakasa's upside-down town and her castle standing on its spire on an island in a moat.
 *
 *   M1 ぎゃくのまち: every ability once, each on something upside down: the chick walking backwards (whistle), the
 *      upside-down crossing (magnet), the reversed sign (light), the waterfall flowing up a slope (rocket), the top
 *      spinning on its head (magnet, record ②), snow piled upwards (snowplow), the upside-down bridge's cut (jump,
 *      record ①), the umbrella boats on the upside-down pond (dive); the balcony cutscene at とけいだいえき.
 *   M2 おいかけっこ: Sakasa runs ahead round the moat (`lead`); "とまって" twice and she runs further; "ぎゃくだ！", the
 *      train stops and うしろむき is learned there (cutscene `gyaku`); backing up she turns round and follows; then
 *      ほりばたえき opens. Sakasa sits down on the castle station's bench (`suwaru`).
 *   M3 のせてあげる: the drawbridge (magnet), おしろえき, the doors open and stay open: say nothing and she boards
 *      (`welcome`). The ending: "…こんにちは", she joins, "ワンダーごう、しゅっぱつ！" (`crew`, `depart`).
 *   Record ③ (うしろむき) waits at the end of a back siding just out of ぎゃくまちえき (main 90).
 *
 *   node scripts/layout-6-1.mjs         write src/stages/6-1.json and print the checks
 *   node scripts/layout-6-1.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel (heading north, right is −X; heading east, right is +Z).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, inArea, keyed, Line, mulberry32, pretty, RAD, round, walk, waterSpans } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/6-1.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

// ---------------------------------------------------------------------------------------------------------------
// Rails (§5.1–§5.5)
// ---------------------------------------------------------------------------------------------------------------

const R = 191;
/** §5.1 main, 1,960 m: north out of the town, through it to the clock tower and on into the moat's ring. */
const MAIN_SEGMENTS = [
  ['S', 330],
  ['L', R, 30],
  ['S', 130],
  ['R', R, 30],
  ['S', 130],
  ['L', R, 30],
  ['S', 160],
  ['R', R, 30],
  ['S', 250],
  ['L', R, 30],
  ['R', R, 30],
  ['S', 360],
];
const SLOPE = { from: 910, to: 980, rise: 15.4 };
/** Level to the falls' slope (its middle 22%), level on the hill, down 1400–1600 (looks only, no slope there). */
const MAIN_KEYS = [
  [0, 0],
  [SLOPE.from - 5, 0],
  [SLOPE.from + 5, 1.1],
  [SLOPE.to - 5, SLOPE.rise - 1.1],
  [SLOPE.to + 5, SLOPE.rise],
  [1400, SLOPE.rise],
  [1600, 0],
];
const main = new Line('main', walk(0, 0, 0, MAIN_SEGMENTS, keyed(MAIN_KEYS)));

/** §5.2 the dead end `uso` past the reversed sign (left at main 720): R60 25°, then 64 m. */
const SIGN_AT = 720;
const usoStart = main.at(SIGN_AT);
const uso = new Line('uso', walk(usoStart.x, usoStart.z, usoStart.h / RAD, [['L', 60, 25], ['S', 64]], () => 0));

/**
 * §5.3 the back siding `ura` (record ③): from its buffer (s 0) to main 90 (it merges there). Walked from the mouth
 * backwards (heading south, a left turn towards −X: R60 50°, then 20 m) and turned round.
 */
const URA_AT = 90;
const uraMouth = main.at(URA_AT);
const uraBack = walk(uraMouth.x, uraMouth.z, uraMouth.h / RAD + 180, [['L', 60, 50], ['S', 20]], () => 0);
const uraLength = uraBack[uraBack.length - 1].s;
const ura = new Line(
  'ura',
  uraBack
    .slice()
    .reverse()
    .map((p) => ({ ...p, s: uraLength - p.s })),
);

/** §5.4 the moat's ring `wa` (742.6 m): from main's end, north, round to the left (the moat always on the left). */
const P = main.at(main.length);
const wa = new Line('wa', walk(P.x, P.z, 0, [['S', 120], ['L', 80, 180], ['S', 120], ['L', 80, 180]], () => 0));
const FORK_AT = 30;
/**
 * §5.5 `shiro` to the island: left from wa 30 (R30, 90°), then east across the moat to its buffer. The table's island
 * station at shiro 117 put the drawbridge's glow (80 m before its face at 62) into the station's braking (80 m before
 * its stop line; 第 2 部 M10, §0.9 の 19), so the island sits 28 m further east in the moat and everything on it moved
 * with it: おしろえき 145, the buffer 165.
 */
const forkPoint = wa.at(FORK_AT);
const SHIRO_LENGTH = 165;
const shiro = new Line('shiro', walk(forkPoint.x, forkPoint.z, 0, [['L', 30, 90], ['S', SHIRO_LENGTH - 30 * 90 * RAD]], () => 0));
const LINES = { main, uso, ura, wa, shiro };

// ---------------------------------------------------------------------------------------------------------------
// Places (§3, §5)
// ---------------------------------------------------------------------------------------------------------------

const at = (s, lateral = 0, up = 0, line = main) => {
  const q = line.point(s, lateral, up);
  return [round(q.x), round(q.y), round(q.z)];
};
const on = (railId, s, lateral = 0, heightFromRail) => ({
  railId,
  at: round(s, 1),
  ...(lateral ? { lateral } : {}),
  ...(heightFromRail !== undefined ? { heightFromRail } : {}),
});

const STATIONS = [
  { id: 'machi', name: 'ぎゃくまちえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'tokei', name: 'とけいだいえき', railId: 'main', at: 1860, platformSide: 'left' },
  { id: 'horibata', name: 'ほりばたえき', railId: 'wa', at: 470, platformSide: 'right' },
  { id: 'oshiro', name: 'おしろえき', railId: 'shiro', at: 145, platformSide: 'left' },
];
const CHICK = 300;
const CROSSING = 490;
const TOP = { at: 1085, lateral: 9, height: 5 };
const SNOW = { from: 1190, to: 1222 };
const GAP = { from: 1330, to: 1342, rewind: 1265 };
const BRIDGE = { from: 1300, to: 1370 };
const POND = { from: 1640, to: 1740 };
const KASA = [1670, 1712];
const DRAWBRIDGE = { from: 62, to: 72 };
/** The castle: on the island, across the line from the platform (right of `shiro`, which runs east: north). */
const ISLAND_AT = 125.1;
const CASTLE = { at: ISLAND_AT, lateral: 14 };
const castlePos = at(CASTLE.at, CASTLE.lateral, 0, shiro);
/** The island in the moat: `shiro`'s middle runs over it (§5.4; the table's [378.5, 1954.1], P moved by the slope). */
const ISLAND_C = shiro.at(ISLAND_AT);
const ISLAND = { center: [round(ISLAND_C.x, 1), round(ISLAND_C.z, 1)], radius: 25 };
/** The moat: in the middle of the ring (10 m from its straights, 19 m from its round ends). */
const MOAT_CENTER = [round((P.x + 80), 1), round(P.z + 60, 1)];
/** The bench Sakasa waits on (left of `shiro` = south, on the platform; its seat 0.45 m above the platform). */
const BENCH = { at: 108, lateral: -5.5 };
const PLATFORM_Y = 1;
const SEAT_Y = round(PLATFORM_Y + 0.45, 2);

const WATERS = [
  // The upside-down pond under main 1640–1740 (the rail on its surface: the floaters and diving).
  {
    y: -0.4,
    floor: -6,
    look: 'lake',
    area: { rect: { center: [round(main.at(1690).x, 1), round(main.at(1690).z, 1)], size: [40, 100], rotationY: 0, corner: 8 } },
    under: { color: '#3d6fa8', far: 30 },
  },
  // The moat round the island (2 m below the rails: no water stretch on them).
  { y: -2, floor: -7, look: 'lake', area: { rect: { center: MOAT_CENTER, size: [140, 180], rotationY: 0, corner: 40 } } },
  // The pool at the foot of the waterfall that flows up beside the slope (looks only; left of the rail).
  {
    y: -0.3,
    floor: -2,
    look: 'lake',
    area: {
      rect: {
        center: [round(main.point((SLOPE.from + SLOPE.to) / 2, -16).x, 1), round(main.point((SLOPE.from + SLOPE.to) / 2, -16).z, 1)],
        size: [12, 80],
        rotationY: round(main.at((SLOPE.from + SLOPE.to) / 2).h / RAD, 1),
        corner: 5,
      },
    },
  },
];
const fallsLip = [main.point(SLOPE.from + 5, -10), main.point(SLOPE.to - 5, -10)];

const JUNCTIONS = [
  { id: 'sakasa-wakare', railId: 'main', at: SIGN_AT, left: 'uso', right: 'main', default: 'left', signReversed: true, glow: true },
  { id: 'shiro-wakare', railId: 'wa', at: FORK_AT, left: 'shiro', right: 'wa', default: 'right' },
  // The back siding (as seen reversing, heading south, it goes off to the left). The loader stands the swirl post.
  { id: 'ura-guchi', railId: 'main', at: URA_AT, back: true, left: 'ura', right: 'main', default: 'right', line: 'うしろに としょかんが ある！' },
];

const GIMMICKS = [
  {
    type: 'magnet',
    railId: 'main',
    from: CROSSING,
    params: { id: 'fumikiri', kind: 'gate', look: 'crossing', line: 'ふみきりが さかさ！ じしゃく！', done: 'ふみきり、なおった！' },
  },
  { type: 'slope', railId: 'main', from: SLOPE.from, to: SLOPE.to, params: { pull: -6, rewind: { railId: 'main', at: 865 }, line: 'うえに ながれる たき！ ロケット！' } },
  {
    type: 'waterfall',
    params: {
      from: [round(fallsLip[0].x, 1), round(fallsLip[0].z, 1)],
      to: [round(fallsLip[1].x, 1), round(fallsLip[1].z, 1)],
      top: SLOPE.rise,
      bottom: -0.3,
      lip: 1,
      up: true,
    },
  },
  { type: 'plow-wall', railId: 'main', from: SNOW.from, to: SNOW.to, params: { look: 'hanging', line: 'ゆきが うえに つもってる！' } },
  {
    type: 'magnet',
    railId: 'shiro',
    from: DRAWBRIDGE.from,
    to: DRAWBRIDGE.to,
    params: {
      id: 'hanebashi',
      kind: 'bridge',
      look: 'drawbridge',
      piece: { lateral: 0, height: 5, rotationY: 0 },
      line: 'はねばしが あがってる！ じしゃく！',
      done: 'はしが おりた！ つながった！',
    },
  },
  { type: 'camera', railId: 'main', from: 895, to: 995, params: { mode: 'chase' } },
  { type: 'camera', railId: 'main', from: 1318, to: 1352, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 1650, to: 1730, params: { mode: 'chase' } },
  { type: 'camera', railId: 'shiro', from: 40, to: 80, params: { mode: 'chase' } },
  { type: 'sound', railId: 'main', from: BRIDGE.from, to: BRIDGE.to, params: { surface: 'bridge' } },
  { type: 'sound', railId: 'shiro', from: 55, to: 80, params: { surface: 'wood' } },
];

const ACTORS = [
  {
    id: 'hiyoko',
    type: 'cat',
    reactsTo: 'whistle',
    onRail: { railId: 'main', at: CHICK, heightFromRail: 0 },
    params: {
      look: 'windup-chick',
      wakeDistance: 70,
      dangerDistance: 8,
      fleeLateral: 5,
      fleeSeconds: 1.5,
      walk: { speed: 0.8, max: 10 },
      glow: true,
      say: 'ひよこさんが うしろあるき！ きてき！',
      woke: 'くるりん！ まえむきに なった！',
      danger: 'わわっ、ひよこさん！',
      after: 'ひかったら きてきで まきなおそう',
    },
  },
];

const RECORDS = [
  {
    id: 'up-raindrop',
    name: 'うえに ふる あめつぶ',
    note: 'ジャンプで とどいた そらの しずく',
    requires: 'jump',
    model: 'up-raindrop',
    onRail: { railId: 'main', at: (GAP.from + GAP.to) / 2, heightFromRail: 5 },
  },
  {
    id: 'upside-top',
    name: 'あたまで まわる こま',
    note: 'じしゃくで ひきよせた てつの こま',
    requires: 'magnetLight',
    model: 'upside-top',
    hint: 'こまが さかさに まわってる！',
    onRail: { railId: 'main', at: TOP.at, lateral: TOP.lateral, heightFromRail: TOP.height },
  },
  {
    id: 'backward-book',
    name: 'うしろから よむ えほん',
    note: 'おしまいから はじまる おはなし',
    requires: 'reverse',
    model: 'backward-book',
    onRail: { railId: 'ura', at: 10, lateral: 2.5, heightFromRail: 1.2 },
    endLines: [{ text: 'さかさまの としょかんだ！' }, { text: 'えほんも うしろから よむの？' }],
  },
];

const FLOATERS = [
  { id: 'kasa-1', railId: 'main', at: KASA[0], look: 'umbrella', say: 'かさの ふね！ もぐって くぐろう' },
  { id: 'kasa-2', railId: 'main', at: KASA[1], look: 'umbrella' },
];

const LEAD = {
  id: 'sakasa',
  model: 'amanojaku',
  railId: 'wa',
  from: 60,
  lateral: -6,
  keep: 45,
  dash: 90,
  calls: 2,
  learn: 'gyaku',
  home: { railId: 'shiro', at: BENCH.at, lateral: BENCH.lateral, heightFromRail: SEAT_Y, model: 'amanojaku-sit', rotationY: -90 },
  music: 'oikake',
};
const DOOR = { at: 145 - 30.5, lateral: -2.8 };
const welcomeCam = { at: at(DOOR.at + 3.5, -20, 6, shiro), lookAt: at(DOOR.at, DOOR.lateral, 1.5, shiro), reach: 1 };

const MISSIONS = [
  {
    id: 'm1',
    type: 'repair',
    title: 'ぎゃくのまち',
    steps: [{ stationId: 'tokei' }],
    lines: {
      start: 'まずは とけいだいえきまで！\nさかさまを ぜんぶ こえて いこう',
      signNear: 'ひょうしき さかさま！ ライトで みて',
      deadEnd: 'いきどまり… ライトで みよう',
      diveNear: 'さかさの いけ！ もぐるを おして！',
      magnetBump: 'ぽよん！ ふみきりが しまってた〜',
      stationNear: 'とけいだいえきだ。ゆっくり！',
      complete: 'ぜんぶの ちから、つかえたね！',
    },
    hints: [
      { railId: 'main', at: 80, text: 'ピンクの ぐるぐる… なに？', unless: 'reverse' },
      { railId: 'main', at: 180, text: 'いえが さかさま！ やねが したに！' },
      { railId: 'main', at: 360, text: 'きが さかさまに はえてる！' },
      { railId: 'main', at: 1790, text: 'とけいが うしろに まわってる！' },
    ],
    onComplete: 'balcony',
  },
  {
    id: 'm2',
    type: 'pickup',
    title: 'おいかけっこ',
    junctions: { 'shiro-wakare': { lock: 'right' } },
    steps: [{ stationId: 'horibata', lead: LEAD }],
    lines: {
      start: 'ほりの わへ しゅっぱつ！',
      stationNear: 'ほりばたえきだ。ゆっくり！',
      complete: 'サカサ、ついて きて くれたね',
    },
    onComplete: 'suwaru',
  },
  {
    id: 'm3',
    type: 'pickup',
    title: 'のせてあげる',
    junctions: { 'shiro-wakare': { default: 'left' } },
    steps: [
      {
        stationId: 'oshiro',
        welcome: {
          actor: 'sakasa',
          model: 'amanojaku-lantern',
          pickup: 'chochin',
          seat: { railId: 'shiro', at: BENCH.at, lateral: BENCH.lateral },
          camera: welcomeCam,
        },
      },
    ],
    lines: {
      start: 'こんどは しずかに まって あげよう\nサカサが じぶんで くるよ',
      magnetBump: 'ぽよん！ はしが あがってた〜',
      stationNear: 'おしろえきだ。そーっと とまろう',
      perfect: 'ぴたっ… しーっ',
      ok: 'ぴたっ… しーっ',
    },
    hints: [{ railId: 'wa', at: 690, text: 'ひだりの やじるしで おしろへ！' }],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

const cam = (from, to, reach = 2.5) => ({ camera: 'fixed', at: from, lookAt: to, reach });
const opening = [
  { caption: 'さかさまの しろ', seconds: 2.5 },
  // From behind ぎゃくまちえき, looking north: the castle's shadow far off (the landmark), upside-down houses near.
  cam([-12, 9, 20], [60, 25, 600]),
  { say: 'ここが サカサの おしろ！', emote: 'jump' },
  { say: 'まちも しろも、ぜんぶ さかさま！', emote: 'tilt' },
  { camera: 'cab' },
  { say: 'おぼえた こと、ぜんぶ つかおう！', emote: 'cheer' },
];

/** M1's end at とけいだいえき: Sakasa on the castle's balcony, "さようなら〜！" and off inside with "こんにちは〜！". */
const BALCONY_Y = 34.5;
const balcony = [
  cam(at(1800, -6, 4), [castlePos[0], 25, castlePos[2]]),
  { spawn: 'sakasa', model: 'amanojaku', onRail: on('shiro', CASTLE.at, CASTLE.lateral, BALCONY_Y), rotationY: 200 },
  { say: 'あっ、おしろの うえに だれか！', emote: 'jump' },
  cam([365, 8, 1905], [castlePos[0], 34, castlePos[2]], 1.5),
  { say: 'さようなら〜！', who: 'amanojaku' },
  { say: 'サカサ！ まって〜！', emote: 'jump' },
  { say: 'こんにちは〜！', who: 'amanojaku' },
  { move: 'sakasa', onRail: on('shiro', CASTLE.at, CASTLE.lateral + 4, BALCONY_Y), seconds: 0.8 },
  { remove: 'sakasa' },
  { camera: 'cab' },
  { say: '…まってって いったのに', emote: 'tilt' },
  { say: 'おいかけよう！' },
];

/** M2, the train standing in the chase (lead.learn): the partner works it out; うしろむき is learned. */
const gyaku = [
  { camera: 'cab' },
  { say: 'ぎゃくだ… にげる なら…', emote: 'tilt' },
  { say: 'こっちが うしろへ いったら…？', icon: 'run-swirl' },
  { unlock: 'reverse' },
  { say: 'きりかえを うしろに して みて！', emote: 'jump' },
];

/** M2's end at ほりばたえき: across the moat, Sakasa alone on the castle station's bench with 4-2's lantern. */
const benchAt = at(BENCH.at, BENCH.lateral, PLATFORM_Y + 0.8, shiro);
const suwaru = [
  cam(at(470 - 10, 6, 6, wa), [ISLAND.center[0] - 13, 6, ISLAND.center[1] - 4], 1.5),
  { spawn: 'sakasa', model: 'amanojaku-sit', onRail: on('shiro', BENCH.at, BENCH.lateral, SEAT_Y), rotationY: -90 },
  { spawn: 'chochin', model: 'lantern', onRail: on('shiro', BENCH.at - 1, BENCH.lateral, round(PLATFORM_Y + 0.9, 2)) },
  { say: 'あっ… サカサ', emote: 'tilt' },
  { say: 'おしろの えきで すわってる' },
  cam(at(BENCH.at - 8, -12, 4.5, shiro), benchAt, 1),
  { say: 'ひとりで まってる みたい', emote: 'tilt' },
  { say: 'こんどは そーっと いって みよう' },
];

/** The ending at おしろえき (第 1 部 §5.1): "…こんにちは", she joins the team, and the Wonder train sets off. */
const ending = [
  // Scene 1: beside the second car; Sakasa walks forward inside, from the back door.
  cam(at(132.5, -12, 3.5, shiro), at(132.5, 0, 2.8, shiro), 1),
  { spawn: 'sakasa-in', model: 'amanojaku', onRail: on('shiro', 118, -0.8, 1.2) },
  { move: 'sakasa-in', onRail: on('shiro', 132.5, -0.8, 1.2), seconds: 2 },
  { say: '…こんにちは', who: 'amanojaku' },
  { say: 'ちゃんと こんにちは だ！', emote: 'jump' },
  { say: 'こんにちは！ よし、いこう！', emote: 'cheer' },
  { remove: 'sakasa-in' },
  { crew: ['sakasa'] },
  // Scene 2: the card.
  { card: { title: 'サカサ、たんけんたいに\nにゅうたい！', button: 'よろしく！', icon: 'badge' } },
  // Scene 3: in the cab.
  { camera: 'cab' },
  { say: 'サカサの しごとは うしろむき がかり！', emote: 'jump' },
  { say: 'いっしょに うしろにも はしろうね！' },
  // Scene 4: from the moat's east bank, the island and the rainbow bridge; the castle's windows light up.
  // (Reach 1.2, not §12's 2: farther, the whole town behind the island came into the frame, over 200 draw calls.)
  cam([462, 9, 1992], [ISLAND.center[0] + 10, 12, ISLAND.center[1]], 1.2),
  { spawn: 'windows', model: 'castle-windows', onRail: on('shiro', CASTLE.at, CASTLE.lateral, 0) },
  { spawn: 'niji', model: 'rainbow-rail-long', onRail: on('shiro', 150) },
  { fx: 'pop', id: 'niji' },
  { say: 'ワンダーごう、しゅっぱつ！', emote: 'cheer' },
  { depart: { to: 155, seconds: 4 } },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§5, §8)
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(61);
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
/** Kept clear: the platforms' far sides, the moat and its island, the ponds, the library, the clock tower, the falls. */
const reserved = [
  ...STATIONS.map((st) => ({ ...pointOf(LINES[st.railId], st.at - 20, st.platformSide === 'left' ? -10 : 10), r: 18 })),
  { x: ISLAND.center[0], z: ISLAND.center[1], r: 110 },
  { ...pointOf(main, 1690), r: 60 },
  { ...pointOf(main, (SLOPE.from + SLOPE.to) / 2, -16), r: 45 },
  { x: -40, z: 26, r: 12 },
  // The opening's camera, behind ぎゃくまちえき.
  { x: -12, z: 20, r: 14 },
  { ...pointOf(main, 1840, -14), r: 9 },
  { ...pointOf(main, TOP.at, TOP.lateral), r: 5 },
  { ...pointOf(main, CROSSING), r: 14 },
  { ...pointOf(main, CHICK, 5), r: 10 },
];
for (const w of WATERS) reserved.push({ x: w.area.rect.center[0], z: w.area.rect.center[1], r: Math.max(...w.area.rect.size) / 2 + 6 });
function scatter(models, count, { zones, lat, footprint, minRail = 12, side = 0, y = 0 }) {
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
    addWorld(models[Math.floor(rand() * models.length)], [q.x, y, q.z], { rotationY: round(rand() * 360) });
    n++;
  }
  if (n < count) problems.push(`${models.join('/')}: placed ${n} of ${count}`);
}

// The upside-down town (§2): houses standing on their roofs, trees with their roots up, lamps lit at the bottom.
scatter(['house-upside-a', 'house-upside-b', 'house-upside-a'], 90, { zones: [['main', 0, 1900]], lat: [12, 60], footprint: 6 });
scatter(['tree-upside'], 55, { zones: [['main', 0, 1900]], lat: [9, 70], footprint: 3 });
scatter(['lamp-upside'], 22, { zones: [['main', 0, 1880]], lat: [5, 8], footprint: 0.6, minRail: 4.5 });
// The avenue of upside-down trees in the left curve (330–430), both sides.
for (let s = 335; s <= 425; s += 15) for (const side of [-1, 1]) addOnRail('tree-upside', 'main', s, { lateral: side * 9, rotationY: s * 7 });
// The moat's gardens: upside-down topiary outside the ring, beyond the promenade.
scatter(['garden-topiary-upside'], 36, { zones: [['wa', 0, 742]], lat: [9, 22], footprint: 1.2, minRail: 8, side: 1 });
scatter(['tree-upside'], 24, { zones: [['wa', 0, 742]], lat: [16, 50], footprint: 3, minRail: 14, side: 1 });

// The promenade Sakasa runs along: stone slabs 6 m inside the ring (lateral −6), drawn instanced.
for (let s = 1.5; s < wa.length - 1; s += 3) {
  // Not where `shiro` crosses it (a little boardwalk instead).
  const crossing = s > FORK_AT + 2 && s < FORK_AT + 16;
  const q = wa.point(s, -6);
  addWorld(crossing ? 'promenade-board' : 'promenade', [q.x, 0.02, q.z], { rotationY: (q.h / RAD + 360) % 360 });
}

// The castle and its island (§5.4): the castle across the line from the platform, the stairs beside it.
addWorld('castle-island', [ISLAND.center[0], 0, ISLAND.center[1]]);
addOnRail('sakasa-castle', 'shiro', CASTLE.at, { lateral: CASTLE.lateral, height: 0, rotationY: 180 });
addOnRail('upside-stairs', 'shiro', ISLAND_AT + 3, { lateral: 8, height: 0 });
addOnRail('bench', 'shiro', BENCH.at, { lateral: BENCH.lateral, height: PLATFORM_Y, rotationY: -90 });
addOnRail('rainbow-stub', 'shiro', 150);
// The town's landmarks.
addOnRail('clock-tower', 'main', 1840, { lateral: -14, rotationY: 90 });
addOnRail('chimney-upside', 'main', TOP.at, { lateral: TOP.lateral });
addOnRail('upside-arch-bridge', 'main', (BRIDGE.from + BRIDGE.to) / 2, { height: 0 });
addOnRail('cloud-a', 'main', (GAP.from + GAP.to) / 2, { height: -9 });
addOnRail('cloud-b', 'main', GAP.from - 8, { lateral: 6, height: -11 });
// The dead end: an upside-down house's wall behind a soft thicket.
{
  const end = uso.at(uso.length);
  addWorld('house-upside-b', [end.x + Math.sin(end.h) * 12, 0, end.z + Math.cos(end.h) * 12], { rotationY: end.h / RAD + 180 });
  addWorld('thicket', [end.x + Math.sin(end.h) * 4, 0, end.z + Math.cos(end.h) * 4], { rotationY: end.h / RAD });
}
// Record ③'s upside-down library at the back siding's far end, and its lectern.
addWorld('upside-library', [-40, 0, 26], { rotationY: 230 });
addOnRail('lectern', 'ura', 10, { lateral: 2.5 });
// Iron odds and ends for the magnet's play, along the town (PHASE9_0 §3: "どこでも の 小物").
for (const [s, lat, model] of [
  [600, 6, 'iron-can'],
  [1490, -6, 'iron-bucket'],
]) props.push({ model, onRail: { railId: 'main', at: s, lateral: lat }, iron: model === 'iron-can' ? 'can' : 'bucket' });

// ---------------------------------------------------------------------------------------------------------------
// Checks (§5.7, §6)
// ---------------------------------------------------------------------------------------------------------------

check(Math.abs(main.length - 1960) < 1, `main length ${main.length.toFixed(1)} (table 1,960)`);
check(Math.hypot(P.x - 298.5, P.z - 1894.1) < 3, `(the slope's climb takes 2.6 m off the table's flat sums) main's end P at [${P.x.toFixed(1)}, ${P.z.toFixed(1)}] (table [298.5, 1894.1])`);
for (const [s, x, z, name] of [
  [330, 0, 330, 'town straight end'],
  [CROSSING, 55.6, 477.5, 'the crossing'],
  [SIGN_AT, 116.2, 693.6, 'the reversed sign'],
  [1050, 221.8, 997.6, 'falls straight end'],
  [1400, 247.4, 1343.1, 'the hill end'],
  [1600, 298.5, 1534.1, 'bottom of the descent'],
]) {
  const q = main.at(s);
  check(Math.hypot(q.x - x, q.z - z) < 3, `main ${s} (${name}) at [${q.x.toFixed(1)}, ${q.z.toFixed(1)}] (table [${x}, ${z}])`);
}
{
  const { total, worst } = gameCurveCheck(main, [45, URA_AT, CHICK, CROSSING, SIGN_AT, SLOPE.from, SLOPE.to, TOP.at, SNOW.from, GAP.from, GAP.to, POND.from, KASA[0], KASA[1], 1860]);
  check(Math.abs(total - main.length) < 0.8 && worst.d < 0.3, `main as the game's curve: ${total.toFixed(2)} m, key places at most ${worst.d.toFixed(2)} m off (main ${worst.s})`);
}
check(Math.abs(wa.length - 742.6) < 0.5, `wa ${wa.length.toFixed(1)} m (742.6)`);
{
  const end = wa.at(wa.length);
  check(Math.hypot(end.x - P.x, end.z - P.z) < 0.5, `wa closes on itself (${Math.hypot(end.x - P.x, end.z - P.z).toFixed(2)} m)`);
  const { worst } = gameCurveCheck(wa, [FORK_AT, 60, 470, 690]);
  check(worst.d < 0.3, `wa as the game's curve: ${worst.d.toFixed(2)} m off`);
}
{
  const end = shiro.at(shiro.length);
  report.push(`shiro ${shiro.length.toFixed(1)} m ending at [${end.x.toFixed(1)}, ${end.z.toFixed(1)}] (table: 160, [441.5, 1954.1]; moved east, see above)`);
  check(inArea(WATERS[1].area, end.x, end.z, -1), "shiro's buffer is over the moat");
  check(Math.hypot(ISLAND.center[0] + ISLAND.radius - MOAT_CENTER[0], 0) <= 70 - 8, 'the island keeps 8 m of water to the moat\'s east edge');
  const station = STATIONS.find((x) => x.id === 'oshiro');
  check(station.at - 45 >= ISLAND_AT - ISLAND.radius - 1 && station.at <= ISLAND_AT + ISLAND.radius, `おしろえき's platform (${station.at - 45}–${station.at}) on the island (${(ISLAND_AT - ISLAND.radius).toFixed(0)}–${(ISLAND_AT + ISLAND.radius).toFixed(0)})`);
  check(DRAWBRIDGE.from <= station.at - 80, `the drawbridge's glow ends (${DRAWBRIDGE.from}) before おしろえき's braking (${station.at - 80})`);
}
{
  check(Math.abs(ura.length - 72.4) < 0.5, `ura ${ura.length.toFixed(1)} m (72.4)`);
  const back = ura.at(0);
  check(Math.hypot(back.x + 36.8, back.z - 31.2) < 1.5, `ura's buffer at [${back.x.toFixed(1)}, ${back.z.toFixed(1)}] (table [-36.8, 31.2])`);
  const mouth = ura.at(ura.length);
  check(Math.hypot(mouth.x - uraMouth.x, mouth.z - uraMouth.z) < 0.5, `ura merges on main ${URA_AT}`);
  const tail = ura.at(6.5);
  const rec = ura.point(10, 2.5, 1.2);
  check(Math.hypot(tail.x - rec.x, tail.z - rec.z) <= 25, `record ③ ${Math.hypot(tail.x - rec.x, tail.z - rec.z).toFixed(1)} m from the tail car at the buffer (25 m at most)`);
  report.push(`record ③ at [${round(rec.x)}, ${round(rec.y)}, ${round(rec.z)}] (table [−30.7, 1.2, 39.5])`);
}
check(Math.abs(uso.length - 90.2) < 0.5, `uso ${uso.length.toFixed(1)} m (90.2)`);
{
  // §5.7: apart from the fork's and the merge's own narrowing, no two stretches of rail come near each other.
  let worst = { d: Infinity };
  const lines = Object.values(LINES);
  for (const a of lines) {
    for (const b of lines) {
      for (let s = 0; s <= a.length; s += 2) {
        const p = a.at(s);
        for (let t = 0; t <= b.length; t += 2) {
          if (a === b && (Math.abs(s - t) < 300 || (a === wa && a.length - Math.abs(s - t) < 300))) continue;
          if (a !== b) {
            // Skip where they meet (forks and merges): within 40 m of a shared point.
            const q0 = b.at(t);
            const joint = [main.at(SIGN_AT), main.at(URA_AT), main.at(main.length), wa.at(FORK_AT)].some((j) => Math.hypot(p.x - j.x, p.z - j.z) < 40 || Math.hypot(q0.x - j.x, q0.z - j.z) < 40);
            if (joint) continue;
          }
          const q = b.at(t);
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d < worst.d) worst = { d, a: a.id, s, b: b.id, t };
        }
      }
    }
  }
  check(worst.d > 5, `nearest two stretches of rail apart from the joints: ${worst.d.toFixed(1)} m (${worst.a} ${worst.s} / ${worst.b} ${worst.t})`);
}
{
  // The pond: main 1640–1740 on its surface (floaters and diving); nothing else on water.
  const { surfaces, dives } = waterSpans(main, WATERS);
  report.push(`main on water: ${surfaces.map((x) => `${x.from}–${x.to}`).join(', ')}; under: ${dives.map((x) => `${x.from}–${x.to}`).join(', ') || 'none'}`);
  check(surfaces.length === 1 && Math.abs(surfaces[0].from - POND.from) <= 3 && Math.abs(surfaces[0].to - POND.to) <= 3, `the pond's stretch is main ${POND.from}–${POND.to}`);
  for (const line of [wa, shiro, ura, uso]) {
    const w = waterSpans(line, WATERS);
    check(w.surfaces.length === 0 && w.dives.length === 0, `${line.id} has no water stretch (the moat is 2 m below)`);
  }
  for (const k of KASA) check(k - 20 >= POND.from && k + 20 <= POND.to, `umbrella boat ${k} well inside the pond`);
}
check(SNOW.to + 8 <= GAP.from - 60, `the snow (to ${SNOW.to}) ends 8 m before the gap's jump window (${GAP.from - 60})`);
check(SLOPE.to + 200 <= 1860, `the slope's top is ${1860 - SLOPE.to} m before とけいだいえき (200 m at least)`);
check(DRAWBRIDGE.from >= 60, `the drawbridge is ${DRAWBRIDGE.from} m from the fork (60 at least)`);
{
  const c = castlePos;
  check(Math.hypot(c[0] - ISLAND.center[0], c[2] - ISLAND.center[1]) + 10 <= ISLAND.radius + 4, `the castle at [${c[0]}, ${c[2]}] stands on the island`);
}

{
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints ?? []) texts.push(h.text);
  }
  for (const g of GIMMICKS) for (const k of ['line', 'done']) if (g.params?.[k]) texts.push(g.params[k]);
  for (const a of ACTORS) for (const k of ['say', 'woke', 'danger', 'after']) if (a.params[k]) texts.push(a.params[k]);
  for (const r of RECORDS) texts.push(r.name, r.note, ...(r.hint ? [r.hint] : []), ...(r.endLines ?? []).map((l) => l.text));
  for (const f of FLOATERS) if (f.say) texts.push(f.say);
  for (const j of JUNCTIONS) if (j.line) texts.push(j.line);
  for (const steps of [opening, balcony, gyaku, suwaru, ending]) for (const st of steps) {
    if (st.say) texts.push(st.say);
    if (st.card) texts.push(...st.card.title.split('\n'), st.card.button);
  }
  const long = texts.map((t) => t.replace('{speed}', 'はやい')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
  report.push(`castle at [${castlePos.join(', ')}]; welcome camera ${JSON.stringify(welcomeCam)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The stage (§7)
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '6-1',
  title: 'さかさまのしろ',
  chapter: 6,
  unlock: { requires: ['5-3'], purchase: null },
  unlocks: ['reverse'],
  environment: {
    sky: { top: '#ffe3c4', bottom: '#8fb4ec' },
    fog: { color: '#e4e8f6', near: 180, far: 650 },
    lighting: 'day',
    ground: { y: 0, size: 4400, color: '#a3c98c' },
    water: WATERS,
    landmark: { model: 'sakasa-castle-far', position: [castlePos[0], 0, castlePos[2]], height: 40, near: 600 },
    bgm: 'shiro',
    ambience: 'castle',
    fall: 'cloud',
    surface: 'rail',
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    {
      id: 'main',
      points: main.points(),
      gaps: [{ from: GAP.from, to: GAP.to, hint: 'normal', rewind: { railId: 'main', at: GAP.rewind } }],
      // The falls' hill and the descent stand on rock; under the upside-down bridge is a cloud pool (no rock there).
      base: [
        { look: 'rock', toGround: true, from: 900, to: BRIDGE.from },
        { look: 'rock', toGround: true, from: BRIDGE.to, to: 1600 },
      ],
      end: { type: 'merge', railId: 'wa', at: 0 },
    },
    { id: 'uso', points: uso.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'ura', points: ura.points(), end: { type: 'merge', railId: 'main', at: URA_AT } },
    { id: 'wa', points: wa.points(), end: { type: 'merge', railId: 'wa', at: 0 } },
    { id: 'shiro', points: shiro.points(), base: [{ look: 'rock', toGround: true, from: 20, to: DRAWBRIDGE.from }], end: { type: 'buffer' } },
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
  cutscenes: { opening, balcony, gyaku, suwaru, ending },
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
