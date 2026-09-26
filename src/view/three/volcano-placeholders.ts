import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  type EulerOrder,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Stand-ins drawn in code for the volcano island set of 2-3 (ticket 0009) until its models are built. Same names,
 * sizes and origins as the ticket, so stage JSON does not change when the real models arrive: origin at the bottom
 * centre, +Z forward, the model's own left is +X. Exception: `old-bridge` has its origin at the top of the deck
 * (under the track), because the bridge stands 48 m over the sea and falls about that point in the ending.
 *
 * One model = one merged mesh in one shared vertex-coloured material (a cell of many copies is one draw call);
 * nothing in this set has moving parts. Colours are soft and round: the volcano is a friendly mountain with a
 * little steam cloud, never fire.
 */
const SAND = '#F2DDA6';
const SAND_WET = '#D9C08A';
const FOOT_GREEN = '#8CC86E';
const MID_GREEN = '#A9C77A';
const MID_BROWN = '#BE946A';
const HIGH_BROWN = '#A88A74';
const TOP_GREY = '#978C86';
const RIM = '#A99E97';
const CRATER = '#877D78';
const LAKE = '#D6EEF2';
const LAKE_EDGE = '#BFE2E8';
const STEAM = '#FFFFFF';
const STEAM_SHADE = '#E8F0F6';

const MESA_TOP = '#A9C47C';
const MESA_TOP_EDGE = '#C8B98C';
const MESA_LAYERS = ['#CFA27A', '#BD8C6C', '#D8B58A', '#C49474'];
const MESA_FOOT = '#8C7B6B';

const PUMICE = '#ECE5D6';
const PUMICE_SHADE = '#DCD3C1';
const PUMICE_HOLE = '#B9AE9B';

const WOOD = '#B98B5A';
const WOOD_LIGHT = '#C99C6A';
const WOOD_DARK = '#8E6A45';
const ROPE = '#EADBB8';

const WALL = '#F6F0E4';
const WALL_TRIM = '#D9CDB8';
const PLINTH = '#C9C2B8';
const DOME = '#9CCBE8';
const DOME_SLIT = '#4E7FA8';
const DOOR = '#4FA3A5';
const WINDOW = '#BFE6FF';
const MAST = '#8A8F96';
const BLADES = ['#FF8A7A', '#FFD166', '#7CC6F2', '#8CD68A'];

const BIRD = '#FFFFFF';
const BIRD_SHADE = '#EEF1F4';
const BIRD_WING = '#B7C3CF';
const BIRD_TIP = '#7F8C9A';
const BIRD_FOOT = '#F4A259';
const EYE_DARK = '#2B3A4A';
const EYE_SHINE = '#FFFFFF';

const POST = '#8A8F96';
const STEEP_BOARD = '#FFD43B';
const STEEP_FRAME = '#A45C3D';
const STEEP_MARK = '#A45C3D';
const SLIDE_BOARD = '#BFE3F5';
const SLIDE_FRAME = '#5F9CCB';
const SLIDE_MARK = '#F7FBFF';
const SPARKLE = '#FFE066';
const REST_BOARD = '#3C4F86';
const REST_FRAME = '#C9D6F0';
const MOON = '#FFE066';
const ROCKET_BODY = '#F7F3EA';
const ROCKET_BAND = '#FF922B';
const ROCKET_NOSE = '#FF7A45';
const ROCKET_STRIPE = '#FFD166';
const ROCKET_DARK = '#3A3F47';
const ROCKET_SADDLE = '#3FA7D6';

const CRYSTAL = '#FFE04A';
const CRYSTAL_TIP = '#FFF6A8';
const CRYSTAL_DEEP = '#F4C430';
const CRYSTAL_ROCK = '#9A928A';

let shared: MeshLambertMaterial | null = null;
/** The one material every volcano stand-in shares (colours come from the vertices). */
function material(): MeshLambertMaterial {
  shared ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return shared;
}

type Vec = readonly [number, number, number];
/** A fixed colour, or a colour from the part's own (not yet placed) vertex position. */
type Paint = string | ((p: Vector3) => Color);
/** A colour for each whole triangle, from its centre and normal (in the part's own space): flat patches. */
type FacePaint = (centre: Vector3, normal: Vector3) => Color;
interface Place {
  at?: Vec;
  rot?: Vec;
  order?: EulerOrder;
  quat?: Quaternion;
  scale?: number | Vec;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** 0 at `a`, 1 at `b` (either way round), clamped. */
const ramp = (v: number, a: number, b: number): number => clamp01((v - a) / (b - a));
const mix = (a: string, b: string, t: number): Color => new Color(a).lerp(new Color(b), clamp01(t));
const v3 = (p: Vec): Vector3 => new Vector3(p[0], p[1], p[2]);
/** A repeatable 0…1 number for a point (so jitter and speckles are the same on every load). */
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
/** Lightens (> 0) or darkens (< 0) a colour a little. */
const shade = (c: Color, k: number): Color => (k >= 0 ? c.clone().lerp(new Color('#FFFFFF'), k) : c.clone().multiplyScalar(1 + k));

/**
 * One part of a model: non-indexed, no uv, painted with vertex colours in its own space (per vertex, or per whole
 * triangle with `faces`), then scaled, turned and moved into place. Every part has the same attributes, so any set
 * of them merges.
 */
function part(source: BufferGeometry, paint: Paint | { faces: FacePaint }, place: Place = {}): BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  if (g !== source) source.dispose();
  g.clearGroups();
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  if (typeof paint === 'object') {
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const e1 = new Vector3();
    const e2 = new Vector3();
    for (let t = 0; t + 2 < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t);
      b.fromBufferAttribute(pos, t + 1);
      c.fromBufferAttribute(pos, t + 2);
      const normal = new Vector3().crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
      const col = paint.faces(a.clone().add(b).add(c).divideScalar(3), normal);
      for (let k = 0; k < 3; k++) {
        colors[(t + k) * 3] = col.r;
        colors[(t + k) * 3 + 1] = col.g;
        colors[(t + k) * 3 + 2] = col.b;
      }
    }
  } else {
    const fixed = typeof paint === 'string' ? new Color(paint) : null;
    const p = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      const c = fixed ?? (paint as (p: Vector3) => Color)(p.fromBufferAttribute(pos, i));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const s = place.scale ?? 1;
  const scale = typeof s === 'number' ? new Vector3(s, s, s) : v3(s);
  const rot = place.rot ?? [0, 0, 0];
  const q = place.quat ?? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], place.order ?? 'XYZ'));
  g.applyMatrix4(new Matrix4().compose(v3(place.at ?? [0, 0, 0]), q, scale));
  return g;
}

