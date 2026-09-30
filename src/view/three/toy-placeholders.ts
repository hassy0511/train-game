import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp01, eyes, glowMaterial, hash, kitMaterial, merge, mix, part, solid } from './placeholder-kit';

/**
 * Stand-ins drawn in code for the toy town (ticket 0019「おもちゃの まち セット」, PHASE9_CHAPTER5_6 第 5 部 §8) until
 * their models are built: the block houses, the screw lamp posts and the big screw tower, the reverse-wound toys (a
 * chick and a car, each "-back" before it is wound), the toy band (five players), the spinning fork's turntable, flag
 * and star, the ball pit, the toy box's open lid, the toy slide's sign, the toy castle and its big key, the block folk
 * watching, Sakasa's little block train, the paper planes, the shelf and the loose blocks of the third record, and the
 * three records. Origin at the bottom centre (the records and keys too), +Z forward (the way the toys and the band go);
 * one merged mesh per model in the shared vertex-coloured material (the spinning fork's flag has a material of its own
 * the game tints; the marble glows a little).
 * Faces are two small dark eyes only (the chick also a short beak; no mouth). The car, the block train and the fork have
 * no face. The band wears soft berets and mint jackets (not a soldier's, a nutcracker's or a guard's: no tall hats, no
 * red coats, no white sashes); the block folk are plain pegs (no studs, no C hands); nothing like a known toy, train or
 * castle.
 */
const PINK = '#FF8FC8';
const PINK_DEEP = '#E0569F';
const GOLD = '#C9A227';
const GOLD_LIGHT = '#E5B93C';
const SILVER = '#C9D3DC';
const SILVER_LIGHT = '#E8EDF2';
const WINDOW = '#FFE27A';
const CREAM = '#FFF1D6';
const MINT = '#7FD8BE';
const BERET = '#6C8CFF';
const DARK = '#3A3A4A';
const WOOD = '#D9A86C';
const WOOD_DARK = '#B7874E';

const ball = (r: number, w = 10, h = 7): SphereGeometry => new SphereGeometry(r, w, h);
const cyl = (r0: number, r1: number, h: number, n = 10): CylinderGeometry => new CylinderGeometry(r0, r1, h, n);

/** A pink swirl (Sakasa's mark) as a flat spiral of little quads at depth z facing +Z, centred (cx, cy), `r` round. */
function swirl(cx: number, cy: number, z: number, r: number): BufferGeometry {
  const pts: number[] = [];
  const turns = 2.2;
  const n = 26;
  const w = r * 0.14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * turns * Math.PI * 2;
    const a1 = ((i + 1) / n) * turns * Math.PI * 2;
    const r0 = (r * (i + 1)) / n;
    const r1 = (r * (i + 2)) / n;
    const p = (a: number, rr: number): [number, number] => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    const [ax, ay] = p(a0, r0 - w / 2);
    const [bx, by] = p(a0, r0 + w / 2);
    const [cx1, cy1] = p(a1, r1 + w / 2);
    const [dx, dy] = p(a1, r1 - w / 2);
    pts.push(ax, ay, z, bx, by, z, cx1, cy1, z, ax, ay, z, cx1, cy1, z, dx, dy, z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return part(g, PINK_DEEP);
}

/**
 * A wind-up key (two loops on a short shaft) `s` times 0.6 × 0.6 × 0.1 m, standing up at `at` with its loops in the XY
 * plane; `back`: Sakasa's pink swirl on its hub.
 */
function keyParts(at: [number, number, number], s: number, color: string, back: boolean, rotY = 0): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const c = Math.cos(rotY);
  const sn = Math.sin(rotY);
  const place = (p: [number, number, number]): [number, number, number] => [at[0] + (p[0] * c + p[2] * sn) * s, at[1] + p[1] * s, at[2] + (-p[0] * sn + p[2] * c) * s];
  for (const side of [-1, 1]) {
    out.push(part(new TorusGeometry(0.13 * s, 0.035 * s, 5, 10), color, { at: place([side * 0.17, 0.42, 0]), rot: [0, rotY, 0] }));
  }
  out.push(part(new BoxGeometry(0.14 * s, 0.14 * s, 0.1 * s), color, { at: place([0, 0.42, 0]), rot: [0, rotY, 0] }));
  out.push(part(cyl(0.035 * s, 0.035 * s, 0.35 * s, 6), color, { at: place([0, 0.22, 0]) }));
  if (back) out.push(part(ball(0.06 * s, 6, 4), PINK, { at: place([0, 0.42, 0.06]) }));
  return out;
}

