import {
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  SkinnedMesh,
  Vector3,
  type Side,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * Vertex-colour baking (docs/PHASE7_FINISH.md §2 A). Our models are built from plain colours without textures,
 * yet three.js draws one call per material. Baking merges every part of a model into one geometry that carries
 * its material's colour (plus roughness, metalness and emissive where they matter) per vertex, drawn with one
 * shared material that reads them back: the same look in one draw call.
 *
 * The shared materials are used by every baked model: never change one on a single object (fade, tint);
 * give that object its own material first.
 */

type PlainMaterial = MeshStandardMaterial | MeshLambertMaterial;

/** One mesh of a template, with its transform into the baked space. */
interface Part {
  geometry: BufferGeometry;
  material: PlainMaterial;
  matrix: Matrix4;
}

/** A model to bake at a given transform (the template's own root transform is replaced by it, as on a placed clone). */
export interface BakeSource {
  template: Object3D;
  matrix: Matrix4;
}

const baked = new WeakMap<Object3D, Group | null>();
const shared = new Map<string, Material>();

/** Material settings a baked part must leave at their defaults: anything else cannot share one material. */
function isPlain(material: Material): material is PlainMaterial {
  if (material.type !== 'MeshStandardMaterial' && material.type !== 'MeshLambertMaterial') return false;
  const m = material as PlainMaterial;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.alphaHash || m.vertexColors || m.wireframe) return false;
  if (!m.visible || !m.depthTest || !m.depthWrite || !m.colorWrite || m.blending !== NormalBlending || !m.fog) return false;
  if (m.polygonOffset || Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return false;
  // Any map (colour, normal, emissive, environment...) needs uvs and its own texture.
  return !Object.values(m).some((value) => (value as { isTexture?: boolean } | null)?.isTexture === true);
}

/**
 * Adds the meshes of `root` to `parts`, placed by `base` (relative to the root, so the root's own transform is
 * dropped). False when any part cannot be baked.
 */
function collect(root: Object3D, base: Matrix4, parts: Part[]): boolean {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  let ok = true;
  root.traverse((object) => {
    if (!ok) return;
    if (!object.visible) {
      ok = false;
      return;
    }
    if (!(object instanceof Mesh)) {
      ok = object.type === 'Group' || object.type === 'Object3D';
      return;
    }
    const geometry = object.geometry as BufferGeometry;
    const material = object.material as Material | Material[];
    if (
      object instanceof InstancedMesh ||
      object instanceof SkinnedMesh ||
      object.renderOrder !== 0 ||
      (object.morphTargetInfluences?.length ?? 0) > 0 ||
      Object.keys(geometry.morphAttributes).length > 0 ||
      Array.isArray(material) ||
      !isPlain(material) ||
      !geometry.getAttribute('position') ||
      geometry.getAttribute('color') ||
      geometry.drawRange.start !== 0 ||
      geometry.drawRange.count !== Infinity
    ) {
      ok = false;
      return;
    }
    parts.push({ geometry, material, matrix: base.clone().multiply(toRoot).multiply(object.matrixWorld) });
  });
  return ok && parts.length > 0;
}

/** Parts sharing a family share one material: same shader, face culling and shading. */
function familyKey(material: PlainMaterial): string {
  return `${material.type}|${material.side}|${material.flatShading ? 'flat' : 'smooth'}`;
}

interface Extra {
  name: string;
  glsl: 'float' | 'vec3';
  /** Fragment code the attribute's varying replaces. */
  from: string;
  to: string;
}

const ROUGHNESS: Extra = {
  name: 'Roughness',
  glsl: 'float',
  from: '#include <roughnessmap_fragment>',
  to: 'float roughnessFactor = vBakedRoughness;',
};
const METALNESS: Extra = {
  name: 'Metalness',
  glsl: 'float',
  from: '#include <metalnessmap_fragment>',
  to: 'float metalnessFactor = vBakedMetalness;',
};
const EMISSIVE: Extra = {
  name: 'Emissive',
  glsl: 'vec3',
  from: 'vec3 totalEmissiveRadiance = emissive;',
  to: 'vec3 totalEmissiveRadiance = vBakedEmissive;',
};

/** Passes each baked attribute through to the fragment shader, where it replaces the material's uniform. */
function patchShader(shader: WebGLProgramParametersWithUniforms, extras: Extra[]): void {
  const declare = (kind: 'attribute' | 'varying') =>
    extras.map((e) => `${kind} ${e.glsl} ${kind === 'attribute' ? 'baked' : 'vBaked'}${e.name};`).join('\n');
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${declare('attribute')}\n${declare('varying')}`)
    .replace('#include <color_vertex>', `#include <color_vertex>\n${extras.map((e) => `vBaked${e.name} = baked${e.name};`).join('\n')}`);
  let fragment = shader.fragmentShader.replace('#include <common>', `#include <common>\n${declare('varying')}`);
  for (const extra of extras) {
    if (!fragment.includes(extra.from)) console.warn(`[bake] shader has no "${extra.from}"; baked ${extra.name} is ignored`);
    fragment = fragment.replace(extra.from, extra.to);
  }
  shader.fragmentShader = fragment;
}

/** The one material every baked mesh of a family (and set of per-vertex extras) uses. */
function sharedMaterial(sample: PlainMaterial, extras: Extra[]): Material {
  const key = `${familyKey(sample)}|${extras.map((e) => e.name).join(',')}`;
  const cached = shared.get(key);
  if (cached) return cached;
  const options = { vertexColors: true, side: sample.side as Side, flatShading: sample.flatShading };
  const material =
    sample.type === 'MeshStandardMaterial'
      ? new MeshStandardMaterial({ ...options, roughness: 1, metalness: 0 })
      : new MeshLambertMaterial(options);
  material.name = `baked:${key}`;
  if (extras.length > 0) {
    material.onBeforeCompile = (shader) => patchShader(shader, extras);
    // The patch differs by extras, which the default key (the callback's source) cannot tell apart.
    material.customProgramCacheKey = () => `baked:${extras.map((e) => e.name).join(',')}`;
  }
  shared.set(key, material);
  return material;
}

const emissiveOf = (material: PlainMaterial): [number, number, number] => {
  const k = material.emissiveIntensity;
  return [material.emissive.r * k, material.emissive.g * k, material.emissive.b * k];
};

/** Merges one family's parts into a single mesh (position and normal only; uvs are dropped). */
function bakeFamily(parts: Part[]): Mesh {
  const sample = parts[0].material;
  const standard = sample.type === 'MeshStandardMaterial';
  const extras: Extra[] = [];
  if (standard) extras.push(ROUGHNESS);
  if (standard && parts.some((p) => (p.material as MeshStandardMaterial).metalness !== 0)) extras.push(METALNESS);
  if (parts.some((p) => emissiveOf(p.material).some((v) => v > 0))) extras.push(EMISSIVE);

  // Every part gets an index (0..n-1 for unindexed ones), so indexed and unindexed parts merge alike.
  const sources = parts.map((part) => {
    let geometry = part.geometry;
    if (!geometry.getAttribute('normal')) {
      geometry = new BufferGeometry().setAttribute('position', geometry.getAttribute('position'));
      if (part.geometry.index) geometry.setIndex(part.geometry.index);
      geometry.computeVertexNormals();
    }
    const vertices = geometry.getAttribute('position').count;
    return { part, geometry, vertices, indices: geometry.index ? geometry.index.count : vertices };
  });
  const vertexCount = sources.reduce((sum, s) => sum + s.vertices, 0);
  const indexCount = sources.reduce((sum, s) => sum + s.indices, 0);

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const roughnesses = extras.includes(ROUGHNESS) ? new Float32Array(vertexCount) : null;
  const metalnesses = extras.includes(METALNESS) ? new Float32Array(vertexCount) : null;
  const emissives = extras.includes(EMISSIVE) ? new Float32Array(vertexCount * 3) : null;
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  const p = new Vector3();
  const n = new Vector3();
  const normalMatrix = new Matrix3();
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const { part, geometry, vertices, indices } of sources) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    normalMatrix.getNormalMatrix(part.matrix);
    const { color } = part.material;
    const emissive = emissiveOf(part.material);
    for (let i = 0; i < vertices; i += 1) {
      const at = vertexOffset + i;
      p.fromBufferAttribute(position, i).applyMatrix4(part.matrix).toArray(positions, at * 3);
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize().toArray(normals, at * 3);
      color.toArray(colors, at * 3);
      if (roughnesses) roughnesses[at] = (part.material as MeshStandardMaterial).roughness;
      if (metalnesses) metalnesses[at] = (part.material as MeshStandardMaterial).metalness;
      emissives?.set(emissive, at * 3);
    }
    // A mirrored part (negative scale) is drawn with its faces flipped; baked, its winding has to be turned.
    const flip = part.matrix.determinant() < 0;
    const source = geometry.index;
    for (let i = 0; i < indices; i += 3) {
      const a = source ? source.getX(i) : i;
      const b = source ? source.getX(i + 1) : i + 1;
      const c = source ? source.getX(i + 2) : i + 2;
      index[indexOffset + i] = vertexOffset + a;
      index[indexOffset + i + 1] = vertexOffset + (flip ? c : b);
      index[indexOffset + i + 2] = vertexOffset + (flip ? b : c);
    }
    vertexOffset += vertices;
    indexOffset += indices;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  if (roughnesses) geometry.setAttribute('bakedRoughness', new BufferAttribute(roughnesses, 1));
  if (metalnesses) geometry.setAttribute('bakedMetalness', new BufferAttribute(metalnesses, 1));
  if (emissives) geometry.setAttribute('bakedEmissive', new BufferAttribute(emissives, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return new Mesh(geometry, sharedMaterial(sample, extras));
}

/** One mesh per material family (usually just one). */
function bakeParts(parts: Part[]): Group {
  const families = new Map<string, Part[]>();
  for (const part of parts) {
    const key = familyKey(part.material);
    const list = families.get(key) ?? [];
    list.push(part);
    families.set(key, list);
  }
  const group = new Group();
  for (const [key, list] of families) {
    const mesh = bakeFamily(list);
    mesh.name = `baked:${key}`;
    group.add(mesh);
  }
  return group;
}

/**
 * The template baked into one mesh per material family (a drop-in for the template: clone it the same way), or
 * null when it cannot be: a texture, transparency, vertex colours, skinning or morphs, or a material other than
 * MeshStandardMaterial / MeshLambertMaterial. Cached per template.
 */
export function bakeModel(template: Group): Group | null {
  if (baked.has(template)) return baked.get(template) ?? null;
  const parts: Part[] = [];
  const group = collect(template, new Matrix4(), parts) ? bakeParts(parts) : null;
  if (group) {
    group.name = template.name;
    group.position.copy(template.position);
    group.quaternion.copy(template.quaternion);
    group.scale.copy(template.scale);
  }
  baked.set(template, group);
  return group;
}

/** Several models, each at its own transform, baked together (a station's platform, roof and signs), or null. */
export function bakeTogether(sources: BakeSource[]): Group | null {
  const parts: Part[] = [];
  for (const source of sources) if (!collect(source.template, source.matrix, parts)) return null;
  return bakeParts(parts);
}
