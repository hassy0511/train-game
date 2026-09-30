#!/usr/bin/env node
/**
 * Stage 4-2 "おおゆきの むら": builds src/stages/4-2.json from docs/PHASE8_CHAPTER3_4.md 第 6 部 第 B 部.
 *
 * The rails are the design's straights and arcs (§5.1–§5.2, the design script layout42.py): a point every 10 m on
 * straights and every 3° on arcs (every 5 m on the side way), with the heights of §5.1 (the ski hill, the valley,
 * the buried uphill, the way down to the plaza). The plaza's ice stretch is worked out from the pond's outline (not
 * written by hand). Houses, snow houses, pines and banks are placed with a seeded pseudo-random generator, so every
 * run writes the same file. The rails' lengths are checked against three.js's centripetal Catmull-Rom (what the
 * game's Rail measures), and every line is checked to be 20 characters at most.
 *
 *   node scripts/layout-4-2.mjs         write src/stages/4-2.json and print the checks
 *   node scripts/layout-4-2.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 *
 * Conventions: three.js world, y up, +Z north. Headings φ are from +X turning right (φ 90 = +Z, north); `lateral` is
 * positive to the right of the direction of travel, (−sin φ, cos φ).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatmullRomCurve3, Vector3 } from 'three';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/4-2.json');
const DRY = process.argv.includes('--dry');
const RAD = Math.PI / 180;
const Y = 0.5;

const round = (v, digits = 1) => {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

// ---------------------------------------------------------------------------------------------------------------
// Rails (§5)
// ---------------------------------------------------------------------------------------------------------------

/** Straights ['S', length] and arcs ['R' | 'L', radius, degrees] from (x, z) heading φ. Returns points with s. */
function build(start, phiDeg, segs, step = 10, arcStepDeg = 3) {
  let [x, z] = start;
  let phi = phiDeg * RAD;
  const pts = [{ s: 0, x, z, phi }];
  const marks = [];
  let s = 0;
  for (const seg of segs) {
    if (seg[0] === 'S') {
      const n = Math.max(1, Math.round(seg[1] / step));
      const d = seg[1] / n;
      for (let i = 1; i <= n; i++) {
        x += d * Math.cos(phi);
        z += d * Math.sin(phi);
        s += d;
        pts.push({ s, x, z, phi });
      }
    } else {
      const [, R, deg] = seg;
      const sgn = seg[0] === 'R' ? 1 : -1;
      const n = Math.max(1, Math.round(deg / arcStepDeg));
      const dth = (deg * RAD) / n;
      const cx = x + sgn * R * -Math.sin(phi);
      const cz = z + sgn * R * Math.cos(phi);
      for (let i = 1; i <= n; i++) {
        phi += sgn * dth;
        x = cx - sgn * R * -Math.sin(phi);
        z = cz - sgn * R * Math.cos(phi);
        s += R * dth;
        pts.push({ s, x, z, phi });
      }
    }
    marks.push({ seg, s: round(s, 1), x: round(x), z: round(z), phi: round(phi / RAD) });
  }
  return { pts, marks };
}

/** A height profile: [s, y] points, straight between them. */
const profile = (knots) => (s) => {
  if (s <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [s1, y1] = knots[i];
    const [s0, y0] = knots[i - 1];
    if (s <= s1) return y0 + ((y1 - y0) * (s - s0)) / (s1 - s0 || 1);
  }
  return knots[knots.length - 1][1];
};

/** A line: points with s, looked up by s (linear between points: the design's own geometry), with heights. */
class Line {
  constructor(id, pts, height) {
    this.id = id;
    this.pts = pts;
    this.height = height;
    this.length = pts[pts.length - 1].s;
  }
  at(s) {
    const p = this.pts;
    if (s <= 0) return { ...p[0], y: this.height(0) };
    for (let i = 1; i < p.length; i++) {
      if (s <= p[i].s) {
        const a = p[i - 1];
        const b = p[i];
        const t = (s - a.s) / (b.s - a.s || 1);
        return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, phi: a.phi + (b.phi - a.phi) * t, y: this.height(s) };
      }
    }
    return { ...p[p.length - 1], y: this.height(this.length) };
  }
  /** World (x, z) `lateral` m right of the line at s, and the rail's height there. */
  point(s, lateral = 0) {
    const a = this.at(s);
    return { x: a.x - Math.sin(a.phi) * lateral, z: a.z + Math.cos(a.phi) * lateral, y: a.y, phi: a.phi };
  }
  json() {
    return this.pts.map((p) => [round(p.x, 2), round(this.height(p.s), 2), round(p.z, 2)]);
  }
}

