import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';
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
  /**
   * "fixed" (default): up is the reference up made square to the rail. "follow": up turns with the rail's
   * bends (rotation-minimising frame from the start), so a vertical half-loop around an island's end
   * leaves the train upside down on the island's underside.
   */
  upMode?: 'fixed' | 'follow';
}

const DEFAULT_UP = new Vector3(0, 1, 0);
const SAMPLE_SPACING = 0.25;
/** Spacing (m) of the precomputed up vectors for upMode "follow". */
const UP_SPACING = 0.5;

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
  /** upMode "follow": up vectors every UP_SPACING m along the rail. */
  private readonly ups: Vector3[] | null = null;

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
    if (init.upMode === 'follow') this.ups = this.transportUps();
  }

  private tangentAt(s: number): Vector3 {
    const clamped = Math.min(Math.max(s, 0), this.length);
    return this.curve.getTangentAt((this.startOffset + clamped) / this.totalLength).normalize();
  }

  /** Carries the start's up along the rail, turning it only as much as the tangent turns (no twist). */
  private transportUps(): Vector3[] {
    const count = Math.max(2, Math.ceil(this.length / UP_SPACING) + 1);
    const ups: Vector3[] = [];
    let tangent = this.tangentAt(0);
    let up = this.upRef.clone().addScaledVector(tangent, -tangent.dot(this.upRef)).normalize();
    const turn = new Quaternion();
    for (let i = 0; i < count; i++) {
      const next = this.tangentAt((this.length * i) / (count - 1));
      turn.setFromUnitVectors(tangent, next);
      up = up.applyQuaternion(turn);
      up.addScaledVector(next, -next.dot(up)).normalize();
      ups.push(up.clone());
      tangent = next;
    }
    return ups;
  }

  frameAt(s: number): RailFrame {
    const clamped = Math.min(Math.max(s, 0), this.length);
    const u = (this.startOffset + clamped) / this.totalLength;
    const position = this.curve.getPointAt(u);
    const tangent = this.curve.getTangentAt(u).normalize();
    if (s !== clamped) position.addScaledVector(tangent, s - clamped);
    const up = this.upAt(clamped, tangent);
    const right = new Vector3().crossVectors(tangent, up).normalize();
    return { position, tangent, up, right };
  }

  private upAt(s: number, tangent: Vector3): Vector3 {
    if (!this.ups) return this.upRef.clone().addScaledVector(tangent, -tangent.dot(this.upRef)).normalize();
    const x = (s / this.length) * (this.ups.length - 1);
    const i = Math.min(Math.floor(x), this.ups.length - 2);
    const up = this.ups[i].clone().lerp(this.ups[i + 1], x - i);
    return up.addScaledVector(tangent, -tangent.dot(up)).normalize();
  }

  /** True when `s` lies inside a gap (no rail under the train). */
  inGap(s: number): boolean {
    return this.gaps.some((g) => s >= g.from && s <= g.to);
  }

  /** Removes a piece of rail at runtime (the amanojaku's doing). */
  addGap(from: number, to: number): void {
    this.gaps.push({ from, to });
  }
}
