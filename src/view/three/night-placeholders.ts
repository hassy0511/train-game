import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp01, eyes, glowMaterial, hash, kitMaterial, merge, mix, part, solid } from './placeholder-kit';
import { traceGlowMaterial } from './village-placeholders';

/**
 * Stand-ins drawn in code for the night forest pieces the PR2c mechanisms use (ticket 0018 「よるの もり」,
 * PHASE9_CHAPTER5_6 第 4 部 §8) until their models are built: the hush sign, the dancing-tanuki sign, the sleeping
 * rabbits and their nest (a record), the fawn, the hedgehog (walking and curled up), the little tanukis (one, or a group
 * of 2–4 as "tanuki-<n>"), Sakasa's fake pink lantern, the grass tuft the resting fireflies sit in. Origin at the
 * bottom centre, +Z forward; one merged mesh per model in the shared vertex-coloured material (the fake lantern's paper
 * has a material of its own the game dims, setFakeLanternGlow).
 * The animals' faces are two small dark eyes and a nose only: no mouth, teeth, brows, lashes or big eyes; no clothes,
 * hats, leaves, bottles or drum bellies (not like any known character). The moon on the signs has no face either.
 */
const NAVY = '#27305E';
const NAVY_EDGE = '#1B2247';
const MOON = '#FFE27A';
const POST = '#7A5A3E';
const BOARD_WHITE = '#F4F1E6';
const TANUKI = '#8A6A4E';
const TANUKI_DARK = '#4E3B2C';
const TANUKI_BELLY = '#D9C3A0';
const RABBIT = '#F4F0EA';
const RABBIT_TAN = '#D8C0A0';
const EAR_PINK = '#E8B9B4';
const LID = '#7C6A5E';
const STRAW = '#C9A55E';
const STRAW_DARK = '#A8853F';
const FAWN = '#B07A4A';
const FAWN_LIGHT = '#E7CBA6';
const SPOT = '#F7EEDF';
const HOOF = '#5A4332';
const HEDGEHOG = '#8B6A4C';
const HEDGEHOG_DARK = '#6A4E36';
const HEDGEHOG_FACE = '#D9BE98';
const NOSE = '#3A2A20';
const BAMBOO = '#9DB36B';
const BAMBOO_DARK = '#7C9150';
const STRING = '#E9E2D0';
const PINK = '#FF8FC8';
const PINK_DEEP = '#E0569F';
const GRASS = '#3F6E4F';
const GRASS_LIGHT = '#5E8F63';

const ball = (r: number, w = 10, h = 7): SphereGeometry => new SphereGeometry(r, w, h);

/** Flat shapes (triangles in the XY plane at depth z, facing +Z), each painted in its own colour. */
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

/** A disc (as a fan of triangles) centred at (cx, cy), radius r. */
function disc(cx: number, cy: number, r: number, n = 14): [number, number][][] {
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    out.push([
      [cx, cy],
      [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
      [cx + Math.cos(b) * r, cy + Math.sin(b) * r],
    ]);
  }
  return out;
}

/** A crescent opening to the right: the left half of a disc, less a flattened half-disc (thick middle, thin tips). */
function crescent(cx: number, cy: number, r: number): [number, number][][] {
  const out: [number, number][][] = [];
  const n = 14;
  const pt = (t: number, k: number): [number, number] => [cx + Math.cos(t) * r * k, cy + Math.sin(t) * r];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / n;
    const b = Math.PI / 2 + (Math.PI * (i + 1)) / n;
    out.push([pt(a, 1), pt(b, 1), pt(b, 0.35)], [pt(a, 1), pt(b, 0.35), pt(a, 0.35)]);
  }
  return out;
}

/** A bar from (ax, ay) to (bx, by), `w` wide. */
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

/** A "Z" `s` tall with its bottom-left at (x, y). */
function zed(x: number, y: number, s: number, w: number): [number, number][][] {
  return [...bar(x, y + s, x + s, y + s, w), ...bar(x + s, y + s, x, y, w), ...bar(x, y, x + s, y, w)];
}

/** A signpost: a post and a board `w` × `h` at height `y0`, the picture on its +Z face. */
function signBoard(w: number, h: number, y0: number, board: string, edge: string): BufferGeometry[] {
  return [
    part(new BoxGeometry(0.12, y0 + 0.2, 0.12), POST, { at: [0, (y0 + 0.2) / 2, -0.02] }),
    part(new BoxGeometry(w + 0.08, h + 0.08, 0.08), edge, { at: [0, y0 + h / 2, 0] }),
    part(new BoxGeometry(w, h, 0.1), board, { at: [0, y0 + h / 2, 0.01] }),
  ];
}

