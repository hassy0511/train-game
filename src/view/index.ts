import type { SceneView } from './SceneView';
import { WireSceneView } from './wire/WireSceneView';

/**
 * Picks the scene view. The wireframe view is the placeholder until the Three.js scene
 * (ticket 0002) lands; after that it stays reachable in dev builds via `?view=wire`.
 */
export function createSceneView(_params: URLSearchParams): SceneView {
  return new WireSceneView();
}

export type { SceneView };
