import type { Vector3 } from 'three';
import type { RailEndDef } from '../stage/types';

/** Position and orientation of a point on a rail. `right` is `tangent × up` (the train's right-hand side). */
export interface RailFrame {
  position: Vector3;
  tangent: Vector3;
  up: Vector3;
  right: Vector3;
}

export interface Rail {
  readonly id: string;
  /** Arc length in meters. */
  readonly length: number;
  readonly gaps: { from: number; to: number }[];
  readonly end: RailEndDef;
  /** `s` is the distance from the rail start in meters. Outside [0, length] the end tangent is extrapolated. */
  frameAt(s: number): RailFrame;
}

export interface RailNetwork {
  readonly rails: Map<string, Rail>;
  getRail(id: string): Rail;
}
