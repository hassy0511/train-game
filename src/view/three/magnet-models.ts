import { Matrix4, Vector3, type BufferGeometry, type Group, type Material, type Mesh, type Object3D } from 'three';
import { bakeModel, bakeTogether } from './bake';
import type { ModelLibrary } from './models';

/**
 * v1.11 (ticket 0020, the magnet light's common section): the odds and ends by the line as the iron layer draws them
 * (src/view/three/iron-props.ts: one instanced mesh per kind, so each kind must be one geometry in one material). Their
 * built models (assets/blender/magnet-set.py: flat colours) are baked: one mesh each in the shared baked material.
 * The sign's bell is the node "bell" of "sign-bell", its origin where the string ties on: it is drawn apart (it
 * stretches out towards the train), so the post and the bell are baked separately.
 */

export interface IronPiece {
  geometry: BufferGeometry;
  material: Material;
}

export interface IronPieces {
  can: IronPiece;
  bucket: IronPiece;
  /** The sign without its bell. */
  post: IronPiece;
  /** The bell alone, its origin the top of its string. */
  bell: IronPiece;
  /** Where the bell hangs, from the sign's origin. */
  bellAt: Vector3;
}

/** The one mesh a baked model came to (its first, if the baking split it by material family). */
function pieceOf(baked: Group | null, name: string): IronPiece {
  const mesh = baked?.children.find((c) => (c as Mesh).isMesh) as Mesh | undefined;
  if (!mesh) throw new Error(`[iron] "${name}" could not be baked into one mesh`);
  return { geometry: mesh.geometry, material: mesh.material as Material };
}

/** The four pieces, from the built models (loaded once; the baked meshes are shared by every stage). */
export async function loadIronPieces(models: ModelLibrary): Promise<IronPieces> {
  const [can, bucket, sign] = await Promise.all([models.load('iron-can'), models.load('iron-bucket'), models.load('sign-bell')]);
  const bellNode = sign.getObjectByName('bell') as Object3D | undefined;
  const bellAt = bellNode ? bellNode.position.clone() : new Vector3(0, 1.53, 0.38);
  // The sign without its bell (a copy: the loaded model stays whole for the model page).
  const post = sign.clone(true);
  post.getObjectByName('bell')?.removeFromParent();
  return {
    can: pieceOf(bakeModel(can), 'iron-can'),
    bucket: pieceOf(bakeModel(bucket), 'iron-bucket'),
    post: pieceOf(bakeModel(post), 'sign-bell'),
    bell: pieceOf(bellNode ? bakeTogether([{ template: bellNode, matrix: new Matrix4() }]) : null, 'sign-bell (bell)'),
    bellAt,
  };
}
