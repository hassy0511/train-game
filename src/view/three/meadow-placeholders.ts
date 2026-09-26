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
  type Material,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  QuadraticBezierCurve3,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Stand-ins drawn in code for the meadow set of 2-2 (ticket 0008) until its models are built. Same names, sizes
 * and origins as the ticket, so stage JSON does not change when the real models arrive: origin at the bottom
 * centre, +Z forward, the model's own left is +X (exceptions are noted on each model).
 *
 * One model = one vertex-coloured material: every static model is a single merged mesh, so a cell of many
 * copies is one draw call. The moving ones (grasshopper, butterfly) are groups of named parts in the same
 * material, so `meadow.ts` can turn the parts (it finds them with getObjectByName).
 */
const GRASS_ROOT = '#5E9E3A';
const GRASS_TIP = '#A5D66B';
const CLOVER = '#5DAE4B';
const CLOVER_MARK = '#A8D88F';
const CLOVER_STEM = '#4F9A3F';
const CLOVER_FOUR = '#67BC50';
const CLOVER_FOUR_RIM = '#B2E68A';
const CLOVER_FOUR_MARK = '#D6F3C2';
const FLOWER_STEM = '#6BA84F';
const FLOWER_LEAF = '#7DB85C';
const PETAL = '#F4A7C0';
const PETAL_INNER = '#F9C9D8';
const PETAL_UNDER_COLOR = new Color('#FF86D8');
const FLOWER_CENTRE = '#FFD95A';
const WATER = '#8FD3F0';
const HOPPER = '#7CCB3A';
const HOPPER_BELLY = '#B8E07A';
const HOPPER_LEG = '#6CBA32';
const HOPPER_FEELER = '#4E8A2A';
const WING = '#FFD95A';
const WING_DOT = '#FFFFFF';
const BUTTERFLY_BODY = '#6B5A8E';
const SEED = '#B08A5A';
const SEED_TOP = '#C49E6C';
const FLUFF = '#FFFFFF';
const FLUFF_STALK = '#EEE8DA';
const SPIDER = '#B9A3E0';
const SPIDER_TOP = '#D2C4EE';
const SPIDER_LEG = '#9F88CF';
const WEB_RAIL = '#9AA3AD';
const WEB_SLEEPER = '#6B4E2E';
const WEB_SILK = '#F4F7FF';
const EYE_WHITE = '#FFFFFF';
const EYE_DARK = '#2B3A4A';

let shared: MeshLambertMaterial | null = null;
/** The one material every meadow stand-in shares (colours come from the vertices). */
function material(): MeshLambertMaterial {
  shared ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return shared;
}

let waterShared: MeshPhongMaterial | null = null;
/**
 * The water strip's own material: see-through and a little glossy. It does not write depth, so strips laid
 * overlapping into a stream blend evenly instead of flickering where they overlap.
 */
function waterMaterial(): MeshPhongMaterial {
  waterShared ??= new MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    shininess: 40,
    specular: new Color('#3A4A55'),
  });
  return waterShared;
}

type Vec = readonly [number, number, number];
/** A fixed colour, or a colour from the part's own (not yet placed) vertex position. */
type Paint = string | ((p: Vector3) => Color);
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

/**
 * One part of a model: non-indexed, no uv, painted with vertex colours in its own space, then scaled, turned and
 * moved into place. Every part has the same attributes, so any set of them merges.
 */
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
  const scale = typeof s === 'number' ? new Vector3(s, s, s) : v3(s);
  const rot = place.rot ?? [0, 0, 0];
  const q = place.quat ?? new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], place.order ?? 'XYZ'));
  g.applyMatrix4(new Matrix4().compose(v3(place.at ?? [0, 0, 0]), q, scale));
  return g;
}

/** Reverses every triangle (for a geometry whose faces point inward). */
function flipWinding(g: BufferGeometry): void {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k;
        const i2 = (t + 2) * n + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
    a.needsUpdate = true;
  }
}

