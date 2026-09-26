import {
  BoxGeometry,
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
 * Stand-ins drawn in code for the sky set (ticket 0006) until its models are built. Same names, sizes and
 * origins as the ticket, so stage JSON does not change when the real models arrive: islands have the origin
 * at the top centre (top at y = 0), everything else at the bottom centre; +Z is forward.
 */
const GRASS = '#8ED66B';
const ROCK = '#C9B8A8';
const ROCK_DARK = '#A8978A';
const CLOUD = '#FFFFFF';
const CLOUD_SHADE = '#DCE9F5';
const GOLD = '#FFD166';

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

function mesh(geometry: import('three').BufferGeometry, color: string, x = 0, y = 0, z = 0, emissive = 0): Mesh {
  const m = new Mesh(geometry, mat(color, emissive));
  m.position.set(x, y, z);
  return m;
}

/** Floating island: a grass disc on top of an upside-down rock cone. `w`, `d` are the top's width and depth. */
function island(w: number, h: number, d: number, seed: number): Group {
  const g = new Group();
  const top = mesh(new CylinderGeometry(0.5, 0.5, 1, 14), GRASS, 0, -0.45);
  top.scale.set(w, 0.9, d);
  const rock = mesh(new ConeGeometry(0.5, 1, 10), ROCK, 0, -0.9 - (h - 0.9) / 2);
  rock.rotation.x = Math.PI;
  rock.scale.set(w * 0.96, h - 0.9, d * 0.96);
  g.add(top, rock);
  // A couple of pebbles hanging under the rock.
  for (let i = 0; i < 2; i++) {
    const a = seed + i * 2.4;
    const p = mesh(new SphereGeometry(0.6 + i * 0.3, 6, 4), ROCK_DARK, Math.cos(a) * w * 0.12, -h - 0.8 - i, Math.sin(a) * d * 0.12);
    g.add(p);
  }
  return g;
}

/** The long slab the train loops around: flat grass on top and bottom, rock sides. Top y = 0, bottom y = -18.8. */
function flipSlab(): Group {
  const g = new Group();
  g.add(mesh(new BoxGeometry(30, 17.6, 40), ROCK, 0, -9.4));
  g.add(mesh(new BoxGeometry(30.4, 0.6, 40), GRASS, 0, -0.3));
  g.add(mesh(new BoxGeometry(30.4, 0.6, 40), GRASS, 0, -18.5));
  return g;
}

/** Rounded end of the slab (half cylinder, axis across): the rail wraps around it. Extends toward +Z. */
function flipCap(): Group {
  const g = new Group();
  const r = 9.4;
  // Cylinder vertices sit at (sin θ, cos θ) in its local x/z; θ in [-π/2, π/2] is the half toward +Z.
  const cap = mesh(new CylinderGeometry(r, r, 30, 20, 1, false, -Math.PI / 2, Math.PI), ROCK, 0, -r, 0);
  cap.rotation.z = Math.PI / 2;
  g.add(cap);
  // Grass band on the curve (thin shell just outside the rock). It is open, so it draws both faces; its own material
  // keeps the shared GRASS one-sided, so island grass bakes together with the rock.
  const band = new Mesh(new CylinderGeometry(r + 0.3, r + 0.3, 30.4, 20, 1, true, -Math.PI / 2, Math.PI), mat(GRASS, 0, true));
  band.position.set(0, -r, 0);
  band.rotation.z = Math.PI / 2;
  g.add(band);
  return g;
}

function cloud(w: number, h: number, d: number, puffs: number, seed: number): Group {
  const g = new Group();
  for (let i = 0; i < puffs; i++) {
    const t = puffs === 1 ? 0 : i / (puffs - 1) - 0.5;
    const r = h * (0.55 + 0.35 * Math.abs(Math.sin(seed + i * 1.7)));
    // Clouds glow a little so their shaded side stays white instead of turning grey.
    const p = mesh(new SphereGeometry(r, 10, 7), i % 3 === 2 ? CLOUD_SHADE : CLOUD, t * (w - r * 1.6), r * 0.75, Math.sin(seed * 3 + i) * d * 0.2, 0.55);
    p.scale.set(1, 0.8, d / w + 0.6);
    g.add(p);
  }
  return g;
}

function jumpPad(): Group {
  const g = new Group();
  g.add(mesh(new BoxGeometry(4, 0.2, 6), GOLD, 0, 0.1, 0, 0.25));
  g.add(mesh(new CylinderGeometry(1.1, 1.1, 0.12, 20), '#FFF3B0', 0, 0.26, 0, 0.6));
  const lip = mesh(new BoxGeometry(4.2, 0.5, 0.4), GOLD, 0, 0.35, 2.9, 0.25);
  lip.rotation.x = -0.5;
  g.add(lip);
  return g;
}

/** A hoop the train runs through in an updraft stretch (centre 2.2 m above the rail). */
function updraftRing(): Group {
  const g = new Group();
  const ring = mesh(new TorusGeometry(3.4, 0.22, 8, 28), CLOUD, 0, 3.6, 0, 0.35);
  g.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const arrow = mesh(new ConeGeometry(0.35, 0.8, 6), '#BFE6FF', Math.cos(a) * 3.4, 3.6 + Math.sin(a) * 3.4, 0, 0.4);
    arrow.rotation.x = Math.PI / 2;
    g.add(arrow);
  }
  return g;
}