// ---- the town ----------------------------------------------------------------------------------------------------

/** "block-house-a", 8 × 10 × 8 m: a yellow block with a red pyramid roof and round yellow windows. */
function blockHouseA(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(8, 7, 8), '#F6D365', { at: [0, 3.5, 0] }));
  parts.push(part(new ConeGeometry(6, 3.2, 4), '#EF6F6C', { at: [0, 8.6, 0], rot: [0, Math.PI / 4, 0] }));
  for (const [x, y] of [
    [-2, 4.8],
    [2, 4.8],
    [0, 1.6],
  ] as const) {
    parts.push(part(cyl(0.7, 0.7, 0.15, 10), y < 2 ? '#B7874E' : WINDOW, { at: [x, y, 4.05], rot: [Math.PI / 2, 0, 0] }));
  }
  return solid('block-house-a', parts);
}

/** "block-house-b", 6 × 12 × 6 m: a blue round block with a mint cone roof. */
function blockHouseB(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(3, 3, 8, 12), '#8FD3F4', { at: [0, 4, 0] }));
  parts.push(part(new ConeGeometry(3.4, 4, 12), '#7FD8BE', { at: [0, 10, 0] }));
  for (const y of [2.2, 5.2]) parts.push(part(cyl(0.6, 0.6, 0.15, 10), WINDOW, { at: [0, y, 3.02], rot: [Math.PI / 2, 0, 0] }));
  return solid('block-house-b', parts);
}