/** Which way a triangle should face: a fixed direction, or one worked out from its centre. */
type Outward = Vector3 | ((centre: Vector3) => Vector3);
/** Faces pointing away from `inside` (for a closed, roughly convex shape). */
const awayFrom =
  (inside: Vector3): Outward =>
  (c) =>
    c.clone().sub(inside);

/** A geometry from triangles, each turned (if needed) so its front faces `outward`. */
function triangles(list: Vector3[][], outward: Outward): BufferGeometry {
  const positions: number[] = [];
  const e1 = new Vector3();
  const e2 = new Vector3();
  const n = new Vector3();
  for (const [a, b0, c0] of list) {
    let b = b0;
    let c = c0;
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const out = outward instanceof Vector3 ? outward : outward(a.clone().add(b).add(c).divideScalar(3));
    if (n.dot(out) < 0) [b, c] = [c, b];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

const UP = new Vector3(0, 1, 0);
const FRONT = new Vector3(0, 0, 1);

/** Turns +Y onto the direction from `a` to `b` (for a cylinder or box laid between two points). */
function alongY(a: Vector3, b: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
}

/** A box from `a` to `b` with the given cross-section (a beam, a leg, a brace). */
function beam(a: Vec, b: Vec, width: number, depth: number, paint: Paint): BufferGeometry {
  const pa = v3(a);
  const pb = v3(b);
  const mid = pa.clone().add(pb).multiplyScalar(0.5);
  return part(new BoxGeometry(width, pa.distanceTo(pb), depth), paint, { at: [mid.x, mid.y, mid.z], quat: alongY(pa, pb) });
}

/**
 * Rings of a closed outline stacked into a surface: each ring is a list of points, all rings the same length; the
 * surface between ring j and j + 1 is filled with triangles.
 */
function bands(rings: Vector3[][], closed: boolean): Vector3[][] {
  const list: Vector3[][] = [];
  for (let j = 0; j + 1 < rings.length; j++) {
    const lo = rings[j];
    const hi = rings[j + 1];
    const n = lo.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const i1 = (i + 1) % n;
      list.push([lo[i], lo[i1], hi[i1]], [lo[i], hi[i1], hi[i]]);
    }
  }
  return list;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('volcano placeholder: parts do not merge');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** A static model: one merged mesh. */
function solid(name: string, parts: BufferGeometry[]): Group {
  const g = new Group();
  const mesh = new Mesh(merge(parts), material());
  mesh.name = name;
  g.add(mesh);
  return g;
}

/** Moves a model's single mesh so its lowest point is at y = 0 (origin on the floor). */
function toFloor(g: Group): Group {
  const geometry = (g.children[0] as Mesh).geometry;
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return g;
}

// ---- volcano ----

/** The volcano's cone (PHASE6 2-3 §6.1): radius 380 m at y 0 up to radius 100 m at y 100 (2.8 m out per 1 m down). */
const CONE_BASE = 380;
const CONE_RUN = 2.8;
const RIM_HEIGHT = 100;
const CRATER_FLOOR = 86;
const VOLCANO_SEGMENTS = 56;

/**
 * The volcano, 792 × 100 × 792 m (the steam cloud reaches about 118 m): a round cone, green at the foot, brown
 * in the middle and soft grey at the top, on a ring of sand in the sea; a rounded rim at radius 100 m and 100 m
 * up; inside, a shallow crater down to 86 m with a pale steam lake and a small white steam cloud over it.
 *
 * The flank is exactly the cone the track is laid on (the rail is 2 m above it): every vertex lies on the cone and
 * the flat faces between them dip just under it, so nothing pokes up through the track. The sneeze ring
 * (volcano-gimmicks.ts) starts 6 m above the rim (y 106 × scale); the empty node `sneeze` marks that spot.
 */
function volcano(): Group {
  const cone = (y: number): [number, number] => [CONE_BASE - CONE_RUN * y, y];
  // Profile from the sea floor outside to the lake's edge inside: [radius, height].
  const profile: [number, number][] = [
    [396, 0],
    [388, 0.35],
    cone(0.55),
    cone(6),
    cone(18),
    cone(32),
    cone(46),
    cone(60),
    cone(74),
    cone(88),
    cone(RIM_HEIGHT),
    [96, 100.5],
    [91, 100.2],
    [84, 97],
    [74, 90.5],
    [66, CRATER_FLOOR + 0.3],
  ];
  const rings = profile.map(([r, y]) =>
    Array.from({ length: VOLCANO_SEGMENTS }, (_, i) => {
      const a = (i / VOLCANO_SEGMENTS) * Math.PI * 2;
      return new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    }),
  );
  const colourAt = (c: Vector3): Color => {
    const r = Math.hypot(c.x, c.z);
    const y = c.y;
    const jitter = (hash(Math.round(c.x), Math.round(c.y * 3), Math.round(c.z)) - 0.5) * 0.08;
    let col: Color;
    if (r > CONE_BASE - 1) col = r > 390 ? new Color(SAND_WET) : new Color(SAND);
    else if (r < 99) col = r < 80 ? mix(CRATER, LAKE_EDGE, ramp(y, 90, CRATER_FLOOR)) : mix(RIM, CRATER, ramp(r, 96, 84));
    else if (y < 30) col = mix(FOOT_GREEN, MID_GREEN, ramp(y, 4, 28));
    else if (y < 55) col = mix(MID_GREEN, MID_BROWN, ramp(y, 30, 50));
    else if (y < 85) col = mix(MID_BROWN, HIGH_BROWN, ramp(y, 55, 80));
    else col = mix(HIGH_BROWN, TOP_GREY, ramp(y, 85, 99));
    return shade(col, jitter);
  };
  const parts: BufferGeometry[] = [part(triangles(bands(rings, true), UP), { faces: (c) => colourAt(c) })];
  // The steam lake: a flat disc filling the crater floor.
  const edge = rings[rings.length - 1];
  const lake: Vector3[][] = [];
  const middle = new Vector3(0, CRATER_FLOOR + 0.3, 0);
  for (let i = 0; i < edge.length; i++) lake.push([middle, edge[i], edge[(i + 1) % edge.length]]);
  parts.push(part(triangles(lake, UP), { faces: (c) => mix(LAKE, LAKE_EDGE, ramp(Math.hypot(c.x, c.z), 30, 66)) }));
  // A small, soft steam cloud rising from the lake (well inside the rim: the track runs round at 110 m).
  const puffs: [Vec, number][] = [
    [[-8, 94, 4], 13],
    [[10, 96, -6], 12],
    [[2, 104, 2], 12],
    [[-6, 110, -4], 9],
    [[6, 114, 5], 7],
  ];
  for (const [at, r] of puffs) {
    parts.push(part(new IcosahedronGeometry(r, 1), (p) => mix(STEAM, STEAM_SHADE, ramp(p.y, 0, -r)), { at, scale: [1, 0.8, 1] }));
  }
  const g = solid('volcano', parts);
  const anchor = new Object3D();
  anchor.name = 'sneeze';
  anchor.position.set(0, RIM_HEIGHT + 6, 0);
  g.add(anchor);
  return g;
}

// ---- mesas ----

/**
 * A flat-topped rock hill standing in the sea (はなれやま, みさき): the top is a rounded rectangle exactly
 * `width` (X) × `depth` (Z) m, flat at y 48 (the track bed sits on it at 48.6) and grassy, with soft layered rock
 * sides that spread about 8–10 m outward down to the water (y 0, the sea; no bottom face). Origin: the bottom
 * centre, at sea level.
 */
const MESA_TOP_Y = 48;
function mesa(name: string, width: number, depth: number): Group {
  const R = 22;
  const hx = width / 2 - R;
  const hz = depth / 2 - R;
  // The outline: four rounded corners joined by straight edges, cut into pieces a few tens of metres long.
  const outline: [number, number, number, number][] = [];
  const corners: [number, number, number][] = [
    [hx, hz, 0],
    [-hx, hz, Math.PI / 2],
    [-hx, -hz, Math.PI],
    [hx, -hz, (Math.PI * 3) / 2],
  ];
  const CORNER_STEPS = 6;
  corners.forEach(([cx, cz, start], k) => {
    for (let s = 0; s <= CORNER_STEPS; s++) {
      const a = start + (s / CORNER_STEPS) * (Math.PI / 2);
      outline.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R, Math.cos(a), Math.sin(a)]);
    }
    // The straight edge to the next corner.
    const [nx, nz, nStart] = corners[(k + 1) % 4];
    const a = start + Math.PI / 2;
    const from = [cx + Math.cos(a) * R, cz + Math.sin(a) * R];
    const to = [nx + Math.cos(nStart) * R, nz + Math.sin(nStart) * R];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const pieces = Math.max(1, Math.round(length / 28));
    for (let s = 1; s < pieces; s++) {
      const t = s / pieces;
      outline.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, Math.cos(a), Math.sin(a)]);
    }
  });
  // Side profile: [how far out from the top edge, height]. Rock bulges a little (outward only, so the top stays
  // its full size).
  const profile: [number, number][] = [
    [8, 0],
    [6.5, 1.5],
    [5, 10],
    [4, 22],
    [3.2, 34],
    [2.2, 43],
    [1, 46.8],
    [0, MESA_TOP_Y],
  ];
  const rings = profile.map(([out, y], j) =>
    outline.map(([x, z, nx, nz]) => {
      const bulge = j === 0 || j === profile.length - 1 ? 0 : hash(x, y, z) * 2.2;
      return new Vector3(x + nx * (out + bulge), y, z + nz * (out + bulge));
    }),
  );
  const top = rings[rings.length - 1];
  // The top: a lighter band along the edge, then a plain grassy field (one colour, so the fan does not streak).
  const inner = outline.map(([x, z, nx, nz]) => new Vector3(x - nx * 7, MESA_TOP_Y, z - nz * 7));
  const centre = new Vector3(0, MESA_TOP_Y, 0);
  const field: Vector3[][] = [];
  for (let i = 0; i < inner.length; i++) field.push([centre, inner[i], inner[(i + 1) % inner.length]]);
  const rim = bands([inner, top], true);
  const sides = triangles(bands(rings, true), awayFrom(new Vector3(0, MESA_TOP_Y / 2, 0)));
  const layer = (y: number): Color => {
    const band = Math.floor((y + 3) / 7.5);
    return new Color(MESA_LAYERS[((band % MESA_LAYERS.length) + MESA_LAYERS.length) % MESA_LAYERS.length]);
  };
  return solid(name, [
    part(sides, {
      faces: (c) => {
        const jitter = (hash(Math.round(c.x), Math.round(c.y), Math.round(c.z)) - 0.5) * 0.1;
        if (c.y > 46.5) return shade(new Color(MESA_TOP_EDGE), jitter);
        if (c.y < 1) return shade(new Color(MESA_FOOT), jitter);
        return shade(layer(c.y), jitter);
      },
    }),
    part(triangles(field, UP), MESA_TOP),
    part(triangles(rim, UP), { faces: (c) => shade(mix(MESA_TOP, MESA_TOP_EDGE, 0.45), (hash(c.x, 0, c.z) - 0.5) * 0.06) }),
  ]);
}

