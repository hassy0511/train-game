import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
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
 * Stand-ins drawn in code for the snowy village set of 4-2 (ticket 0016 「おおゆきの むら」) until its models are built.
 * Origin at the bottom centre, +Z forward, the model's own left is +X. One model = one merged mesh in one shared
 * vertex-coloured material (many copies are one draw call); the lanterns and the swirl on Sakasa's upside-down fence
 * have a second material the game lights up (setLanternGlow, setTraceGlow), and the snowplow's scoop is two-sided.
 * Snow is never plain white: it shades to a light blue-lilac. No letters, crests or marks; no real snow plough's
 * wedge or blades — the snowplow is a round yellow scoop.
 */
const SNOW = '#FBFDFF';
const SNOW_SHADE = '#DCE6F2';
const SNOW_DEEP = '#C9DBEA';
const SNOW_LILAC = '#D6D3EC';
const WOOD = '#9A6B45';
const WOOD_DARK = '#7A5234';
const HOUSE_WALLS = ['#B07D52', '#8C9DB5'];
const WINDOW = '#FFD45C';
const DOOR = '#6B4E3A';
const BLADE = '#F2B632';
const BLADE_RIM = '#FFFFFF';
const ARM = '#4A5360';
const PURPLE = '#7B86E8';
const SIGN_BOARD = '#EEF0FF';
const POST = '#8A8F96';
const STEEL = '#3F7CC4';
const STEEL_DARK = '#2F5F9A';
const ROCK = '#9C958F';
const ROCK_DARK = '#827B75';
const ICE = '#BFE6F7';
const ICE_DEEP = '#8FCDEB';
const LANTERN_RED = '#E8584F';
const LANTERN_BAND = '#FFF4E6';
const LANTERN_CAP = '#3D3A44';
const KAMAKURA_GLOW = '#FFB347';
const MITTEN_A = '#8C6BD8';
const MITTEN_B = '#5FBF9A';
const MITTEN_CUFF = '#F4F1FB';
const TIN = '#C9D1DA';
const TIN_DARK = '#A9B3BE';
const HANDLE = '#D9483B';
const SWIRL = '#FF7FBF';

let shared: MeshLambertMaterial | null = null;
function material(): MeshLambertMaterial {
  shared ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return shared;
}
let twoSided: MeshLambertMaterial | null = null;
/** The snowplow's scoop is a curved sheet: seen from in front and from behind. */
function twoSidedMaterial(): MeshLambertMaterial {
  twoSided ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
  return twoSided;
}
let glowShared: MeshLambertMaterial | null = null;
/** The soft light inside a snow house (a self-lit colour, not a lamp). */
function glowMaterial(): MeshLambertMaterial {
  glowShared ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color(KAMAKURA_GLOW), emissiveIntensity: 0.8 });
  return glowShared;
}
let lanternShared: MeshLambertMaterial | null = null;
/** The lanterns' paper: dark until the festival, then glowing warm (setLanternGlow). */
function lanternMaterial(): MeshLambertMaterial {
  lanternShared ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color('#FF9A5C'), emissiveIntensity: 0 });
  return lanternShared;
}
let traceShared: MeshLambertMaterial | null = null;
/** Sakasa's swirl on the upside-down fence: faint until the light finds it (setTraceGlow). */
function traceMaterial(): MeshLambertMaterial {
  traceShared ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color(SWIRL), emissiveIntensity: 0 });
  return traceShared;
}

/** v1.10 (4-2): how brightly every lantern glows (0 = unlit, 1 = the festival). */
export function setLanternGlow(k: number): void {
  lanternMaterial().emissiveIntensity = 1.1 * Math.min(1, Math.max(0, k));
}

