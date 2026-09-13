import { Vector3 } from 'three';

/** Global train parameters. Stage-specific values belong in the stage JSON, not here. */
export const TRAIN = {
  length: 12,
  width: 3,
  height: 3.6,
  /** Distance from the car center to each bogie (m). The body orientation follows the two bogies. */
  bogieOffset: 4,
  /** Driver's eye position relative to the car origin (bottom center). */
  cabCameraOffset: new Vector3(0, 2.4, 4.6),
  cabFovDeg: 60,
} as const;

/** Speed for each notch of the master controller (m/s). Index 0 is "stop". */
export const SPEED_NOTCHES = [0, 5, 12, 20] as const;
/** Kid-facing labels for the notches (hiragana). */
export const SPEED_LABELS = ['とまる', 'ゆっくり', 'ふつう', 'はやい'] as const;

export const ACCELERATION = 2; // m/s²
export const BRAKING = 3; // m/s²

export const WHISTLE_COOLDOWN = 2.0; // s

/** Show the junction arrows this far before the junction, and lock the choice this close to it. */
export const JUNCTION_ARROW_DISTANCE = 60;
export const JUNCTION_LOCK_DISTANCE = 5;

/** Stop this far before the end of a buffer-ended rail (car front just short of the buffer stop). */
export const BUFFER_MARGIN = TRAIN.length / 2 + 0.5;

/** Station stop rule (overridable per station in the stage JSON). Distances in meters, speed in m/s. */
export const STOP_RULE = { perfect: 1.0, ok: 6.0, zone: 30, maxSpeed: 13 } as const;

/** How far before the failed target the train is put back after a fail. */
export const REWIND_DISTANCE = 80;

/** Seconds per passenger boarding or alighting. */
export const PASSENGER_SECONDS = 1.5;

/** Seconds a speech bubble stays unless tapped. */
export const BUBBLE_SECONDS = 3.5;

/** Emergency stop: seconds to reach 0 from any speed. */
export const EMERGENCY_STOP_SECONDS = 0.5;