// ---- pumice ----

/**
 * かるいし, about 1 × 0.85 × 0.95 m: a light, round, slightly lumpy stone, pale cream with small darker pores.
 * The game scales it (rolling rock 2.4 m, dropping rock 1.2 m, the floating record) by its largest side.
 */
function pumice(): Group {
  const ico = new IcosahedronGeometry(0.5, 2);
  const pos = ico.getAttribute('position');
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    // The same corner appears in several faces: bump by position, so the stone stays closed.
    const bump = 1 + (hash(Math.round(p.x * 40), Math.round(p.y * 40), Math.round(p.z * 40)) - 0.5) * 0.14;
    pos.setXYZ(i, p.x * bump, p.y * bump * 0.86, p.z * bump * 0.95);
  }
  ico.computeVertexNormals();
  const pores = [
    [0.7, 0.3, 0.6],
    [-0.5, 0.6, 0.6],
    [0.1, 0.9, -0.4],
    [-0.8, -0.1, -0.5],
    [0.6, -0.4, -0.7],
    [-0.2, 0.2, 1],
    [1, 0.4, -0.2],
    [-0.9, 0.5, 0.1],
    [0.3, -0.2, -1],
    [-0.4, 0.95, -0.2],
  ].map(([x, y, z]) => new Vector3(x, y, z).normalize());
  return toFloor(
    solid('pumice', [
      part(ico, {
        faces: (c) => {
          const dir = c.clone().normalize();
          if (pores.some((q) => q.dot(dir) > 0.975)) return new Color(PUMICE_HOLE);
          return hash(c.x * 9, c.y * 9, c.z * 9) < 0.3 ? new Color(PUMICE_SHADE) : new Color(PUMICE);
        },
      }),
    ]),
  );
}

