import type { Quaternion, Vector3 } from 'three';
import type { RailNetwork } from '../rail/types';

/** Stage JSON schema v1 (additions up to v1.7). See docs/STAGE_SCHEMA.md (Japanese) for the authoring reference. */
export type Vec3 = [number, number, number];

export type AbilityId = 'whistle' | 'light' | 'jump' | 'rocket' | 'dive' | 'magnetLight' | 'reverse';

export interface EnvironmentDef {
  sky: { top: string; bottom: string };
  fog: { color: string; near: number; far: number } | null;
  lighting: 'day' | 'evening' | 'night' | 'cave';
  ground: { y: number; size: number; color: string } | null;
  /** Song id in src/audio/songs.ts (Phase 4), or null for silence. */
  bgm: string | null;
  /** v1.3: how a fall looks: "dark" (default, fade to black) or "cloud" (caught by a cloud, fade to white). */
  fall?: 'dark' | 'cloud' | 'leaf';
  /** v1.3: a soft sea of clouds far below (stages in the sky). */
  cloudSea?: { y: number };
}

export type RailEndDef =
  | { type: 'buffer' }
  | { type: 'merge'; railId: string; at: number }
  | { type: 'open' };

/** Lever notch the partner recommends for a jump (v1.2). */
export type JumpHint = 'normal' | 'fast' | 'max';

export interface GapDef {
  from: number;
  to: number;
  /** v1.2: the notch that clears this gap; the partner names it before the gap. */
  hint?: JumpHint;
  /** v1.3: where the train front goes back to after falling here (default: 80 m before the gap). */
  rewind?: { railId: string; at: number };
  /** v1.6: false = no dark pit drawn under it (a gap over water). Default true. */
  pit?: boolean;
  /** v1.6 (set by the loader): this gap is the stream a flower bridge (gimmicks[bridge]) closes. */
  bridge?: number;
}

export interface RailDef {
  id: string;
  points: Vec3[];
  up?: Vec3;
  gaps?: GapDef[];
  oneWay?: boolean;
  /** v1.2: a wrong turn. Reaching its buffer puts the train back before the junction. */
  deadEnd?: boolean;
  /** v1.3: "follow" = up turns with the rail's bends (vertical loops, riding upside down). Default "fixed". */
  upMode?: 'fixed' | 'follow';
  /** v1.6: how the track looks: "rail" (default: rails, sleepers, ballast) or "silk" (spider-silk threads). */
  look?: 'rail' | 'silk';
  /** v1.7: rock under the track, so a line along a slope does not float (looks only). */
  base?: RailBaseDef;
  end: RailEndDef;
}

/**
 * v1.7: the rock the track sits on. `depth`: the bed reaches this many metres down (default 3); `toGround`: it
 * reaches the ground plane, wider at the bottom (a ridge). `skip`: stretches without it (an arch, a bridge).
 */
export interface RailBaseDef {
  look: 'rock';
  depth?: number;
  toGround?: boolean;
  skip?: { from: number; to: number }[];
}

export interface JunctionDef {
  id: string;
  railId: string;
  at: number;
  left?: string;
  right?: string;
  default: 'left' | 'right';
  signReversed?: boolean;
}

export interface StopRule {
  /** |offset| within this many meters counts as a perfect stop. */
  perfect: number;
  /** |offset| within this many meters counts as an acceptable stop. */
  ok: number;
  /** Distance before the stop mark where the station zone begins. */
  zone: number;
  /** Entering the zone faster than this (m/s) fails immediately. */
  maxSpeed: number;
}

export interface StationDef {
  id: string;
  name: string;
  railId: string;
  at: number;
  tolerance?: number;
  platformSide: 'left' | 'right';
  /** Overrides for the global stop rule (all fields optional). */
  stop?: Partial<StopRule>;
}

export interface WorldPlacement {
  position: Vec3;
  rotationY?: number;
  /** Full euler rotation in degrees (XYZ). Takes precedence over rotationY. */
  rotation?: Vec3;
}

export interface RailPlacement {
  onRail: { railId: string; at: number; lateral?: number; heightFromRail?: number };
  rotationY?: number;
  rotation?: Vec3;
}

export type Placement = WorldPlacement | RailPlacement;

export type PhysicsType = 'none' | 'static' | 'dynamic' | 'sensor';

export type PropDef = Placement & {
  model: string;
  scale?: number;
  physics?: PhysicsType;
  /** v1.7: a name a cutscene can refer to (cutRail "props": these fall with the cut track). */
  tag?: string;
};

export type ReactsTo = 'whistle' | 'light' | 'none';

export type ActorDef = Placement & {
  id: string;
  type: string;
  size?: Vec3;
  reactsTo: ReactsTo;
  reversed?: boolean;
  params?: Record<string, unknown>;
};

export type RecordDef = Placement & {
  id: string;
  name: string;
  requires: AbilityId | null;
  /** v1.2: model shown in the world and in the picture book. */
  model?: string;
  /** v1.2: one line for the picture book. */
  note?: string;
};