/** v1.10 (4-2): the swirl marks on the upside-down snow fences glow (the light found them) or fade. */
export function setTraceGlow(k: number): void {
  traceMaterial().emissiveIntensity = 0.9 * Math.min(1, Math.max(0, k));
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
  if (!merged) throw new Error('village placeholder: parts do not merge');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** A model: one merged mesh per material (the shared one, and optional extra ones), its lowest point on the floor. */
function solid(name: string, parts: BufferGeometry[], extra: { parts: BufferGeometry[]; material: MeshLambertMaterial }[] = []): Group {
  const g = new Group();
  const meshes: Mesh[] = [];
  if (parts.length) {
    const mesh = new Mesh(merge(parts), material());
    mesh.name = name;
    meshes.push(mesh);
  }
  extra.forEach((e, i) => {
    if (!e.parts.length) return;
    const mesh = new Mesh(merge(e.parts), e.material);
    mesh.name = `${name}-${i + 1}`;
    meshes.push(mesh);
  });
  const minY = Math.min(...meshes.map((m) => m.geometry.boundingBox?.min.y ?? 0));
  for (const m of meshes) {
    m.geometry.translate(0, -minY, 0);
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
    g.add(m);
  }
  return g;
}

/** White snow shading to blue-lilac below `low` m. */
const snowy =
  (top: number, low: number) =>
  (p: Vector3): Color =>
    mix(SNOW, SNOW_SHADE, ramp(p.y, top, low)).lerp(new Color(SNOW_LILAC), 0.25 * ramp(p.y, top, low));

/** A box with rounded edges (`r` m), segmented `seg` times along each side. */
function roundedBox(w: number, h: number, d: number, r: number, seg: [number, number, number]): BufferGeometry {
  const g = new BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  const inner = new Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const c = new Vector3(Math.max(-inner.x, Math.min(inner.x, v.x)), Math.max(-inner.y, Math.min(inner.y, v.y)), Math.max(-inner.z, Math.min(inner.z, v.z)));
    const off = v.clone().sub(c);
    if (off.lengthSq() > 1e-9) v.copy(c.add(off.normalize().multiplyScalar(r)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Flat triangles in the XY plane at depth z, facing +Z. */
function flat(tris: [number, number][][], z: number, paint: string): BufferGeometry {
  const pts: number[] = [];
  for (const [a, b, c] of tris) {
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

/** A spiral (Sakasa's swirl) as bars, centred at (cx, cy), `turns` turns out to radius `r`. */
function spiral(cx: number, cy: number, r: number, turns: number, w: number, steps = 16): [number, number][][] {
  const out: [number, number][][] = [];
  let last: [number, number] = [cx, cy];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const p: [number, number] = [cx + Math.cos(a) * r * t, cy + Math.sin(a) * r * t];
    out.push(...bar(last[0], last[1], p[0], p[1], w));
    last = p;
  }
  return out;
}

// ---- the snowplow and its wall ----

/**
 * The snowplow, 3.4 × 1.3 × 1.0 m: a round yellow scoop (a curved sheet, concave to the front) with a white rim, its
 * two short dark arms reaching back to the train. Origin at the scoop's bottom middle.
 */
function plowBlade(): Group {
  const parts: BufferGeometry[] = [];
  // Arms back to the train (−Z) from behind the scoop.
  for (const side of [-1, 1]) parts.push(part(new BoxGeometry(0.16, 0.16, 1.0), ARM, { at: [side * 1.05, 0.7, -0.55] }));
  parts.push(part(new CylinderGeometry(0.1, 0.1, 2.3, 6), ARM, { at: [0, 0.7, -1.0], rot: [0, 0, Math.PI / 2] }));
  // Rounded ends of the scoop.
  for (const side of [-1, 1]) parts.push(part(new CylinderGeometry(0.62, 0.62, 0.08, 10, 1, false, 0, Math.PI), BLADE_RIM, { at: [side * 1.7, 0.62, 0.2], rot: [0, 0, Math.PI / 2] }));
  const scoop: BufferGeometry[] = [];
  // The scoop: part of a cylinder around X, from its bottom lip curving up and back.
  scoop.push(part(new CylinderGeometry(0.65, 0.65, 3.4, 12, 1, true, Math.PI * 0.05, Math.PI * 0.95), (p) => mix(BLADE, '#E09A1E', ramp(p.y, 0.4, -0.5)), { at: [0, 0.65, 0.2], rot: [0, 0, Math.PI / 2] }));
  // The white rim along its top edge.
  scoop.push(part(new CylinderGeometry(0.06, 0.06, 3.44, 6), BLADE_RIM, { at: [0, 1.28, 0.25], rot: [0, 0, Math.PI / 2] }));
  return solid('plow-blade', parts, [{ parts: scoop, material: twoSidedMaterial() }]);
}

/**
 * A snow wall across the track, 8 × 5 × 4 m: a soft rounded block with an overhanging top, white above and blue in
 * its shadow below, with a few sparkles. Its face (towards the train) is at z = +2.
 */
function snowWall(name: string, top: string, low: string): Group {
  const paint = (p: Vector3): Color => {
    const c = mix(top, low, ramp(p.y, 3.8, 0.2));
    if (hash(Math.round(p.x * 3), Math.round(p.y * 3), Math.round(p.z * 3)) > 0.93) c.lerp(new Color('#FFFFFF'), 0.8);
    return c;
  };
  const parts: BufferGeometry[] = [];
  parts.push(part(roundedBox(8, 4.4, 4, 0.9, [5, 3, 3]), paint, { at: [0, 2.2, 0] }));
  parts.push(part(new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), paint, { at: [0, 4.0, 0.25], scale: [4.4, 1.0, 2.5] }));
  return solid(name, parts);
}

/** The purple snowplow sign (2-3's sign, purple frame): a yellow scoop pushing snow. 0.9 wide, on its post. */
function signPlow(): Group {
  const parts: BufferGeometry[] = [];
  const W = 1.4;
  const H = 1.05;
  const CY = 2.75;
  parts.push(part(new CylinderGeometry(0.07, 0.08, CY, 8), POST, { at: [0, CY / 2, -0.1] }));
  parts.push(part(new BoxGeometry(W, H, 0.1), SIGN_BOARD, { at: [0, CY, 0] }));
  const x0 = -W / 2 + 0.08;
  const x1 = W / 2 - 0.08;
  const y0 = CY - H / 2 + 0.08;
  const y1 = CY + H / 2 - 0.08;
  parts.push(flat([...bar(x0, y0, x1, y0, 0.07), ...bar(x0, y1, x1, y1, 0.07), ...bar(x0, y0, x0, y1, 0.07), ...bar(x1, y0, x1, y1, 0.07)], 0.055, PURPLE));
  // The scoop (a half disc and a bar) and snow flying off it.
  const scoop: [number, number][][] = [];
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI + (i / 6) * Math.PI * 0.8;
    const a1 = Math.PI + ((i + 1) / 6) * Math.PI * 0.8;
    scoop.push([
      [0.05, CY - 0.05],
      [0.05 + Math.cos(a0) * 0.32, CY - 0.05 + Math.sin(a0) * 0.32],
      [0.05 + Math.cos(a1) * 0.32, CY - 0.05 + Math.sin(a1) * 0.32],
    ]);
  }
  parts.push(flat(scoop, 0.06, BLADE));
  parts.push(flat(bar(0.05, CY - 0.05, 0.45, CY + 0.12, 0.08), 0.064, ARM));
  for (const [x, y] of [[-0.4, CY + 0.2], [-0.25, CY + 0.34], [-0.48, CY - 0.02]]) {
    parts.push(flat([[[x - 0.06, y - 0.05], [x + 0.06, y - 0.05], [x, y + 0.07]]], 0.064, '#7FA7D9'));
  }
  return solid('sign-plow', parts);
}

// ---- the village ----

/** A village house, 10 × 8 × 8 m: wooden walls, a thick snowy gable roof, warm yellow windows, a door. */
function snowHouse(name: string, wall: string): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(8, 4.2, 7), (p) => mix(wall, '#6E5A48', ramp(p.y, 2, -2.1) * 0.35), { at: [0, 2.1, 0] }));
  // The roof: a triangular prism along X, with a thicker snow prism on it.
  // (The prism's axis along X, one edge up: the ridge.)
  parts.push(part(new CylinderGeometry(4.6, 4.6, 9.2, 3, 1), WOOD_DARK, { at: [0, 5.2, 0], rot: [-Math.PI / 2, 0, Math.PI / 2], scale: [1, 1, 0.62] }));
  parts.push(part(new CylinderGeometry(4.9, 4.9, 9.8, 3, 1), (p) => mix(SNOW, SNOW_SHADE, ramp(p.z, 2, -2.5)), { at: [0, 5.55, 0], rot: [-Math.PI / 2, 0, Math.PI / 2], scale: [1, 1, 0.62] }));
  // Windows and the door on the front (+Z), a window on each side.
  for (const x of [-2.4, 2.4]) parts.push(part(new BoxGeometry(1.3, 1.1, 0.12), WINDOW, { at: [x, 2.5, 3.52] }));
  parts.push(part(new BoxGeometry(1.2, 2.1, 0.12), DOOR, { at: [0, 1.05, 3.52] }));
  for (const side of [-1, 1]) parts.push(part(new BoxGeometry(0.12, 1.1, 1.3), WINDOW, { at: [side * 4.02, 2.5, 0] }));
  // A chimney with a snow cap.
  parts.push(part(new BoxGeometry(0.8, 1.6, 0.8), '#8E7F76', { at: [2.4, 7.4, -1.2] }));
  parts.push(part(new BoxGeometry(1.0, 0.35, 1.0), SNOW, { at: [2.4, 8.3, -1.2] }));
  // A snowdrift against the front wall.
  parts.push(part(new SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), snowy(0.8, 0), { at: [-2.5, 0, 3.7], scale: [1.6, 0.8, 0.8] }));
  return solid(name, parts);
}