// ---- old bridge ----

/** The bridge deck's top is this far under the track point (the bottom of the ballast, rail-mesh.ts). */
const BRIDGE_LEG_DEPTH = 54;
/**
 * One 20 m piece of ぐらぐらばし, 10 × 54.6 × 20 m: an old wooden trestle. A plank deck 4.8 m wide with low
 * rails on both sides, and under its middle one tall A-frame of legs with cross braces that reaches 54 m down
 * (the sea is about 48.4 m below the deck; the legs go on into the water). Seven in a row make the bridge.
 * Origin: the middle of the deck's top (the exception in this set), +Z along the track: stage JSON puts it on the
 * rail (heightFromRail −0.6), and the ending's fall tips it about this point.
 */
function oldBridge(): Group {
  const parts: BufferGeometry[] = [];
  const PLANKS = 10;
  for (let i = 0; i < PLANKS; i++) {
    const z = -10 + (i + 0.5) * 2;
    // Old planks: a little uneven in colour, height and angle.
    const wobble = (hash(i, 1, 2) - 0.5) * 0.06;
    const col = i % 3 === 1 ? WOOD_LIGHT : i % 3 === 2 ? WOOD_DARK : WOOD;
    parts.push(part(new BoxGeometry(4.8, 0.3, 1.88), col, { at: [0, -0.15 + wobble * 0.5, z], rot: [0, wobble, wobble * 0.4] }));
  }
  for (const x of [-1.6, 1.6]) parts.push(part(new BoxGeometry(0.45, 0.6, 20), WOOD_DARK, { at: [x, -0.6, 0] }));
  // Low rails: posts and a top bar each side, outside the train (it is 3 m wide).
  for (const side of [-1, 1]) {
    for (const z of [-7, 0, 7]) parts.push(part(new BoxGeometry(0.22, 1.2, 0.22), WOOD, { at: [side * 2.3, 0.6, z] }));
    parts.push(part(new BoxGeometry(0.16, 0.16, 20), WOOD_LIGHT, { at: [side * 2.3, 1.2, 0], rot: [0.01 * side, 0, 0] }));
  }
  // The trestle under the middle: two legs splaying out, ties across, and an X of braces between each tie.
  const top = -0.9;
  const bottom = -BRIDGE_LEG_DEPTH;
  const xAt = (y: number): number => 1.8 + ((top - y) / (top - bottom)) * 3.2;
  for (const side of [-1, 1]) parts.push(beam([side * xAt(top), top, 0], [side * xAt(bottom), bottom, 0], 0.55, 0.55, WOOD_DARK));
  const levels = [top, -13, -26, -39, -50];
  for (let k = 0; k < levels.length; k++) {
    const y = levels[k];
    if (k > 0) parts.push(part(new BoxGeometry(2 * xAt(y) + 0.6, 0.35, 0.35), WOOD, { at: [0, y, 0] }));
    if (k + 1 < levels.length) {
      const y2 = levels[k + 1];
      parts.push(beam([-xAt(y), y, 0.3], [xAt(y2), y2, 0.3], 0.25, 0.25, WOOD));
      parts.push(beam([xAt(y), y, -0.3], [-xAt(y2), y2, -0.3], 0.25, 0.25, WOOD));
    }
  }
  // Rope wrapped round the top of each leg (old, tied-up, not broken).
  for (const side of [-1, 1]) parts.push(part(new BoxGeometry(0.7, 0.4, 0.7), ROPE, { at: [side * xAt(-2.2), -2.2, 0] }));
  return solid('old-bridge', parts);
}

