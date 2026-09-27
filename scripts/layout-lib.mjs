/**
 * Shared pieces of the stage layout scripts for 3-2 and 3-3 (the same ways as scripts/layout-3-1.mjs): straights and
 * arcs walked 1 m of rail at a time, a rail's 1 m polyline with lookups by s, a smoothstep height profile, a seeded
 * random generator, the game's own curve for checks, and the JSON printer every layout script writes with.
 *
 * Conventions: three.js world, y up, +Z north. Heading 0 = +Z, a left turn goes towards +X. `lateral` is positive to
 * the right of the direction of travel (the game's frame.right): for heading h that is (−cos h, sin h).
 */
import { CatmullRomCurve3, Vector3 } from 'three';

export const RAD = Math.PI / 180;

export const round = (v, digits = 1) => {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};

export const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, t));
  return a + (b - a) * k * k * (3 - 2 * k);
};

/** Height profile from keys [[s, y], ...]: smoothstep between neighbouring keys, flat past the ends. */
export function keyed(keys) {
  return (s) => {
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [s1, y1] = keys[i];
      const [s0, y0] = keys[i - 1];
      if (s <= s1) return s1 > s0 ? smooth(y0, y1, (s - s0) / (s1 - s0)) : y1;
    }
    return keys[keys.length - 1][1];
  };
}

/** Walks straights ('S', length) and arcs ('L'/'R', radius, degrees) 1 m of rail at a time; y from `height(s)`. */
export function walk(x0, z0, head, segments, height) {
  let x = x0;
  let z = z0;
  let th = head * RAD;
  let s = 0;
  const pts = [{ x, y: height(0), z, s }];
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

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** A rail's 1 m polyline with lookups by s. */
export class Line {
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

/**
 * How far (m) the game's curve (centripetal Catmull-Rom through the JSON points) is from the script's line at
 * `checks`, and its length: forks, merges and stations must be where the script put them.
 */
export function gameCurveCheck(line, checks) {
  const curve = new CatmullRomCurve3(line.points().map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal');
  curve.arcLengthDivisions = Math.ceil(line.length / 0.25);
  const total = curve.getLength();
  let worst = { d: 0, s: 0 };
  for (const s of checks) {
    const p = curve.getPointAt(Math.min(1, s / total));
    const q = line.at(s);
    const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    if (d > worst.d) worst = { d, s };
  }
  return { total, worst };
}

/** Seeded generator (mulberry32): the same file on every run. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inside a water area ({ circle } or { rect }), as the game's src/stage/water.ts inArea. */
export function inArea(area, x, z, grow = 0) {
  if (!area) return true;
  if (area.circle) {
    const c = area.circle;
    return Math.hypot(x - c.center[0], z - c.center[1]) <= c.radius + grow;
  }
  const r = area.rect;
  const a = ((r.rotationY ?? 0) * Math.PI) / 180;
  const dx = x - r.center[0];
  const dz = z - r.center[1];
  const across = dx * Math.cos(a) - dz * Math.sin(a);
  const along = dx * Math.sin(a) + dz * Math.cos(a);
  const hx = r.size[0] / 2 + grow;
  const hz = r.size[1] / 2 + grow;
  const corner = Math.min(r.corner ?? 0, hx, hz);
  const qx = Math.abs(across) - (hx - corner);
  const qz = Math.abs(along) - (hz - corner);
  if (qx <= 0 || qz <= 0) return Math.abs(across) <= hx && Math.abs(along) <= hz;
  return Math.hypot(qx, qz) <= corner;
}

/**
 * The water stretches of a line as the loader works them out (src/stage/water.ts computeWaterSpans, 1 m steps): on
 * the surface where the rail top is 1.5 m above to 1.0 m below the surface, under water below that.
 */
export function waterSpans(line, waters) {
  const surfaces = [];
  const dives = [];
  let open = null;
  const close = (s) => {
    if (!open) return;
    (open.kind === 'surface' ? surfaces : dives).push({ from: open.from, to: s, water: open.water });
    open = null;
  };
  for (let i = 0; i <= Math.ceil(line.length); i++) {
    const s = Math.min(line.length, i);
    const p = line.at(s);
    let hit = -1;
    for (let k = 0; k < waters.length; k++) if (inArea(waters[k].area, p.x, p.z)) {
      hit = k;
      break;
    }
    let kind = null;
    if (hit >= 0) {
      const rel = p.y - waters[hit].y;
      if (rel <= -1) kind = 'dive';
      else if (rel <= 1.5) kind = 'surface';
    }
    if (open && (open.kind !== kind || open.water !== hit)) close(s);
    if (kind && !open) open = { kind, from: s, water: hit };
  }
  close(line.length);
  return { surfaces, dives };
}

const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number');
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}
/** The stage JSON as every layout script writes it (short things on one line, point lists five to a line). */
export function pretty(v, indent = '') {
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
