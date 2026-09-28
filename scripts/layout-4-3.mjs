#!/usr/bin/env node
/**
 * Stage 4-3 "ゆきやまのトンネル": builds src/stages/4-3.json from docs/PHASE8_CHAPTER3_4.md 第 8 部 (§3–§13; the text's
 * "3-3" is 4-3), read with the rules of §0 (§0.2: the pond is dived into from floating track, a press at a time;
 * §0.3: a snow wall blocks the tunnel's south mouth; §0.8: each catch slows the snow wave). What changed from the
 * design's tables is listed in its 実装メモ (§19).
 *
 * The rails are the design's straights and arcs (§5.1–§5.3) walked 1 m at a time, with the heights of §5.1 (straight
 * grades between the listed points). The ice hall's stretch of the main line is where the hall's dome stands high
 * enough over it; the tunnel's tube covers the rest. Pines, banks and snowmen are placed with a seeded generator, so
 * every run writes the same file. The rails are checked against three.js's centripetal Catmull-Rom (what the game's
 * Rail measures), and every line is checked to be 20 characters at most.
 *
 *   node scripts/layout-4-3.mjs         write src/stages/4-3.json and print the checks
 *   node scripts/layout-4-3.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 *
 * Conventions (scripts/layout-lib.mjs): three.js world, y up, +Z north. Heading 0 = +Z, a left turn goes towards +X;
 * `lateral` is positive to the right of the direction of travel.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, Line, mulberry32, pretty, RAD, round, walk, waterSpans } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/4-3.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

/** Straight grades between [s, y] points, level past the ends. */
const grades = (keys) => (s) => {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [s1, y1] = keys[i];
    const [s0, y0] = keys[i - 1];
    if (s <= s1) return s1 > s0 ? y0 + ((y1 - y0) * (s - s0)) / (s1 - s0) : y1;
  }
  return keys[keys.length - 1][1];
};

// ---------------------------------------------------------------------------------------------------------------
// Rails (§5.1–§5.3)
// ---------------------------------------------------------------------------------------------------------------

/** §5.1 `main`: from (0, −1000) north; 3,000 m. */
const MAIN_SEGMENTS = [
  ['S', 200],
  ['R', 150, 30],
  ['S', 221.46],
  ['R', 75, 60],
  ['S', 521.46],
  ['L', 100, 90],
  ['S', 442.92],
  ['S', 200],
  ['R', 400, 28.6],
  ['S', 300.33],
  ['L', 300, 38.2],
  ['S', 400],
];
/**
 * §5.1 heights: up +5 % out of the village, the steep snow slope ① (22 %, 380–450), +4 % along the snowmen's way, level
 * at the lake, +5.8 % to the tunnel, +1 % through it, level at the pass; M3: down −8 %, up slope ② (22 %), the slide
 * (−15 %), on down to the lodge.
 */
const MAIN_KEYS = [
  [0, 0],
  [150, 0],
  [380, 11.5],
  [450, 26.9],
  [500, 26.9],
  [880, 42.1],
  [1100, 42.1],
  [1257, 51.2],
  [1700, 55.6],
  [1900, 55.6],
  [2150, 35.6],
  [2220, 51.0],
  [2250, 51.0],
  [2400, 28.5],
  [2600, 16.9],
  [2880, 0.6],
  [3000, 0.6],
];
const MAIN_Y = grades(MAIN_KEYS);
const main = new Line('main', walk(0, -1000, 0, MAIN_SEGMENTS, MAIN_Y));
check(Math.abs(main.length - 3000) < 1, `main ${main.length.toFixed(1)} m (design 3,000)`);
// The table's places are along the ground; the game's (and this script's) s runs along the slopes, a few metres more.
for (const [s, x, z] of [[278.5, -20, -725], [500, -131, -533], [1100, -717, -496], [1257, -817, -396], [1700, -817, 47], [1900, -817, 247], [2400, -1010, 702], [3000, -976, 1290]]) {
  const p = main.at(s);
  check(Math.hypot(p.x - x, p.z - z) < 6, `main ${s} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) (design (${x}, ${z}))`);
}

/** §5.2 the false exit's loop `nise`: from main 1480 to the left round the ice hall, back onto main 1420. */
const J_NISE = 1480;
const NISE_MERGE = 1420;
const NISE_SEGMENTS = [['L', 100, 15], ['S', 21], ['L', 24, 165], ['S', 100], ['L', 28, 180]];
const nise0 = main.at(J_NISE);
const NISE_Y0 = MAIN_Y(J_NISE);
const NISE_Y1 = MAIN_Y(NISE_MERGE);
const niseLen = 100 * 15 * RAD + 21 + 24 * 165 * RAD + 100 + 28 * Math.PI;
const nise = new Line('nise', walk(nise0.x, nise0.z, nise0.h / RAD, NISE_SEGMENTS, (s) => NISE_Y0 + ((NISE_Y1 - NISE_Y0) * s) / niseLen));
{
  const end = nise.at(nise.length);
  const target = main.at(NISE_MERGE);
  const off = Math.hypot(end.x - target.x, end.z - target.z, end.y - target.y);
  check(off < 0.5, `nise ${nise.length.toFixed(1)} m, merges on main ${NISE_MERGE} ${off.toFixed(2)} m off (design 304.3)`);
}

