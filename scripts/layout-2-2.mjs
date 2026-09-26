#!/usr/bin/env node
/**
 * Stage 2-2 "むしのはらっぱ": builds src/stages/2-2.json from docs/PHASE6_DESIGN.md (§4.5, §5, §6, §11, §12, 付録 A).
 *
 * Rails are straights and circular arcs joined end to end, with a point every 10 m on straights and every 3° on
 * arcs. Heights are joined by smoothstep; the two silk bridges sag by a sine. Props, actors and records are placed
 * by (rail, s, lateral). Grass, flowers, clover and pebbles are scattered with a seeded pseudo-random generator, so
 * every run writes the same file.
 *
 *   node scripts/layout-2-2.mjs         write src/stages/2-2.json and print the checks
 *   node scripts/layout-2-2.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 *
 * Conventions (as in the game): +Z is north, y is up. The heading h is measured from +Z towards +X, so a left turn
 * increases it. `lateral` is positive to the right of the direction of travel (heading north, right is −X).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/2-2.json');
const DRY = process.argv.includes('--dry');

const RAD = Math.PI / 180;
const GROUND_Y = -0.6;
/** Resolution (m) of the rail-to-ground distance table. */
const U_STEP = 0.05;
const round = (v, digits = 1) => {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};

// ---------------------------------------------------------------------------------------------------------------
// Course geometry (§5)
// ---------------------------------------------------------------------------------------------------------------

/** Straight of `len` m. */
const S = (len) => ({ len });
/** Arc turning left / right with radius `r`, `len` m long. */
const L = (r, len) => ({ len, r, sign: 1 });
const R = (r, len) => ({ len, r, sign: -1 });

const smooth = (t) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};
/** Heights joined by smoothstep: `[from, to, y0, y1]` in order along the rail. */
const ramps = (list, base) => (s) => {
  let y = base;
  for (const [a, b, y0, y1] of list) {
    if (s <= a) break;
    y = y0 + (y1 - y0) * smooth((s - a) / (b - a));
  }
  return y;
};
/** The hanging silk bridges: `[from, to, depth]` sag by a sine. */
const sag = (list, f) => (s) => {
  let y = f(s);
  for (const [a, b, d] of list) if (s > a && s < b) y -= d * Math.sin((Math.PI * (s - a)) / (b - a));
  return y;
};

/**
 * A rail laid out from straights and arcs. `s` is the distance along the rail itself (what the game's Catmull-Rom
 * arc length measures), so where the rail climbs or sags, the ground distance covered is a little shorter: the
 * table's lengths are rail lengths. Arcs are level on this course (checked).
 */
class Path {
  /** @param start [x, z] @param headingDeg heading at s = 0 */
  constructor(id, start, headingDeg, segs, height) {
    this.id = id;
    this.height = height;
    this.length = segs.reduce((a, g) => a + g.len, 0);
    // Ground distance u covered up to s, every U_STEP m of rail.
    const n = Math.ceil(this.length / U_STEP);
    this.uTable = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) {
      const dy = height(Math.min(i * U_STEP, this.length)) - height((i - 1) * U_STEP);
      this.uTable[i] = this.uTable[i - 1] + Math.sqrt(Math.max(0, U_STEP * U_STEP - dy * dy));
    }
    this.pieces = [];
    let x = start[0];
    let z = start[1];
    let h = headingDeg * RAD;
    let s = 0;
    for (const g of segs) {
      const u0 = this.uAt(s);
      const piece = { ...g, s0: s, u0, ulen: this.uAt(s + g.len) - u0, x0: x, z0: z, h0: h };
      if (g.r && Math.abs(piece.ulen - g.len) > 1e-6) throw new Error(`${id}: the arc at s ${s} is not level`);
      this.pieces.push(piece);
      ({ x, z, h } = Path.local(piece, piece.ulen));
      s += g.len;
    }
  }

  uAt(s) {
    const x = Math.min(Math.max(s, 0), this.length) / U_STEP;
    const i = Math.min(Math.floor(x), this.uTable.length - 2);
    return this.uTable[i] + (this.uTable[i + 1] - this.uTable[i]) * (x - i);
  }

  /** Ground position after `u` m of ground distance into piece `p`. */
  static local(p, u) {
    if (!p.r) return { x: p.x0 + Math.sin(p.h0) * u, z: p.z0 + Math.cos(p.h0) * u, h: p.h0 };
    // Centre of the arc: `r` to the left (sign +1) or right (−1) of the start.
    const cx = p.x0 + p.sign * p.r * Math.cos(p.h0);
    const cz = p.z0 - p.sign * p.r * Math.sin(p.h0);
    const h = p.h0 + (p.sign * u) / p.r;
    return { x: cx - p.sign * p.r * Math.cos(h), z: cz + p.sign * p.r * Math.sin(h), h };
  }

  /** Position and heading at `s` (straight on beyond either end). */
  at(s) {
    let q;
    if (s < 0) {
      const p = this.pieces[0];
      q = { x: p.x0 + Math.sin(p.h0) * s, z: p.z0 + Math.cos(p.h0) * s, h: p.h0 };
    } else if (s > this.length) {
      const p = this.pieces[this.pieces.length - 1];
      const e = Path.local(p, p.ulen);
      const u = s - this.length;
      q = { x: e.x + Math.sin(e.h) * u, z: e.z + Math.cos(e.h) * u, h: e.h };
    } else {
      let p = this.pieces[0];
      for (const c of this.pieces) if (s >= c.s0) p = c;
      q = Path.local(p, Math.min(this.uAt(s) - p.u0, p.ulen));
    }
    return { ...q, y: this.height(Math.min(Math.max(s, 0), this.length)) };
  }

  /** World point `lateral` m to the right and `up` m above the rail at `s`. */
  point(s, lateral = 0, up = 0) {
    const q = this.at(s);
    return { x: q.x - Math.cos(q.h) * lateral, y: q.y + up, z: q.z + Math.sin(q.h) * lateral, h: q.h };
  }

  /** Control points: every 10 m on straights, every 3° on arcs (evenly split). */
  points() {
    const out = [this.at(0)];
    for (const p of this.pieces) {
      const n = p.r ? Math.ceil(p.len / p.r / (3 * RAD) - 1e-9) : Math.ceil(p.len / 10 - 1e-9);
      for (let k = 1; k <= n; k++) out.push(this.at(p.s0 + (p.len * k) / n));
    }
    return out.map((q) => [round(q.x, 2), round(q.y, 2), round(q.z, 2)]);
  }
}

