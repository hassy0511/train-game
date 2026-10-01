import type { Quaternion, Vector3 } from 'three';

export interface CarPose {
  position: Vector3;
  quaternion: Quaternion;
}

export interface TrainPose {
  railId: string;
  /** Lead car center along the rail (m). */
  s: number;
  speed: number;
  direction: 1 | -1;
  /** Lead car origin: bottom center at rail-top height. */
  position: Vector3;
  /** +Z is forward, +Y is up. */
  quaternion: Quaternion;
  /** Trailing cars, nearest first (visual only). */
  cars: CarPose[];
  /** v1.11 (PR8a): the last car (the same object as the last of `cars`): the rear window camera, the rear lamps. */
  tail: CarPose;
}

export interface TrainState {
  railId: string;
  /** Distance along the current rail (m). */
  s: number;
  speed: number;
  notch: number;
  direction: 1 | -1;
}