/** §5.3 the side way `ike` to the melting pond: from main 1060 to the right; a buffer; back onto main 1120. */
const J_IKE = 1060;
const IKE_BACK = 1120;
const ike0 = main.at(J_IKE);
/** The pond (§0.2: floating track over it, dived into a press at a time). */
const POND_Y = 40;
const POND_FLOOR = 34;
const FLOAT = 0.4;
const IKE_Y = (s) => (s <= 5 ? MAIN_Y(J_IKE) : s >= 38 ? POND_Y + FLOAT : MAIN_Y(J_IKE) + ((POND_Y + FLOAT - MAIN_Y(J_IKE)) * (s - 5)) / 33);
const ike = new Line('ike', walk(ike0.x, ike0.z, ike0.h / RAD, [['R', 60, 40], ['S', 50], ['L', 60, 40], ['S', 16]], IKE_Y));
check(Math.abs(ike.length - 150) < 1, `ike ${ike.length.toFixed(1)} m (design 150)`);

const LINES = { main, nise, ike };

// The pond: a rounded rect round the side way's middle, clear of the main line.
const pondMid = ike.at(80);
const POND = {
  y: POND_Y,
  floor: POND_FLOOR,
  look: 'lake',
  area: { rect: { center: [round(pondMid.x, 1), round(pondMid.z, 1)], size: [34, 84], rotationY: round(pondMid.h / RAD, 1), corner: 17 } },
};
const WATERS = [POND];
const SPANS = Object.fromEntries(Object.entries(LINES).map(([id, l]) => [id, waterSpans(l, WATERS)]));
const fmt = (sp) => sp.map((x) => `${x.from}–${x.to}`).join(', ');
for (const [id, sp] of Object.entries(SPANS)) report.push(`${id}: surface ${fmt(sp.surfaces) || '—'}; under water ${fmt(sp.dives) || '—'}`);
check(SPANS.main.surfaces.length === 0 && SPANS.main.dives.length === 0, 'the main line never counts as on the pond');
check(SPANS.ike.surfaces.length === 1 && SPANS.ike.surfaces[0].from <= 60 && SPANS.ike.surfaces[0].to >= 110, 'the side way floats over the pond from before 60 to past 110');

// ---------------------------------------------------------------------------------------------------------------
// The mountain (§5.4): the ridge (same profile as the model snow-ridge) and the ice hall
// ---------------------------------------------------------------------------------------------------------------

const RIDGE = { x: -817, z: -174 };
/** Height of the ridge model at world (x, z) (src/view/three/snow-placeholders.ts snowRidge). */
function ridgeY(x, z) {
  const a = Math.abs(z - RIDGE.z);
  let h = 0;
  if (a <= 80) h = 200;
  else if (a <= 214) h = 200 - 112 * (1 - Math.cos(((a - 80) / 134) * (Math.PI / 2)));
  else if (a <= 242) h = 88 * (1 - (a - 214) / 28);
  const ax = Math.abs(x - RIDGE.x);
  const along = ax < 480 ? 1 : Math.max(0, Math.cos(((ax - 480) / 70) * (Math.PI / 2)));
  return ax > 550 ? 0 : h * along;
}
const TUNNEL = { from: 1257, to: 1700 };
{
  let low = Infinity;
  let at = 0;
  for (let s = TUNNEL.from + 5; s <= TUNNEL.to - 5; s++) {
    const p = main.at(s);
    const d = ridgeY(p.x, p.z) - (p.y + 8);
    if (d < low) {
      low = d;
      at = s;
    }
  }
  check(low > 2, `the ridge stays ${low.toFixed(1)} m or more over the tunnel's roof (least at main ${at})`);
}

/** The ice hall (model ice-hall, 76 × 18 × 172 m, drawn 1.25 times): its middle between main and the loop. */
const HALL_SCALE = 1.25;
const HALL = { x: -789, z: -185, y: MAIN_Y(1450) - 0.9, rx: 38 * HALL_SCALE, ry: 18 * HALL_SCALE, rz: 86 * HALL_SCALE };
const domeOver = (x, z) => {
  const k = 1 - ((x - HALL.x) / HALL.rx) ** 2 - ((z - HALL.z) / HALL.rz) ** 2;
  return k > 0 ? HALL.ry * Math.sqrt(k) : 0;
};
/** The stretch of main under the dome with 9 m or more over the rail (the tube covers the rest of the tunnel). */
let hallFrom = null;
let hallTo = null;
for (let s = TUNNEL.from; s <= TUNNEL.to; s++) {
  const p = main.at(s);
  if (domeOver(p.x, p.z) - (p.y - HALL.y) >= 9) {
    hallFrom ??= s;
    hallTo = s;
  }
}
const HALL_MAIN = { from: hallFrom + 2, to: hallTo - 2 };
check(HALL_MAIN.from < NISE_MERGE - 20 && HALL_MAIN.to > J_NISE + 20, `the ice hall over main ${HALL_MAIN.from}–${HALL_MAIN.to} holds the fork and the merge`);
{
  let least = Infinity;
  for (let s = 0; s <= nise.length; s++) {
    const p = nise.at(s);
    least = Math.min(least, domeOver(p.x, p.z) - (p.y - HALL.y));
  }
  check(least >= 7, `the dome stands ${least.toFixed(1)} m or more over the loop`);
}

