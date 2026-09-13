import type { Scene } from 'three';
import type { RailNetwork } from '../rail/types';
import type { StageData } from '../stage/types';
import type { TrainPose } from '../train/types';

/** The visual layer. The game drives it with the train pose; it never changes game state. */
export interface SceneView {
  init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void>;
  /** Called every frame; renders. */
  update(dt: number, pose: TrainPose): void;
  resize(width: number, height: number, devicePixelRatio: number): void;
  getStats(): { drawCalls: number; triangles: number } | null;
  /** For dev-only helpers (spline visualizer). May return null. */
  getScene(): Scene | null;
  dispose(): void;
}