function skyBuoy(): Group {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.06, 0.06, 1.6, 6), '#3A3F47', 0, 0.8));
  g.add(mesh(new SphereGeometry(0.45, 12, 8), GOLD, 0, 1.9, 0, 0.3));
  const flag = mesh(new BoxGeometry(0.02, 0.3, 0.5), '#E9573F', 0, 2.35, 0.25);
  g.add(flag);
  return g;
}

function weathervane(): Group {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.06, 0.08, 2.6, 6), '#3A3F47', 0, 1.3));
  g.add(mesh(new BoxGeometry(1.1, 0.06, 0.06), GOLD, 0, 2.2));
  g.add(mesh(new BoxGeometry(0.06, 0.06, 1.1), GOLD, 0, 2.2));
  g.add(mesh(new ConeGeometry(0.12, 0.35, 6), GOLD, 0, 2.75, 0.55).rotateX(Math.PI / 2));
  const bird = mesh(new SphereGeometry(0.28, 10, 7), '#5FA8E6', 0, 3.0, -0.05);
  bird.scale.set(0.7, 0.8, 1.2);
  g.add(bird);
  return g;
}

function cloudCrystal(): Group {
  const g = new Group();
  for (let i = 0; i < 4; i++) {
    const h = 0.9 - i * 0.15;
    const p = mesh(new CylinderGeometry(0.1, 0.1, h, 6), CLOUD_SHADE, (i - 1.5) * 0.12, h / 2, (i % 2) * 0.1, 0.35);
    p.rotation.z = (i - 1.5) * 0.25;
    g.add(p);
  }
  return g;
}

const BUILDERS: Record<string, () => Group> = {
  'island-a': () => island(24, 12, 24, 1),
  'island-b': () => island(40, 16, 28, 2),
  'island-c': () => island(12, 8, 12, 3),
  'island-flip': flipSlab,
  'island-flip-cap': flipCap,
  'cloud-a': () => cloud(8, 3, 5, 4, 1),
  'cloud-b': () => cloud(14, 4, 8, 6, 2),
  'cloud-bounce': () => cloud(16, 5, 16, 7, 3),
  'cloud-wall': () => cloud(20, 12, 6, 7, 4),
  'jump-pad': jumpPad,
  'updraft-ring': updraftRing,
  'sky-buoy': skyBuoy,
  weathervane,
  'cloud-crystal': cloudCrystal,
};

/** A code-built stand-in for a sky-set model, or null when there is none for this name. */
export function buildSkyPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
