import type { Quaternion, Vector3 } from 'three';
import type { RailNetwork } from '../rail/types';

/** Stage JSON schema v1. See docs/STAGE_SCHEMA.md (Japanese) for the authoring reference. */
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

export interface RailDef {
  id: string;
  points: Vec3[];
  up?: Vec3;
  gaps?: { from: number; to: number }[];
  oneWay?: boolean;
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

export interface StationDef {
  id: string;
  name: string;
  railId: string;
  at: number;
  tolerance?: number;
  platformSide: 'left' | 'right';
}

export interface WorldPlacement {
  position: Vec3;
  rotationY?: number;
}

export interface RailPlacement {
  onRail: { railId: string; at: number; lateral?: number; heightFromRail?: number };
  rotationY?: number;
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
};

export interface MissionDef {
  id: string;
  type: 'deliver' | 'pickup' | 'repair' | 'timed';
  title: string;
  from: string;
  to: string;
  timeLimit?: number;
  checkpoints: { railId: string; at: number }[];
  params?: Record<string, unknown>;
}

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
}

/** A prop with its placement resolved to a world transform. */
export interface ResolvedProp {
  model: string;
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
  physics: PhysicsType;
}

/** An actor with its placement resolved. `position` is the bottom center of the sensor box. */
export interface ResolvedActor {
  id: string;
  type: string;
  position: Vector3;
  quaternion: Quaternion;
  size: Vector3;
  reactsTo: ReactsTo;
  reversed: boolean;
  params: Record<string, unknown>;
}

/** What the loader hands to the rest of the game. */
export interface StageData {
  file: StageFile;
  network: RailNetwork;
  props: ResolvedProp[];
  actors: ResolvedActor[];
}
