import {
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The building blocks of the stand-ins drawn in code for the chapter 3 sets (river-placeholders.ts, 3-2;
 * harbour-placeholders.ts, 3-3), the same way as the sea set (sea-placeholders.ts): parts painted by vertex colour,
 * merged into one mesh per model in one shared material, the origin at the bottom centre, +Z forward.
 */

export type Vec = readonly [number, number, number];
export type Paint = string | ((p: Vector3) => Color);
export interface Place {
  at?: Vec;
  rot?: Vec;
  quat?: Quaternion;
  scale?: number | Vec;
}

let shared: MeshLambertMaterial | null = null;
/** The one material the stand-ins share (colours from the vertices). */
export function kitMaterial(): MeshLambertMaterial {
  shared ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return shared;
}

let glowing: MeshLambertMaterial | null = null;
/** For things that glow a little in the dark (lanterns, glowing coral): the colours also light themselves. */
export function glowMaterial(): MeshLambertMaterial {
  if (glowing) return glowing;
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.55;');
  };
  m.customProgramCacheKey = () => 'kit-glow';
  glowing = m;
  return m;
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const mix = (a: string, b: string, t: number): Color => new Color(a).lerp(new Color(b), clamp01(t));

/** A repeatable 0…1 number for a point. */
export function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** One part: non-indexed, no uv, painted in its own space, then placed. Every part has the same attributes. */
export function part(source: BufferGeometry, paint: Paint, place: Place = {}): BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  if (g !== source) source.dispose();
  g.clearGroups();
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const fixed = typeof paint === 'string' ? new Color(paint) : null;
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const c = fixed ?? (paint as (p: Vector3) => Color)(p.fromBufferAttribute(pos, i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const s = place.scale ?? 1;
  const scale = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(s[0], s[1], s[2]);
  const rot = place.rot ?? [0, 0, 0];
  const q = place.quat ?? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2]));
  const at = place.at ?? [0, 0, 0];
  g.applyMatrix4(new Matrix4().compose(new Vector3(at[0], at[1], at[2]), q, scale));
  return g;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('placeholder: parts do not merge');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** A static model: one merged mesh (moved so its lowest point is at y = 0 unless `floor` is false). */
export function solid(name: string, parts: BufferGeometry[], mat: Material = kitMaterial(), floor = true): Group {
  const geometry = merge(parts);
  if (floor) {
    geometry.translate(0, -geometry.boundingBox!.min.y, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  const g = new Group();
  const mesh = new Mesh(geometry, mat);
  mesh.name = name;
  g.add(mesh);
  return g;
}

/** Two small round eyes (a dark dot with a white shine) at ±x, looking along +Z. */
export function eyes(x: number, y: number, z: number, r: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    out.push(part(sphere(r), '#2B3A4A', { at: [side * x, y, z] }));
    out.push(part(sphere(r * 0.35), '#FFFFFF', { at: [side * x + r * 0.3 * side, y + r * 0.35, z + r * 0.8] }));
  }
  return out;
}

function sphere(r: number): SphereGeometry {
  return new SphereGeometry(r, 7, 5);
}
