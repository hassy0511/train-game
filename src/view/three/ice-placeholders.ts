import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Stand-ins drawn in code for the frozen lake set of 4-1 (ticket 0015 「こおりの みずうみ」) until its models are
 * built. Origin at the bottom centre, +Z forward, the model's own left is +X. One model = one merged mesh in one
 * shared vertex-coloured material (a cell of many copies is one draw call); the glowing shell has a second, softly
 * glowing part. Soft, round and friendly: white, pale blue and a light lilac in the shadows; animals have eyes only.
 */
const SNOW = '#FBFDFF';
const SNOW_SHADE = '#DCE6F2';
const SNOW_LILAC = '#D6D3EC';
const PINE = '#4F8F74';
const PINE_DARK = '#3E7662';
const TRUNK = '#8A6A4E';
const ICE = '#CFEAF6';
const ICE_DEEP = '#A9D7EE';
const ICE_EDGE = '#E9F6FC';
const WATER = '#5FB6DC';
const STONE = '#B7B2AE';
const STONE_DARK = '#9A948F';
const TUNNEL_IN = '#5E6F82';
const HUT_WALLS = ['#F28B6B', '#F5C35B', '#7FC6E8', '#9BD08A', '#F2A0C0', '#B7A6E6'];
const HUT_ROOF = '#FFFFFF';
const HUT_DOOR = '#6B4E3A';
const FLAG = '#FF6B6B';
const SEAL = '#C9D1DB';
const SEAL_BELLY = '#EEF2F6';
const SEAL_SPOT = '#AEB9C6';
const EYE = '#2B3A4A';
const EYE_SHINE = '#FFFFFF';
const BIRD = '#FFFFFF';
const BIRD_SHADE = '#E6ECF3';
const BIRD_WING = '#C7D3E0';
const BEAK = '#FF9F43';
const FEET = '#F4A259';
const POST = '#8A8F96';
const SIGN_BOARD = '#DFF3FC';
const SIGN_FRAME = '#4A9CC9';
const FLAKE = '#2F86C0';
const CRACK = '#FFFFFF';
const THIN_BOARD = '#8CC3E0';
const ROCKET_BODY = '#F7F3EA';
const ROCKET_NOSE = '#FF7A45';
const FLOWER = '#F4FAFF';
const FLOWER_TIP = '#CFE7F7';
const SHELL = '#F7E3EC';
const SHELL_RIB = '#EBC9D9';
const PEARL = '#FFF6D6';
const BELL = '#6F7F92';
const BELL_RIM = '#8F9DB0';
const SHELF = '#CBE8F5';

let shared: MeshLambertMaterial | null = null;
function material(): MeshLambertMaterial {
  shared ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return shared;
}
let glowShared: MeshLambertMaterial | null = null;
/** The glowing shell's pearl light (a soft self-lit colour, not a lamp). */
function glowMaterial(): MeshLambertMaterial {
  glowShared ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color('#FFE9A8'), emissiveIntensity: 0.9 });
  return glowShared;
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
const ramp = (v: number, a: number, b: number): number => clamp01((v - a) / (b - a));
const mix = (a: string, b: string, t: number): Color => new Color(a).lerp(new Color(b), clamp01(t));
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** One part: non-indexed, no uv, painted per vertex in its own space, then placed. */
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
    colors.set([c.r, c.g, c.b], i * 3);
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
  if (!merged) throw new Error('ice placeholder: parts do not merge');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** A static model: one merged mesh (plus an optional glowing one), its lowest point on the floor. */
function solid(name: string, parts: BufferGeometry[], glow: BufferGeometry[] = [], floor = true): Group {
  const g = new Group();
  const geometry = merge(parts);
  const mesh = new Mesh(geometry, material());
  mesh.name = name;
  g.add(mesh);
  let glowMesh: Mesh | null = null;
  if (glow.length) {
    glowMesh = new Mesh(merge(glow), glowMaterial());
    glowMesh.name = `${name}-glow`;
    g.add(glowMesh);
  }
  if (floor) {
    const minY = Math.min(geometry.boundingBox!.min.y, glowMesh?.geometry.boundingBox?.min.y ?? Infinity);
    for (const m of [mesh, glowMesh]) {
      if (!m) continue;
      m.geometry.translate(0, -minY, 0);
      m.geometry.computeBoundingBox();
      m.geometry.computeBoundingSphere();
    }
  }
  return g;
}

