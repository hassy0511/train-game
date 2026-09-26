#!/usr/bin/env node
/**
 * Stage 2-3 "かざんのしま": builds src/stages/2-3.json from docs/PHASE6_DESIGN.md, second half (§4–§12, 付録 A).
 *
 * The rails follow §6.1: the main line and the lookout branch hug the volcano's cone 2 m above it, stepping 1 m at
 * a time (what the climb and the change of radius take out of each metre goes round the cone); the downhill line
 * is straights and arcs with its own height profile. Every step is 1 m of rail (3D), so `s` here is the rail's own
 * length, what the game's Catmull-Rom arc length measures. The JSON gets a point every 10 m (5 m in tight curves).
 * Props, actors and records are placed by (rail, s, lateral); ferns, cycads and rocks are scattered with a seeded
 * pseudo-random generator, so every run writes the same file.
 *
 *   node scripts/layout-2-3.mjs         write src/stages/2-3.json and print the checks
 *   node scripts/layout-2-3.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 *
 * Conventions: three.js world, y up. Headings here are atan2(dz, dx) as in the design's tables; the train runs
 * clockwise seen from above with the volcano on its left. `lateral` is positive to the right of the direction of
 * travel (the game's frame.right), i.e. (−sin h, cos h) for heading h.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/2-3.json');
const DRY = process.argv.includes('--dry');

const RAD = Math.PI / 180;
const round = (v, digits = 1) => {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};

// ---------------------------------------------------------------------------------------------------------------
// The volcano (§6.1, §6.5)
// ---------------------------------------------------------------------------------------------------------------

/** Foot radius (y 0), rim radius, rim height, crater floor. */
const R0 = 380;
const RR = 100;
const HR = 100;
const CRATER = 86;
const CONE_SLOPE = HR / (R0 - RR);
/** The main line and the branch run this far above the cone. */
const CLEAR = 2;

/** Height of the island's surface at radius r (the sea and the beach are 0). */
const cone = (r) => (r >= R0 ? 0 : r >= RR ? (HR * (R0 - r)) / (R0 - RR) : CRATER);
const coneAt = (x, z) => cone(Math.hypot(x, z));
/** Radius where the rail at height y hugs the cone. */
const hugR = (y) => R0 - (y - CLEAR) / CONE_SLOPE;

/**
 * A grade profile from `[length, grade]` sections (grade = climb per metre of rail); each change is spread
 * linearly over `ramp` m centred on the boundary.
 */
function profile(sections, ramp) {
  const bounds = [];
  let s = 0;
  for (const [len, g] of sections) {
    bounds.push([s, s + len, g]);
    s += len;
  }
  const grade = (x) => {
    for (let i = 0; i < bounds.length; i++) {
      const [a, b, g] = bounds[i];
      if ((a <= x && x < b) || (i === bounds.length - 1 && x >= a)) {
        if (i > 0 && x < a + ramp / 2) {
          const gp = bounds[i - 1][2];
          return gp + (g - gp) * ((x - (a - ramp / 2)) / ramp);
        }
        if (i < bounds.length - 1 && x > b - ramp / 2) {
          const gn = bounds[i + 1][2];
          return g + (gn - g) * ((x - (b - ramp / 2)) / ramp);
        }
        return g;
      }
    }
    return bounds[bounds.length - 1][2];
  };
  return { grade, total: s };
}

/**
 * Walks round the cone 1 m of rail at a time: the height changes by the grade, the radius follows `radiusAt`, and
 * what is left of the metre goes clockwise (θ decreases). Returns one { r, th, y } per metre.
 */
function walkCone(sections, ramp, radiusAt, r0, th0, y0) {
  const { grade, total } = profile(sections, ramp);
  const out = [];
  let r = r0;
  let th = th0;
  let y = y0;
  for (let i = 0; i <= Math.round(total); i++) {
    out.push({ r, th, y });
    const y1 = y + grade(i);
    const r1 = radiusAt(i + 1, y1);
    const dy = y1 - y;
    const dr = r1 - r;
    const horiz = Math.sqrt(Math.max(1e-9, 1 - dy * dy));
    const tang = Math.sqrt(Math.max(1e-9, horiz * horiz - dr * dr));
    th -= tang / ((r + r1) / 2);
    r = r1;
    y = y1;
  }
  return out;
}

const polarToPoint = ({ r, th, y }, s) => ({ x: r * Math.cos(th), y, z: r * Math.sin(th), s });

// ---------------------------------------------------------------------------------------------------------------
// Rails (§6.2–§6.4)
// ---------------------------------------------------------------------------------------------------------------

/** §6.2: [length, grade] of the main line, 1,830 m. */
const MAIN_SECTIONS = [
  [150, 0], //       0–150  the harbour quay (みなとえき 45)
  [110, 0.073], //   150–260 gentle climb
  [70, 0.22], //     260–330 steep 1 (one rocket)
  [30, 0], //        330–360 top (the sea comes into view)
  [80, -0.15], //    360–440 slide 1
  [30, 0], //        440–470 dip
  [150, 0.22], //    470–620 steep 2 (two rockets)
  [260, 0], //       620–880 the rock shelf (なかやまえき 820)
  [280, 0.055], //   880–1160 the rock path
  [200, 0], //       1160–1360 junction 1185, the branch merges back at 1358
  [70, 0.05], //     1360–1430 the birds' cliff (the rocket rests)
  [30, 0], //        1430–1460
  [150, 0.22], //    1460–1610 steep 3 (two rockets)
  [220, 0], //       1610–1830 the crater rim (かこうえき 1810)
];
/** The quay is a circle of this radius round the volcano; 150–230 eases onto the cone. */
const R_QUAY = 392;
const mainRadius = (s, y) => {
  if (s < 150) return R_QUAY;
  if (s < 230) {
    const t = (s - 150) / 80;
    const k = t * t * (3 - 2 * t);
    return R_QUAY * (1 - k) + hugR(y) * k;
  }
  return hugR(y);
};
const mainPolar = walkCone(MAIN_SECTIONS, 10, mainRadius, R_QUAY, -90 * RAD, 2);