/** "block-house-c", 12 × 8 × 4 m: a pink block arch (two pillars, a lintel and a half-round top). */
function blockHouseC(): Group {
  const parts: BufferGeometry[] = [];
  for (const x of [-4.5, 4.5]) parts.push(part(new BoxGeometry(3, 5, 4), '#F7A8C4', { at: [x, 2.5, 0] }));
  parts.push(part(new BoxGeometry(12, 1.6, 4), '#EF6F6C', { at: [0, 5.8, 0] }));
  parts.push(part(cyl(2.2, 2.2, 4, 10, ), '#F6D365', { at: [0, 6.6, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(cyl(0.6, 0.6, 0.15, 10), WINDOW, { at: [-4.5, 3, 2.05], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(cyl(0.6, 0.6, 0.15, 10), WINDOW, { at: [4.5, 3, 2.05], rot: [Math.PI / 2, 0, 0] }));
  return solid('block-house-c', parts);
}

/** "screw-post", 1.2 × 8 × 1.2 m: a silver screw standing up as a lamp post (a thread of stripes, a flat head, a lamp). */
function screwPost(): Group {
  const parts: BufferGeometry[] = [];
  const thread = (p: Vector3): Color => {
    const a = Math.atan2(p.z, p.x) / (Math.PI * 2);
    return (((p.y / 0.5 + a) % 1) + 1) % 1 < 0.35 ? new Color('#9AA6B2') : new Color(SILVER);
  };
  parts.push(part(cyl(0.28, 0.32, 6.8, 10), thread, { at: [0, 3.4, 0] }));
  parts.push(part(cyl(0.6, 0.6, 0.4, 12), SILVER_LIGHT, { at: [0, 7.0, 0] }));
  parts.push(part(new BoxGeometry(0.9, 0.08, 0.14), '#8A96A2', { at: [0, 7.22, 0] }));
  parts.push(part(ball(0.34, 10, 7), WINDOW, { at: [0, 7.6, 0] }));
  return solid('screw-post', parts);
}

/** "screw-tower", 24 × 32 × 24 m: the big screw in the middle of the spiral (a thread wound round it, a crossed head). */
function screwTower(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(7, 8, 26, 16), (p) => mix('#AEB8C2', SILVER, clamp01((p.y + 13) / 26)), { at: [0, 13, 0] }));
  const turns = 5;
  const n = 70;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const y = 1 + t * 24;
    const r = 8.2 - t * 0.9;
    parts.push(part(new BoxGeometry(1.2, 0.7, 2.6), SILVER_LIGHT, { at: [Math.cos(a) * r, y, Math.sin(a) * r], rot: [0, -a, 0.2] }));
  }
  parts.push(part(cyl(12, 12, 5, 18), '#D9E1E8', { at: [0, 28.5, 0] }));
  parts.push(part(new BoxGeometry(18, 0.6, 2.2), '#8A96A2', { at: [0, 31.2, 0] }));
  parts.push(part(new BoxGeometry(2.2, 0.6, 18), '#8A96A2', { at: [0, 31.2, 0] }));
  return solid('screw-tower', parts);
}

/** "windup-key", 0.6 × 0.6 × 0.1 m: a gold wind-up key (the toys and the band carry one on the back). */
function windupKey(): Group {
  return solid('windup-key', keyParts([0, 0, 0], 1, GOLD, false));
}

// ---- the reverse-wound toys ---------------------------------------------------------------------------------------

/**
 * "windup-chick" / "windup-chick-back", 0.9 × 1.1 × 1.0 m: a round yellow chick (two dark eyes, a short orange beak, no
 * mouth), a gold key on its back. The "-back" one leans back (it walks backwards) and its key has Sakasa's pink swirl.
 */
function windupChick(back: boolean): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    const lean = back ? -0.25 : 0;
    parts.push(part(ball(1, 12, 8), (p) => mix('#F2C230', '#FFD84D', clamp01(p.y + 0.6)), { at: [0, 0.45, 0], scale: [0.4, 0.38, 0.42] }));
    parts.push(part(ball(0.27, 10, 7), '#FFD84D', { at: [0, 0.88, 0.12 + lean * 0.3] }));
    parts.push(part(new ConeGeometry(0.07, 0.16, 6), '#FF9A3C', { at: [0, 0.86, 0.43 + lean * 0.3], rot: [Math.PI / 2, 0, 0] }));
    parts.push(...eyes(0.1, 0.95, 0.35 + lean * 0.3, 0.035));
    for (const side of [-1, 1]) {
      parts.push(part(ball(1, 7, 5), '#F2C230', { at: [side * 0.38, 0.5, -0.02], scale: [0.08, 0.18, 0.22], rot: [0, 0, side * 0.3] }));
      parts.push(part(new BoxGeometry(0.12, 0.05, 0.2), '#FF9A3C', { at: [side * 0.13, 0.03, 0.05] }));
    }
    parts.push(...keyParts([0, 0.35, -0.44], 0.9, GOLD, back));
    const g = solid(back ? 'windup-chick-back' : 'windup-chick', parts);
    // Leaning back as it walks backwards (the lean is in the geometry: the model moves as a whole).
    if (back) {
      const geometry = (g.children[0] as Mesh).geometry;
      geometry.rotateX(-0.18);
      geometry.computeBoundingBox();
      geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
    return g;
  };
}

/**
 * "windup-car" / "windup-car-back", 1.4 × 1.0 × 3.0 m: a long light blue car on four small wheels of the same size, a
 * big gold key on its roof. No face, not round and stubby (not like a known little wind-up car). "-back": the pink swirl.
 */
function windupCar(back: boolean): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    parts.push(part(new BoxGeometry(1.3, 0.45, 2.9), '#6EC6FF', { at: [0, 0.42, 0] }));
    parts.push(part(new BoxGeometry(1.1, 0.35, 1.4), '#A8DDFF', { at: [0, 0.82, -0.2] }));
    parts.push(part(new BoxGeometry(1.12, 0.2, 1.2), '#DFF3FF', { at: [0, 0.8, -0.2] }));
    for (const x of [-0.62, 0.62]) {
      for (const z of [-1.0, 1.0]) parts.push(part(cyl(0.2, 0.2, 0.14, 10), DARK, { at: [x, 0.2, z], rot: [0, 0, Math.PI / 2] }));
    }
    parts.push(...keyParts([0, 0.98, -0.2], 1.1, GOLD, back, Math.PI / 2));
    return solid(back ? 'windup-car-back' : 'windup-car', parts);
  };
}

// ---- the toy band -------------------------------------------------------------------------------------------------

