import type { Scene } from 'three';
import type { StageEvent } from '../core/stage-events';
import type { CameraMode, OrbitCamera } from './camera-rig';
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
  /**
   * v1.7: a camera standing still at `at` looking at `lookAt` (world metres); null = back to the mode's camera.
   * v1.10: `reach` = how many times further than the stage fog it sees (default: the wide shot's).
   */
  setFixedCamera(fixed: { at: [number, number, number]; lookAt: [number, number, number]; reach?: number } | null): void;
  /**
   * The title screen's camera circling the standing train (null = back to the mode's camera, snapped). A fixed
   * camera still wins over it.
   */
  setOrbit(orbit: OrbitCamera | null): void;
  /** "がめんの ゆれ: へらす": no view changes that move the picture (e.g. the rocket's wider view). */
  setCalm(calm: boolean): void;
  /** v1.10: the train runs under water on a long stretch (a camera outside the cab stays under the surface too). */
  setSubmerged(on: boolean): void;
  /** v1.10: the camera is under a water surface (the view turned blue). */
  isCameraUnderwater(): boolean;
  /**
   * v1.10 (4-3): the snow wave behind the train, every frame: where its front is on `railId`, how fast it runs and
   * its state (null: none out).
   */
  setSnowWave(wave: { railId: string; s: number; speed: number; state: string } | null): void;
  resize(width: number, height: number, devicePixelRatio: number): void;
  getStats(): { drawCalls: number; triangles: number } | null;
  /** For dev-only helpers (spline visualizer). May return null. */
  getScene(): Scene | null;
  dispose(): void;
}
