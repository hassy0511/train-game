import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';

/**
 * Records drawn in code (docs/PHASE7_FINISH.md §4 items 1 and 4, ticket 0010): the empty nest on 1-2's cliff, the
 * feather on 2-1's treetop and 1-1's three (the town board, the headquarters' plans, the balloon on a roof).
 * Origin at the bottom centre, +Z forward (the side that faces the rail when placed with the right rotationY).
 * Made-up things only: no real maps, vehicles or logos.
 */
const materials = new Map<string, MeshLambertMaterial>();
function mat(color: string, double = false): MeshLambertMaterial {
  const key = `${color}|${double}`;
  let m = materials.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true });
    if (double) m.side = DoubleSide;
    materials.set(key, m);
  }
  return m;
}

function mesh(geometry: BufferGeometry, color: string, x = 0, y = 0, z = 0, double = false): Mesh {
  const m = new Mesh(geometry, mat(color, double));
  m.position.set(x, y, z);
  return m;
}

const TWIG = '#8A6440';
const TWIG_DARK = '#5E4430';
const STRAW = '#C9A56A';
const WOOD = '#9A7654';
const WOOD_DARK = '#6E5238';

/** 1-2: an empty nest, 2.6 m across: a ring of twigs with straw sticking out and a dark, empty hollow. */
function nest(): Group {
  const g = new Group();
  const ring = mesh(new TorusGeometry(1.0, 0.36, 6, 14), TWIG, 0, 0.36, 0);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1, 1, 0.8);
  g.add(ring);
  g.add(mesh(new CylinderGeometry(0.95, 0.7, 0.3, 12), TWIG_DARK, 0, 0.15, 0));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const stick = mesh(new CylinderGeometry(0.05, 0.05, 1.3, 4), i % 2 ? STRAW : TWIG, Math.cos(a) * 1.05, 0.5, Math.sin(a) * 1.05);
    stick.rotation.set(Math.sin(a * 3) * 0.6, a, Math.PI / 2 - 0.35);
    g.add(stick);
  }
  // Nothing round in the hollow (it would read as an egg): only a few loose straws lying flat.
  for (const [x, z, a] of [
    [0.2, -0.15, 0.4],
    [-0.25, 0.1, -0.7],
    [0.05, 0.3, 1.6],
  ]) {
    const straw = mesh(new CylinderGeometry(0.035, 0.035, 0.7, 4), STRAW, x, 0.32, z);
    straw.rotation.set(0, a, Math.PI / 2);
    g.add(straw);
  }
  return g;
}

/**
 * 2-1: one big feather (3.2 m) stuck upright in the bark: a quill the whole length, bare at the foot, and two
 * narrow vanes either side of it that taper to the top, white with sky-blue tips.
 */
function feather(): Group {
  const g = new Group();
  const tilt = new Group();
  tilt.rotation.z = -0.25;
  tilt.rotation.x = 0.1;
  tilt.add(mesh(new CylinderGeometry(0.03, 0.08, 3.1, 6), '#CDBF9F', 0, 1.55, 0));
  for (const side of [-1, 1]) {
    // A long ellipse leaning in to the quill at the top reads as one half of a feather's vane.
    const half = new Group();
    half.position.set(side * 0.05, 1.05, 0);
    half.rotation.z = side * 0.1;
    const vane = mesh(new SphereGeometry(1, 10, 8), '#FAFAF6', side * 0.3, 1.05, 0);
    vane.scale.set(0.3, 1.1, 0.05);
    half.add(vane);
    const tip = mesh(new SphereGeometry(1, 8, 6), '#7CC6F0', side * 0.2, 1.8, 0);
    tip.scale.set(0.14, 0.36, 0.06);
    half.add(tip);
    tilt.add(half);
  }
  g.add(tilt);
  return g;
}