const mainY = ramps(
  [
    [850, 890, 0, 3], // the pebble step (the gap climbs 3 m)
    [930, 970, 3, 1.5], // down onto the clover leaves
    [1090, 1130, 1.5, 0],
    [1850, 1920, 0, 6], // up onto the flower bed
  ],
  0,
);
const silkY = sag(
  [
    [170, 220, 1.2], // silk bridge 1: 10.8 m in the middle
    [900, 930, 0.8], // silk bridge 2: 11.2 m in the middle
  ],
  ramps([[0, 90, 6, 12]], 6),
);

const main = new Path(
  'main',
  [-600, -1250],
  0,
  [S(170), L(120, 80), S(350), R(100, 100), S(400), S(30), L(100, 90), S(280), R(70, 55), S(30), L(70, 110), R(70, 55), S(250)],
  mainY,
);
const mainEnd = main.at(main.length);
const silk = new Path('silk', [mainEnd.x, mainEnd.z], mainEnd.h / RAD, [S(520), L(120, 80), S(220), R(120, 80), S(160)], silkY);
const JUNCTION_AT = 450;
const junction = silk.at(JUNCTION_AT);
const loop = new Path('loop', [junction.x, junction.z], junction.h / RAD, [R(25, 25 * Math.PI), S(60), R(25, 25 * Math.PI)], () => 12);
const LOOP_MERGE_AT = 390;
const PATHS = { main, silk, loop };

// ---------------------------------------------------------------------------------------------------------------
// Checks against the design tables
// ---------------------------------------------------------------------------------------------------------------

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

check(Math.abs(main.length - 2000) < 1e-6, `main length ${main.length.toFixed(2)} (table 2000)`);
check(Math.abs(silk.length - 1060) < 1e-6, `silk length ${silk.length.toFixed(2)} (table 1060)`);
check(Math.abs(loop.length - 217.1) < 0.05, `loop length ${loop.length.toFixed(2)} (table 217.1)`);
{
  const end = loop.at(loop.length);
  const merge = silk.at(LOOP_MERGE_AT);
  const off = Math.hypot(end.x - merge.x, end.z - merge.z);
  const turn = Math.abs(((((end.h - merge.h) / RAD) % 360) + 540) % 360 - 180);
  check(off < 0.01 && turn < 0.01, `loop end → silk ${LOOP_MERGE_AT}: off ${off.toFixed(3)} m, heading ${turn.toFixed(3)}°`);
}