// ---------------------------------------------------------------------------------------------------------------
// Stations, gimmicks, actors, records (§4, §7, §9)
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'fumoto', name: 'ふもとえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'mominoki', name: 'もみのきえき', railId: 'main', at: 980, platformSide: 'right' },
  { id: 'touge', name: 'とうげえき', railId: 'main', at: 1790, platformSide: 'left' },
  { id: 'yamagoya', name: 'やまごやえき', railId: 'main', at: 2930, platformSide: 'left' },
];

/** §0.3: the snow blocking the tunnel's south mouth (the snowplow's turn in 4-3). */
const WALL = { from: 1230, to: 1262, line: 'トンネルが ゆきで ふさがってる！' };

const CHASE = {
  railId: 'main',
  from: 1900,
  until: { railId: 'main', at: 2780 },
  fence: 2740,
  pace: 12,
  paces: [
    { from: 2010, to: 2110, speed: 17 },
    { from: 2150, to: 2220, speed: 7 },
    { from: 2250, to: 2400, speed: 16 },
    { from: 2560, to: 2700, speed: 17 },
  ],
  retry: [1880, 2000, 2235, 2420, 2600],
  music: 'hurry',
};

const GIMMICKS = [
  { type: 'plow-wall', railId: 'main', from: WALL.from, to: WALL.to, params: { line: WALL.line } },
  { type: 'slope', railId: 'main', from: 380, to: 450, params: { pull: -6 } },
  { type: 'slope', railId: 'main', from: 2150, to: 2220, params: { pull: -6, rewind: { railId: 'main', at: 2090 }, line: 'のぼりざか！ ロケット！' } },
  { type: 'slope', railId: 'main', from: 2250, to: 2400, params: { pull: 3, max: 20 } },
  { type: 'tunnel', railId: 'main', from: TUNNEL.from, to: TUNNEL.to, params: { hall: HALL_MAIN } },
  { type: 'tunnel', railId: 'nise', from: 0, to: round(nise.length - 0.5, 1), params: { hall: 'all', portal: false } },
  { type: 'sound', railId: 'main', from: TUNNEL.from, to: TUNNEL.to, params: { surface: 'tunnel' } },
  { type: 'sound', railId: 'nise', from: 0, to: round(nise.length - 0.5, 1), params: { surface: 'tunnel' } },
  { type: 'camera', railId: 'main', from: 350, to: 465, params: { mode: 'chase' } },
  { type: 'camera', railId: 'main', from: 1900, to: 1990, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 2130, to: 2232, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 2770, to: 2800, params: { mode: 'side' } },
];

const ACTORS = [
  {
    id: 'yukidaruma',
    type: 'cat',
    reactsTo: 'whistle',
    onRail: { railId: 'main', at: 250, heightFromRail: 0 },
    params: { look: 'snowman', wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2 },
  },
  {
    id: 'snow-a',
    type: 'rock-roll',
    reactsTo: 'none',
    reversed: true,
    onRail: { railId: 'main', at: 600 },
    params: { look: 'snowman-upside', lateral: 6, hitAfter: 'ころころ ゆきだるまは まってね' },
  },
  {
    id: 'snow-b',
    type: 'rock-drop',
    reactsTo: 'none',
    onRail: { railId: 'main', at: 680 },
    params: { look: 'snow-pile', rewind: 610, hitAfter: 'せんろの ゆきは ジャンプで こえてね' },
  },
  {
    id: 'snow-c',
    type: 'rock-roll',
    reactsTo: 'none',
    reversed: true,
    onRail: { railId: 'main', at: 790 },
    params: { look: 'snowman-upside', lateral: 6, rewind: 700, hitAfter: 'ころころ ゆきだるまは まってね' },
  },
  {
    id: 'snow-d',
    type: 'rock-drop',
    reactsTo: 'none',
    onRail: { railId: 'main', at: 830 },
    params: { look: 'snowman', rewind: 700, say: 'ゆきだるまが きた！ ジャンプ！', hitAfter: 'せんろの ゆきは ジャンプで こえてね' },
  },
  {
    id: 'snow-d2',
    type: 'rock-drop',
    reactsTo: 'none',
    onRail: { railId: 'main', at: 2080 },
    params: { look: 'snowman', drop: 45, warn: 75, rewind: 2000, say: 'ゆきだるまが きた！ ジャンプ！', hitAfter: 'せんろの ゆきは ジャンプで こえてね' },
  },
  {
    id: 'snow-e',
    type: 'rock-drop',
    reactsTo: 'none',
    onRail: { railId: 'main', at: 2330 },
    params: { look: 'snow-pile', drop: 55, warn: 80, rewind: 2235, say: 'とまれない！ ジャンプで こえて！', hitAfter: 'せんろの ゆきは ジャンプで こえてね' },
  },
];