/** §6.3: the lookout branch leaves main here; its slide length is solved so it comes back level with main. */
const JUNCTION_AT = 1185;
function branchFor(slideLength) {
  const sections = [
    [12, 0], //            0–12   leaving main
    [70, 0.22], //         12–82  steep (one rocket; the slope gimmick is the same stretch)
    [30, 0], //            82–112 the lookout (steam)
    [slideLength, -0.25], // 112–174 slide
    [15, 0], //            174–189 back to main
  ];
  const p = mainPolar[JUNCTION_AT];
  return walkCone(sections, 12, (_s, y) => hugR(y), p.r, p.th, p.y);
}
let branchPolar = null;
let branchDy = Infinity;
for (let len = 40; len < 100; len++) {
  const b = branchFor(len);
  const dy = b[b.length - 1].y - mainPolar[JUNCTION_AT].y;
  if (Math.abs(dy) < Math.abs(branchDy)) {
    branchDy = dy;
    branchPolar = b;
  }
}
const branchEnd = branchPolar[branchPolar.length - 1];
let MERGE_AT = JUNCTION_AT;
for (let i = JUNCTION_AT; i < mainPolar.length; i++) {
  if (Math.abs(mainPolar[i].th - branchEnd.th) < Math.abs(mainPolar[MERGE_AT].th - branchEnd.th)) MERGE_AT = i;
}

const mainPts = mainPolar.map((p, i) => polarToPoint(p, i));
const branchPts = branchPolar.map((p, i) => polarToPoint(p, i));
// §6.3 footnote: the walk ends 0.3 m off main; the last point is main's point at the merge.
const branchEndOff = Math.hypot(branchPts[branchPts.length - 1].x - mainPts[MERGE_AT].x, branchPts[branchPts.length - 1].z - mainPts[MERGE_AT].z);
branchPts[branchPts.length - 1] = { ...mainPts[MERGE_AT], s: branchPts.length - 1 };

/** Heading (atan2(dz, dx)) of a polyline at index i, from its neighbours. */
function polyHeading(pts, i) {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  return Math.atan2(b.z - a.z, b.x - a.x);
}

/** §6.4: the downhill line, straights and arcs ('R' turns right = heading grows, 'L' left), with its own profile. */
const KUDARI_PROFILE = [
  [40, 0], //       0–40    the rim, turning out
  [200, -0.2], //   40–240  slide 2
  [150, -0.065], // 240–390 the ridge down to the sea
  [900, 0], //      390–    the mesa, the old bridge, the cape (48.6)
];
const KUDARI_SEGMENTS = [
  ['R', 60, 90], //  0–94    off the rim
  ['S', 416], //     94–510  slide 2, the ridge, onto the mesa (かんそくじょえき 450)
  ['L', 40, 165], // 510–625 round the far end of the mesa
  ['S', 120], //     625–745 back along the mesa (the rocket glows 640–690)
  ['S', 140], //     745–885 the old bridge
  ['S', 12], //      885–897 the bridge head on the cape
  ['R', 60, 60], //  897–960 round the cape
  ['S', 95], //      960–1055 the cape (みさきえき 1035), buffer
];
function walkPath(start, heading, segments, grade) {
  let { x, y, z } = start;
  let h = heading;
  let s = 0;
  const pts = [{ x, y, z, s }];
  for (const seg of segments) {
    if (seg[0] === 'S') {
      for (let k = 0; k < Math.round(seg[1]); k++) {
        const g = grade(s);
        const f = Math.sqrt(1 - g * g);
        x += f * Math.cos(h);
        z += f * Math.sin(h);
        y += g;
        s += 1;
        pts.push({ x, y, z, s });
      }
    } else {
      const [, radius, deg] = seg;
      const len = radius * deg * RAD;
      const n = Math.round(len);
      const dth = (deg * RAD) / n;
      const step = len / n;
      const sign = seg[0] === 'L' ? -1 : 1;
      for (let k = 0; k < n; k++) {
        const g = grade(s);
        const f = Math.sqrt(1 - g * g);
        h += (sign * dth) / 2;
        x += f * Math.cos(h) * step;
        z += f * Math.sin(h) * step;
        h += (sign * dth) / 2;
        y += g * step;
        s += step;
        pts.push({ x, y, z, s });
      }
    }
  }
  return pts;
}
const kudariPts = walkPath(mainPts[mainPts.length - 1], polyHeading(mainPts, mainPts.length - 1), KUDARI_SEGMENTS, profile(KUDARI_PROFILE, 12).grade);

/** A rail's 1 m polyline with lookups by s. */
class Line {
  constructor(id, pts) {
    this.id = id;
    this.pts = pts;
    this.length = pts[pts.length - 1].s;
  }

  /** Position and heading at s (interpolated; straight on beyond either end). */
  at(s) {
    const pts = this.pts;
    const c = Math.min(Math.max(s, 0), this.length);
    let i = Math.min(Math.floor(c), pts.length - 2);
    while (i > 0 && pts[i].s > c) i--;
    while (i < pts.length - 2 && pts[i + 1].s < c) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const t = (c - a.s) / (b.s - a.s);
    const h = Math.atan2(b.z - a.z, b.x - a.x);
    const over = s - c;
    return {
      x: a.x + (b.x - a.x) * t + Math.cos(h) * over,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t + Math.sin(h) * over,
      h,
    };
  }

  /** World point `lateral` m to the right of and `up` m above the rail at s. */
  point(s, lateral = 0, up = 0) {
    const q = this.at(s);
    return { x: q.x - Math.sin(q.h) * lateral, y: q.y + up, z: q.z + Math.cos(q.h) * lateral, h: q.h };
  }