/** 1-1: the town's map board (3.2 × 2 m on two posts): park, pond, roads and little houses, all made up. */
function townBoard(): Group {
  const g = new Group();
  for (const x of [-1.4, 1.4]) g.add(mesh(new BoxGeometry(0.18, 2.4, 0.18), WOOD_DARK, x, 1.2, 0));
  g.add(mesh(new BoxGeometry(3.4, 2.1, 0.14), WOOD, 0, 2.35, 0));
  g.add(mesh(new BoxGeometry(3.1, 1.8, 0.04), '#F4EEDC', 0, 2.35, 0.08));
  // Park and pond.
  g.add(mesh(new BoxGeometry(0.9, 0.6, 0.03), '#8CCB6E', -0.9, 2.75, 0.11));
  g.add(mesh(new CylinderGeometry(0.28, 0.28, 0.03, 10), '#7CC6F0', 0.95, 1.95, 0.11).rotateX(Math.PI / 2));
  // Roads: one along, one across.
  g.add(mesh(new BoxGeometry(2.9, 0.14, 0.03), '#9AA0A8', 0, 2.3, 0.115));
  g.add(mesh(new BoxGeometry(0.14, 1.6, 0.03), '#9AA0A8', 0.3, 2.35, 0.115));
  // Little houses (red, yellow, blue roofs).
  const houses: [number, number, string][] = [
    [-1.1, 1.95, '#E86A5A'],
    [-0.5, 1.95, '#F2C14E'],
    [0.85, 2.7, '#5A8FE8'],
  ];
  for (const [x, y, roof] of houses) {
    g.add(mesh(new BoxGeometry(0.3, 0.22, 0.03), '#FFFFFF', x, y, 0.12));
    g.add(mesh(new ConeGeometry(0.22, 0.16, 4), roof, x, y + 0.19, 0.12).rotateY(Math.PI / 4));
  }
  // "You are here": a red dot on the road.
  g.add(mesh(new SphereGeometry(0.1, 6, 4), '#E23B3B', -0.2, 2.3, 0.14));
  // A little roof over the board.
  const roof = mesh(new BoxGeometry(3.7, 0.12, 0.6), '#C0503F', 0, 3.5, 0.1);
  roof.rotation.x = -0.25;
  g.add(roof);
  return g;
}

/** 1-1: the headquarters' notice board (2.6 × 1.7 m) with a blueprint of a made-up train pinned to it. */
function hqPlans(): Group {
  const g = new Group();
  for (const x of [-1.15, 1.15]) g.add(mesh(new BoxGeometry(0.16, 2.2, 0.16), WOOD_DARK, x, 1.1, 0));
  g.add(mesh(new BoxGeometry(2.6, 1.7, 0.12), '#B98A5A', 0, 2.1, 0));
  g.add(mesh(new BoxGeometry(2.0, 1.2, 0.03), '#2F6DB5', 0, 2.1, 0.08));
  const line = (w: number, h: number, x: number, y: number): void => {
    g.add(mesh(new BoxGeometry(w, h, 0.02), '#EAF4FF', x, y, 0.1));
  };
  // A rounded box on two wheels, a window row and a lamp: a toy train, nothing real.
  line(1.4, 0.04, 0, 2.35);
  line(1.4, 0.04, 0, 1.85);
  line(0.04, 0.5, -0.7, 2.1);
  line(0.04, 0.5, 0.7, 2.1);
  for (const x of [-0.4, 0, 0.4]) line(0.22, 0.16, x, 2.18);
  for (const x of [-0.45, 0.45]) {
    const wheel = mesh(new TorusGeometry(0.12, 0.02, 4, 10), '#EAF4FF', x, 1.78, 0.1);
    g.add(wheel);
  }
  g.add(mesh(new SphereGeometry(0.06, 6, 4), '#FFE066', 0.78, 2.0, 0.11));
  // Red pins at the corners.
  for (const [x, y] of [
    [-0.95, 2.65],
    [0.95, 2.65],
  ]) {
    g.add(mesh(new SphereGeometry(0.06, 6, 4), '#E23B3B', x, y, 0.12));
  }
  return g;
}

/** 1-1: a red balloon caught on a roof: 3 m from the knot at the bottom of its string to its top. */
function balloon(): Group {
  const g = new Group();
  g.add(mesh(new SphereGeometry(0.12, 6, 4), '#6E5238', 0, 0.1, 0));
  g.add(mesh(new CylinderGeometry(0.015, 0.015, 1.7, 3), '#FFFFFF', 0, 0.95, 0));
  g.add(mesh(new ConeGeometry(0.12, 0.2, 6), '#D6453A', 0, 1.88, 0).rotateX(Math.PI));
  const body = mesh(new SphereGeometry(0.6, 12, 10), '#E8584A', 0, 2.45, 0);
  body.scale.set(1, 1.18, 1);
  g.add(body);
  // A soft shine.
  g.add(mesh(new SphereGeometry(0.12, 6, 4), '#FFC2BA', -0.22, 2.75, 0.45));
  return g;
}

const BUILDERS: Record<string, () => Group> = {
  'record-nest': nest,
  'record-feather': feather,
  'record-town-board': townBoard,
  'record-hq-plans': hqPlans,
  'record-balloon': balloon,
};

/** Builds the code-drawn record `name`, or null when it is not one of them. */
export function buildRecordPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