/** The hush picture (a crescent and "ZZZ", no face) centred at (cx, cy), `s` across, on the face at depth z. */
function hushPicture(cx: number, cy: number, s: number, z: number): BufferGeometry[] {
  return [
    flat(crescent(cx - s * 0.12, cy - s * 0.05, s * 0.3), z, MOON),
    flat([...zed(cx + s * 0.12, cy + s * 0.02, s * 0.12, s * 0.035), ...zed(cx + s * 0.28, cy + s * 0.18, s * 0.09, s * 0.03), ...zed(cx + s * 0.4, cy + s * 0.31, s * 0.07, s * 0.025)], z, MOON),
  ];
}

/** "sign-hush", 1.2 × 2.2 × 0.2 m: a navy board with a yellow crescent and ZZZ (the hush stretch's sign). */
function signHush(): Group {
  const parts = signBoard(1.1, 0.9, 1.2, NAVY, NAVY_EDGE);
  parts.push(...hushPicture(0, 1.65, 1.0, 0.065));
  return solid('sign-hush', parts);
}

/**
 * "sign-whistle-reversed", 1.2 × 2.2 × 0.2 m: the dancing-tanuki sign: a white board, a round brown tanuki shadow with
 * its arms up and its striped tail out, and the hush picture (crescent and ZZZ) beside it. No pink swirl.
 */
function signWhistleReversed(): Group {
  const parts = signBoard(1.1, 0.9, 1.2, BOARD_WHITE, POST);
  const z = 0.065;
  parts.push(flat([...disc(-0.18, 1.52, 0.17), ...disc(-0.18, 1.78, 0.12), ...disc(-0.27, 1.88, 0.045), ...disc(-0.09, 1.88, 0.045)], z, TANUKI_DARK));
  parts.push(flat([...bar(-0.3, 1.6, -0.42, 1.8, 0.05), ...bar(-0.06, 1.6, 0.06, 1.8, 0.05), ...bar(-0.02, 1.42, 0.14, 1.36, 0.08)], z, TANUKI_DARK));
  parts.push(...hushPicture(0.28, 1.66, 0.55, z));
  return solid('sign-whistle-reversed', parts);
}

/** One sleeping rabbit curled up (ears folded back, closed eyes as short lines), `s` times 0.5 × 0.35 × 0.7 m. */
function rabbitParts(at: [number, number, number], s: number, rotY = 0): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const place = (p: [number, number, number]): [number, number, number] => {
    const c = Math.cos(rotY);
    const sn = Math.sin(rotY);
    return [at[0] + (p[0] * c + p[2] * sn) * s, at[1] + p[1] * s, at[2] + (-p[0] * sn + p[2] * c) * s];
  };
  const paint = (p: Vector3): Color => mix(RABBIT_TAN, RABBIT, clamp01(p.y / 0.3));
  out.push(part(ball(1, 10, 7), paint, { at: place([0, 0.16, -0.05]), scale: [0.24 * s, 0.17 * s, 0.3 * s], rot: [0, rotY, 0] }));
  out.push(part(ball(1, 9, 6), RABBIT, { at: place([0, 0.2, 0.22]), scale: [0.14 * s, 0.12 * s, 0.13 * s] }));
  for (const side of [-1, 1]) {
    out.push(part(ball(1, 6, 4), EAR_PINK, { at: place([side * 0.05, 0.28, 0.08]), scale: [0.04 * s, 0.03 * s, 0.13 * s], rot: [0.25, rotY, 0] }));
    // Closed eyes: little dark lines.
    out.push(part(new BoxGeometry(0.04 * s, 0.008 * s, 0.01 * s), LID, { at: place([side * 0.055, 0.22, 0.34]), rot: [0, rotY, 0] }));
  }
  out.push(part(ball(0.02 * s, 5, 4), EAR_PINK, { at: place([0, 0.19, 0.35]) }));
  out.push(part(ball(0.05 * s, 6, 4), RABBIT, { at: place([0, 0.14, -0.33]) }));
  return out;
}

/** "bunny-sleep", 0.5 × 0.35 × 0.7 m: one rabbit asleep, curled up. */
function bunnySleep(): Group {
  return solid('bunny-sleep', rabbitParts([0, 0, 0], 1));
}

