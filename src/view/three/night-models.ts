import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { bakeModel } from './bake';
import { dotTexture } from './environment';
import { traceGlowMaterial } from './village-models';

/**
 * v1.11 (5-1, ticket 0018): what the game does to the night forest's built models (assets/blender/night.py) as they
 * load, and the pieces it makes from them:
 * - `fake-lantern`: its paper ("fake-lantern-paper", vertex-coloured) becomes one shared glowing pink, which goes out
 *   when the light sees through Sakasa's trick (setFakeLanternGlow).
 * - `birdhouse-upside`: Sakasa's swirl ("trace-swirl") becomes 4-2's shared swirl, which glows while the light finds it.
 * - `great-tree`: baked into one mesh, with the soft firefly light round its crown that the fog does not hide (the
 *   landmark seen from far off; map pictures leave it out by its name, "great-tree-halo").
 * - `firefly-swarm` / `-big` (glTF points): soft additive dots that twinkle, not fogged (a light in the dark).
 * - "tanuki-<n>" (1–4 little tanukis side by side, a lure group) from the built `tanuki` (tanukiGroup), and Sakasa
 *   carrying a paper lantern from the built amanojaku (addHandLantern), both composed by models.ts.
 * The glowing mushrooms, the moonstone, the waiting fireflies, the great tree's lanterns and the moonlit meadow light
 * themselves through their materials' emission, which the bake keeps.
 */

const PINK = '#FF8FC8';
const FIREFLY = '#D8FF7A';
const TRUNK = '#5A4636';

let fakePaper: MeshLambertMaterial | null = null;
/** Sakasa's fake lanterns' pink paper: glowing (1) until the light sees through her trick, then dark (0). */
function fakePaperMaterial(): MeshLambertMaterial {
  fakePaper ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color(PINK), emissiveIntensity: 1.1 });
  fakePaper.name = 'fake-lantern-paper';
  return fakePaper;
}

/** v1.11 (5-1): how brightly Sakasa's fake pink lanterns glow (1 lit, 0 gone out). */
export function setFakeLanternGlow(k: number): void {
  fakePaperMaterial().emissiveIntensity = 1.1 * Math.min(1, Math.max(0, k));
}

let treeHalo: MeshBasicMaterial | null = null;
/**
 * The soft firefly light round the great tree's crown, seen from far off through the fog: a ball drawn brightest where
 * it faces the camera and fading to nothing at its rim (so it has no edge from any side, and works instanced).
 */