// ---- observatory ----

/**
 * かんそくじょ, about 9 × 10 × 7 m: a small cream hut on a stone step with a teal door (+Z) and round windows,
 * a round pale-blue dome on top, and a four-colour pinwheel on a mast at the back corner.
 */
function observatory(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(7, 0.5, 7), PLINTH, { at: [0, 0.25, 0] }));
  parts.push(part(new BoxGeometry(5.6, 3.2, 5.2), WALL, { at: [0, 2.1, 0] }));
  parts.push(part(new BoxGeometry(6, 0.3, 5.6), WALL_TRIM, { at: [0, 3.85, 0] }));
  parts.push(part(new BoxGeometry(1.2, 2.1, 0.12), DOOR, { at: [0, 1.55, 2.62] }));
  parts.push(part(new BoxGeometry(1.5, 0.14, 0.3), WALL_TRIM, { at: [0, 2.68, 2.66] }));
  for (const side of [-1, 1]) {
    parts.push(part(new CylinderGeometry(0.55, 0.55, 0.1, 12), WINDOW, { at: [side * 2.82, 2.3, 0], rot: [0, 0, Math.PI / 2] }));
    parts.push(part(new CylinderGeometry(0.45, 0.45, 0.1, 10), WINDOW, { at: [side * 1.8, 2.4, 2.62], rot: [Math.PI / 2, 0, 0] }));
  }
  // The dome: a short drum and a half sphere, with a dark slit over the top.
  parts.push(part(new CylinderGeometry(2.5, 2.5, 0.6, 16, 1, true), WALL_TRIM, { at: [0, 4.3, 0] }));
  parts.push(part(new SphereGeometry(2.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), DOME, { at: [0, 4.6, 0] }));
  parts.push(part(new TorusGeometry(2.52, 0.28, 3, 10, Math.PI * 0.55), DOME_SLIT, { at: [0, 4.6, 0], rot: [0, Math.PI / 2, Math.PI * 0.225] }));
  // The pinwheel mast at the back left, turned to face +Z.
  const mast: Vec = [2.9, 0, -2.9];
  parts.push(part(new CylinderGeometry(0.09, 0.12, 9.2, 6), MAST, { at: [mast[0], 4.6, mast[2]] }));
  const hub = new Vector3(mast[0], 9.2, mast[2] + 0.2);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tip = new Vector3(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
    const side = new Vector3(Math.cos(a + Math.PI / 2) * 0.55, Math.sin(a + Math.PI / 2) * 0.55, 0.18);
    // One triangle per blade, drawn on both faces (the game culls back faces).
    const tri = [new Vector3(0, 0, 0), tip, tip.clone().add(side)];
    for (const facing of [FRONT, FRONT.clone().negate()]) parts.push(part(triangles([tri], facing), BLADES[i], { at: [hub.x, hub.y, hub.z] }));
  }
  parts.push(part(new SphereGeometry(0.2, 8, 4), ROCKET_STRIPE, { at: [hub.x, hub.y, hub.z + 0.05] }));
  return solid('observatory', parts);
}

// ---- seabirds ----

/**
 * A round seabird, flying (`seabird`, 1.5 × 0.75 × 0.8 m): a white round body and head, soft grey wings raised
 * in a wide V with darker tips, a short tail, orange feet tucked under, and eyes only (no other face). Head +Z.
 * Used on the rail when it wakes and flies off, and for the flock round the volcano.
 */
function seabird(): Group {
  const parts: BufferGeometry[] = [];
  const white = (p: Vector3): Color => mix(BIRD, BIRD_SHADE, ramp(p.y, 0, -0.9));
  parts.push(part(new SphereGeometry(1, 8, 6), white, { at: [0, 0.3, -0.05], scale: [0.25, 0.22, 0.36] }));
  parts.push(part(new SphereGeometry(0.19, 8, 5), white, { at: [0, 0.44, 0.3] }));
  for (const side of [1, -1]) {
    parts.push(part(new SphereGeometry(0.05, 5, 3), EYE_DARK, { at: [side * 0.11, 0.49, 0.43] }));
    parts.push(part(new SphereGeometry(0.018, 4, 2), EYE_SHINE, { at: [side * 0.13, 0.51, 0.47] }));
    // Wing: a flat, round-ended paddle rising outward, with a darker tip.
    const wing = new Quaternion().setFromEuler(new Euler(0, 0, side * 0.42));
    const root = new Vector3(side * 0.12, 0.38, -0.02);
    const outward = new Vector3(side, 0, 0).applyQuaternion(wing);
    const mid = root.clone().addScaledVector(outward, 0.36);
    const tip = root.clone().addScaledVector(outward, 0.66);
    parts.push(part(new SphereGeometry(1, 6, 3), BIRD_WING, { at: [mid.x, mid.y, mid.z], quat: wing, scale: [0.38, 0.035, 0.17] }));
    parts.push(part(new SphereGeometry(1, 5, 2), BIRD_TIP, { at: [tip.x, tip.y, tip.z - 0.02], quat: wing, scale: [0.12, 0.03, 0.11] }));
    parts.push(part(new SphereGeometry(0.045, 4, 2), BIRD_FOOT, { at: [side * 0.07, 0.1, -0.2], scale: [1, 0.6, 1.6] }));
  }
  parts.push(part(new SphereGeometry(1, 5, 2), BIRD_WING, { at: [0, 0.33, -0.42], rot: [-0.2, 0, 0], scale: [0.13, 0.03, 0.12] }));
  return toFloor(solid('seabird', parts));
}