/** "bunny-family", 1.4 × 0.6 × 1.2 m: a straw nest with a big rabbit and two little ones asleep in it (a record). */
function bunnyFamily(): Group {
  const parts: BufferGeometry[] = [];
  const straw = (p: Vector3): Color => mix(STRAW_DARK, STRAW, hash(p.x * 9, p.y * 9, p.z * 9));
  parts.push(part(new TorusGeometry(0.52, 0.14, 6, 18), straw, { at: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], scale: [1.15, 1, 1] }));
  parts.push(part(new CylinderGeometry(0.55, 0.5, 0.08, 16), STRAW_DARK, { at: [0, 0.04, 0] }));
  parts.push(...rabbitParts([0, 0.05, -0.05], 1.2));
  parts.push(...rabbitParts([-0.32, 0.05, 0.28], 0.65, 0.6));
  parts.push(...rabbitParts([0.34, 0.05, 0.25], 0.62, -0.5));
  return solid('bunny-family', parts);
}

/**
 * "fawn", 0.45 × 1.2 × 1.1 m: a young deer, brown with white spots, thin legs, big soft ears; two small dark eyes and a
 * nose (no lashes, not big eyes). Facing +Z.
 */
function fawn(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(ball(1, 10, 7), (p) => mix(FAWN_LIGHT, FAWN, clamp01((p.y + 0.6) / 1.2)), { at: [0, 0.72, 0], scale: [0.2, 0.19, 0.42] }));
  for (const [x, z] of [
    [-0.11, 0.26],
    [0.11, 0.26],
    [-0.11, -0.26],
    [0.11, -0.26],
  ] as const) {
    parts.push(part(new CylinderGeometry(0.035, 0.028, 0.6, 5), FAWN, { at: [x, 0.33, z] }));
    parts.push(part(new CylinderGeometry(0.032, 0.036, 0.06, 5), HOOF, { at: [x, 0.03, z] }));
  }
  parts.push(part(new CylinderGeometry(0.06, 0.08, 0.3, 6), FAWN, { at: [0, 0.95, 0.34], rot: [0.5, 0, 0] }));
  parts.push(part(ball(1, 9, 6), FAWN, { at: [0, 1.1, 0.44], scale: [0.11, 0.1, 0.14] }));
  parts.push(part(ball(1, 7, 5), FAWN_LIGHT, { at: [0, 1.07, 0.56], scale: [0.06, 0.055, 0.06] }));
  parts.push(part(ball(0.025, 6, 4), NOSE, { at: [0, 1.08, 0.62] }));
  for (const side of [-1, 1]) parts.push(part(ball(1, 7, 5), FAWN, { at: [side * 0.12, 1.2, 0.4], scale: [0.09, 0.035, 0.05], rot: [0, 0, side * 0.5] }));
  parts.push(...eyes(0.06, 1.14, 0.53, 0.018));
  for (let i = 0; i < 8; i++) {
    const x = (i % 2 ? 1 : -1) * (0.1 + hash(i, 1, 2) * 0.06);
    parts.push(part(ball(0.03, 5, 3), SPOT, { at: [x, 0.8 + hash(i, 3, 1) * 0.08, -0.25 + i * 0.07] }));
  }
  parts.push(part(ball(1, 6, 4), SPOT, { at: [0, 0.8, -0.42], scale: [0.05, 0.06, 0.04] }));
  return solid('fawn', parts);
}

/** The hedgehog's round back with small cone "spines" (soft, a pattern), `r` round. */
function hedgehogBack(r: number, y: number, squash: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  out.push(part(ball(1, 12, 8), (p) => mix(HEDGEHOG_DARK, HEDGEHOG, clamp01(p.y + 0.5)), { at: [0, y, 0], scale: [r, r * squash, r * 1.2] }));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const up = 0.35 + 0.5 * hash(i, 2, 3);
    const dir = new Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up) * 1.2).normalize();
    const at = new Vector3(dir.x * r, y + dir.y * r * squash, dir.z * r * 1.2);
    out.push(part(new ConeGeometry(0.035, 0.08, 4), HEDGEHOG_DARK, { at: [at.x, at.y, at.z], quat: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir) }));
  }
  return out;
}

/** "hedgehog-walk", 0.4 × 0.35 × 0.7 m: a small brown hedgehog sniffing along, facing +Z (eyes and a dark nose). */
function hedgehogWalk(): Group {
  const parts = hedgehogBack(0.2, 0.17, 0.8);
  parts.push(part(ball(1, 8, 6), HEDGEHOG_FACE, { at: [0, 0.12, 0.25], scale: [0.09, 0.08, 0.11] }));
  parts.push(part(ball(0.025, 6, 4), NOSE, { at: [0, 0.11, 0.36] }));
  parts.push(...eyes(0.045, 0.16, 0.3, 0.015));
  for (const [x, z] of [
    [-0.1, 0.12],
    [0.1, 0.12],
    [-0.1, -0.12],
    [0.1, -0.12],
  ] as const)
    parts.push(part(new CylinderGeometry(0.025, 0.025, 0.08, 5), HEDGEHOG_FACE, { at: [x, 0.04, z] }));
  return solid('hedgehog-walk', parts);
}

