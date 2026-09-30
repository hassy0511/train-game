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
 * v1.11 (PR7, PHASE9_CHAPTER5_6 第 3 部 A5): the trail the train has come along (src/train/consist.ts). Each car sits
 * `TRAIN.carSpacing × i` m behind the lead car centre along it, on the right rail also across a junction or a merge.
 * `back`: how far behind the lead car centre a fresh trail (the start, a rewind) is traced through the rails (the tail
 * end, 31 m, plus 2 m). `max`: the longest it gets (older pieces are dropped).
 */
export const TRAIL = { back: 33, max: 2000 } as const;

/**
 * v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A4, PHASE9_0 §5): "うしろむき". The switch beside the lever turns the train
 * round when it stands (`turnSeconds`); pressed while moving it first brakes to a stop at `switchBrake` (a second press
 * cancels). Reversing, any running notch asks for `maxSpeed` (accel `accel`, brake `brake`), and the train retraces its
 * trail. It stops gently (the last `creepBefore` m at `creepSpeed`) where its rear end reaches a stop point: `gapStop` m
 * before a gap or a stretch it flew or dived through, `bufferGap` m before a siding's buffer, exactly at the trail's
 * floor (the last station passed, the stage start, the rewind point, or TRAIL.max m back). A back junction shows arrows
 * `arrowDistance` m before (locked `lockDistance` m before); the switch glows for `glowAfter` m past one worth it.
 * `nudgeSeconds`: reversed with the lever at "とまる" this long, the partner says to raise it. `stopLineEvery`: past a
 * station and standing, "うしろで もどって" again this often. Sidings are `spurMin`–`spurMax` m long; at the mouth the
 * siding's end and the rail's +s differ by `mouthAngleMax`° at most; the mouth keeps `mouthBefore` m before and
 * `mouthAfter` m after it clear, `mouthStation` m from a stop line, `mouthPortal` m from a portal. An overshot station
 * stays to back up to until `overshootGiveUp` m past. The rear window camera is `rearCamOut` m behind the rear end. A
 * jump reversing is a hop of `hopHeight` m for `hopSeconds` s.
 */
