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
/**
 * Render resolution (max pixels per CSS pixel), stepped down one at a time while the frame rate stays below
 * RESOLUTION_MIN_FPS for RESOLUTION_SLOW_SECONDS (a slower iPad keeps moving smoothly). Never raised again.
 */
export const RESOLUTION_STEPS = [2, 1.5, 1.25, 1] as const;
export const RESOLUTION_MIN_FPS = 45;
export const RESOLUTION_SLOW_SECONDS = 3;

/** While the game waits for the door button, the partner repeats the ask this often (s). */
export const DOOR_REMIND_SECONDS = 8;

export const BUBBLE_SECONDS = 3.5;

/**
 * v1.7: a refused press (a grey rocket or jump button) says why; the same line again within this many seconds of
 * game time is dropped, so mashing does not queue a copy per tap (one bubble's time).
 */
export const REFUSE_COOLDOWN = BUBBLE_SECONDS;

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
  /**
   * 2-3: while the rocket's push is in the speed, jump, jump-pad and bough distances count it only up to this
   * (m/s), so a rocket-fast train does not fly past the far edge when an earlier stage is played again (an
   * updraft's speed still counts in full: 1-3 needs it).
   */
  maxSpeed: 22,
} as const;

/** Jump pad: double the normal distance, higher, and always far enough to land past the next gap (+extra m). */
export const PAD_JUMP = { scale: 2, height: 7, extra: 4 } as const;

/**
 * A springy bough (2-1): how far its tip hangs under a fast train (m), how far it throws the train (× speed ×
 * JUMP.airTime) and how high, and the spring that bends it (stiffness 1/s², damping 1/s, upward kick at the throw).
 * Stage JSON may override sag, launch and height per bough.
 */
export const BOUGH = { sag: 2.5, launch: 1.8, height: 6, stiffness: 40, damping: 5, kick: 9, fullSpeed: 22 } as const;

/**
 * 2-2: a grasshopper riding on the roof. It hops on `hop` m before its leaf by itself, or when whistled within
 * `whistleRange` m (until `passBy` m past); while it rides the jump goes `power` times as far and `height` m high.
 */
export const GRASSHOPPER = { hop: 25, whistleRange: 60, passBy: 8, power: 2, height: 8, readyDistance: 60 } as const;

/**
 * 2-2: a butterfly that follows the light and opens a flower bridge over a stream. It flies `lead` m ahead of the
 * train front (pushed back to `minLead` when the train is faster than `maxSpeed`), catching up at `catchSpeed`;
 * landing on the bud `bud` m before the stream opens it.
 */
export const FLOWER_BRIDGE = {
  range: 40,
  lead: 12,
  minLead: 4,
  maxSpeed: 8,
  catchSpeed: 20,
  bud: 12,
  recover: 2,
  closedWarn: 60,
  bloomSeconds: 1.5,
  /** After waiting once, it says "it waits" again only after following this long (s). */
  waitAgainAfter: 3,
} as const;

/** 2-2: a sagging silk bridge. Faster than `maxSpeed` (+0.3) for `grace` s and it bounces the train back. */
export const FRAGILE = { maxSpeed: 7.5, grace: 1.0, warn: 80, slack: 0.3 } as const;

/** How fast (m/s²) an updraft speeds the train up. */
export const UPDRAFT_ACCELERATION = 6;

/**
 * Falling into a gap: the lead bogie (2 m behind the car front) running off the rail end starts it.
 * The consist sinks and tips forward, then the screen fades and the train is put back.
 */
export const FALL = { bogieLead: 2, seconds: 0.8, depth: 3.5 } as const;

/** Light: toggled; caps the speed while on and reveals reversed things and records nearby. */
export const LIGHT = { speedScale: 0.7, revealDistance: 40, recordDistance: 25, cooldown: 0.4 } as const;


/**
 * 2-3: the rocket. Each press uses one of `pips` flames and pushes the train at `accel` m/s² up to `speed` m/s for
 * `burn` s, whatever the lever, the light or an uphill pull. Afterwards it slows back to the lever's speed at
 * `settle` m/s² (or the notch's own brake when that is stronger). The button glows `glowAhead` m before an uphill
 * the train cannot climb as it is. It rests `stationQuiet` m before the stop line of the station the train is
 * heading to and `bufferQuiet` m before a buffer stop.
 */
export const ROCKET = { pips: 3, burn: 3, speed: 30, accel: 10, settle: 5, glowAhead: 40, stationQuiet: 200, bufferQuiet: 150 } as const;

/**
 * 2-3: slopes (gimmicks "slope"). Uphill ("steep", pull < 0): the lever cannot climb it; stopped on it the train
 * slips `slipBack` m back in `slipSeconds` s and is put back `rewindBefore` m before the slope. Downhill ("slide",
 * pull > 0): the lever does nothing and the train speeds up to `max` m/s (coming in faster it slows at `overMax`
 * m/s²). The partner names an uphill `nearDistance` m before it.
 */
export const SLOPE = { slipBack: 6, slipSeconds: 1.2, overMax: 3, nearDistance: 60, rewindBefore: 60, max: 20 } as const;

/**
 * 2-3: a countdown on a mission step. `lowAt` s left: the volcano fidgets. Where the train was is noted every
 * `sampleEvery` m; after another fail the time goes back to what it was there, plus `restoreBonus` s. "セーフ！"
 * shows for `safeShow` s. After each time-up the next try has `assist` s more, at most `assistMax` s more.
 */
export const COUNTDOWN = { lowAt: 10, sampleEvery: 5, restoreBonus: 3, safeShow: 1.5, assist: 10, assistMax: 30 } as const;

/**
 * 2-3: a rolling rock (actors "rock-roll", the young dinosaur's rule with a rock's look). It wobbles `warn` m
 * ahead, starts rolling across when the train front is `startDistance` m away and takes `crossSeconds` s from
 * `lateral` m left to `lateral` m right. Reaching it within `dangerDistance` m while it rolls is a "ぽこん". A train
 * waiting within `warn` m, slower than `waitSpeed` m/s for `waitSeconds` s, sees it roll by too (the partner says
 * "まって": waiting further back than `startDistance` must not leave it wobbling for ever).
 */
export const ROCK_ROLL = { startDistance: 60, crossSeconds: 4.5, dangerDistance: 6, lateral: 9, warn: 90, waitSeconds: 1, waitSpeed: 1 } as const;

/** 2-3: a dropping rock (actors "rock-drop"): a shadow `warn` m ahead, then it drops onto the rail `drop` m ahead. */
export const ROCK_DROP = { drop: 35, warn: 60 } as const;

/** 2-3: how long a rock takes to hop off into the sea after rolling across or being bumped (s; view and "ぽちゃん"). */
export const ROCK_SPLASH_SECONDS = 1.6;

/**
 * 2-3: a stage with a "volcano" prop puffs a small smoke ring ("ぽふっ") every `every` s, every `hurry` s while a
 * countdown runs (the volcano gets fidgety), the first `first` s in (PHASE6 2-3 §6.5).
 */
export const VOLCANO_PUFF = { every: 12, hurry: 4, first: 3 } as const;