/** A snow house, 4 × 2.6 × 4 m: a white dome with a round doorway, warm light inside. */
function kamakura(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), snowy(2.2, 0), { scale: [1, 1.3, 1] }));
  // A rim of packed snow round the doorway.
  parts.push(part(new TorusGeometry(0.72, 0.16, 5, 10, Math.PI), SNOW, { at: [0, 0.2, 1.72], rot: [0, 0, 0] }));
  const glow = [part(new CylinderGeometry(0.66, 0.66, 0.1, 10, 1, false, -Math.PI / 2, Math.PI), KAMAKURA_GLOW, { at: [0, 0.2, 1.74], rot: [Math.PI / 2, 0, 0] })];
  return solid('kamakura', parts, [{ parts: glow, material: glowMaterial() }]);
}

/** Sakasa's own little snow house, 1.6 × 1.2 × 1.6 m: lumpy and too small. */
function amanojakuKamakura(): Group {
  const g = new SphereGeometry(0.8, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + (hash(Math.round(x * 5), Math.round(y * 5), Math.round(z * 5)) - 0.5) * 0.18;
    pos.setXYZ(i, x * k, y * k * 1.5, z * k);
  }
  g.computeVertexNormals();
  const parts = [part(g, snowy(1.1, 0))];
  parts.push(part(new CylinderGeometry(0.28, 0.28, 0.06, 8, 1, false, -Math.PI / 2, Math.PI), '#9FB3CC', { at: [0, 0.05, 0.78], rot: [Math.PI / 2, 0, 0] }));
  return solid('amanojaku-kamakura', parts);
}