  /** JSON control points: every 10 m, every 5 m where the rail turns tighter than 60 m. */
  points() {
    const out = [0];
    let s = 0;
    while (s < this.length - 1e-6) {
      const turn = Math.abs(angleDiff(this.at(Math.min(s + 10, this.length)).h, this.at(s).h)) / RAD;
      // 10 m on a 60 m radius turns 9.5°.
      const step = turn > 9.5 ? 5 : 10;
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

const main = new Line('main', mainPts);
const miharashi = new Line('miharashi', branchPts);
const kudari = new Line('kudari', kudariPts);
const LINES = { main, miharashi, kudari };

// ---------------------------------------------------------------------------------------------------------------
// Checks against the design tables (§6.2–§6.4, §6.6)
// ---------------------------------------------------------------------------------------------------------------

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

check(Math.abs(main.length - 1830) < 1e-6, `main length ${main.length.toFixed(2)} (table 1830)`);
check(Math.abs(miharashi.length - 189) < 1e-6, `miharashi length ${miharashi.length.toFixed(2)} (table 189)`);
check(Math.abs(kudari.length - 1055) < 0.5, `kudari length ${kudari.length.toFixed(2)} (table 1,055)`);
check(MERGE_AT === 1358, `miharashi merges at main ${MERGE_AT} (table 1358), height off ${branchDy.toFixed(2)} m, end moved ${branchEndOff.toFixed(2)} m onto main`);

/** [label, rail, s, [x, z] or [x, y, z] from the tables]. The tables give whole metres. */
const KEY_POINTS = [
  ['start', 'main', 0, [0, 2, -392]],
  ['quay end', 'main', 150, [-146, -364]],
  ['steep 1 foot', 'main', 260, [-218, 10, -283]],
  ['steep 1 top', 'main', 330, [-230, 25, -216]],
  ['slide 1 top', 'main', 360, [-249, 25, -193]],
  ['slide 1 foot', 'main', 440, [-314, 14, -148]],
  ['steep 2 foot', 'main', 470, [-326, 14, -121]],
  ['steep 2 top', 'main', 620, [-256, 46, 7]],
  ['shelf end', 'main', 880, [-129, 46, 221]],
  ['rock path end', 'main', 1160, [130, 62, 169]],
  ['birds cliff', 'main', 1360, [212, 62, -6]],
  ['birds cliff end', 'main', 1430, [190, 65, -72]],
  ['steep 3 foot', 'main', 1460, [177, 65, -98]],
  ['steep 3 top', 'main', 1610, [34, 98, -106]],
  ['main end', 'main', 1830, [-110, 98, 12]],
  ['branch start', 'miharashi', 0, [149, 62, 152]],
  // §6.3's positions for 12, 82, 112 and 174 (e.g. "→(147, 86)") do not fit its own lengths and ends (they lie
  // 11–15 m off the 1 m walk the design computed, which ends on main 1358 as the table says): heights only.
  ['branch steep top', 'miharashi', 82, [null, 77, null]],
  ['lookout end', 'miharashi', 112, [null, 77, null]],
  ['branch slide foot', 'miharashi', 174, [null, 62, null]],
  ['branch end', 'miharashi', 189, [213, 62, -4]],
  ['kudari start', 'kudari', 0, [-110, 98, 12]],
  ['slide 2 top', 'kudari', 40, [-118, 98, 51]],
  ['slide 2 foot', 'kudari', 240, [-304, 59, 94]],
  ['ridge end', 'kudari', 390, [-453, 49, 110]],
  ['U-turn start', 'kudari', 510, [-572, 49, 123]],
  ['U-turn far point', 'kudari', 568, [-608, 49, 162]],
  ['U-turn end', 'kudari', 625, [-574, 49, 202]],
  ['bridge start', 'kudari', 745, [-455, 49, 220]],
  ['bridge end', 'kudari', 885, [-317, 49, 242]],
  ['cape curve end', 'kudari', 960, [-258, 49, 281]],
  ['buffer', 'kudari', 1055, [-224, 49, 370]],
];
for (const [label, railId, s, want] of KEY_POINTS) {
  const p = LINES[railId].at(s);
  const [wx, wy, wz] = want.length === 2 ? [want[0], null, want[1]] : want;
  const err = Math.max(wx === null ? 0 : Math.abs(p.x - wx), wz === null ? 0 : Math.abs(p.z - wz), wy === null ? 0 : Math.abs(p.y - wy));
  check(err <= 1.0, `${label} (${railId} ${s}): [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}] (table [${want.map((v) => v ?? '*').join(', ')}], off ${err.toFixed(2)})`);
}

// Samples every 2 m for the clearance checks.
const SAMPLES = [];
for (const line of Object.values(LINES)) {
  for (let s = 0; s <= line.length; s += 2) SAMPLES.push({ rail: line.id, s, ...line.at(s) });
}
{
  // Nothing dips into the cone: at least 2.0 m above it everywhere (the hugging stretches are exactly 2 m).
  let low = { d: Infinity };
  for (const q of SAMPLES) {
    const d = q.y - coneAt(q.x, q.z);
    if (d < low.d) low = { d, q };
  }
  check(low.d >= 1.99, `lowest rail over the cone: ${low.d.toFixed(2)} m (${low.q.rail} ${low.q.s}; design 2.0)`);
  // The one crossing: kudari 174 over main 702, 25 m up.
  let cross = { d: Infinity };
  for (const a of SAMPLES) {
    if (a.rail !== 'kudari' || a.s < 60) continue;
    for (const b of SAMPLES) {
      if (b.rail !== 'main' || b.s > 1500) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < cross.d) cross = { d, a, b };
    }
  }
  const k = kudari.at(174);
  const m = main.at(702);
  check(
    Math.abs(cross.a.s - 174) <= 2 && Math.abs(cross.b.s - 702) <= 2 && Math.hypot(k.x - m.x, k.z - m.z) < 1.5 && Math.abs(k.y - m.y - 25.2) < 0.3,
    `crossing: kudari ${cross.a.s} over main ${cross.b.s}; kudari 174 / main 702 ${Math.hypot(k.x - m.x, k.z - m.z).toFixed(1)} m apart in plan, ${(k.y - m.y).toFixed(1)} m up (design 0.7, 25.2)`,
  );
  // The main line's two laps: nearest 154 m.
  let lap = { d: Infinity };
  for (const a of SAMPLES) {
    if (a.rail !== 'main' || a.s > 700) continue;
    for (const b of SAMPLES) {
      if (b.rail !== 'main' || b.s < 1100) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (d < lap.d) lap = { d, a, b };
    }
  }
  check(lap.d >= 150, `main lap 1 ↔ lap 2: ${lap.d.toFixed(1)} m (main ${lap.a.s} / ${lap.b.s}; design 154)`);
  // Other lines from main (apart from where they join it).
  const apart = (railId, from, to, want, design) => {
    let best = { d: Infinity };
    for (const a of SAMPLES) {
      if (a.rail !== railId || a.s < from || a.s > to) continue;
      for (const b of SAMPLES) {
        if (b.rail !== 'main') continue;
        if (railId === 'miharashi' && b.s > 1150 && b.s < 1400) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < best.d) best = { d, a, b };
      }
    }
    check(best.d >= want, `${railId} ${from}–${to} ↔ main: ${best.d.toFixed(1)} m (main ${best.b.s}; design ${design})`);
  };
  apart('kudari', 745, 1055, 120.5, '121 or more');
  apart('kudari', 390, 745, 140, '145 or more');
  const look = miharashi.at(97);
  let lm = Infinity;
  for (const b of SAMPLES) if (b.rail === 'main' && b.s >= JUNCTION_AT && b.s <= MERGE_AT) lm = Math.min(lm, Math.hypot(look.x - b.x, look.y - b.y, look.z - b.z));
  check(lm >= 45, `lookout (miharashi 97) ↔ main: ${lm.toFixed(1)} m (design 46 or more)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Stations, gimmicks, actors, records, missions (§4, §5, §6, §9, 付録 A)
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'minato', name: 'みなとえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'nakayama', name: 'なかやまえき', railId: 'main', at: 820, platformSide: 'right' },
  { id: 'kakou', name: 'かこうえき', railId: 'main', at: 1810, platformSide: 'right' },
  { id: 'kansoku', name: 'かんそくじょえき', railId: 'kudari', at: 450, platformSide: 'left' },
  { id: 'misaki', name: 'みさきえき', railId: 'kudari', at: 1035, platformSide: 'left' },
];

/**
 * The lookout branch's steep stretch starts where its climb does (§6.3: 12), so the climb, the sign, the red bed and
 * the pull all start at the same place (§14). It has its own rewind (main 1120), so it only needs room behind its
 * foot for the slip (§5.6, validate.ts), not the default rewind's 60 m.
 */
const BRANCH_STEEP_FROM = 12;

const GIMMICKS = [
  // §5.2 slopes.
  { type: 'slope', railId: 'main', from: 260, to: 330, params: { pull: -6 } },
  { type: 'slope', railId: 'main', from: 360, to: 440, params: { pull: 3, max: 20 } },
  { type: 'slope', railId: 'main', from: 470, to: 620, params: { pull: -6, rewind: { railId: 'main', at: 340 }, line: 'ながい さかだ！ ロケット 2かい！' } },
  { type: 'slope', railId: 'miharashi', from: BRANCH_STEEP_FROM, to: 82, params: { pull: -6, rewind: { railId: 'main', at: 1120 } } },
  { type: 'slope', railId: 'miharashi', from: 112, to: 174, params: { pull: 3, max: 20 } },
  { type: 'slope', railId: 'main', from: 1460, to: 1610, params: { pull: -6, rewind: { railId: 'main', at: 1400 }, line: 'さいごの さか！ ロケット 2かい！' } },
  { type: 'slope', railId: 'kudari', from: 40, to: 240, params: { pull: 3, max: 20 } },
  // §5.1 rocket stretches.
  {
    type: 'rocket',
    railId: 'main',
    from: 1362,
    to: 1430,
    params: { allow: false, icon: 'sleep', line: 'しーっ… とりが ねてるよ', pressLine: 'しーっ… ロケットは おやすみ' },
  },
  { type: 'rocket', railId: 'kudari', from: 740, to: 885, params: { allow: false, icon: 'bridge', line: 'ぐらぐらばし！ ロケットは だめ' } },
  { type: 'rocket', railId: 'kudari', from: 640, to: 690, params: { glow: true, line: 'まっすぐだ！ ロケットで いそげ！' } },
  // §4 M1: steep 1 from behind, to see the flame and the slope.
  { type: 'camera', railId: 'main', from: 230, to: 345, params: { mode: 'chase' } },
  // §6.3: steam on the lookout.
  { type: 'fog', railId: 'miharashi', from: 78, to: 118, params: { near: 2, far: 22, lightFar: 70 } },
  // §9: the bubble column over record ③ on the inlet's seabed (looks only; the lead-in to chapter 3's dive).
  { type: 'bubbles', params: { position: [-390, 0, 170], count: 14, height: 8, radius: 2.5 } },
  // §6.5: seabirds circling the volcano (looks only), over the rim and the upper slopes.
  { type: 'flock', params: { model: 'seabird', count: 8, center: [0, 118, 0], radius: 150, speed: 0.06 } },
];

const ACTORS = [
  // §4 M1-2: a seabird sunning itself on the quay track; the whistle sends it off (the 1-1 cat's rule).
  {
    id: 'umidori',
    type: 'cat',
    onRail: { railId: 'main', at: 125, heightFromRail: 0 },
    reactsTo: 'whistle',
    params: { look: 'seabird', wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2 },
  },
  // §4 M2-2: the rock path. A and C roll (wait), B and D drop (jump). Rewinds stay clear of the rolling rocks' paths
  // (validate.ts): B after A, C and D between B and where C starts rolling (B stays up behind the train).
  { id: 'rock-a', type: 'rock-roll', onRail: { railId: 'main', at: 970 }, reactsTo: 'none', params: {} },
  { id: 'rock-b', type: 'rock-drop', onRail: { railId: 'main', at: 1030 }, reactsTo: 'none', params: { rewind: 980 } },
  { id: 'rock-c', type: 'rock-roll', onRail: { railId: 'main', at: 1100 }, reactsTo: 'none', params: { rewind: 1036 } },
  { id: 'rock-d', type: 'rock-drop', onRail: { railId: 'main', at: 1115 }, reactsTo: 'none', params: { rewind: 1036 } },
  // §4 M3-2: E drops on slide 2 when the train front is at 75 (55 m ahead); jump it, the slide does not stop.
  {
    id: 'rock-e',
    type: 'rock-drop',
    onRail: { railId: 'kudari', at: 130 },
    reactsTo: 'none',
    params: { drop: 55, warn: 80, rewind: 20, say: 'とまれない！ ジャンプで こえて！' },
  },
  // §4 M3-6: F rolls across during the countdown (wait for it even in a hurry).
  { id: 'rock-f', type: 'rock-roll', onRail: { railId: 'kudari', at: 612 }, reactsTo: 'none', params: { say: 'いそいでても、いしは まって！' } },
];

/** Height from the rail to the island's surface at a point beside it (the sea is 0). */
function groundFromRail(railId, s, lateral) {
  const p = LINES[railId].point(s, lateral);
  return coneAt(p.x, p.z) - p.y;
}

const RECORDS = [
  {
    id: 'pumice-float',
    name: 'ぷかぷか いし',
    note: 'うみに うく いし。かざんが つくったんだって',
    requires: null,
    model: 'pumice',
    // §9 says 1.5 m under the rail (y 0.5); the pumice model (about 1 m) has its origin at the bottom, so it goes
    // 0.8 m lower to float in the water (y −0.3) rather than hover over it.
    onRail: { railId: 'main', at: 95, lateral: 16, heightFromRail: -2.3 },
  },
  {
    id: 'sulfur-crystal',
    name: 'きいろい けっしょう',
    note: 'ゆげの なかで、ライトに きらっ',
    requires: 'light',
    model: 'sulfur-crystal',
    onRail: { railId: 'miharashi', at: 97, lateral: -6, heightFromRail: round(Math.max(0, groundFromRail('miharashi', 97, -6)), 2) },
  },
  {
    id: 'bubble-spring',
    name: 'うみの そこの あわ いずみ',
    note: 'うみの なかから あわが… もぐれたら いけるかも',
    requires: 'dive',
    // No model of its own in §8: the "?" of the picture book until chapter 3 (as 2-2's puddle record).
    model: 'cloud-crystal',
    position: [-390, -12, 170],
  },
];

// 付録 A. Keys whose text equals the built-in default (src/mission/runner.ts) are left out.
const MISSIONS = [
  {
    id: 'm1',
    type: 'deliver',
    title: 'のぼれ',
    steps: [{ stationId: 'nakayama' }],
    lines: {
      start: 'やまの うえまで のぼるよ！\nボタンが ひかったら ロケット！',
      moving: 'そうそう、その ちょうし！',
      catNear: 'うみどりが せんろに いる！ きてき！',
      catWoke: 'とんでった！ ありがとう〜',
      recordFound: 'みつけた！ ずかんに のせよう',
      steepNear: 'きゅうな さか！ ロケットで のぼろう',
      rocketReady: 'いまだ！ ロケット！',
      rocketGo: 'ぐいーん！ いけいけ〜！',
      rocketAgain: 'おそく なってきた… もういっかい！',
      noBrake: 'つるつるざか！ ひゃっほー！',
      stationNear: 'なかやまえきだ。ゆっくり！',
      complete: 'のぼれた！ ロケット すごいね！',
    },
    hints: [{ railId: 'main', at: 335, text: 'わあ、うみが みえる！' }],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'いしが ふる',
    steps: [{ stationId: 'kakou' }],
    lines: {
      start: 'がけの したの みちを いくよ\nいしが ころがって きたら まってね\nいしが おちたら ジャンプ！\nさいごの さかで ロケット 2かい！',
      rockNear: 'いしが ぐらぐら… ゆっくり！',
      rockDrop: 'いしが おちた！ ジャンプ！',
      steepNear: 'きゅうな さか！ ロケットで のぼろう',
      recordFound: 'みつけた！ ずかんに のせよう',
      noBrake: 'つるつるざか！ ひゃっほー！',
      rocketAgain: 'おそく なってきた… もういっかい！',
      slipEmptyAfter: 'こんどは さかまで とっておこう',
      stationNear: 'かこうえきだ。ゆっくり！',
      complete: 'てっぺんだ！ かざんの なかが みえる！',
    },
    hints: [
      { railId: 'main', at: 1140, text: 'ひだりの うえで なにか ひかった！' },
      { railId: 'main', at: 1155, text: 'ロケット 1かいで いけるよ' },
      { railId: 'miharashi', at: 70, text: 'ゆげで まっしろ… ライト！' },
      { railId: 'main', at: 1740, text: 'あれ？ えきの かんばんが さかさま…' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'はしが おちる',
    steps: [
      { stationId: 'kansoku', board: 1, say: 'やっほー！ まってたよ〜', reply: 'おまたせ！ のって のって！' },
      {
        stationId: 'misaki',
        alight: 1,
        countdown: { seconds: 70, until: { railId: 'kudari', at: 885 }, assist: 10, assistMax: 30, icon: 'volcano', music: 'hurry' },
        say: 'ありがとう！ たすかったよ〜',
        reply: 'まにあったね！',
      },
    ],
    lines: {
      start: 'けいじばんに おしらせが きてる！\nはなれやまの かんそくじょで\nちょうさいんさんが まってるって！\nつるつるざかの いしは ジャンプ！',
      noBrake: 'つるつる！ ブレーキ きかないよ',
      timerStart: 'かざんが むずむず してる！\nはしが おちる まえに わたろう！',
      timeLow: 'は… は… はやく はやく〜！',
      timeSafe: 'わたれた！ セーフ！',
      timeUp: 'はっくしょーん！\n…ゆげで まっしろ〜！ もういっかい！',
      complete: 'まにあった〜！',
    },
    hints: [
      { railId: 'kudari', at: 160, text: 'したに さっきの せんろ！' },
      { railId: 'kudari', at: 300, text: 'うみの なかから あわが… なんだろう？' },
      { railId: 'kudari', at: 335, text: 'かんそくじょえきだ。ゆっくり！' },
      { railId: 'kudari', at: 915, text: 'みさきえきだ！ ゆっくり！' },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12, 付録 A)
// ---------------------------------------------------------------------------------------------------------------

const opening = [
  { caption: 'かざんの しま', seconds: 2.5 },
  { camera: 'chase' },
  { say: 'みて、おおきな かざん！', emote: 'jump' },
  { say: 'けむりの わっか、ぽふっ ぽふっ' },
  { say: 'せんろが やまを ぐるぐる…' },
  { say: 'すごく きゅうな さかも ある！', emote: 'tilt' },
  { say: 'まかせて！ ぼくが かいぞう する！', emote: 'jump' },
  { unlock: 'rocket' },
  { say: 'これで さかも へっちゃら！', emote: 'cheer' },
  { say: 'カメラは うえに おひっこし！' },
  { camera: 'cab' },
];

/** Sakasa stands on the island's surface beside the rail (the rail is on a raised bed there). */
const onGround = (railId, at, lateral) => ({ railId, at, lateral, heightFromRail: round(groundFromRail(railId, at, lateral), 2) });

const glimpse = [
  { camera: 'chase' },
  { spawn: 'sakasa', model: 'amanojaku', onRail: onGround('kudari', 30, 6) },
  { say: 'あれ？ むこうに だれか いる…', emote: 'tilt' },
  { move: 'sakasa', onRail: onGround('kudari', 80, 10), seconds: 2.5 },
  { remove: 'sakasa' },
  { say: 'ぐるぐる ぼうし…？' },
];

/** The cape (mesa-b) is flat at 48; the rail sits 0.6 m above it. */
const MESA_TOP = 48;
const onMesa = (railId, at, lateral) => ({ railId, at, lateral, heightFromRail: round(MESA_TOP - LINES[railId].point(at, lateral).y, 2) });
/**
 * mesa-b (§6.5): centre, turn (degrees, three.js rotation.y) and top, the placeholder's rounded rectangle
 * (src/view/three/volcano-placeholders.ts mesa(): 125 × 155 m, corners 22 m).
 */
const MESA_B = { x: -266, z: 308.5, rotationY: 8, width: 125, depth: 155, corner: 22 };
/** How far a point (x, z) is inside mesa-b's top edge (m; negative = beyond it). */
function insideMesaB({ x, z }) {
  const th = MESA_B.rotationY * RAD;
  const dx = x - MESA_B.x;
  const dz = z - MESA_B.z;
  const lx = Math.abs(dx * Math.cos(th) - dz * Math.sin(th));
  const lz = Math.abs(dx * Math.sin(th) + dz * Math.cos(th));
  const hx = MESA_B.width / 2 - MESA_B.corner;
  const hz = MESA_B.depth / 2 - MESA_B.corner;
  if (lx > hx && lz > hz) return MESA_B.corner - Math.hypot(lx - hx, lz - hz);
  return Math.min(MESA_B.width / 2 - lx, MESA_B.depth / 2 - lz);
}
/** Sakasa on the cape at the end: where he appears, the rim he runs to, and a spot 10 m down behind it. */
const SAKASA_END = {
  spawn: onMesa('kudari', 1052, -14),
  rim: onMesa('kudari', 1054, -29),
  behind: { ...onMesa('kudari', 1054, -31), heightFromRail: round(onMesa('kudari', 1054, -31).heightFromRail - 10, 2) },
};
/** §6.5: the ending camera, out at sea, with the bridge, the volcano and the train at the cape in one picture. */
const ENDING_CAMERA = { at: [-470, 75, 430], lookAt: [-286, 60, 261] };
const CUT = { from: 765, to: 865 };

const ending = [
  { camera: 'fixed', ...ENDING_CAMERA },
  { say: 'あっ、かざんが むずむず…', emote: 'tilt' },
  { fx: 'sneeze' },
  { cutRail: { railId: 'kudari', from: CUT.from, to: CUT.to, style: 'fall', props: 'old-bridge' } },
  { say: 'はしが おちちゃった…！' },
  { say: 'まにあって よかった〜！', emote: 'cheer' },
  { camera: 'side' },
  { say: 'ぐるぐる ぼうしの こが、', who: 'passenger' },
  { say: 'にげろって いいながら おしてくれたの', who: 'passenger' },
  { say: 'じょうぶな こやの なかに ね', who: 'passenger' },
  { say: 'サカサだ…！ たすけて くれたんだ', emote: 'jump' },
  { say: 'あのこ、たんけんたいの', who: 'passenger' },
  { say: 'しけんに きたことが あるの', who: 'passenger' },
  { say: '「とまれ」で すすんじゃって…', who: 'passenger' },
  { say: 'はいれなかったの', who: 'passenger' },
  { say: 'たんけんたいに、はいりたかったんだ…', emote: 'tilt' },
  { say: 'サカサ、ほんとは やさしいのかも' },
  { spawn: 'sakasa', model: 'amanojaku', onRail: SAKASA_END.spawn, rotationY: 180 },
  { camera: 'chase' },
  { say: 'サカサー！ ありがとうー！', emote: 'jump' },
  { say: '……こ、こんにちは〜！', who: 'amanojaku' },
  // "みさきの岩のむこうへ": across the top to the rim, then down behind it out of sight (not off the edge into the air).
  { move: 'sakasa', onRail: SAKASA_END.rim, seconds: 1.6 },
  { move: 'sakasa', onRail: SAKASA_END.behind, seconds: 0.9 },
  { remove: 'sakasa' },
  { say: '…よし、いこう！ つぎの せかいへ！', emote: 'cheer' },
  { card: { title: '2しょう おしまい！', button: 'つぎへ', icon: 'badge' } },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§6.5, §8)
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
const rand = mulberry32(23);
const between = (a, b) => a + (b - a) * rand();

const props = [];
/** Circles { x, z, r } scattered props keep out of. */
const keepOut = [];

function addOnRail(model, railId, at, { lateral = 0, height, rotationY, rotation, scale = 1, tag, keep = 0 } = {}) {
  const onRail = { railId, at: round(at) };
  if (lateral) onRail.lateral = round(lateral, 2);
  if (height !== undefined) onRail.heightFromRail = round(height, 2);
  const p = { model, onRail };
  if (rotation) p.rotation = rotation;
  else if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  if (tag) p.tag = tag;
  props.push(p);
  if (keep > 0) {
    const q = LINES[railId].point(at, lateral);
    keepOut.push({ x: q.x, z: q.z, r: keep });
  }
}

function addWorld(model, [x, y, z], { rotationY, scale = 1, keep = 0 } = {}) {
  const p = { model, position: [round(x), round(y, 2), round(z)] };
  if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
  if (keep > 0) keepOut.push({ x, z, r: keep });
}

// --- The island: the volcano, the two mesas (§6.5). Models: origin at the bottom centre, +Z forward.
addWorld('volcano', [0, 0, 0], { keep: 0 });
addWorld('mesa-a', [-532, 0, 165]);
// mesa-b's long side (155 m, model +Z) roughly along the cape track (heading 70° in the design's atan2 terms), turned
// 12° further so its near edge crosses the track squarely: the whole ballast is on the top from the bridge end
// (885) on, 1.6 m in or more (the last girder's right half rests on the edge, like an abutment).
addWorld('mesa-b', [MESA_B.x, 0, MESA_B.z], { rotationY: MESA_B.rotationY });

// --- The old bridge (kudari 745–885): seven 20 m girders under the track, tagged so the ending drops 765–865.
// The model's origin is the top of its deck, which goes under the ballast (0.6 m below the rail top).
for (let at = 755; at <= 875; at += 20) addOnRail('old-bridge', 'kudari', at, { height: -0.6, tag: 'old-bridge' });

// --- The observatory on the mesa, 14 m left of かんそくじょえき, facing the track.
addOnRail('observatory', 'kudari', 450, { lateral: -14, height: MESA_TOP - kudari.point(450, -14).y, rotationY: -90 });

// --- かこうえき: one station sign upside down (§4 M2-6), 15 m before the stop line on the platform side.
// Its origin is at the bottom: turned over about its face it spans 1–4 m above the rail.
addOnRail('station-sign', 'main', 1795, { lateral: 3.8, height: 4, rotation: [0, 90, 180] });

// --- Rock under the platforms of the main line (the quay's platform is 2 m over the sand, the others stand out
// over the downhill side, and the rail's own rock bed is only 3 m deep): cliff-a blocks, 12 m along the rail,
// their tops just under the platform (it spans 3 m past the stop line to 42 m before it, 1.7–5.7 m out).
for (const st of STATIONS.filter((x) => x.railId === 'main')) {
  const side = st.platformSide === 'right' ? 1 : -1;
  for (let k = 0; k < 4; k++) addOnRail('cliff-a', 'main', st.at + 3 - 6 - 12 * k, { lateral: 4.6 * side, height: -10.5, rotationY: 90 });
}

// --- The rock arch (kudari 158–190 over main 702): a cliff-b pillar under each end of the stretch without a base.
for (const at of [158, 190]) {
  const q = kudari.point(at);
  const ground = coneAt(q.x, q.z) - 1.5;
  const scale = (q.y - 0.8 - ground) / 14.46;
    // Model +Z (its 6 m depth) along the downhill line, its 12 m width across it.
  addWorld('cliff-b', [q.x, ground, q.z], { rotationY: 90 - q.h / RAD, scale, keep: 12 });
}

// --- The birds' cliff (main 1362–1430): three ledges on the mountain side with two sleeping seabirds each
// (7–9 m left, 4–6 m up), and a cliff wall behind them.
const LEDGES = [
  [1374, -9.5, 0.45],
  [1396, -9.5, 0.5],
  [1418, -9.5, 0.55],
];
LEDGES.forEach(([at, lateral, scale], i) => {
  const ground = groundFromRail('main', at, lateral) - 0.8;
  addOnRail('cliff-a', 'main', at, { lateral, height: ground, rotationY: 90, scale, keep: 8 });
  const top = ground + 10 * scale;
  for (const [ds, dl] of [
    [-3, 1.8],
    [2.5, 1.2],
  ]) {
    addOnRail('seabird-sleep', 'main', at + ds, { lateral: lateral + dl, height: top, rotationY: 90 + 40 * (i - 1) + ds * 10 });
  }
});
{
  const at = 1396;
  const lateral = -22;
  addOnRail('cliff-a', 'main', at, { lateral, height: groundFromRail('main', at, lateral) - 1, rotationY: 90, scale: 1.6, keep: 14 });
}

// --- Steam puffs on the lookout (miharashi 82–112, cloud-a = ゆげ玉).
for (const [at, lateral, up, scale] of [
  [86, 8, 1.5, 0.55],
  [95, -10, 2.5, 0.6],
  [104, 9, 3, 0.5],
  [110, -8, 1, 0.45],
]) {
  addOnRail('cloud-a', 'miharashi', at, { lateral, height: groundFromRail('miharashi', at, lateral) + up, scale, rotationY: at * 13 });
}

// --- Scattered: rocks on the mountain side of the rock path, ferns and cycads along main 150–900.
const PLATFORM_ZONES = STATIONS.map((st) => ({ railId: st.railId, from: st.at - 50, to: st.at + 10 }));
const scattered = [];
/** Nearest rail sample in plan whose height is within `dy` m of `y`. */
function nearRail(x, y, z, dy) {
  let best = { d: Infinity };
  for (const q of SAMPLES) {
    if (Math.abs(q.y - y) > dy) continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < best.d) best = { d, q };
  }
  return best;
}
function freeSpot(x, z, r, minRail) {
  const R = Math.hypot(x, z);
  // On the cone, not on the beach or in the crater.
  if (R > R0 - 8 || R < RR + 4) return false;
  const y = cone(R);
  const n = nearRail(x, y, z, 12);
  if (n.d < minRail) return false;
  if (n.d < 14 && PLATFORM_ZONES.some((p) => p.railId === n.q.rail && n.q.s >= p.from && n.q.s <= p.to)) return false;
  if (keepOut.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) return false;
  if (scattered.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.9 + 1.5)) return false;
  return true;
}
/** `zones` = [[railId, from, to]], `side` −1 left / 1 right / 0 either, lateral range [min, max] m. */
function scatter(models, count, { zones, side = 0, lat, scale: [s0, s1], footprint, sink = 0, avoid = [] }) {
  const total = zones.reduce((a, z) => a + (z[2] - z[1]), 0);
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 400; tries++) {
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
    if (avoid.some(([a, b]) => s >= a && s <= b)) continue;
    const sd = side || (rand() < 0.5 ? -1 : 1);
    const scale = round(between(s0, s1), 2);
    const r = footprint * scale;
    const lateral = sd * between(Math.max(lat[0], r + 3), lat[1]);
    const q = LINES[railId].point(s, lateral);
    if (!freeSpot(q.x, q.z, r, Math.max(lat[0] - 1, r + 3))) continue;
    scattered.push({ x: q.x, z: q.z, r });
    const model = models[Math.floor(rand() * models.length)];
    addWorld(model, [q.x, coneAt(q.x, q.z) - sink * scale, q.z], { scale, rotationY: round(rand() * 360) });
    placed++;
  }
  if (placed < count) problems.push(`${models.join('/')}: placed ${placed} of ${count}`);
  return placed;
}
const GREEN_COUNT = { cycad: 5, fernA: 8, fernB: 16 };
// The rolling rocks come down across the rail at 970 and 1100 (from 9 m left): leave their lanes clear.
scatter(['boulder', 'rock-a', 'rock-b'], 12, {
  zones: [['main', 885, 1160]],
  side: -1,
  lat: [11, 30],
  scale: [1.5, 3.5],
  footprint: 1.6,
  sink: 0.3,
  avoid: [
    [955, 985],
    [1085, 1115],
  ],
});
// Fewer than §6.5's "about 50" greens: the whole slope 150–900 is in view at once from the quay side, and 50 put
// the frame over the triangle budget (TECH_SPEC §6); the lighter fern-b makes up most of them.
scatter(['cycad'], GREEN_COUNT.cycad, { zones: [['main', 150, 900]], lat: [7, 40], scale: [1.2, 1.8], footprint: 1.5 });
scatter(['fern-a'], GREEN_COUNT.fernA, { zones: [['main', 150, 900]], lat: [5, 38], scale: [1.6, 2.6], footprint: 1.2 });
scatter(['fern-b'], GREEN_COUNT.fernB, { zones: [['main', 150, 900]], lat: [5, 38], scale: [2, 3.4], footprint: 0.6 });

// ---------------------------------------------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '2-3',
  title: 'かざんのしま',
  chapter: 2,
  unlock: { requires: ['2-2'], purchase: null },
  unlocks: ['rocket'],
  environment: {
    sky: { top: '#58b4ec', bottom: '#e4f5fb' },
    // Far enough for the ending camera (§6.5) to show the bridge and the cape clearly and the volcano's near
    // flank (about 400 m); the crater (640 m) is in the fog from there.
    fog: { color: '#dff0f6', near: 200, far: 620 },
    lighting: 'day',
    ground: { y: 0, size: 3200, color: '#3d9ad6' },
    bgm: 'volcano',
    fall: 'cloud',
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    { id: 'main', points: main.points(), base: { look: 'rock', depth: 3 }, end: { type: 'merge', railId: 'kudari', at: 0 } },
    { id: 'miharashi', points: miharashi.points(), base: { look: 'rock', depth: 3 }, end: { type: 'merge', railId: 'main', at: MERGE_AT } },
    {
      id: 'kudari',
      points: kudari.points(),
      // The mesa, the bridge and the cape carry the track themselves; the arch is open under main's crossing.
      base: { look: 'rock', toGround: true, skip: [{ from: 158, to: 190 }, { from: 390, to: round(kudari.length, 2) }] },
      end: { type: 'buffer' },
    },
  ],
  junctions: [{ id: 'j-miharashi', railId: 'main', at: JUNCTION_AT, left: 'miharashi', right: 'main', default: 'right' }],
  stations: STATIONS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: { opening, glimpse, ending },
};

// --- Checks on the data.
{
  // Every line of the partner and the passenger: 20 characters or fewer, spaces included (付録 A).
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) texts.push(...[st.say, st.reply].filter(Boolean));
  }
  for (const g of GIMMICKS) texts.push(...[g.params?.line, g.params?.pressLine].filter(Boolean));
  for (const a of ACTORS) texts.push(...[a.params?.say, a.params?.hitAfter].filter(Boolean));
  for (const steps of Object.values(stage.cutscenes)) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  // The ending camera sees the bridge, the volcano and the cape station (§6.5: within the view's half-width).
  const cam = ENDING_CAMERA;
  const dir = Math.atan2(cam.lookAt[2] - cam.at[2], cam.lookAt[0] - cam.at[0]);
  for (const [label, p] of [
    ['bridge', kudari.at(815)],
    ['volcano', { x: 0, z: 0 }],
    ['misaki', kudari.at(1035)],
  ]) {
    const a = angleDiff(Math.atan2(p.z - cam.at[2], p.x - cam.at[0]), dir) / RAD;
    check(Math.abs(a) < 45, `ending camera → ${label}: ${a.toFixed(0)}° off centre`);
  }
  // The bridge girders that fall are the ones inside the cut.
  const falling = props.filter((p) => p.tag === 'old-bridge' && p.onRail.at >= CUT.from && p.onRail.at <= CUT.to).length;
  check(falling === 5, `old-bridge girders inside the cut ${CUT.from}–${CUT.to}: ${falling} of 7`);
  // Sakasa at the end stays on the cape's top (0.5 m in or more, the whole way from where he appears to the rim),
  // then goes down just behind the rim (within the cliff's 3 m bulge, not out over the sea).
  const onTop = (o) => LINES[o.railId].point(o.at, o.lateral);
  let least = Infinity;
  for (let k = 0; k <= 20; k++) {
    const a = onTop(SAKASA_END.spawn);
    const b = onTop(SAKASA_END.rim);
    least = Math.min(least, insideMesaB({ x: a.x + ((b.x - a.x) * k) / 20, z: a.z + ((b.z - a.z) * k) / 20 }));
  }
  check(least >= 0.5, `Sakasa's run on the cape: ${least.toFixed(1)} m inside mesa-b's top edge at the least`);
  const behind = insideMesaB(onTop(SAKASA_END.behind));
  check(behind < 0 && behind > -3, `Sakasa's drop behind the rim: ${(-behind).toFixed(1)} m past the edge`);
}

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
report.push(`points: ${stage.rails.map((r) => `${r.id} ${r.points.length}`).join(', ')}`);
console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}

/** For checks against the game's own Rail (the 1 m polylines, s = rail length). */
export { LINES, JUNCTION_AT, MERGE_AT };
