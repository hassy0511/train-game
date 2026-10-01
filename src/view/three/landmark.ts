import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type PerspectiveCamera } from 'three';
import type { LandmarkDef } from '../../stage/types';
import { LANDMARK } from '../../train/params';

/**
 * v1.11 (6-1, PHASE9_CHAPTER5_6 第 7 部 §4.6 k): `environment.landmark`, a faraway landmark's shadow the fog never hides
 * (the upside-down castle seen from the whole town): one pale lavender board, turned to the camera, drawn at the
 * landmark's true apparent size (`height` ÷ distance) but inside the camera's far plane (nearer and smaller in step),
 * so the far plane never changes. Nearer than `near` m it fades out over LANDMARK.fade m (the real one is there by then).
 * One draw call. Until ticket 0021's "sakasa-castle-far" is built the board carries a silhouette drawn here (a round
 * tower cluster standing on a downward point, the way the map draws the castle; no face, no flags with letters).
 */
export class LandmarkBoard {
  readonly mesh: Mesh;
  private readonly foot: Vector3;
  private readonly height: number;
  private readonly near: number;

  constructor(def: LandmarkDef) {
    this.foot = new Vector3(...def.position);
    this.height = def.height;
    this.near = def.near ?? LANDMARK.near;
    const material = new MeshBasicMaterial({ map: silhouette(), transparent: true, depthWrite: false, fog: false, side: DoubleSide });
    // Its foot at the bottom middle (a board 1 m high, as wide as the picture).
    const geometry = new PlaneGeometry(0.8, 1);
    geometry.translate(0, 0.5, 0);
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'landmark';
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /** Every frame: where the board stands and how clear it is, from the camera. */
  update(camera: PerspectiveCamera): void {
    const to = this.foot.clone().sub(camera.position);
    const distance = to.length();
    const material = this.mesh.material as MeshBasicMaterial;
    const fade = Math.max(0, Math.min(1, (distance - this.near) / LANDMARK.fade));
    this.mesh.visible = fade > 0.01;
    if (!this.mesh.visible) return;
    material.opacity = fade * 0.85;
    // Inside the far plane: nearer by the same factor it is made smaller, so it looks as big as the real one.
    const drawAt = Math.min(distance, camera.far * 0.9);
    const k = drawAt / distance;
    this.mesh.position.copy(camera.position).addScaledVector(to, k);
    this.mesh.scale.setScalar(this.height * k);
    // Turned to the camera about the vertical only.
    this.mesh.rotation.set(0, Math.atan2(-to.x, -to.z), 0);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const material = this.mesh.material as MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
  }
}

/** The castle's shadow: pale lavender, wide at the top, standing on a downward point (as it stands upside down). */
function silhouette(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#b9a9d8';
  // Four round towers side by side (their tops round), a body, and the roof's point down into the island.
  for (const [x, w, top] of [
    [14, 22, 30],
    [38, 24, 14],
    [66, 24, 18],
    [92, 22, 34],
  ] as const) {
    g.beginPath();
    g.ellipse(x + w / 2, top + 6, w / 2, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x, top + 6, w, 90 - top);
  }
  g.beginPath();
  g.moveTo(12, 96);
  g.lineTo(116, 96);
  g.lineTo(64, 160);
  g.closePath();
  g.fill();
  return new CanvasTexture(canvas);
}