/** A paper lantern on a thin pole, 0.5 wide, 2.6 m tall: red and white, no writing. It glows at the festival. */
function lantern(): Group {
  const pole = [part(new CylinderGeometry(0.035, 0.045, 2.2, 5), LANTERN_CAP, { at: [0, 1.1, 0] })];
  const body: BufferGeometry[] = [];
  body.push(part(new SphereGeometry(0.25, 7, 4), (p) => (Math.abs(p.y) < 0.07 ? new Color(LANTERN_BAND) : new Color(LANTERN_RED)), { at: [0, 2.35, 0], scale: [1, 1.3, 1] }));
  body.push(part(new CylinderGeometry(0.13, 0.13, 0.08, 6), LANTERN_CAP, { at: [0, 2.7, 0] }));
  return solid('lantern', pole, [{ parts: body, material: lanternMaterial() }]);
}

/** A wooden snow fence, 6 × 3 × 0.4 m: posts, boards and a line of snow on top (the right way up). */
function snowFence(name: string, upsideDown: boolean): Group {
  const parts: BufferGeometry[] = [];
  const wood = (p: Vector3): Color => mix(WOOD, WOOD_DARK, hash(Math.round(p.x * 2), 0, 0) * 0.6);
  for (const x of [-2.8, 2.8]) parts.push(part(new BoxGeometry(0.25, 3.1, 0.25), WOOD_DARK, { at: [x, 1.55, -0.1] }));
  // Boards leaning one way; the upside-down fence has them the other way, top rail at the bottom.
  const lean = upsideDown ? -0.12 : 0.12;
  for (let i = 0; i < 5; i++) {
    const x = -2.2 + i * 1.1;
    parts.push(part(new BoxGeometry(0.8, 2.4, 0.08), wood, { at: [x, 1.6, 0.05], rot: [lean, 0, 0] }));
  }
  parts.push(part(new BoxGeometry(5.9, 0.18, 0.14), WOOD_DARK, { at: [0, upsideDown ? 0.55 : 2.6, 0.12] }));
  // Snow on top (upside down: the snow lies at its foot, pushed the wrong way).
  parts.push(part(new BoxGeometry(6.1, 0.3, 0.5), SNOW, { at: [0, upsideDown ? 0.15 : 2.95, 0] }));
  if (!upsideDown) return solid(name, parts);
  // Sakasa's swirl on the front: faint until the light finds it.
  const mark = [flat(spiral(0, 1.7, 0.55, 2.2, 0.09), 0.14, SWIRL)];
  return solid(name, parts, [{ parts: mark, material: traceMaterial() }]);
}

