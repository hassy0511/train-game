#!/usr/bin/env node
/**
 * Stage 3-1 "うみのそこ": builds src/stages/3-1.json from docs/PHASE8_CHAPTER3_4.md 第 3 部 (§5–§13), read with the
 * rules of §0 (dives on water-surface rails, floaters, dive forks; the loader works out which stretches are on and
 * under the water from the rail heights, v1.10).
 *
 * The main line `umi` is straights and arcs (§5.2) walked 1 m at a time, with its own height profile (smoothstep
 * between the levels: the beach and the islands 2.4, the floating rails 0.4, the sea floor −13.6). The loops (§5.3)
 * turn off with a U-turn of 25 m, run back and turn again onto the main line. Every step is 1 m of rail, so `s` is
 * the rail's own length (checked against the game's centripetal Catmull-Rom below). Props, actors and records are
 * placed by (rail, s, lateral); kelp, coral and rocks are scattered with a seeded generator (same file every run).
 *
 *   node scripts/layout-3-1.mjs         write src/stages/3-1.json and print the checks
 *   node scripts/layout-3-1.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 *
 * Conventions: three.js world, y up, +Z north. Heading 0 = +Z, a left turn goes towards +X (as the design script
 * layout31.py). `lateral` is positive to the right of the direction of travel (the game's frame.right): for heading
 * h that is (−cos h, sin h).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatmullRomCurve3, Vector3 } from 'three';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/3-1.json');
const DRY = process.argv.includes('--dry');

const RAD = Math.PI / 180;
const round = (v, digits = 1) => {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};

// ---------------------------------------------------------------------------------------------------------------
// Levels (§5.1, adapted: the beach and the islands stand 2.4 over the sea, so they are land, not water surface)
// ---------------------------------------------------------------------------------------------------------------

/** The sea's surface, the sea floor (the ground plane) and the rail heights. */
const SEA_Y = 0;
const FLOOR_Y = -14.2;
const LAND = 2.4;
const FLOAT = 0.4;
const DEEP = -13.6;

const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, t));
  return a + (b - a) * k * k * (3 - 2 * k);
};

/** Height profile: [from, to, y at from, y at to] (smoothstep between). */
function heightAt(sections, s) {
  for (const [a, b, ya, yb] of sections) if (s >= a && s <= b) return b > a ? smooth(ya, yb, (s - a) / (b - a)) : ya;
  return sections[sections.length - 1][3];
}

/**
 * §5.2 `umi` heights. The beach (0–150) is longer than the design's 110: its station (45) is then more than 80 m
 * before the water, so "もぐる" comes up after the start, while driving (§0.2: the seat turns 80 m before water).
 */
const UMI_HEIGHTS = [
  [0, 150, LAND, LAND],
  [150, 190, LAND, FLOAT],
  [190, 600, FLOAT, FLOAT],
  [600, 670, FLOAT, DEEP],
  [670, 1580, DEEP, DEEP],
  [1580, 1680, DEEP, LAND],
  [1680, 2010, LAND, LAND],
  [2010, 2050, LAND, FLOAT],
  [2050, 2230, FLOAT, FLOAT],
  [2230, 2300, FLOAT, DEEP],
  [2300, 4000, DEEP, DEEP],
];

// ---------------------------------------------------------------------------------------------------------------
// Rails (§5.2, §5.3)
// ---------------------------------------------------------------------------------------------------------------

/** §5.2: straights ('S', length) and arcs ('L'/'R', radius, degrees). 3,070.1 m. */
const UMI_SEGMENTS = [
  ['S', 300],
  ['L', 150, 38.2],
  ['S', 300],
  ['R', 120, 76.4],
  ['S', 300],
  ['L', 150, 57.3],
  ['S', 90],
  ['R', 150, 57.3],
  ['S', 460],
  ['R', 150, 45],
  ['S', 330],
  ['L', 150, 36.29],
  ['S', 102.19],
  ['R', 150, 36.29],
  ['S', 320],
];

/**
 * Walks straights and arcs 1 m of rail at a time from (x, z) heading `head` (degrees); y from `height(s)`. A step
 * that climbs or drops goes that much less far across (s is the rail's own 3D length, as the game measures it), so
 * past the descents the plan is 1–4 m shorter than the design's table, which walked the plan.
 */