/** One player: legs, a round mint jacket, a cream head with two dot eyes, a soft blue beret, a key on the back. */
function playerParts(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  for (const side of [-1, 1]) parts.push(part(cyl(0.1, 0.1, 0.55, 7), '#4A5A8A', { at: [side * 0.14, 0.28, 0] }));
  parts.push(part(cyl(0.32, 0.36, 0.8, 12), MINT, { at: [0, 0.95, 0] }));
  parts.push(part(ball(0.3, 12, 8), CREAM, { at: [0, 1.62, 0] }));
  parts.push(...eyes(0.1, 1.66, 0.26, 0.035));
  parts.push(part(ball(1, 10, 5), BERET, { at: [0.04, 1.86, -0.02], scale: [0.34, 0.1, 0.32], rot: [0, 0, -0.18] }));
  parts.push(part(ball(0.05, 6, 4), BERET, { at: [0.06, 1.97, 0] }));
  for (const side of [-1, 1]) parts.push(part(cyl(0.07, 0.07, 0.5, 6), MINT, { at: [side * 0.38, 1.05, 0.12], rot: [0.9, 0, side * 0.2] }));
  parts.push(...keyParts([0, 0.8, -0.38], 0.8, GOLD, false));
  return parts;
}

function bandMember(name: string, instrument: () => BufferGeometry[]): () => Group {
  return () => solid(name, [...playerParts(), ...instrument()]);
}

const STAR = (cx: number, cy: number, z: number, r: number, color: string): BufferGeometry => {
  const pts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const b = a + Math.PI / 5;
    const c = a - Math.PI / 5;
    pts.push(cx, cy, z, cx + Math.cos(c) * r * 0.45, cy + Math.sin(c) * r * 0.45, z, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z);
    pts.push(cx, cy, z, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, cx + Math.cos(b) * r * 0.45, cy + Math.sin(b) * r * 0.45, z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return part(g, color);
};

/** "band-flag": the flag bearer (a pole and a round yellow flag with a star; no real flag or crest). */
const bandFlag = bandMember('band-flag', () => [
  part(cyl(0.035, 0.035, 2.6, 6), WOOD_DARK, { at: [0.42, 1.3, 0.2] }),
  part(cyl(0.45, 0.45, 0.04, 16), '#F2C14E', { at: [0.42, 2.35, 0.2], rot: [Math.PI / 2, 0, 0] }),
  STAR(0.42, 2.35, 0.23, 0.3, '#EF6F6C'),
]);

/** "band-trumpet": a little yellow trumpet held out in front. */
const bandTrumpet = bandMember('band-trumpet', () => [
  part(cyl(0.04, 0.04, 0.5, 6), '#F2C14E', { at: [0, 1.5, 0.45], rot: [Math.PI / 2, 0, 0] }),
  part(new ConeGeometry(0.14, 0.25, 10, 1, true), '#F2C14E', { at: [0, 1.5, 0.78], rot: [-Math.PI / 2, 0, 0] }),
]);

/** "band-glock": a rainbow glockenspiel held in front at the waist. */
const bandGlock = bandMember('band-glock', () => {
  const colors = ['#EF6F6C', '#F6A04D', '#F2C14E', '#7FD8BE', '#6EC6FF', '#B8A4FF'];
  return colors.map((c, i) => part(new BoxGeometry(0.1, 0.05, 0.4 - i * 0.04), c, { at: [-0.3 + i * 0.12, 1.02, 0.5] }));
});

/** "band-cymbal": two gold cymbals at the sides. */
const bandCymbal = bandMember('band-cymbal', () => [
  part(cyl(0.25, 0.25, 0.03, 12), GOLD_LIGHT, { at: [-0.5, 1.15, 0.2], rot: [0, 0, Math.PI / 2] }),
  part(cyl(0.25, 0.25, 0.03, 12), GOLD_LIGHT, { at: [0.5, 1.15, 0.2], rot: [0, 0, Math.PI / 2] }),
]);

/** "band-drum" (1.4 m wide): a big white drum with red rims carried in front. */
const bandDrum = bandMember('band-drum', () => [
  part(cyl(0.5, 0.5, 0.42, 14), '#FFFFFF', { at: [0, 1.0, 0.55], rot: [0, 0, Math.PI / 2] }),
  part(cyl(0.52, 0.52, 0.06, 14), '#E0474C', { at: [-0.22, 1.0, 0.55], rot: [0, 0, Math.PI / 2] }),
  part(cyl(0.52, 0.52, 0.06, 14), '#E0474C', { at: [0.22, 1.0, 0.55], rot: [0, 0, Math.PI / 2] }),
]);

// ---- the spinning fork --------------------------------------------------------------------------------------------

/** "spin-turntable", 12 × 1 × 12 m: a round block (yellow and blue stripes round it) with three big keys at its side. */
function spinTurntable(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(6, 6, 1, 20), (p) => (Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 10) % 2 ? new Color('#F6D365') : new Color('#8FD3F4')), { at: [0, 0.5, 0] }));
  parts.push(part(cyl(5.4, 5.4, 0.05, 20), '#FFF6E0', { at: [0, 1.02, 0] }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(...keyParts([Math.cos(a) * 6.3, 0, Math.sin(a) * 6.3], 2.2, GOLD, false, -a + Math.PI / 2));
  }
  return solid('spin-turntable', parts);
}