/** A wooden snow shed over the track, 10 m of it: 9 × 7 m, posts on both sides, a pitched roof with snow on it. */
function snowShed(): Group {
  const parts: BufferGeometry[] = [];
  const wood = (p: Vector3): Color => mix(WOOD, WOOD_DARK, hash(Math.round(p.z), Math.round(p.x), 1) * 0.7);
  for (const side of [-1, 1]) {
    for (const z of [-4, 0, 4]) parts.push(part(new BoxGeometry(0.4, 5.6, 0.4), WOOD_DARK, { at: [side * 4.3, 2.8, z] }));
    parts.push(part(new BoxGeometry(0.3, 0.4, 10), WOOD, { at: [side * 4.3, 5.5, 0] }));
    // A low wall of boards on each side, with gaps of light above it.
    parts.push(part(new BoxGeometry(0.15, 2.2, 10), wood, { at: [side * 4.35, 1.1, 0] }));
    // The roof slab and its snow.
    const tilt = side * 0.38;
    parts.push(part(new BoxGeometry(5.0, 0.25, 10.2), WOOD_DARK, { at: [side * 2.3, 6.3, 0], rot: [0, 0, -tilt] }));
    parts.push(part(new BoxGeometry(5.0, 0.55, 10.2), snowy(7.2, 6.2), { at: [side * 2.35, 6.65, 0], rot: [0, 0, -tilt] }));
  }
  return solid('snow-shed', parts);
}

/**
 * The ski jump (the jump pad of 4-2), 6 × 2 × 12 m: a snowy ramp rising to its lip, wooden edges. The lip is at the
 * origin (where the train takes off), the ramp lies behind it (−Z).
 */
function skiRamp(): Group {
  const parts: BufferGeometry[] = [];
  // The ramp: a wedge (a prism) rising from the back (−Z) to 3 m at the front: a snowy slope, wooden sides and front.
  const w = 3;
  const P = {
    bl: [-w, 0, -12], br: [w, 0, -12], fl: [-w, 0, 0], fr: [w, 0, 0], tl: [-w, 2, 0], tr: [w, 2, 0],
  } as const;
  const faces = (tris: (readonly number[])[][]): BufferGeometry => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(tris.flat(2) as number[], 3));
    g.computeVertexNormals();
    return g;
  };
  parts.push(part(faces([[P.bl, P.tr, P.br], [P.bl, P.tl, P.tr]]), (p) => mix(SNOW, SNOW_SHADE, ramp(p.z, 0, -12) * 0.6)));
  parts.push(part(faces([[P.fl, P.fr, P.tr], [P.fl, P.tr, P.tl], [P.bl, P.fl, P.tl], [P.br, P.tr, P.fr]]), (p) => mix(WOOD, WOOD_DARK, ramp(p.y, 3, 0))));
  for (const side of [-1, 1]) parts.push(part(new BoxGeometry(0.25, 0.35, 12.4), WOOD_DARK, { at: [side * w, 1.1, -6], rot: [Math.atan2(2, 12), 0, 0] }));
  return solid('ski-ramp', parts);
}