/** "hedgehog-ball", Ø0.55 m: the hedgehog curled up into a ball (it rolls). */
function hedgehogBall(): Group {
  const parts = hedgehogBack(0.24, 0.27, 1);
  parts.push(part(ball(1, 7, 5), HEDGEHOG_FACE, { at: [0, 0.12, 0.18], scale: [0.1, 0.07, 0.06] }));
  return solid('hedgehog-ball', parts);
}

/**
 * One little tanuki, 0.6 × 0.8 × 0.6 m: a round body, dark legs and arms, dark patches round two small eyes, a nose, a
 * striped tail. No leaf, hat, bottle or drum belly. Facing +Z. Placed at `x`, turned `rot`.
 */
function tanukiParts(x: number, z: number, rot: number, s = 1): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const at = (p: [number, number, number]): [number, number, number] => [x + (p[0] * c + p[2] * sn) * s, p[1] * s, z + (-p[0] * sn + p[2] * c) * s];
  out.push(part(ball(1, 10, 7), TANUKI, { at: at([0, 0.34, 0]), scale: [0.24 * s, 0.26 * s, 0.22 * s] }));
  out.push(part(ball(1, 8, 5), TANUKI_BELLY, { at: at([0, 0.3, 0.13]), scale: [0.15 * s, 0.17 * s, 0.1 * s] }));
  out.push(part(ball(1, 10, 7), TANUKI, { at: at([0, 0.64, 0.02]), scale: [0.17 * s, 0.15 * s, 0.16 * s] }));
  out.push(part(ball(1, 7, 5), TANUKI_BELLY, { at: at([0, 0.6, 0.15]), scale: [0.08 * s, 0.06 * s, 0.07 * s] }));
  out.push(part(ball(0.025 * s, 6, 4), NOSE, { at: at([0, 0.62, 0.22]) }));
  for (const side of [-1, 1]) {
    out.push(part(ball(1, 7, 5), TANUKI_DARK, { at: at([side * 0.065, 0.67, 0.13]), scale: [0.05 * s, 0.035 * s, 0.03 * s] }));
    out.push(part(ball(0.017 * s, 6, 4), '#141414', { at: at([side * 0.065, 0.68, 0.158]) }));
    out.push(part(ball(1, 6, 4), TANUKI_DARK, { at: at([side * 0.11, 0.78, 0]), scale: [0.05 * s, 0.05 * s, 0.03 * s] }));
    out.push(part(new CylinderGeometry(0.045 * s, 0.05 * s, 0.14 * s, 5), TANUKI_DARK, { at: at([side * 0.1, 0.07, 0.02]) }));
    out.push(part(new CylinderGeometry(0.035 * s, 0.04 * s, 0.2 * s, 5), TANUKI_DARK, { at: at([side * 0.22, 0.46, 0.04]), rot: [0, rot, side * -0.9] }));
  }
  for (let i = 0; i < 3; i++) {
    out.push(part(ball(1, 7, 5), i % 2 ? TANUKI_DARK : TANUKI, { at: at([0, 0.22 + i * 0.03, -0.24 - i * 0.07]), scale: [0.07 * s, 0.07 * s, 0.06 * s] }));
  }
  return out;
}

/** "tanuki" (one) or "tanuki-<n>" (a group of 1–4, side by side, in 1.6 m): the little tanukis of a lure actor. */
function tanukiGroup(n: number): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.55;
      const z = (i % 2) * -0.25;
      parts.push(...tanukiParts(x, z, (hash(i, 7, n) - 0.5) * 0.6, i % 2 ? 0.85 : 1));
    }
    return solid(n === 1 ? 'tanuki' : `tanuki-${n}`, parts);
  };
}

let lanternPaper: MeshLambertMaterial | null = null;
/** The fake lantern's pink paper: glowing (1) until the light sees through Sakasa's lie, then dark (0). */
function lanternMaterial(): MeshLambertMaterial {
  lanternPaper ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color(PINK), emissiveIntensity: 1 });
  return lanternPaper;
}

/** v1.11 (5-1): how brightly Sakasa's fake pink lanterns glow (1 lit, 0 gone out). */
export function setFakeLanternGlow(k: number): void {
  lanternMaterial().emissiveIntensity = 1.1 * clamp01(k);
}

/**
 * "fake-lantern", 0.5 × 2.6 × 0.5 m: Sakasa's fake light: a bamboo pole standing on the ground, a string, and a round
 * pink festival lantern hanging from its arm (never floating), glowing a see-through pink.
 */