/**
 * "spin-arrow", 1 × 5 × 4 m: a pole with a pointing flag (red; green when it points the good way): the flag points +Z.
 * Its flag is a mesh of its own named "spin-flag" in its own material (the game gives each fork's a copy it tints).
 */
function spinArrow(): Group {
  const g = new Group();
  const pole = new Mesh(merge([part(cyl(0.12, 0.14, 4.6, 8), '#FFF1D6', { at: [0, 2.3, 0] }), part(ball(0.22, 8, 6), '#F6D365', { at: [0, 4.7, 0] })]), kitMaterial());
  pole.name = 'spin-pole';
  const pts: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => {
    pts.push(...a, ...b, ...c, ...a, ...c, ...b);
  };
  // An arrow in the YZ plane: a bar from the pole and a head pointing +Z (both faces).
  tri([0, 3.9, 0], [0, 4.4, 0], [0, 4.4, 2.2]);
  tri([0, 3.9, 0], [0, 4.4, 2.2], [0, 3.9, 2.2]);
  tri([0, 3.5, 2.2], [0, 4.8, 2.2], [0, 4.15, 3.6]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
  geometry.computeVertexNormals();
  const flag = new Mesh(geometry, new MeshLambertMaterial({ color: '#EF6F6C', emissive: '#000000' }));
  flag.name = 'spin-flag';
  g.add(pole, flag);
  return g;
}

/** "spin-star", 2 × 3 × 0.3 m: a star-shaped board on a post (by the good way). */
function spinStar(): Group {
  return solid('spin-star', [
    part(cyl(0.08, 0.08, 1.8, 6), WOOD_DARK, { at: [0, 0.9, 0] }),
    STAR(0, 2.1, 0.08, 0.95, '#F6D365'),
    STAR(0, 2.1, -0.08, 0.95, '#F6D365'),
    part(new BoxGeometry(0.2, 0.2, 0.14), '#F6D365', { at: [0, 2.1, 0] }),
  ]);
}

// ---- the ball pit, the toy box, the slide ------------------------------------------------------------------------

const BALL_COLORS = ['#EF6F6C', '#F6D365', '#7FD8BE', '#6EC6FF', '#B8A4FF', '#FF9FC8'];

/** "ball-pit", 24 × 2.5 × 24 m: a light blue rim round a pit full of coloured balls (under a gap). */
function ballPit(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(24, 0.3, 24), '#CFEFFF', { at: [0, 0.15, 0] }));
  for (const [x, z, w, d] of [
    [0, 11.5, 24, 1],
    [0, -11.5, 24, 1],
    [11.5, 0, 1, 22],
    [-11.5, 0, 1, 22],
  ] as const) {
    parts.push(part(new BoxGeometry(w, 2.5, d), '#8FD3F4', { at: [x, 1.25, z] }));
  }
  for (let i = 0; i < 90; i++) {
    const x = (hash(i, 1, 7) - 0.5) * 21;
    const z = (hash(i, 2, 7) - 0.5) * 21;
    const y = 0.7 + hash(i, 3, 7) * 1.2;
    parts.push(part(new OctahedronGeometry(0.55, 0), BALL_COLORS[i % BALL_COLORS.length], { at: [x, y, z], rot: [hash(i, 4, 7) * 3, hash(i, 5, 7) * 3, 0] }));
  }
  return solid('ball-pit', parts);
}

/** "toy-ball", Ø0.8 m: one ball of the pit. */
function toyBall(): Group {
  return solid('toy-ball', [part(new IcosahedronGeometry(0.4, 0), '#EF6F6C')]);
}

/**
 * "toybox-lid", 16 × 14 × 4 m: the mouth of the big toy box the rail runs into: a pink box front round a 10 × 9 m opening,
 * cream edges, and the lid standing open above it.
 */
