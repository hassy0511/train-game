import type { Quaternion, Vector3 } from 'three';
import type { RailNetwork } from '../rail/types';

/** Stage JSON schema v1 (additions up to v1.2). See docs/STAGE_SCHEMA.md (Japanese) for the authoring reference. */
export type Vec3 = [number, number, number];

export type AbilityId = 'whistle' | 'light' | 'jump' | 'rocket' | 'dive' | 'magnetLight' | 'reverse';

export interface EnvironmentDef {
  sky: { top: string; bottom: string };
  fog: { color: string; near: number; far: number } | null;
  lighting: 'day' | 'evening' | 'night' | 'cave';
  ground: { y: number; size: number; color: string } | null;
  bgm: string | null;
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
}

export interface RailDef {
  id: string;
  points: Vec3[];
  up?: Vec3;
  gaps?: GapDef[];
  oneWay?: boolean;
  /** v1.2: a wrong turn. Reaching its buffer puts the train back before the junction. */
  deadEnd?: boolean;
  end: RailEndDef;
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

export interface MissionStep {
  stationId: string;
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
    | 'recordFound',
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
  | { say: string; who?: Speaker; emote?: Emote }
  | { spawn: string; model: string; onRail: { railId: string; at: number; lateral?: number; heightFromRail?: number } }
  | { move: string; onRail: { railId: string; at: number; lateral?: number; heightFromRail?: number }; seconds: number }
  | { remove: string }
  | { wait: number }
  | { cutRail: { railId: string; from: number; to: number } }
  | { card: { title: string; button: string; icon?: 'badge' } }
  | { emote: Emote }
  /** Switch the camera for the rest of the cutscene (restored afterwards). */
  | { camera: 'cab' | 'chase' | 'side' | 'top' }
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