function fakeLantern(): Group {
  const g = new Group();
  const frame: BufferGeometry[] = [];
  frame.push(part(new CylinderGeometry(0.035, 0.045, 2.6, 6), (p) => (Math.abs(((p.y + 1.3) % 0.5) - 0.25) < 0.02 ? new Color(BAMBOO_DARK) : new Color(BAMBOO)), { at: [0, 1.3, 0] }));
  frame.push(part(new CylinderGeometry(0.02, 0.02, 0.45, 5), BAMBOO_DARK, { at: [0.2, 2.55, 0], rot: [0, 0, Math.PI / 2] }));
  frame.push(part(new CylinderGeometry(0.006, 0.006, 0.3, 3), STRING, { at: [0.4, 2.4, 0] }));
  frame.push(part(new CylinderGeometry(0.1, 0.1, 0.04, 8), TANUKI_DARK, { at: [0.4, 2.23, 0] }));
  frame.push(part(new CylinderGeometry(0.1, 0.1, 0.04, 8), TANUKI_DARK, { at: [0.4, 1.73, 0] }));
  const frameMesh = new Mesh(merge(frame), kitMaterial());
  frameMesh.name = 'fake-lantern-frame';
  const paper = new Mesh(merge([part(ball(1, 12, 9), (p) => mix(PINK_DEEP, PINK, clamp01(0.5 + p.y)), { at: [0.4, 1.98, 0], scale: [0.2, 0.24, 0.2] })]), lanternMaterial());
  paper.name = 'fake-lantern';
  g.add(frameMesh, paper);
  return g;
}

/** "firefly-grass", 1.4 × 0.7 × 1.0 m: a low tuft of dark grass where fireflies rest by a firefly fork. */
function fireflyGrass(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const x = (hash(i, 1, 9) - 0.5) * 1.2;
    const z = (hash(i, 2, 9) - 0.5) * 0.8;
    const h = 0.4 + hash(i, 3, 9) * 0.3;
    parts.push(part(new ConeGeometry(0.12, h, 4), (p) => mix(GRASS, GRASS_LIGHT, clamp01(p.y / h + 0.5)), { at: [x, h / 2, z], rot: [(hash(i, 4, 9) - 0.5) * 0.4, hash(i, 5, 9) * 3, (hash(i, 6, 9) - 0.5) * 0.4] }));
  }
  return solid('firefly-grass', parts);
}

// ---- the rest of the night forest (5-1, PR3) ----

const LEAF_DARK = '#2c5a55';
const LEAF_LIGHT = '#3f7a6a';
const TRUNK = '#5a4636';
const TRUNK_DARK = '#46362a';
const MUSHROOM = '#7fd6ff';
const STEM = '#eef2f4';
const MEADOW = '#5f8f86';
const FLOWER = '#f4f6ff';
const DECK = '#9a6b45';
const DECK_DARK = '#7a5234';
const RING = '#c29a6b';
const WARM = '#ffd27a';
const IRON = '#6e7784';
const GOLD = '#e8b93a';
const MOONSTONE = '#fff1a8';
const FIREFLY = '#d8ff7a';

/** Leaves lighter on the moon's side (+X, up) and darker below. */
const leafy = (top: number) => (p: Vector3): Color => mix(LEAF_DARK, LEAF_LIGHT, clamp01(0.35 + (p.y / top) * 0.5 + p.x * 0.03));

/** A night tree `h` m tall: a trunk and `n` round clumps of leaves (low: every clump 20 triangles). */
function nightTree(name: string, h: number, w: number, n: number): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    parts.push(part(new CylinderGeometry(w * 0.05, w * 0.08, h * 0.45, 5, 1, true), TRUNK, { at: [0, h * 0.225, 0] }));
    const paint = leafy(h);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const r = i === 0 ? 0 : w * 0.22;
      const y = h * (i === 0 ? 0.72 : 0.5 + 0.12 * (i % 2));
      const size = w * (i === 0 ? 0.42 : 0.34);
      parts.push(part(new IcosahedronGeometry(1, 0), paint, { at: [Math.cos(a) * r, y, Math.sin(a) * r], scale: [size, size * 1.1, size], rot: [0, i, 0] }));
    }
    return solid(name, parts);
  };
}

/** "night-bush", 3 × 1.6 × 3 m: a round bush (the little tanukis live in them). */
function nightBush(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(part(new IcosahedronGeometry(1, 0), leafy(1.6), { at: [Math.cos(a) * 0.5, 0.7, Math.sin(a) * 0.5], scale: [0.95, 0.8, 0.95] }));
  }
  return solid('night-bush', parts);
}

