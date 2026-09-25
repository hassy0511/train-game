import {
  BoxGeometry,
  type BufferGeometry,
  Color,
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
 * Stand-ins drawn in code for the giant-tree set of 2-1 (ticket 0007) until its models are built. Same names,
 * sizes and origins as the ticket, so stage JSON does not change when the real models arrive: origin at the
 * bottom centre, +Z forward (a branch log runs along Z).
 */
const BARK = '#7A5A3C';
const BARK_DARK = '#5E4430';
const LEAF = '#5FAE4E';
const LEAF_LIGHT = '#86C865';
const LEAF_DARK = '#3F8A3A';
const ACORN = '#B9803F';
const ACORN_CAP = '#7B5732';
const FUR = '#C8763A';
const FUR_LIGHT = '#F2D3A8';
const CAP = '#D9B38C';
const STEM = '#F4EBDD';

const materials = new Map<string, MeshLambertMaterial>();
function mat(color: string, emissive = 0, double = false): MeshLambertMaterial {
  const key = `${color}|${emissive}|${double}`;
  let m = materials.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true });
    if (double) m.side = DoubleSide;
    if (emissive) m.emissive = new Color(color).multiplyScalar(emissive);
    materials.set(key, m);
  }
  return m;
}

function mesh(geometry: BufferGeometry, color: string, x = 0, y = 0, z = 0, double = false): Mesh {
  const m = new Mesh(geometry, mat(color, 0, double));
  m.position.set(x, y, z);
  return m;
}

/** The giant trunk: 28 m across, 90 m tall, with a flared foot and a few bark ridges. */
function trunk(): Group {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(13, 14, 90, 18), BARK, 0, 45));
  g.add(mesh(new CylinderGeometry(14, 22, 8, 18), BARK_DARK, 0, 4));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ridge = mesh(new CylinderGeometry(1.2, 1.8, 80, 5), BARK_DARK, Math.cos(a) * 13.2, 44, Math.sin(a) * 13.2);
    g.add(ridge);
  }
  return g;
}

/** A leafy crown: a cluster of green balls about 30 m wide. */
function canopy(): Group {
  const g = new Group();
  const balls: [number, number, number, number, string][] = [
    [0, 8, 0, 11, LEAF],
    [9, 6, 3, 8, LEAF_LIGHT],
    [-8, 7, -2, 9, LEAF_DARK],
    [3, 12, -7, 8, LEAF],
    [-4, 4, 8, 7, LEAF_LIGHT],
    [7, 3, -8, 6, LEAF_DARK],
  ];
  for (const [x, y, z, r, c] of balls) g.add(mesh(new SphereGeometry(r, 10, 7), c, x, y, z));
  return g;
}

/** A thick branch log along Z (40 m, top at y = 0 so the track sits on it), thinner towards +Z. */
function branchLog(): Group {
  const g = new Group();
  const log = mesh(new CylinderGeometry(1.2, 1.9, 40, 10), BARK, 0, -1.9, 0);
  log.rotation.x = Math.PI / 2;
  g.add(log);
  // A few leaf tufts along the sides.
  for (const [x, z] of [
    [2.4, -12],
    [-2.6, 4],
    [2.2, 15],
  ]) {
    g.add(mesh(new SphereGeometry(2.2, 8, 6), LEAF, x, -0.8, z));
  }
  return g;
}

/** A huge soft leaf that catches a falling train (bottom centre, 16 × 10 m). */
function leafPad(): Group {
  const g = new Group();
  const leaf = mesh(new SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), LEAF_LIGHT, 0, 0, 0, true);
  leaf.scale.set(8, 1.2, 5);
  g.add(leaf);
  const vein = mesh(new CylinderGeometry(0.15, 0.15, 10, 5), LEAF_DARK, 0, 1.25, 0);
  vein.rotation.z = Math.PI / 2;
  g.add(vein);
  return g;
}

