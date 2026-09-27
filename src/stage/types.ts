import type { Quaternion, Vector3 } from 'three';
import type { RunSurface } from '../audio/run-sound';
import type { RailNetwork } from '../rail/types';

/** Stage JSON schema v1 (additions up to v1.10). See docs/STAGE_SCHEMA.md (Japanese) for the authoring reference. */
export type Vec3 = [number, number, number];

export type AbilityId = 'whistle' | 'light' | 'jump' | 'rocket' | 'dive' | 'magnetLight' | 'reverse';

export interface EnvironmentDef {
  sky: { top: string; bottom: string };
  fog: { color: string; near: number; far: number } | null;
  lighting: 'day' | 'evening' | 'night' | 'cave';
  ground: { y: number; size: number; color: string } | null;
  /** Song id in src/audio/songs.ts (Phase 4), or null for silence. */
  bgm: string | null;
  /**
   * v1.3: how a fall looks: "dark" (default, fade to black) or "cloud" (caught by a cloud, fade to white).
   * v1.10: "water" (a soft fade to water blue).
   */
  fall?: 'dark' | 'cloud' | 'leaf' | 'water';
  /** v1.3: a soft sea of clouds far below (stages in the sky). */
  cloudSea?: { y: number };
  /** v1.9: the quiet sound around the island (src/audio/ambience.ts); omitted = none. */
  ambience?: AmbienceKind;
  /**
   * v1.10: water (a sea, a lake, a pond). The loader works out from the rail heights which stretches run on the
   * surface (the jump button turns into "もぐる") and which run under water (Rail.surfaces / Rail.dives).
   */
  water?: WaterDef[];
  /** v1.10 (4-1): snow falling round the camera (looks only). */
  snow?: SnowDef;
  /**
   * v1.10: what the track sounds like where no "sound" zone says otherwise (default "rail"). Ice and thin ice sound
   * like ice by themselves.
   */
  surface?: RunSurface;
}

/** v1.10 (4-1): falling snow: `count` flakes (0–2000) in a box `radius` m round the camera, falling `fall` m/s. */
export interface SnowDef {
  count: number;
  radius?: number;
  fall?: number;
}

/** v1.10: how a water looks (surface, floor and the colour under water). */
export type WaterLook = 'sea' | 'lake' | 'puddle' | 'ice';
export const WATER_LOOKS: readonly WaterLook[] = ['sea', 'lake', 'puddle', 'ice'];

/** v1.10: where a water is on the ground (x, z in metres; `size` [across, along], `rotationY` degrees, 0 = along +Z). */
export type WaterArea =
  | { circle: { center: [number, number]; radius: number } }
  | { rect: { center: [number, number]; size: [number, number]; rotationY?: number; corner?: number } };

/** v1.10: one body of water. */
export interface WaterDef {
  /** Height of the surface (m). */
  y: number;
  /** Height of the bottom (sea floor, pond floor), below `y`; looks only. */
  floor: number;
  /** Omitted: a sea over the whole ground (the ground plane becomes the surface and the floor). */
  area?: WaterArea;
  /** Default "sea". */
  look?: WaterLook;
  /** Colour and seeing distance (m) under water; defaults by `look`. */
  under?: { color?: string; far?: number };
  /**
   * v1.10 (4-1), look "ice" only: open water in the ice (a circle, or a rect as in `area`). With holes, a rail counts as
   * on the water only inside one (elsewhere it runs on the ice), and it may go under the ice only through one.
   */
  holes?: WaterHole[];
}

/** v1.10 (4-1): a hole in an ice-covered water: { center, radius } or { rect } (as a water's area). */
export type WaterHole = { center: [number, number]; radius: number } | { rect: { center: [number, number]; size: [number, number]; rotationY?: number; corner?: number } };

/** v1.10 (set by the loader, never written): a stretch of a rail on the surface of, or under, `water` (index). */
export interface WaterSpan {
  from: number;
  to: number;
  water: number;
}

/** v1.10: something floating on the water over a surface rail, which the train must dive under. */
export type FloaterLook = 'log' | 'raft' | 'lily' | 'wave' | 'ice';
export const FLOATER_LOOKS: readonly FloaterLook[] = ['log', 'raft', 'lily', 'wave', 'ice'];

