import { Color, Group, Mesh, MeshBasicMaterial, type Material, type Object3D } from 'three';
import { bakeModel } from './bake';

/**
 * v1.10 (4-3, ticket 0017): what the game adds to two of the snowy mountain's built models (assets/blender/snow.py) as
 * they load. Their glTF materials are named for it:
 * - `exit-glow` (the daylight at a tunnel's far end): a light the fog does not hide, so it shows from deep in the dark.
 * - `fake-exit` (the way out Sakasa painted on the ice wall): its painted opening ("fake-exit-light") shines like the
 *   real exit; its swirl ("fake-exit-swirl"), a faint pink on that light, is hardly seen until the light sees through the false
 *   exit, then turns pink (setFakeExitGlow). The rest of it is baked into one mesh, so it draws in three calls.
 */

const EXIT_LIGHT = '#F7FBFF';
const SWIRL = '#FF7FBF';
/** The swirl before the light shows it: a faint pink on the white. */
const SWIRL_FAINT = '#F9E6F0';

let fakeGlow: MeshBasicMaterial | null = null;
/**
 * The swirl on the false exit: a faint pink on the painted light (not lit, not fogged), so it is hardly seen; bright pink
 * as the light sees through the false exit (setFakeExitGlow).
 */
function fakeGlowMaterial(): MeshBasicMaterial {
  fakeGlow ??= new MeshBasicMaterial({ color: SWIRL_FAINT, fog: false });
  return fakeGlow;
}

/** v1.10 (4-3): how much the false exit's swirl glows (0 = hardly seen, 1 = seen through with the light). */
export function setFakeExitGlow(k: number): void {
  fakeGlowMaterial().color.set(SWIRL_FAINT).lerp(new Color(SWIRL), Math.min(1, Math.max(0, k)));
}

let daylight: MeshBasicMaterial | null = null;
/** The light of an exit (real or painted): plain white, not lit and not fogged. */
function daylightMaterial(): MeshBasicMaterial {
  daylight ??= new MeshBasicMaterial({ color: EXIT_LIGHT, fog: false });
  return daylight;
}

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/** The models this module touches, as ModelLibrary loads them. */
export function prepareSnowModel<T extends Object3D>(name: string, model: T): T {
  if (name === 'exit-glow') {
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.material = daylightMaterial();
    });
  }
  if (name === 'fake-exit') splitFakeExit(model as unknown as Group);
  return model;
}

/** The false exit as three meshes: its plain parts baked into one, the painted light and the swirl in theirs. */
function splitFakeExit(model: Group): void {
  model.updateMatrixWorld(true);
  const plain = new Group();
  const special: Mesh[] = [];
  const meshes: Mesh[] = [];
  model.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  for (const mesh of meshes) {
    const name = materialsOf(mesh)[0]?.name ?? '';
    const copy = new Mesh(mesh.geometry, mesh.material);
    copy.name = name || mesh.name;
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    if (name === 'fake-exit-light' || name === 'fake-exit-swirl') {
      copy.material = name === 'fake-exit-light' ? daylightMaterial() : fakeGlowMaterial();
      special.push(copy);
    } else {
      plain.add(copy);
    }
  }
  const baked = bakeModel(plain);
  model.clear();
  model.add(...(baked ? baked.children.map((c) => c.clone()) : plain.children), ...special);
  setFakeExitGlow(0);
}