/** The same part on the other side (x → −x), its triangles turned so they still face outward. */
function mirrorX(source: BufferGeometry): BufferGeometry {
  const g = source.clone();
  g.applyMatrix4(new Matrix4().makeScale(-1, 1, 1));
  flipWinding(g);
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
const DOWN = new Vector3(0, -1, 0);

/** Two triangles: a thin flat strip from `a` to `b` (both at the same height), `width` wide. */
function flatBar(a: Vector3, b: Vector3, width: number): Vector3[][] {
  const along = b.clone().sub(a).normalize();
  const side = new Vector3(-along.z, 0, along.x).multiplyScalar(width / 2);
  const p = [a.clone().add(side), b.clone().add(side), b.clone().sub(side), a.clone().sub(side)];
  return [
    [p[0], p[1], p[2]],
    [p[0], p[2], p[3]],
  ];
}

/** A round tube along a gentle curve through `a`, `bend`, `b` (open ends: tuck them into other parts). */
function tube(a: Vec, bend: Vec, b: Vec, radius: number, segments: number, sides: number): BufferGeometry {
  return new TubeGeometry(new QuadraticBezierCurve3(v3(a), v3(bend), v3(b)), segments, radius, sides, false);
}

/** Turns +Y onto the direction from `a` to `b` (for a cylinder or box laid between two points). */
function alongY(a: Vector3, b: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
}

/** A double-sided flat disc in the XZ plane (top and bottom faces), for wings and wing dots. */
function flatDisc(radius: number, segments: number): BufferGeometry[] {
  const ring = (i: number, y: number): Vector3 =>
    new Vector3(Math.cos((i / segments) * Math.PI * 2) * radius, y, Math.sin((i / segments) * Math.PI * 2) * radius);
  const top: Vector3[][] = [];
  const bottom: Vector3[][] = [];
  for (let i = 0; i < segments; i++) {
    top.push([new Vector3(), ring(i, 0), ring(i + 1, 0)]);
    bottom.push([new Vector3(), ring(i, 0), ring(i + 1, 0)]);
  }
  return [triangles(top, UP), triangles(bottom, DOWN)];
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('meadow placeholder: parts do not merge');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function namedMesh(name: string, parts: BufferGeometry[], mat: Material = material()): Mesh {
  const mesh = new Mesh(merge(parts), mat);
  mesh.name = name;
  return mesh;
}

/** A static model: one merged mesh. */
function solid(name: string, parts: BufferGeometry[], mat?: Material): Group {
  const g = new Group();
  g.add(namedMesh(name, parts, mat));
  return g;
}

/**
 * A tall grass blade, 3 × 38 × 1.5 m: a thin four-sided blade (ridge in front and behind) that narrows to a tip
 * and bends a little towards +Z. Darker at the root, lighter at the tip.
 */
function grassBlade(): Group {
  const H = 38;
  const RINGS = 7;
  const BEND = 1.1;
  const halfWidth = (t: number): number => (t < 0.2 ? 1.3 + t : 1.5 * (1 - Math.pow((t - 0.2) / 0.8, 1.4)));
  const rings: Vector3[][] = [];
  for (let j = 0; j < RINGS; j++) {
    const t = j / RINGS;
    const w = halfWidth(t);
    const d = 0.3 * (1 - t) + 0.04;
    const y = H * t;
    const z = BEND * t * t;
    rings.push([new Vector3(-w, y, z), new Vector3(0, y, z + d), new Vector3(w, y, z), new Vector3(0, y, z - d)]);
  }
  const tip = new Vector3(0, H, BEND);
  const sides: Vector3[][] = [];
  for (let j = 0; j < RINGS - 1; j++) {
    for (let k = 0; k < 4; k++) {
      const a = rings[j][k];
      const b = rings[j][(k + 1) % 4];
      const c = rings[j + 1][(k + 1) % 4];
      const d = rings[j + 1][k];
      sides.push([a, b, c], [a, c, d]);
    }
  }
  const last = rings[RINGS - 1];
  for (let k = 0; k < 4; k++) sides.push([last[k], last[(k + 1) % 4], tip]);
  // The blade is thin and bent: each side faces away from the blade's centre line at its own height.
  const blade = triangles(sides, (c) => c.clone().sub(new Vector3(0, c.y, BEND * (c.y / H) ** 2)));
  const base = rings[0];
  const foot = triangles(
    [
      [base[0], base[1], base[2]],
      [base[0], base[2], base[3]],
    ],
    DOWN,
  );
  const paint: Paint = (p) => mix(GRASS_ROOT, GRASS_TIP, p.y / H);
  return solid('grass-blade', [part(blade, paint), part(foot, paint)]);
}

/**
 * A clover: round leaves (a little longer than wide) around a short stem, flat on top so track and stations can
 * sit on it, each leaf with a pale V. `rim` lightens each leaf towards its edge (the four-leaf record).
 */
function clover(
  name: string,
  leaves: number,
  extent: number,
  height: number,
  leaf: string,
  mark: string,
  rim: string | null,
): Group {
  const r = extent / 2.05;
  const d = 0.9 * r;
  const thick = Math.max(0.24, 0.08 * r);
  const top = height - 0.03;
  const parts: BufferGeometry[] = [];
  const paintLeaf: Paint = rim ? (p) => mix(leaf, rim, ramp(Math.hypot(p.x / 1.15, p.z) / r, 0.45, 1)) : leaf;
  const segments = leaves === 3 ? 18 : 16;
  for (let i = 0; i < leaves; i++) {
    const a = Math.PI / 2 + (i / leaves) * Math.PI * 2;
    const cx = Math.cos(a) * d;
    const cz = Math.sin(a) * d;
    // Scale first (longer along the leaf's own X), then turn X to point away from the stem.
    const leafGeo = new CylinderGeometry(r, r, thick, segments);
    leafGeo.scale(1.15, 1, 1);
    parts.push(part(leafGeo, paintLeaf, { at: [cx, top - thick / 2, cz], rot: [0, -a, 0] }));
    // The pale V, its point towards the stem, just above the leaf.
    const along = new Vector3(Math.cos(a), 0, Math.sin(a));
    const across = new Vector3(-along.z, 0, along.x);
    const centre = new Vector3(cx, top + 0.02, cz);
    const apex = centre.clone().addScaledVector(along, -0.35 * r);
    const bar: Vector3[][] = [];
    for (const side of [-1, 1]) {
      const end = centre.clone().addScaledVector(along, 0.35 * r).addScaledVector(across, side * 0.5 * r);
      bar.push(...flatBar(apex, end, 0.14 * r));
    }
    parts.push(part(triangles(bar, UP), mark));
  }
  const stemH = top - thick + 0.05;
  parts.push(part(new CylinderGeometry(0.12 * r, 0.16 * r, stemH, 6, 1, true), CLOVER_STEM, { at: [0, stemH / 2, 0] }));
  // Three leaves reach further forward than back: centre the footprint on the origin (stations sit on it).
  const g = solid(name, parts);
  const geometry = (g.children[0] as Mesh).geometry;
  const box = geometry.boundingBox!;
  geometry.translate(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return g;
}

/**
 * A meadow flower, 12 × 30 × 12 m: a thin stem with two leaves, a green cup, five round pink petals tipped up a
 * little and a domed yellow middle whose top is exactly 30 m (meadow.ts scales it by height / 30).
 */
function meadowFlower(): Group {
  const H = 30;
  const parts: BufferGeometry[] = [];
  const stemTop = H - 1.8;
  parts.push(part(new CylinderGeometry(0.42, 0.58, stemTop, 6, 1, true), FLOWER_STEM, { at: [0, stemTop / 2, 0] }));
  for (const [y, side] of [
    [9, 1],
    [15, -1],
  ] as const) {
    parts.push(
      part(new SphereGeometry(1, 6, 3), FLOWER_LEAF, {
        at: [side * 3.1, y, 0],
        rot: [0, 0, side * 0.35],
        scale: [3.4, 0.28, 1.3],
      }),
    );
  }
  parts.push(part(new CylinderGeometry(1.7, 0.5, 1.4, 8, 1, true), FLOWER_STEM, { at: [0, stemTop + 0.4, 0] }));
  const petalR = 2.6;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i / 5) * Math.PI * 2;
    const d = 3.1;
    const petal = new CylinderGeometry(petalR, petalR, 0.45, 10);
    petal.scale(1.15, 1, 1);
    parts.push(
      // Seen from the train the petals show their undersides, lit only by the greenish ground light: a stronger,
      // bluer pink there keeps them reading pink rather than brown.
      part(petal, (p) => (p.y < 0 ? PETAL_UNDER_COLOR : mix(PETAL_INNER, PETAL, ramp(p.x, -petalR, 0))), {
        at: [Math.cos(a) * d, H - 1.05, Math.sin(a) * d],
        rot: [0, -a, 0.24],
        order: 'YZX',
      }),
    );
  }
  parts.push(part(new SphereGeometry(1, 8, 4), FLOWER_CENTRE, { at: [0, H - 1.2, 0], scale: [2.1, 1.2, 2.1] }));
  return solid('meadow-flower', parts);
}

/**
 * A flat water strip, 60 × 0.1 × 40 m with rounded corners: laid (and scaled) side by side it makes a stream or a
 * puddle. Top and rim only (it lies on the ground). Its own see-through material.
 */
function waterStrip(): Group {
  const HX = 30;
  const HZ = 20;
  const R = 7;
  const TOP = 0.1;
  const outline: [number, number][] = [];
  const corners: [number, number, number][] = [
    [HX - R, HZ - R, 0],
    [-(HX - R), HZ - R, Math.PI / 2],
    [-(HX - R), -(HZ - R), Math.PI],
    [HX - R, -(HZ - R), (Math.PI * 3) / 2],
  ];
  for (const [cx, cz, start] of corners) {
    for (let k = 0; k <= 2; k++) {
      const t = start + (k / 2) * (Math.PI / 2);
      outline.push([cx + Math.cos(t) * R, cz + Math.sin(t) * R]);
    }
  }
  const list: Vector3[][] = [];
  const topFaces: Vector3[][] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i];
    const [x1, z1] = outline[(i + 1) % outline.length];
    topFaces.push([new Vector3(0, TOP, 0), new Vector3(x0, TOP, z0), new Vector3(x1, TOP, z1)]);
    const a = new Vector3(x0, 0, z0);
    const b = new Vector3(x1, 0, z1);
    const c = new Vector3(x1, TOP, z1);
    const d = new Vector3(x0, TOP, z0);
    list.push([a, b, c], [a, c, d]);
  }
  return solid(
    'water-strip',
    [part(triangles(topFaces, UP), WATER), part(triangles(list, awayFrom(new Vector3(0, TOP / 2, 0))), WATER)],
    waterMaterial(),
  );
}