export interface FloaterDef {
  id: string;
  railId: string;
  /** Its middle along the rail (m). */
  at: number;
  /** How far along the rail it covers (m). Default FLOATER.length. */
  length?: number;
  /** Default "log". */
  look?: FloaterLook;
  /** Where the train front goes back to after bumping it: a place on its rail, or { railId, at }. Default at − DIVE.rewindBefore. */
  rewind?: number | { railId: string; at: number };
  /** v1.10 (3-1): said once, DIVE.hintDistance m before it (the mission's floatNear otherwise). */
  say?: string;
}

/** v1.10 (3-1): the bubbles at a bubble fork: real ones rising, or Sakasa's pink swirly ones sinking. */
export type BubbleKind = 'rise' | 'sink';

/**
 * v1.10 (3-1): a bubble fork (`junctions[].bubbles`): a column of bubbles stands on each way out. The rising (real)
 * bubbles show the true way; the sinking pink ones lead round a loop back before the fork (never a fail).
 */
export interface BubbleForkDef {
  left: BubbleKind;
  right: BubbleKind;
  /** Said once, BUBBLE_FORK.nearDistance m before it (the mission's bubbleNear otherwise). */
  say?: string;
}

/**
 * v1.9: the sound around an island. v1.10 adds underwater (it also comes on by itself while the train is under
 * water), river, ice and snow.
 */
export type AmbienceKind = 'town' | 'valley' | 'sky' | 'forest' | 'meadow' | 'sea' | 'underwater' | 'river' | 'ice' | 'snow';
export const AMBIENCE_KINDS: readonly AmbienceKind[] = ['town', 'valley', 'sky', 'forest', 'meadow', 'sea', 'underwater', 'river', 'ice', 'snow'];

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
  /**
   * v1.8: a side track to a record (ends in a buffer). Stopped at its buffer the train is taken to `back` (not a
   * fail: no dip, the partner says "spurBack").
   */
  spur?: { back: { railId: string; at: number } };
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
  /**
   * v1.8: the way off to the side (the side that is not `default`) needs this ability. Its sign and arrow show the
   * ability's picture; without the ability that way cannot be chosen and the partner says "needAbility".
   */
  needs?: AbilityId;
  /**
   * v1.10: a dive fork (a ring on the water, no arrows): a train diving as it passes takes the side whose rail goes
   * under water, any other train the other side (`default`, a way on the surface; no fail).
   */
  dive?: boolean;
  /** v1.10 (set by the loader, never written): the side of a dive fork whose rail goes under water. */
  diveSide?: 'left' | 'right';
  /** v1.10 (3-1): a bubble fork (see BubbleForkDef). */
  bubbles?: BubbleForkDef;
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
  /**
   * v1.8: the partner's pointer, said once per stage run when the train comes within RECORD.hintDistance m of the
   * record while it can be taken (the ability is there, or none is needed).
   */
  hint?: string;
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
    | 'doorsClosedLever'
    // v1.8
    | 'spurBack'
    | 'needAbility'
    // v1.10 (もぐる)
    | 'diveNear'
    | 'diveBoing'
    | 'diveBoingAfter'
    // v1.10 (3-1)
    | 'diveGo'
    | 'diveReady'
    | 'floatNear'
    | 'floatHit'
    | 'floatHitAfter'
    | 'whaleNear'
    | 'whaleCall'
    | 'whaleSang'
    | 'currentIn'
    | 'currentWait'
    | 'bubbleNear'
    | 'bubbleTrue'
    | 'bubbleRevealed'
    // v1.10 (4-1 こおり・うすい こおり・かがみ)
    | 'iceNear'
    | 'iceStop'
    | 'iceBrake'
    | 'iceOvershoot'
    | 'iceOvershootAfter'
    | 'crackShake'
    | 'crackFall'
    | 'crackAfter'
    | 'crackEmpty'
    | 'crackEmptyAfter'
    | 'thinIceClear'
    | 'mirrorNear'
    | 'mirrorFlash'
    | 'mirrorFake',
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
  /** v1.10 `mirror`: a note on paper, its title written mirror-wise (3-1's "のせて"). */
  | { card: { title: string; button: string; icon?: 'badge'; mirror?: boolean } }
  | { emote: Emote }
  /** Switch the camera for the rest of the cutscene (restored afterwards). */
  | { camera: 'cab' | 'chase' | 'side' | 'top' }
  /** v1.7: a camera standing still at `at`, looking at `lookAt` (world metres), for the rest of the cutscene. */
  | { camera: 'fixed'; at: Vec3; lookAt: Vec3 }
  /**
   * v1.7: a screen effect. "sneeze": the volcano sneezes ("はっくしょーん！", a big smoke ring), 2.5 s. v1.10 "pop": a
   * big bubble pops ("ぱちん", a spray of little bubbles), at cutscene figure `id` (or in front of the camera).
   */
  | { fx: 'sneeze' }
  | { fx: 'pop'; id?: string }
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

