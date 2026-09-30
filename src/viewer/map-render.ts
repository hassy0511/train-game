/**
 * Dev tool (tools/map-render.html, driven by scripts/render-map.mjs): draws one world-map island as a small
 * diorama of the game's own models and leaves it on a transparent canvas. Not part of the game build.
 * `?island=<id>` renders that island; `?island=unknown` a bare island for the "?" silhouettes.
 */
import {
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ModelLibrary } from '../view/three/models';
import world from '../world/world.json';
import type { WorldFile, WorldDiorama } from '../world/types';

const WIDTH = 1400;
const HEIGHT = 1050;
const FOV = 28;

const RAIL = new MeshLambertMaterial({ color: '#5b5f66' });
const SLEEPER = new MeshLambertMaterial({ color: '#9a7654' });

/** A ring of track on the island top (the map only needs the idea of a line). */
function railRing(radius: number): Group {
  const g = new Group();
  for (const r of [radius - 0.55, radius + 0.55]) {
    const ring = new Mesh(new TorusGeometry(r, 0.12, 6, 72), RAIL);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.35;
    g.add(ring);
  }
  const sleepers = Math.round((Math.PI * 2 * radius) / 1.6);
  for (let i = 0; i < sleepers; i++) {
    const a = (i / sleepers) * Math.PI * 2;
    const s = new Mesh(new BoxGeometry(2.0, 0.2, 0.5), SLEEPER);
    s.position.set(Math.cos(a) * radius, 0.15, Math.sin(a) * radius);
    s.rotation.y = -a;
    g.add(s);
  }
  return g;
}

/** Paints the upward faces of `root`'s meshes `color` (vertex colours on a copy of each geometry, else the material). */
function tintTop(root: Group, color: string): void {
  const c = new Color(color);
  const top = new Box3().setFromObject(root).max.y;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    const normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    if (!normals) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshLambertMaterial;
    let out = colors;
    if (!out) {
      // A material colour: every vertex that colour, then its own copy of the material painted by vertices.
      const base = material.color ?? new Color('#ffffff');
      const array = new Float32Array(normals.count * 3);
      for (let i = 0; i < normals.count; i++) base.toArray(array, i * 3);
      out = new Float32BufferAttribute(array, 3);
      geometry.setAttribute('color', out);
      const painted = material.clone();
      painted.vertexColors = true;
      painted.color = new Color('#ffffff');
      mesh.material = painted;
    }
    // The top and its grassy edge (everything within 2 m of the island's top, in world height); the rock keeps its colour.
    root.updateMatrixWorld(true);
    const positions = geometry.getAttribute('position');
    const p = new Vector3();
    for (let i = 0; i < positions.count; i++) if (p.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).y > top - 2) out.setXYZ(i, c.r, c.g, c.b);
    out.needsUpdate = true;
    mesh.geometry = geometry;
  });
}

async function build(diorama: WorldDiorama | null, models: ModelLibrary): Promise<Group> {
  const root = new Group();
  const base = (await models.load(diorama?.base ?? 'island-b')).clone(true);
  // v1.11: a ground colour of its own (5-3's lavender): the top faces of the island take it, the rock underneath keeps its.
  if (diorama?.ground) tintTop(base, diorama.ground);
  root.add(base);
  if (!diorama) return root;
  if (diorama.rail) root.add(railRing(diorama.rail.radius));
  for (const item of diorama.items) {
    const model = (await models.load(item.model)).clone(true);
    // A glow meant for the night sky (additive) would print as a dark blot on the picture's transparent background.
    model.traverse((o) => {
      if (o.name === 'great-tree-halo') o.visible = false;
    });
    const scale = item.scale ?? 1;
    const rot = MathUtils.degToRad(item.rotY ?? 0);
    model.scale.setScalar(scale);
    if (item.scaleY) model.scale.y *= item.scaleY;
    model.rotation.y = rot;
    const local = new Vector3(...(item.local ?? [0, 0, 0])).multiplyScalar(scale).applyAxisAngle(new Vector3(0, 1, 0), rot);
    model.position.set(item.at[0] + local.x, (item.lift ?? 0) + local.y, item.at[1] + local.z);
    root.add(model);
  }
  return root;
}

/** Trims the transparent margin (plus a little padding) into a new canvas that the script reads. */
function crop(source: HTMLCanvasElement): void {
  const full = document.createElement('canvas');
  full.width = source.width;
  full.height = source.height;
  const ctx = full.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const { data } = ctx.getImageData(0, 0, full.width, full.height);
  let x0 = full.width;
  let y0 = full.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < full.height; y++) {
    for (let x = 0; x < full.width; x++) {
      if (data[(y * full.width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  const pad = 6;
  const w = x1 - x0 + 1 + pad * 2;
  const h = y1 - y0 + 1 + pad * 2;
  const out = document.createElement('canvas');
  out.id = 'out';
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(full, x0 - pad, y0 - pad, w, h, 0, 0, w, h);
  document.body.dataset.size = `${w}x${h}`;
  document.body.appendChild(out);
}

async function main(): Promise<void> {
  const id = new URLSearchParams(location.search).get('island') ?? '1-1';
  const file = world as unknown as WorldFile;
  const island = file.islands.find((i) => i.id === id);
  const diorama = id === 'unknown' ? null : (island?.diorama ?? null);
  if (id !== 'unknown' && !diorama) throw new Error(`island "${id}" has no diorama`);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  // v1.11: a night island (5-1) under a blue moonlight at 70 % of the day's (第 4 部 §11).
  const night = diorama?.lighting === 'night';
  scene.add(night ? new HemisphereLight(0xa9b8f0, 0x2f4a3a, 1.1 * 0.8) : new HemisphereLight(0xffffff, 0x99bb77, 1.1));
  const sun = new DirectionalLight(night ? 0xc9d4ff : 0xffffff, night ? 1.5 * 0.62 : 1.5);
  sun.position.set(40, 80, 30);
  scene.add(sun);
  // Lift the rock underside a little: on the map it should read as a friendly island, not a dark cone.
  const under = new DirectionalLight(night ? 0xb8c4ff : 0xfff2e0, night ? 0.5 : 0.7);
  under.position.set(-20, -30, 60);
  scene.add(under);

  const root = await build(diorama, new ModelLibrary());
  scene.add(root);

  // Frame the whole diorama from the island's camera angle.
  const sphere = new Box3().setFromObject(root).getBoundingSphere(new Sphere());
  const yaw = MathUtils.degToRad(diorama?.camera?.yaw ?? 30);
  const pitch = MathUtils.degToRad(diorama?.camera?.pitch ?? 30);
  const camera = new PerspectiveCamera(FOV, WIDTH / HEIGHT, 1, 2000);
  const vFit = sphere.radius / Math.sin(MathUtils.degToRad(FOV / 2));
  const hFov = 2 * Math.atan(Math.tan(MathUtils.degToRad(FOV / 2)) * camera.aspect);
  const distance = Math.max(vFit, sphere.radius / Math.sin(hFov / 2)) * 1.02;
  const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(sphere.center).addScaledVector(dir, distance);
  camera.lookAt(sphere.center);
  renderer.render(scene, camera);
  crop(renderer.domElement);
  document.body.dataset.done = '1';
}

main().catch((err: unknown) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