function toyboxLid(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(3, 10, 3), '#F7A8C4', { at: [-6.5, 5, 0] }));
  parts.push(part(new BoxGeometry(3, 10, 3), '#F7A8C4', { at: [6.5, 5, 0] }));
  parts.push(part(new BoxGeometry(16, 1.6, 3), '#F7A8C4', { at: [0, 9.8, 0] }));
  parts.push(part(new BoxGeometry(16.4, 0.4, 3.4), CREAM, { at: [0, 10.8, 0] }));
  parts.push(part(new BoxGeometry(16, 0.5, 5), '#F7A8C4', { at: [0, 12.6, -2.4], rot: [-1.1, 0, 0] }));
  parts.push(part(new BoxGeometry(2.2, 2.2, 0.2), CREAM, { at: [0, 9.8, 1.6] }));
  parts.push(STAR(0, 9.8, 1.72, 0.9, '#F6D365'));
  return solid('toybox-lid', parts);
}

/** "sign-slide-toy", 1 × 2.4 × 0.2 m: a white board with a pink slide on it (no face), on a post. */
function signSlideToy(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(0.12, 1.4, 0.12), WOOD_DARK, { at: [0, 0.7, -0.02] }));
  parts.push(part(new BoxGeometry(1.0, 0.9, 0.1), '#FFFFFF', { at: [0, 1.85, 0] }));
  parts.push(part(new BoxGeometry(0.7, 0.08, 0.02), PINK, { at: [0.02, 1.8, 0.06], rot: [0, 0, -0.55] }));
  parts.push(part(new BoxGeometry(0.06, 0.45, 0.02), PINK_DEEP, { at: [-0.3, 1.98, 0.06] }));
  return solid('sign-slide-toy', parts);
}

/** "toy-slide-rail": a piece of the slide's pink handrail, 4 m along +Z (the game lays the whole rail itself). */
function toySlideRail(): Group {
  return solid('toy-slide-rail', [
    part(new BoxGeometry(0.2, 0.2, 4), '#FF9FC8', { at: [0, 1.1, 0] }),
    part(new BoxGeometry(0.12, 1.1, 0.12), '#FF9FC8', { at: [0, 0.55, 0] }),
  ]);
}

// ---- the castle ---------------------------------------------------------------------------------------------------

/**
 * "toy-castle", 40 × 30 × 30 m: stacked building blocks, round towers with cone roofs at the corners, star flags
 * (lavender, pink, cream). Stubby and square: not the outline of any real or theme-park castle.
 */
function toyCastle(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(30, 10, 22), '#B8A4FF', { at: [0, 5, 0] }));
  parts.push(part(new BoxGeometry(20, 7, 14), '#FFD6E8', { at: [0, 13.5, 0] }));
  parts.push(part(new BoxGeometry(10, 5, 8), '#FFF1D6', { at: [0, 19.5, 0] }));
  for (let i = -3; i <= 3; i++) parts.push(part(new BoxGeometry(2.4, 2, 2.4), i % 2 ? '#FFF1D6' : '#FFD6E8', { at: [i * 4, 11, 11.2] }));
  for (const [x, z] of [
    [-16, -11],
    [16, -11],
    [-16, 11],
    [16, 11],
  ] as const) {
    parts.push(part(cyl(3.5, 3.8, 18, 12), '#FFD6E8', { at: [x, 9, z] }));
    parts.push(part(new ConeGeometry(4.4, 7, 12), '#B8A4FF', { at: [x, 21.5, z] }));
    parts.push(part(cyl(0.12, 0.12, 3, 5), WOOD_DARK, { at: [x, 26.5, z] }));
    parts.push(part(new BoxGeometry(0.1, 1.2, 1.8), '#F6D365', { at: [x, 27.3, z + 0.9] }));
  }
  parts.push(part(new ConeGeometry(6.5, 6, 4), '#EF6F6C', { at: [0, 25, 0], rot: [0, Math.PI / 4, 0] }));
  parts.push(part(new BoxGeometry(6, 7, 0.6), '#B7874E', { at: [0, 3.5, 11.1] }));
  parts.push(part(cyl(3, 3, 0.6, 12, ), '#B7874E', { at: [0, 7, 11.1], rot: [Math.PI / 2, 0, 0] }));
  for (const x of [-9, 9]) parts.push(part(cyl(1.2, 1.2, 0.3, 10), WINDOW, { at: [x, 6, 11.1], rot: [Math.PI / 2, 0, 0] }));
  parts.push(STAR(0, 19.5, 4.05, 1.6, '#F6D365'));
  return solid('toy-castle', parts);
}