function walk(x0, z0, head, segments, height) {
  let x = x0;
  let z = z0;
  let th = head * RAD;
  let s = 0;
  const pts = [{ x, y: height(0), z, s }];
  /** How far across (in plan) a step of `d` m of rail from s goes. */
  const across = (from, d) => {
    const dy = height(from + d) - height(from);
    return Math.sqrt(Math.max(1e-6, d * d - dy * dy));
  };
  for (const seg of segments) {
    if (seg[0] === 'S') {
      const n = Math.max(1, Math.round(seg[1]));
      const d = seg[1] / n;
      for (let i = 0; i < n; i++) {
        const f = across(s, d);
        x += Math.sin(th) * f;
        z += Math.cos(th) * f;
        s += d;
        pts.push({ x, y: height(s), z, s });
      }
    } else {
      const [kind, radius, deg] = seg;
      const len = radius * deg * RAD;
      const n = Math.max(1, Math.round(len));
      const d = len / n;
      const sign = kind === 'L' ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const f = across(s, d);
        const dth = (sign * f) / radius;
        const mid = th + dth / 2;
        x += Math.sin(mid) * f;
        z += Math.cos(mid) * f;
        th += dth;
        s += d;
        pts.push({ x, y: height(s), z, s });
      }
    }
  }
  return pts;
}

/** A rail's 1 m polyline with lookups by s. */
class Line {
  constructor(id, pts) {
    this.id = id;
    this.pts = pts;
    this.length = pts[pts.length - 1].s;
  }

  /** Position and heading (radians, 0 = +Z, left positive) at s. */
  at(s) {
    const pts = this.pts;
    const c = Math.min(Math.max(s, 0), this.length);
    let i = Math.min(Math.floor(c), pts.length - 2);
    while (i > 0 && pts[i].s > c) i--;
    while (i < pts.length - 2 && pts[i + 1].s < c) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const t = (c - a.s) / (b.s - a.s);
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, h };
  }

  /** World point `lateral` m to the right of and `up` m above the rail at s. */
  point(s, lateral = 0, up = 0) {
    const q = this.at(s);
    return { x: q.x - Math.cos(q.h) * lateral, y: q.y + up, z: q.z + Math.sin(q.h) * lateral, h: q.h };
  }

  /** JSON control points: every 10 m, every 5 m where the rail turns (or climbs) more. */
  points() {
    const out = [0];
    let s = 0;
    while (s < this.length - 1e-6) {
      const a = this.at(s);
      const b = this.at(Math.min(s + 10, this.length));
      const turn = Math.abs(angleDiff(b.h, a.h)) / RAD;
      const climb = Math.abs(b.y - a.y);
      const step = turn > 2 || climb > 0.6 ? 5 : 10;
      s = Math.min(s + step, this.length);
      if (this.length - s < 2.5) s = this.length;
      out.push(s);
    }
    return out.map((v) => {
      const q = this.at(v);
      return [round(q.x, 2), round(q.y, 2), round(q.z, 2)];
    });
  }
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const umi = new Line('umi', walk(0, 0, 0, UMI_SEGMENTS, (s) => heightAt(UMI_HEIGHTS, s)));

/**
 * §5.3 loops: from the fork a U-turn of R25 to `side`, `back` m back, a second U-turn onto the main line `back` m
 * before the fork. Level all the way (on the surface for the rings, on the sea floor for the bubbles).
 */
const LOOPS = {
  wa: { at: 600, side: 'R', back: 80, y: FLOAT },
  wa2: { at: 2230, side: 'R', back: 80, y: FLOAT },
  'uso-1': { at: 2420, side: 'R', back: 60, y: DEEP },
  'uso-2': { at: 2620, side: 'L', back: 60, y: DEEP },
  'uso-3': { at: 2820, side: 'R', back: 60, y: DEEP },
};
const loops = {};
for (const [id, l] of Object.entries(LOOPS)) {
  const p = umi.at(l.at);
  loops[id] = new Line(id, walk(p.x, p.z, p.h / RAD, [[l.side, 25, 180], ['S', l.back], [l.side, 25, 180]], () => l.y));
}
const LINES = { umi, ...loops };

// ---------------------------------------------------------------------------------------------------------------
// Checks against the design (§5.4, §5.6) and the game's own curve
// ---------------------------------------------------------------------------------------------------------------

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