/** Paints a unit sphere green on top and pale underneath (a belly). */
const belly =
  (top: string, under: string, from = -0.05, to = -0.6): Paint =>
  (p) =>
    mix(top, under, ramp(p.y, from, to));

/**
 * A grasshopper, 1.6 × 1.6 × 4 m, bright green with a pale belly, big eyes, two feelers and long bent hind legs.
 * Origin at the bottom centre, head towards +Z. Parts (for meadow.ts):
 * - `body` at the origin (abdomen, back, four small legs)
 * - `head` pivots at the neck; rotation.x > 0 tips it down. Its children `antenna-left` (+X) and `antenna-right`
 *   (−X) pivot at their base on the head, so rotating them about X or Z waves them (and they follow the head)
 * - `leg-left` (+X) and `leg-right` (−X), the big hind legs, pivot at the hip; rotation.x < 0 swings them down
 *   and back (the kick)
 */
function grasshopper(): Group {
  const g = new Group();
  const skin = belly(HOPPER, HOPPER_BELLY);

  const body: BufferGeometry[] = [
    part(new SphereGeometry(1, 10, 6), skin, { at: [0, 0.74, -0.52], scale: [0.42, 0.4, 1.4] }),
    part(new SphereGeometry(1, 9, 6), skin, { at: [0, 0.86, 0.55], scale: [0.46, 0.46, 0.56] }),
  ];
  // Front and middle legs: short bent tubes from under the body to the ground.
  const small: [Vec, Vec, Vec][] = [
    [
      [0.22, 0.6, 0.8],
      [0.55, 0.62, 1.05],
      [0.55, 0.04, 1.15],
    ],
    [
      [0.26, 0.55, 0.3],
      [0.66, 0.55, 0.3],
      [0.7, 0.04, 0.05],
    ],
  ];
  for (const [a, bend, b] of small) {
    const leg = part(tube(a, bend, b, 0.06, 3, 4), HOPPER_LEG);
    body.push(leg, mirrorX(leg));
  }
  g.add(namedMesh('body', body));

  // Head: pivot at the neck, the head itself forward of it.
  const head = namedMesh('head', [
    part(new SphereGeometry(1, 9, 6), belly(HOPPER, HOPPER_BELLY, -0.2, -0.8), {
      at: [0, 0.08, 0.3],
      scale: [0.4, 0.46, 0.42],
    }),
    ...[1, -1].flatMap((side) => [
      part(new SphereGeometry(0.2, 8, 5), EYE_WHITE, { at: [side * 0.25, 0.2, 0.5] }),
      part(new SphereGeometry(0.115, 6, 4), EYE_DARK, { at: [side * 0.29, 0.22, 0.63] }),
    ]),
  ]);
  head.position.set(0, 0.95, 1.0);
  g.add(head);

  // Feelers: from the top front of the head, up and forward, each with a round tip.
  const feeler = [
    part(tube([0, 0, 0], [0.04, 0.2, 0.12], [0.22, 0.15, 0.42], 0.035, 4, 3), HOPPER_FEELER),
    part(new SphereGeometry(0.07, 5, 3), HOPPER_FEELER, { at: [0.22, 0.15, 0.42] }),
  ];
  const feelerRight = feeler.map(mirrorX);
  for (const [name, side, parts] of [
    ['antenna-left', 1, feeler],
    ['antenna-right', -1, feelerRight],
  ] as const) {
    const antenna = namedMesh(name, parts);
    antenna.position.set(side * 0.12, 0.44, 0.52);
    head.add(antenna);
  }

  // Hind legs: a thick thigh from the hip up and back to a high knee, a thin shin down and forward to the foot.
  const hip = new Vector3(0, 0, 0);
  const knee = new Vector3(0.3, 0.5, -1.4);
  const foot = new Vector3(0.34, -0.64, -0.95);
  const thigh = knee.clone().sub(hip);
  const legLeft = [
    part(new SphereGeometry(1, 8, 5), HOPPER_LEG, {
      at: [thigh.x * 0.48, thigh.y * 0.48, thigh.z * 0.48],
      quat: alongY(hip, knee),
      scale: [0.16, thigh.length() * 0.54, 0.15],
    }),
    part(new SphereGeometry(0.12, 6, 4), HOPPER_LEG, { at: [knee.x, knee.y, knee.z] }),
    part(tube([knee.x, knee.y, knee.z], [0.36, -0.1, -1.25], [foot.x, foot.y, foot.z], 0.065, 3, 4), HOPPER_LEG),
    part(new SphereGeometry(0.1, 5, 3), HOPPER_LEG, { at: [foot.x, foot.y, foot.z] }),
  ];
  const legRight = legLeft.map(mirrorX);
  for (const [name, side, parts] of [
    ['leg-left', 1, legLeft],
    ['leg-right', -1, legRight],
  ] as const) {
    const leg = namedMesh(name, parts);
    leg.position.set(side * 0.38, 0.74, -0.22);
    g.add(leg);
  }
  return g;
}

