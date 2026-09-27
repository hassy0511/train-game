import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Stand-ins drawn in code for the sea set of 3-1 "うみのそこ" (ticket 0011) until its models are built. Origin at the
 * bottom centre, +Z forward (the model's own left is +X), one merged mesh in one shared vertex-coloured material
 * per model, like the volcano set. Living things are round and soft, with small round eyes only (no mouth, no teeth,
 * no spikes); nothing dark or broken lies on the sea floor. Colours are pastel.
 *
 * A few pieces are see-through (the big pink bubbles of Sakasa): they keep their own transparent material.
 * The kelp sways: its material bends the ribbon with the shared `SEA_TIME` uniform (src/view/three/sea.ts ticks it).
 */

const SAND = '#F2E2B0';
const SAND_WET = '#E2CE96';
const SAND_DEEP = '#D9C58E';
const GRASS = '#8CCB5E';
const REEF = ['#E8A58C', '#E8C07A', '#F2B8A0'];
const TRUNK = '#B08A5A';
const PALM_LEAF = '#5DB85A';
const KELP_FOOT = '#6FA84A';
const KELP_TIP = '#A6CF62';
const CORAL_PINK = '#F59BB0';
const CORAL_YELLOW = '#F7C66B';
const CORAL_PURPLE = '#C9A0E0';
const WHALE_BLUE = '#7FB2E5';
const WHALE_BELLY = '#F3EBD8';
const EYE_DARK = '#2B3A4A';
const EYE_SHINE = '#FFFFFF';
const FISH_YELLOW = '#FFE08A';
const FISH_BLUE = '#9FD8F5';
const BUBBLE_WHITE = '#EAF8FF';
const BUBBLE_BLUE = '#9FDDF5';
const PINK = '#F7A8D8';
const PINK_DEEP = '#E8579F';
const PAPER = '#FFF8E6';
const STAR = '#8E9FB8';
const STAR_SHINE = '#DDE6F2';
const PEARL = '#FFFFFF';
const CLAM = '#F4D9E4';
const CLAM_IN = '#FCEFF4';
const CRACK = '#2E5E8C';

let shared: MeshLambertMaterial | null = null;
/** The one material most sea stand-ins share (colours from the vertices). */
function material(): MeshLambertMaterial {
  shared ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return shared;
}

/** v1.10 (3-1): the clock every swaying sea thing reads (seconds; sea.ts moves it on). */
export const SEA_TIME = { value: 0 };

let kelpMaterial: MeshLambertMaterial | null = null;
/**
 * The kelp's material: the ribbon bends more the higher up it is, each plant on its own beat (from where it stands),
 * all by one shared uniform: no per-frame work on the CPU and still one draw call per batch.
 */
function swayMaterial(): MeshLambertMaterial {
  if (kelpMaterial) return kelpMaterial;
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.seaTime = SEA_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float seaTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float seaK = clamp(position.y / 12.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          float seaPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float seaPhase = 0.0;
        #endif
        transformed.x += sin(seaTime * 1.1 + seaPhase) * 0.9 * seaK * seaK;
        transformed.z += cos(seaTime * 0.8 + seaPhase * 1.3) * 0.4 * seaK * seaK;`,
      );
  };
  m.customProgramCacheKey = () => 'sea-kelp-sway';
  kelpMaterial = m;
  return m;
}

type Vec = readonly [number, number, number];
type Paint = string | ((p: Vector3) => Color);
interface Place {
  at?: Vec;
  rot?: Vec;
  quat?: Quaternion;
  scale?: number | Vec;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: string, b: string, t: number): Color => new Color(a).lerp(new Color(b), clamp01(t));
/** A repeatable 0…1 number for a point. */
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** One part: non-indexed, no uv, painted in its own space, then placed. Every part has the same attributes. */
function part(source: BufferGeometry, paint: Paint, place: Place = {}): BufferGeometry {
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

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('sea placeholder: parts do not merge');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** A static model: one merged mesh (moved so its lowest point is at y = 0). */
function solid(name: string, parts: BufferGeometry[], mat: MeshLambertMaterial = material(), floor = true): Group {
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

// ---- sand, reef and island -------------------------------------------------------------------------------

/**
 * A rounded mound rising from the sea floor: an oval `width` × `length` at its top, `height` tall, its sides sloping
 * out to 1.3 times that at the foot. `top(p)` paints the flat top, `side(p)` the slopes (y from 0 at the foot).
 */
function mound(width: number, length: number, height: number, top: Paint, side: Paint, bumps = 0, bumpColors: string[] = []): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const body = new CylinderGeometry(1, 1.3, height, 24, 3);
  parts.push(
    part(body, (p) => {
      const y = p.y + height / 2;
      if (y > height - 0.01) return typeof top === 'string' ? new Color(top) : top(p);
      return typeof side === 'string' ? new Color(side) : side(new Vector3(p.x, y, p.z));
    }, { at: [0, height / 2, 0], scale: [width / 2, 1, length / 2] }),
  );
  // A few round humps on the top, away from the middle (where the track runs).
  for (let i = 0; i < bumps; i++) {
    const side2 = i % 2 ? 1 : -1;
    const x = side2 * (width * 0.22 + hash(i, 1, 2) * width * 0.18);
    const z = (hash(i, 3, 4) - 0.5) * length * 0.8;
    const r = 1.2 + hash(i, 5, 6) * 1.6;
    parts.push(part(new SphereGeometry(r, 7, 4), bumpColors[i % bumpColors.length] ?? REEF[i % REEF.length], { at: [x, height - r * 0.3, z], scale: [1, 0.7, 1] }));
  }
  return parts;
}

/** The beach the first station stands on (`sandbar`, 40 × 16.2 × 180 m): pale sand on top, wet sand down its sides. */
function sandbar(): Group {
  const H = 16.2;
  return solid('sandbar', mound(40, 180, H, SAND, (p) => (p.y > H - 1.2 ? mix(SAND_WET, SAND, (p.y - (H - 1.2)) / 1.2) : mix(SAND_DEEP, SAND_WET, p.y / H))));
}

/** The reef the train comes up onto (`reef`, 60 × 16.2 × 90 m): warm coral rock with humps of coral on top. */
function reef(): Group {
  const H = 16.2;
  const rock = (p: Vector3): Color => new Color(REEF[Math.floor(hash(Math.round(p.x), Math.round(p.y), Math.round(p.z)) * 3)]);
  return solid('reef', mound(60, 90, H, rock, rock, 10, [CORAL_PINK, CORAL_YELLOW, CORAL_PURPLE]));
}

/** しおふきじま (`sand-island`, 70 × 16.2 × 230 m): the sandbar's big sister with a band of grass either side of the track. */
function sandIsland(): Group {
  const H = 16.2;
  const parts = mound(70, 230, H, (p) => (Math.abs(p.x) > 16 && Math.abs(p.x) < 26 ? new Color(GRASS) : new Color(SAND)), (p) =>
    p.y > H - 1.2 ? mix(SAND_WET, SAND, (p.y - (H - 1.2)) / 1.2) : mix(SAND_DEEP, SAND_WET, p.y / H),
  );
  return solid('sand-island', parts);
}

/** A palm tree (`palm`, 5 × 9 × 5 m): a gently leaning trunk and six drooping leaves. Nothing like a real resort's. */
function palm(): Group {
  const parts: BufferGeometry[] = [];
  const bend = (y: number): number => 0.04 * y * y;
  for (let i = 0; i < 5; i++) {
    const y0 = i * 1.6;
    const a = new Vector3(bend(y0), y0, 0);
    const b = new Vector3(bend(y0 + 1.6), y0 + 1.6, 0);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parts.push(part(new CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, 1.7, 7), i % 2 ? TRUNK : '#C09A68', { at: [mid.x, mid.y, mid.z], quat: q }));
  }
  const top = new Vector3(bend(8), 8, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const q = new Quaternion().setFromEuler(new Euler(0, -a, 0.45));
    const reach = new Vector3(1.4, -0.35, 0).applyAxisAngle(new Vector3(0, 1, 0), a);
    parts.push(part(new SphereGeometry(1, 6, 3), PALM_LEAF, { at: [top.x + reach.x, top.y + reach.y, top.z + reach.z], quat: q, scale: [1.6, 0.08, 0.45] }));
  }
  parts.push(part(new SphereGeometry(0.35, 6, 4), '#9C7A4C', { at: [top.x, top.y - 0.1, top.z] }));
  return solid('palm', parts);
}

// ---- the sea floor ---------------------------------------------------------------------------------------

/** A kelp ribbon (`kelp`, 1.5 × 12 × 0.6 m) that sways with the water (its own material, see swayMaterial). */
function kelp(): Group {
  const ribbon = new BoxGeometry(1.2, 12, 0.08, 1, 5, 1);
  const pos = ribbon.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = (v.y + 6) / 12;
    // A gentle twist and a narrowing tip.
    const w = 1 - 0.45 * k;
    const t = k * 1.2;
    pos.setXYZ(i, (v.x * Math.cos(t) - v.z * Math.sin(t)) * w, v.y + 6, v.x * Math.sin(t) * w + v.z * Math.cos(t));
  }
  ribbon.computeVertexNormals();
  return solid('kelp', [part(ribbon, (p) => mix(KELP_FOOT, KELP_TIP, p.y / 12))], swayMaterial());
}

/** Branching coral (`coral-a`, 4 × 3 × 4 m) with round tips. */
function coralA(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(1.1, 7, 4), CORAL_PINK, { at: [0, 0.5, 0], scale: [1, 0.6, 1] }));
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39;
    const lean = 0.35 + 0.25 * hash(i, 1, 1);
    const len = 1.6 + hash(i, 2, 2) * 1.1;
    const dir = new Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    const base = new Vector3(Math.cos(a) * 0.5, 0.6, Math.sin(a) * 0.5);
    const mid = base.clone().addScaledVector(dir, len / 2);
    const tip = base.clone().addScaledVector(dir, len);
    parts.push(part(new CylinderGeometry(0.16, 0.24, len, 5), CORAL_PINK, { at: [mid.x, mid.y, mid.z], quat: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir) }));
    parts.push(part(new SphereGeometry(0.28, 5, 3), '#FBC2D0', { at: [tip.x, tip.y, tip.z] }));
  }
  return solid('coral-a', parts);
}

/** A sea fan (`coral-b`, 4 × 3.5 × 0.8 m): a half disc standing up on a short stem. */
function coralB(): Group {
  const parts: BufferGeometry[] = [];
  const fan = new CylinderGeometry(2, 2, 0.14, 14, 1, false, -Math.PI / 2, Math.PI);
  parts.push(part(fan, (p) => mix(CORAL_YELLOW, '#FBE3A6', (p.x + 2) / 4), { at: [0, 0.8, 0], rot: [Math.PI / 2, 0, Math.PI / 2] }));
  parts.push(part(new CylinderGeometry(0.2, 0.35, 0.9, 6), '#E0A94A', { at: [0, 0.45, 0] }));
  return solid('coral-b', parts);
}

/** A round coral (`coral-c`, 3 × 1.8 × 3 m) with little bumps. */
function coralC(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), CORAL_PURPLE, { scale: [1, 1.1, 1] }));
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    parts.push(part(new SphereGeometry(0.35, 5, 3), '#DCC0EE', { at: [Math.cos(a) * 0.9, 1.15, Math.sin(a) * 0.9] }));
  }
  return solid('coral-c', parts);
}

/**
 * A coral arch over the track (`coral-arch`, 16 × 10 × 6 m): a tall half ring across the track (inside 9 m wide and
 * 7.5 m high: the train and its bubble dome pass well clear) with three colours of coral on it. The track runs
 * along its +Z.
 */
function coralArch(): Group {
  const parts: BufferGeometry[] = [];
  const colors = [CORAL_PINK, CORAL_YELLOW, CORAL_PURPLE];
  parts.push(part(new TorusGeometry(6.2, 1.5, 7, 14, Math.PI), (p) => mix('#E48FA4', '#F2B8A0', p.y / 6), { scale: [1, 1.2, 2] }));
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    const x = Math.cos(a) * 6.2;
    const y = Math.sin(a) * 6.2 * 1.2;
    parts.push(part(new SphereGeometry(0.9 + (i % 3) * 0.25, 6, 4), colors[i % 3], { at: [x, y + 1.3, (i % 2 ? 1 : -1) * 1.2] }));
  }
  for (const x of [-6.2, 6.2]) parts.push(part(new CylinderGeometry(2, 2.6, 1.2, 8), '#E2A58F', { at: [x, 0.6, 0] }));
  return solid('coral-arch', parts);
}

/** The pearl's stand (`coral-pillar`, 3 × 10 × 3 m): a slim coral rock, flat on top. */
function coralPillar(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(1.2, 1.6, 10, 8, 4), (p) => mix('#D98F7E', '#F2B8A0', (p.y + 5) / 10)));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7;
    parts.push(part(new SphereGeometry(0.55, 5, 3), [CORAL_PINK, CORAL_YELLOW][i % 2], { at: [Math.cos(a) * 1.4, -3 + i * 1.6, Math.sin(a) * 1.4] }));
  }
  return solid('coral-pillar', parts);
}

/** A crack in the sand (`rock-crack`, 8 × 3 × 4 m): a low sandy mound with a deep blue slot down its middle. */
function rockCrack(): Group {
  const parts: BufferGeometry[] = [];
  for (const x of [-2.4, 2.4]) parts.push(part(new SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), SAND_WET, { at: [x, 0, 0], scale: [1.8, 3, 2] }));
  parts.push(part(new BoxGeometry(1.4, 0.2, 3.4), CRACK, { at: [0, 0.2, 0] }));
  return solid('rock-crack', parts);
}

/** The mouth of a bubble spring (`spring-vent`, 5 × 1 × 5 m): a sandy hump with three round holes. */
function springVent(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(2.5, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), SAND, { scale: [1, 0.4, 1] }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(part(new CircleGeometry(0.4, 10), '#7FB5C9', { at: [Math.cos(a) * 0.8, 0.98, Math.sin(a) * 0.8], rot: [-Math.PI / 2 + 0.25, 0, 0] }));
  }
  return solid('spring-vent', parts);
}

// ---- living things ---------------------------------------------------------------------------------------

/** The whale's tail, pivoting at its root (0, 0, 0 in its own space), for sea.ts to wave. */
export function whaleTailGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(1, 9, 6), WHALE_BLUE, { at: [0, 0, -1.2], scale: [1.1, 0.9, 2.2] }));
  for (const side of [-1, 1]) {
    parts.push(part(new SphereGeometry(1, 8, 4), WHALE_BLUE, { at: [side * 1.6, 0.1, -3.4], rot: [0, side * 0.5, 0], scale: [1.9, 0.28, 0.9] }));
  }
  return merge(parts);
}

/** Where the tail's root sits on the whale's body (model space, the body's origin at the belly's bottom). */
export const WHALE_TAIL_ROOT = new Vector3(0, 2.4, -5.2);
/** The top of the whale's back and its blowhole (model space): the spout comes out here. */
export const WHALE_BLOWHOLE = new Vector3(0, 5, 1.8);

/**
 * The whale's body without its tail (6 × 5 × 12 m): a big round pastel-blue body, a cream belly, two small round
 * eyes with a shine, and two flippers. No mouth line, no teeth: a friendly shape.
 */
export function whaleBodyGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const body = (p: Vector3): Color => mix(WHALE_BELLY, WHALE_BLUE, (p.y + 0.55) * 1.6);
  parts.push(part(new SphereGeometry(1, 16, 12), body, { at: [0, 2.5, 0], scale: [3, 2.5, 6] }));
  for (const side of [-1, 1]) {
    parts.push(part(new SphereGeometry(0.26, 8, 6), EYE_DARK, { at: [side * 2.25, 2.9, 3.9] }));
    parts.push(part(new SphereGeometry(0.09, 5, 3), EYE_SHINE, { at: [side * 2.4, 3.05, 4.05] }));
    parts.push(part(new SphereGeometry(1, 8, 4), WHALE_BLUE, { at: [side * 3, 1.3, 1.2], rot: [0.2, side * 0.4, side * -0.5], scale: [1.6, 0.25, 0.8] }));
  }
  return merge(parts);
}

/** A whole whale (`whale`, 6 × 5 × 16 m) for the model page and the map: the body and its tail. */
function whale(): Group {
  const tail = whaleTailGeometry();
  tail.translate(WHALE_TAIL_ROOT.x, WHALE_TAIL_ROOT.y, WHALE_TAIL_ROOT.z);
  return solid('whale', [whaleBodyGeometry(), tail]);
}

/** A round little fish (`fish-a` yellow, `fish-b` light blue; 0.5 × 0.4 × 0.9 m) with a tail and two dot eyes. */
function fish(name: string, color: string): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(1, 7, 5), color, { at: [0, 0.2, 0.08], scale: [0.18, 0.2, 0.33] }));
  parts.push(part(new ConeGeometry(0.16, 0.3, 4), color, { at: [0, 0.2, -0.36], rot: [-Math.PI / 2, 0, 0], scale: [0.4, 1, 1] }));
  for (const side of [-1, 1]) parts.push(part(new SphereGeometry(0.035, 3, 2), EYE_DARK, { at: [side * 0.14, 0.26, 0.26] }));
  return solid(name, parts);
}

/** A ring of bubbles marking the whale's current (`current-ring`, 5 × 5 × 0.4 m), standing across the track. */
function currentRing(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new TorusGeometry(2.3, 0.14, 5, 20), BUBBLE_BLUE, { at: [0, 2.5, 0] }));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(part(new SphereGeometry(0.22 + (i % 3) * 0.06, 5, 3), BUBBLE_WHITE, { at: [Math.cos(a) * 2.3, 2.5 + Math.sin(a) * 2.3, 0] }));
  }
  return solid('current-ring', parts);
}

// ---- Sakasa's bubbles and note ---------------------------------------------------------------------------

let pinkShell: MeshLambertMaterial | null = null;
/** A see-through pink skin for Sakasa's bubbles (not shared with the opaque models). */
function pinkSkin(): MeshLambertMaterial {
  pinkShell ??= new MeshLambertMaterial({ color: PINK, transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide });
  return pinkShell;
}

/**
 * One of Sakasa's pink bubbles, `radius` m: a see-through pink ball with a swirly band round it and a white shine.
 * `awa-big` (2.5 m) holds his note in 3-1's ending; `awa-pink` (0.7 m) sinks in the glimpse.
 */
function pinkBubble(name: string, radius: number): Group {
  const g = new Group();
  const skin = new Mesh(new SphereGeometry(radius, 16, 12), pinkSkin());
  skin.position.y = radius;
  skin.name = `${name}-skin`;
  g.add(skin);
  const band: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    band.push(part(new TorusGeometry(radius * (0.98 - i * 0.02), radius * 0.05, 4, 20), i % 2 ? '#FFFFFF' : PINK_DEEP, { at: [0, radius, 0], rot: [Math.PI / 2 + 0.35 + i * 0.4, i * 0.8, 0] }));
  }
  band.push(part(new SphereGeometry(radius * 0.16, 6, 4), '#FFFFFF', { at: [-radius * 0.45, radius * 1.5, radius * 0.6] }));
  const bandMesh = new Mesh(merge(band), material());
  bandMesh.name = `${name}-swirl`;
  g.add(bandMesh);
  return g;
}

/** Sakasa's note (`awa-note`, 0.9 × 1.2 × 0.05 m): a little sheet of cream paper with a pink swirl on both faces. */
function awaNote(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(0.9, 1.2, 0.04), PAPER, { at: [0, 0.6, 0] }));
  for (const z of [0.025, -0.025]) {
    for (let i = 0; i < 3; i++) parts.push(part(new TorusGeometry(0.08 + i * 0.07, 0.018, 3, 12, Math.PI * 1.5), PINK_DEEP, { at: [0.18, 0.8, z], rot: [0, 0, i * 1.2] }));
    for (let i = 0; i < 3; i++) parts.push(part(new BoxGeometry(0.5, 0.04, 0.01), '#C9B8A0', { at: [-0.05, 0.45 - i * 0.12, z] }));
  }
  return solid('awa-note', parts);
}

// ---- records ---------------------------------------------------------------------------------------------

/** 3-1 record ①: a rainbow scallop shell (`rainbow-shell`, 1.2 × 0.5 × 1.2 m). */
function rainbowShell(): Group {
  const parts: BufferGeometry[] = [];
  const bands = ['#FF9AA2', '#FFC48A', '#FFE58A', '#A8E6A1', '#9FD8F5', '#C3A8F0'];
  const fan = new CylinderGeometry(0.6, 0.6, 0.12, 18, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
  parts.push(part(fan, (p) => new Color(bands[Math.min(5, Math.floor(((Math.atan2(p.x, p.z) / Math.PI + 0.45) / 0.9) * 6))]), { at: [0, 0.1, -0.2] }));
  // Thin raised ribs fanning out from the hinge.
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.42 + (i / 6) * Math.PI * 0.84;
    parts.push(part(new BoxGeometry(0.035, 0.03, 0.5), '#FFF6EE', { at: [Math.sin(a) * 0.3, 0.17, Math.cos(a) * 0.3 - 0.2], rot: [0, a, 0] }));
  }
  parts.push(part(new BoxGeometry(0.3, 0.12, 0.16), '#F4D9C0', { at: [0, 0.08, -0.22] }));
  return solid('rainbow-shell', parts);
}

/** 3-1 record ②: an open clam with a pearl (`pearl-clam`, 1.2 × 0.8 × 1.2 m). */
function pearlClam(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.6, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), CLAM, { at: [0, 0.3, 0], scale: [1, 0.5, 1] }));
  parts.push(part(new CircleGeometry(0.58, 14), CLAM_IN, { at: [0, 0.31, 0], rot: [-Math.PI / 2, 0, 0] }));
  // The top half, hinged at the back and opened up.
  const lid = new SphereGeometry(0.6, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  lid.scale(1, 0.45, 1);
  lid.translate(0, 0, 0.6);
  // Both faces of the thin lid show (its inside is what one sees from the front).
  const inside = lid.clone();
  inside.scale(-1, 1, 1);
  parts.push(part(lid, CLAM, { at: [0, 0.32, -0.6], rot: [-0.9, 0, 0] }));
  parts.push(part(inside, CLAM_IN, { at: [0, 0.32, -0.6], rot: [-0.9, 0, 0], scale: [0.98, 0.98, 0.98] }));
  parts.push(part(new SphereGeometry(0.2, 12, 8), PEARL, { at: [0, 0.5, 0.05] }));
  return solid('pearl-clam', parts);
}

/** 3-1 record ③ (the magnet light's): a fallen star (`iron-star`, 0.8 × 0.5 × 0.8 m), grey-blue with a shine. */
function ironStar(): Group {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.17 : 0.4;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const star = new ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1 });
  const parts = [part(star, (p) => mix(STAR, STAR_SHINE, p.z * 2), { at: [0, 0.35, 0], rot: [-Math.PI / 2.4, 0, 0] })];
  parts.push(part(new SphereGeometry(0.05, 4, 2), '#FFFFFF', { at: [0.1, 0.55, 0.12] }));
  return solid('iron-star', parts);
}

/** 2-2's record: a big glass marble lying in the puddle (`record-marble`, 1.6 m): a clear blue ball with a coloured twist. */
function recordMarble(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.8, 14, 10), (p) => mix('#CFEFFF', '#8FD0F0', (p.y + 0.8) / 1.6), { at: [0, 0.8, 0] }));
  // Coloured twists on its surface (drawn on, as the glass is not see-through here).
  for (let i = 0; i < 3; i++) {
    parts.push(part(new TorusGeometry(0.79, 0.06, 4, 24, Math.PI * 1.3), ['#FF8FB1', '#FFD166', '#7CD992'][i], { at: [0, 0.8, 0], rot: [0.4 + i * 0.9, i * 1.1, 0] }));
  }
  parts.push(part(new SphereGeometry(0.14, 6, 4), '#FFFFFF', { at: [-0.35, 1.3, 0.45] }));
  return solid('record-marble', parts);
}

const BUILDERS: Record<string, () => Group> = {
  sandbar,
  reef,
  'sand-island': sandIsland,
  palm,
  kelp,
  'coral-a': coralA,
  'coral-b': coralB,
  'coral-c': coralC,
  'coral-arch': coralArch,
  'coral-pillar': coralPillar,
  'rock-crack': rockCrack,
  'spring-vent': springVent,
  whale,
  'fish-a': () => fish('fish-a', FISH_YELLOW),
  'fish-b': () => fish('fish-b', FISH_BLUE),
  'current-ring': currentRing,
  'awa-big': () => pinkBubble('awa-big', 2.5),
  'awa-pink': () => pinkBubble('awa-pink', 0.7),
  'awa-note': awaNote,
  'rainbow-shell': rainbowShell,
  'pearl-clam': pearlClam,
  'iron-star': ironStar,
  'record-marble': recordMarble,
};

/** The names this module draws (ticket 0011). */
export const SEA_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the sea set. */
export function buildSeaPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