export const REVERSE = {
  maxSpeed: 5,
  accel: 1.5,
  brake: 3,
  switchBrake: 3,
  turnSeconds: 0.5,
  creepBefore: 2,
  creepSpeed: 0.5,
  gapStop: 1.0,
  bufferGap: 0.5,
  arrowDistance: 40,
  lockDistance: 5,
  glowAfter: 80,
  nudgeSeconds: 6,
  stopLineEvery: 20,
  spurMin: 46,
  spurMax: 150,
  mouthAngleMax: 30,
  mouthBefore: 40,
  mouthAfter: 60,
  mouthStation: 40,
  mouthPortal: 80,
  overshootGiveUp: 60,
  rearCamOut: 0.3,
  hopHeight: 0.3,
  hopSeconds: 0.35,
  /** The rear end of the train, back from the lead car centre (m): half a car and two spacings. */
  tail: 6 + 12.5 * 2,
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
export const LIGHT = { speedScale: 0.7, revealDistance: 40, cooldown: 0.4 } as const;

/**
 * v1.11 (PR5, PHASE9_CHAPTER5_6 第 2 部 M4 and PHASE9_0): the magnet light is the third step of the light button (off →
 * light → magnet → off). In the magnet step the nearest iron target on the train's route, `minAhead` (or its offset) to
 * `reach` m ahead (bridge/gate: 0 to `reach` m before its face), is pulled, one at a time: `pullBase` + distance /
 * `pullRate` s (between `pullMin` and `pullMax`) while the speed target is scaled by `pullScale`; a gap closed, a gate
 * opened or a mirror turned counts at the pull's start. Outside the magnet step the light button glows green from
 * `hintAhead` m before a target still waiting (pick targets not within `stationQuiet` m of the stop line the train is
 * braking for). Without the pull an open gap or a shut gate bounces the train (`bounceSeconds`, `bounceBack` m; in the
 * air too) and it is put back `rewindBefore` m before. The green beam reaches `beamRange` of the light's extra distance
 * in fog, night and tunnels. A fetched thing stops `catchGap` m before the lamp and goes back in `returnSeconds`.
 * Targets glint white every `glint` s; `maxOffset` is the furthest a target may be from its rail, `spacing` the least
 * between two on a rail. The checks: gap and gate zones `zoneBefore`..`zoneAfter`, gaps `gapMin`–`gapMax` m, side-way
 * faces `sideWayMin` m past their fork.
 */
export const MAGNET = {
  hintAhead: 80,
  reach: 50,
  minAhead: 4,
  maxOffset: 20,
  spacing: 30,
  glint: 2.0,
  pullBase: 0.6,
  pullRate: 40,
  pullMin: 0.8,
  pullMax: 2.0,
  pullScale: 0.5,
  catchGap: 2.5,
  bounceSeconds: 0.5,
  bounceStop: 0.15,
  bounceBack: 3,
  rewindBefore: 60,
  zoneBefore: 120,
  zoneAfter: 40,
  gapMin: 4,
  gapMax: 16,
  sideWayMin: 60,
  stationQuiet: 80,
  returnSeconds: 1.2,
  beamRange: 0.5,
  /** A turn target's pull must end this far before its fork, and this much of it must be left after a dead end's rewind. */
  turnBefore: 40,
  turnWindowAfterRewind: 30,
  /** How far along the way from its fork a `needs: "magnetLight"` side way must have a target. */
  needsReach: 400,
} as const;

/**
 * v1.11 (PR5, PHASE9_0 §3, 第 2 部 M3.4): iron odds and ends by the line that the magnet step tugs at ("びよん" …
 * "からん"). Scattered about every `every` m (± `jitter`) along every rail, `lateralMin`–`lateralMax` m out, sides by
 * turns, `max` a stage, kinds by `weights`; kept `clearStation`/`clearGap`/`clearTarget`/`clearJunction` m from stop
 * lines, gaps, magnet targets and forks, and off rails higher than `groundMax` m above the ground. In the magnet step
 * (no target being pulled) the nearest one `nearest`..`reach` m ahead and within `sideMax` m of the rail flies over in
 * `flySeconds`, sticks for `stickSeconds` and drops off, rolling for `rollSeconds`; a bell stretches out for
 * `bellHold` s. One at a time, `gapSeconds` between.
 */
export const IRON_PROPS = {
  every: 140,
  jitter: 40,
  lateralMin: 3.5,
  lateralMax: 6,
  max: 40,
  weights: { can: 5, bucket: 3, bell: 2 },
  reach: 25,
  nearest: 3,
  sideMax: 7,
  flySeconds: 0.4,
  stickSeconds: 2.0,
  rollSeconds: 1.5,
  bellHold: 1.0,
  gapSeconds: 1.0,
  clearStation: 60,
  clearGap: 40,
  clearTarget: 60,
  clearJunction: 30,
  groundMax: 1.5,
  /** The bell of a sign hangs this high (m above the ground). */
  bellHeight: 1.35,
} as const;

/**
 * Records (v1.8): found when the train front passes within `distance` m (along the rail for a record placed on a
 * rail) while using the ability it needs: the light on, in the air for the jump, the rocket burning or its push
 * still in the speed. The partner's `hint` for a record comes `hintDistance` m before it.
 */
export const RECORD = { distance: 25, hintDistance: 60 } as const;


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

/**
 * The title screen's camera swinging around the train standing at the start (PHASE7_FINISH §4 item 6): m, degrees
 * either way, s for one to-and-fro. It swings on the side away from the start station's platform (main.ts), looking `lift` m
 * above the train's middle so the train sits low, under the title. Slow on purpose: it is a backdrop, not a ride.
 */
export const TITLE_ORBIT = { radius: 30, height: 9, lift: 4.5, swingDeg: 28, seconds: 48 } as const;

/**
 * v1.10 (chapter 3): diving ("もぐる"). A rail stretch is on the water surface where its top is within `surfaceAbove`
 * m above to `submerge` m below the surface, and under water where it is `submerge` m or more below (inside the
 * water's area). "もぐる" has its own button (PHASE9_0); the hint (`near`) starts `approach` m before a surface
 * stretch or a dive fork (along the way the train will go).
 * On a surface stretch each press dives: a downward arc `depth` m deep and speed × `time` s long (at least
 * `minLength` m; up to `glide` of its length longer to pass under a floater just past its deep part), the bubble dome
 * on; the next press is allowed `cooldown` s after the front comes up ("ぷかっ"). Slower than `minSpeed`, under water
 * a press only bobs the train (`bobDepth` m for `bobSeconds` s, no rule); on land it digs in like a mole (`digDepth` m,
 * PHASE9_0 §3), never counted as diving. A dive fork within `forkReach` m
 * of its dive side going under water; under water the dome stays on.
 * Bumping a floater (or reaching water without the dome) is a soft "ぽよん": stopped in `bounceStop` s, bounced back
 * `bounceBack` m over `bounceSeconds` s, and put back `rewindBefore` m before it.
 * `recordGlow`: the button also glows with a dive record this close ahead.
 */
export const DIVE = {
  surfaceAbove: 1.5,
  submerge: 1.0,
  depth: 6,
  time: 2.0,
  minLength: 8,
  minSpeed: 1,
  glide: 0.25,
  cooldown: 0.6,
  approach: 80,
  forkReach: 60,
  bobDepth: 0.6,
  /** PHASE9_0 §3: a press on land digs the train in like a mole, this deep (m), over bobSeconds. */
  digDepth: 1.2,
  bobSeconds: 0.9,
  bounceStop: 0.15,
  bounceBack: 3,
  bounceSeconds: 0.5,
  rewindBefore: 60,
  recordGlow: 30,
  /** The glow looks this far ahead for a floater (m). */
  hintDistance: 60,
  /** Room (m) over the train's roof a floater needs, on top of its `draft`. */
  headroom: 0.2,
} as const;

/**
 * v1.10 (chapter 4): the snowplow ("ゆきかき", its own button since PHASE9_0). Its button glows from `approach` m before
 * an unburst snow wall or snow still to clear (along the way the train will go) until pressed; a press lowers the
 * blade (counted as down at once; the view takes `dropSeconds`). Down, it bursts walls and clears buried stretches; it
 * rises once no snow is left within `approach` m ahead. Pressed with no snow ahead it is play: down for `playSeconds`,
 * flinging petals. Without it the wall stops the train ("ぽすっ": `bumpStop` s to stop, `bumpIn` m in, then `bumpBack`
 * m back over `bumpSeconds` s) and it is put back `rewindBefore` m before the wall; a jump does not clear a wall. A
 * burst wall and its stretch stay cleared for the rest of the stage run (rewinds included). The loader's checks keep
 * creatures off the track from `zoneBefore` m before a wall to `zoneAfter` m after its stretch, a gap's landing out of
 * the `zoneBefore` m before it, jump pads `padBefore` m away, a side way's wall `sideWayMin` m past its junction and a
 * wall `slopeGap` m before an uphill in its stretch. While plowing the snow is thrown aside with a "ざざっ" every
 * `sprayEvery` s.
 */
export const PLOW = {
  approach: 80,
  playSeconds: 1.2,
  dropSeconds: 0.25,
  riseSeconds: 0.3,
  bumpStop: 0.15,
  bumpSeconds: 0.5,
  bumpIn: 1.5,
  bumpBack: 2,
  rewindBefore: 60,
  wallDepth: 4,
  zoneBefore: 120,
  zoneAfter: 40,
  padBefore: 200,
  sideWayMin: 60,
  slopeGap: 50,
  stationGap: 20,
  sprayEvery: 0.3,
  /** Seconds of the soft "ぽすっ" before the fade: the snowy window and the wiper's two wipes. */
  splatSeconds: 1.2,
} as const;

/** v1.10: floaters by look: default length along the rail (m) and how deep they reach under the surface (m). */
export const FLOATER: Record<'log' | 'raft' | 'lily' | 'wave' | 'ice', { length: number; draft: number }> = {
  log: { length: 2.4, draft: 0.6 },
  raft: { length: 6, draft: 0.5 },
  lily: { length: 4, draft: 0.2 },
  wave: { length: 5, draft: 0.8 },
  ice: { length: 4, draft: 0.7 },
};

/**
 * v1.10 (3-1): a whale beside the rail (actors "whale"). The whistle glows from `callRange` m before it while it can
 * be greeted; the partner points it out `near` m before (callRange + 10). Greeted, it sings for `singSeconds` s and
 * swims along `lead` m ahead of the train front, `lateral` m to the right (negative = left) and `height` m over the
 * rail; not greeted, it trails `trail` m behind. It catches up or drops back at up to `catchSpeed` m/s beyond the
 * train's own speed. Stage JSON overrides callRange, lead, lateral, height and trail per whale.
 */
export const WHALE = { callRange: 80, near: 90, lead: 10, lateral: -12, height: 4, trail: 30, singSeconds: 1.6, catchSpeed: 8 } as const;

/**
 * v1.10 (3-1): bubble forks (junctions[].bubbles). Columns of bubbles stand `columns` m along each way out; the
 * partner points the fork out `nearDistance` m before it. With the light on, a sinking column's swirl lights up within
 * LIGHT.revealDistance of the fork. In a fog stretch the light button glows from `lightGlow` m before a bubble fork,
 * and after the sinking side was taken, from `wrongGlow` m before that fork.
 */
export const BUBBLE_FORK = { columns: [12, 28], nearDistance: 90, lightGlow: 100, wrongGlow: 80 } as const;

/**
 * v1.10 (4-1): ice ("こおり", gimmicks "ice"). On ice the lever's brakes (every notch's, the hard brake's and the automatic
 * stop before a buffer) work `grip` times as hard; nothing else changes (speeding up, the game's own sudden stops,
 * the rocket). At a station whose stop line is on ice the lever's notches glow in two steps: "ゆっくり" once the rest
 * of the way is what slowing to `slowSpeed` takes plus the stop zone and `slowMargin` m, then "とまる" `stopLead` m
 * before the place where "とまる" now would stop the train. `sparkle`: seconds of the wheels' ice dust after the
 * speed stops dropping.
 */
export const ICE = { grip: 0.4, slowSpeed: 5, slowMargin: 40, stopLead: 5, sparkle: 1 } as const;

/**
 * v1.10 (4-1): thin ice ("うすい こおり", gimmicks "thin-ice"). While the train is on it (the front past its start, the
 * last bogie not yet past its end, not in the air), slower than `minSpeed` m/s for `grace` s it breaks under the
 * train ("ぽちゃん", fail "crack"): the cars sink `sink` m and bob back up to `bob` m, and the train goes back `rewindBefore`
 * m before it. Only the rocket is fast enough. The rocket button glows from `glowAhead` m before it while a press now
 * would carry the train across (worked out ahead in `predictStep` s steps for up to `predictSeconds` s). Its line comes
 * `warn` m before it. Behind the last bogie the ice breaks into floes after `breakAfter` s and freezes again after
 * `refreeze` s.
 */
export const THIN_ICE = {
  minSpeed: 24,
  grace: 0.8,
  glowAhead: 80,
  /** No press gets across (a long stretch met almost stopped): glow from this far before it (the furthest a press reaches). */
  fallbackAhead: 20,
  warn: 120,
  rewindBefore: 150,
  breakAfter: 0.3,
  refreeze: 4,
  sink: 0.8,
  bob: 0.4,
  predictStep: 1 / 30,
  predictSeconds: 8,
  /** A second press in the prediction comes this long after the first burn ends (s). */
  repress: 0.3,
  /** From the train front to its last bogie (m): the train is on the ice until that has passed its end. */
  rear: TRAIN.carSpacing * (TRAIN.carCount - 1) + TRAIN.bogieOffset + TRAIN.length / 2,
} as const;

/**
 * v1.10 (4-1): ice mirrors (gimmicks "mirror"). The nearest mirror within `range` m, with the train on its front side,
 * shows the train (and nearby things) reflected. With the light on and the mirror ahead within `flashRange` m it
 * flashes ("きらーん"). A mirror at a junction lights the light button `hintDistance` m before the junction; on its false
 * way the partner calls out `fakeWarn` m before the mirror. `tint`: the glass's light blue over the reflection.
 */
export const MIRROR = { range: 260, flashRange: 200, reflectRadius: 80, hintDistance: 100, fakeWarn: 45, tint: 0.25, flashCone: 40 } as const;

/**
 * v1.11 (5-3): the mirror world (PHASE9_CHAPTER5_6 第 6 部 §4.7). A "mirror-flip" stretch shows the 3D view mirrored left
 * to right (CSS on the canvas's box; the DOM UI never flips) from the train front passing its entry gate to passing its
 * exit gate, the switch hidden in a `fade` s shimmer. An "open" gate ripples from `openRipple` m. A "whistle" gate glows
 * the whistle from `gateApproach` m while shut; reaching it shut, the train bounces (`bounceSeconds`, `bounceBack` m)
 * and is held `gateHold` m before it until a whistle opens it (not a fail): the train touches the soft glass
 * `gateHold − bounceBack` m before its face, so the bounce ends right at the hold. A stretch is `flipMin`–`flipMax` m
 * long, `flipSpacing` m from the next on its rail, with nothing to choose or fail at from `flipClearBefore` m before it
 * to `flipClearAfter` m after it. Phantoms (a false way's rail, a false bridge over a gap) are never reflected; the light
 * pops them within LIGHT.revealDistance m, a jump from within `phantomTakeoff` m pops a false bridge (in `phantomPop`
 * s), a false way fades to sparkles over its last `phantomFade` m (no shiver), and they come back after a rewind (as
 * reveals do); its cushion shows from `cushionSeen` m. Glass stretches show `glassOpacity` directly and plain rails in
 * mirrors. A turned-away mirror spins round in `turnSeconds` s (a cutscene's mirrorTurn in `fxTurnSeconds` s), and a
 * magnet "turn" target keeps at least `turnWindowAfterRewind` m of its pull after the dead end's rewind.
 */
export const MIRROR_WORLD = {
  fade: 0.35,
  openRipple: 30,
  gateApproach: 80,
  gateHold: 4,
  bounceSeconds: 0.5,
  bounceBack: 3,
  flipMin: 150,
  flipMax: 400,
  flipSpacing: 200,
  flipClearBefore: 20,
  flipClearAfter: 60,
  phantomTakeoff: 60,
  phantomPop: 0.6,
  phantomFade: 30,
  cushionSeen: 60,
  glassOpacity: 0.28,
  turnSeconds: 0.6,
  fxTurnSeconds: 0.8,
  turnWindowAfterRewind: 30,
  /** The gates' size (m) when the stage does not say. */
  gateWidth: 14,
  gateHeight: 10,
  /** A gate reflects the train (like a mirror) from this far (m). */
  gateRange: 140,
} as const;

/**
 * v1.10 (3-2): waterfalls (gimmicks "waterfall", looks and sound only). Defaults for its params: the water is thrown
 * `throw` m out from the lip, the rock ledge juts `lip` m, the curtain lets `sheetOpacity` of the light through. Its
 * "さーーっ" is heard from `hearFar` m and loudest within `hearNear` m. A car whose roof is between the lip and the
 * curtain gets the shower ("ざーっ").
 */
export const WATERFALL = { throw: 8, lip: 1, rainbow: false, sheetOpacity: 0.55, hearFar: 350, hearNear: 40 } as const;

/** v1.10 (3-2): a leaping school (flock mode "leap"): each one jumps `height` m out of the water for `seconds` s, every `every` s or so. */
export const LEAP = { height: 1.2, seconds: 0.8, every: 5 } as const;

/**
 * v1.10 (3-3): the festival (cutscene fx "festival"): it takes `seconds` s; `bursts` glowing balls come up from the
 * sea; the jellyfish lanterns rise `jellyRise` m; the moon comes up in `moonRise` s.
 */
export const FESTIVAL = { seconds: 2.5, bursts: 3, jellyRise: 3, moonRise: 0.8 } as const;

/**
 * v1.10 (4-3): the snow wave (a mission step's `chase`, PHASE8 第 8 部 §4.1). It comes out `start` m behind the train's
 * last car (`trainLength` m behind the front) once the front passes the chase's `from`, and runs at `pace` m/s (or a
 * `paces` stretch's speed) along the train's way. Further back than `far` m it closes in at the train's speed +
 * `bandLead` (up to `bandMax` m/s), so a fast child still sees it. Each catch slows it `assist` m/s (never below
 * `minPace`); after `giveUpAfter` catches it runs at most `tiredPace` m/s (the fourth try always gets away). It
 * speeds up by `accel` m/s² (slowing at once). Caught (the gap closed on the ground), the train goes back to the
 * nearest `retry` place at least `retryBehind` m behind; after any fail the wave waits `restart` m behind the last car
 * and starts again (from 0) once the train moves faster than `moveToStart` m/s. Closer than `near` m: "もこもこが
 * くる！" and the white at the screen edge; closer than `rocketGlow` m the rocket glows (when a flame is left over for
 * the uphills still ahead); closer than `leverHintGap` m below `fastSpeed` m/s the "はやい" notch glows; further than
 * `farLine` m: "はなれた！". Past `until` it runs into the fence and settles into a low heap in `settleSeconds` s. The
 * panel shows the gap over `meter` m.
 */
export const SNOW_WAVE = {
  start: 40,
  restart: 45,
  pace: 12,
  far: 25,
  bandMax: 20,
  bandLead: 1,
  accel: 3,
  near: 20,
  farLine: 60,
  rocketGlow: 15,
  leverHintGap: 25,
  fastSpeed: 15,
  assist: 3,
  minPace: 4,
  giveUpAfter: 3,
  tiredPace: 4,
  retryBehind: 30,
  trainLength: 37,
  moveToStart: 1,
  settleSeconds: 1.5,
  meter: 60,
  /** The "もこもこ" sound comes again every this many seconds while the wave is within `farLine` m. */
  soundEvery: 2.2,
} as const;

/**
 * v1.10 (4-3): tunnels (gimmicks "tunnel"): an arched tube `width` × `height` m round the track, a ring every `ring` m
 * of `segments` pieces; inside, the fog and the light ease to the tunnel's in about `fade` s. Defaults of its
 * params: `near`, `far` (the light on: `lightFar`) m, `fogColor`, the light `dim`s to this share, the light button
 * glows from `lightGlow` m before it (light off) until it is left.
 */
export const TUNNEL = {
  width: 9,
  height: 8,
  ring: 4,
  segments: 12,
  fade: 0.4,
  near: 2,
  far: 18,
  lightFar: 60,
  fogColor: '#1c2433',
  dim: 0.35,
  lightGlow: 60,
} as const;

/**
 * v1.11 (5-1, PHASE9_CHAPTER5_6 第 4 部 §4.7): the night preset. The lights sum to 70% of the day's (hemisphere 0.9 +
 * sun 1.2): a blue moonlight, never darker (第 1 部 §9). `windowGlow`: the cars' warm windows. (The light's
 * beam is not made stronger at night: it fades out along its length instead, 2026-09-30.)
 */
export const NIGHT = {
  hemiSky: '#b8c6ff',
  hemiGround: '#34406a',
  hemi: 0.85,
  moonColor: '#dfe7ff',
  moon: 0.62,
  windowGlow: 0.6,
} as const;
/**
 * v1.11 (5-1): a hush stretch (つきの はらっぱ, gimmicks "hush"). The light button glows (press = off) from `glowBefore`
 * m before it while the light is on; the sleepers hide after `startleAfter` s of light inside it (or a whistle), in
 * `hideSeconds`. The fawn's rewind is `rewindBefore` m before it by default; after `mercyAfter` fawn fails in a row
 * there the fawn crosses even with the light on.
 */
export const HUSH = { glowBefore: 70, startleAfter: 0.8, rewindBefore: 70, hideSeconds: 0.4, mercyAfter: 2 } as const;
/** v1.11 (5-1): a dazzled fawn blinks `blink` s after the light goes off and hops off the rail in `hopOff` s. */
export const GLARE = { blink: 0.2, hopOff: 0.6, toMiddle: 0.5, bump: 0.5 } as const;
/**
 * v1.11 (5-1): whistle-reversed stretches. A whistle brings a lure group onto the rail only when it is further than
 * v²/(2×BRAKING) + v × `reaction` + `margin` m ahead; it comes in `hop` s and dances `dance` s (+`extend` per
 * whistle, up to `danceMax`). Within `dangerDistance` m of a group on the rail the train stops (a soft fail). The
 * "stopped" of "ばいばい" is below `stopSpeed` m/s; the default way back is `rewindBefore` m before the stretch; a group
 * is 1–`countMax` little ones; after `mercyAfter` fails in a row there the groups dance in the bushes only.
 */
export const LURE = {
  reaction: 2.0,
  margin: 8,
  hop: 0.8,
  dance: 5,
  extend: 1,
  danceMax: 8,
  dangerDistance: 8,
  stopSpeed: 0.3,
  rewindBefore: 60,
  countMax: 4,
  mercyAfter: 2,
  nearBefore: 60,
} as const;
/**
 * v1.11 (5-1): firefly forks (junctions[].fireflies): the whistle glows `callTo`–`callFrom` m before the fork; `count`
 * fireflies fly up and line the first `trail` m of the true way in `fly` s. A fake fork lights the light button from
 * `fakeGlow` m before it until the light has seen through it. The resting fireflies sit in the grass `grass` m before.
 */
export const FIREFLY_FORK = { callFrom: 100, callTo: 15, count: 24, trail: 80, fly: 1.2, fakeGlow: 80, grass: [10, 30], rest: 6 } as const;
/** v1.11 (5-1): ambient fireflies round the camera (environment.fireflies defaults and the most there may be). */
export const AMBIENT_FIREFLIES = { count: 160, radius: 60, max: 400 } as const;

/**
 * v1.11 (5-2, PHASE9_CHAPTER5_6 第 5 部 §4.6): reverse-wound toys (cat looks "windup-*"): the key turns back in
 * `keySeconds` when whistled; they walk back towards the train from `walkFrom` m (unless their params say otherwise).
 * The whistle glows for one from its dangerDistance to its wakeDistance; toys within `group` m of one it winds are wound
 * with it (one whistle for three chicks walking together). `townKey`: the cutscene figure whose winding
 * (press fx "windup") winds the whole town (the props with `windup`, #app[data-town="wound"]).
 */
export const WINDUP = { keySeconds: 0.8, walkFrom: 150, townKey: 'castle-key-back', group: 12 } as const;

/**
 * v1.11 (5-2): the band ("parade" actor). Unwound, it walks back `backSpeed` m/s from `backFrom` m and stops
 * `stopAhead` m beyond `gap`; the whistle (glowing within `callRange`..`callMin` m) winds it (`turnSeconds`) and it
 * marches at `speed`. The train behind never comes nearer than `gap` m: its speed target is held to
 * √(v² + 2·`approachBrake`·(d − gap)), and while the band marches also to v + `catchUp` + `catchUpPerMetre`·(d − gap)
 * (so a train starting from behind the band does not run up past 5.6 m/s; the design's test limit). More than
 * `waitGap` m ahead the band marks time. At `exit` the members leave the rail in `exitSeconds`. The partner points it
 * out `near` m off, asks again every `callAgain` s while held, says paradeWait after `waitSay` s standing, and
 * paradeMatch after `matchSeconds` s at the lever's "ゆっくり"; the lever's notch glows within `hintRange` m.
 */
export const PARADE = {
  spacing: 3,
  backSpeed: 1.0,
  backFrom: 150,
  stopAhead: 4,
  speed: 5,
  gap: 14,
  approachBrake: 2.5,
  catchUp: 0.3,
  catchUpPerMetre: 0.03,
  callRange: 90,
  callMin: 8,
  waitGap: 40,
  turnSeconds: 1.2,
  exitSeconds: 2.4,
  callAgain: 8,
  waitSay: 6,
  matchSeconds: 3,
  near: 130,
  hintRange: 40,
} as const;

/**
 * v1.11 (5-2): spinning forks (junctions[].spin). Asleep, pointing away from the good side, until the front is
 * `range` m off; then `stay` s a side, turning over in `turn` s. The whistle glows while it points the good way and
 * the front is `range`..`minGlow` m off; a press fixes it. The way is decided when the front is `lockAt` m before it
 * (a car length before the train's own lock); it holds until the front is `holdAfter` m past. After `mercy` passes on
 * the other side it waits on the good side.
 */
export const SPIN = { range: 120, stay: 4, turn: 1, minGlow: 12, lockAt: 5, holdAfter: 40, mercy: 1 } as const;