const MAIN_SEGS = [
  ['S', 300], ['R', 150, 60], ['S', 300], ['L', 150, 60], ['S', 330], ['R', 200, 45],
  ['S', 300], ['L', 150, 90], ['S', 430], ['R', 150, 90], ['S', 450],
];
// Straights every 10 m, arcs every 3° (R150: 7.9 m, R200: 10.5 m).
const mainBuilt = build([0, 0], 90, MAIN_SEGS);
/** §5.1 heights: the ski hill (+6 %, 1260–1560), down to the village (−6.9 %, 1720–1980), the buried uphill (22 %, 2280–2350), down to the plaza (−6 %, 2620–2870). */
const MAIN_Y = profile([
  [0, 0.5], [1260, 0.5], [1560, 18.5], [1720, 18.5], [1980, 0.5], [2280, 0.5], [2350, 15.9], [2620, 15.9], [2870, 0.9], [3100, 0.9],
]);
const main = new Line('main', mainBuilt.pts, MAIN_Y);
check(Math.abs(main.length - 3052.5) < 0.3, `main ${main.length.toFixed(1)} m (design 3052.5)`);

const J_MIHARASHI = 1300;
const jStart = main.at(J_MIHARASHI);
const MIHARASHI_Y0 = MAIN_Y(J_MIHARASHI);
const miharashiBuilt = build([jStart.x, jStart.z], jStart.phi / RAD, [['L', 100, 30], ['S', 110]], 5);
const miharashi = new Line('miharashi', miharashiBuilt.pts, profile([[0, MIHARASHI_Y0], [60, MIHARASHI_Y0], [160, MIHARASHI_Y0 + 3], [170, MIHARASHI_Y0 + 3.3]]));
check(Math.abs(miharashi.length - 162.4) < 0.3, `miharashi ${miharashi.length.toFixed(1)} m (design 162.4)`);
const LINES = { main, miharashi };

// The design's key points (§5.4).
const near = (a, b, tol = 1) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
for (const [s, x, z] of [[500, -112.2, 451.4], [920, -409.8, 715.8], [1300, -417.6, 1095.1], [2080, -579.4, 1706.6], [3000, -657.9, 2403.1]]) {
  const p = main.at(s);
  check(near([p.x, p.z], [x, z]), `main ${s} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) (design (${x}, ${z}))`);
}
{
  const end = miharashi.at(miharashi.length);
  check(near([end.x, end.z], [-392.0, 1253.6]), `miharashi end (${end.x.toFixed(1)}, ${end.z.toFixed(1)}) (design (−392.0, 1253.6))`);
  let closest = Infinity;
  for (let s = 40; s <= miharashi.length; s += 2) {
    const p = miharashi.at(s);
    for (let m = 0; m <= main.length; m += 4) {
      if (Math.abs(m - J_MIHARASHI) < 250) continue;
      const q = main.at(m);
      closest = Math.min(closest, Math.hypot(p.x - q.x, p.z - q.z));
    }
  }
  check(closest > 100, `miharashi keeps ${closest.toFixed(0)} m off the main line (away from the junction)`);
}
{
  let closest = Infinity;
  let where = '';
  for (let a = 0; a <= main.length; a += 4) {
    for (let b = a + 300; b <= main.length; b += 4) {
      const p = main.at(a);
      const q = main.at(b);
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < closest) {
        closest = d;
        where = `${a} and ${b}`;
      }
    }
  }
  check(closest > 200, `main keeps ${closest.toFixed(1)} m from itself at ${where} (design 259.5 at 1668 and 1971)`);
}

// ---------------------------------------------------------------------------------------------------------------
// The plaza's frozen pond (§5.5): the ice stretch is where the outline holds the track
// ---------------------------------------------------------------------------------------------------------------

