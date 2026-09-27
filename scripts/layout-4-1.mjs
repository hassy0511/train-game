#!/usr/bin/env node
/**
 * Stage 4-1 "こおりのみずうみ": builds src/stages/4-1.json from docs/PHASE8_CHAPTER3_4.md 第 7 部 (read "3-2" as 4-1;
 * its last station is "きしべえき").
 *
 * The rails are the design's straights and arcs (§5.1–§5.3, the design scripts layout32b.py / lake32.py): a point
 * every 10 m on straights and every 3° on arcs (5 m on the mirror ways). The ice stretches are worked out from the
 * lake's and the cove's outlines and the small island (not written by hand). Pines and snow banks are scattered with
 * a seeded pseudo-random generator, so every run writes the same file. The rails' lengths and where things are
 * along them are checked against three.js's centripetal Catmull-Rom (what the game's Rail measures).
 *
 *   node scripts/layout-4-1.mjs         write src/stages/4-1.json and print the checks
 *   node scripts/layout-4-1.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 *
 * Conventions: three.js world, y up, +Z north. Headings φ are from +X turning right (φ 90 = +Z); `lateral` is
 * positive to the right of the direction of travel, (−sin φ, cos φ).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatmullRomCurve3, Vector3 } from 'three';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/4-1.json');
const DRY = process.argv.includes('--dry');
const RAD = Math.PI / 180;
const Y = 0.5;
/** The ice's top (the ice-sheet gimmick), and the rail's height above it. */
const ICE_Y = 0.05;
const ON_ICE = ICE_Y - Y;

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

/** A line: points with s, looked up by s (linear between points: the design's own geometry). */
class Line {
  constructor(id, pts) {
    this.id = id;
    this.pts = pts;
    this.length = pts[pts.length - 1].s;
  }
  at(s) {
    const p = this.pts;
    if (s <= 0) return { ...p[0] };
    for (let i = 1; i < p.length; i++) {
      if (s <= p[i].s) {
        const a = p[i - 1];
        const b = p[i];
        const t = (s - a.s) / (b.s - a.s || 1);
        return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, phi: a.phi + (b.phi - a.phi) * t };
      }
    }
    return { ...p[p.length - 1] };
  }
  /** World (x, z) `lateral` m right of the line at s. */
  point(s, lateral = 0) {
    const a = this.at(s);
    return { x: a.x - Math.sin(a.phi) * lateral, z: a.z + Math.cos(a.phi) * lateral, phi: a.phi };
  }
  json() {
    return this.pts.map((p) => [round(p.x, 2), Y, round(p.z, 2)]);
  }
}

const MAIN_SEGS = [
  ['S', 200], ['R', 150, 45], ['S', 160], ['L', 150, 45], ['S', 380], ['R', 120, 180], ['S', 780], ['L', 120, 90],
  ['S', 320], ['R', 200, 12], ['L', 200, 12], ['S', 110], ['L', 200, 12], ['R', 200, 12], ['S', 100], ['S', 240],
];
const mainBuilt = build([-420, -430], 0, MAIN_SEGS);
const main = new Line('main', mainBuilt.pts);
const markAt = (i) => mainBuilt.marks[i].s;
/** The westward straight starts after the U-turn; the side way into the ice hole leaves it 300 m on. */
const J_ANA = round(markAt(5) + 300, 1);
const J_K1 = round(markAt(9) - (200 * 12 * RAD), 1);
const J_K2 = round(markAt(12) - (200 * 12 * RAD), 1);

const anaStart = main.at(J_ANA);
const anaBuilt = build([anaStart.x, anaStart.z], 180, [['L', 80, 30], ['R', 80, 30], ['S', 80], ['R', 80, 30], ['L', 80, 30]]);
const ana = new Line('ana', anaBuilt.pts);
const anaEnd = ana.at(ana.length);
/** Where the side way comes back onto the main line (the westward straight: s grows as x falls). */
const ANA_MERGE = round(J_ANA + (anaStart.x - anaEnd.x), 1);

const k1Start = main.at(J_K1);
const kagami1 = new Line('kagami1', build([k1Start.x, k1Start.z], k1Start.phi / RAD, [['L', 200, 12], ['S', 45]], 5).pts);
const k2Start = main.at(J_K2);
const kagami2 = new Line('kagami2', build([k2Start.x, k2Start.z], k2Start.phi / RAD, [['R', 200, 12], ['S', 45]], 5).pts);
const LINES = { main, ana, kagami1, kagami2 };