/** "castle-key" / "castle-key-back", 8 × 8 × 1.2 m: the castle's big gold key (two loops, a hub); "-back": a pink swirl on it. */
function castleKey(back: boolean): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    for (const side of [-1, 1]) parts.push(part(new TorusGeometry(1.7, 0.45, 6, 16), GOLD_LIGHT, { at: [side * 2.2, 5.2, 0] }));
    parts.push(part(new BoxGeometry(2, 2, 1.2), GOLD_LIGHT, { at: [0, 5.2, 0] }));
    parts.push(part(cyl(0.45, 0.45, 3.6, 8), GOLD, { at: [0, 2.1, 0] }));
    if (back) parts.push(swirl(0, 5.2, 0.62, 0.9));
    return solid(back ? 'castle-key-back' : 'castle-key', parts);
  };
}

// ---- people, planes, Sakasa's train, the shelf ---------------------------------------------------------------------

/** "block-folk-a" / "-b", 0.8 × 2 × 0.8 m: a wooden peg person watching (a round body, a round head, two dot eyes). */
function blockFolk(name: string, body: string, hat: string | null): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    parts.push(part(cyl(0.3, 0.36, 1.3, 10), body, { at: [0, 0.65, 0] }));
    parts.push(part(ball(0.3, 10, 7), '#F4DDB8', { at: [0, 1.6, 0] }));
    parts.push(...eyes(0.1, 1.64, 0.26, 0.035));
    if (hat) parts.push(part(cyl(0.22, 0.3, 0.2, 10), hat, { at: [0, 1.9, 0] }));
    return solid(name, parts);
  };
}

/**
 * "toy-block-train", 0.8 × 1.2 × 2.4 m (long along +Z): Sakasa's little block train: three pastel blocks on round
 * wheels. No face, no chimney (not like any known engine).
 */
function toyBlockTrain(): Group {
  const parts: BufferGeometry[] = [];
  const colors = ['#8FD3F4', '#F7A8C4', '#F6D365'];
  colors.forEach((c, i) => parts.push(part(new BoxGeometry(0.7, i === 0 ? 0.8 : 0.55, 0.7), c, { at: [0, 0.3 + (i === 0 ? 0.4 : 0.28), 0.8 - i * 0.8] })));
  for (let i = 0; i < 3; i++) {
    for (const x of [-0.38, 0.38]) parts.push(part(cyl(0.15, 0.15, 0.08, 8), DARK, { at: [x, 0.15, 0.8 - i * 0.8], rot: [0, 0, Math.PI / 2] }));
  }
  return solid('toy-block-train', parts);
}

/** "toy-plane", 0.6 × 0.2 × 0.8 m: a folded paper plane (white and light blue), pointing +Z. */
function toyPlane(): Group {
  const pts: number[] = [];
  const cols: number[] = [];
  const white = new Color('#FFFFFF');
  const blue = new Color('#A8DDFF');
  const tri = (a: number[], b: number[], c: number[], col: Color): void => {
    pts.push(...a, ...b, ...c, ...a, ...c, ...b);
    for (let i = 0; i < 6; i++) cols.push(col.r, col.g, col.b);
  };
  tri([0, 0.1, 0.4], [-0.3, 0.12, -0.4], [0, 0.1, -0.4], white);
  tri([0, 0.1, 0.4], [0.3, 0.12, -0.4], [0, 0.1, -0.4], blue);
  tri([0, 0.1, 0.4], [0, 0.1, -0.4], [0, 0, -0.35], white);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return solid('toy-plane', [g]);
}

/** "toy-shelf", 8 × 7 × 2 m: a wooden toy shelf (two sides, three boards; the tin key waits on top). */
function toyShelf(): Group {
  const parts: BufferGeometry[] = [];
  for (const x of [-3.8, 3.8]) parts.push(part(new BoxGeometry(0.4, 7, 2), WOOD_DARK, { at: [x, 3.5, 0] }));
  for (const y of [0.3, 3.4, 6.8]) parts.push(part(new BoxGeometry(7.6, 0.35, 2), WOOD, { at: [0, y, 0] }));
  parts.push(part(new BoxGeometry(1.4, 1.4, 1.4), '#8FD3F4', { at: [-2, 4.3, 0] }));
  parts.push(part(ball(0.6, 8, 6), '#EF6F6C', { at: [1.8, 4.2, 0] }));
  return solid('toy-shelf', parts);
}

