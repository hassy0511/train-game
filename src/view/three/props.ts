import { InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { Group, Material } from 'three';
import type { ResolvedProp } from '../../stage/types';
import type { ModelLibrary } from './models';

export interface ModelPlacement {
  model: string;
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
}

interface SourceMesh {
  mesh: Mesh;
  matrix: Matrix4;
}

const unitScale = new Vector3(1, 1, 1);
/** Size (m) of the ground cells props are batched by. */
const CELL = 150;

function sourceMeshes(template: Group): SourceMesh[] {
  template.updateMatrixWorld(true);
  const meshes: SourceMesh[] = [];
  template.traverse((object: Object3D) => {
    if (!(object instanceof Mesh)) return;
    meshes.push({ mesh: object, matrix: object.matrixWorld.clone() });
  });
  return meshes;
}

function placementMatrix(placement: ModelPlacement, target: Matrix4): Matrix4 {
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
        const instance = template.clone(true);
        instance.position.copy(matching[0].position);
        instance.quaternion.copy(matching[0].quaternion);
        instance.scale.setScalar(matching[0].scale);
        target.add(instance);
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