check(Math.abs(main.length - 3258.7) < 0.3, `main ${main.length.toFixed(1)} m (design 3258.7)`);
check(Math.abs(J_ANA - 1652.6) < 0.2, `j-ana at main ${J_ANA} (design 1652.6)`);
check(Math.abs(ANA_MERGE - 1892.6) < 0.3, `ana merges at main ${ANA_MERGE} (design 1892.6), ${ana.length.toFixed(1)} m`);
check(Math.abs(J_K1 - 2641.1) < 0.2 && Math.abs(J_K2 - 2834.9) < 0.2, `mirror junctions ${J_K1}, ${J_K2} (design 2641.1, 2834.9)`);
const mergeOff = Math.hypot(anaEnd.z - main.at(ANA_MERGE).z, anaEnd.x - main.at(ANA_MERGE).x);
check(mergeOff < 0.5, `ana end to main ${mergeOff.toFixed(2)} m`);

// ---------------------------------------------------------------------------------------------------------------
// The lake (§5.5): ice where the lake's or the cove's outline holds the track, but not on the small island
// ---------------------------------------------------------------------------------------------------------------

const LAKE = [[-212, -445], [90, -330], [430, -310], [660, -260], [700, -90], [670, 70], [470, 95], [150, 80], [-100, 110], [-250, 160], [-395, 345], [-440, 345], [-490, 150], [-470, 0], [-380, -120], [-300, -300]];
const COVE = [[-470, 788], [-360, 788], [-320, 900], [-330, 1100], [-470, 1110], [-500, 950]];
const ISLAND = { x: -122, z: 11, rx: 60, rz: 42 };
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const onIsland = (x, z) => ((x - ISLAND.x) / ISLAND.rx) ** 2 + ((z - ISLAND.z) / ISLAND.rz) ** 2 <= 1;
const onIce = (x, z) => !onIsland(x, z) && (inside(LAKE, x, z) || inside(COVE, x, z));
/** Stretches of `line` on ice, 1 m at a time. */
function iceStretches(line) {
  const out = [];
  let from = null;
  for (let s = 0; s <= Math.floor(line.length); s++) {
    const p = line.at(s);
    const ice = onIce(p.x, p.z);
    if (ice && from === null) from = s;
    if (!ice && from !== null) {
      out.push([from, s]);
      from = null;
    }
  }
  if (from !== null) out.push([from, Math.floor(line.length)]);
  return out;
}
const mainIce = iceStretches(main);
report.push(`main ice: ${mainIce.map(([a, b]) => `${a}–${b}`).join(', ')} (design 200–1900, 2020–2536, 2980–3258.7)`);
check(mainIce.length === 3, 'main has three ice stretches');
/** The canyon (snow): from where the lake ends to the cove. */
const CANYON = { from: mainIce[1][1], to: mainIce[2][0] };

// ---------------------------------------------------------------------------------------------------------------
// The ice hole on the side way (§5.3, the dive): an ice-covered water with one long hole the side way crosses
// ---------------------------------------------------------------------------------------------------------------

const HOLE = { center: [65, 32.4], size: [24, 100] };
const WATER = {
  y: 0,
  floor: -12,
  look: 'ice',
  area: { rect: { center: [65, 32], size: [40, 130], rotationY: 90, corner: 8 } },
  holes: [{ rect: { center: HOLE.center, size: HOLE.size, rotationY: 90, corner: 10 } }],
};
const inHole = (x, z) => Math.abs(x - HOLE.center[0]) <= HOLE.size[1] / 2 && Math.abs(z - HOLE.center[1]) <= HOLE.size[0] / 2;
let holeFrom = null;
let holeTo = null;
for (let s = 0; s <= ana.length; s += 1) {
  const p = ana.at(s);
  if (inHole(p.x, p.z)) {
    holeFrom ??= s;
    holeTo = s;
  }
}
report.push(`ana over the hole: ${holeFrom}–${holeTo} (design 70–175)`);
let mainNearHole = Infinity;
for (let s = J_ANA; s <= ANA_MERGE; s += 2) {
  const p = main.at(s);
  const dz = Math.abs(p.z - HOLE.center[1]) - HOLE.size[0] / 2;
  if (Math.abs(p.x - HOLE.center[0]) <= HOLE.size[1] / 2) mainNearHole = Math.min(mainNearHole, dz);
}
check(mainNearHole > 4, `main stays ${mainNearHole.toFixed(1)} m off the hole`);
const anaIce = [
  [0, holeFrom - 8],
  [holeTo + 6, Math.floor(ana.length)],
];