check(Math.abs(umi.length - 3070.1) < 0.3, `umi length ${umi.length.toFixed(2)} (table 3,070.1)`);
for (const [id, l] of Object.entries(LOOPS)) {
  const line = loops[id];
  const end = line.at(line.length);
  const target = umi.at(l.at - l.back);
  const off = Math.hypot(end.x - target.x, end.z - target.z);
  const want = l.back === 80 ? 237.1 : 217.1;
  check(off < 0.3 && Math.abs(line.length - want) < 0.3, `${id}: ${line.length.toFixed(1)} m (table ${want}), merges on umi ${l.at - l.back} ${off.toFixed(2)} m off`);
}
/** [label, s, [x, z]] from §5.4. */
const KEY_POINTS = [
  ['すなはまえき', 45, [0, 45]],
  ['ながれぎ', 250, [0, 250]],
  ['いかだ', 456, [66.8, 436.8]],
  ['わっか①', 600, [155.8, 549.9]],
  ['さんごえき', 1000, [131.1, 887.0]],
  ['ながれ 入口', 1200, [11.8, 1047.0]],
  ['しおふき', 1742, [-104.9, 1532.3]],
  ['しおふきえき', 1950, [-233.5, 1695.8]],
  ['わっか②', 2230, [-472.0, 1811.2]],
  ['あわ①', 2420, [-660.7, 1833.7]],
  ['あわ②', 2620, [-832.2, 1923.4]],
  ['あわ③', 2820, [-1012.0, 1995.1]],
  ['あわいずみえき', 3020, [-1210.6, 2018.8]],
];
for (const [label, s, [x, z]] of KEY_POINTS) {
  const p = umi.at(s);
  const off = Math.hypot(p.x - x, p.z - z);
  // 3D steps: from the first descent (600) on, the plan runs up to 4 m short of the design's table.
  check(off < (s <= 600 ? 1 : 4.5), `${label} (umi ${s}): [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}] (table [${x}, ${z}], off ${off.toFixed(2)})`);
}
{
  // The game measures a rail along a centripetal Catmull-Rom through the JSON points: the forks and merges must be
  // where the script put them (0.5 m is the game's join tolerance).
  const curve = new CatmullRomCurve3(umi.points().map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal');
  curve.arcLengthDivisions = Math.ceil(umi.length / 0.25);
  const total = curve.getLength();
  let worst = { d: 0, s: 0 };
  for (const s of [600, 1000, 1742, 1950, 2150, 2230, 2360, 2420, 2560, 2620, 2760, 2820, 3020]) {
    const p = curve.getPointAt(Math.min(1, s / total));
    const q = umi.at(s);
    const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    if (d > worst.d) worst = { d, s };
  }
  check(Math.abs(total - umi.length) < 0.5 && worst.d < 0.3, `umi as the game's curve: ${total.toFixed(2)} m, forks and merges at most ${worst.d.toFixed(2)} m off (umi ${worst.s})`);
}
// Clearances (§5.6).
const SAMPLES = [];
for (const line of Object.values(LINES)) for (let s = 0; s <= line.length; s += 2) SAMPLES.push({ rail: line.id, s, ...line.at(s) });
{
  let self = { d: Infinity };
  for (const a of SAMPLES) {
    if (a.rail !== 'umi') continue;
    for (const b of SAMPLES) {
      if (b.rail !== 'umi' || Math.abs(a.s - b.s) < 400) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < self.d) self = { d, a, b };
    }
  }
  check(self.d > 330, `umi to itself (400 m or more apart along it): ${self.d.toFixed(0)} m (umi ${self.a.s} / ${self.b.s}; design 339)`);
  for (const [id, l] of Object.entries(LOOPS)) {
    let near = { d: Infinity };
    for (const a of SAMPLES) {
      if (a.rail !== id) continue;
      for (const b of SAMPLES) {
        if (b.rail !== 'umi' || Math.abs(b.s - l.at) < 150) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < near.d) near = { d, a, b };
      }
    }
    check(near.d > 45, `${id} ↔ umi away from its fork: ${near.d.toFixed(0)} m (design 47 or more)`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Stations, gimmicks, actors, records (§4, §7, §9)
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'sunahama', name: 'すなはまえき', railId: 'umi', at: 45, platformSide: 'left' },
  { id: 'sango', name: 'さんごえき', railId: 'umi', at: 1000, platformSide: 'left' },
  { id: 'shiofuki', name: 'しおふきえき', railId: 'umi', at: 1950, platformSide: 'left' },
  { id: 'awaizumi', name: 'あわいずみえき', railId: 'umi', at: 3020, platformSide: 'left' },
];

/** Where the spring's big bubble column rises at the end (§5.5: umi 3045, 12 m right). */
const SPRING = umi.point(3045, 12);