/** White snow shading down to a light lilac below `low` m (snow in soft shade). */
const snowy =
  (top: number, low: number) =>
  (p: Vector3): Color =>
    mix(SNOW, SNOW_SHADE, ramp(p.y, top, low)).lerp(new Color(SNOW_LILAC), 0.25 * ramp(p.y, top, low));

// ---- trees, snow and ice ----

/** A snowy pine, 5 × 9 × 5 m: three tiers of cone with snow caps on a short trunk. */
function snowPine(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.28, 0.36, 1.6, 6, 1, true), TRUNK, { at: [0, 0.8, 0] }));
  const tiers: [number, number, number][] = [
    [2.5, 3.2, 1.2],
    [1.9, 2.8, 3.4],
    [1.2, 2.4, 5.4],
  ];
  for (const [r, h, y] of tiers) {
    parts.push(part(new ConeGeometry(r, h, 8, 1), (p) => mix(PINE, PINE_DARK, ramp(p.y, h / 2, -h / 2)), { at: [0, y + h / 2, 0] }));
    // The snow cap: the cone's upper half, a little bigger, white.
    parts.push(part(new ConeGeometry(r * 0.62, h * 0.55, 8, 1, true), snowy(h * 0.27, -h * 0.27), { at: [0, y + h - h * 0.27 + 0.04, 0] }));
  }
  parts.push(part(new SphereGeometry(0.35, 6, 3), SNOW, { at: [0, 8.1, 0] }));
  return solid('snow-pine', parts);
}

/** A low snow bank, 7 × 1.6 × 4 m (on shores, and as the "snow cushion" in front of a buffer stop). */
function snowBank(): Group {
  const g = new SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  return solid('snow-bank', [part(g, snowy(0.9, 0), { scale: [3.5, 1.6, 2] })]);
}