/** "glow-mushroom", 1.2 × 0.9 × 1.2 m: two mushrooms with glowing blue caps (their light is their own colour). */
function glowMushroom(): Group {
  const parts: BufferGeometry[] = [];
  for (const [x, z, s] of [
    [0, 0, 1],
    [0.35, 0.25, 0.6],
  ] as const) {
    parts.push(part(new CylinderGeometry(0.06 * s, 0.08 * s, 0.5 * s, 5), STEM, { at: [x, 0.25 * s, z] }));
    parts.push(part(new SphereGeometry(0.32 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), MUSHROOM, { at: [x, 0.48 * s, z] }));
  }
  return solid('glow-mushroom', parts, glowMaterial());
}

/** "moon-meadow", 60 × 0.1 × 100 m: the moonlit meadow's pale blue-green grass, with little white flowers. */
function moonMeadow(): Group {
  const parts: BufferGeometry[] = [];
  const grass = new PlaneGeometry(60, 100, 1, 1);
  grass.rotateX(-Math.PI / 2);
  parts.push(part(grass, MEADOW, { at: [0, 0.06, 0] }));
  for (let i = 0; i < 40; i++) {
    const f = new PlaneGeometry(0.5, 0.5);
    f.rotateX(-Math.PI / 2);
    parts.push(part(f, FLOWER, { at: [(hash(i, 1, 3) - 0.5) * 56, 0.08, (hash(i, 2, 3) - 0.5) * 96], rot: [0, hash(i, 3, 3) * 3, 0] }));
  }
  return solid('moon-meadow', parts, kitMaterial(), false);
}

let treeHalo: MeshBasicMaterial | null = null;
/**
 * The soft firefly light round the great tree's crown, seen from far off through the fog: a ball drawn brightest where
 * it faces the camera and fading to nothing at its rim (so it has no edge from any side, and works instanced).
 */
function haloMaterial(): MeshBasicMaterial {
  if (treeHalo) return treeHalo;
  const m = new MeshBasicMaterial({ color: FIREFLY, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHaloN;\nvarying vec3 vHaloV;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 haloN = normal;
        #ifdef USE_INSTANCING
          haloN = mat3(instanceMatrix) * haloN;
        #endif
        vHaloN = normalize(mat3(modelViewMatrix) * haloN);
        vHaloV = -mvPosition.xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHaloN;\nvarying vec3 vHaloV;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= 0.18 * pow(max(0.0, dot(normalize(vHaloN), normalize(vHaloV))), 2.5);');
  };
  m.customProgramCacheKey = () => 'great-tree-halo';
  treeHalo = m;
  return m;
}

/**
 * "great-tree", 40 × 70 × 40 m: the great tree at the fireflies' square: a thick trunk (Ø14) on six roots, five big
 * clumps of leaves, six warm lanterns hanging from it; one hollow only (never two eyes and a mouth); a soft firefly
 * light round its crown that the fog does not hide (the landmark seen from far off).
 */
function greatTree(): Group {
  const parts: BufferGeometry[] = [];
  const bark = (p: Vector3): Color => mix(TRUNK_DARK, TRUNK, clamp01(0.4 + hash(Math.round(p.x), Math.round(p.y), 1) * 0.4));
  parts.push(part(new CylinderGeometry(4.5, 7, 40, 10, 3), bark, { at: [0, 20, 0] }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(part(new ConeGeometry(2.2, 12, 5), bark, { at: [Math.cos(a) * 7, 2, Math.sin(a) * 7], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] }));
  }
  const paint = leafy(70);
  const clumps: [number, number, number, number][] = [
    [0, 55, 0, 16],
    [-12, 43, 4, 13],
    [12, 44, -3, 13],
    [2, 42, 13, 12],
    [-2, 45, -13, 12],
  ];
  for (const [x, y, z, r] of clumps) parts.push(part(new IcosahedronGeometry(1, 1), paint, { at: [x, y, z], scale: [r, r * 0.85, r] }));
  // The one hollow, low on the trunk, facing the square (+Z).
  parts.push(part(new CircleGeometry(1.4, 10), '#2a1f18', { at: [1.5, 9, 6.05], scale: [1, 1.3, 1] }));
  const g = solid('great-tree', parts, kitMaterial(), false);
  const lamps: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 15;
    const z = Math.sin(a) * 15;
    lamps.push(part(new CylinderGeometry(0.03, 0.03, 2, 3), TRUNK_DARK, { at: [x, 33, z] }));
    lamps.push(part(new SphereGeometry(0.7, 8, 6), WARM, { at: [x, 31.5, z], scale: [1, 1.25, 1] }));
  }
  const lampMesh = new Mesh(merge(lamps), glowMaterial());
  lampMesh.name = 'great-tree-lanterns';
  g.add(lampMesh);
  const halo = new Mesh(new IcosahedronGeometry(1, 2), haloMaterial());
  halo.name = 'great-tree-halo';
  halo.scale.set(34, 24, 34);
  halo.position.set(0, 48, 0);
  g.add(halo);
  return g;
}