/**
 * A butterfly, 4 × 0.6 × 2.5 m: four round yellow wings with white dots, a small purple body with feelers and
 * eyes only. Origin at the body's centre, head towards +Z. `wing-left` (+X) and `wing-right` (−X) have their
 * origin on the body's centre line, so rotation.z flaps them (left: > 0 lifts it; right: < 0 lifts it). At
 * rotation 0 the wings rise a little outward.
 */
function butterfly(): Group {
  const g = new Group();
  const body = namedMesh('body', [
    part(new SphereGeometry(1, 6, 4), BUTTERFLY_BODY, { at: [0, 0, -0.1], scale: [0.13, 0.13, 0.62] }),
    part(new SphereGeometry(0.17, 6, 4), BUTTERFLY_BODY, { at: [0, 0.03, 0.62] }),
    ...[1, -1].flatMap((side) => [
      part(new SphereGeometry(0.075, 4, 3), EYE_WHITE, { at: [side * 0.09, 0.08, 0.73] }),
      part(new SphereGeometry(0.04, 4, 2), EYE_DARK, { at: [side * 0.1, 0.09, 0.8] }),
      part(tube([side * 0.05, 0.14, 0.7], [side * 0.1, 0.32, 0.85], [side * 0.22, 0.3, 1.1], 0.018, 2, 3), BUTTERFLY_BODY),
      part(new SphereGeometry(0.045, 4, 2), BUTTERFLY_BODY, { at: [side * 0.22, 0.3, 1.1] }),
    ]),
  ]);
  g.add(body);

  // Left wing flat in the XZ plane: a big front wing and a smaller back wing, each with a white dot on both faces.
  const DIHEDRAL = 0.16;
  const wingParts = (): BufferGeometry[] => {
    const out: BufferGeometry[] = [];
    const disc = (r: number, seg: number, at: Vec, scale: Vec, color: string, lift: number): void => {
      const [topFace, bottomFace] = flatDisc(r, seg);
      out.push(part(topFace, color, { at: [at[0], at[1] + lift, at[2]], scale }));
      out.push(part(bottomFace, color, { at: [at[0], at[1] - lift, at[2]], scale }));
    };
    disc(0.95, 10, [1.02, 0, 0.45], [1.05, 1, 0.9], WING, 0);
    disc(0.7, 10, [0.8, 0, -0.58], [1, 1, 1], WING, 0.004);
    disc(0.26, 6, [1.3, 0, 0.5], [1, 1, 1], WING_DOT, 0.02);
    disc(0.18, 6, [0.98, 0, -0.7], [1, 1, 1], WING_DOT, 0.024);
    return out.map((geo) => geo.applyMatrix4(new Matrix4().makeRotationZ(DIHEDRAL)));
  };
  const left = wingParts();
  const right = left.map(mirrorX);
  g.add(namedMesh('wing-left', left));
  g.add(namedMesh('wing-right', right));
  return g;
}