/** §5 "おもな 点の 座標": [label, rail, s, lateral, up, expected [x, y, z], heading° or null]. */
const KEY_POINTS = [
  ['start', 'main', 0, 0, 0, [-600, 0, -1250], 0],
  ['harappa', 'main', 45, 0, 0, [-600, 0, -1205], 0],
  ['mist exit', 'main', 150, 0, 0, [-600, 0, -1100], 0],
  ['left curve end', 'main', 250, 0, 0, [-574.3, 0, -1005.8], 38.2],
  ['batta-1 leaf', 'main', 430, 5, 2, [-466.9, 2, -861.2], 38.2],
  ['puddle', 'main', 520, 0, 0, [-407.3, 0, -793.6], 38.2],
  ['right curve end', 'main', 700, 0, 0, [-342.0, 0, -636.2], -19.1],
  ['batta-2 leaf', 'main', 760, 5, 3, [-366.3, 3, -581.1], -19.1],
  ['pebble step from', 'main', 850, 0, 0, [-391.0, 0, -494.4], -19.1],
  ['pebble step to', 'main', 890, 0, 0, [-404.1, 3, -456.6], -19.1],
  ['clover station', 'main', 1070, 0, 0, [-463.0, 1.5, -286.5], -19.1],
  ['left curve end', 'main', 1220, 0, 0, [-472.5, 0, -143.4], 32.5],
  ['butterfly 1', 'main', 1250, -5, 4, [-452.2, 4, -120.8], 32.5],
  ['flower bridge 1', 'main', 1360, 0, 0, [-397.4, 0, -25.3], 32.5],
  ['S in', 'main', 1500, 0, 0, [-322.2, 0, 92.8], 32.5],
  ['S out', 'main', 1750, 0, 0, [-222.4, 0, 289.2], 32.5],
  ['flower bridge 2', 'main', 1790, 0, 0, [-201.0, 0, 322.9], 32.5],
  ['flower-bed station', 'main', 1960, 0, 0, [-109.7, 6, 466.3], 32.5],
  ['silk start', 'silk', 0, 0, 0, [-88.2, 6, 500.1], 32.5],
  ['silk bridge 1 from', 'silk', 170, 0, 0, [3.0, 12, 643.5], 32.5],
  ['silk bridge 1 middle', 'silk', 195, 0, 0, [null, 10.8, null], null],
  ['silk bridge 1 to', 'silk', 220, 0, 0, [29.9, 12, 685.7], 32.5],
  ['loop merge', 'silk', 390, 0, 0, [121.1, 12, 829.1], 32.5],
  ['junction', 'silk', 450, 0, 0, [153.3, 12, 879.8], 32.5],
  ['loop far end', 'loop', 108.5, 0, 0, [95.1, 12, 881.3], 212.5],
  ['flower bridge 3', 'silk', 740, 0, 0, [384.5, 12, 1034.0], 70.7],
  ['silk bridge 2 from', 'silk', 900, 0, 0, [521.5, 12, 1109.3], 32.5],
  ['silk bridge 2 middle', 'silk', 915, 0, 0, [null, 11.2, null], null],
  ['silk bridge 2 to', 'silk', 930, 0, 0, [537.6, 12, 1134.6], 32.5],
  ['kumonosu station', 'silk', 1020, 0, 0, [586.0, 12, 1210.5], 32.5],
  ['buffer', 'silk', 1060, 0, 0, [607.4, 12, 1244.3], 32.5],
];
// The table was worked out along the ground; here s is the rail's own length, a little longer where it climbs or
// sags (main +0.5 m, silk +0.36 m), so points further along sit up to 0.8 m back from the table.
const COORD_TOLERANCE = 1.0;
for (const [label, railId, s, lateral, up, want, heading] of KEY_POINTS) {
  const p = PATHS[railId].point(s, lateral, up);
  const got = [p.x, p.y, p.z];
  // Mid-span sags are points of the Catmull-Rom curve between two control points: checked with the game's Rail.
  if (want[0] === null) {
    report.push(`--  ${label} (${railId} ${s}): control-point height ${p.y.toFixed(2)}, table ${want[1]} (check with Rail)`);
    continue;
  }
  const err = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
  const hd = (((p.h / RAD) % 360) + 360) % 360;
  const hErr = heading === null ? 0 : Math.abs(((hd - heading + 540) % 360) - 180);
  check(err <= COORD_TOLERANCE && hErr <= 0.1, `${label} (${railId} ${s}${lateral ? ` lat ${lateral}` : ''}): [${got.map((v) => v.toFixed(1)).join(', ')}] heading ${hd.toFixed(1)}° (off ${err.toFixed(2)} m)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Rail samples for clearance checks
// ---------------------------------------------------------------------------------------------------------------

const SAMPLES = [];
for (const path of Object.values(PATHS)) {
  for (let s = 0; s <= path.length; s += 1) {
    const q = path.at(s);
    SAMPLES.push({ rail: path.id, s, x: q.x, z: q.z, h: q.h });
  }
}
/** Nearest rail sample (optionally on one rail) with the signed lateral offset (+ right). */
function nearest(x, z, railId = null) {
  let best = null;
  let bd = Infinity;
  for (const q of SAMPLES) {
    if (railId && q.rail !== railId) continue;
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  const lateral = (x - best.x) * -Math.cos(best.h) + (z - best.z) * Math.sin(best.h);
  return { rail: best.rail, s: best.s, d: Math.sqrt(bd), lateral, h: best.h };
}

{
  // Rails that are not next to each other along the course (skip the junction and merge neighbourhoods).
  let min = { d: Infinity };
  for (const a of SAMPLES) {
    if (a.s % 5 !== 0) continue;
    for (const b of SAMPLES) {
      if (b.s % 5 !== 0 || b === a) continue;
      const courseA = a.rail === 'main' ? a.s : a.rail === 'silk' ? 2000 + a.s : null;
      const courseB = b.rail === 'main' ? b.s : b.rail === 'silk' ? 2000 + b.s : null;
      if (courseA === null || courseB === null || Math.abs(courseA - courseB) < 200) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < min.d) min = { d, a, b };
    }
  }
  check(min.d >= 170, `closest non-adjacent main/silk: ${min.d.toFixed(1)} m (${min.a.rail} ${min.a.s} / ${min.b.rail} ${min.b.s}; design 171)`);
  let loopMin = { d: Infinity };
  for (const a of SAMPLES) {
    if (a.rail !== 'loop' || a.s < 45 || a.s > loop.length - 45) continue;
    for (const b of SAMPLES) {
      if (b.rail !== 'silk') continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < loopMin.d) loopMin = { d, a, b };
    }
  }
  check(loopMin.d >= 30, `loop ↔ silk 45 m or more from the junction and the merge: ${loopMin.d.toFixed(1)} m (design about 31)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Stage data (§6)
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'harappa', name: 'はらっぱえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'clover', name: 'クローバーえき', railId: 'main', at: 1070, platformSide: 'left' },
  { id: 'hanabatake', name: 'はなばたけえき', railId: 'main', at: 1960, platformSide: 'left' },
  { id: 'kumonosu', name: 'くものすえき', railId: 'silk', at: 1020, platformSide: 'left' },
];

const GIMMICKS = [
  { type: 'fog', railId: 'main', from: 0, to: 150, params: { near: 15, far: 110, lightFar: 110 } },
  {
    type: 'flower-bridge',
    railId: 'main',
    from: 1360,
    to: 1408,
    params: { butterflyAt: 1250, butterflyLateral: -5, budLateral: -4, rewindAt: 1190 },
  },
  {
    type: 'flower-bridge',
    railId: 'main',
    from: 1790,
    to: 1840,
    params: { butterflyAt: 1560, butterflyLateral: 5, budLateral: 5, size: 1.3, rewindAt: 1500 },
  },
  {
    type: 'flower-bridge',
    railId: 'silk',
    from: 740,
    to: 786,
    params: { butterflyAt: 640, butterflyLateral: -5, budLateral: 4, rewindAt: 580 },
  },
  { type: 'fragile', railId: 'silk', from: 170, to: 220, params: { rewindAt: 110 } },
  { type: 'fragile', railId: 'silk', from: 900, to: 930, params: { rewindAt: 850 } },
  { type: 'camera', railId: 'silk', from: 168, to: 222, params: { mode: 'side' } },
  { type: 'camera', railId: 'loop', from: 10, to: 207, params: { mode: 'top' } },
];

const ACTORS = [
  {
    id: 'batta-1',
    type: 'grasshopper',
    reactsTo: 'none',
    onRail: { railId: 'main', at: 430, lateral: 5, heightFromRail: 2 },
    // After the puddle it hops off onto the leaf on the ground at 575 (its top is level with the rail).
    params: { gapHint: 'fast', off: { at: 575, lateral: 7, heightFromRail: 0 } },
  },
  {
    id: 'batta-2',
    type: 'grasshopper',
    reactsTo: 'whistle',
    onRail: { railId: 'main', at: 760, lateral: 5, heightFromRail: 3 },
    // After the pebble step it hops off onto a leaf on a stalk beside the pebbles, level with the rail.
    params: { gapHint: 'fast', off: { at: 905, lateral: 7, heightFromRail: 0 } },
  },
];

const RECORDS = [
  {
    id: 'watage',
    name: 'たんぽぽの わたげ',
    note: 'かさ みたいに おおきな わたげ',
    requires: null,
    model: 'dandelion-seed',
    onRail: { railId: 'main', at: 250, lateral: -6, heightFromRail: 4 },
  },
  {
    id: 'yotsuba',
    name: 'よつばの クローバー',
    note: 'はっぱの やねの した、ライトで ひかった',
    requires: 'light',
    model: 'clover-four',
    onRail: { railId: 'main', at: 1470, lateral: 9 },
  },
  {
    id: 'mizutamari',
    name: 'みずたまりの そこ',
    note: 'なにか ひかってる… もぐれたら とれるかも',
    requires: 'dive',
    model: 'cloud-crystal',
    onRail: { railId: 'main', at: 545, lateral: -10 },
  },
];

// §12 and 付録 A. Keys whose text equals the built-in default (src/mission/runner.ts) are left out.
const MISSIONS = [
  {
    id: 'm1',
    type: 'deliver',
    title: 'バッタと ぴょーん',
    steps: [{ stationId: 'clover', board: 2, say: 'はなばたけまで おねがい！', reply: 'まかせて！' }],
    lines: {
      start: 'くさの もりを はしって、\nクローバーえきまで いこう！',
      moving: 'そうそう、その ちょうし！',
      gapNear: 'つぎの きれめは {speed} で とべる！',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'クローバーえきだ。ゆっくり！',
      doorOpen: 'のって のって！',
      doorClosed: 'しゅっぱつ しんこう！',
      complete: 'バッタさんと とべたね！',
    },
    hints: [{ railId: 'main', at: 155, text: 'わあ… くさの もりだ！' }],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'ちょうちょの はなばし',
    steps: [{ stationId: 'hanabatake', alight: 2, say: 'せんろが くもの いとに なってたよ', reply: 'くもの いと？！' }],
    lines: {
      start: 'ながれる みずに、はしが ない…\nちょうちょに てつだって もらおう！',
      moving: 'そうそう、その ちょうし！',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'はなばたけえきだ。ゆっくり！',
      doorOpen: 'ついたよ！',
      complete: 'ちょうちょさん、ありがとう！',
    },
    hints: [{ railId: 'main', at: 1415, text: 'はっぱの やねだ！ ライトで てらして みよう' }],
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'くもの いとの せんろ',
    steps: [{ stationId: 'kumonosu' }],
    lines: {
      start: 'くもの いとの せんろ… たしかめに いこう！\nどこへ つづいてるのかな？',
      moving: 'そうそう、その ちょうし！',
      signNear: 'あれ？ ひょうしきが さかさま…',
      signRevealed: 'ほんとうの いとが ひかった！',
      butterflyNear: 'また ちょうちょ！ ライトで よぼう',
      butterflyFollow: 'ライトが ついてるから、すぐ きた！',
      stationNear: 'くものすえきだ。ゆっくり！',
      complete: 'ついた！ ……あれ？',
    },
    hints: [
      { railId: 'silk', at: 10, text: 'ほんとだ！ せんろが いとに なってる！' },
      { railId: 'loop', at: 20, text: 'あれれ？ ぐるっと まわってる…' },
      { railId: 'loop', at: 200, text: 'もどっちゃった！ ライトで みよう' },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§4.5, §11)
// ---------------------------------------------------------------------------------------------------------------

/** §4.5: the grass and flowers that grow up around the train when Piko switches on the shrinking device. */
const GROWING = [
  // [id, model, main s, lateral, wave]
  ['kusa-1', 'grass-blade', 58, 11, 1],
  ['kusa-2', 'grass-blade', 66, -13, 1],
  ['hana-1', 'meadow-flower', 80, 16, 1],
  ['kusa-3', 'grass-blade', 30, 14, 2],
  ['kusa-4', 'grass-blade', 90, -18, 2],
  ['kusa-5', 'grass-blade', 100, 22, 2],
  ['kusa-6', 'grass-blade', 15, 24, 3],
  ['hana-2', 'meadow-flower', 50, -24, 3],
  ['kusa-7', 'grass-blade', 110, -30, 3],
  ['kusa-8', 'grass-blade', 40, 34, 4],
  ['hana-3', 'meadow-flower', 95, -36, 4],
];
const growAt = (s, lateral, heightFromRail) => ({ railId: 'main', at: s, lateral, heightFromRail });

const opening = [
  // Hidden under the ground (−0.6): grass is 38 m tall, flowers 30 m.
  ...GROWING.map(([id, model, s, lateral]) => ({ spawn: id, model, onRail: growAt(s, lateral, model === 'grass-blade' ? -39 : -31) })),
  { caption: 'むしのはらっぱ', seconds: 2.5 },
  { camera: 'chase' },
  { say: 'けいじばんに おねがいが きてる' },
  { say: 'はらっぱの せんろが、へんなんだって', emote: 'tilt' },
  { say: 'むしの せかいは、とっても ちいさい' },
  { say: 'ちいさく なる そうち、スイッチ オン！', emote: 'jump' },
];
for (let wave = 1; wave <= 4; wave++) {
  // Four waves 0.35 s apart, each growing for 1 s: about 2 s in all.
  for (const [id, , s, lateral] of GROWING.filter((g) => g[4] === wave)) {
    opening.push({ move: id, onRail: growAt(s, lateral, GROUND_Y), seconds: 1, nowait: true });
  }
  opening.push({ wait: wave < 4 ? 0.35 : 1 });
}
opening.push(
  { say: 'わわっ、ちいさく なっちゃった！', emote: 'jump' },
  { say: 'くさが、きみたいに おおきい！', emote: 'cheer' },
  { camera: 'cab' },
);

// Sakasa hangs just under the seed of the dandelion fluff (the seed is at the model's origin, Sakasa is 1.4 m tall).
const SAKASA_BELOW_SEED = 1.5;
const ending = [
  { camera: 'chase' },
  { say: 'みて！ くもの すが、せんろで できてる！', emote: 'jump' },
  { spawn: 'kumo', model: 'spider', onRail: { railId: 'silk', at: 1100, lateral: 10, heightFromRail: 32 }, rotationY: 180 },
  { say: 'かぜで すが やぶれて、こまってたの', who: 'passenger', name: 'くもさん' },
  { say: 'ぐるぐる ぼうしの こが、なおして くれたの', who: 'passenger', name: 'くもさん' },
  { wait: 0.8 },
  { say: 'せんろで すを はって、いとで せんろを…', emote: 'tilt' },
  { say: 'ぎゃくに はりかえたんだ！', emote: 'jump' },
  { spawn: 'watage', model: 'dandelion-seed', onRail: { railId: 'silk', at: 1085, lateral: -18, heightFromRail: 16 } },
  { spawn: 'sakasa', model: 'amanojaku', onRail: { railId: 'silk', at: 1085, lateral: -18, heightFromRail: 16 - SAKASA_BELOW_SEED }, rotationY: 180 },
  { say: 'さようなら！', who: 'amanojaku' },
  { say: 'サカサ！ くもさんが ありがとうって！' },
  { wait: 0.8 },
  { say: '…こ、こんにちは〜！', who: 'amanojaku' },
  { move: 'watage', onRail: { railId: 'silk', at: 1300, lateral: -60, heightFromRail: 90 }, seconds: 5, nowait: true },
  { move: 'sakasa', onRail: { railId: 'silk', at: 1300, lateral: -60, heightFromRail: 90 - SAKASA_BELOW_SEED }, seconds: 5 },
  { remove: 'watage' },
  { remove: 'sakasa' },
  { say: 'サカサって、ほんとは やさしいのかも', emote: 'cheer' },
  { say: 'あっちは… けむりの でてる しま？', emote: 'tilt' },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§5 "置き方の きまり")
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
const rand = mulberry32(22);
const between = (a, b) => a + (b - a) * rand();

/** Footprint radius (m) at scale 1, for keeping props apart. */
const FOOTPRINT = { 'grass-blade': 1.5, 'meadow-flower': 6, clover: 7.5, rock: 1, 'water-strip': 30, 'leaf-pad': 8, boulder: 1.1 };

const props = [];
/** Things random props keep away from: circles { x, z, r } and rectangles (water). */
const keepOut = [];
const water = [];

function addOnRail(model, railId, at, { lateral = 0, height, rotationY, rotation, scale = 1, keep = true } = {}) {
  const onRail = { railId, at: round(at) };
  if (lateral) onRail.lateral = round(lateral);
  if (height !== undefined) onRail.heightFromRail = round(height, 2);
  const p = { model, onRail };
  if (rotation) p.rotation = rotation;
  else if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
  const q = PATHS[railId].point(at, lateral);
  if (keep) keepOut.push({ x: q.x, z: q.z, r: (FOOTPRINT[model] ?? 2) * scale });
  return { ...q, h: q.h + (rotationY ?? 0) * RAD };
}

function addWorld(model, [x, y, z], { rotationY, scale = 1, keep = true } = {}) {
  const p = { model, position: [round(x), round(y, 2), round(z)] };
  if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
  if (keep) keepOut.push({ x, z, r: (FOOTPRINT[model] ?? 2) * scale });
}

/** A water surface (water-strip is 60 × 0.1 × 40 m): also a rectangle random props stay out of. */
function addWater(railId, at, { lateral = 0, rotationY = 0, scale = 1, height } = {}) {
  const q = addOnRail('water-strip', railId, at, { lateral, rotationY, scale, height, keep: false });
  water.push({ x: q.x, z: q.z, h: q.h, hx: 30 * scale + 4, hz: 20 * scale + 4 });
}

const inWater = (x, z) =>
  water.some((w) => {
    const dx = x - w.x;
    const dz = z - w.z;
    const along = dx * Math.sin(w.h) + dz * Math.cos(w.h);
    const across = dx * Math.cos(w.h) - dz * Math.sin(w.h);
    return Math.abs(along) < w.hz && Math.abs(across) < w.hx;
  });

// --- The grass tunnel (main 180–260): grass 7 m either side every 8 m, leaning 30° in so they cross overhead.
for (let s = 180, k = 0; s <= 260; s += 8, k++) {
  // Model +X is the rail's left, so a positive turn about Z leans a blade to the right (in over the track).
  addOnRail('grass-blade', 'main', s, { lateral: -7, rotation: [0, 0, 30], scale: k % 2 ? 0.95 : 0.85 });
  addOnRail('grass-blade', 'main', s, { lateral: 7, rotation: [0, 0, -30], scale: k % 2 ? 0.85 : 0.95 });
}

// --- The puddle (main 520–560): water, three floating leaves that catch a train, the "?" record under the water.
addWater('main', 540, { scale: 1.1 });
for (const [s, lateral, rotationY] of [
  [528, 3, 20],
  [537, -22, -35],
  [552, 17, 60],
]) {
  // leaf-pad is 1.2 m high at scale 1: its top just above the water.
  addOnRail('leaf-pad', 'main', s, { lateral, rotationY, scale: 0.8, height: GROUND_Y - 0.96 + 0.25 });
}

// --- Grasshopper leaves: where they sit (a small leaf on a thin stalk) and where batta-1 hops off (575, right 7).
for (const a of ACTORS) {
  const { at, lateral, heightFromRail } = a.onRail;
  addOnRail('leaf-pad', 'main', at, { lateral, rotationY: 90, scale: 0.35, height: heightFromRail - 0.42 });
  const railY = main.at(at).y;
  addOnRail('grass-blade', 'main', at, { lateral, scale: round((railY + heightFromRail - GROUND_Y) / 38, 3), keep: false });
}
addOnRail('leaf-pad', 'main', 575, { lateral: 7, rotationY: 90, scale: 0.5 });
// batta-2's landing leaf beside the pebbles (the rail is 3 m up there): a small leaf on a stalk, top level with the rail.
addOnRail('leaf-pad', 'main', 905, { lateral: 7, rotationY: 90, scale: 0.35, height: -0.42 });
addOnRail('grass-blade', 'main', 905, { lateral: 7, scale: round((main.at(905).y - GROUND_Y) / 38, 3), keep: false });

// --- The pebble step (850–890, the far side 3 m up) and the pebbles the rail runs over (890–930).
for (const s of [898, 920]) addOnRail('boulder', 'main', s, { scale: 7, height: -0.3 - 2.2 * 7, rotationY: s * 7 });

// --- Clover leaves under the rail from the pebbles to past the clover station (the rail is up at 1.5 m there).
for (const [s, rotationY] of [
  [950, 10],
  [975, 70],
  [1000, 130],
  [1025, 40],
  [1050, 100],
  [1075, 160],
  [1100, 20],
]) {
  addOnRail('clover', 'main', s, { lateral: -4, rotationY, scale: 2, height: -0.3 - 1.5 * 2 });
}

// --- Stream 1 (main 1360–1408) and stream 2 (1790–1840): bands of water across the rail.
// Neighbouring strips overlap a little: every other one sits 2 cm higher so they do not flicker.
[-102, -34, 34, 102].forEach((lateral, i) => addWater('main', 1384, { lateral, scale: 1.2, height: i % 2 ? -0.58 : -0.6 }));
[-106.5, -35.5, 35.5, 106.5].forEach((lateral, i) => addWater('main', 1815, { lateral, scale: 1.25, height: i % 2 ? -0.58 : -0.6 }));

// --- The leaf roof (main 1440–1500): two big leaves 9 m up, held by two grass stalks. The four-leaf clover is under it.
addOnRail('leaf-pad', 'main', 1456, { rotationY: 90, scale: 2.4, height: 9 });
addOnRail('leaf-pad', 'main', 1486, { rotationY: 90, scale: 2.4, height: 9.3 });
addOnRail('grass-blade', 'main', 1445, { lateral: -9, scale: 0.25, rotationY: 180 });
addOnRail('grass-blade', 'main', 1495, { lateral: 9, scale: 0.25 });

// --- The S bends (1500–1750): tall flowers every 20 m on both sides.
for (let s = 1510; s <= 1745; s += 20) {
  // Staggered by 10 m between the two sides.
  addOnRail('meadow-flower', 'main', s, { lateral: -11.5, scale: round(between(0.78, 0.94), 2), rotationY: round(rand() * 360) });
  addOnRail('meadow-flower', 'main', Math.min(s + 10, 1745), { lateral: 11.5, scale: round(between(0.78, 0.94), 2), rotationY: round(rand() * 360) });
}

// --- The flower-bed station (main 1960, 6 m up): leaf floors on flowers.
addOnRail('leaf-pad', 'main', 1942, { lateral: -3, rotationY: 90, scale: 3, height: -0.3 - 1.2 * 3 });
addOnRail('leaf-pad', 'main', 1984, { rotationY: 90, scale: 2.6, height: -0.35 - 1.2 * 2.6 });
for (const [s, lateral, scale] of [
  [1924, -13, 0.24],
  [1946, -14, 0.28],
  [1968, -13, 0.22],
  [1930, 9, 0.26],
  [1952, 10, 0.22],
  [1990, 9, 0.25],
]) {
  addOnRail('meadow-flower', 'main', s, { lateral, scale, rotationY: round(rand() * 360) });
}

// --- The silk junction stands on a big leaf (silk 400–470, the sign's footing).
addOnRail('leaf-pad', 'silk', 435, { lateral: 2, rotationY: 90, scale: 4, height: -0.3 - 1.2 * 4 });

// --- Under flower bridge 3 (the broken silk, 740–786): clover on the ground catches a train.
addOnRail('clover', 'silk', 752, { scale: 2, rotationY: 15 });
addOnRail('clover', 'silk', 776, { scale: 2, rotationY: 75 });

// --- The spider station (silk 1020, 12 m up): a big leaf platform.
addOnRail('leaf-pad', 'silk', 1000, { lateral: -3, rotationY: 90, scale: 3, height: -0.3 - 1.2 * 3 });

// --- Grass holding up the silk: every 40 m on both sides where the silk's support threads end (rail-mesh.ts:
// 9 m out, 14 m up), and at both ends of the silk bridges. Nothing within 25 m left of silk bridge 1 (side camera).
const SUPPORT_LATERAL = 10;
const supports = [];
const addSupport = (railId, s, side) => {
  const q = PATHS[railId].point(s, side * SUPPORT_LATERAL);
  // Skip one that would stand on another silk line or next to a support already there.
  const other = nearest(q.x, q.z);
  if (other.rail !== railId && other.d < 6) return;
  if (supports.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 6)) return;
  supports.push(q);
  addOnRail('grass-blade', railId, s, { lateral: side * SUPPORT_LATERAL, scale: round(between(0.9, 1.1), 2), rotationY: round(between(-40, 40)) });
};
const FRAGILE_SPANS = GIMMICKS.filter((g) => g.type === 'fragile');
const inFragile = (railId, s) => FRAGILE_SPANS.some((g) => g.railId === railId && s > g.from && s < g.to);
const sideCameraClear = (railId, s, side) => railId === 'silk' && side < 0 && s >= 145 && s <= 245;
for (const path of [silk, loop]) {
  const spots = [];
  for (let s = 40; s < path.length; s += 40) if (!inFragile(path.id, s)) spots.push(s);
  for (const g of FRAGILE_SPANS) if (g.railId === path.id) spots.push(g.from, g.to);
  for (const s of spots.sort((a, b) => a - b)) {
    for (const side of [-1, 1]) if (!sideCameraClear(path.id, s, side)) addSupport(path.id, s, side);
  }
}

// --- The spider's web of rails, 40 m past the buffer, between two big grass blades; the far smoke of the next island.
const bufferEnd = silk.at(silk.length);
const dir = { x: Math.sin(bufferEnd.h), z: Math.cos(bufferEnd.h) };
const right = { x: -Math.cos(bufferEnd.h), z: Math.sin(bufferEnd.h) };
const web = { x: bufferEnd.x + dir.x * 40, z: bufferEnd.z + dir.z * 40 };
const webFacing = bufferEnd.h / RAD + 180;
addWorld('rail-web', [web.x, 12, web.z], { rotationY: webFacing });
keepOut.push({ x: web.x, z: web.z, r: 40 });
for (const side of [-1, 1]) {
  addWorld('grass-blade', [web.x + right.x * 22 * side, GROUND_Y, web.z + right.z * 22 * side], { scale: 1.2, rotationY: webFacing });
}
const left = { x: -right.x, z: -right.z };
const smoke = { x: web.x + dir.x * 150 + left.x * 50, z: web.z + dir.z * 150 + left.z * 50 };
[
  [70, 2.5],
  [105, 3],
  [140, 3.6],
].forEach(([y, scale], i) => addWorld('cloud-b', [smoke.x + i * 2, y, smoke.z - i * 2], { scale, rotationY: i * 50, keep: false }));

check(Math.hypot(web.x - 628.9, web.z - 1278.0) < COORD_TOLERANCE, `web [${web.x.toFixed(1)}, 12, ${web.z.toFixed(1)}] rotationY ${webFacing.toFixed(1)} (table [628.9, 12, 1278.0], 212.5)`);
check(Math.hypot(smoke.x - 751.6, smoke.z - 1377.7) < COORD_TOLERANCE, `smoke [${smoke.x.toFixed(1)}, *, ${smoke.z.toFixed(1)}] (table [751.6, *, 1377.7])`);
{
  // No butterfly or grasshopper within 300 m of the web.
  const near = [];
  for (const g of GIMMICKS.filter((x) => x.type === 'flower-bridge')) {
    const q = PATHS[g.railId].point(g.params.butterflyAt, g.params.butterflyLateral);
    near.push(['butterfly@' + g.railId + ' ' + g.params.butterflyAt, Math.hypot(q.x - web.x, q.z - web.z)]);
  }
  for (const a of ACTORS) {
    const q = PATHS[a.onRail.railId].point(a.onRail.at, a.onRail.lateral);
    near.push([a.id, Math.hypot(q.x - web.x, q.z - web.z)]);
  }
  const [who, d] = near.sort((a, b) => a[1] - b[1])[0];
  check(d >= 300, `nearest butterfly/grasshopper to the web: ${who} at ${d.toFixed(0)} m (≥ 300)`);
}

// --- Scattered grass, flowers, clover, pebbles and small puddles (seeded).
const PLATFORM_ZONE = STATIONS.map((st) => ({ railId: st.railId, from: st.at - 50, to: st.at + 10 }));
const FIXED = Object.fromEntries(['grass-blade', 'meadow-flower', 'clover', 'rock', 'water-strip'].map((m) => [m, props.filter((p) => p.model === m).length]));
const scattered = [];

/** Can a random prop of footprint `r` stand at (x, z)? */
function freeSpot(x, z, r, minRail) {
  const n = nearest(x, z);
  if (n.d < minRail) return false;
  // Platforms: 12 m clear.
  if (n.d < Math.max(12, minRail) && PLATFORM_ZONE.some((p) => p.railId === n.rail && n.s >= p.from && n.s <= p.to)) return false;
  // The clearing where the story starts (main 0–130, the grass grows there in the opening).
  const m = nearest(x, z, 'main');
  if (m.s < 130 && m.d < 140) return false;
  // The side camera over silk bridge 1 looks from 22 m left of the silk.
  const k = nearest(x, z, 'silk');
  if (k.s >= 145 && k.s <= 245 && k.lateral < 0 && k.lateral > -30) return false;
  // Beyond the buffer, towards the web (the ending looks that way).
  const along = (x - bufferEnd.x) * dir.x + (z - bufferEnd.z) * dir.z;
  const across = (x - bufferEnd.x) * right.x + (z - bufferEnd.z) * right.z;
  if (along > -40 && along < 80 && Math.abs(across) < 45) return false;
  if (inWater(x, z)) return false;
  if (keepOut.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) return false;
  if (scattered.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.9 + 2)) return false;
  return true;
}

/** Picks a spot beside a rail: `zones` = [[railId, from, to, weight]], lateral `lat` = [min, max] m. */
function scatter(model, count, { zones, lat, scale: [s0, s1], clear }) {
  const total = zones.reduce((a, z) => a + z[3] * (z[2] - z[1]), 0);
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 400; tries++) {
    let pick = rand() * total;
    let zone = zones[0];
    for (const z of zones) {
      pick -= z[3] * (z[2] - z[1]);
      if (pick <= 0) {
        zone = z;
        break;
      }
    }
    const [railId, from, to] = zone;
    const s = between(from, to);
    const side = rand() < 0.5 ? -1 : 1;
    const scale = round(between(s0, s1), 2);
    const r = (FOOTPRINT[model] ?? 2) * scale;
    const lateral = side * between(Math.max(lat[0], clear(r)), lat[1]);
    const q = PATHS[railId].point(s, lateral);
    if (!freeSpot(q.x, q.z, r, clear(r))) continue;
    scattered.push({ x: q.x, z: q.z, r });
    if (model === 'water-strip') {
      addWorld(model, [q.x, GROUND_Y + 0.02, q.z], { scale, rotationY: round(rand() * 360), keep: false });
      water.push({ x: q.x, z: q.z, h: 0, hx: 30 * scale + 2, hz: 30 * scale + 2 });
    } else {
      addWorld(model, [q.x, GROUND_Y, q.z], { scale, rotationY: round(rand() * 360), keep: false });
    }
    placed++;
  }
  if (placed < count) problems.push(`${model}: placed ${placed} of ${count}`);
  return placed;
}