// ---------------------------------------------------------------------------------------------------------------
// Stations, gimmicks, actors, records
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'mizuumi', name: 'みずうみえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'tsuriba', name: 'つりばえき', railId: 'main', at: 740, platformSide: 'right', stop: { ok: 8, maxSpeed: 9 } },
  { id: 'kojima', name: 'こじまえき', railId: 'main', at: 2072, platformSide: 'left', stop: { maxSpeed: 9 } },
  { id: 'kishibe', name: 'きしべえき', railId: 'main', at: 3200, platformSide: 'right', stop: { maxSpeed: 9 } },
];
for (const st of STATIONS.slice(1)) {
  const z = mainIce.find(([a, b]) => st.at >= a && st.at <= b);
  check(!!z, `${st.name} (${st.at}) stops on ice`);
}

const THIN = [
  { from: 940, to: 980, line: 'うすい こおり！ ひかったら ロケット！' },
  { from: 1415, to: 1535, line: 'うすくて ながい！ ロケット 2かい！' },
  { from: 2401, to: 2441, line: 'うすい こおり！ ロケットの じゅんび！' },
];
for (const t of THIN) check(mainIce.some(([a, b]) => t.from >= a && t.to <= b), `thin ice ${t.from}–${t.to} lies on the lake's ice`);

const MIRRORS = [
  { position: [-398.9, 0, 546.4], rotationY: 192, width: 22, height: 14, railId: 'kagami1', junction: 'j-kagami1', lightHint: true },
  { position: [-439.3, 0, 739.6], rotationY: 168, width: 22, height: 14, railId: 'kagami2', junction: 'j-kagami2' },
  { position: [-385, 0, 1080], rotationY: 222, width: 30, height: 18, reflect: ['train', 'cutscene'] },
];
// Each false way ends 10 m before its mirror, facing it.
for (const [i, line] of [[0, kagami1], [1, kagami2]]) {
  const end = line.at(line.length);
  const m = MIRRORS[i];
  const d = Math.hypot(m.position[0] - end.x, m.position[2] - end.z);
  const n = [Math.sin(m.rotationY * RAD), Math.cos(m.rotationY * RAD)];
  const facing = ((end.x - m.position[0]) * n[0] + (end.z - m.position[2]) * n[1]) / d;
  check(d > 8 && d < 12 && facing > 0.9, `${line.id}: its end is ${d.toFixed(1)} m before its mirror, facing it (${facing.toFixed(2)})`);
}

const iceGimmick = (railId, [from, to], line, sign = true) => ({
  type: 'ice',
  railId,
  from,
  to,
  ...(line || !sign ? { params: { ...(line ? { line } : {}), ...(sign ? {} : { sign: false }) } } : {}),
});
const GIMMICKS = [
  { type: 'ice-sheet', params: { outline: LAKE, y: ICE_Y, color: '#cfeaf6' } },
  { type: 'ice-sheet', params: { outline: COVE, y: ICE_Y, color: '#cfeaf6' } },
  iceGimmick('main', mainIce[0], 'こおりの うえだ！ つるつる〜'),
  iceGimmick('main', mainIce[1], 'また こおり！ はやめに ブレーキ！'),
  iceGimmick('main', mainIce[2], null),
  iceGimmick('ana', anaIce[0], null, false),
  iceGimmick('ana', anaIce[1], null, false),
  ...THIN.map((t) => ({ type: 'thin-ice', railId: 'main', from: t.from, to: t.to, params: { line: t.line } })),
  ...THIN.map((t) => ({ type: 'camera', railId: 'main', from: t.from - 40, to: t.to + 50, params: { mode: 'chase' } })),
  ...MIRRORS.map((m) => ({ type: 'mirror', params: m })),
  { type: 'flock', params: { model: 'snowbird', count: 10, center: [100, 40, -60], radius: 220, speed: 0.05 } },
];