const GIMMICKS = [
  // §4.5: the whale's current (pushes only while the whale swims along) and its spout (a jump pad).
  { type: 'updraft', railId: 'umi', from: 1200, to: 1550, params: { speed: 20, look: 'current', whale: 'kujira' } },
  { type: 'jump-pad', railId: 'umi', from: 1742, params: { seconds: 8, range: 60, look: 'whale' } },
  // §3 M3-7: the deep, dark place (the light sees further).
  { type: 'fog', railId: 'umi', from: 2680, to: 2880, params: { near: 2, far: 22, lightFar: 70, color: '#1f4f7a' } },
  // §5.2 cameras.
  { type: 'camera', railId: 'umi', from: 585, to: 690, params: { mode: 'chase' } },
  { type: 'camera', railId: 'umi', from: 1090, to: 1170, params: { mode: 'side' } },
  { type: 'camera', railId: 'umi', from: 1575, to: 1690, params: { mode: 'chase' } },
  { type: 'camera', railId: 'umi', from: 1720, to: 1830, params: { mode: 'side' } },
  { type: 'camera', railId: 'umi', from: 2215, to: 2320, params: { mode: 'chase' } },
  { type: 'camera', railId: 'uso-1', from: 10, to: 207, params: { mode: 'top' } },
  { type: 'camera', railId: 'uso-2', from: 10, to: 207, params: { mode: 'top' } },
  { type: 'camera', railId: 'uso-3', from: 10, to: 207, params: { mode: 'top' } },
  // §5.5: the bubble spring at the last station, and two more springs in the view (looks only).
  { type: 'bubbles', params: { position: [round(SPRING.x), FLOOR_Y + 0.8, round(SPRING.z)], count: 40, height: 13, radius: 2.2 } },
  ...[
    [1030, 34],
    [2600, -40],
  ].map(([s, lateral]) => {
    const q = umi.point(s, lateral);
    return { type: 'bubbles', params: { position: [round(q.x), FLOOR_Y + 0.8, round(q.z)], count: 20, height: 12, radius: 1.6 } };
  }),
  // §5.5: fish schools and seabirds (looks only).
  { type: 'flock', params: { model: 'fish-a', count: 12, center: [255.6, -7.6, 656.9], radius: 25, speed: 0.12 } },
  { type: 'flock', params: { model: 'fish-b', count: 12, center: [-17.6, -6.6, 1094.3], radius: 30, speed: -0.1 } },
  { type: 'flock', params: { model: 'fish-a', count: 12, center: [-831.2, -6.6, 1895.1], radius: 25, speed: 0.1 } },
  { type: 'flock', params: { model: 'seabird', count: 8, center: [60, 18, 350], radius: 60, speed: 0.08 } },
];

// §4.3 floaters: a log (dive under it at ふつう) and a long raft of kelp (はやい).
const FLOATERS = [
  { id: 'log-1', railId: 'umi', at: 250, look: 'log', length: 2.4, rewind: 180, say: 'ながれぎだ！ もぐって くぐろう' },
  { id: 'raft-1', railId: 'umi', at: 456, look: 'raft', length: 8, rewind: 350, say: 'ながい いかだ！ はやい で もぐろう' },
];

const ACTORS = [
  // §4.5: the whale waits beside the rail, 5 m up, under water. Greeted, it swims along to 1560. It is on the
  // right (the design has it on the left): the side camera (1090–1170) stands on the train's left, and there the
  // whale filled its picture; from the right it is behind the train, both in one picture as §5.2 wants.
  {
    id: 'kujira',
    type: 'whale',
    reactsTo: 'whistle',
    onRail: { railId: 'umi', at: 1130, lateral: 16, heightFromRail: 5 },
    params: { until: 1560, lateral: 12 },
  },
];

const RECORDS = [
  {
    id: 'rainbow-shell',
    name: 'にじいろの かいがら',
    note: 'うみの そこで ひかる かいがら',
    requires: null,
    model: 'rainbow-shell',
    onRail: { railId: 'umi', at: 750, lateral: 6 },
  },
  {
    id: 'sea-pearl',
    name: 'うみの しんじゅ',
    note: 'うみの なかで、しんじゅが きらっ',
    requires: 'dive',
    model: 'pearl-clam',
    hint: 'したで ひかってる… もぐって みよう！',
    onRail: { railId: 'umi', at: 2110, lateral: -6, heightFromRail: -4.5 },
  },
  {
    id: 'iron-star',
    name: 'うみに おちた ながれぼし',
    note: 'すきまの そこ… ひっぱれたら？',
    requires: 'magnetLight',
    model: 'iron-star',
    onRail: { railId: 'umi', at: 2500, lateral: -10, heightFromRail: -3 },
  },
];