/**
 * v1.7: a countdown over one step's drive (2-3 M3). It starts when the drive to this step's station starts and stops
 * once the train front passes `until` (default: the station's stop zone). Out of time: back to where the step started
 * with `assist` s more per time-up (at most `assistMax` s more).
 */
export interface CountdownDef {
  seconds: number;
  until?: { railId: string; at: number };
  /** Default COUNTDOWN.assist (10). */
  assist?: number;
  /** Default COUNTDOWN.assistMax (30). */
  assistMax?: number;
  /** The picture on the panel: "volcano" (default) or "clock". */
  icon?: 'volcano' | 'clock';
  /** Song while counting (src/audio/songs.ts); the stage's own song comes back afterwards. */
  music?: string;
}

export interface MissionStep {
  stationId: string;
  /** v1.7: a countdown while driving to this station. */
  countdown?: CountdownDef;
  /** Passengers boarding here. */
  board?: number;
  /** Passengers alighting here. */
  alight?: number;
  /** Parcel handling at this station. */
  parcel?: 'load' | 'unload';
  /** A passenger says this while alighting/boarding (story hook). */
  say?: string;
  /** The partner's reply to `say`. */
  reply?: string;
}

/** A partner line said once when the train front passes `at` on `railId`. */
export interface HintDef {
  railId: string;
  at: number;
  text: string;
}

/** Partner lines keyed by situation. Missing keys mean the partner stays quiet. */
export type MissionLines = Partial<
  Record<
    | 'start'
    | 'moving'
    | 'stationNear'
    | 'tooFast'
    | 'overshoot'
    | 'short'
    | 'perfect'
    | 'ok'
    | 'doorOpen'
    | 'doorClosed'
    | 'doorsOpenLever'
    | 'catNear'
    | 'catWoke'
    | 'catDanger'
    | 'catDangerAfter'
    | 'signReversed'
    | 'gauge'
    | 'hardBrake'
    | 'complete'
    // v1.2
    | 'gapNear'
    | 'jumpStopped'
    | 'fellShort'
    | 'fellNoJump'
    | 'dinoNear'
    | 'dinoWoke'
    | 'dinoDanger'
    | 'dangerAfter'
    | 'smallCrossing'
    | 'bigDinoNear'
    | 'signNear'
    | 'signRevealed'
    | 'deadEnd'
    | 'recordFound'
    // v1.3
    | 'padGone'
    | 'padAppear'
    // v1.5
    | 'nutHit'
    | 'nutNear'
    | 'boughJump'
    | 'squirrelNear'
    | 'squirrelDropped'
    // v1.6 (2-2)
    | 'hopperNear'
    | 'hopperOn'
    | 'hopperReady'
    | 'hopperDone'
    | 'hopperFell'
    | 'butterflyNear'
    | 'butterflyFollow'
    | 'butterflyWait'
    | 'butterflyFast'
    | 'budClosed'
    | 'bridgeOpen'
    | 'bridgeFell'
    | 'fragileNear'
    | 'fragileShake'
    | 'fragileBoing'
    | 'fragileBoingAfter'
    | 'fragileClear'
    | 'fellLight'
    // v1.7 (2-3)
    | 'steepNear'
    | 'rocketReady'
    | 'rocketGo'
    | 'rocketAgain'
    | 'rocketLever'
    | 'rocketEmpty'
    | 'rocketQuiet'
    | 'slip'
    | 'slipEmpty'
    | 'slipAfter'
    | 'slipEmptyAfter'
    | 'noBrake'
    | 'noBrakeLever'
    | 'rockNear'
    | 'rockDrop'
    | 'rockHit'
    | 'timerStart'
    | 'timeLow'
    | 'timeSafe'
    | 'timeUp'
    // v1.4
    | 'doorAsk'
    | 'doorsClosedLever',
    string
  >
>;

export interface MissionDef {
  id: string;
  type: 'deliver' | 'pickup' | 'repair' | 'timed';
  title: string;
  /** Stations visited in order; the last one is the goal. */
  steps: MissionStep[];
  lines?: MissionLines;
  hints?: HintDef[];
  timeLimit?: number;
  /** Cutscene id to play after completion. */
  onComplete?: string;
  params?: Record<string, unknown>;
}

export type Speaker = 'partner' | 'amanojaku' | 'passenger';
export type Emote = 'jump' | 'tilt' | 'cheer';