const ACTORS = [
  {
    id: 'azarashi',
    type: 'cat',
    onRail: { railId: 'main', at: 420, heightFromRail: ON_ICE },
    reactsTo: 'whistle',
    params: { look: 'seal', wakeDistance: 60, dangerDistance: 8, fleeLateral: 7, fleeSeconds: 2 },
  },
  {
    id: 'yukidori',
    type: 'rock-roll',
    onRail: { railId: 'main', at: 560 },
    reactsTo: 'none',
    params: {
      look: 'snowbird',
      startDistance: 70,
      crossSeconds: 7,
      lateral: 10,
      warn: 90,
      say: 'とりさんだ！ はやめに ゆっくり！',
      hitAfter: 'わたりおわるまで まってね',
    },
  },
];

const RECORDS = [
  {
    id: 'frost-flower',
    name: 'こおりの はな',
    note: 'さむい あさ、こおりの うえに さく はな',
    requires: null,
    model: 'frost-flower',
    hint: 'こおりの うえに はなが さいてる！',
    onRail: { railId: 'main', at: 330, lateral: 9, heightFromRail: ON_ICE },
  },
  {
    id: 'glow-shell',
    name: 'こおりの したの ひかる かい',
    note: 'こおりの したで ぼんやり ひかる',
    requires: 'dive',
    model: 'glow-shell',
    hint: 'こおりの したで なにか ひかってる',
    // Past the floe (at 120): a dive for the floe, then one more for the shell (its glow would come too early for the floe).
    onRail: { railId: 'ana', at: 160, heightFromRail: -3 },
  },
  {
    id: 'ice-bell',
    name: 'こおりの たなの すず',
    note: 'たかい たなの すず。ひきよせられたら…',
    requires: 'magnetLight',
    model: 'ice-bell',
    onRail: { railId: 'main', at: 2760, lateral: 16, heightFromRail: 9 },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Missions, cutscenes (§3, §12, §13)
// ---------------------------------------------------------------------------------------------------------------

const MISSIONS = [
  {
    id: 'm1',
    type: 'pickup',
    title: 'つるつる こおり',
    steps: [{ stationId: 'tsuriba', board: 2, say: 'こおりが うすい ところが あるの', reply: 'きを つけるね！' }],
    lines: {
      start: 'つりばの なかまを むかえに いこう！\nこおりの うえは はやめに ブレーキ！',
      moving: 'そうそう、その ちょうし！',
      iceBrake: 'しゃーっ… すぐには とまれないね',
      catNear: 'あざらしが ねてる！ きてき！',
      catWoke: 'すいーっと どいて くれた！',
      rockHit: 'わっ！ とりさんが びっくり〜',
      recordFound: 'みつけた！ ずかんに のせよう',
      iceNear: 'つるつる！ はやめに ブレーキ！',
      iceStop: 'いまだ！ レバーを とまるに！',
      complete: 'とまれた！ はやめの ブレーキ だね',
    },
    hints: [{ railId: 'main', at: 150, text: 'むこうに こおりの みずうみ！' }],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'われる こおり',
    steps: [{ stationId: 'kojima', alight: 2, say: 'たにで ぐるぐる ぼうしを みたよ', reply: 'サカサかも！ いってみよう' }],
    lines: {
      start: 'なかまを こじまえきまで はこぼう\nうすい こおりは ロケットで いっきに！',
      rocketReady: 'いまだ！ ロケット！',
      rocketGo: 'ばりばり〜！ いけいけ〜！',
      rocketAgain: 'まだ こおりの うえ！ もういっかい！',
      thinIceClear: 'わたれた！ うしろが ばりばり〜',
      iceNear: 'えきは こおりの うえ！ はやめに！',
      recordFound: 'みつけた！ ずかんに のせよう',
      complete: 'ロケットで こおりを わたれた！',
    },
    hints: [
      { railId: 'main', at: 1100, text: 'みて！ こおりが また こおった！' },
      { railId: 'main', at: 1600, text: 'ひだりに こおりの あな… もぐれるかも' },
      { railId: 'main', at: 1905, text: 'しまの うえは ブレーキが きくよ' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'かがみの わかれみち',
    steps: [{ stationId: 'kishibe' }],
    lines: {
      start: 'きたの こおりの たにへ いこう\nさいごの えきも こおりの うえだよ',
      rocketReady: 'いまだ！ ロケット！',
      mirrorNear: 'あれ？ むこうにも ワンダーごう…？\nライトで てらして みよう！',
      signRevealed: 'ほんとうの みちが ひかった！',
      deadEnd: 'かがみ だった〜！\nライトで たしかめよう',
      iceNear: 'つるつる！ はやめに ブレーキ！',
      complete: 'きしべえきに ついた！',
    },
    hints: [
      { railId: 'main', at: 2540, text: 'こおりの かべ… ぴかぴか してる' },
      { railId: 'main', at: 2700, text: 'かがみの やじるしは ほんとうの むき！' },
      { railId: 'main', at: 2740, text: 'たかい ところで なにか ちりん…' },
      { railId: 'main', at: 2775, text: 'また かがみ かも…？' },
      { railId: 'main', at: 2985, text: 'さいごの えきも こおり！ はやめに！' },
    ],
  },
];

const onIceAt = (railId, at, lateral) => ({ railId, at, lateral, heightFromRail: ON_ICE });
/** The place on `line` nearest to world (x, z): { at, lateral } (lateral positive to the right). */
function toRail(line, x, z) {
  let best = { at: 0, d: Infinity, lateral: 0 };
  for (let at = 0; at <= line.length; at += 0.5) {
    const p = line.at(at);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best.d) best = { at, d, lateral: (x - p.x) * -Math.sin(p.phi) + (z - p.z) * Math.cos(p.phi) };
  }
  return { at: round(best.at, 1), lateral: round(best.lateral, 1) };
}
/**
 * The ending (§12): Sakasa stands on the ice 5 m behind a camera that looks straight into the big mirror from 20 m,
 * facing away from it, so the mirror shows his back (the real one is out of the picture); then a camera by the
 * tunnel's mouth sees him skate past and in.
 */
const ENDING = (() => {
  const m = MIRRORS[2];
  const n = [Math.sin(m.rotationY * RAD), Math.cos(m.rotationY * RAD)];
  const [mx, , mz] = m.position;
  const place = toRail(main, mx + 25 * n[0], mz + 25 * n[1]);
  return {
    mirrorCam: { at: [round(mx + 20 * n[0]), 4, round(mz + 20 * n[1])], lookAt: [mx, 7.5, mz] },
    sakasa: { railId: 'main', at: place.at, lateral: place.lateral, heightFromRail: ON_ICE },
    // Facing away from the mirror (rotationY is measured from the rail's heading, +Z here).
    facing: round(Math.atan2(n[0], n[1]) / RAD, 0),
    tunnelCam: { at: [-478, 5, 1044], lookAt: [-531, 4, 1062] },
  };
})();

const CUTSCENES = {
  opening: [
    { caption: 'こおりの みずうみ', seconds: 2.5 },
    { camera: 'chase' },
    { say: 'わあ！ みずうみが こおってる！', emote: 'jump' },
    { say: 'ぴかぴかの こおりの せかいだ' },
    { say: '…でも、こおりは つるつる すべるよ', emote: 'tilt' },
    { say: 'ブレーキを かけても すぐ とまれない' },
    { say: 'だから、いつもより はやめに かける' },
    { say: 'つるつる！ はやめに ブレーキ！', emote: 'cheer' },
    { camera: 'cab' },
  ],
  glimpse: [
    { camera: 'chase' },
    { spawn: 'sakasa', model: 'amanojaku', onRail: onIceAt('main', 2140, -28), rotationY: 90 },
    { say: 'あれ？ こおりの うえに だれか…', emote: 'tilt' },
    { move: 'sakasa', onRail: onIceAt('main', 2152, -40), seconds: 1.2 },
    { move: 'sakasa', onRail: onIceAt('main', 2140, -52), seconds: 1.2 },
    { move: 'sakasa', onRail: onIceAt('main', 2128, -40), seconds: 1.2 },
    { move: 'sakasa', onRail: onIceAt('main', 2140, -28), seconds: 1.2 },
    { say: 'ぐるぐる ぼうし… ひとりで すべってる' },
    { move: 'sakasa', onRail: onIceAt('main', 2290, -80), seconds: 3 },
    { remove: 'sakasa' },
    { say: 'たのしそう… でも、ひとりだね', emote: 'tilt' },
  ],
  ending: [
    { camera: 'fixed', at: ENDING.mirrorCam.at, lookAt: ENDING.mirrorCam.lookAt },
    { spawn: 'sakasa', model: 'amanojaku', onRail: ENDING.sakasa, rotationY: ENDING.facing },
    { say: 'ついた！ …あれ？ かがみに だれか', emote: 'tilt' },
    { say: 'ぐるぐる ぼうし… サカサだ！', emote: 'jump' },
    { camera: 'fixed', at: ENDING.tunnelCam.at, lookAt: ENDING.tunnelCam.lookAt },
    { say: 'サカサー！ まって〜！' },
    { say: '……こんにちは〜！', who: 'amanojaku' },
    { move: 'sakasa', onRail: { railId: 'main', at: 3252, lateral: 112, heightFromRail: -0.5 }, seconds: 5 },
    { remove: 'sakasa' },
    { camera: 'chase' },
    { say: 'いっちゃった… おいつけなかった', emote: 'tilt' },
    { say: 'せんろは ここで おしまい だもんね' },
    { say: 'サカサ、ひとりで さむく ないかな' },
    { say: '…よし、いこう！ ゆきやまへ！', emote: 'cheer' },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Scenery (§5.5): props placed along the lines or in the world, pines and banks scattered by a seeded generator
// ---------------------------------------------------------------------------------------------------------------

let seed = 41;
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
function distToPoly(poly, x, z) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
const clearOfMirrors = (x, z, d) => MIRRORS.every((m) => Math.hypot(m.position[0] - x, m.position[2] - z) >= d);

// The small island: snow, the observatory and three pines.
world('snow-island', ISLAND.x, ISLAND.z, ICE_Y);
world('observatory', -150, 38, ICE_Y + 0.1, 200);
for (const [x, z] of [[-100, 36], [-168, 22], [-95, -14]]) world('snow-pine', x, z, ICE_Y + 0.1, rand() * 360, 0.8 + rand() * 0.3);

// The fishing huts at つりば (right of the line), with their holes.
const HUTS = ['ice-hut', 'ice-hut-b', 'ice-hut-c'];
for (let i = 0; i < 6; i++) {
  const at = 700 + i * 18;
  const lateral = 13 + (i % 2) * 12 + rand() * 4;
  const p = main.point(at, lateral);
  world(HUTS[i % 3], p.x, p.z, ICE_Y, rand() * 360);
  const h = main.point(at + 6, lateral + 4);
  world('ice-hole', h.x, h.z, ICE_Y);
}

// The canyon: ice walls on both sides every 18 m, ±16 m from the line, ±45 m in the two mirror halls; not in front of
// the mirrors nor on the mirror ways.
const HALLS = [[J_K1 - 40, J_K1 + 90], [J_K2 - 35, J_K2 + 95]];
let walls = 0;
for (let at = CANYON.from + 6; at <= CANYON.to - 6; at += 18) {
  const hall = HALLS.some(([a, b]) => at >= a && at <= b);
  for (const side of [-1, 1]) {
    const lateral = side * (hall ? 45 : 16);
    const p = main.point(at, lateral);
    if (!clearOfMirrors(p.x, p.z, 16) || !clearOfTrack(p.x, p.z, 12.5)) continue;
    world('ice-wall', p.x, p.z, 0, 90 - p.phi / RAD, 0.9 + rand() * 0.3);
    walls += 1;
  }
}
// The wall that holds record ③'s shelf (right of main 2760, its face just behind the bell).
{
  const p = main.point(2760, 18.2);
  world('ice-wall', p.x, p.z, 0, 90 - p.phi / RAD, 1);
}

// The big snowy mountain and the tunnel's mouth (4-3 lies beyond).
world('snow-mountain', -720, 1080);
world('tunnel-mouth', -531, 1062, 0, 90);

// Snow cushions hiding the buffer stops at the ends of the mirror ways and the main line.
for (const line of [kagami1, kagami2, main]) {
  const p = line.point(line.length + 0.5);
  world('snow-bank', p.x, p.z, 0, 90 - p.phi / RAD, 0.9);
}

// Snow banks along the shore, and pines round the lake (20–120 m off its shore).
let banks = 0;
for (let i = 0; i < 400 && banks < 30; i++) {
  const k = Math.floor(rand() * LAKE.length);
  const [ax, az] = LAKE[k];
  const [bx, bz] = LAKE[(k + 1) % LAKE.length];
  const t = rand();
  const x = ax + (bx - ax) * t;
  const z = az + (bz - az) * t;
  const nx = -(bz - az);
  const nz = bx - ax;
  const nl = Math.hypot(nx, nz);
  // Outward: the side not inside the lake.
  const out = inside(LAKE, x + (nx / nl) * 3, z + (nz / nl) * 3) ? -1 : 1;
  const px = x + (out * nx * 6) / nl;
  const pz = z + (out * nz * 6) / nl;
  if (!clearOfTrack(px, pz, 12) || !clearOfStations(px, pz, 30)) continue;
  world('snow-bank', px, pz, 0, rand() * 360, 0.8 + rand() * 0.6);
  banks += 1;
}
let pines = 0;
for (let i = 0; i < 6000 && pines < 220; i++) {
  const x = -720 + rand() * 1500;
  const z = -620 + rand() * 1700;
  if (inside(LAKE, x, z) || inside(COVE, x, z)) continue;
  const d = Math.min(distToPoly(LAKE, x, z), distToPoly(COVE, x, z));
  if (d < 20 || d > 120) continue;
  // Not in the canyon between its walls, not on the mountain, clear of the track, stations and mirrors.
  if (x > -480 && x < -350 && z > 420 && z < 1000) continue;
  if (Math.hypot(x + 720, z - 1080) < 200) continue;
  if (!clearOfTrack(x, z, 14) || !clearOfStations(x, z, 30) || !clearOfMirrors(x, z, 30)) continue;
  world('snow-pine', x, z, 0, rand() * 360, 0.8 + rand() * 0.5);
  pines += 1;
}
report.push(`scenery: ${pines} pines, ${banks} shore banks, ${walls} canyon walls`);

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
for (const line of Object.values(LINES)) {
  let leadIn;
  if (line !== main) {
    const [a, b] = [line.pts[0], line.pts[1]];
    const d = Math.min(8, Math.hypot(b.x - a.x, b.z - a.z));
    leadIn = new Vector3(a.x - Math.cos(a.phi) * d, Y, a.z - Math.sin(a.phi) * d);
  }
  const game = curveLength(line, leadIn);
  check(Math.abs(game - line.length) < 0.5, `${line.id}: design ${line.length.toFixed(1)} m, game ${game.toFixed(1)} m`);
}

// Lines: 20 characters at most (spaces too).
{
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) {
      if (st.say) texts.push(st.say);
      if (st.reply) texts.push(st.reply);
    }
  }
  for (const steps of Object.values(CUTSCENES)) for (const st of steps) if (st.say) texts.push(st.say);
  for (const t of THIN) texts.push(t.line);
  for (const r of RECORDS) if (r.hint) texts.push(r.hint);
  texts.push(ACTORS[1].params.say, ACTORS[1].params.hitAfter);
  const long = texts.filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '4-1',
  title: 'こおりのみずうみ',
  chapter: 4,
  unlock: { requires: ['3-3'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#9fd3f2', bottom: '#f2f8fc' },
    fog: { color: '#eaf4fa', near: 250, far: 800 },
    lighting: 'day',
    ground: { y: 0, size: 3200, color: '#f3f7fa' },
    bgm: 'koori',
    ambience: 'ice',
    fall: 'cloud',
    surface: 'snow',
    snow: { count: 600, radius: 60, fall: 1.2 },
    water: [WATER],
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    { id: 'main', points: main.json(), end: { type: 'buffer' } },
    { id: 'ana', points: ana.json(), end: { type: 'merge', railId: 'main', at: ANA_MERGE } },
    { id: 'kagami1', points: kagami1.json(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'kagami2', points: kagami2.json(), deadEnd: true, end: { type: 'buffer' } },
  ],
  junctions: [
    { id: 'j-ana', railId: 'main', at: J_ANA, left: 'ana', right: 'main', default: 'right', needs: 'dive' },
    { id: 'j-kagami1', railId: 'main', at: J_K1, left: 'kagami1', right: 'main', default: 'left', signReversed: true },
    { id: 'j-kagami2', railId: 'main', at: J_K2, left: 'main', right: 'kagami2', default: 'right', signReversed: true },
  ],
  stations: STATIONS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  floaters: [{ id: 'ukigori', railId: 'ana', at: 120, look: 'ice' }],
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