function haloMaterial(): MeshBasicMaterial {
  if (treeHalo) return treeHalo;
  const m = new MeshBasicMaterial({ color: FIREFLY, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHaloN;\nvarying vec3 vHaloV;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 haloN = normal;
        #ifdef USE_INSTANCING
          haloN = mat3(instanceMatrix) * haloN;
        #endif
        vHaloN = normalize(mat3(modelViewMatrix) * haloN);
        vHaloV = -mvPosition.xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHaloN;\nvarying vec3 vHaloV;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= 0.18 * pow(max(0.0, dot(normalize(vHaloN), normalize(vHaloV))), 2.5);');
  };
  m.customProgramCacheKey = () => 'great-tree-halo';
  treeHalo = m;
  return m;
}

const swarmTime = { value: 0 };
let swarmShared: PointsMaterial | null = null;
/**
 * The firefly swarms' dots: soft round points in their own colours (yellow-green, some warmer), added to what is behind
 * them, not fogged; each glows in and out on its own beat ("ちらちら").
 */
function swarmMaterial(): PointsMaterial {
  if (swarmShared) return swarmShared;
  const m = new PointsMaterial({
    size: 0.8,
    vertexColors: true,
    map: dotTexture(),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  m.name = 'firefly-swarm';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.swarmTime = swarmTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float swarmTime;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        float beat = position.x * 3.1 + position.y * 1.7 + position.z * 2.3;
        vColor *= 0.45 + 0.55 * smoothstep(-0.6, 1.0, sin(swarmTime * (1.2 + 0.6 * fract(beat)) + beat * 4.0));`,
      );
  };
  m.customProgramCacheKey = () => 'firefly-swarm';
  m.onBeforeRender = () => {
    swarmTime.value = performance.now() / 1000;
  };
  swarmShared = m;
  return m;
}

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/** The materials named `name` in `model` become `shared`. */
function swap(model: Object3D, name: string, shared: Material): void {
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => (m.name === name ? shared : m));
    else if (mesh.material.name === name) mesh.material = shared;
  });
}

/** The great tree baked into one mesh (its plain parts: bark, leaves, the lit lanterns), and the halo round its crown. */
function addHalo(model: Group): void {
  model.updateMatrixWorld(true);
  const plain = new Group();
  const meshes: Mesh[] = [];
  model.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  for (const mesh of meshes) {
    const copy = new Mesh(mesh.geometry, mesh.material);
    copy.name = materialsOf(mesh)[0]?.name || mesh.name;
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    plain.add(copy);
  }
  const baked = bakeModel(plain);
  model.clear();
  model.add(...(baked ? baked.children.map((c) => c.clone()) : plain.children));
  // Round the crown (the stand-in's ball: 68 x 48 m round the middle of the leaves, 48 m up).
  const halo = new Mesh(new IcosahedronGeometry(1, 2), haloMaterial());
  halo.name = 'great-tree-halo';
  halo.scale.set(34, 24, 34);
  halo.position.set(0, 48, 0);
  model.add(halo);
}

/** The swarm's points in the shared twinkling material. */
function lightSwarm(model: Object3D): void {
  model.traverse((o) => {
    const points = o as Points;
    if (points.isPoints) points.material = swarmMaterial();
  });
}

/** The models this module touches, as ModelLibrary loads them. */
export function prepareNightModel<T extends Object3D>(name: string, model: T): T {
  if (name === 'fake-lantern') swap(model, 'fake-lantern-paper', fakePaperMaterial());
  if (name === 'birdhouse-upside') swap(model, 'trace-swirl', traceGlowMaterial());
  if (name === 'great-tree') addHalo(model as unknown as Group);
  if (name === 'firefly-swarm' || name === 'firefly-swarm-big') lightSwarm(model);
  return model;
}

/** A steady pseudo-random 0…1 for a point (the stand-in's, so the groups stand as they did). */
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * "tanuki-<n>": `n` (1–4) copies of the built little tanuki side by side in 1.6 m, every other one a step back, a
 * little smaller and turned a little (a lure group, night.ts). Origin at the group's middle, facing +Z.
 */
export function tanukiGroup(model: Group, n: number): Group {
  const out = new Group();
  out.name = `tanuki-${n}`;
  for (let i = 0; i < n; i++) {
    const one = model.clone(true);
    one.position.set((i - (n - 1) / 2) * 0.55, 0, (i % 2) * -0.25);
    one.rotation.y = (hash(i, 7, n) - 0.5) * 0.6;
    one.scale.setScalar(i % 2 ? 0.85 : 1);
    out.add(one);
  }
  return out;
}

/**
 * Sakasa carrying 4-2's paper lantern (for 5-1's cutscenes): the built amanojaku, her arm already posed by the caller
 * (src/view/three/models.ts), with a short stick held in her fist and a round warm lantern hanging from its far end on
 * a cord (`lit` false: out, the ending under the great tree). `grip` is the middle of the fist, `along` the stick's
 * direction out of it (forward and up); the stick's near end shows a little below the fist.
 */
export function addHandLantern(model: Group, lit: boolean, grip: Vector3, along: Vector3): Group {
  const out = model.clone(true);
  out.name = lit ? 'amanojaku-lantern' : 'amanojaku-lantern-off';
  const wood = new MeshLambertMaterial({ color: TRUNK });
  const rod = (from: Vector3, to: Vector3, r: number): Mesh => {
    const d = to.clone().sub(from);
    const m = new Mesh(new CylinderGeometry(r, r, d.length(), 6), wood);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const dir = along.clone().normalize();
  const tip = grip.clone().addScaledVector(dir, 0.4);
  const stick = rod(grip.clone().addScaledVector(dir, -0.05), tip, 0.011);
  const CORD = 0.05;
  const HALF = 0.125; // the paper's half height (a 0.1 m sphere stretched 1.25 tall)
  const cord = rod(tip, tip.clone().setY(tip.y - CORD - 0.01), 0.004);
  const paper = new Mesh(
    new SphereGeometry(0.1, 10, 8),
    new MeshLambertMaterial({ color: lit ? '#ffd07a' : '#c9a06a', emissive: new Color('#ffb04a'), emissiveIntensity: lit ? 1 : 0 }),
  );
  paper.scale.set(1, 1.25, 1);
  paper.position.set(tip.x, tip.y - CORD - HALF, tip.z);
  // Dark rims top and bottom, as on a real paper lantern.
  const rim = (y: number): Mesh => {
    const m = new Mesh(new CylinderGeometry(0.05, 0.05, 0.018, 10), wood);
    m.position.set(tip.x, y, tip.z);
    return m;
  };
  out.add(stick, cord, paper, rim(tip.y - CORD - 0.004), rim(tip.y - CORD - 2 * HALF + 0.004));
  return out;
}
