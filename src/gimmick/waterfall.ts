import { Vector3 } from 'three';
import type { GimmickDef, WaterDef, WaterfallParams } from '../stage/types';
import { inArea } from '../stage/water';
import { WATERFALL } from '../train/params';

/**
 * v1.10 (3-2): a waterfall worked out once from its gimmick (PHASE8 第 4 部 §4.2): the lip line, the side it falls to
 * (towards the water below), and the curtain's shape (thrown `throw` m out at the bottom, a parabola in between).
 * Shared by the view (src/view/three/river.ts) and the shower check below.
 */
export interface Waterfall {
  index: number;
  /** The lip line's ends (y = top). */
  a: Vector3;
  b: Vector3;
  /** Along the lip (unit, a → b) and out over the water below (unit, horizontal). */
  along: Vector3;
  out: Vector3;
  length: number;
  top: number;
  bottom: number;
  throw: number;
  lip: number;
  rainbow: boolean;
}

/** The stage's waterfalls. */
export function waterfalls(gimmicks: GimmickDef[], waters: WaterDef[]): Waterfall[] {
  const out: Waterfall[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'waterfall') return;
    const p = g.params as unknown as WaterfallParams;
    const a = new Vector3(p.from[0], p.top, p.from[1]);
    const b = new Vector3(p.to[0], p.top, p.to[1]);
    const along = b.clone().sub(a).setY(0);
    const length = along.length();
    along.normalize();
    const side = new Vector3(along.z, 0, -along.x);
    // Out is towards the water it falls into.
    const into = waters.find((w) => Math.abs(w.y - p.bottom) <= 0.1);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const probe = mid.clone().addScaledVector(side, 6);
    if (into?.area && !inArea(into.area, probe.x, probe.z)) side.negate();
    out.push({
      index,
      a,
      b,
      along,
      out: side,
      length,
      top: p.top,
      bottom: p.bottom,
      throw: p.throw ?? WATERFALL.throw,
      lip: p.lip ?? WATERFALL.lip,
      rainbow: p.rainbow ?? WATERFALL.rainbow,
    });
  });
  return out;
}

/** How far out (m) the falling water is at height `y` (0 at the lip, `throw` at the bottom). */
export function curtainOut(w: Waterfall, y: number): number {
  const k = Math.min(1, Math.max(0, (w.top - y) / Math.max(0.1, w.top - w.bottom)));
  return w.lip + (w.throw - w.lip) * Math.sqrt(k);
}

/** Along the lip and out from it, for a world point. */
function local(w: Waterfall, p: Vector3): { t: number; d: number } {
  const dx = p.x - w.a.x;
  const dz = p.z - w.a.z;
  return { t: dx * w.along.x + dz * w.along.z, d: dx * w.out.x + dz * w.out.z };
}

/**
 * The shower (looks and sound only): some car's roof is between the cliff and the falling water of a waterfall, under
 * its lip and above the water it falls into.
 */
export function underFalls(list: Waterfall[], roofs: Vector3[]): boolean {
  for (const w of list) {
    for (const roof of roofs) {
      if (roof.y >= w.top || roof.y <= w.bottom) continue;
      const { t, d } = local(w, roof);
      if (t < 0 || t > w.length) continue;
      if (d >= -1 && d <= curtainOut(w, roof.y) + 0.3) return true;
    }
  }
  return false;
}

/** How loud the waterfall is at `p` (0 past WATERFALL.hearFar m, 1 within hearNear m). */
export function fallsLoudness(list: Waterfall[], p: Vector3): number {
  let best = 0;
  for (const w of list) {
    const { t, d } = local(w, p);
    const tt = Math.min(Math.max(t, 0), w.length);
    const dist = Math.hypot(t - tt, d - w.throw / 2, (p.y - (w.top + w.bottom) / 2) * 0.5);
    const k = 1 - (dist - WATERFALL.hearNear) / (WATERFALL.hearFar - WATERFALL.hearNear);
    best = Math.max(best, Math.min(1, Math.max(0, k)));
  }
  return best;
}