/** "plaza-deck", 20 × 1 × 40 m: the wooden deck of the fireflies' square. */
function plazaDeck(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) parts.push(part(new BoxGeometry(1.9, 0.3, 40), i % 2 ? DECK : DECK_DARK, { at: [-9 + i * 2, 0.55, 0] }));
  for (const x of [-9, 9]) for (const z of [-18, 0, 18]) parts.push(part(new BoxGeometry(0.5, 0.6, 0.5), DECK_DARK, { at: [x, 0.3, z] }));
  return solid('plaza-deck', parts);
}

/** "big-stump", 10 × 3 × 10 m: the big tree stump by the stump station, rings on its top. */
function bigStump(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(4.6, 5, 3, 14, 1, true), TRUNK, { at: [0, 1.5, 0] }));
  for (let i = 0; i < 4; i++) parts.push(part(new RingGeometry(i * 1.15, (i + 1) * 1.15, 14), i % 2 ? RING : '#a8835a', { at: [0, 3, 0], rot: [-Math.PI / 2, 0, 0] }));
  return solid('big-stump', parts);
}

/** "log-bridge-end", 6 × 1.5 × 4.4 m: the broken end of the log bridge (+Z along the track), five logs, splintered. */
function logBridgeEnd(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const len = 3.6 + hash(i, 2, 5) * 0.8;
    parts.push(part(new CylinderGeometry(0.28, 0.3, len, 6), TRUNK, { at: [-2.4 + i * 1.2, 1.1, -len / 2 + 2.2], rot: [Math.PI / 2, 0, 0] }));
    parts.push(part(new ConeGeometry(0.28, 0.5, 5), '#8a6a4a', { at: [-2.4 + i * 1.2, 1.1, 2.4], rot: [Math.PI / 2, 0, 0] }));
  }
  for (const x of [-2.7, 2.7]) parts.push(part(new CylinderGeometry(0.2, 0.25, 1.3, 5), TRUNK_DARK, { at: [x, 0.65, -1.6] }));
  return solid('log-bridge-end', parts);
}

/** "thicket", 8 × 4 × 2 m: the soft wall of leaves at a dark dead end (no thorns); the train comes from −Z. */
function thicket(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) parts.push(part(new IcosahedronGeometry(1, 0), leafy(4), { at: [-3.2 + i * 1.6, 1.6 + (i % 2) * 0.6, 0], scale: [1.4, 1.8, 1] }));
  return solid('thicket', parts);
}

/** "birdhouse-upside", 0.6 × 0.8 × 0.6 m: Sakasa's upside-down birdhouse (the roof below), a pink swirl the light finds. */
function birdhouseUpside(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(0.44, 0.5, 0.44), '#b88a5a', { at: [0, 0.5, 0] }));
  parts.push(part(new ConeGeometry(0.4, 0.28, 4), '#7a4e33', { at: [0, 0.14, 0], rot: [Math.PI, Math.PI / 4, 0] }));
  parts.push(part(new CircleGeometry(0.07, 8), '#2a1f18', { at: [0, 0.6, 0.225] }));
  const g = solid('birdhouse-upside', parts);
  const swirl: BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    const a = t * Math.PI * 4;
    swirl.push(part(new BoxGeometry(0.035, 0.035, 0.012), '#ff7fbf', { at: [Math.cos(a) * 0.12 * t, 0.42 + Math.sin(a) * 0.12 * t, 0.226] }));
  }
  const mark = new Mesh(merge(swirl), traceGlowMaterial());
  mark.name = 'birdhouse-swirl';
  g.add(mark);
  return g;
}

/** "bell-branch", 6 × 1 × 1 m: the thick branch record ③ hangs from, with its hook. */
function bellBranch(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.28, 0.4, 6, 6), TRUNK, { at: [0, 0.5, 0], rot: [0, 0, Math.PI / 2] }));
  parts.push(part(new TorusGeometry(0.12, 0.03, 4, 8, Math.PI), IRON, { at: [-1, 0.15, 0] }));
  return solid('bell-branch', parts, kitMaterial(), false);
}

/** "moonstone", 0.5 × 0.3 × 0.4 m: record ②, a round pale-yellow stone that keeps the moonlight (glowing softly). */
function moonstone(): Group {
  return solid('moonstone', [part(new IcosahedronGeometry(1, 1), MOONSTONE, { at: [0, 0.15, 0], scale: [0.25, 0.15, 0.2] })], glowMaterial());
}