const RECORDS = [
  {
    id: 'snow-hare',
    name: 'ゆきうさぎ',
    note: 'ゆきに まるまって、かくれんぼ',
    requires: null,
    model: 'snow-hare',
    hint: 'あっ、ゆきの なかに なにか いる！',
    onRail: { railId: 'main', at: 170, lateral: 9, heightFromRail: 0 },
  },
  {
    id: 'ice-flower',
    name: 'いけの こおりばな',
    note: 'いけの そこで さく、こおりの はな',
    requires: 'dive',
    model: 'ice-flower',
    onRail: { railId: 'ike', at: 85, lateral: -3, heightFromRail: round(POND_FLOOR + 0.2 - (POND_Y + FLOAT), 2) },
  },
  {
    id: 'sleigh-bell',
    name: 'ゆきに うまった すず',
    note: 'ゆきの なかで ちりん… ひっぱれたら？',
    requires: 'magnetLight',
    model: 'sleigh-bell',
    onRail: { railId: 'main', at: 1830, lateral: -10, heightFromRail: -0.4 },
  },
];

const JUNCTIONS = [
  { id: 'to-ike', railId: 'main', at: J_IKE, left: 'main', right: 'ike', default: 'left', needs: 'dive' },
  { id: 'nise-wakare', railId: 'main', at: J_NISE, left: 'nise', right: 'main', default: 'left', signReversed: true },
];

// ---------------------------------------------------------------------------------------------------------------
// Missions (§3, §13)
// ---------------------------------------------------------------------------------------------------------------