/** The small island "こじま": a flat oval of snow, 120 × 0.15 × 84 m, over the ice (low: the track crosses it). */
function snowIsland(): Group {
  const ring = 28;
  const rx = 60;
  const rz = 42;
  const pts: number[] = [];
  const at = (k: number, a: number, y: number): [number, number, number] => [Math.cos(a) * rx * k, y, Math.sin(a) * rz * k];
  for (let i = 0; i < ring; i++) {
    const a0 = (i / ring) * Math.PI * 2;
    const a1 = ((i + 1) / ring) * Math.PI * 2;
    // Top (inner fan) and the soft edge down to the ice.
    pts.push(...at(0, 0, 0.15), ...at(0.94, a1, 0.15), ...at(0.94, a0, 0.15));
    pts.push(...at(0.94, a0, 0.15), ...at(0.94, a1, 0.15), ...at(1, a1, 0));
    pts.push(...at(0.94, a0, 0.15), ...at(1, a1, 0), ...at(1, a0, 0));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return solid('snow-island', [part(g, (p) => mix(SNOW, SNOW_SHADE, 0.25 + 0.25 * hash(Math.round(p.x / 9), 0, Math.round(p.z / 9))))]);
}

/** A big snowy mountain far off, 380 × 170 × 380 m: a rounded cone, white with lilac shadows and a few grey rocks. */
function snowMountain(): Group {
  const seg = 20;
  const prof: [number, number][] = [
    [190, 0],
    [150, 35],
    [110, 80],
    [70, 122],
    [35, 155],
    [8, 170],
  ];
  const rings = prof.map(([r, y], j) =>
    Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      const wob = j > 0 && j < prof.length - 1 ? 1 + (hash(i, j, 3) - 0.5) * 0.12 : 1;
      return new Vector3(Math.cos(a) * r * wob, y, Math.sin(a) * r * wob);
    }),
  );
  const pts: number[] = [];
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      const [a, b, c, d] = [rings[j][i], rings[j][i1], rings[j + 1][i1], rings[j + 1][i]];
      pts.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
    }
  }
  const top = rings[rings.length - 1];
  for (let i = 0; i < seg; i++) {
    const a = top[i];
    const b = top[(i + 1) % seg];
    pts.push(a.x, a.y, a.z, 0, 176, 0, b.x, b.y, b.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  const paint = (p: Vector3): Color => {
    const rock = p.y > 40 && p.y < 150 && hash(Math.round(p.x / 30), Math.round(p.y / 30), Math.round(p.z / 30)) > 0.82;
    return rock ? new Color(STONE) : mix(SNOW, SNOW_LILAC, ramp(p.y, 120, 0) * 0.6);
  };
  return solid('snow-mountain', [part(g, paint)]);
}

/** A stone arch at a tunnel's mouth, 11 × 9 × 4 m, facing +Z (the tunnel inside is a soft blue-grey, not black). */
function tunnelMouth(): Group {
  const parts: BufferGeometry[] = [];
  const stone = (p: Vector3): Color => mix(STONE, STONE_DARK, hash(Math.round(p.x), Math.round(p.y), Math.round(p.z)) * 0.8);
  for (const side of [-1, 1]) parts.push(part(new BoxGeometry(1.6, 5, 4), stone, { at: [side * 4.7, 2.5, 0] }));
  parts.push(part(new TorusGeometry(4.7, 0.8, 5, 12, Math.PI), stone, { at: [0, 5, 0], scale: [1, 1, 2.4] }));
  // The dark inside: a half disc and a short box going in.
  parts.push(part(new CylinderGeometry(3.9, 3.9, 0.2, 12, 1, false, -Math.PI / 2, Math.PI), TUNNEL_IN, { at: [0, 5, -1.5], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new BoxGeometry(7.8, 5, 0.2), TUNNEL_IN, { at: [0, 2.5, -1.5] }));
  // Snow on the arch.
  parts.push(part(new TorusGeometry(4.7, 0.5, 4, 12, Math.PI), SNOW, { at: [0, 5.35, 0], scale: [1, 1, 2.2] }));
  return solid('tunnel-mouth', parts);
}

/** A round ice-fishing hut, 4.6 × 4.6 × 4.6 m: a coloured drum with a white snowy dome, a little door and a flag. */
function iceHut(color: string, name: string): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(2.2, 2.3, 2, 14, 1, true), color, { at: [0, 1, 0] }));
  parts.push(part(new SphereGeometry(2.35, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), snowy(2.3, 0), { at: [0, 2, 0] }));
  parts.push(part(new BoxGeometry(1, 1.6, 0.12), HUT_DOOR, { at: [0, 0.8, 2.26] }));
  parts.push(part(new CylinderGeometry(0.05, 0.05, 1.6, 5), POST, { at: [0.8, 4.9, 0] }));
  parts.push(part(new BoxGeometry(0.02, 0.45, 0.7), FLAG, { at: [0.8, 5.45, 0.36] }));
  parts.push(part(new CylinderGeometry(2.4, 2.4, 0.12, 14), HUT_ROOF, { at: [0, 0.06, 0] }));
  return solid(name, parts);
}

/** A round fishing hole in the ice, 2.8 m across: blue water in a white rim. */
function iceHole(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(1.15, 1.15, 0.04, 12), WATER, { at: [0, 0.02, 0] }));
  parts.push(part(new TorusGeometry(1.25, 0.18, 3, 12), ICE_EDGE, { at: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.5] }));
  return solid('ice-hole', parts);
}

/** A wall of ice, 20 × 15 × 3 m, rounded on top, its faces in slightly different blues so it catches the light. */
function iceWall(): Group {
  const parts: BufferGeometry[] = [];
  const face = (p: Vector3): Color => mix(ICE, ICE_DEEP, hash(Math.round(p.x / 4), Math.round(p.y / 4), Math.round(p.z)) * 0.7);
  parts.push(part(new BoxGeometry(20, 13.5, 3, 3, 2, 1), face, { at: [0, 6.75, 0] }));
  parts.push(part(new CylinderGeometry(1.5, 1.5, 20, 6, 1), ICE_EDGE, { at: [0, 13.5, 0], rot: [0, 0, Math.PI / 2] }));
  parts.push(part(new BoxGeometry(20.4, 0.5, 3.6), SNOW, { at: [0, 15, 0] }));
  return solid('ice-wall', parts);
}

