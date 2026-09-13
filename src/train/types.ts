import type { Quaternion, Vector3 } from 'three';

export interface TrainPose {
  railId: string;
  s: number;
  speed: number;
  direction: 1 | -1;
  /** Car origin: bottom center at rail-top height. */
  position: Vector3;
  /** +Z is forward, +Y is up. */
  quaternion: Quaternion;
}

export interface TrainState {
  railId: string;
  /** Distance along the current rail (m). */
  s: number;
  speed: number;
  notch: number;
  direction: 1 | -1;
}
