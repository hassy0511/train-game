import type { Material, Mesh, Object3D } from 'three';

/**
 * v1.10 (3-1, ticket 0011): what the game adds to some of the sea's built models (assets/blender/sea.py) as they load:
 * the kelp sways in its shader, the whale lights itself a little in its own colours (under water the light is soft and
 * the fog blue: its pastel blue and cream belly stay friendly). Both are vertex-coloured, so the props layer leaves
 * them unbaked and they keep these materials.
 */

/** v1.10 (3-1): the clock every swaying sea thing reads (seconds; sea.ts moves it on). */
export const SEA_TIME = { value: 0 };

/** The models this module touches, as ModelLibrary loads them. */
export function prepareSeaModel<T extends Object3D>(name: string, model: T): T {
  if (name === 'kelp') addKelpSway(model);
  if (name === 'whale') forMaterials(model, (m) => selfGlow(m, WHALE_GLOW));
  return model;
}

/** How much of its own colour the whale gives off as light. */
const WHALE_GLOW = 0.32;

function forMaterials(model: Object3D, each: (m: Material) => void): void {
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) each(m);
  });
}

/**
 * A material that also gives off `share` of its (vertex) colour as light. Material.clone() does not keep this: call it
 * again on a copy (sea.ts gives every whale its own material to fade).
 */
export function selfGlow(m: Material, share = WHALE_GLOW): void {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${share.toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => `sea-self-glow-${share}`;
}

/**
 * The kelp sways (ticket 0011): its material bends the frond more the higher up it is (the model is 12 m tall,
 * assets/blender/sea.py), each plant on its own beat (from where it stands), all by one shared uniform: no per-frame
 * work on the CPU and still one draw call per batch. Applied once to the loaded kelp model (vertex colours, one
 * material, so the props are not baked and keep this material).
 */
function addKelpSway(model: Object3D): void {
  forMaterials(model, sway);
}

function sway(m: Material): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.seaTime = SEA_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float seaTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float seaK = clamp(position.y / 12.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          float seaPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float seaPhase = 0.0;
        #endif
        transformed.x += sin(seaTime * 1.1 + seaPhase) * 0.9 * seaK * seaK;
        transformed.z += cos(seaTime * 0.8 + seaPhase * 1.3) * 0.4 * seaK * seaK;`,
      );
  };
  m.customProgramCacheKey = () => 'sea-kelp-sway';
}