// ---- animals (eyes only) ----

/** A seal, 1.2 × 1 × 2.4 m (head +Z): a round grey body, a pale belly, flippers, and eyes (open or closed). */
function seal(awake: boolean): Group {
  const parts: BufferGeometry[] = [];
  const body = (p: Vector3): Color => (p.y < -0.25 ? new Color(SEAL_BELLY) : hash(Math.round(p.x * 5), Math.round(p.y * 5), Math.round(p.z * 5)) > 0.9 ? new Color(SEAL_SPOT) : new Color(SEAL));
  // Lying: a long rounded body; awake it lifts its head.
  parts.push(part(new SphereGeometry(1, 14, 9), body, { at: [0, 0.5, -0.1], scale: [0.6, 0.5, 1.15] }));
  const head: Vec = awake ? [0, 0.95, 1.0] : [0, 0.55, 1.05];
  parts.push(part(new SphereGeometry(0.42, 12, 8), body, { at: head, scale: [1, 0.92, 1.05] }));
  // A round snout.
  parts.push(part(new SphereGeometry(0.2, 8, 5), SEAL_BELLY, { at: [head[0], head[1] - 0.1, head[2] + 0.34] }));
  for (const side of [1, -1]) {
    if (awake) {
      parts.push(part(new SphereGeometry(0.075, 8, 5), EYE, { at: [side * 0.18, head[1] + 0.1, head[2] + 0.34] }));
      parts.push(part(new SphereGeometry(0.025, 4, 2), EYE_SHINE, { at: [side * 0.2, head[1] + 0.14, head[2] + 0.41] }));
    } else {
      parts.push(part(new TorusGeometry(0.06, 0.013, 3, 6, Math.PI), EYE, { at: [side * 0.18, head[1] + 0.1, head[2] + 0.37], rot: [0.3, 0, Math.PI] }));
    }
    // Front flippers and the tail flippers.
    parts.push(part(new SphereGeometry(1, 6, 3), SEAL_SPOT, { at: [side * 0.55, 0.18, 0.35], rot: [0, side * 0.5, side * 0.6], scale: [0.35, 0.07, 0.18] }));
    parts.push(part(new SphereGeometry(1, 6, 3), SEAL_SPOT, { at: [side * 0.2, 0.22, -1.25], rot: [0, side * 0.6, 0], scale: [0.28, 0.06, 0.2] }));
  }
  return solid(awake ? 'seal' : 'seal-sleep', parts);
}

/** A round snowbird, 0.8 × 0.9 × 0.9 m (head +Z): white, grey wing edges, an orange beak and feet, eyes only. */
function snowbird(): Group {
  const parts: BufferGeometry[] = [];
  const white = (p: Vector3): Color => mix(BIRD, BIRD_SHADE, ramp(p.y, 0.5, 0.05));
  parts.push(part(new SphereGeometry(0.42, 10, 7), white, { at: [0, 0.48, 0], scale: [1, 0.95, 1.1] }));
  parts.push(part(new SphereGeometry(0.26, 10, 6), white, { at: [0, 0.82, 0.24] }));
  parts.push(part(new ConeGeometry(0.07, 0.18, 5), BEAK, { at: [0, 0.8, 0.53], rot: [Math.PI / 2, 0, 0] }));
  for (const side of [1, -1]) {
    parts.push(part(new SphereGeometry(0.05, 6, 4), EYE, { at: [side * 0.12, 0.88, 0.43] }));
    parts.push(part(new SphereGeometry(0.016, 4, 2), EYE_SHINE, { at: [side * 0.135, 0.9, 0.475] }));
    parts.push(part(new SphereGeometry(1, 6, 3), BIRD_WING, { at: [side * 0.38, 0.5, -0.05], rot: [0.2, 0, side * 0.3], scale: [0.08, 0.22, 0.3] }));
    parts.push(part(new CylinderGeometry(0.03, 0.03, 0.14, 4), FEET, { at: [side * 0.12, 0.07, 0.02] }));
    parts.push(part(new BoxGeometry(0.12, 0.03, 0.16), FEET, { at: [side * 0.12, 0.015, 0.08] }));
  }
  parts.push(part(new ConeGeometry(0.14, 0.3, 5), BIRD_WING, { at: [0, 0.55, -0.48], rot: [-Math.PI / 2 - 0.4, 0, 0] }));
  return solid('snowbird', parts);
}