/**
 * The same seabird asleep (`seabird-sleep`, 0.5 × 0.45 × 0.65 m): sitting round and low, wings folded along its
 * sides, head sunk in, eyes closed (two small curved lines). Head +Z.
 */
function seabirdSleep(): Group {
  const parts: BufferGeometry[] = [];
  const white = (p: Vector3): Color => mix(BIRD, BIRD_SHADE, ramp(p.y, 0.2, -0.9));
  parts.push(part(new SphereGeometry(1, 8, 6), white, { at: [0, 0.2, -0.03], scale: [0.25, 0.2, 0.31] }));
  parts.push(part(new SphereGeometry(0.17, 8, 5), white, { at: [0, 0.33, 0.2] }));
  for (const side of [1, -1]) {
    // Folded wing: a flat grey oval lying along the side, its darker tip crossing over the tail.
    parts.push(part(new SphereGeometry(1, 6, 3), BIRD_WING, { at: [side * 0.19, 0.2, -0.1], rot: [0.12, 0, side * 0.25], scale: [0.07, 0.1, 0.23] }));
    parts.push(part(new SphereGeometry(1, 5, 2), BIRD_TIP, { at: [side * 0.1, 0.22, -0.33], rot: [0.35, 0, 0], scale: [0.06, 0.04, 0.09] }));
    // A closed eye: a small arc curving down (a gentle "‿").
    parts.push(
      part(new TorusGeometry(0.034, 0.006, 3, 6, Math.PI), EYE_DARK, {
        at: [side * 0.1, 0.37, 0.34],
        rot: [0.35, side * 0.5, Math.PI],
        order: 'YXZ',
      }),
    );
  }
  parts.push(part(new SphereGeometry(1, 5, 2), BIRD_WING, { at: [0, 0.22, -0.36], rot: [0.3, 0, 0], scale: [0.1, 0.03, 0.1] }));
  return toFloor(solid('seabird-sleep', parts));
}

// ---- signs ----

type SignIcon = 'steep' | 'slide' | 'rest';

/** Flat triangles on the board's front (+Z), `z` in front of it. Points are [x, y] on the board. */
function flat(points: [number, number][][], z: number, paint: string): BufferGeometry {
  return part(
    triangles(
      points.map((tri) => tri.map(([x, y]) => new Vector3(x, y, z))),
      FRONT,
    ),
    paint,
  );
}

/** A thick "›" chevron (two bars meeting at a point) as flat triangles, pointing along `dir` (radians). */
function chevron(cx: number, cy: number, size: number, thick: number, dir: number): [number, number][][] {
  const out: [number, number][][] = [];
  const rot = (x: number, y: number): [number, number] => [cx + x * Math.cos(dir) - y * Math.sin(dir), cy + x * Math.sin(dir) + y * Math.cos(dir)];
  for (const s of [1, -1]) {
    const a = rot(-size / 2, (s * size) / 2);
    const b = rot(size / 2, 0);
    const c = rot(size / 2 - thick, 0);
    const d = rot(-size / 2 - thick, (s * size) / 2);
    out.push([a, b, c], [a, c, d]);
  }
  return out;
}

/** A four-pointed sparkle as flat triangles. */
function sparkle(cx: number, cy: number, r: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const tip: [number, number] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const l: [number, number] = [cx + Math.cos(a + Math.PI / 4) * r * 0.28, cy + Math.sin(a + Math.PI / 4) * r * 0.28];
    const rr: [number, number] = [cx + Math.cos(a - Math.PI / 4) * r * 0.28, cy + Math.sin(a - Math.PI / 4) * r * 0.28];
    out.push([[cx, cy], rr, tip], [[cx, cy], tip, l]);
  }
  return out;
}

/**
 * A trackside sign, 1.5 × 3.3 × 0.2 m: a grey post and a rounded board facing +Z (the game stands it on the left
 * of the track, turned to face the train). Three pictures on the same sign:
 * - `sign-steep` (きゅうな さか): yellow board, a red-brown steep hill with two yellow ">>" going up it
 * - `sign-slide` (つるつるざか): pale blue board, a white downhill slope and two yellow sparkles
 * - `sign-no-rocket` (ロケット おやすみ): navy board, a yellow crescent moon and a small resting rocket tube
 */