export type CutsceneStep =
  /** v1.6 `name`: the name shown on the bubble instead of the speaker's usual one (e.g. "くもさん"). */
  | { say: string; who?: Speaker; emote?: Emote; name?: string }
  | {
      spawn: string;
      model: string;
      onRail: { railId: string; at: number; lateral?: number; heightFromRail?: number };
      /** v1.6: turn it about the vertical (degrees; 180 faces back along the rail, towards the train). */
      rotationY?: number;
    }
  | {
      move: string;
      onRail: { railId: string; at: number; lateral?: number; heightFromRail?: number };
      seconds: number;
      /** v1.6: go on to the next step at once (several things move together). */
      nowait?: boolean;
    }
  | { remove: string }
  | { wait: number }
  /**
   * v1.7: `style` "fly" (default: a short piece flies up, the rival cutting the line) or "fall" (the whole cut
   * stretch falls to the ground below, with the props tagged `props` on it).
   */
  | { cutRail: { railId: string; from: number; to: number; style?: 'fly' | 'fall'; props?: string } }
  | { card: { title: string; button: string; icon?: 'badge' } }
  | { emote: Emote }
  /** Switch the camera for the rest of the cutscene (restored afterwards). */
  | { camera: 'cab' | 'chase' | 'side' | 'top' }
  /** v1.7: a camera standing still at `at`, looking at `lookAt` (world metres), for the rest of the cutscene. */
  | { camera: 'fixed'; at: Vec3; lookAt: Vec3 }
  /** v1.7: a screen effect. "sneeze": the volcano sneezes ("はっくしょーん！", a big smoke ring), 2.5 s. */
  | { fx: 'sneeze' }
  /** Full-screen dark caption that fades after `seconds`. */
  | { caption: string; seconds?: number }
  /** v1.2: grant an ability (its button appears) and show the "learned" card. */
  | { unlock: AbilityId };

export interface GimmickDef {
  type: string;
  railId?: string;
  from?: number;
  to?: number;
  params?: Record<string, unknown>;
}

/** v1.7: params of a "slope" gimmick (the stretch `from`–`to` of `railId`, judged at the train front). */
export interface SlopeParams {
  /** m/s² (required, not 0): negative = too steep to climb without the rocket; positive = a slide (no lever). */
  pull: number;
  /** Slide: its top speed (m/s). Default SLOPE.max (20). */
  max?: number;
  /** Uphill: where the train front goes back to after slipping. Default `from − 60` on the same rail. */
  rewind?: { railId: string; at: number };
  /** Uphill: said 60 m before it (default: the mission's steepNear). */
  line?: string | null;
  /** A sign at its start (sign-steep / sign-slide). Default true. */
  sign?: boolean;
}

/** v1.7: params of a "rocket" gimmick (a stretch where the rocket rests, or where it glows). */
export interface RocketZoneParams {
  /** false = the rocket rests here (a press only says a line; a burn ends "ぷしゅっ"). Default true. */
  allow?: boolean;
  /** true = the button glows here (not with allow: false). Default false. */
  glow?: boolean;
  /** Mark on the button while resting here. Default "none". */
  icon?: 'none' | 'sleep' | 'bridge';
  /** Said once on entering; also said on a press when there is no pressLine. */
  line?: string;
  /** Said on a press here. */
  pressLine?: string;
}

/**
 * v1.7 actors (placed with onRail): "rock-roll" (params: startDistance, crossSeconds, dangerDistance, lateral, warn,
 * rewind, say, hitAfter) and "rock-drop" (params: drop, warn, rewind, say, hitAfter). `rewind` is a place on the
 * same rail (a number) or { railId, at }; default 80 m before the rock. A "cat" with params.look "seabird" is a
 * seabird (it flies off when whistled).
 */
export type RockRewind = number | { railId: string; at: number };

export interface StartDef {
  railId: string;
  at: number;
  direction: 1 | -1;
}

export interface StageFile {
  schemaVersion: 1;
  id: string;
  title: string;
  chapter: number;
  hidden?: boolean;
  unlock: { requires: string[]; purchase: string | null };
  unlocks: AbilityId[];
  environment: EnvironmentDef;
  start: StartDef;
  rails: RailDef[];
  junctions: JunctionDef[];
  stations: StationDef[];
  props: PropDef[];
  actors: ActorDef[];
  records: RecordDef[];
  missions: MissionDef[];
  gimmicks: GimmickDef[];
  /** v1.1: cutscene id played before the first mission. */
  opening?: string;
  /** v1.1: cutscene id played after the last mission. */
  ending?: string;
  /** v1.1: cutscenes by id. */
  cutscenes?: Record<string, CutsceneStep[]>;
}

/** A prop with its placement resolved to a world transform. */
export interface ResolvedProp {
  model: string;
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
  physics: PhysicsType;
  /** v1.7: see PropDef.tag. */
  tag?: string;
  /** Where it was placed along a rail, when it was. */
  onRail?: { railId: string; at: number };
}

/** A record with its placement resolved. */
export interface ResolvedRecord {
  def: RecordDef;
  position: Vector3;
  quaternion: Quaternion;
  onRail?: { railId: string; at: number };
}

/** An actor with its placement resolved. `position` is the bottom center of the sensor box. */
export interface ResolvedActor {
  id: string;
  type: string;
  position: Vector3;
  quaternion: Quaternion;
  /** Present when the actor was placed on a rail (distance checks use it). */
  onRail?: { railId: string; at: number };
  size: Vector3;
  reactsTo: ReactsTo;
  reversed: boolean;
  params: Record<string, unknown>;
}

/** What the loader hands to the rest of the game. */
/** A station with its world frame resolved (for the view). */
export interface ResolvedStation {
  def: StationDef;
  position: Vector3;
  quaternion: Quaternion;
}

export interface StageData {
  file: StageFile;
  network: RailNetwork;
  props: ResolvedProp[];
  actors: ResolvedActor[];
  stations: ResolvedStation[];
  records: ResolvedRecord[];
}
