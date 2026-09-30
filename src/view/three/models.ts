import { Box3, BoxGeometry, Group, Mesh, MeshLambertMaterial, Raycaster, SphereGeometry, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { placeholderSize } from '../placeholder-sizes';
import { buildForestPlaceholder } from './forest-placeholders';
import { buildHarbourPlaceholder } from './harbour-placeholders';
import { buildIcePlaceholder } from './ice-placeholders';
import { buildVillagePlaceholder } from './village-placeholders';
import { buildMeadowPlaceholder } from './meadow-placeholders';
import { addHandLantern, buildNightPlaceholder } from './night-placeholders';
import { buildRecordPlaceholder } from './record-placeholders';
import { buildRiverPlaceholder } from './river-placeholders';
import { buildSeaPlaceholder } from './sea-placeholders';
import { buildSkyPlaceholder } from './sky-placeholders';
import { buildSnowPlaceholder } from './snow-placeholders';
import { buildToyPlaceholder } from './toy-placeholders';
import { buildMagnetPlaceholder } from './magnet-placeholders';
import { buildVolcanoPlaceholder } from './volcano-placeholders';

const PLACEHOLDER_COLORS: Record<string, number> = {
  tree: 0x4f9f5a,
  house: 0xe8c9a0,
  cat: 0xf4a261,
  passenger: 0x4f7fb0,
  amanojaku: 0xb4a7d6,
  platform: 0xbfb8aa,
  'stop-line': 0xffffff,
  'stop-board': 0xd64545,
  'car-proto': 0x3fa7d6,
};

function placeholderColor(name: string): number {
  const key = Object.keys(PLACEHOLDER_COLORS).find((k) => name.startsWith(k));
  return key ? PLACEHOLDER_COLORS[key] : 0xbbbbbb;
}

/** Loads each glTF model once and shares its immutable geometry and materials. */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<Group>>();
  private readonly available = new Set<string>(__MODEL_MANIFEST__);

  /** True when a .glb for this name exists in the build. */
  has(name: string): boolean {
    return this.available.has(name);
  }

  load(name: string): Promise<Group> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    // v1.10 (4-3): Sakasa blushing (pink cheeks on the built model), until ticket 0017 builds one of its own.
    if (name === 'amanojaku-blush' && !this.available.has(name)) {
      const blush = this.load('amanojaku').then(addBlush);
      this.cache.set(name, blush);
      return blush;
    }

    // v1.11 (5-1): Sakasa with 4-2's paper lantern (lit, or out), made from the built amanojaku (ticket 0018).
    if ((name === 'amanojaku-lantern' || name === 'amanojaku-lantern-off') && !this.available.has(name)) {
      const held = this.load('amanojaku').then((m) => addHandLantern(m, name === 'amanojaku-lantern'));
      this.cache.set(name, held);
      return held;
    }

    // Models that are not built yet (pending Blender tickets) get a flat box of the right size,
    // so stages stay playable and no 404 requests are made.
    if (!this.available.has(name)) {
      const drawn =
        buildSkyPlaceholder(name) ??
        buildForestPlaceholder(name) ??
        buildMeadowPlaceholder(name) ??
        buildVolcanoPlaceholder(name) ??
        buildSeaPlaceholder(name) ??
        buildIcePlaceholder(name) ??
        buildRiverPlaceholder(name) ??
        buildHarbourPlaceholder(name) ??
        buildVillagePlaceholder(name) ??
        buildSnowPlaceholder(name) ??
        buildNightPlaceholder(name) ??
        buildToyPlaceholder(name) ??
        buildMagnetPlaceholder(name) ??
        buildRecordPlaceholder(name);
      if (!drawn) console.warn(`[models] "${name}.glb" is not built yet; using a placeholder box`);
      const placeholder = Promise.resolve(drawn ?? makePlaceholder(name));
      this.cache.set(name, placeholder);
      return placeholder;
    }

    const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
    const loading = this.loader.loadAsync(url).then((gltf) => gltf.scene);
    this.cache.set(name, loading);
    return loading;
  }
}

/**
 * A copy of Sakasa with two round pink cheeks (#F7A1B5) on the face, below the eyes: two rays cast from in front at
 * cheek height find the skin, so they sit on it.
 */
function addBlush(model: Group): Group {
  const out = model.clone(true);
  out.name = 'amanojaku-blush';
  out.updateMatrixWorld(true);
  const box = new Box3().setFromObject(out);
  // The face (model metres, assets/blender/amanojaku.py): the eyes at y 1.040, x ±0.047; the cheeks a little lower
  // and further out.
  const y = box.min.y + 0.992;
  const material = new MeshLambertMaterial({ color: '#F7A1B5', emissive: '#F7A1B5', emissiveIntensity: 0.25 });
  const ray = new Raycaster();
  for (const side of [-1, 1]) {
    const x = side * 0.078;
    ray.set(new Vector3(x, y, box.max.z + 1), new Vector3(0, 0, -1));
    const hit = ray.intersectObject(out, true)[0];
    const z = hit ? hit.point.z : box.max.z;
    const cheek = new Mesh(new SphereGeometry(0.024, 10, 6), material);
    cheek.scale.set(1.25, 0.8, 0.35);
    cheek.position.set(x, y, z + 0.002);
    out.add(cheek);
  }
  return out;
}

function makePlaceholder(name: string): Group {
  const [w, h, d] = placeholderSize(name);
  const group = new Group();
  group.name = `${name}-placeholder`;
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshLambertMaterial({ color: placeholderColor(name) }));
  mesh.position.y = h / 2;
  group.add(mesh);
  return group;
}
