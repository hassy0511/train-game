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
  /** Cars in the consist (visual only; the lead car carries the collider). */
  carCount: 3,
  /** Center-to-center spacing between cars (m). */
  carSpacing: 12.5,
} as const;

/**
 * Master controller notches, bottom to top. `speed` is the target (m/s); `brake` is the
 * deceleration used while the lever sits on that notch and the train is faster than the target.
 */
export const LEVER_NOTCHES = [
  { label: 'きゅうブレーキ', speed: 0, brake: 8 },
  { label: 'とまる', speed: 0, brake: 3 },
  { label: 'ゆっくり', speed: 5, brake: 3 },
  { label: 'ふつう', speed: 10, brake: 3 },
  { label: 'はやい', speed: 15, brake: 3 },
  { label: 'びゅーん', speed: 22, brake: 3 },
] as const;
/** Index of the ordinary "stop" notch (the lever rests here after a rewind). */
export const STOP_NOTCH = 1;
/** Index of the hard brake notch. */
export const HARD_BRAKE_NOTCH = 0;
export const SPEED_NOTCHES = LEVER_NOTCHES.map((n) => n.speed);
export const SPEED_LABELS = LEVER_NOTCHES.map((n) => n.label);

export const ACCELERATION = 2; // m/s²
/** Default deceleration (m/s²) used for auto-stops at buffers. */
export const BRAKING = 3;

export const WHISTLE_COOLDOWN = 2.0; // s

/** Show the junction arrows this far before the junction, and lock the choice this close to it. */
export const JUNCTION_ARROW_DISTANCE = 60;
export const JUNCTION_LOCK_DISTANCE = 5;

/** Stop this far before the end of a buffer-ended rail (car front just short of the buffer stop). */
export const BUFFER_MARGIN = TRAIN.length / 2 + 0.5;

/**
 * Station stop rule (overridable per station in the stage JSON). Distances in meters, speed in m/s.
 * A station's `at` is where the train FRONT must stop; `zone` is measured from that line.
 */
export const STOP_RULE = { perfect: 1.0, ok: 6.0, zone: 30, maxSpeed: 13 } as const;

/** The stop gauge appears this far before the stop line. */
export const GAUGE_DISTANCE = 150;

/** How far before the failed target the train is put back after a fail. */
export const REWIND_DISTANCE = 80;

/** Seconds per passenger boarding or alighting. */
export const PASSENGER_SECONDS = 1.5;

/** Seconds a speech bubble stays unless tapped. */
export const BUBBLE_SECONDS = 3.5;

/** Emergency stop: seconds to reach 0 from any speed. */
export const EMERGENCY_STOP_SECONDS = 0.5;

/**
 * Jump: fixed height and air time, so the distance is speed × airTime (ゆっくり 8 m … びゅーん 35 m).
 * The whole consist follows the same arc in space (each car lifts off where the lead car did).
 */
export const JUMP = {
  airTime: 1.6,
  height: 4,
  /**
   * Seconds after landing before the next jump. 0 since 2026-09-24 (1-3 chains jumps island to island);
   * the jump cannot be pressed in the air, so mashing still cannot keep the train aloft.
   */
  cooldown: 0,
  /** Below this speed (m/s) the button is grey. */
  minSpeed: 1,
  /**
   * A jump that would come down inside a gap but within this share of its length of the far edge
   * floats on to the edge instead ("ふわっと"). Keeps the notch choice decisive but forgives timing.
   */
  glide: 0.25,
  /** Rail beyond the gap's far edge the landing needs (m). */
  landingMargin: 1,
  /** The partner names the right notch this far before a gap. */
  hintDistance: 60,
} as const;

/** Jump pad: double the normal distance, higher, and always far enough to land past the next gap (+extra m). */
export const PAD_JUMP = { scale: 2, height: 7, extra: 4 } as const;

/** How fast (m/s²) an updraft speeds the train up. */
export const UPDRAFT_ACCELERATION = 6;

/**
 * Falling into a gap: the lead bogie (2 m behind the car front) running off the rail end starts it.
 * The consist sinks and tips forward, then the screen fades and the train is put back.
 */
export const FALL = { bogieLead: 2, seconds: 0.8, depth: 3.5 } as const;

/** Light: toggled; caps the speed while on and reveals reversed things and records nearby. */
export const LIGHT = { speedScale: 0.7, revealDistance: 40, recordDistance: 25, cooldown: 0.4 } as const;