/**
 * A dandelion seed, 6 × 8 × 6 m: a brown seed at the bottom, a thin stalk, and on top an umbrella of fine white
 * threads with a small tuft at each end. Sakasa holds on to the stalk to fly away.
 */
function dandelionSeed(): Group {
  const parts: BufferGeometry[] = [];
  const seed: Paint = (p) => mix(SEED_TOP, SEED, ramp(p.y, 0.6, -0.4));
  parts.push(part(new SphereGeometry(1, 8, 5), seed, { at: [0, 0.9, 0], scale: [0.36, 0.9, 0.36] }));
  const hubY = 6.1;
  const stalk = new CylinderGeometry(0.07, 0.09, hubY - 1.6, 4, 1, true);
  parts.push(part(stalk, FLUFF_STALK, { at: [0, (hubY + 1.6) / 2, 0] }));
  parts.push(part(new SphereGeometry(0.24, 6, 4), FLUFF, { at: [0, hubY, 0] }));
  const THREADS = 14;
  const hub = new Vector3(0, hubY, 0);
  for (let i = 0; i < THREADS; i++) {
    const a = (i / THREADS) * Math.PI * 2 + (i % 2) * 0.12;
    const reach = i % 2 ? 2.55 : 2.8;
    const tip = new Vector3(Math.cos(a) * reach, hubY + (i % 2 ? 1.65 : 1.45), Math.sin(a) * reach);
    const length = tip.distanceTo(hub);
    parts.push(
      part(new CylinderGeometry(0.045, 0.045, length, 3, 1, true), FLUFF, {
        at: [(hub.x + tip.x) / 2, (hub.y + tip.y) / 2, (hub.z + tip.z) / 2],
        quat: alongY(hub, tip),
      }),
    );
    parts.push(part(new IcosahedronGeometry(0.3, 0), FLUFF, { at: [tip.x, tip.y, tip.z], scale: [1, 0.7, 1] }));
  }
  return solid('dandelion-seed', parts);
}