/** The ski jump folded up (hidden until the whistle): a wooden board standing on end beside the track, snow on top. */
function skiRampFolded(): Group {
  // Folded up on end beside the track (its own left), out of the train's way; the whistle lays it over the rail.
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(0.5, 4, 6), (p) => mix(WOOD, WOOD_DARK, ramp(p.y, 2, -2) * 0.6), { at: [4.2, 2, -3] }));
  for (const z of [-5, -3, -1]) parts.push(part(new BoxGeometry(0.1, 3.6, 0.2), WOOD_DARK, { at: [3.92, 2, z] }));
  parts.push(part(new BoxGeometry(0.7, 0.35, 6.2), SNOW, { at: [4.2, 4.15, -3] }));
  for (const z of [-5.2, -0.8]) parts.push(part(new BoxGeometry(0.2, 2.8, 0.2), WOOD_DARK, { at: [5.1, 1.4, z], rot: [0, 0, 0.5] }));
  return solid('ski-ramp-folded', parts);
}

/** A ski lift tower, 3 × 13 × 3 m: a blue steel pole with a cross beam and wheels on top, a small deck. */
function skiLiftTower(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.28, 0.42, 12, 8), (p) => mix(STEEL, STEEL_DARK, ramp(p.y, 6, -6)), { at: [0, 6, 0] }));
  parts.push(part(new BoxGeometry(3.2, 0.35, 0.35), STEEL_DARK, { at: [0, 12.3, 0] }));
  for (const side of [-1, 1]) parts.push(part(new CylinderGeometry(0.28, 0.28, 0.16, 8), '#2B3A4A', { at: [side * 1.4, 12.05, 0], rot: [Math.PI / 2, 0, 0] }));
  // A small deck near the top (record ③ rests on it), and snow on it.
  parts.push(part(new BoxGeometry(1.2, 0.15, 1.2), STEEL_DARK, { at: [0, 11.35, 0] }));
  parts.push(part(new BoxGeometry(1.25, 0.18, 1.25), SNOW, { at: [0, 11.5, 0] }));
  // Snow round its foot.
  parts.push(part(new SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), snowy(0.8, 0), { scale: [1.8, 0.7, 1.8] }));
  return solid('ski-lift-tower', parts);
}

/** The snowy valley under the ski jump, 30 × 4 × 40 m: soft drifts of snow, a cushion to land in. */
function snowRavine(): Group {
  const parts: BufferGeometry[] = [];
  const drifts: [number, number, number, number, number][] = [
    [0, 0, 11, 2.6, 18],
    [-7, 9, 8, 2.0, 9],
    [6, -10, 9, 2.4, 9],
    [-5, -14, 7, 1.6, 6],
    [8, 12, 7, 1.8, 7],
  ];
  for (const [x, z, rx, h, rz] of drifts) {
    parts.push(part(new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), snowy(h * 0.8, 0), { at: [x, 0, z], scale: [rx, h, rz] }));
  }
  return solid('snow-ravine', parts);
}

// ---- the records ----

