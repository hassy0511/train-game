import type { Scene } from 'three';
import type { StageEvent } from '../core/stage-events';
import type { CameraMode, OrbitCamera } from './camera-rig';
import type { RailNetwork } from '../rail/types';
import type { EnvironmentDef, ShotDef, StageData } from '../stage/types';
import type { TrainPose } from '../train/types';
import type { LeadPose } from '../mission/lead';

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
  /**
   * v1.11 (PR10, docs/PHASE9_CHAPTER5_6.md 第 1 部 §5.7): on the title, once Sakasa has joined (6-1 cleared), she sits in
   * the first car behind the driver's seat, seen through its window; gone again when the title closes. Optional.
   */
  setTitleCrew?(on: boolean): void;
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
  /** v1.11 (6-1): where Sakasa runs in "おいかけっこ" now (null: not out), every frame. Optional. */
  setLead?(pose: LeadPose | null): void;
  /** v1.11 (5-2): how each spinning fork looks now (the side its flag points, turning, glowing the good way). Optional. */
  setSpinLooks?(looks: { id: string; side: 'left' | 'right'; turning: boolean; good: boolean }[]): void;
  /**
   * v1.11 (PHASE9 B6.1): changes the look (the sky, the fog, the light, the ground, the stars, the moon, the fireflies)
   * as often as wanted: 5-1's day and night, 6-2's sections.
   */
  applyEnvironment(env: EnvironmentDef): void;
  /**
   * v1.12 (えんしゅつ): a cutscene camera shot framing a figure, a car or a point (null: none; the camera the mode, a
   * fixed camera or the orbit wants comes back). Optional.
   */
  setShot?(def: ShotDef | null): void;
  /** v1.12: the letterbox bars' part of the screen height (0: off): shots frame inside what is left. Optional. */
  setLetterbox?(part: number): void;
  /** v1.12: prefers-reduced-motion: camera moves become cuts, the figures' motions smaller. Optional. */
  setReducedMotion?(on: boolean): void;
  resize(width: number, height: number, devicePixelRatio: number): void;
  getStats(): { drawCalls: number; triangles: number } | null;
  /** For dev-only helpers (spline visualizer). May return null. */
  getScene(): Scene | null;
  dispose(): void;
}