// ---- records ----

/** Record ①: frost flowers, 1.2 × 1.1 × 1.2 m: white feathery crystal petals in a little bunch on the ice. */
function frostFlower(): Group {
  const parts: BufferGeometry[] = [];
  const petal = (p: Vector3): Color => mix(FLOWER, FLOWER_TIP, ramp(p.y, 0, 0.5));
  for (let k = 0; k < 3; k++) {
    const cx = [0, 0.38, -0.34][k];
    const cz = [0, -0.2, -0.25][k];
    const size = [1, 0.75, 0.7][k];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + k;
      parts.push(
        part(new ConeGeometry(0.1 * size, 0.55 * size, 4), petal, {
          at: [cx + Math.cos(a) * 0.14 * size, 0.28 * size, cz + Math.sin(a) * 0.14 * size],
          rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7],
        }),
      );
    }
    parts.push(part(new SphereGeometry(0.1 * size, 6, 4), SNOW, { at: [cx, 0.12 * size, cz] }));
  }
  parts.push(part(new CylinderGeometry(0.7, 0.75, 0.05, 10), ICE_EDGE, { at: [0, 0.025, -0.1] }));
  return solid('frost-flower', parts);
}

/** Record ②: a glowing shell under the ice, 1 × 0.7 × 0.9 m: a pink clam, open a little, a softly shining pearl. */
function glowShell(): Group {
  const parts: BufferGeometry[] = [];
  const rib = (p: Vector3): Color => (Math.abs(Math.sin(Math.atan2(p.x, p.z) * 6)) > 0.8 ? new Color(SHELL_RIB) : new Color(SHELL));
  parts.push(part(new SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), rib, { at: [0, 0.02, 0], scale: [1, -0.35, 0.85] }));
  parts.push(part(new SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), rib, { at: [0, 0.2, -0.12], rot: [-0.5, 0, 0], scale: [1, 0.4, 0.85] }));
  const glow = [part(new SphereGeometry(0.16, 10, 7), PEARL, { at: [0, 0.14, 0.12] })];
  return solid('glow-shell', parts, glow);
}