/** "lantern-bell", 0.4 × 0.7 × 0.4 m: record ③, a little iron lantern with a gold bell under it (iron: the magnet's). */
function lanternBell(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new TorusGeometry(0.06, 0.015, 4, 8), IRON, { at: [0, 0.66, 0] }));
  parts.push(part(new ConeGeometry(0.18, 0.12, 6), IRON, { at: [0, 0.56, 0] }));
  parts.push(part(new CylinderGeometry(0.13, 0.13, 0.24, 6, 1, true), '#ffe7a8', { at: [0, 0.38, 0] }));
  parts.push(part(new CylinderGeometry(0.15, 0.15, 0.03, 6), IRON, { at: [0, 0.25, 0] }));
  parts.push(part(new SphereGeometry(0.09, 8, 6), GOLD, { at: [0, 0.14, 0] }));
  return solid('lantern-bell', parts);
}

/** "firefly-wait", 2 × 1.5 × 0.6 m: six fireflies waiting in front of a dead end's thicket, glowing warm. */
function fireflyWait(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) parts.push(part(new SphereGeometry(0.09, 5, 4), FIREFLY, { at: [(hash(i, 1, 6) - 0.5) * 2, 0.4 + hash(i, 2, 6) * 1.1, (hash(i, 3, 6) - 0.5) * 0.6] }));
  return solid('firefly-wait', parts, glowMaterial(), false);
}

/** "firefly-swarm" / "-big" (cutscenes): a cloud of firefly points, `r` m round (additive; no fog: a light in the dark). */
function fireflySwarm(name: string, r: number, n: number): () => Group {
  return () => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = hash(i, 1, n) * 2 - 1;
      const a = hash(i, 2, n) * Math.PI * 2;
      const d = Math.cbrt(hash(i, 3, n)) * r;
      const q = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * q * d, r + u * d * 0.7, Math.sin(a) * q * d], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const pts = new Points(geo, new PointsMaterial({ color: FIREFLY, size: 0.35, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
    pts.name = name;
    const g = new Group();
    g.add(pts);
    return g;
  };
}

/**
 * Sakasa carrying 4-2's paper lantern (for 5-1's cutscenes): the built amanojaku with a short stick in its hand and a
 * round warm lantern hanging from it (`lit` false: out, the ending under the great tree).
 */
export function addHandLantern(model: Group, lit: boolean): Group {
  const out = model.clone(true);
  out.name = lit ? 'amanojaku-lantern' : 'amanojaku-lantern-off';
  const stick = new Mesh(new CylinderGeometry(0.012, 0.012, 0.45, 4), new MeshLambertMaterial({ color: TRUNK }));
  stick.position.set(0.3, 0.82, 0.12);
  stick.rotation.x = Math.PI / 3;
  const paper = new Mesh(
    new SphereGeometry(0.1, 10, 8),
    new MeshLambertMaterial({ color: lit ? '#ffd07a' : '#c9a06a', emissive: new Color('#ffb04a'), emissiveIntensity: lit ? 1 : 0 }),
  );
  paper.scale.set(1, 1.25, 1);
  paper.position.set(0.3, 0.8, 0.36);
  out.add(stick, paper);
  return out;
}

const BUILDERS: Record<string, () => Group> = {
  'sign-hush': signHush,
  'sign-whistle-reversed': signWhistleReversed,
  'bunny-sleep': bunnySleep,
  'bunny-family': bunnyFamily,
  fawn,
  'hedgehog-walk': hedgehogWalk,
  'hedgehog-ball': hedgehogBall,
  tanuki: tanukiGroup(1),
  'tanuki-1': tanukiGroup(1),
  'tanuki-2': tanukiGroup(2),
  'tanuki-3': tanukiGroup(3),
  'tanuki-4': tanukiGroup(4),
  'fake-lantern': fakeLantern,
  'firefly-grass': fireflyGrass,
  'night-tree-a': nightTree('night-tree-a', 14, 6, 3),
  'night-tree-b': nightTree('night-tree-b', 18, 8, 4),
  'night-bush': nightBush,
  'glow-mushroom': glowMushroom,
  'moon-meadow': moonMeadow,
  'great-tree': greatTree,
  'plaza-deck': plazaDeck,
  'big-stump': bigStump,
  'log-bridge-end': logBridgeEnd,
  thicket,
  'birdhouse-upside': birdhouseUpside,
  'bell-branch': bellBranch,
  moonstone,
  'lantern-bell': lanternBell,
  'firefly-wait': fireflyWait,
  'firefly-swarm': fireflySwarm('firefly-swarm', 3, 60),
  'firefly-swarm-big': fireflySwarm('firefly-swarm-big', 6, 160),
};

/** The names drawn here (the model viewer lists the ones in assets/models.json's _pending). */
export const NIGHT_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the night forest pieces. */
export function buildNightPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
