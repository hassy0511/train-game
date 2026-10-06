import type { Vector3 } from 'three';
import type { PlowSpan, RailEndDef, WaterSpan } from '../stage/types';

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
  /** v1.10 (set by the loader): stretches on a water surface (the jump button is "もぐる" there), sorted by `from`. */
  surfaces: WaterSpan[];
  /** v1.10 (set by the loader): stretches under water, sorted by `from`. */
  dives: WaterSpan[];
  /** v1.10 (4-2, set by the loader): snow walls and the buried stretches behind them, sorted by `from`. */
  plows: PlowSpan[];
  /** `s` is the distance from the rail start in meters. Outside [0, length] the end tangent is extrapolated. */
  frameAt(s: number): RailFrame;
  inGap(s: number): boolean;
  addGap(from: number, to: number): void;
  removeGap(from: number, to: number): boolean;
}

/** A place on a rail: `at` m along rail `railId`. */
export interface RailPoint {
  railId: string;
  at: number;
}

export interface RailNetwork {
  readonly rails: Map<string, Rail>;
  getRail(id: string): Rail;
  /**
   * v1.11 (PHASE9_CHAPTER5_6 第 3 部 A13): the junction point rail `id` starts at (its parent rail and `at`), or null
   * when it does not start at a junction.
   */
  feeder(id: string): RailPoint | null;
  /** v1.11: the rails whose end merges into rail `id` (`railId` the merging rail, `at` where on `id`), in rails[] order. */
  mergesInto(id: string): readonly RailPoint[];
  /**
   * v1.11 (PR11a, 第 3 部 B6.2): the gates arriving on rail `id` (`railId` the rail whose end is the gate, `at` where
   * the lead car's centre arrives on `id`), in rails[] order.
   */
  portalsInto(id: string): readonly RailPoint[];
}