/** Record ③: a little iron bell on an ice shelf, 1.4 × 1.3 × 1 m (high up the canyon wall). */
function iceBell(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(1.4, 0.2, 1), SHELF, { at: [0, 0.1, 0] }));
  parts.push(part(new CylinderGeometry(0.06, 0.06, 0.25, 5), BELL_RIM, { at: [0, 1.15, 0] }));
  parts.push(part(new CylinderGeometry(0.2, 0.42, 0.75, 10, 2, true), BELL, { at: [0, 0.65, 0] }));
  parts.push(part(new SphereGeometry(0.2, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), BELL, { at: [0, 1.02, 0] }));
  parts.push(part(new TorusGeometry(0.42, 0.04, 3, 12), BELL_RIM, { at: [0, 0.28, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new SphereGeometry(0.08, 6, 4), BELL_RIM, { at: [0, 0.3, 0] }));
  return solid('ice-bell', parts);
}

// ---- signs ----

/** Flat triangles on the board's front (+Z). */
function flat(tris: [number, number][][], z: number, paint: string): BufferGeometry {
  const pts: number[] = [];
  for (const [a, b, c] of tris) {
    // Wound to face +Z.
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const [q, r] = cross >= 0 ? [b, c] : [c, b];
    pts.push(a[0], a[1], z, q[0], q[1], z, r[0], r[1], z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return part(g, paint);
}

/** A bar from (ax, ay) to (bx, by), `w` wide, as two triangles. */
function bar(ax: number, ay: number, bx: number, by: number, w: number): [number, number][][] {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = (-(by - ay) / len) * (w / 2);
  const ny = ((bx - ax) / len) * (w / 2);
  return [
    [
      [ax + nx, ay + ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
    ],
    [
      [ax + nx, ay + ny],
      [bx - nx, by - ny],
      [ax - nx, ay - ny],
    ],
  ];
}

/**
 * A trackside sign, 1.5 × 3.3 × 0.2 m, facing +Z (the game stands it on the left of the track, turned to the train):
 * `sign-ice` (こおり): a pale blue board with a blue snow crystal; `sign-thin-ice` (うすい こおり): a deeper blue
 * board with white cracks and a small rocket.
 */
function sign(name: string, thin: boolean): Group {
  const parts: BufferGeometry[] = [];
  const W = 1.4;
  const H = 1.05;
  const CY = 2.75;
  parts.push(part(new CylinderGeometry(0.07, 0.08, CY, 8), POST, { at: [0, CY / 2, -0.1] }));
  parts.push(part(new BoxGeometry(W, H, 0.1), thin ? THIN_BOARD : SIGN_BOARD, { at: [0, CY, 0] }));
  const fz = 0.055;
  const x0 = -W / 2 + 0.08;
  const x1 = W / 2 - 0.08;
  const y0 = CY - H / 2 + 0.08;
  const y1 = CY + H / 2 - 0.08;
  parts.push(flat([...bar(x0, y0, x1, y0, 0.06), ...bar(x0, y1, x1, y1, 0.06), ...bar(x0, y0, x0, y1, 0.06), ...bar(x1, y0, x1, y1, 0.06)], fz, SIGN_FRAME));
  const iz = 0.06;
  if (!thin) {
    // A six-armed snow crystal with little side twigs.
    const tris: [number, number][][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
      const ex = Math.cos(a) * 0.38;
      const ey = Math.sin(a) * 0.38;
      tris.push(...bar(0, CY, ex, CY + ey, 0.07));
      const mx = Math.cos(a) * 0.22;
      const my = Math.sin(a) * 0.22;
      for (const t of [-0.6, 0.6]) tris.push(...bar(mx, CY + my, mx + Math.cos(a + t) * 0.12, CY + my + Math.sin(a + t) * 0.12, 0.05));
    }
    parts.push(flat(tris, iz, FLAKE));
  } else {
    // White cracks spreading from a point, and a small rocket above them.
    const tris: [number, number][][] = [];
    const c: [number, number] = [-0.18, CY - 0.18];
    for (const [dx, dy] of [
      [0.5, 0.05],
      [-0.4, 0.12],
      [0.1, -0.28],
      [-0.25, -0.25],
      [0.35, 0.3],
    ]) {
      tris.push(...bar(c[0], c[1], c[0] + dx, c[1] + dy, 0.04));
    }
    parts.push(flat(tris, iz, CRACK));
    parts.push(flat([...bar(0.05, CY + 0.25, 0.45, CY + 0.25, 0.16)], iz + 0.004, ROCKET_BODY));
    parts.push(
      flat(
        [
          [
            [0.45, CY + 0.33],
            [0.58, CY + 0.25],
            [0.45, CY + 0.17],
          ],
        ],
        iz + 0.004,
        ROCKET_NOSE,
      ),
    );
    parts.push(
      flat(
        [
          [
            [0.05, CY + 0.3],
            [-0.12, CY + 0.25],
            [0.05, CY + 0.2],
          ],
        ],
        iz + 0.004,
        '#FFB84D',
      ),
    );
  }
  return solid(name, parts);
}

const BUILDERS: Record<string, () => Group> = {
  'snow-pine': snowPine,
  'snow-bank': snowBank,
  'snow-island': snowIsland,
  'snow-mountain': snowMountain,
  'tunnel-mouth': tunnelMouth,
  'ice-hut': () => iceHut(HUT_WALLS[0], 'ice-hut'),
  'ice-hut-b': () => iceHut(HUT_WALLS[1], 'ice-hut-b'),
  'ice-hut-c': () => iceHut(HUT_WALLS[2], 'ice-hut-c'),
  'ice-hole': iceHole,
  'ice-wall': iceWall,
  seal: () => seal(true),
  'seal-sleep': () => seal(false),
  snowbird,
  'frost-flower': frostFlower,
  'glow-shell': glowShell,
  'ice-bell': iceBell,
  'sign-ice': () => sign('sign-ice', false),
  'sign-thin-ice': () => sign('sign-thin-ice', true),
};

/** The names this module draws (ticket 0015). */
export const ICE_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the frozen lake set. */
export function buildIcePlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