const MISSIONS = [
  {
    id: 'm1',
    type: 'deliver',
    title: 'ころがる ゆきだるま',
    steps: [{ stationId: 'mominoki' }],
    lines: {
      start: 'ゆきやまを のぼって、\nもみのきえきまで いこう！',
      moving: 'そうそう、その ちょうし！',
      recordFound: 'みつけた！ ずかんに のせよう',
      catNear: 'ゆきだるまさんが せんろに！ きてき！',
      catWoke: 'よけて くれた！ ありがとう〜',
      catDanger: 'とまって〜！',
      catDangerAfter: 'びっくりした〜。きてきで おしえてね',
      steepNear: 'きゅうな さか！ ロケットで のぼろう',
      rocketReady: 'いまだ！ ロケット！',
      rocketGo: 'ぐいーん！ いけいけ〜！',
      rockNear: 'ゆきだるまが ぐらぐら… ゆっくり！',
      rockDrop: 'ゆきが おちた！ ジャンプ！',
      rockHit: 'ぽすっ！ ゆきに ぶつかった〜',
      stationNear: 'もみのきえきだ。ゆっくり！',
      complete: 'ゆきだるまさん、なかよし！',
    },
    hints: [
      { railId: 'main', at: 460, text: 'わあ、ゆきやまが みえる！' },
      { railId: 'main', at: 640, text: 'たった！ さかさまが なおった！' },
    ],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'にせの でぐち',
    steps: [{ stationId: 'touge', parcel: 'load', say: 'やまごやまで おねがい！', reply: 'まかせて！' }],
    lines: {
      start: 'この さきは トンネル！\nやまの むこうへ ぬけよう！',
      recordFound: 'みつけた！ ずかんに のせよう',
      diveNear: 'いけだ！ もぐれ〜！',
      plowGo: 'ずぼーん！ トンネルが あいた！',
      tunnelNear: 'トンネルだ！ ライトを つけよう',
      signNear: 'あれ？ でぐちが ふたつ…？',
      signRevealed: 'ほんとうの でぐちが ひかった！',
      stationNear: 'とうげえきだ。ゆっくり！',
      complete: 'トンネル、ぬけられたね！',
    },
    hints: [
      { railId: 'main', at: 1000, text: 'みぎの いけで なにか ひかった！' },
      { railId: 'main', at: 1320, text: 'くらいね… ライトで よく みて' },
      { railId: 'nise', at: 55, text: 'あれ？ かべに えが かいてある！' },
      { railId: 'nise', at: 150, text: 'にせの でぐちだ！ ぐるっと もどるよ' },
      { railId: 'nise', at: 290, text: 'もどっちゃった！ ライトで みよう' },
      { railId: 'main', at: 1705, text: 'でられた！ まぶしい〜' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'ゆきの なみ',
    steps: [{ stationId: 'yamagoya', parcel: 'unload', chase: CHASE, say: 'ありがとう！ たいへんだったね', reply: 'もこもこに かったよ！' }],
    lines: {
      start: 'けいじばんに おねがいが きてる！\nやまごやに にもつを とどけよう！',
      chaseStart: 'ごごご… ゆきやまが もこもこ！\nゆきの なみだ！ はやい で にげよう！',
      chaseNear: 'もこもこが くる！ はやい！',
      chaseRocket: 'もこもこが きた！ ロケット！',
      chaseFar: 'はなれた！ すごい！',
      rocketReady: 'いまだ！ ロケット！',
      rocketAgain: 'おそく なってきた… もういっかい！',
      noBrake: 'すべりざか！ ひゃっほー！',
      gapNear: 'われめ！ {speed} で ジャンプ！',
      rockHit: 'ぽすっ！ ゆきに ぶつかった〜',
      chaseCaught: 'もふっ！ ゆきまみれ〜',
      chaseCaughtAfter: 'もういっかい！ はやい で にげよう',
      chaseTired: 'もこもこ、つかれてきた みたい',
      chaseSafe: 'さくだ！ セーフ！',
      stationNear: 'やまごやえきだ。ゆっくり！',
      complete: 'とどいた！ ……あれ？',
    },
    hints: [{ railId: 'main', at: 2225, text: 'のぼりは もこもこ おそいね！' }],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

/** A rail placement `lateral` m right of `line` at `at`, `h` m over the rail. */
const on = (railId, at, lateral = 0, h = 0) => ({ railId, at, lateral, heightFromRail: h });
/** A world point `lateral` m right of main at `at`, `up` m over the rail. */
const pt = (at, lateral, up) => {
  const p = main.point(at, lateral, up);
  return [round(p.x, 1), round(p.y, 1), round(p.z, 1)];
};
/** Degrees about +Y that turn a figure (+Z forward) on main at `at` to face `lateral` m to its right from `from`. */
const face = (at, from, to) => {
  const a = main.point(at, from, 0);
  const b = main.point(at, to, 0);
  return round((Math.atan2(b.x - a.x, b.z - a.z) - main.at(at).h) / RAD, 0);
};

/** The ending's little snowy hill right of the lodge's station (model snow-mountain at HILL.scale). */
const HILL = (() => {
  const c = main.point(2988, 74);
  return { x: c.x, z: c.z, scale: 0.15 };
})();
/** Height of the hill (the snow-mountain model's profile, src/view/three/ice-placeholders.ts) at world (x, z). */
function hillY(x, z) {
  const prof = [[190, 0], [150, 35], [110, 80], [70, 122], [35, 155], [8, 170], [0, 176]];
  const d = Math.hypot(x - HILL.x, z - HILL.z) / HILL.scale;
  if (d >= prof[0][0]) return 0;
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1];
    const [r1, y1] = prof[i];
    if (d >= r1) return (y0 + ((y1 - y0) * (r0 - d)) / (r0 - r1)) * HILL.scale;
  }
  return 176 * HILL.scale;
}
/** Metres over the rail at `at` of the hill's snow `lateral` m right of main there. */
const onHill = (at, lateral) => {
  const p = main.point(at, lateral, 0);
  return round(hillY(p.x, p.z) - main.at(at).y, 2);
};

/** The opening's far-off snow wave: beside main here, on the mountain's side (m over the rail where the snow is). */
const WAVE_AT = 900;
const onRidge = (at, lateral) => {
  const p = main.point(at, lateral, 0);
  return round(ridgeY(p.x, p.z) - main.at(at).y, 1);
};

const CUTSCENES = {
  opening: [
    { caption: 'ゆきやまの トンネル', seconds: 2.5 },
    { camera: 'chase' },
    { say: 'まっしろ！ ゆきやまだ！', emote: 'jump' },
    { say: 'やまの むこうに やまごやが あるよ' },
    { say: 'トンネルを ぬけて いこう！' },
    // Far up the mountain (north of the snowmen's way): a little snow wave rolling down its snowy side.
    { camera: 'fixed', at: pt(WAVE_AT, -45, 125 - main.at(WAVE_AT).y), lookAt: pt(WAVE_AT, -150, onRidge(WAVE_AT, -150) + 4), reach: 1 },
    { spawn: 'nami', model: 'snow-wave', onRail: on('main', WAVE_AT, -175, onRidge(WAVE_AT, -175)), rotationY: face(WAVE_AT, -175, 0) },
    { move: 'nami', onRail: on('main', WAVE_AT, -118, onRidge(WAVE_AT, -118)), seconds: 3.5, nowait: true },
    { say: 'あっ、ゆきが もこもこ ながれてる…', emote: 'tilt' },
    { say: 'ゆきの なみ だって。ぶつかると もふっ' },
    { remove: 'nami' },
    { camera: 'chase' },
    { say: 'でも ワンダーごうなら にげきれる！', emote: 'cheer' },
    { camera: 'cab' },
  ],
  glimpse: [
    // On the snowy ridge's top just past the station (the track itself: the train stands at the station).
    { camera: 'fixed', at: pt(1808, 3, 4.5), lookAt: pt(1840, -1, 1), reach: 1 },
    { spawn: 'sakasa', model: 'amanojaku', onRail: on('main', 1838, -1, 0), rotationY: 180 },
    { spawn: 'sm1', model: 'snowman-upside', onRail: on('main', 1843, -2.4, 0), rotationY: 200 },
    { spawn: 'sm2', model: 'snowman-upside', onRail: on('main', 1846, 1.8, 0), rotationY: 160 },
    { say: 'あれ？ ゆきだるまが さかさま…', emote: 'tilt' },
    { say: 'さようなら！', who: 'amanojaku' },
    { say: 'サカサ！ ひとりで つくってたの？' },
    { wait: 0.8 },
    { say: '…こんにちは〜！', who: 'amanojaku' },
    // Off down the ridge's side on its bottom ("すーっ").
    { move: 'sakasa', onRail: on('main', 1870, -14, -24), seconds: 2.2 },
    { remove: 'sakasa' },
    { say: 'いっちゃった…', emote: 'tilt' },
    { remove: 'sm1' },
    { remove: 'sm2' },
  ],
  ending: [
    // From beside the lodge's station, looking up the little snowy hill on the right: Sakasa at its foot, the big
    // snowman and the little wave further up.
    { camera: 'fixed', at: pt(2972, 34, 3.5), lookAt: pt(2989, 53, onHill(2989, 53) + 2.5), reach: 1 },
    { spawn: 'sakasa', model: 'amanojaku', onRail: on('main', 2985, 48, onHill(2985, 48)), rotationY: face(2985, 48, 30) },
    { spawn: 'daruma', model: 'snowman-big', onRail: on('main', 2999, 57, onHill(2999, 57)), rotationY: face(2999, 57, 30) },
    { say: 'あっ、サカサだ！', emote: 'jump' },
    { spawn: 'nami', model: 'snow-wave-small', onRail: on('main', 2985, 64, onHill(2985, 64)), rotationY: face(2985, 64, 30) },
    { say: 'ゆきの なみが、サカサの ほうに！' },
    { press: 'whistle', say: 'きてきで ゆきだるまさんを！' },
    { move: 'daruma', onRail: on('main', 2986, 54, onHill(2986, 54)), seconds: 2.4, nowait: true },
    { move: 'nami', onRail: on('main', 2985, 59.5, onHill(2985, 59.5)), seconds: 2.4 },
    { wait: 0.5 },
    { say: 'とまった！ よかった〜！', emote: 'cheer' },
    { say: '…なんで たすけるのだ', who: 'amanojaku' },
    { say: 'なかまだから！', emote: 'jump' },
    { remove: 'sakasa' },
    { spawn: 'sakasa', model: 'amanojaku-blush', onRail: on('main', 2985, 48, onHill(2985, 48)), rotationY: face(2985, 48, 30) },
    { say: 'な、なかま…', who: 'amanojaku' },
    { say: 'こ、こんにちは〜！', who: 'amanojaku' },
    // Up round the hill and out of sight.
    { move: 'sakasa', onRail: on('main', 3010, 70, onHill(3010, 70)), seconds: 1.8 },
    { remove: 'sakasa' },
    { say: 'にげちゃった。でも…', emote: 'tilt' },
    { say: 'ちょっと うれしそう だったね' },
    { say: '…よし、いこう！ つぎの せかいへ！', emote: 'cheer' },
    { remove: 'nami' },
    { card: { title: '4しょう おしまい！', button: 'つぎへ' } },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Scenery (§5.4): the ridge, the hall, the false exit, the fence, the lodge, pines, banks, snowmen
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(43);
const props = [];
const world = (model, x, y, z, rotationY = 0, scale = 1) => {
  const p = { model, position: [round(x, 1), round(y, 2), round(z, 1)] };
  if (rotationY) p.rotationY = round(rotationY, 0);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
  return p;
};
props.push({ model: 'snow-ridge', position: [RIDGE.x, 0, RIDGE.z] });
world('snow-mountain', -1560, 0, -330, 20, 2.1);
world('snow-mountain', -1500, 0, 700, 60, 1.4);
world('ice-hall', HALL.x, HALL.y, HALL.z, 0, HALL_SCALE);
// The painted false exit: 14 m on from the loop's straight, facing back at the train (§5.2).
{
  const a = nise.at(21 + 100 * 15 * RAD);
  const x = a.x + Math.sin(a.h) * 14;
  const z = a.z + Math.cos(a.h) * 14;
  const p = world('fake-exit', x, nise.at(40).y - 0.4, z, a.h / RAD + 180);
  p.reveal = 'nise-wakare';
}
// Ice pillars along the loop's straight going south (right of it).
{
  const straightFrom = 100 * 15 * RAD + 21 + 24 * 165 * RAD;
  for (const k of [0.15, 0.4, 0.65, 0.9]) {
    const p = nise.point(straightFrom + k * 100, 8, 0);
    world('ice-pillar', p.x, HALL.y, p.z, rand() * 360);
  }
}
props.push({ model: 'snow-fence', onRail: { railId: 'main', at: CHASE.fence, lateral: 0, heightFromRail: -0.4 } });
props.push({ model: 'snow-mountain', position: [round(HILL.x, 1), 0, round(HILL.z, 1)], rotationY: 15, scale: HILL.scale });
props.push({ model: 'lodge', onRail: { railId: 'main', at: 2915, lateral: -18, heightFromRail: -0.6 }, rotationY: 90 });
// The knoll the pond sits on (the lower slopes of the mountain), and snow heaped round the pond's rim.
{
  const c = POND.area.rect.center;
  world('snow-knoll', c[0], 0, c[1], POND.area.rect.rotationY);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const h = POND.area.rect.rotationY * RAD;
    const lx = Math.cos(a) * 26;
    const lz = Math.sin(a) * 50;
    const x = c[0] + lx * Math.cos(h) + lz * Math.sin(h);
    const z = c[1] - lx * Math.sin(h) + lz * Math.cos(h);
    const nearTrack = Object.values(LINES).some((l) => {
      for (let s = 0; s <= l.length; s += 4) {
        const q = l.at(s);
        if (Math.hypot(q.x - x, q.z - z) < 9) return true;
      }
      return false;
    });
    if (!nearTrack) world('snow-bank', x, POND_Y, z, rand() * 360, 1.2);
  }
}
// The knoll stays under the rails near it (its top 40.2 m, down to the ground 52 m out from the pond's middle line).
{
  const r = POND.area.rect;
  const h = r.rotationY * RAD;
  const rings = [[17, 40.2], [27, 40.2], [36, 31], [45, 13], [52, 0]];
  const knollY = (x, z) => {
    const dx = x - r.center[0];
    const dz = z - r.center[1];
    const across = dx * Math.cos(h) - dz * Math.sin(h);
    const along = dx * Math.sin(h) + dz * Math.cos(h);
    const d = Math.hypot(across, Math.max(0, Math.abs(along) - 25));
    if (d < 17 || d >= 52) return d < 17 ? null : 0;
    for (let i = 1; i < rings.length; i++) {
      if (d <= rings[i][0]) return rings[i - 1][1] + ((rings[i][1] - rings[i - 1][1]) * (d - rings[i - 1][0])) / (rings[i][0] - rings[i - 1][0]);
    }
    return 0;
  };
  let worst = { d: Infinity, where: '' };
  for (const line of Object.values(LINES)) {
    for (let s = 0; s <= line.length; s += 2) {
      const q = line.at(s);
      const k = knollY(q.x, q.z);
      if (k === null || k === 0) continue;
      // The side way lies on the snowy rim past the pond (0.2 m under its rails); the others pass over.
      const d = q.y - k + (line === ike ? 0.6 : 0);
      if (d < worst.d) worst = { d, where: `${line.id} ${s}` };
    }
  }
  check(worst.d >= 0.75, `the pond's knoll stays under the rails (least ${worst.d.toFixed(1)} m, ${worst.where})`);
}
// Snow cushions hiding the buffer stops at the ends of the side way and the main line.
for (const line of [ike, main]) {
  const p = line.point(line.length + 0.5);
  world('snow-bank', p.x, line.at(line.length).y - 0.6, p.z, p.h / RAD, 0.9);
}

/** Height of the snow `lateral` m beside main at `at`: the ridge under the track (a toGround base), else the ground. */
const flankY = (at, lateral) => {
  const railY = main.at(at).y;
  const a = Math.abs(lateral);
  if (a <= 2.2) return railY;
  return Math.max(0, railY - (a - 2.2) * 2 - 0.6);
};

/** Every rail point, 4 m apart, for keeping scenery off the track. */
const TRACK = Object.values(LINES).flatMap((line) => {
  const out = [];
  for (let s = 0; s <= line.length; s += 4) out.push(line.at(s));
  return out;
});
const clearOfTrack = (x, z, d) => TRACK.every((p) => Math.hypot(p.x - x, p.z - z) >= d);
const STATION_SPOTS = STATIONS.map((st) => main.at(st.at));
const clearOfStations = (x, z, d) => STATION_SPOTS.every((p) => Math.hypot(p.x - x, p.z - z) >= d);
const inPond = (x, z) => {
  const r = POND.area.rect;
  const h = r.rotationY * RAD;
  const dx = x - r.center[0];
  const dz = z - r.center[1];
  const across = dx * Math.cos(h) - dz * Math.sin(h);
  const along = dx * Math.sin(h) + dz * Math.cos(h);
  return Math.abs(across) < r.size[0] / 2 + 14 && Math.abs(along) < r.size[1] / 2 + 14;
};
const placed = [];
const clearOfPlaced = (x, z, d) => placed.every((p) => Math.hypot(p.x - x, p.z - z) >= d + p.r);

// The pines on the rock-drop places: a big one 5 m left of the rail at B, D' and E (the snow falls from its boughs).
for (const at of [680, 2330]) {
  const p = main.point(at, -6);
  world('snow-pine', p.x, 0, p.z, rand() * 360, (p.y + 12) / 9);
  placed.push({ x: p.x, z: p.z, r: 3 });
}
// Snow heaps down the ridge's side along the snowmen's way (left).
for (let i = 0; i < 12; i++) {
  const at = 590 + i * 24;
  const lateral = -9 - rand() * 5;
  const p = main.point(at, lateral);
  world('snow-bank', p.x, flankY(at, lateral) - 0.6, p.z, p.h / RAD + 90, 0.9 + rand() * 0.5);
  placed.push({ x: p.x, z: p.z, r: 4 });
}
// Sakasa's upside-down snowmen: five by the snowmen's way, four on the pass's shelf (by the station, left).
let upside = 0;
for (let i = 0; i < 5; i++) {
  const at = 620 + i * 45;
  const lateral = -8 - rand() * 4;
  const p = main.point(at, lateral);
  world('snowman-upside', p.x, flankY(at, lateral) - 0.2, p.z, rand() * 360);
  upside += 1;
}
for (let i = 0; i < 4; i++) {
  const at = 1812 + i * 9;
  const lateral = -6 - (i % 2) * 3;
  const p = main.point(at, lateral);
  world('snowman-upside', p.x, flankY(at, lateral) - 0.2, p.z, rand() * 360);
  upside += 1;
}
// Pines: near the line (10–150 m) where it is seen, on the ground or up the ridge's slopes.
let pines = 0;
for (let i = 0; i < 12000 && pines < 190; i++) {
  const x = -1150 + rand() * 1200;
  const z = -1050 + rand() * 2400;
  let d = Infinity;
  for (const p of TRACK) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
  if (d < 12 || d > 150) continue;
  const y = ridgeY(x, z);
  if (y > 140) continue;
  if (inPond(x, z) || hillY(x, z) > 0 || !clearOfStations(x, z, 30) || !clearOfPlaced(x, z, 5)) continue;
  world('snow-pine', x, y, z, rand() * 360, 0.8 + rand() * 0.6);
  placed.push({ x, z, r: 3 });
  pines += 1;
}
// Snow banks on the open snow.
let banks = 0;
for (let i = 0; i < 3000 && banks < 30; i++) {
  const at = rand() * main.length;
  if (at > TUNNEL.from - 40 && at < TUNNEL.to + 40) continue;
  const lateral = (rand() < 0.5 ? -1 : 1) * (14 + rand() * 40);
  const p = main.point(at, lateral);
  if (ridgeY(p.x, p.z) > 1 || hillY(p.x, p.z) > 0 || !clearOfTrack(p.x, p.z, 12) || !clearOfStations(p.x, p.z, 24) || !clearOfPlaced(p.x, p.z, 3) || inPond(p.x, p.z)) continue;
  world('snow-bank', p.x, 0, p.z, rand() * 360, 0.8 + rand() * 0.8);
  placed.push({ x: p.x, z: p.z, r: 3 });
  banks += 1;
}
report.push(`scenery: ${pines} pines, ${banks} banks, ${upside} upside-down snowmen`);

// ---------------------------------------------------------------------------------------------------------------
// Checks against the game's curve
// ---------------------------------------------------------------------------------------------------------------

{
  const { total, worst } = gameCurveCheck(main, [45, 250, 600, 980, 1060, 1230, 1257, 1420, 1480, 1700, 1790, 1900, 2150, 2480, 2740, 2930]);
  check(Math.abs(total - main.length) < 1 && worst.d < 0.4, `main as the game's curve: ${total.toFixed(2)} m, key places at most ${worst.d.toFixed(2)} m off (main ${worst.s})`);
}
for (const line of [nise, ike]) {
  const { total } = gameCurveCheck(line, [0]);
  check(Math.abs(total - line.length) < 1, `${line.id} as the game's curve: ${total.toFixed(2)} m (script ${line.length.toFixed(1)})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '4-3',
  title: 'ゆきやまのトンネル',
  chapter: 4,
  unlock: { requires: ['4-2'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#9cc6ea', bottom: '#f3f7fb' },
    fog: { color: '#e6eef6', near: 180, far: 560 },
    lighting: 'day',
    ground: { y: 0, size: 3600, color: '#eef3f8' },
    bgm: 'yuki',
    ambience: 'snow',
    fall: 'snow',
    surface: 'snow',
    snow: { count: 900, radius: 60, fall: 1.2 },
    water: WATERS,
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    {
      id: 'main',
      points: main.points(),
      base: { look: 'snow', toGround: true, skip: [{ from: 1250, to: 1706 }] },
      gaps: [{ from: 2480, to: 2496, hint: 'normal', pit: false, rewind: { railId: 'main', at: 2420 } }],
      end: { type: 'buffer' },
    },
    { id: 'nise', points: nise.points(), end: { type: 'merge', railId: 'main', at: NISE_MERGE } },
    {
      id: 'ike',
      points: ike.points(),
      base: [{ look: 'snow', toGround: true, from: 0, to: 34 }],
      spur: { back: { railId: 'main', at: IKE_BACK } },
      end: { type: 'buffer' },
    },
  ],
  junctions: JUNCTIONS,
  stations: STATIONS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: CUTSCENES,
};

{
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) texts.push(...[st.say, st.reply].filter(Boolean));
  }
  for (const a of ACTORS) for (const k of ['say', 'hitAfter']) if (a.params?.[k]) texts.push(a.params[k]);
  for (const r of RECORDS) texts.push(...[r.hint, r.note].filter(Boolean));
  for (const g of GIMMICKS) if (g.params?.line) texts.push(g.params.line);
  for (const steps of Object.values(CUTSCENES)) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.map((t) => t.replace('{speed}', 'ふつう')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
  report.push(`ice hall over main ${HALL_MAIN.from}–${HALL_MAIN.to}; pond ${JSON.stringify(POND.area.rect)}`);
}

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
