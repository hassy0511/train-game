/**
 * Standalone model viewer (models.html): every .glb in public/models, one at a time, with orbit
 * controls. Used to review Blender deliveries on the iPad without playing a stage. No game code.
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GROUPS: [string, RegExp][] = [
  ['のりもの', /^(train|car)-/],
  ['ひと・いきもの', /^(cat|partner|amanojaku|passenger|dino|ptero|bird)/],
  ['えき・せんろ', /^(platform|station|stop|buffer|crossing|direction|jump|updraft|sky-buoy)/],
  ['たてもの', /^(house|shop|tower|hq)/],
  ['しぜん', /^(tree|rock|fern|cycad|cliff|boulder|island|cloud)/],
  ['こもの', /.*/],
];

const stage = document.getElementById('stage')!;
const nameEl = document.getElementById('name')!;
const dimsEl = document.getElementById('dims')!;
const listEl = document.getElementById('list')!;
document.getElementById('build')!.textContent = `build ${__BUILD_ID__}`;

const renderer = new WebGLRenderer({ antialias: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color('#dfe8f0');
const camera = new PerspectiveCamera(45, 1, 0.05, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
});

scene.add(new AmbientLight('#ffffff', 1.4));
const sun = new DirectionalLight('#fff4e0', 2.2);
sun.position.set(5, 10, 6);
scene.add(sun);
const fill = new DirectionalLight('#cfe3ff', 0.8);
fill.position.set(-6, 4, -5);
scene.add(fill);

let grid: GridHelper | null = null;
const holder = new Group();
scene.add(holder);
const loader = new GLTFLoader();
const base = import.meta.env.BASE_URL;

function resize(): void {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function countTriangles(root: Group): number {
  let tris = 0;
  root.traverse((o) => {
    if (o instanceof Mesh) {
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });
  return tris;
}

async function show(name: string): Promise<void> {
  for (const b of listEl.querySelectorAll('button[data-model]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-model') === name));
  }
  listEl.querySelector(`button[data-model="${name}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  history.replaceState(null, '', `?model=${name}`);
  nameEl.textContent = name;
  dimsEl.textContent = 'よみこみ中…';
  holder.clear();
  grid?.removeFromParent();

  const gltf = await loader.loadAsync(`${base}models/${name}.glb`);
  const model = gltf.scene;
  holder.add(model);
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  dimsEl.textContent = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m ／ ${countTriangles(model)} 三角形`;

  grid = new GridHelper(Math.max(4, Math.ceil(radius * 1.5)), Math.max(4, Math.ceil(radius * 1.5)), '#9fb3c8', '#c9d4e0');
  grid.position.y = box.min.y;
  scene.add(grid);

  controls.target.copy(center);
  camera.position.set(center.x + radius * 1.1, center.y + radius * 0.75, center.z + radius * 1.5);
  camera.near = radius / 100;
  camera.far = radius * 20;
  camera.updateProjectionMatrix();
  controls.autoRotate = true;
  controls.update();
}

const names = [...__MODEL_MANIFEST__];
const grouped = new Map<string, string[]>();
for (const n of names) {
  const g = GROUPS.find(([, re]) => re.test(n))![0];
  grouped.set(g, [...(grouped.get(g) ?? []), n]);
}
for (const [label] of GROUPS) {
  const items = grouped.get(label);
  if (!items) continue;
  const head = document.createElement('button');
  head.className = 'group';
  head.textContent = label;
  head.disabled = true;
  listEl.appendChild(head);
  for (const n of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.model = n;
    b.textContent = n;
    b.addEventListener('click', () => void show(n));
    listEl.appendChild(b);
  }
}

const requested = new URLSearchParams(location.search).get('model');
void show(requested && names.includes(requested) ? requested : names[0]);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