function sign(name: string, icon: SignIcon): Group {
  const parts: BufferGeometry[] = [];
  const board = { steep: STEEP_BOARD, slide: SLIDE_BOARD, rest: REST_BOARD }[icon];
  const frame = { steep: STEEP_FRAME, slide: SLIDE_FRAME, rest: REST_FRAME }[icon];
  const W = 1.4;
  const H = 1.05;
  const CY = 2.75;
  parts.push(part(new CylinderGeometry(0.07, 0.08, CY, 8), POST, { at: [0, CY / 2, -0.1] }));
  // The board: a rounded slab (a squashed short cylinder on its side would be a circle; use a box with round ends).
  parts.push(part(new BoxGeometry(W - 0.3, H, 0.1), board, { at: [0, CY, 0] }));
  for (const side of [-1, 1]) {
    parts.push(part(new CylinderGeometry(0.15, 0.15, 0.1, 8, 1), board, { at: [side * (W / 2 - 0.15), CY + H / 2 - 0.15, 0], rot: [Math.PI / 2, 0, 0] }));
    parts.push(part(new CylinderGeometry(0.15, 0.15, 0.1, 8, 1), board, { at: [side * (W / 2 - 0.15), CY - H / 2 + 0.15, 0], rot: [Math.PI / 2, 0, 0] }));
    parts.push(part(new BoxGeometry(0.3, H - 0.3, 0.1), board, { at: [side * (W / 2 - 0.15), CY, 0] }));
  }
  // A frame line just inside the edge.
  const fz = 0.055;
  const inset = 0.08;
  const fw = 0.06;
  const x0 = -W / 2 + inset;
  const x1 = W / 2 - inset;
  const y0 = CY - H / 2 + inset;
  const y1 = CY + H / 2 - inset;
  const bar = (ax: number, ay: number, bx: number, by: number): [number, number][][] => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * (fw / 2);
    const ny = (dx / len) * (fw / 2);
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
  };
  parts.push(flat([...bar(x0 + 0.1, y0, x1 - 0.1, y0), ...bar(x0 + 0.1, y1, x1 - 0.1, y1), ...bar(x0, y0 + 0.1, x0, y1 - 0.1), ...bar(x1, y0 + 0.1, x1, y1 - 0.1)], fz, frame));
  const iz = 0.06;
  if (icon === 'steep') {
    parts.push(
      flat(
        [
          [
            [-0.5, CY - 0.33],
            [0.5, CY - 0.33],
            [0.5, CY + 0.3],
          ],
        ],
        iz,
        STEEP_MARK,
      ),
    );
    // Two ">" (the track's own arrows) climbing the hill.
    parts.push(flat([...chevron(0.1, CY - 0.19, 0.15, 0.06, 0), ...chevron(0.3, CY - 0.07, 0.15, 0.06, 0)], iz + 0.005, STEEP_BOARD));
  } else if (icon === 'slide') {
    parts.push(
      flat(
        [
          [
            [-0.5, CY - 0.33],
            [0.5, CY - 0.33],
            [-0.5, CY + 0.18],
          ],
        ],
        iz,
        SLIDE_MARK,
      ),
    );
    parts.push(flat([...sparkle(0.22, CY + 0.18, 0.17), ...sparkle(0.42, CY - 0.06, 0.11)], iz, SPARKLE));
  } else {
    // A crescent moon: a fan of the outer circle minus an offset inner one, drawn as a strip.
    const moon: [number, number][][] = [];
    const mx = -0.3;
    const my = CY + 0.1;
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const a0 = Math.PI * 0.35 + (i / steps) * Math.PI * 1.3;
      const a1 = Math.PI * 0.35 + ((i + 1) / steps) * Math.PI * 1.3;
      const o0: [number, number] = [mx + Math.cos(a0) * 0.3, my + Math.sin(a0) * 0.3];
      const o1: [number, number] = [mx + Math.cos(a1) * 0.3, my + Math.sin(a1) * 0.3];
      const k0 = Math.sin(((i / steps) * Math.PI));
      const k1 = Math.sin((((i + 1) / steps) * Math.PI));
      const i0: [number, number] = [mx + Math.cos(a0) * (0.3 - 0.17 * k0), my + Math.sin(a0) * (0.3 - 0.17 * k0)];
      const i1: [number, number] = [mx + Math.cos(a1) * (0.3 - 0.17 * k1), my + Math.sin(a1) * (0.3 - 0.17 * k1)];
      moon.push([o0, o1, i1], [o0, i1, i0]);
    }
    parts.push(flat(moon, iz, MOON));
    // The rocket tube lying down to rest: a white body with a round nose, an orange band, no flame.
    parts.push(part(new CylinderGeometry(0.1, 0.1, 0.5, 10), ROCKET_BODY, { at: [0.22, CY - 0.18, 0.1], rot: [0, 0, Math.PI / 2] }));
    parts.push(part(new SphereGeometry(0.1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), ROCKET_BODY, { at: [0.47, CY - 0.18, 0.1], rot: [0, 0, -Math.PI / 2] }));
    parts.push(part(new CylinderGeometry(0.105, 0.105, 0.08, 10, 1, true), ROCKET_BAND, { at: [0.08, CY - 0.18, 0.1], rot: [0, 0, Math.PI / 2] }));
    parts.push(part(new CylinderGeometry(0.1, 0.13, 0.08, 10), ROCKET_DARK, { at: [-0.07, CY - 0.18, 0.1], rot: [0, 0, Math.PI / 2] }));
    // Three little "z" marks rising from it.
    const zee = (cx: number, cy: number, s: number): [number, number][][] => [
      ...bar(cx - s, cy + s, cx + s, cy + s),
      ...bar(cx + s, cy + s, cx - s, cy - s),
      ...bar(cx - s, cy - s, cx + s, cy - s),
    ];
    parts.push(flat([...zee(0.2, CY + 0.08, 0.05), ...zee(0.36, CY + 0.2, 0.065), ...zee(0.52, CY + 0.35, 0.05)], iz, MOON));
  }
  return solid(name, parts);
}

