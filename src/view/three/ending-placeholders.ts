import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, type Group, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { hash, mix, part, solid } from './placeholder-kit';

/**
 * v1.12 (えんしゅつ, ticket 0025): the ending movie's diorama "せかいの わ" (src/movies/ending.json), drawn in code
 * until the models are built: a small round island for each chapter (its ground's colour and a sandy rim at the
 * water), and a stand-in for Sakasa's upside-down castle.
 * TODO(PR9): when 6-1's castle stand-in ("sakasa-castle", src/view/three/castle-placeholders.ts on the PR9 branch) is
 * on main, the movie uses it on the castle island instead of "ring-castle", and "ring-castle" goes.
 *
 * Pastel colours, no faces, no letters, no crests. Each island stands in a calm sea (it does not float: no rock
 * hanging under it).
 */

/** Island top (y 0) colours by chapter: ground, its speckles, the rim. */
const ISLES: Record<string, { ground: string; speck: string; rim: string; radius: number }> = {
  // 1: the town and the dino valley: fresh grass.
  'ring-isle-town': { ground: '#9ED67E', speck: '#B9E59A', rim: '#F2E2B0', radius: 34 },
  // 2: the big trees, the meadow and the volcano: deep green.
  'ring-isle-forest': { ground: '#6DBA62', speck: '#8ACB6F', rim: '#E9D7A2', radius: 30 },
  // 3: the sea and the river: sand.
  'ring-isle-sea': { ground: '#F3E2AE', speck: '#FBEFC9', rim: '#F7EAC0', radius: 28 },
  // 4: ice and snow.
  'ring-isle-snow': { ground: '#F4F8FC', speck: '#DCEBF7', rim: '#CFE4F2', radius: 28 },
  // 5: the night forest, the toy town and the mirror world: a dusky blue-green, a little purple.
  'ring-isle-night': { ground: '#55708F', speck: '#7B8FC4', rim: '#C9C3E8', radius: 30 },
  // 6: Sakasa's castle: pastel pink.
  'ring-isle-castle': { ground: '#F4CFE0', speck: '#FBE3EE', rim: '#F3DDC3', radius: 30 },
};

/** How far down each island's side goes (m, under the sea's surface so no gap shows). */
const DEPTH = 4;
/** The sandy rim's height above the island's foot. */
const RIM = 1.0;

/**
 * "ring-isle-<theme>": a round island Ø about 2 × radius m, its top at y 0 (the origin at the top's middle), a sandy
 * band all round where it meets the sea and a soft wavy edge. About 600 triangles.
 */
function isle(name: string): Group {
  const look = ISLES[name];
  const n = 64;
  const radius = (a: number): number => look.radius * (1 + 0.06 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 7 + 2));
  const positions: number[] = [];
  const colors: number[] = [];
  const push = (p: Vector3, c: Color): void => {
    positions.push(p.x, p.y, p.z);
    colors.push(c.r, c.g, c.b);
  };
  const ring = (k: number, y: number, inset: number): Vector3[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = radius(a) * k - inset;
      return new Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
    });
  const top = ring(1, 0, 0);
  const lip = ring(1, -0.4, -0.6);
  const sand = ring(1, -RIM, -2.2);
  const foot = ring(1, -DEPTH, -4);
  const ground = new Color(look.ground);
  const speck = new Color(look.speck);
  const centre = new Vector3(0, 0, 0);
  // The top: a fan, speckled a little (soft patches).
  for (let i = 0; i < n; i++) {
    const a = top[i];
    const b = top[(i + 1) % n];
    const c = hash(a.x, 0, a.z) > 0.6 ? speck : ground;
    push(centre, ground);
    push(a, c);
    push(b, c);
  }
  const band = (upper: Vector3[], lower: Vector3[], cu: Color, cl: Color): void => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(upper[i], cu);
      push(lower[i], cl);
      push(upper[j], cu);
      push(upper[j], cu);
      push(lower[i], cl);
      push(lower[j], cl);
    }
  };
  const rim = new Color(look.rim);
  band(top, lip, ground, mix(look.ground, look.rim, 0.5));
  band(lip, sand, rim, rim);
  band(sand, foot, rim, new Color(look.rim).multiplyScalar(0.8));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return solid(name, [g], undefined, false);
}

/**
 * "ring-castle", about 16 × 20 × 16 m: the stand-in for Sakasa's upside-down castle (TODO(PR9): "sakasa-castle"). It
 * stands on its pink spire, the keep upside down above it (its battlements at the top), two little upside-down towers
 * beside it on their own spires, rows of small round windows (no faces), swirl-pink and lavender.
 */
function castle(): Group {
  const parts: BufferGeometry[] = [];
  const pink = '#FF8DC0';
  const wall = '#FFEAF3';
  const lilac = '#D7C4FF';
  const tower = (x: number, z: number, r: number, h: number, spire: number): void => {
    // The spire (a roof, upside down) on the ground, the tower body above it, the battlements on top.
    parts.push(part(new ConeGeometry(r * 1.25, spire, 18), pink, { at: [x, spire / 2, z], rot: [Math.PI, 0, 0] }));
    parts.push(part(new CylinderGeometry(r, r, h, 18), wall, { at: [x, spire + h / 2, z] }));
    parts.push(part(new CylinderGeometry(r * 1.12, r * 1.12, 0.7, 18), lilac, { at: [x, spire + h + 0.35, z] }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(part(new CylinderGeometry(r * 0.22, r * 0.22, 0.9, 6), lilac, { at: [x + Math.sin(a) * r, spire + h + 1.1, z + Math.cos(a) * r] }));
    }
    // Small round windows in two rows (dots all round: never two eyes and a mouth).
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + row * 0.5;
        const y = spire + h * (0.35 + row * 0.35);
        parts.push(part(new SphereGeometry(r * 0.13, 6, 4), '#7FB6E8', { at: [x + Math.sin(a) * r * 0.98, y, z + Math.cos(a) * r * 0.98], scale: [1, 1.3, 0.5] }));
      }
    }
  };
  tower(0, 0, 3.4, 9, 7);
  tower(-6.5, 1.5, 1.8, 6, 5);
  tower(6.5, -1, 1.8, 6, 5);
  // A pink swirl ring round the keep (Sakasa's mark), and a little flag pole standing up from the top, its flag a swirl.
  parts.push(part(new TorusGeometry(3.6, 0.25, 6, 24), pink, { at: [0, 7 + 4.5, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new CylinderGeometry(0.12, 0.12, 3, 6), '#B58A5A', { at: [0, 7 + 9 + 2.2, 0] }));
  parts.push(part(new TorusGeometry(0.55, 0.14, 6, 14), pink, { at: [0.6, 7 + 9 + 3.2, 0] }));
  return solid('ring-castle', parts);
}

const BUILDERS: Record<string, () => Group> = {
  'ring-castle': castle,
};

/** The drawn stand-in for `name`, or null when it is not one of these. */
export function buildEndingPlaceholder(name: string): Group | null {
  if (name in ISLES) return isle(name);
  const build = BUILDERS[name];
  return build ? build() : null;
}
