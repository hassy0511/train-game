import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { placeholderSize } from '../placeholder-sizes';

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

    // Models that are not built yet (pending Blender tickets) get a flat box of the right size,
    // so stages stay playable and no 404 requests are made.
    if (!this.has(name)) {
      console.warn(`[models] "${name}.glb" is not built yet; using a placeholder box`);
      const placeholder = Promise.resolve(makePlaceholder(name));
      this.cache.set(name, placeholder);
      return placeholder;
    }

    const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
    const loading = this.loader.loadAsync(url).then((gltf) => gltf.scene);
    this.cache.set(name, loading);
    return loading;
  }
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
