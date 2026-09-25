import { InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Group, Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ResolvedProp } from '../../stage/types';
import { bakeModel } from './bake';
import type { ModelLibrary } from './models';

export interface ModelPlacement {
  model: string;
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
}

export interface SourceMesh {
  mesh: Mesh;
  matrix: Matrix4;
}

const unitScale = new Vector3(1, 1, 1);
/** Size (m) of the ground cells props are batched by (a baked model costs one draw call per cell, so cells can be small). */
const CELL = 75;

const merged = new WeakMap<Group, SourceMesh[]>();

/** Attribute names plus indexed or not: geometries can only be merged when these match. */
const layout = (g: BufferGeometry): string => `${Object.keys(g.attributes).sort().join(',')}|${g.index ? 'i' : 'n'}`;

/**
 * The template's meshes for static props: the baked model (one mesh per material family) when it can be baked,
 * otherwise every group of parts that share a material merged into one, so a model built from many small parts
 * in one colour, like a cloud of spheres, still becomes one draw call.
 */
export function sourceMeshes(template: Group): SourceMesh[] {
  const cached = merged.get(template);
  if (cached) return cached;
  template.updateMatrixWorld(true);
  const baked = bakeModel(template);
  if (baked) {
    // Baked meshes sit at the root (relative to its transform), which the template's own matrix puts back.
    const out = baked.children.map((mesh) => ({ mesh: mesh as Mesh, matrix: template.matrixWorld.clone() }));
    merged.set(template, out);
    return out;
  }
  const groups = new Map<string, SourceMesh[]>();
  template.traverse((object: Object3D) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    const key = `${(object.material as Material).uuid}|${layout(object.geometry as BufferGeometry)}`;
    const list = groups.get(key) ?? [];
    list.push({ mesh: object, matrix: object.matrixWorld.clone() });
    groups.set(key, list);
  });
  const out: SourceMesh[] = [];
  template.traverse((object: Object3D) => {
    if (object instanceof Mesh && Array.isArray(object.material)) out.push({ mesh: object, matrix: object.matrixWorld.clone() });
  });
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const geometry = mergeGeometries(list.map((s) => (s.mesh.geometry as BufferGeometry).clone().applyMatrix4(s.matrix)));
    if (!geometry) {
      out.push(...list);
      continue;
    }
    const mesh = new Mesh(geometry, list[0].mesh.material);
    mesh.name = `${list[0].mesh.name}+${list.length - 1}`;
    out.push({ mesh, matrix: new Matrix4() });
  }
  merged.set(template, out);
  return out;
}

export function placementMatrix(placement: ModelPlacement, target: Matrix4): Matrix4 {
  unitScale.setScalar(placement.scale);
  return target.compose(placement.position, placement.quaternion, unitScale);
}

/** Adds resolved stage props, instancing each repeated model mesh into one draw call. */
export async function addProps(target: Group, props: ResolvedProp[], models: ModelLibrary): Promise<void> {
  await addModelPlacements(target, props, models);
}

/** Adds model placements. Repeated models are instanced independently for each glTF mesh. */
export async function addModelPlacements(
  target: Group,
  placements: ModelPlacement[],
  models: ModelLibrary,
): Promise<void> {
  // One instanced batch per model and ground cell: a batch is culled as a whole, so on a long stage the
  // cells behind the camera and beyond the fog are skipped instead of drawing every copy every frame.
  const byModel = new Map<string, ModelPlacement[]>();
  for (const placement of placements) {
    const cell = `${Math.floor(placement.position.x / CELL)}:${Math.floor(placement.position.z / CELL)}`;
    const key = `${placement.model}|${cell}`;
    const matching = byModel.get(key);
    if (matching) matching.push(placement);
    else byModel.set(key, [placement]);
  }

  await Promise.all(
    [...byModel].map(async ([key, matching]) => {
      const name = key.split('|')[0];
      const template = await models.load(name);
      if (matching.length === 1) {
        const placed = placementMatrix(matching[0], new Matrix4());
        for (const source of sourceMeshes(template)) {
          const mesh = new Mesh(source.mesh.geometry, source.mesh.material);
          mesh.name = `${name}:${source.mesh.name}`;
          // Set the matrix directly: a part's own scale may be non-uniform, which a decompose would skew.
          mesh.matrixAutoUpdate = false;
          mesh.matrix.multiplyMatrices(placed, source.matrix);
          target.add(mesh);
        }
        return;
      }

      const placement = new Matrix4();
      const combined = new Matrix4();
      for (const source of sourceMeshes(template)) {
        const instances = new InstancedMesh(
          source.mesh.geometry,
          source.mesh.material as Material | Material[],
          matching.length,
        );
        instances.name = `${name}:${source.mesh.name}`;
        for (let index = 0; index < matching.length; index += 1) {
          placementMatrix(matching[index], placement);
          combined.multiplyMatrices(placement, source.matrix);
          instances.setMatrixAt(index, combined);
        }
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingSphere();
        target.add(instances);
      }
    }),
  );
}