/**
 * A spider, 3 × 2.5 × 3 m: a round, soft lilac body (lighter on top), a round head with two big eyes, and eight
 * short round legs arching to the ground. No fangs, spikes or bristles. Faces +Z.
 */
function spider(): Group {
  const parts: BufferGeometry[] = [];
  const fur: Paint = (p) => mix(SPIDER, SPIDER_TOP, ramp(p.y, 0, 0.9));
  parts.push(part(new SphereGeometry(1, 10, 6), fur, { at: [0, 1.2, -0.45], scale: [1.08, 1, 1.1] }));
  // Two soft tufts on the back make it look fluffy.
  parts.push(part(new SphereGeometry(0.38, 6, 4), SPIDER_TOP, { at: [0.25, 2.08, -0.6] }));
  parts.push(part(new SphereGeometry(0.32, 6, 4), SPIDER_TOP, { at: [-0.3, 2.02, -0.25] }));
  parts.push(part(new SphereGeometry(0.72, 8, 6), SPIDER, { at: [0, 0.85, 0.62] }));
  for (const side of [1, -1]) {
    parts.push(part(new SphereGeometry(0.27, 7, 4), EYE_WHITE, { at: [side * 0.25, 1.07, 1.15] }));
    parts.push(part(new SphereGeometry(0.14, 6, 3), EYE_DARK, { at: [side * 0.28, 1.1, 1.35] }));
  }
  const hips = [0.78, 0.32, -0.2, -0.7];
  const feet: [number, number][] = [
    [1.2, 1.22],
    [1.36, 0.45],
    [1.36, -0.45],
    [1.2, -1.25],
  ];
  for (let i = 0; i < 4; i++) {
    const [fx, fz] = feet[i];
    const hip: Vec = [0.55, 0.8, hips[i]];
    const foot: Vec = [fx, 0.15, fz];
    const bend: Vec = [fx, 1.3, (hip[2] + fz) / 2];
    const leg = [
      part(tube(hip, bend, foot, 0.14, 3, 5), SPIDER_LEG),
      part(new SphereGeometry(0.16, 5, 3), SPIDER_LEG, { at: [fx, 0.16, fz] }),
    ];
    for (const p of leg) parts.push(p, mirrorX(p));
  }
  return solid('spider', parts);
}