/** v1.10 (4-1): params of an "ice" gimmick (the stretch `from`–`to` of `railId`, judged at the train front). */
export interface IceParams {
  /** How hard the brakes work on it (above 0, at most 1). Default ICE.grip (0.4). */
  grip?: number;
  /** Said once on getting onto it (again after a fail). */
  line?: string | null;
  /** A sign (sign-ice) at its start. Default true. */
  sign?: boolean;
}

/** v1.10 (4-1): params of a "thin-ice" gimmick (only the rocket is fast enough to get across). */
export interface ThinIceParams {
  /** Default THIN_ICE.minSpeed (24 m/s). */
  minSpeed?: number;
  /** Default THIN_ICE.grace (0.8 s). */
  grace?: number;
  /** Its line comes this far before it (m). Default THIN_ICE.warn (120). */
  warn?: number;
  /** Where the train front goes back to after "ぽちゃん" (on the same rail). Default from − THIN_ICE.rewindBefore. */
  rewindAt?: number;
  line?: string | null;
  /** A sign (sign-thin-ice) at its start. Default true. */
  sign?: boolean;
}

/** v1.10 (4-1): params of a "mirror" gimmick (an ice mirror standing at `position`, looks and a few lines). */
export interface MirrorParams {
  /** Bottom centre of the mirror (world m). */
  position: Vec3;
  /** Degrees about +Y; 0 = the glass faces +Z. */
  rotationY?: number;
  /** Default 22 m. */
  width?: number;
  /** Default 14 m. */
  height?: number;
  /** Default MIRROR.range. */
  range?: number;
  /** Default MIRROR.flashRange. */
  flashRange?: number;
  /** Default MIRROR.reflectRadius. */
  reflectRadius?: number;
  /** The false way (a dead end) that runs up to this mirror. */
  railId?: string;
  /** The junction with a reversed sign whose false way this is (its default side is `railId`). */
  junction?: string;
  /** The light button glows before the junction until the sign is seen through. Default false. */
  lightHint?: boolean;
  /** What shows in it: "train" (default) and "cutscene" (the figures a cutscene brings on). */
  reflect?: ('train' | 'cutscene')[];
}

/**
 * v1.10 (3-1): params of a "whale" actor (placed with onRail beside the rail, under water; reactsTo "whistle"). It
 * swims where it is; the whistle within `callRange` m before it (until `until`) greets it: it sings back and swims
 * along beside the train front (`lead` m ahead, `lateral` m right, `height` m over the rail) until the front passes
 * `until`, then swims off. Not greeted, it trails `trail` m behind and can still be called. Defaults: WHALE.
 */
export interface WhaleParams {
  until: number;
  callRange?: number;
  lead?: number;
  lateral?: number;
  height?: number;
  trail?: number;
}

/**
 * v1.10 (3-1): an "updraft" stretch may look like a sea current (`look` "current": bubble rings and streams instead
 * of wind rings) and belong to a whale (`whale`: an actor id): it pushes only while that whale swims along.
 */
export interface UpdraftParams {
  speed?: number;
  look?: 'wind' | 'current';
  whale?: string;
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
  /** v1.10: things floating over surface rails, to dive under. */
  floaters?: FloaterDef[];
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