const POND = [[-540, 2290], [-600, 2260], [-720, 2380], [-740, 2470], [-660, 2480], [-560, 2380]];
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
let iceFrom = null;
for (let s = 2600; s <= Math.floor(main.length); s++) {
  const p = main.at(s);
  if (inside(POND, p.x, p.z)) {
    iceFrom = s;
    break;
  }
}
// The pond's rim reaches under the end of the way down (the rail still on its snowy ridge there): the ice starts at
// the foot of the slope.
const ICE = [Math.max(iceFrom ?? Infinity, 2880), Math.floor(main.length * 10) / 10];
check(iceFrom !== null && iceFrom <= 2880, `plaza ice ${ICE[0]}–${ICE[1]} (design 2880–3052.5; the pond starts under the track at ${iceFrom})`);
for (let s = ICE[0]; s <= ICE[1]; s += 5) {
  const p = main.at(s);
  if (!inside(POND, p.x, p.z)) {
    check(false, `main ${s} is off the pond inside the ice stretch`);
    break;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Stations, walls, gimmicks, records (§4, §5.3, §7, §9)
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'yukinohara', name: 'ゆきのはらえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'kamakura', name: 'かまくらえき', railId: 'main', at: 1010, platformSide: 'left' },
  { id: 'skijo', name: 'スキーじょうえき', railId: 'main', at: 2080, platformSide: 'right' },
  { id: 'hiroba', name: 'ひろばえき', railId: 'main', at: 3000, platformSide: 'left', stop: { maxSpeed: 9 } },
];
check(STATIONS[3].at > ICE[0], 'ひろばえき stops on the ice');

const WALLS = [
  { railId: 'main', from: 260 },
  { railId: 'main', from: 500, to: 660, line: 'ながい ゆきの みち！ ゆきかき！' },
  { railId: 'main', from: 920, to: 1080, line: 'えきが ゆきに うもれてる！' },
  { railId: 'miharashi', from: 60, to: 150 },
  { railId: 'main', from: 1850, to: 1890, line: 'かべが ふたつ！ ゆきかき！' },
  { railId: 'main', from: 1940, to: 1980 },
  { railId: 'main', from: 2200, to: 2350, line: 'かべの むこうは さかだよ！' },
];
const wallGimmick = (w) => ({
  type: 'plow-wall',
  railId: w.railId,
  from: w.from,
  ...(w.to !== undefined ? { to: w.to } : {}),
  ...(w.line ? { params: { line: w.line } } : {}),
});

const SHED = { from: 2420, to: 2580 };
const GIMMICKS = [
  ...WALLS.map(wallGimmick),
  { type: 'slope', railId: 'main', from: 2280, to: 2350, params: { pull: -6, rewind: { railId: 'main', at: 2140 } } },
  { type: 'jump-pad', railId: 'main', from: 1640, params: { seconds: 10, range: 60, look: 'ski' } },
  { type: 'fog', railId: 'main', from: SHED.from, to: SHED.to, params: { near: 2, far: 20, lightFar: 70 } },
  { type: 'ice-sheet', params: { outline: POND, y: 0.05, color: '#cfeaf6' } },
  { type: 'ice', railId: 'main', from: ICE[0], to: ICE[1] },
  { type: 'camera', railId: 'main', from: 200, to: 300, params: { mode: 'chase' } },
  { type: 'camera', railId: 'main', from: 1610, to: 1720, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 2190, to: 2360, params: { mode: 'side' } },
  { type: 'flock', params: { model: 'snowbird', count: 8, center: [-450, 30, 1300], radius: 150, speed: 0.05 } },
];

const RECORDS = [
  {
    id: 'frozen-fall',
    name: 'こおった たき',
    note: 'ながれた まま こおっちゃった たき',
    requires: null,
    model: 'frozen-fall',
    hint: 'みぎの たき… こおってる！',
    onRail: { railId: 'main', at: 760, lateral: 12, heightFromRail: 1 },
  },
  {
    id: 'spiral-mitten',
    name: 'ぐるぐる もようの てぶくろ',
    note: 'だれかの かたっぽ。さむく ないかな',
    requires: 'plow',
    model: 'spiral-mitten',
    onRail: { railId: 'miharashi', at: 120, lateral: -3, heightFromRail: 0.2 },
  },
  {
    id: 'tin-shovel',
    name: 'ブリキの ちいさな スコップ',
    note: 'たかい ところ… ひきよせられたら？',
    requires: 'magnetLight',
    model: 'tin-shovel',
    onRail: { railId: 'main', at: 1600, lateral: 14, heightFromRail: 11 },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Missions, cutscenes (§3, §12, §13)
// ---------------------------------------------------------------------------------------------------------------

const MISSIONS = [
  {
    id: 'm1',
    type: 'pickup',
    title: 'ゆきかき しゅっぱつ',
    steps: [{ stationId: 'kamakura', board: 2, say: 'まつりの じゅんびに いくの', reply: 'いっしょに いこう！' }],
    lines: {
      start: 'かまくらえきの ひとを むかえに いこう\nゆきの かべは ゆきかきで！',
      moving: 'そうそう、その ちょうし！',
      plowNear: 'ゆきの かべ！ ゆきかきを おして！',
      plowGo: 'ずぼーん！ きらきら〜',
      plowLong: 'ざざざ〜！ ずっと ゆきかき！',
      recordFound: 'みつけた！ ずかんに のせよう',
      complete: 'ゆきかき、じょうず！',
    },
    hints: [{ railId: 'main', at: 960, text: 'ホームの ゆきも とんでった！' }],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'ゆきかきと ジャンプ',
    steps: [{ stationId: 'skijo', alight: 2, parcel: 'load', say: 'ちょうちんを ひろばへ おねがい！', reply: 'まかせて！' }],
    lines: {
      start: 'なかまを スキーじょうえきへ！\nゆきかきと ジャンプ、どっちも！',
      gapNear: 'つぎの きれめは {speed} で とべる！',
      padGone: 'ジャンプだいを きてきで だそう！',
      padAppear: 'ジャンプだいが でた！',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'スキーじょうえきだ。ゆっくり！',
      complete: 'ジャンプも ゆきかきも できた！',
    },
    hints: [
      { railId: 'main', at: 1130, text: 'こんどは ジャンプ！' },
      { railId: 'main', at: 1230, text: 'ひだりの おかに ゆきが どっさり…' },
      { railId: 'main', at: 1450, text: 'スキーの おかだ！ のぼるよ' },
      { railId: 'main', at: 1540, text: 'たかい ところで なにか きらっ' },
      { railId: 'main', at: 1720, text: 'ひゃっほー！ とんだ〜！' },
      { railId: 'main', at: 1905, text: 'おろした まま で いいんだね！' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'かまくら まつり',
    steps: [{ stationId: 'hiroba', parcel: 'unload', say: 'ありがとう！ まつりが できる！', reply: 'よかった〜！' }],
    lines: {
      start: 'ちょうちんを ひろばへ はこぼう！\nさかは ゆきの した だって！',
      steepNear: 'のぼりざか！ ロケットの じゅんび！',
      rocketReady: 'いまだ！ ロケット！',
      rocketGo: 'ぐいーん！ ゆきも とぶ〜！',
      iceNear: 'こおりの ひろば！ はやめに ブレーキ！',
      iceStop: 'いまだ！ レバーを とまるに！',
      complete: 'とどいた！ ……あれ？',
    },
    hints: [
      { railId: 'main', at: 2360, text: 'ゆきよけの トンネル！ ライト！' },
      { railId: 'main', at: 2590, text: 'でられた！ ひろばが みえる！' },
    ],
  },
];

/** A rail placement, `lateral` m right of `line` at `at`, `h` m over the rail. */
const on = (railId, at, lateral = 0, h = 0) => ({ railId, at, lateral, heightFromRail: h });
/** The ground under a place beside the main line, as a height over the rail there. */
const toGround = (at, line = main) => round(-line.at(at).y, 2);

const CUTSCENES = {
  opening: [
    { caption: 'おおゆきの むら', seconds: 2.5 },
    { camera: 'chase' },
    { spawn: 'murabito', model: 'passenger', onRail: on('main', 70, -9, toGround(70)), rotationY: -90 },
    { say: 'わあ… ひとばんで ゆきが どっさり！', emote: 'jump' },
    { say: 'せんろが ゆきに うもれちゃった' },
    { say: 'ゆきよけの さくが みんな さかさまで…', who: 'passenger', name: 'むらの ひと' },
    { say: 'さかさま…？ サカサかな', emote: 'tilt' },
    { camera: 'side' },
    { say: 'よし、これを つけよう！', emote: 'cheer' },
    { unlock: 'plow' },
    { say: 'ゆきかき！ ゆきの かべも へっちゃら！' },
    { camera: 'cab' },
    { say: 'むらさきの ボタンが ゆきかき！' },
    { say: 'ひかったら ぽちっと おしてね' },
    { say: 'むらの まつりの おてつだいに いこう！' },
    { remove: 'murabito' },
  ],
  glimpse: [
    { camera: 'chase' },
    { spawn: 'sakasa', model: 'amanojaku', onRail: on('main', 2106, -8, -0.5), rotationY: 90 },
    { spawn: 'kamakura-s', model: 'amanojaku-kamakura', onRail: on('main', 2106, -10.5, -0.5), rotationY: 90 },
    { say: 'あれ？ おかの うえに だれか…', emote: 'tilt' },
    { say: 'さようなら！', who: 'amanojaku' },
    { say: 'サカサ！ かまくら つくってたの？' },
    { move: 'sakasa', onRail: on('main', 2106, -9.6, -0.5), seconds: 0.8 },
    { wait: 0.6 },
    { say: '…ちいさすぎて はいれない みたい' },
    { remove: 'kamakura-s' },
    { say: '…こんにちは〜！', who: 'amanojaku' },
    { move: 'sakasa', onRail: on('main', 2160, -45, -0.5), seconds: 2 },
    { remove: 'sakasa' },
    { say: 'ひとりで つくってたんだね', emote: 'tilt' },
  ],
  ending: [
    { camera: 'fixed', at: [-640, 5, 2408], lookAt: [-690, 2, 2400] },
    { sky: 'evening', seconds: 3 },
    { wait: 1.5 },
    { spawn: 'murako', model: 'passenger', onRail: on('main', 3010, 14, 0), rotationY: 90 },
    { say: 'ちょうちん、ついた！ きれい〜', emote: 'jump' },
    { say: 'みんなで かまくら まつり！', who: 'passenger', name: 'むらの こ' },
    { spawn: 'sakasa', model: 'amanojaku', onRail: on('main', 3030, 16, 0), rotationY: -90 },
    { say: 'あっ… サカサ！', emote: 'tilt' },
    { say: 'さ、さようなら！', who: 'amanojaku' },
    { say: 'いっしょに はいる？ あったかいよ', who: 'passenger', name: 'むらの こ' },
    { spawn: 'chochin', model: 'lantern', onRail: on('main', 3016, 15, 0.2), rotationY: 0 },
    { wait: 1.2 },
    { move: 'sakasa', onRail: on('main', 3022, 16, 0), seconds: 0.6 },
    { remove: 'chochin' },
    { spawn: 'chochin-s', model: 'lantern', onRail: on('main', 3023, 16.6, 0.1), rotationY: 0 },
    { say: '……こんにちは〜！', who: 'amanojaku' },
    { move: 'sakasa', onRail: on('main', 3052, 90, 12), seconds: 2.5, nowait: true },
    { move: 'chochin-s', onRail: on('main', 3053, 90.6, 12.1), seconds: 2.5 },
    { remove: 'sakasa' },
    { remove: 'chochin-s' },
    { say: 'にげちゃった… でも', emote: 'tilt' },
    { say: 'ちょうちん、もって いったね' },
    { camera: 'fixed', at: [-660, 12, 2420], lookAt: [-820, 60, 2700] },
    { say: 'あれ？ やまの ゆきが もこもこ…' },
    { say: 'サカサ、やまに いったよね…', emote: 'tilt' },
    { say: '…よし、いこう！ ゆきやまへ！', emote: 'cheer' },
    { remove: 'murako' },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Scenery (§5.5): the villages, the ski hill, the snow shed, pines and banks
// ---------------------------------------------------------------------------------------------------------------

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const props = [];
const world = (model, x, z, y = 0, rotationY = 0, scale = 1) => {
  const p = { model, position: [round(x, 1), round(y, 2), round(z, 1)] };
  if (rotationY) p.rotationY = round(rotationY, 0);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
  return p;
};
/** Every rail point, 4 m apart, for keeping scenery off the track. */
const TRACK = Object.values(LINES).flatMap((line) => {
  const out = [];
  for (let s = 0; s <= line.length; s += 4) out.push(line.point(s));
  return out;
});
const clearOfTrack = (x, z, d) => TRACK.every((p) => Math.hypot(p.x - x, p.z - z) >= d);
const STATION_SPOTS = STATIONS.map((st) => main.point(st.at));
const clearOfStations = (x, z, d) => STATION_SPOTS.every((p) => Math.hypot(p.x - x, p.z - z) >= d);
const placed = [];
const clearOfPlaced = (x, z, d) => placed.every((p) => Math.hypot(p.x - x, p.z - z) >= d + p.r);
/** A heading facing the line (a house's front, +Z of the model, towards the track). */
const facing = (line, at, lateral) => {
  const p = line.point(at, lateral);
  const q = line.point(at, 0);
  return (Math.atan2(q.x - p.x, q.z - p.z) / RAD + 360) % 360;
};

// The villages: houses and snow houses along the line, on both sides (never on the track, the platforms or the pond).
const VILLAGES = [
  { from: 0, to: 160, houses: 8, kamakura: 3 },
  { from: 880, to: 1090, houses: 8, kamakura: 5 },
  { from: 2860, to: 3052, houses: 8, kamakura: 6 },
];
let houses = 0;
let snowHouses = 0;
for (const v of VILLAGES) {
  let made = 0;
  for (let i = 0; i < 400 && made < v.houses; i++) {
    const at = v.from + rand() * (v.to - v.from);
    const lateral = (rand() < 0.5 ? -1 : 1) * (22 + rand() * 26);
    const p = main.point(at, lateral);
    if (!clearOfTrack(p.x, p.z, 17) || !clearOfStations(p.x, p.z, 26) || !clearOfPlaced(p.x, p.z, 6) || inside(POND, p.x, p.z)) continue;
    world(made % 2 ? 'snow-house-b' : 'snow-house', p.x, p.z, 0, facing(main, at, lateral) + (rand() - 0.5) * 30);
    placed.push({ x: p.x, z: p.z, r: 7 });
    made += 1;
    houses += 1;
  }
  made = 0;
  for (let i = 0; i < 400 && made < v.kamakura; i++) {
    const at = v.from + rand() * (v.to - v.from);
    const lateral = (rand() < 0.5 ? -1 : 1) * (12 + rand() * 16);
    const p = main.point(at, lateral);
    if (!clearOfTrack(p.x, p.z, 11) || !clearOfStations(p.x, p.z, 16) || !clearOfPlaced(p.x, p.z, 3) || inside(POND, p.x, p.z)) continue;
    world('kamakura', p.x, p.z, 0, facing(main, at, lateral));
    placed.push({ x: p.x, z: p.z, r: 2.5 });
    made += 1;
    snowHouses += 1;
  }
}

// The plaza's festival: snow houses round the pond, each with lanterns in front, and a row of lanterns along its edge.
const PLAZA = [
  [-600, 2330], [-640, 2350], [-700, 2420], [-705, 2455], [-650, 2465], [-590, 2400],
];
let lanterns = 0;
for (const [x, z] of PLAZA) {
  // Pushed out of the pond, onto its snowy rim.
  const cx = -650;
  const cz = 2390;
  const d = Math.hypot(x - cx, z - cz);
  const kx = cx + ((x - cx) / d) * (d + 14);
  const kz = cz + ((z - cz) / d) * (d + 14);
  if (!clearOfTrack(kx, kz, 11)) continue;
  const rot = (Math.atan2(cx - kx, cz - kz) / RAD + 360) % 360;
  world('kamakura', kx, kz, 0, rot, 1.2);
  placed.push({ x: kx, z: kz, r: 3 });
  snowHouses += 1;
  for (const side of [-1, 1]) {
    const lx = kx + ((cx - kx) / Math.hypot(cx - kx, cz - kz)) * 3.4 + side * 2.2 * Math.cos(rot * RAD);
    const lz = kz + ((cz - kz) / Math.hypot(cx - kx, cz - kz)) * 3.4 - side * 2.2 * Math.sin(rot * RAD);
    if (!clearOfTrack(lx, lz, 5)) continue;
    world('lantern', lx, lz, 0);
    lanterns += 1;
  }
}
for (let at = 2890; at <= 3050 && lanterns < 40; at += 7) {
  for (const lateral of [-9, 9]) {
    const p = main.point(at, lateral);
    if (Math.abs(at - 3000) < 50 && lateral < 0) continue; // the platform
    if (!clearOfPlaced(p.x, p.z, 1.5)) continue;
    world('lantern', p.x, p.z, 0);
    lanterns += 1;
  }
}

// The frozen waterfall of record ① (its cliff and ice right of main 760).
{
  const p = main.point(760, 16);
  world('frozen-fall', p.x, p.z, 0, facing(main, 760, 16), 1.4);
  placed.push({ x: p.x, z: p.z, r: 6 });
}

// The ski hill: three lift towers right of the line, standing on the ground, tall enough to reach 11.5 m over the rail
// (the middle one holds record ③ on its top).
for (const at of [1480, 1600, 1720]) {
  const p = main.point(at, 14);
  const scale = (p.y + 11.5) / 13;
  world('ski-lift-tower', p.x, p.z, 0, 90 - p.phi / RAD, round(scale, 2));
  placed.push({ x: p.x, z: p.z, r: 4 });
}
// The snowy valley under the ski jump.
{
  const p = main.point(1670);
  world('snow-ravine', p.x, p.z, 0, 90 - p.phi / RAD);
}

// The snow shed (the dim wooden tunnel), one piece every 10 m, and its fences: upside down, Sakasa's swirl on them.
let traces = 0;
for (let at = SHED.from + 5; at < SHED.to; at += 10) {
  const prop = { model: 'snow-shed', onRail: on('main', at, 0, -0.5) };
  props.push(prop);
}
for (let at = SHED.from + 12; at < SHED.to - 5; at += 20) {
  const prop = { model: 'snow-fence-trace', onRail: on('main', at, -3.6, -0.5), rotationY: 90, trace: true };
  if (traces === 0) prop.traceLine = 'ぐるぐるの しるし… サカサだ！';
  props.push(prop);
  traces += 1;
}
// Ordinary snow fences along the open stretches (the right way up).
let fences = 0;
for (let i = 0; i < 400 && fences < 22; i++) {
  const at = 120 + rand() * 2700;
  if (at > SHED.from - 60 && at < SHED.to + 60) continue;
  const lateral = (rand() < 0.5 ? -1 : 1) * (10 + rand() * 8);
  const p = main.point(at, lateral);
  if (p.y > 1.5 || !clearOfTrack(p.x, p.z, 8.5) || !clearOfStations(p.x, p.z, 24) || !clearOfPlaced(p.x, p.z, 4) || inside(POND, p.x, p.z)) continue;
  world('snow-fence-small', p.x, p.z, 0, 90 - p.phi / RAD);
  placed.push({ x: p.x, z: p.z, r: 3 });
  fences += 1;
}

// Snow cushions hiding the buffer stops at the ends of the side way and the main line.
for (const line of [miharashi, main]) {
  const p = line.point(line.length + 0.5);
  world('snow-bank', p.x, p.z, line.at(line.length).y - 0.6, 90 - p.phi / RAD, 0.9);
}

// The snowy mountain far to the north-west (4-3 lies beyond), the village's snow heaps, and pines.
world('snow-mountain', -900, 2750, 0, 20, 1.3);
world('snow-mountain', -1050, 2450, 0, 70, 0.9);
let banks = 0;
for (let i = 0; i < 2000 && banks < 40; i++) {
  const at = rand() * main.length;
  const lateral = (rand() < 0.5 ? -1 : 1) * (12 + rand() * 40);
  const p = main.point(at, lateral);
  if (p.y > 1.5 && Math.abs(lateral) < 30) continue;
  if (!clearOfTrack(p.x, p.z, 11) || !clearOfStations(p.x, p.z, 24) || !clearOfPlaced(p.x, p.z, 3) || inside(POND, p.x, p.z)) continue;
  world('snow-bank', p.x, p.z, 0, rand() * 360, 0.8 + rand() * 0.8);
  placed.push({ x: p.x, z: p.z, r: 3 });
  banks += 1;
}
let pines = 0;
for (let i = 0; i < 8000 && pines < 200; i++) {
  const x = -900 + rand() * 1100;
  const z = -150 + rand() * 2750;
  if (inside(POND, x, z)) continue;
  // Only near the line (10–160 m) where it is seen; more trees on the ski hill's slopes.
  let d = Infinity;
  for (const p of TRACK) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
  if (d < 14 || d > 160) continue;
  if (!clearOfStations(x, z, 30) || !clearOfPlaced(x, z, 5)) continue;
  world('snow-pine', x, z, 0, rand() * 360, 0.8 + rand() * 0.5);
  pines += 1;
}
report.push(`scenery: ${houses} houses, ${snowHouses} snow houses, ${lanterns} lanterns, ${fences} fences, ${traces} swirl fences, ${banks} banks, ${pines} pines`);

// ---------------------------------------------------------------------------------------------------------------
// Checks against the game's curve (three.js centripetal Catmull-Rom, as src/rail/rail.ts)
// ---------------------------------------------------------------------------------------------------------------

function curveLength(line, leadIn) {
  const pts = line.json().map(([x, y, z]) => new Vector3(x, y, z));
  if (leadIn) pts.unshift(leadIn);
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  let approx = 0;
  for (let i = 1; i < pts.length; i++) approx += pts[i].distanceTo(pts[i - 1]);
  curve.arcLengthDivisions = Math.max(200, Math.ceil(approx / 0.25));
  const lengths = curve.getLengths();
  const n = lengths.length - 1;
  const total = lengths[n];
  if (!leadIn) return total;
  const t0 = 1 / (pts.length - 1);
  const x = t0 * n;
  const i = Math.floor(x);
  return total - (lengths[i] + (lengths[i + 1] - lengths[i]) * (x - i));
}
/** The design's length along the ground plus what the heights add (the game measures the 3D curve). */
function designLength3d(line) {
  let len = 0;
  for (let s = 1; s <= line.length; s += 1) {
    const a = line.at(s - 1);
    const b = line.at(s);
    len += Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
  }
  return len;
}
for (const line of Object.values(LINES)) {
  let leadIn;
  if (line !== main) {
    const [a, b] = [line.pts[0], line.pts[1]];
    const d = Math.min(8, Math.hypot(b.x - a.x, b.z - a.z));
    leadIn = new Vector3(a.x - Math.cos(a.phi) * d, line.height(0), a.z - Math.sin(a.phi) * d);
  }
  const game = curveLength(line, leadIn);
  const want = designLength3d(line);
  check(Math.abs(game - want) < 0.6, `${line.id}: design ${line.length.toFixed(1)} m (${want.toFixed(1)} m with its heights), game ${game.toFixed(1)} m`);
}

// Lines: 20 characters at most (spaces too).
{
  const texts = [];
  for (const m of MISSIONS) {
    for (const [k, v] of Object.entries(m.lines)) if (k !== 'gapNear') texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) {
      if (st.say) texts.push(st.say);
      if (st.reply) texts.push(st.reply);
    }
  }
  for (const steps of Object.values(CUTSCENES)) for (const st of steps) if (st.say) texts.push(st.say);
  for (const w of WALLS) if (w.line) texts.push(w.line);
  for (const r of RECORDS) {
    if (r.hint) texts.push(r.hint);
    texts.push(r.note);
  }
  texts.push('ジャンプだいは きてきで でるよ', 'ぐるぐるの しるし… サカサだ！');
  const long = texts.filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '4-2',
  title: 'おおゆきのむら',
  chapter: 4,
  unlock: { requires: ['4-1'], purchase: null },
  unlocks: ['plow'],
  environment: {
    sky: { top: '#7fc0ef', bottom: '#eef6fc' },
    fog: { color: '#eaf2f8', near: 240, far: 760 },
    lighting: 'day',
    ground: { y: 0, size: 3600, color: '#f1f5f9' },
    bgm: 'mura',
    ambience: 'snow',
    fall: 'snow',
    surface: 'snow',
    snow: { count: 300, radius: 60, fall: 0.8 },
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    {
      id: 'main',
      points: main.json(),
      base: { look: 'snow', toGround: true, skip: [{ from: 1650, to: 1690 }] },
      gaps: [
        { from: 1200, to: 1216, hint: 'normal', pit: false, rewind: { railId: 'main', at: 1120 } },
        { from: 1650, to: 1690, pit: false, rewind: { railId: 'main', at: 1560 }, line: 'ジャンプだいは きてきで でるよ' },
      ],
      end: { type: 'buffer' },
    },
    {
      id: 'miharashi',
      points: miharashi.json(),
      base: { look: 'snow', toGround: true },
      spur: { back: { railId: 'main', at: 1310 } },
      end: { type: 'buffer' },
    },
  ],
  junctions: [{ id: 'j-miharashi', railId: 'main', at: J_MIHARASHI, left: 'miharashi', right: 'main', default: 'right', needs: 'plow' }],
  stations: STATIONS,
  props,
  actors: [],
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: CUTSCENES,
};

const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number');
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}
function pretty(v, indent = '') {
  const one = inline(v);
  if (typeof v !== 'object' || v === null || indent.length + one.length <= 150) return one;
  const next = `${indent}  `;
  if (Array.isArray(v)) {
    if (v.length > 5 && v.every(isVec3)) {
      const lines = [];
      for (let i = 0; i < v.length; i += 5) lines.push(next + v.slice(i, i + 5).map(inline).join(', '));
      return `[\n${lines.join(',\n')}\n${indent}]`;
    }
    if (v.length > 4 && v.every((p) => Array.isArray(p) && p.length === 2)) {
      const lines = [];
      for (let i = 0; i < v.length; i += 8) lines.push(next + v.slice(i, i + 8).map(inline).join(', '));
      return `[\n${lines.join(',\n')}\n${indent}]`;
    }
    return `[\n${v.map((x) => next + pretty(x, next)).join(',\n')}\n${indent}]`;
  }
  return `{\n${Object.entries(v)
    .map(([k, x]) => `${next}${JSON.stringify(k)}: ${pretty(x, next)}`)
    .join(',\n')}\n${indent}}`;
}

const counts = {};
for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
report.push(`points: ${stage.rails.map((r) => `${r.id} ${r.points.length}`).join(', ')}`);
report.push(`marks: ${mainBuilt.marks.map((m) => `${m.seg[0]}${m.seg.slice(1).join('/')}→${m.s}`).join(' ')}`);
console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}
