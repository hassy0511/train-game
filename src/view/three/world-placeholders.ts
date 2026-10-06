import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { glowMaterial, hash, mix, part, solid } from './placeholder-kit';

/**
 * v1.11 (PR11b, PHASE9_CHAPTER5_6 第 3 部 B11, ticket 0022): the new things of 6-2 つながったせかい drawn in code until their
 * models are built. Everything else in 6-2 is the earlier chapters' models.
 *
 *   world-gate-1/2/3  a cloud arch over the rail (14 × 10 m), a band along its rim in its map page's colour (1 green,
 *                     2 blue, 3 purple). The rail runs through it along ±Z.
 *   cloud-tunnel      a 40 m tube of cloud round the rail (Ø 11 m), white and bright inside, puffy outside.
 *   gate-board-1/2/3  the board before a gate's fork: two little pictures of its page's worlds (no letters, no numbers).
 *   swirl-acorn       record ①, an acorn with a pink swirl on its cap (0.4 m).
 *   left-shell        record ②, a sea snail's shell winding to the left (0.5 m), pink and white.
 *   sakasa-tag        record ③, Sakasa's test tag: a wooden tag with a swirl and a star (no letters), a pink string.
 *   sakasa-hideout    Sakasa's den behind the castle: a little wooden hut with a swirl flag.
 *   bunting           a line of little flags on two poles (12 m), the back platform's party.
 *
 * Origin at the bottom centre, +Z forward (along the rail for the arch, the tunnel and the hut's door), one merged mesh in
 * the shared vertex-coloured material (the tunnel's and the records' a little glowing). No faces, no letters, no logos.
 */

const CLOUD = '#FFFFFF';
const CLOUD_SHADE = '#E4EEF8';
const PAGE: Record<string, string> = { '1': '#6CCB7A', '2': '#5DA9EE', '3': '#A98BE8' };
const PINK = '#E75BA0';
const WOOD = '#C99A62';
const WOOD_DEEP = '#9C7246';
const CREAM = '#FFF4DE';

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);
const puff = (r: number): SphereGeometry => new SphereGeometry(r, 6, 4);
const cloudPaint = (p: Vector3): Color => mix(CLOUD, CLOUD_SHADE, hash(p.x, p.y, p.z) * 0.6);

/** "world-gate-<n>": the cloud arch (half an ellipse 12 m across and 10 m high of cloud puffs, its rim in the page's colour). */
function worldGate(n: string): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    const across = 6.4;
    const high = 9.2;
    const puffs = 9;
    for (let i = 0; i < puffs; i++) {
      const t = (i / (puffs - 1)) * Math.PI;
      const x = Math.cos(t) * across;
      const y = Math.sin(t) * high;
      const r = 1.9 + 0.35 * Math.sin(i * 1.7);
      parts.push(part(puff(r), cloudPaint, { at: [x, Math.max(r * 0.6, y), 0], scale: [1.15, 0.9, 1.1], rot: [0, i * 0.7, 0] }));
    }
    // The rim: a coloured band hugging the inside of the arch.
    parts.push(part(new TorusGeometry(1, 0.32, 3, 12, Math.PI), PAGE[n], { at: [0, 0.6, 0], scale: [across - 1.3, high - 1.6, 1] }));
    // Feet on the ground.
    for (const side of [-1, 1]) parts.push(part(puff(1.9), cloudPaint, { at: [side * across, 0.8, 0], scale: [1.2, 0.7, 1.2] }));
    return solid(`world-gate-${n}`, parts, glowMaterial());
  };
}

/** The triangles of `g` turned inside out (seen from inside: the game culls back faces). */
function inward(g: BufferGeometry): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.getAttribute('position');
  const out: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    for (const k of [0, 2, 1]) out.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
  }
  const r = new BufferGeometry();
  r.setAttribute('position', new Float32BufferAttribute(out, 3));
  r.computeVertexNormals();
  return r;
}

