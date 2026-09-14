import type { SceneView } from './SceneView';
import { ThreeSceneView } from './three/ThreeSceneView';
import { WireSceneView } from './wire/WireSceneView';

/** Picks the production scene, retaining the wireframe helper in development only. */
export function createSceneView(params: URLSearchParams): SceneView {
  if (import.meta.env.DEV && params.get('view') === 'wire') return new WireSceneView();
  return new ThreeSceneView();
}

export type { CameraFx, SceneView } from './SceneView';
export { CAMERA_LABELS, CAMERA_MODES, type CameraMode } from './camera-rig';