// §13. Keys whose text equals the built-in default (src/mission/runner.ts) are left out.
const MISSIONS = [
  {
    id: 'm1',
    type: 'deliver',
    title: 'もぐって くぐれ',
    steps: [{ stationId: 'sango', board: 2, say: 'くじらさんに あいに いくの！', reply: 'いっしょに いこう！' }],
    lines: {
      start: 'うみの うえの せんろを いくよ！\nさんごえきまで いこう！',
      moving: 'そうそう、その ちょうし！',
      diveNear: 'ジャンプが もぐるに かわった！',
      diveReady: 'いまだ！ もぐる！',
      diveGo: 'わあ… うみの なかだ！',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'さんごえきだ。ゆっくり！',
      complete: 'うみの そこに ついたね！',
    },
    hints: [
      { railId: 'umi', at: 530, text: 'あかい わっかが みえる！' },
      { railId: 'umi', at: 555, text: 'わっかで もぐると うみの そこへ！' },
      { railId: 'wa', at: 20, text: 'あれれ、とおりすぎちゃった' },
      { railId: 'wa', at: 200, text: 'もういちど、わっかで もぐろう！' },
      { railId: 'umi', at: 640, text: 'もぐれた！ うみの そこへ しゅっぱつ！' },
      { railId: 'umi', at: 680, text: 'こんぶの もりだ〜 ゆらゆら' },
      { railId: 'umi', at: 790, text: 'さんごの アーチを くぐるよ！' },
    ],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'くじらの ながれ',
    steps: [{ stationId: 'shiofuki', alight: 2, say: 'ピンクの あわが しずんでたよ', reply: 'しずむ あわ？ ふしぎ…' }],
    lines: {
      start: 'しおふきじまへ しゅっぱつ！\nくじらさんに あえるかな？',
      whaleNear: 'おおきな かげ… くじらさんだ！',
      currentIn: 'くじらさんの ながれだ！ のろう！',
      padGone: 'くじらさんが まってる！ きてき！',
      padAppear: 'しおふきだ！ のっかれ〜！',
      fellShort: 'ぽちゃん！ くじらさんを よぼう',
      fellNoJump: 'ぽちゃん！ くじらさんを よぼう',
      stationNear: 'しおふきえきだ。ゆっくり！',
      complete: 'くじらさん、ありがとう！',
    },
    hints: [
      { railId: 'umi', at: 1320, text: 'びゅーん！ はやい はやい〜！' },
      { railId: 'umi', at: 1575, text: 'うみの うえに でるよ！' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'ほんものの あわ',
    steps: [
      { stationId: 'shiofuki', parcel: 'load' },
      { stationId: 'awaizumi', parcel: 'unload', say: 'とどけて くれて ありがとう！', reply: 'どういたしまして！' },
    ],
    lines: {
      start: 'けいじばんに おねがいが きてる！\nあわいずみえきへ にもつを とどけよう\nうえに いく あわが みちしるべ！',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'あわいずみえきだ。ゆっくり！',
      complete: 'とどいた！ ……あれ？',
    },
    hints: [
      { railId: 'umi', at: 2170, text: 'また わっかだ！ もぐろう！' },
      { railId: 'wa2', at: 20, text: 'あれれ、とおりすぎちゃった' },
      { railId: 'wa2', at: 200, text: 'もういちど、わっかで もぐろう！' },
      { railId: 'umi', at: 2380, text: 'うえに いく あわが ほんもの！' },
      { railId: 'umi', at: 2490, text: 'ふかい すきまに なにか きらっ' },
      { railId: 'umi', at: 2690, text: 'くらい… ライトを つけよう！' },
      ...['uso-1', 'uso-2', 'uso-3'].flatMap((railId) => [
        { railId, at: 20, text: 'あれれ？ ぐるっと まわってる…' },
        { railId, at: 195, text: 'しずむ あわは サカサの あわ！' },
      ]),
    ],
  },
];

const JUNCTIONS = [
  { id: 'ring-1', railId: 'umi', at: 600, left: 'umi', right: 'wa', default: 'right', dive: true },
  { id: 'ring-2', railId: 'umi', at: 2230, left: 'umi', right: 'wa2', default: 'right', dive: true },
  { id: 'awa-1', railId: 'umi', at: 2420, left: 'umi', right: 'uso-1', default: 'right', bubbles: { left: 'rise', right: 'sink', say: 'あわが ふたつ！ どっちかな？' } },
  { id: 'awa-2', railId: 'umi', at: 2620, left: 'uso-2', right: 'umi', default: 'left', bubbles: { left: 'sink', right: 'rise', say: 'こんどは どっちかな？' } },
  { id: 'awa-3', railId: 'umi', at: 2820, left: 'umi', right: 'uso-3', default: 'right', bubbles: { left: 'rise', right: 'sink', say: 'どっちかな？ よく みてね' } },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

const opening = [
  { caption: 'うみのそこ', seconds: 2.5 },
  { camera: 'chase' },
  { say: 'みて！ せんろが うみの うえに！', emote: 'jump' },
  { say: 'その さきは… うみの そこへ！', emote: 'tilt' },
  { say: 'まかせて！ ぼくが かいぞう する！', emote: 'jump' },
  { unlock: 'dive' },
  // Part 2 §6: no "いき" jokes (no breath, no running out of it): the dome is what keeps them dry.
  { say: 'あわの ドームが あるから へっちゃら！', emote: 'cheer' },
  { say: 'でんしゃの なかは くうき いっぱい！' },
  { say: 'うみでは ジャンプが もぐるに なる！' },
  { camera: 'cab' },
];

/** On the island (its top is 2.0, the rail 2.4): Sakasa at the island's end, then into the sea. */
/** The glimpse's camera: on the island left of the train, a little up, looking over the track at Sakasa. */
const GLIMPSE_CAMERA = (() => {
  const at = umi.point(1956, -9, 5);
  const look = umi.point(1976, 14, 1);
  return { at: [round(at.x), round(at.y), round(at.z)], lookAt: [round(look.x), round(look.y), round(look.z)] };
})();

const glimpse = [
  { camera: 'fixed', ...GLIMPSE_CAMERA },
  // Close in front of the train (the chase camera looks over it), on the island's grass right of the track.
  { spawn: 'sakasa', model: 'amanojaku', onRail: { railId: 'umi', at: 1972, lateral: 9, heightFromRail: -0.4 }, rotationY: -90 },
  { say: 'さようなら！', who: 'amanojaku' },
  { say: 'サカサ！ なに してるの？', emote: 'jump' },
  // His pink bubbles float up round him, then drift off to the sea (right) and sink.
  ...[
    [1968, 6, 3.5],
    [1975, 12, 4.5],
    [1979, 7, 3],
  ].map(([at, lateral, up], i) => ({ spawn: `awa-${i + 1}`, model: 'awa-pink', onRail: { railId: 'umi', at, lateral, heightFromRail: up } })),
  ...[
    [1968, 6],
    [1975, 12],
    [1979, 7],
  ].map(([at, lateral], i) => ({ move: `awa-${i + 1}`, onRail: { railId: 'umi', at: at + 6, lateral: lateral + 34, heightFromRail: -8 }, seconds: 4, nowait: true })),
  { say: 'あわが… しずんでいく？', emote: 'tilt' },
  { say: 'こんにちは〜！', who: 'amanojaku' },
  // Over the island's edge (35 m right) and down into the sea ("ぽちゃん").
  { move: 'sakasa', onRail: { railId: 'umi', at: 1978, lateral: 36, heightFromRail: -0.4 }, seconds: 1.4 },
  { move: 'sakasa', onRail: { railId: 'umi', at: 1980, lateral: 40, heightFromRail: -6 }, seconds: 0.8 },
  { remove: 'sakasa' },
  { remove: 'awa-1' },
  { remove: 'awa-2' },
  { remove: 'awa-3' },
  { say: 'ピンクの あわは サカサの しわざ？', emote: 'tilt' },
];

/** §12 the ending camera: 26 m right of the train, a little above, looking at the front and the spring. */
const ENDING_CAMERA = (() => {
  const at = umi.point(3008, 26, 7);
  const look = umi.point(3024, 0, 3);
  return { at: [round(at.x), round(at.y), round(at.z)], lookAt: [round(look.x), round(look.y), round(look.z)] };
})();

const ending = [
  { camera: 'fixed', ...ENDING_CAMERA },
  { spawn: 'awa-big', model: 'awa-big', onRail: { railId: 'umi', at: 3026, heightFromRail: 11 } },
  { move: 'awa-big', onRail: { railId: 'umi', at: 3023, heightFromRail: 3.5 }, seconds: 5 },
  { say: 'おおきな ピンクの あわが…', emote: 'tilt' },
  { fx: 'pop', id: 'awa-big' },
  { remove: 'awa-big' },
  { spawn: 'awa-note', model: 'awa-note', onRail: { railId: 'umi', at: 3024, heightFromRail: 4.5 }, rotationY: 90 },
  { move: 'awa-note', onRail: { railId: 'umi', at: 3019.8, lateral: 1.6, heightFromRail: 2 }, seconds: 1.2 },
  { say: 'ぱちん！ かみが はいってた！', emote: 'jump' },
  { card: { title: 'のせて', button: '…？', mirror: true } },
  { say: 'さかさまの じ… よめない〜', emote: 'tilt' },
  { say: 'でも、この ぐるぐる もよう…' },
  { say: 'サカサの てがみ かな？' },
  { say: 'なんて かいて あるんだろう…', emote: 'tilt' },
  { say: '…よし、いこう！ つぎの せかいへ！', emote: 'cheer' },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§5.5)
// ---------------------------------------------------------------------------------------------------------------

/** Seeded generator (mulberry32): the same file on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(31);
const between = (a, b) => a + (b - a) * rand();

const props = [];
/** Ovals { x, z, rx, rz, h } (heading h) scattered props keep out of: the sandbar and the islands. */
const keepOut = [];

function addOnRail(model, railId, at, { lateral = 0, height, rotationY, scale = 1 } = {}) {
  const onRail = { railId, at: round(at) };
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

/** A mound placed along umi between `from` and `to` (its top), `width` wide; its foot spreads 1.3 times. */
function mound(model, from, to, width) {
  const mid = (from + to) / 2;
  const q = umi.at(mid);
  addOnRail(model, 'umi', mid);
  keepOut.push({ x: q.x, z: q.z, rx: (width / 2) * 1.3 + 4, rz: ((to - from) / 2) * 1.3 + 4, h: q.h });
}
// The beach (its top 0–162 m, 180 m long model centred at 72), the reef (1675–1749) and the island (1802–2016).
mound('sandbar', -18, 162, 40);
mound('reef', 1674, 1750, 60);
mound('sand-island', 1795, 2025, 70);
const insideKeepOut = (x, z, grow = 0) =>
  keepOut.some((o) => {
    const dx = x - o.x;
    const dz = z - o.z;
    // Into the oval's frame: along its heading and across it.
    const along = dx * Math.sin(o.h) + dz * Math.cos(o.h);
    const across = dx * Math.cos(o.h) - dz * Math.sin(o.h);
    return (across / (o.rx + grow)) ** 2 + (along / (o.rz + grow)) ** 2 <= 1;
  });

// Palms: on the beach, right of the track (the platform is on the left), and on the island's grass.
for (const [s, lateral] of [
  [20, 11],
  [55, 13],
  [95, 10],
  [140, -12],
]) addOnRail('palm', 'umi', s, { lateral, height: -0.4, rotationY: s * 7 });
for (const [s, lateral] of [
  [1815, 20],
  [1850, -21],
  [1880, 22],
  [1905, -20],
  [1990, 19],
  [2005, -22],
  [1860, 24],
  [1970, -24],
]) addOnRail('palm', 'umi', s, { lateral, height: -0.4, rotationY: s * 7 });

// The coral arch over the track (§3 M1-6), two more in the view; the pearl's pillar; the star's crack; the spring.
addOnRail('coral-arch', 'umi', 820);
for (const [s, lateral] of [
  [1300, 30],
  [2600, -35],
]) {
  const q = umi.point(s, lateral);
  addWorld('coral-arch', [q.x, FLOOR_Y, q.z], { rotationY: (q.h / RAD) + 90 });
}
addOnRail('coral-pillar', 'umi', 2110, { lateral: -6 });
addOnRail('rock-crack', 'umi', 2500, { lateral: -10, rotationY: 90 });
addWorld('spring-vent', [SPRING.x, FLOOR_Y, SPRING.z]);
for (const [s, lateral] of [
  [1030, 34],
  [2600, -40],
]) {
  const q = umi.point(s, lateral);
  addWorld('spring-vent', [q.x, FLOOR_Y, q.z], { scale: 0.7 });
}

/** Nearest rail sample in plan (any height): scattered things keep off every track, above or below. */
function nearRail(x, z) {
  let best = { d: Infinity };
  for (const q of SAMPLES) {
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < best.d) best = { d, q };
  }
  return best;
}
const STATION_ZONES = STATIONS.map((st) => ({ railId: st.railId, from: st.at - 50, to: st.at + 10 }));
const scattered = [];
/**
 * Scatters `count` of `models` on the sea floor beside the stretches `zones` ([rail, from, to]), `lat` [min, max] m
 * out either side, not within `minRail` m of any track, 12 m of a platform, the mounds, or each other.
 */
function scatter(models, count, { zones, lat, scale: [s0, s1], footprint, minRail = 8 }) {
  const total = zones.reduce((a, z) => a + (z[2] - z[1]), 0);
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 300; tries++) {
    let pick = rand() * total;
    let zone = zones[0];
    for (const z of zones) {
      pick -= z[2] - z[1];
      if (pick <= 0) {
        zone = z;
        break;
      }
    }
    const [railId, from, to] = zone;
    const s = between(from, to);
    const side = rand() < 0.5 ? -1 : 1;
    const scale = round(between(s0, s1), 2);
    const r = footprint * scale;
    const lateral = side * between(lat[0], lat[1]);
    const q = LINES[railId].point(s, lateral);
    const n = nearRail(q.x, q.z);
    if (n.d < Math.max(minRail, r + 3)) continue;
    if (n.d < 12 && STATION_ZONES.some((p) => p.railId === n.q.rail && n.q.s >= p.from && n.q.s <= p.to)) continue;
    if (insideKeepOut(q.x, q.z, r)) continue;
    if (scattered.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < (o.r + r) * 0.8 + 0.8)) continue;
    scattered.push({ x: q.x, z: q.z, r });
    addWorld(models[Math.floor(rand() * models.length)], [q.x, FLOOR_Y, q.z], { scale, rotationY: round(rand() * 360) });
    placed++;
  }
  if (placed < count) problems.push(`${models.join('/')}: placed ${placed} of ${count}`);
  return placed;
}
// The side camera's picture (1090–1170: 22 m to the left) is kept clear of kelp.
const SEABED = [
  ['umi', 690, 1060],
  ['umi', 1190, 1575],
  ['umi', 2300, 3065],
];
// §5.5: kelp — the forest of M1 (680–800), both sides of the current's S (1200–1550), and some everywhere else.
const KELP = { forest: 110, current: 140, rest: 90 };
// The kelp is 12 m at scale 1 and the sea 14.2 m deep: at most 1.05 so no tip pokes out of the water.
scatter(['kelp'], KELP.forest, { zones: [['umi', 675, 805]], lat: [8, 30], scale: [0.7, 1.05], footprint: 0.8 });
scatter(['kelp'], KELP.current, { zones: [['umi', 1200, 1550]], lat: [8, 26], scale: [0.7, 1.05], footprint: 0.8 });
scatter(['kelp'], KELP.rest, { zones: SEABED, lat: [9, 45], scale: [0.6, 1.0], footprint: 0.8 });
// Coral, most round the two stations on the sea floor.
scatter(['coral-a', 'coral-b', 'coral-c'], 40, { zones: [['umi', 930, 1070], ['umi', 2950, 3065]], lat: [12, 40], scale: [0.8, 1.6], footprint: 1.8, minRail: 12 });
scatter(['coral-a', 'coral-b', 'coral-c'], 50, { zones: SEABED, lat: [9, 45], scale: [0.7, 1.5], footprint: 1.8 });
scatter(['rock-a', 'rock-b'], 20, { zones: SEABED, lat: [10, 50], scale: [1.2, 2.4], footprint: 1.4 });

// ---------------------------------------------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '3-1',
  title: 'うみのそこ',
  chapter: 3,
  unlock: { requires: ['2-3'], purchase: null },
  unlocks: ['dive'],
  environment: {
    sky: { top: '#5cc0ee', bottom: '#e6f7fb' },
    fog: { color: '#d8eef7', near: 160, far: 480 },
    lighting: 'day',
    // A sea over the whole ground: the ground's colour is the surface seen from above; its y is the sea floor.
    // 4800 (not §7's 3600): the course reaches z 2025, and the floor must go on well past it under the fog.
    ground: { y: FLOOR_Y, size: 4800, color: '#3aa0d8' },
    water: [{ y: SEA_Y, floor: FLOOR_Y, look: 'sea', under: { color: '#2a86b8', far: 110 } }],
    bgm: 'umi',
    ambience: 'sea',
    fall: 'water',
  },
  start: { railId: 'umi', at: 45, direction: 1 },
  rails: [
    {
      id: 'umi',
      points: umi.points(),
      // §3 M2-6: the gap over the sea between the reef and the island (only the whale's spout gets over it).
      gaps: [{ from: 1750, to: 1800, pit: false, rewind: { railId: 'umi', at: 1620 } }],
      end: { type: 'buffer' },
    },
    ...Object.entries(LOOPS).map(([id, l]) => ({ id, points: loops[id].points(), end: { type: 'merge', railId: 'umi', at: l.at - l.back } })),
  ],
  junctions: JUNCTIONS,
  stations: STATIONS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  floaters: FLOATERS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: { opening, glimpse, ending },
};

// --- Checks on the data.
{
  // Every line of the partner and the passengers: 20 characters or fewer, spaces included (§13).
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) texts.push(...[st.say, st.reply].filter(Boolean));
  }
  for (const f of FLOATERS) texts.push(f.say);
  for (const j of JUNCTIONS) if (j.bubbles?.say) texts.push(j.bubbles.say);
  for (const r of RECORDS) if (r.hint) texts.push(r.hint);
  for (const steps of Object.values(stage.cutscenes)) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`points: ${stage.rails.map((r) => `${r.id} ${r.points.length}`).join(', ')}`);
  report.push(`ending camera: at ${ENDING_CAMERA.at.join(', ')} lookAt ${ENDING_CAMERA.lookAt.join(', ')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Output (the same layout as scripts/layout-2-3.mjs)
// ---------------------------------------------------------------------------------------------------------------

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
    return `[\n${v.map((x) => next + pretty(x, next)).join(',\n')}\n${indent}]`;
  }
  return `{\n${Object.entries(v)
    .map(([k, x]) => `${next}${JSON.stringify(k)}: ${pretty(x, next)}`)
    .join(',\n')}\n${indent}}`;
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
