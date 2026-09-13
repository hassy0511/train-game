import { CatmullRomCurve3, Vector3 } from 'three';
import type { RailEndDef } from '../stage/types';
import type { Rail as RailApi, RailFrame } from './types';

export interface RailInit {
  id: string;
  /** Control points on the rail-top center line, in meters. */
  points: Vector3[];
  up?: Vector3;
  gaps?: { from: number; to: number }[];
  end: RailEndDef;
  /** Phantom control point before the first point, used only to shape the start tangent (junction continuity). */
  leadIn?: Vector3;
  /** Phantom control point after the last point (merge continuity). */
  leadOut?: Vector3;
}

const DEFAULT_UP = new Vector3(0, 1, 0);
const SAMPLE_SPACING = 0.25;

/** A single rail: a centripetal Catmull-Rom spline addressed by arc length. */
export class Rail implements RailApi {
  readonly id: string;
  readonly length: number;
  readonly gaps: { from: number; to: number }[];
  readonly end: RailEndDef;

  private readonly curve: CatmullRomCurve3;
  private readonly upRef: Vector3;
  /** Arc length of the whole curve including phantom points. */
  private readonly totalLength: number;
  /** Arc length at which the real rail starts. */
  private readonly startOffset: number;

  constructor(init: RailInit) {
    if (init.points.length < 2) throw new Error(`Rail "${init.id}" needs at least 2 points`);
    this.id = init.id;
    this.gaps = init.gaps ?? [];
    this.end = init.end;
    this.upRef = (init.up ?? DEFAULT_UP).clone().normalize();

    const pts = [
      ...(init.leadIn ? [init.leadIn] : []),
      ...init.points,
      ...(init.leadOut ? [init.leadOut] : []),
    ];
    this.curve = new CatmullRomCurve3(pts, false, 'centripetal');

    let approx = 0;
    for (let i = 1; i < pts.length; i++) approx += pts[i].distanceTo(pts[i - 1]);
    this.curve.arcLengthDivisions = Math.max(200, Math.ceil(approx / SAMPLE_SPACING));
    const lengths = this.curve.getLengths();
    const divisions = lengths.length - 1;
    const lengthAtT = (t: number): number => {
      const x = t * divisions;
      const i = Math.floor(x);
      if (i >= divisions) return lengths[divisions];
      return lengths[i] + (lengths[i + 1] - lengths[i]) * (x - i);
    };

    const n = pts.length;
    const tStart = init.leadIn ? 1 / (n - 1) : 0;
    const tEnd = init.leadOut ? (n - 2) / (n - 1) : 1;
    this.totalLength = lengths[divisions];
    this.startOffset = lengthAtT(tStart);
    this.length = lengthAtT(tEnd) - this.startOffset;
  }

  frameAt(s: number): RailFrame {
    const clamped = Math.min(Math.max(s, 0), this.length);
    const u = (this.startOffset + clamped) / this.totalLength;
    const position = this.curve.getPointAt(u);
    const tangent = this.curve.getTangentAt(u).normalize();
    if (s !== clamped) position.addScaledVector(tangent, s - clamped);
    const up = this.upRef.clone().addScaledVector(tangent, -tangent.dot(this.upRef)).normalize();
    const right = new Vector3().crossVectors(tangent, up).normalize();
    return { position, tangent, up, right };
  }

  /** True when `s` lies inside a gap (no rail under the train). */
  inGap(s: number): boolean {
    return this.gaps.some((g) => s >= g.from && s <= g.to);
  }
}