/** An acorn about 1.6 m tall (a big one for a small train), lying on its side ready to roll. */
function acorn(scale = 1): Group {
  const g = new Group();
  const body = mesh(new SphereGeometry(0.75 * scale, 12, 9), ACORN, 0, 0.8 * scale, 0);
  body.scale.set(1, 1.15, 1);
  g.add(body);
  g.add(mesh(new SphereGeometry(0.62 * scale, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ACORN_CAP, 0, 1.25 * scale, 0));
  g.add(mesh(new CylinderGeometry(0.08 * scale, 0.1 * scale, 0.4 * scale, 5), ACORN_CAP, 0, 1.9 * scale, 0));
  return g;
}

/** A squirrel sitting up, 1.4 m tall, facing +Z, with a big curled tail behind. */
function squirrel(): Group {
  const g = new Group();
  const body = mesh(new SphereGeometry(0.45, 10, 8), FUR, 0, 0.55, 0);
  body.scale.set(1, 1.25, 0.9);
  g.add(body);
  g.add(mesh(new SphereGeometry(0.28, 10, 8), FUR_LIGHT, 0, 0.5, 0.25));
  g.add(mesh(new SphereGeometry(0.32, 10, 8), FUR, 0, 1.15, 0.08));
  for (const x of [-0.16, 0.16]) {
    const ear = mesh(new ConeGeometry(0.08, 0.22, 5), FUR, x, 1.48, 0.02);
    g.add(ear);
    g.add(mesh(new SphereGeometry(0.045, 6, 4), '#2B3A4A', x * 0.8, 1.2, 0.37));
  }
  const tail = mesh(new TorusGeometry(0.42, 0.2, 7, 12, Math.PI * 1.4), FUR, 0, 0.95, -0.45);
  tail.rotation.y = Math.PI / 2;
  tail.rotation.z = -0.6;
  g.add(tail);
  return g;
}

/** A twiggy nest ball in a fork (record). */
function squirrelNest(): Group {
  const g = new Group();
  const ball = mesh(new SphereGeometry(1.4, 9, 7), '#8C6A45', 0, 1.3, 0);
  ball.scale.set(1.2, 0.9, 1.1);
  g.add(ball);
  g.add(mesh(new SphereGeometry(0.55, 8, 6), '#3A2A1C', 0, 1.35, 1.25));
  return g;
}

/** A plain mushroom (beige cap, cream stem). */
function mushroom(): Group {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.35, 0.45, 1.2, 8), STEM, 0, 0.6, 0));
  g.add(mesh(new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), CAP, 0, 1.1, 0));
  return g;
}

/**
 * The flat bough the rail wraps around upside down (like 1-3's island slab): 30 wide, 18.8 thick, 40 long, top
 * at y = 0, moss on top and underneath. `boughSlabCap` is its rounded end (half cylinder, towards +Z).
 */
function boughSlab(): Group {
  const g = new Group();
  g.add(mesh(new BoxGeometry(30, 17.6, 40), BARK, 0, -9.4));
  g.add(mesh(new BoxGeometry(30.4, 0.6, 40), LEAF_DARK, 0, -0.3));
  g.add(mesh(new BoxGeometry(30.4, 0.6, 40), LEAF_DARK, 0, -18.5));
  return g;
}

function boughSlabCap(): Group {
  const g = new Group();
  const r = 9.4;
  const cap = mesh(new CylinderGeometry(r, r, 30, 20, 1, false, -Math.PI / 2, Math.PI), BARK, 0, -r, 0);
  cap.rotation.z = Math.PI / 2;
  g.add(cap);
  const band = mesh(new CylinderGeometry(r + 0.3, r + 0.3, 30.4, 20, 1, true, -Math.PI / 2, Math.PI), LEAF_DARK, 0, -r, 0, true);
  band.rotation.z = Math.PI / 2;
  g.add(band);
  return g;
}

const BUILDERS: Record<string, () => Group> = {
  'bough-slab': boughSlab,
  'bough-slab-cap': boughSlabCap,
  'tree-trunk': trunk,
  canopy,
  'branch-log': branchLog,
  'leaf-pad': leafPad,
  acorn: () => acorn(1),
  'acorn-big': () => acorn(1.8),
  squirrel,
  'squirrel-nest': squirrelNest,
  mushroom,
};

/** Builds the code stand-in for `name`, or null when it is not one of the giant-tree set. */
export function buildForestPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
