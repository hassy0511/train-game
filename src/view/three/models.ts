import { Box3, BoxGeometry, BufferAttribute, Group, Mesh, MeshLambertMaterial, Quaternion, Raycaster, SphereGeometry, Vector3 } from 'three';
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
import { buildMirrorPlaceholder } from './mirror-placeholders';
import { buildReversePlaceholder } from './reverse-placeholders';
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

    // v1.11 (5-3): the mirror Sakasa waving, and shy (hands together, head a little on one side), posed from the built
    // amanojaku until ticket 0020 builds them.
    if ((name === 'amanojaku-wave' || name === 'amanojaku-shy') && !this.available.has(name)) {
      const posed = this.load('amanojaku').then((m) => poseAmanojaku(m, name));
      this.cache.set(name, posed);
      return posed;
    }

    // v1.11 (6-1, PR8b): Sakasa sitting (the bench, the friends' seat behind the driver), posed from the built amanojaku
    // until ticket 0021 builds it.
    if (name === 'amanojaku-sit' && !this.available.has(name)) {
      const sat = this.load('amanojaku').then(sitAmanojaku);
      this.cache.set(name, sat);
      return sat;
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
        buildMirrorPlaceholder(name) ??
        buildReversePlaceholder(name) ??
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

/**
 * v1.11 (5-3): Sakasa posed without bones (the built model is one clay mesh): the vertices of an arm (away from the
 * torso, between hip and shoulder) turn about the shoulder, blended in near it so nothing tears. "amanojaku-wave": her
 * right arm raised high (the view sways her as she waves); "amanojaku-shy": both hands brought together in front and her
 * head (hair and hat with it) tilted 10°. Model metres (assets/blender/amanojaku.py): shoulders at (±0.08, 0.866, 0).
 */
function poseAmanojaku(model: Group, name: 'amanojaku-wave' | 'amanojaku-shy'): Group {
  const out = model.clone(true);
  out.name = name;
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const Z = new Vector3(0, 0, 1);
  const X = new Vector3(1, 0, 0);
  const q = new Quaternion();
  const v = new Vector3();
  const pivot = new Vector3();
  const turnAbout = (at: Vector3, rot: Quaternion, w: number): void => {
    if (w <= 0) return;
    const moved = v.clone().sub(pivot).applyQuaternion(rot).add(pivot);
    v.lerp(moved, w);
    at.copy(v);
  };
  out.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    const at = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      at.copy(v);
      // The arms (clay only lies out there; the cape is behind them).
      for (const side of [-1, 1]) {
        const armW = smooth(0.1, 0.14, side * v.x) * smooth(0.42, 0.47, v.y) * (1 - smooth(0.86, 0.9, v.y)) * smooth(-0.06, -0.03, v.z);
        if (armW <= 0) continue;
        pivot.set(side * 0.08, 0.866, 0);
        if (name === 'amanojaku-wave' && side === -1) {
          q.setFromAxisAngle(Z, side * 2.3);
          turnAbout(at, q, armW);
        } else if (name === 'amanojaku-shy') {
          q.setFromAxisAngle(X, -0.9).multiply(new Quaternion().setFromAxisAngle(Z, -side * 0.35));
          turnAbout(at, q, armW);
        }
      }
      if (name === 'amanojaku-shy') {
        const headW = smooth(0.9, 0.97, v.y);
        if (headW > 0) {
          pivot.set(0, 0.93, 0);
          q.setFromAxisAngle(Z, 0.17);
          turnAbout(at, q, headW);
        }
      }
      pos.setXYZ(i, at.x, at.y, at.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  });
  return out;
}

/**
 * v1.11 (6-1): "amanojaku-sit": Sakasa sitting, posed without bones from the built amanojaku (one clay mesh): the legs
 * (below the hip, in front of the cape) turn forward about the hip, what hangs behind (the cape's hem) gathers at the
 * seat, and the whole figure comes down so the seat (her bottom) is the origin. Model metres (assets/blender/amanojaku.py):
 * the hip at y 0.44. About 1.0 m tall sitting, legs 0.4 m out in front (+Z).
 */
function sitAmanojaku(model: Group): Group {
  const out = model.clone(true);
  out.name = 'amanojaku-sit';
  const HIP = 0.44;
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const pivot = new Vector3(0, HIP, 0.02);
  const v = new Vector3();
  out.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const below = 1 - smooth(HIP - 0.04, HIP + 0.02, v.y);
      if (below > 0) {
        const front = smooth(-0.06, -0.01, v.z);
        if (front > 0) {
          const turned = v.clone().sub(pivot).applyQuaternion(q).add(pivot);
          v.lerp(turned, below * front);
        }
        // What hangs behind gathers under her at the seat.
        if (front < 1) v.y = v.y + (HIP + (v.y - HIP) * 0.08 - v.y) * below * (1 - front);
      }
      pos.setXYZ(i, v.x, v.y - HIP, v.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  });
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