/** Record ①: a small cliff whose waterfall froze as it fell, 6 × 7 × 3 m (rocks, pale blue ice, a frozen pool). */
function frozenFall(): Group {
  const parts: BufferGeometry[] = [];
  const rock = (p: Vector3): Color => mix(ROCK, ROCK_DARK, hash(Math.round(p.x * 2), Math.round(p.y * 2), Math.round(p.z * 2)));
  for (const [x, y, z, s] of [[-2.2, 2.6, -0.6, 2.2], [2.2, 2.4, -0.7, 2.1], [0, 5.2, -0.9, 2.0], [-1.4, 5.6, -0.4, 1.4], [1.5, 5.8, -0.5, 1.3]] as const) {
    parts.push(part(new DodecahedronGeometry(s, 0), rock, { at: [x, y, z] }));
  }
  // Snow on the rocks.
  parts.push(part(new SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), SNOW, { at: [0, 6.8, -0.8], scale: [3, 0.7, 1.4] }));
  // The frozen fall: icicle columns down the middle.
  for (const [x, h, r] of [[-0.55, 5.8, 0.35], [0, 6.2, 0.45], [0.55, 5.6, 0.35], [-0.25, 4.6, 0.25], [0.3, 4.9, 0.25]] as const) {
    parts.push(part(new ConeGeometry(r, h, 6, 1), (p) => mix(ICE, ICE_DEEP, ramp(p.y, h / 2, -h / 2) * 0.7), { at: [x, 0.6 + h / 2, 0.5], rot: [Math.PI, 0, 0] }));
  }
  // The frozen pool at its foot.
  parts.push(part(new CylinderGeometry(1.6, 1.8, 0.3, 12), ICE, { at: [0, 0.15, 1.1] }));
  return solid('frozen-fall', parts);
}

/** Record ②: one mitten, 0.4 × 0.5 × 0.2 m, with the swirly stripes of Sakasa's hat (not said; a child may notice). */
function spiralMitten(): Group {
  const stripes = (p: Vector3): Color => {
    const a = Math.atan2(p.y - 0.28, p.x) + (p.y - 0.28) * 14;
    return new Color(Math.sin(a * 2) > 0 ? MITTEN_A : MITTEN_B);
  };
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.15, 10, 7), stripes, { at: [0, 0.3, 0], scale: [1.1, 1.3, 0.6] }));
  parts.push(part(new SphereGeometry(0.06, 7, 5), stripes, { at: [0.15, 0.27, 0], scale: [1, 1.4, 0.9] }));
  parts.push(part(new CylinderGeometry(0.13, 0.14, 0.12, 10), MITTEN_CUFF, { at: [0, 0.07, 0], scale: [1.1, 1, 0.6] }));
  return solid('spiral-mitten', parts);
}

/** Record ③: a small tin shovel, 0.3 × 0.9 × 0.2 m, silver with a red handle. */
function tinShovel(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(roundedBox(0.28, 0.3, 0.04, 0.02, [2, 2, 1]), (p) => mix(TIN, TIN_DARK, ramp(p.y, 0.15, -0.15)), { at: [0, 0.16, 0] }));
  parts.push(part(new CylinderGeometry(0.025, 0.025, 0.5, 6), HANDLE, { at: [0, 0.55, 0] }));
  parts.push(part(new TorusGeometry(0.06, 0.02, 4, 8), HANDLE, { at: [0, 0.84, 0] }));
  return solid('tin-shovel', parts);
}

const BUILDERS: Record<string, () => Group> = {
  'plow-blade': plowBlade,
  'snow-wall': () => snowWall('snow-wall', SNOW, SNOW_DEEP),
  'sign-plow': signPlow,
  'snow-house': () => snowHouse('snow-house', HOUSE_WALLS[0]),
  'snow-house-b': () => snowHouse('snow-house-b', HOUSE_WALLS[1]),
  kamakura,
  'amanojaku-kamakura': amanojakuKamakura,
  lantern,
  'snow-fence-small': () => snowFence('snow-fence-small', false),
  'snow-fence-trace': () => snowFence('snow-fence-trace', true),
  'snow-shed': snowShed,
  'ski-ramp': skiRamp,
  'ski-ramp-folded': skiRampFolded,
  'ski-lift-tower': skiLiftTower,
  'snow-ravine': snowRavine,
  'frozen-fall': frozenFall,
  'spiral-mitten': spiralMitten,
  'tin-shovel': tinShovel,
};

/** The names this module draws (ticket 0016). */
export const VILLAGE_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the snowy village set. */
export function buildVillagePlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
