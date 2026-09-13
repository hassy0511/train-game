import { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Loads each glTF model once and shares its immutable geometry and materials. */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<Group>>();

  load(name: string): Promise<Group> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
    const loading = this.loader.loadAsync(url).then((gltf) => gltf.scene);
    this.cache.set(name, loading);
    return loading;
  }
}
