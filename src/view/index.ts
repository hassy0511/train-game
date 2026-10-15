import type { SceneView } from './SceneView';
import { ThreeSceneView } from './three/ThreeSceneView';
import { WireSceneView } from './wire/WireSceneView';

/**
 * Picks the production scene, retaining the wireframe helper in development only. `look`: v1.13 another look of some
 * models (a check run's `look=`).
 */
export function createSceneView(params: URLSearchParams, look: string | null = null): SceneView {
  if (import.meta.env.DEV && params.get('view') === 'wire') return new WireSceneView();
  return new ThreeSceneView(look);
}

export type { CameraFx, SceneView } from './SceneView';
export { CAMERA_LABELS, CAMERA_MODES, type CameraMode, type OrbitCamera } from './camera-rig';
