import { Color, MeshLambertMaterial } from 'three';
import type { Material, Mesh, Object3D } from 'three';

/**
 * v1.10 (4-2, ticket 0016): what the game does to some of the snowy village's built models (assets/blender/village.py)
 * as they load. Two of them have a part the game lights, a vertex-coloured material of its own in the GLB: the
 * lantern's paper ("lantern-paper") and the swirl on Sakasa's upside-down snow fence ("trace-swirl"). Those are swapped
 * for one shared material each, so every lantern lights at once at the festival (setLanternGlow) and every swirl glows
 * while the light finds it (setTraceGlow). The rest of each model keeps its own vertex-coloured material, so a batch
 * of either is two draw calls (the props layer leaves vertex-coloured models unbaked).
 */

const SWIRL = '#FF7FBF';

let lanternShared: MeshLambertMaterial | null = null;
/** The lanterns' paper: dark until the festival, then glowing warm (setLanternGlow). */
function lanternMaterial(): MeshLambertMaterial {
  lanternShared ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color('#FF9A5C'), emissiveIntensity: 0 });
  lanternShared.name = 'lantern-paper';
  return lanternShared;
}

let traceShared: MeshLambertMaterial | null = null;
/** Sakasa's swirl on the upside-down fence: faint until the light finds it (setTraceGlow). */
function traceMaterial(): MeshLambertMaterial {
  traceShared ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color(SWIRL), emissiveIntensity: 0 });
  traceShared.name = 'trace-swirl';
  return traceShared;
}

/** v1.11 (5-1): the same swirl material, for another set's Sakasa marks lit by the light (the upside-down birdhouse). */
export function traceGlowMaterial(): MeshLambertMaterial {
  return traceMaterial();
}

/** v1.10 (4-2): how brightly every lantern glows (0 = unlit, 1 = the festival). */
export function setLanternGlow(k: number): void {
  lanternMaterial().emissiveIntensity = 1.1 * Math.min(1, Math.max(0, k));
}

/** v1.10 (4-2): the swirl marks on the upside-down snow fences glow (the light found them) or fade. */
export function setTraceGlow(k: number): void {
  traceMaterial().emissiveIntensity = 0.9 * Math.min(1, Math.max(0, k));
}

/** The materials named `name` in `model` become `shared`. */
function swap(model: Object3D, name: string, shared: Material): void {
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => (m.name === name ? shared : m));
    else if (mesh.material.name === name) mesh.material = shared;
  });
}

/** The models this module touches, as ModelLibrary loads them. */
export function prepareVillageModel<T extends Object3D>(name: string, model: T): T {
  if (name === 'lantern') swap(model, 'lantern-paper', lanternMaterial());
  if (name === 'snow-fence-trace') swap(model, 'trace-swirl', traceMaterial());
  return model;
}