/** "toy-blocks-loose", about 10 m: a heap of loose building blocks with iron-plated edges (the third record's bridge). */
function toyBlocksLoose(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const x = (hash(i, 1, 3) - 0.5) * 8;
    const z = (hash(i, 2, 3) - 0.5) * 3;
    const y = 0.5 + (i % 3) * 0.6;
    const c = ['#F6D365', '#8FD3F4', '#F7A8C4', '#7FD8BE'][i % 4];
    parts.push(part(new BoxGeometry(1.2, 1, 1.2), c, { at: [x, y, z], rot: [0, hash(i, 3, 3) * 2, 0] }));
    parts.push(part(new BoxGeometry(1.26, 0.12, 1.26), SILVER, { at: [x, y + 0.5, z], rot: [0, hash(i, 3, 3) * 2, 0] }));
  }
  return solid('toy-blocks-loose', parts);
}

// ---- the records ---------------------------------------------------------------------------------------------------

/** "gold-screw", 0.4 × 0.8 × 0.4 m: a shining gold screw standing on its head (record ①). */
function goldScrew(): Group {
  const thread = (p: Vector3): Color => {
    const a = Math.atan2(p.z, p.x) / (Math.PI * 2);
    return (((p.y / 0.12 + a) % 1) + 1) % 1 < 0.35 ? new Color(GOLD) : new Color('#F5D873');
  };
  return solid('gold-screw', [
    part(cyl(0.2, 0.2, 0.12, 12), '#F5D873', { at: [0, 0.06, 0] }),
    part(cyl(0.08, 0.03, 0.66, 10), thread, { at: [0, 0.45, 0] }),
    part(new BoxGeometry(0.3, 0.03, 0.05), '#A8851F', { at: [0, 0.13, 0] }),
  ]);
}

/** "glow-marble", Ø0.3 m: a light blue marble with a swirl inside, glowing a little (record ②, in the dark toy box). */
function glowMarble(): Group {
  const g = new Group();
  const m = new Mesh(
    merge([part(ball(0.15, 12, 8), (p) => mix('#6FD6F5', '#DFF8FF', clamp01(0.5 + p.y * 3 + Math.sin(p.x * 30) * 0.3)), { at: [0, 0.15, 0] })]),
    glowMaterial(),
  );
  m.name = 'glow-marble';
  g.add(m);
  return g;
}

/** "tin-key", 0.5 × 0.7 × 0.12 m: a small tin wind-up key (record ③). */
function tinKey(): Group {
  return solid('tin-key', keyParts([0, 0, 0], 1.1, '#B9C4CF', false));
}

const BUILDERS: Record<string, () => Group> = {
  'block-house-a': blockHouseA,
  'block-house-b': blockHouseB,
  'block-house-c': blockHouseC,
  'screw-post': screwPost,
  'screw-tower': screwTower,
  'windup-key': windupKey,
  'windup-chick': windupChick(false),
  'windup-chick-back': windupChick(true),
  'windup-car': windupCar(false),
  'windup-car-back': windupCar(true),
  'band-flag': bandFlag,
  'band-trumpet': bandTrumpet,
  'band-glock': bandGlock,
  'band-cymbal': bandCymbal,
  'band-drum': bandDrum,
  'spin-turntable': spinTurntable,
  'spin-arrow': spinArrow,
  'spin-star': spinStar,
  'ball-pit': ballPit,
  'toy-ball': toyBall,
  'toybox-lid': toyboxLid,
  'sign-slide-toy': signSlideToy,
  'toy-slide-rail': toySlideRail,
  'toy-castle': toyCastle,
  'castle-key': castleKey(false),
  'castle-key-back': castleKey(true),
  'block-folk-a': blockFolk('block-folk-a', '#EF6F6C', null),
  'block-folk-b': blockFolk('block-folk-b', '#6EC6FF', '#F6D365'),
  'toy-block-train': toyBlockTrain,
  'toy-plane': toyPlane,
  'toy-shelf': toyShelf,
  'toy-blocks-loose': toyBlocksLoose,
  'gold-screw': goldScrew,
  'glow-marble': glowMarble,
  'tin-key': tinKey,
};

/** The names drawn here (the model viewer lists the ones in assets/models.json's _pending). */
export const TOY_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the toy town pieces. */
export function buildToyPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
