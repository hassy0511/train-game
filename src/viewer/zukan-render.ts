/**
 * Dev tool (tools/zukan-render.html, driven by scripts/render-zukan.mjs): draws one record's model for the picture
 * book, a 256 px square on a transparent canvas. Not part of the game build.
 * `?record=<id>` renders that record (its `model`, from the stage JSON); `?list=1` only lists the records that have
 * a model (body data-list, JSON).
 */
import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ModelLibrary } from '../view/three/models';
import type { RecordDef, StageFile } from '../stage/types';

const SIZE = 256;
/** Drawn at twice the size and scaled down: smoother edges than the renderer's own antialiasing at 256 px. */
const DRAW = SIZE * 2;
const FOV = 26;

/** How to look at a record: yaw/pitch in degrees (default 30/22). Flat things are seen more from above. */
const VIEWS: Record<string, { yaw?: number; pitch?: number }> = {
  footprints: { pitch: 58 },
  'cliff-nest': { pitch: 40 },
  yotsuba: { pitch: 55 },
  'town-board': { yaw: 20, pitch: 8 },
  'hq-plans': { yaw: 20, pitch: 8 },
  'roof-balloon': { yaw: 20, pitch: 10 },
  treetop: { yaw: 10, pitch: 10 },
};

const stages = import.meta.glob('../stages/*.json', { eager: true, import: 'default' }) as Record<string, StageFile>;

function records(): RecordDef[] {
  return Object.values(stages)
    .filter((s) => !s.hidden)
    .flatMap((s) => s.records)
    .filter((r) => r.model);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.get('list')) {
    document.body.dataset.list = JSON.stringify(records().map((r) => r.id));
    document.body.dataset.done = '1';
    return;
  }
  const id = params.get('record') ?? '';
  const record = records().find((r) => r.id === id);
  if (!record?.model) throw new Error(`record "${id}" has no model`);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(DRAW, DRAW);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0xbbaa88, 1.35));
  const sun = new DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 60, 50);
  scene.add(sun);
  const fill = new DirectionalLight(0xfff2e0, 0.6);
  fill.position.set(-40, 10, 30);
  scene.add(fill);

  const root = new Group();
  root.add((await new ModelLibrary().load(record.model)).clone(true));
  scene.add(root);

  const view = VIEWS[id] ?? {};
  const yaw = MathUtils.degToRad(view.yaw ?? 30);
  const pitch = MathUtils.degToRad(view.pitch ?? 22);
  const sphere = new Box3().setFromObject(root).getBoundingSphere(new Sphere());
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 500);
  const distance = (sphere.radius / Math.sin(MathUtils.degToRad(FOV / 2))) * 0.92;
  const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(sphere.center).addScaledVector(dir, distance);
  camera.lookAt(sphere.center);
  renderer.render(scene, camera);

  const out = document.createElement('canvas');
  out.id = 'out';
  out.width = out.height = SIZE;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, SIZE, SIZE);
  document.body.appendChild(out);
  document.body.dataset.done = '1';
}

main().catch((err: unknown) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