// ---- sulfur crystal ----

/**
 * きいろい けっしょう, about 1.4 × 1.5 × 1.2 m: a cluster of six bright yellow six-sided crystals with pale
 * pointed tips, leaning outward from a small grey stone.
 */
function sulfurCrystal(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new IcosahedronGeometry(0.5, 1), CRYSTAL_ROCK, { at: [0, 0.18, 0], scale: [1.3, 0.55, 1.1] }));
  const crystals: [number, number, number, number, number][] = [
    // x, z, height, lean about z, lean about x
    [0, 0, 1.3, 0, 0],
    [0.35, 0.1, 0.9, -0.45, 0.1],
    [-0.32, 0.15, 1.0, 0.4, 0.15],
    [0.1, -0.3, 0.8, -0.1, -0.45],
    [-0.15, 0.35, 0.7, 0.15, 0.5],
    [0.3, -0.25, 0.6, -0.5, -0.4],
  ];
  crystals.forEach(([x, z, h, rz, rx], i) => {
    const r = 0.12 + 0.03 * (i === 0 ? 1 : 0);
    const body = new CylinderGeometry(r, r * 1.05, h, 6, 1, true);
    body.translate(0, h / 2, 0);
    const tip = new CylinderGeometry(0, r, r * 1.8, 6, 1, true);
    tip.translate(0, h + r * 0.9, 0);
    const place: Place = { at: [x, 0.2, z], rot: [rx, i * 0.4, rz], order: 'YXZ' };
    parts.push(part(body, { faces: (c, n) => shade(new Color(n.x + n.z > 0 ? CRYSTAL : CRYSTAL_DEEP), c.y / h * 0.15) }, place));
    parts.push(part(tip, CRYSTAL_TIP, place));
  });
  return toFloor(solid('sulfur-crystal', parts));
}

// ---- rocket unit ----

/**
 * The rocket on ワンダー号's roof, 1.6 × 0.7 × 2.45 m: a dark mounting plate, two short round white tubes side by
 * side (x ±0.45, axis 0.37 m up) held in blue saddles, each with a round orange nose (+Z), an orange and a yellow band and
 * a dark nozzle at the back (−Z; volcano-gimmicks.ts puffs the flame from just behind it). Origin: the middle of
 * the plate's underside; volcano-gimmicks.ts sets it on the lead car at (0, 3.75, −5.0).
 */
function rocketUnit(): Group {
  const parts: BufferGeometry[] = [];
  const AXIS = 0.37;
  const R = 0.26;
  parts.push(part(new BoxGeometry(1.5, 0.08, 1.6), ROCKET_DARK, { at: [0, 0.04, 0] }));
  for (const z of [-0.45, 0.45]) parts.push(part(new BoxGeometry(1.46, 0.18, 0.3), ROCKET_SADDLE, { at: [0, 0.17, z] }));
  for (const side of [-1, 1]) {
    const x = side * 0.45;
    const along: Place = { rot: [Math.PI / 2, 0, 0] };
    const tube = (geo: BufferGeometry, paint: Paint, z: number): BufferGeometry => part(geo, paint, { ...along, at: [x, AXIS, z] });
    parts.push(tube(new CylinderGeometry(R, R, 1.5, 12, 1, true), ROCKET_BODY, 0.05));
    parts.push(part(new SphereGeometry(R, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), ROCKET_NOSE, { at: [x, AXIS, 0.8], rot: [Math.PI / 2, 0, 0] }));
    parts.push(tube(new CylinderGeometry(R + 0.015, R + 0.015, 0.14, 12, 1, true), ROCKET_BAND, 0.42));
    parts.push(tube(new CylinderGeometry(R + 0.015, R + 0.015, 0.1, 12, 1, true), ROCKET_STRIPE, -0.35));
    // The nozzle: a short dark cone widening backwards, closed at the back with a darker disc.
    parts.push(tube(new CylinderGeometry(R * 0.8, R * 1.05, 0.45, 12, 1, true), ROCKET_DARK, -0.9));
    parts.push(part(new CylinderGeometry(R * 0.8, R * 0.8, 0.02, 12), ROCKET_DARK, { at: [x, AXIS, -0.72], rot: [Math.PI / 2, 0, 0] }));
    parts.push(part(new CylinderGeometry(R * 1.05, R * 1.05, 0.02, 12), '#24282E', { at: [x, AXIS, -1.12], rot: [Math.PI / 2, 0, 0] }));
    // A small round fin on the outer side at the back.
    parts.push(part(new SphereGeometry(1, 6, 3), ROCKET_BAND, { at: [x + side * 0.26, AXIS, -0.45], scale: [0.14, 0.04, 0.26], rot: [0, 0, side * 0.2] }));
  }
  return solid('rocket-unit', parts);
}

const BUILDERS: Record<string, () => Group> = {
  volcano,
  'mesa-a': () => mesa('mesa-a', 175, 140),
  'mesa-b': () => mesa('mesa-b', 125, 155),
  pumice,
  'old-bridge': oldBridge,
  observatory,
  seabird,
  'seabird-sleep': seabirdSleep,
  'sign-steep': () => sign('sign-steep', 'steep'),
  'sign-slide': () => sign('sign-slide', 'slide'),
  'sign-no-rocket': () => sign('sign-no-rocket', 'rest'),
  'sulfur-crystal': sulfurCrystal,
  'rocket-unit': rocketUnit,
};

/** The names this module draws (ticket 0009). */
export const VOLCANO_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the volcano set. */
export function buildVolcanoPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