/** "cloud-tunnel": a tube of cloud 40 m long round the rail (radius 5.5 m, its middle 2.5 m up), puffs on its back. */
function cloudTunnel(): Group {
  const parts: BufferGeometry[] = [];
  const length = 40;
  const tube = (): CylinderGeometry => new CylinderGeometry(5.5, 5.5, length, 12, 2, true);
  parts.push(part(tube(), cloudPaint, { at: [0, 2.5, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(inward(tube()), (p) => mix('#FFFFFF', '#F2F7FF', hash(p.x, p.y, p.z)), { at: [0, 2.5, 0], rot: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 6; i++) {
    const z = -length / 2 + 3 + (i * (length - 6)) / 5;
    const a = (hash(i, 1, 2) - 0.5) * 2.2;
    parts.push(part(puff(2.4 + hash(i, 3, 4)), cloudPaint, { at: [Math.sin(a) * 5.4, 2.5 + Math.cos(a) * 5.4, z], scale: [1.2, 0.8, 1.3] }));
  }
  // The rims at both ends, a little thicker.
  for (const z of [-length / 2, length / 2]) parts.push(part(new TorusGeometry(5.7, 0.7, 3, 12), cloudPaint, { at: [0, 2.5, z] }));
  return solid('cloud-tunnel', parts, glowMaterial(), false);
}

/** "gate-board-<n>": a board on two posts (2.4 × 2.6 m) framed in its page's colour, with two little pictures. */
function gateBoard(n: string): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    for (const x of [-1.0, 1.0]) parts.push(part(box(0.14, 2.0, 0.14), WOOD_DEEP, { at: [x, 1.0, 0] }));
    parts.push(part(box(2.4, 1.3, 0.12), PAGE[n], { at: [0, 2.0, 0] }));
    parts.push(part(box(2.1, 1.05, 0.14), CREAM, { at: [0, 2.0, 0] }));
    const left: [number, number, number] = [-0.5, 2.0, 0.09];
    const right: [number, number, number] = [0.5, 2.0, 0.09];
    if (n === '1') {
      // A little house and a tree (the town, the forest).
      parts.push(part(box(0.45, 0.35, 0.05), '#F2C58A', { at: [left[0], 1.85, 0.09] }));
      parts.push(part(new ConeGeometry(0.34, 0.3, 4), '#E06A5A', { at: [left[0], 2.18, 0.09], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.2] }));
      parts.push(part(new ConeGeometry(0.3, 0.6, 6), '#4FA35E', { at: [right[0], 2.05, 0.09], scale: [1, 1, 0.2] }));
    } else if (n === '2') {
      // A wave and a snow mound (the sea, the snow).
      parts.push(part(new TorusGeometry(0.22, 0.07, 3, 8, Math.PI), '#3A8FD8', { at: [left[0], 1.9, 0.09] }));
      parts.push(part(new SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#FFFFFF', { at: right, scale: [1, 1, 0.25] }));
    } else {
      // A crescent moon and a pink castle tower on its point (the night, the castle).
      parts.push(part(new TorusGeometry(0.22, 0.07, 3, 8, Math.PI * 1.2), '#F6D86B', { at: [left[0], 2.0, 0.09], rot: [0, 0, 1.1] }));
      parts.push(part(new ConeGeometry(0.22, 0.32, 6), '#F49AC4', { at: [right[0], 1.85, 0.09], rot: [Math.PI, 0, 0], scale: [1, 1, 0.25] }));
      parts.push(part(box(0.34, 0.32, 0.05), '#F49AC4', { at: [right[0], 2.15, 0.09] }));
    }
    return solid(`gate-board-${n}`, parts);
  };
}

/** "swirl-acorn", 0.4 m: record ①, an acorn (its cap up) with a pink swirl on the cap; origin at its middle. */
function swirlAcorn(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.15, 10, 8), '#C98B4F', { at: [0, -0.04, 0], scale: [1, 1.25, 1] }));
  parts.push(part(new SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#8A5A33', { at: [0, 0.07, 0] }));
  parts.push(part(new CylinderGeometry(0.02, 0.025, 0.08, 6), '#6E4626', { at: [0, 0.2, 0] }));
  parts.push(part(new TorusGeometry(0.1, 0.018, 4, 12), PINK, { at: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new TorusGeometry(0.05, 0.015, 4, 10), PINK, { at: [0, 0.18, 0], rot: [Math.PI / 2, 0, 0] }));
  return solid('swirl-acorn', parts, glowMaterial(), false);
}

/**
 * "left-shell", 0.35 × 0.5 m: record ②, a sea snail's shell winding the other way: whorls (rings) stacked to a point,
 * pink and white in turn, its opening on the left as it stands point up (a usual shell has it on the right). Origin
 * at its middle.
 */
function leftShell(): Group {
  const parts: BufferGeometry[] = [];
  const whorls = 5;
  for (let i = 0; i < whorls; i++) {
    const k = 1 - i / whorls;
    // Each ring a little off the last one's middle, round to the left: a winding, not a stack.
    const a = -i * 1.4;
    parts.push(
      part(new TorusGeometry(0.11 * k + 0.02, 0.055 * k + 0.015, 6, 12), i % 2 ? CREAM : '#F7A8C8', {
        at: [Math.cos(a) * 0.04 * k, -0.12 + i * 0.075, Math.sin(a) * 0.04 * k],
        rot: [Math.PI / 2 + Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3],
      }),
    );
  }
  parts.push(part(new ConeGeometry(0.03, 0.08, 6), '#F7A8C8', { at: [0, -0.12 + whorls * 0.075, 0] }));
  // The opening, low on the left.
  parts.push(part(new SphereGeometry(0.075, 8, 6), CREAM, { at: [-0.13, -0.11, 0.06], scale: [0.8, 1.2, 0.6] }));
  parts.push(part(new SphereGeometry(0.05, 8, 6), '#E58FB3', { at: [-0.15, -0.11, 0.09], scale: [0.7, 1.1, 0.4] }));
  return solid('left-shell', parts, glowMaterial(), false);
}

/** "sakasa-tag", 0.5 × 0.7 m: record ③, a wooden tag on a pink string with a swirl and a star; origin at its middle. */
function sakasaTag(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(0.38, 0.5, 0.05), WOOD, { at: [0, -0.05, 0] }));
  parts.push(part(new TorusGeometry(0.1, 0.02, 4, 12), PINK, { at: [-0.06, -0.12, 0.03] }));
  parts.push(part(new TorusGeometry(0.05, 0.016, 4, 10), PINK, { at: [-0.06, -0.12, 0.035] }));
  parts.push(part(new ConeGeometry(0.07, 0.03, 5), '#F6D86B', { at: [0.1, 0.08, 0.04], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new TorusGeometry(0.09, 0.012, 3, 10, Math.PI), PINK, { at: [0, 0.22, 0] }));
  return solid('sakasa-tag', parts, glowMaterial(), false);
}

/** "sakasa-hideout", 4.5 × 5 × 4 m: Sakasa's den, a little wooden hut with a round window and a swirl flag on its roof. */
function sakasaHideout(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(4.2, 2.6, 3.6), (p) => mix(WOOD, WOOD_DEEP, hash(p.x, p.y, p.z) * 0.4), { at: [0, 1.3, 0] }));
  parts.push(part(new ConeGeometry(3.3, 1.6, 4), '#E987B4', { at: [0, 3.4, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.85] }));
  parts.push(part(box(1.0, 1.7, 0.1), WOOD_DEEP, { at: [0.8, 0.85, 1.81] }));
  parts.push(part(new CylinderGeometry(0.38, 0.38, 0.1, 12), '#FFE7A3', { at: [-1.0, 1.6, 1.81], rot: [Math.PI / 2, 0, 0] }));
  // The flag: a pole on the roof, a pink swirl on a cream flag.
  parts.push(part(new CylinderGeometry(0.05, 0.05, 2.0, 6), '#8C95A1', { at: [0, 5.0, 0] }));
  parts.push(part(box(0.9, 0.6, 0.04), CREAM, { at: [0.48, 5.6, 0] }));
  parts.push(part(new TorusGeometry(0.16, 0.04, 4, 12), PINK, { at: [0.48, 5.6, 0.03] }));
  return solid('sakasa-hideout', parts);
}

/** "bunting", 12 × 3.2 m: little flags on a string between two poles along ±X; origin at the bottom centre. */
function bunting(): Group {
  const parts: BufferGeometry[] = [];
  const colours = ['#F47C7C', '#F6D86B', '#7BD389', '#6FB7F0', '#B79CF0'];
  for (const x of [-6, 6]) parts.push(part(new CylinderGeometry(0.06, 0.07, 3.2, 6), '#E8E2D6', { at: [x, 1.6, 0] }));
  for (let i = 0; i < 11; i++) {
    const x = -5 + i;
    const y = 3.0 - 0.35 * Math.sin(((i + 1) / 12) * Math.PI);
    parts.push(part(new ConeGeometry(0.28, 0.5, 3), colours[i % colours.length], { at: [x, y - 0.3, 0], rot: [Math.PI, 0, 0], scale: [1, 1, 0.15] }));
  }
  return solid('bunting', parts);
}

const BUILDERS: Record<string, () => Group> = {
  'world-gate-1': worldGate('1'),
  'world-gate-2': worldGate('2'),
  'world-gate-3': worldGate('3'),
  'cloud-tunnel': cloudTunnel,
  'gate-board-1': gateBoard('1'),
  'gate-board-2': gateBoard('2'),
  'gate-board-3': gateBoard('3'),
  'swirl-acorn': swirlAcorn,
  'left-shell': leftShell,
  'sakasa-tag': sakasaTag,
  'sakasa-hideout': sakasaHideout,
  bunting,
};

/** 6-2's stand-in for `name`, or null when it is not one of them. */
export function buildWorldPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}

/** Every model drawn here (assets/models.json "_pending"). */
export const WORLD_PLACEHOLDERS = Object.keys(BUILDERS);