const ALL = [
  ['main', 130, 2000, 1],
  ['silk', 0, 1060, 1],
];
const M2 = [
  ['main', 130, 1070, 0.35],
  ['main', 1070, 1960, 1.6],
  ['silk', 0, 1060, 0.35],
];
// Small puddles first (they keep the others out), then the big things, then the grass between them.
scatter('water-strip', 12 - FIXED['water-strip'], { zones: [['main', 150, 1300, 1]], lat: [30, 60], scale: [0.25, 0.4], clear: (r) => r + 12 });
scatter('clover', 40 - FIXED.clover, { zones: M2, lat: [12, 45], scale: [0.7, 1.5], clear: (r) => r + 4 });
// Flower heads are 3–6 m across and up at the silk's height: keep them 5 m off the track.
scatter('meadow-flower', 80 - FIXED['meadow-flower'], { zones: M2, lat: [10, 45], scale: [0.45, 1.0], clear: (r) => Math.max(10, r + 5) });
scatter('rock', 20, { zones: [['main', 130, 1100, 1], ['silk', 0, 1060, 0.5]], lat: [10, 45], scale: [2.5, 6], clear: (r) => r + 8 });
scatter('grass-blade', 500 - FIXED['grass-blade'], { zones: ALL, lat: [10, 45], scale: [0.7, 1.3], clear: () => 10 });