/**
 * A spider web made of track, 36 × 36 × 1 m, standing up in the XY plane and seen from +Z: eight spokes of
 * steel rails on sleepers (the train's own track, so it reads as "rails") and a white silk spiral of four turns.
 * Origin at the lowest point (the tip of the bottom spoke).
 */
function railWeb(): Group {
  const R = 18;
  const HUB = 2.8;
  const cy = R;
  const parts: BufferGeometry[] = [];
  /** A box from `a` to `b` (in the web's plane), `width` across in the plane and `depth` along Z at `z`. */
  const bar = (a: Vector3, b: Vector3, width: number, depth: number, z: number, color: string): void => {
    const len = a.distanceTo(b);
    parts.push(
      part(new BoxGeometry(width, len, depth), color, {
        at: [(a.x + b.x) / 2, (a.y + b.y) / 2, z],
        quat: alongY(a, b),
      }),
    );
  };
  const at = (angle: number, r: number, offset = 0): Vector3 =>
    new Vector3(Math.cos(angle) * r - Math.sin(angle) * offset, cy + Math.sin(angle) * r + Math.cos(angle) * offset, 0);
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2;
    for (const offset of [-0.75, 0.75]) bar(at(angle, HUB, offset), at(angle, R, offset), 0.2, 0.22, 0.09, WEB_RAIL);
    for (let r = HUB + 0.9; r < R - 0.4; r += 1.8) {
      bar(at(angle, r, -1.2), at(angle, r, 1.2), 0.4, 0.16, -0.1, WEB_SLEEPER);
    }
  }
  // The spiral: four turns from near the hub to near the rim, a straight thread between each pair of spokes.
  const TURNS = 4;
  const r0 = 4.6;
  const r1 = 17.2;
  const steps = TURNS * 8;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    bar(at(a0, r0 + ((r1 - r0) * i) / steps), at(a1, r0 + ((r1 - r0) * (i + 1)) / steps), 0.24, 0.2, 0, WEB_SILK);
  }
  parts.push(part(new CylinderGeometry(HUB, HUB, 0.36, 8), WEB_SILK, { at: [0, cy, 0.02], rot: [Math.PI / 2, 0, 0] }));
  return solid('rail-web', parts);
}

const BUILDERS: Record<string, () => Group> = {
  'grass-blade': grassBlade,
  clover: () => clover('clover', 3, 8.1, 1.5, CLOVER, CLOVER_MARK, null),
  'clover-four': () => clover('clover-four', 4, 4, 1.2, CLOVER_FOUR, CLOVER_FOUR_MARK, CLOVER_FOUR_RIM),
  'meadow-flower': meadowFlower,
  'water-strip': waterStrip,
  grasshopper,
  butterfly,
  'dandelion-seed': dandelionSeed,
  spider,
  'rail-web': railWeb,
};

/** The names this module draws (ticket 0008). */
export const MEADOW_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the meadow set. */
export function buildMeadowPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
