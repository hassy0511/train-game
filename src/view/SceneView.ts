import type { Scene } from 'three';
import type { StageEvent } from '../core/stage-events';
import type { CameraMode } from './camera-rig';
import type { RailNetwork } from '../rail/types';
import type { StageData } from '../stage/types';
import type { TrainPose } from '../train/types';

/** Per-frame camera effects, 0..1 each. `dip` lowers the camera (emergency stop), `shake` jitters it. */
export interface CameraFx {
  dip: number;
  shake: number;
}

/** The visual layer. The game drives it with the train pose; it never changes game state. */
export interface SceneView {
  init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void>;
  /** Called every frame; renders. */
  update(dt: number, pose: TrainPose, fx: CameraFx): void;
  /** Game events to visualize (doors, passengers, actors, rail cuts, goal marker). */
  onStageEvent(event: StageEvent): void;
  /** Switches the camera. `snap` skips the smooth transition. */
  setCamera(mode: CameraMode, snap?: boolean): void;
  resize(width: number, height: number, devicePixelRatio: number): void;
  getStats(): { drawCalls: number; triangles: number } | null;
  /** For dev-only helpers (spline visualizer). May return null. */
  getScene(): Scene | null;
  dispose(): void;
}