// ---------------------------------------------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '2-2',
  title: 'むしのはらっぱ',
  chapter: 2,
  unlock: { requires: ['2-1'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#6ec3f2', bottom: '#f4f9dc' },
    fog: { color: '#eef4d6', near: 140, far: 440 },
    lighting: 'day',
    ground: { y: GROUND_Y, size: 3600, color: '#86a24e' },
    bgm: 'meadow',
    fall: 'leaf',
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    {
      id: 'main',
      points: main.points(),
      gaps: [
        { from: 340, to: 352, hint: 'normal' },
        { from: 520, to: 560, pit: false, rewind: { railId: 'main', at: 370 } },
        // Rewind 100 m before batta-2's leaf: the "whistle for it" line (90 m before) comes before the glow (60 m).
        { from: 850, to: 890, rewind: { railId: 'main', at: 660 } },
      ],
      end: { type: 'merge', railId: 'silk', at: 0 },
    },
    { id: 'silk', look: 'silk', points: silk.points(), end: { type: 'buffer' } },
    { id: 'loop', look: 'silk', points: loop.points(), end: { type: 'merge', railId: 'silk', at: LOOP_MERGE_AT } },
  ],
  junctions: [{ id: 'ito-wakare', railId: 'silk', at: JUNCTION_AT, left: 'silk', right: 'loop', default: 'right', signReversed: true }],
  stations: STATIONS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: { opening, ending },
};

// ---------------------------------------------------------------------------------------------------------------
// Output
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
    // Rail points: five to a line.
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

const counts = {};
for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
report.push(`points: main ${stage.rails[0].points.length}, silk ${stage.rails[1].points.length}, loop ${stage.rails[2].points.length}`);
console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}
