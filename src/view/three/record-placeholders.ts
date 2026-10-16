import { type BufferGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';

/**
 * Records drawn in code (docs/PHASE7_FINISH.md §4 items 1 and 4, ticket 0010): the feather on 2-1's treetop, until
 * that stage's set is built. Chapter 1's records (the town board, the headquarters' plans, the balloon on a roof and
 * the empty nest on 1-2's cliff) are built (assets/blender/records.py).
 * Origin at the bottom centre, +Z forward (the side that faces the rail when placed with the right rotationY).
 * Made-up things only: no real maps, vehicles or logos.
 */
const materials = new Map<string, MeshLambertMaterial>();
function mat(color: string): MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

function mesh(geometry: BufferGeometry, color: string, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geometry, mat(color));
  m.position.set(x, y, z);
  return m;
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

const BUILDERS: Record<string, () => Group> = {
  'record-feather': feather,
};

/** Builds the code-drawn record `name`, or null when it is not one of them. */
export function buildRecordPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
