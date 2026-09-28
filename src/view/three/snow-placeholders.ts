import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp01, eyes, hash, kitMaterial, merge, mix, part, solid } from './placeholder-kit';

/**
 * Stand-ins drawn in code for the snowy mountain set of 4-3 (ticket 0017 「ゆきやまの トンネル」) until its models are
 * built. Origin at the bottom centre, +Z forward (the snow wave's front, the portal's outside, the false exit's
 * picture); one merged mesh per model in the shared vertex-coloured material. Snow is never plain white: it shades to a
 * light blue. Faces only on the snowmen and the hare: two round dark eyes (and the snowmen's small orange nose); no
 * mouth, teeth or brows; no top hat, pipe or twig hair (not like any known snowman character). The snow wave has no
 * face at all: round soft balls only, no spikes. The false exit's swirl and the exit's light have materials of their own
 * (setFakeExitGlow; the exit light ignores the fog).
 */
const SNOW = '#FBFDFF';
const SNOW_SHADE = '#DCE6F2';
const SNOW_DEEP = '#C9DBEA';
const ROCK = '#8A96A3';
const ROCK_DARK = '#707C89';
const STONE = '#7C8591';
const STONE_DARK = '#666F7B';
const ICE = '#BFE3F5';
const ICE_DEEP = '#6C93B5';
const ICICLE = '#D8F0FF';
const HAT = '#4FA36B';
const SCARF = '#F2C14E';
const TWIG = '#7A5234';
const NOSE = '#F28A3B';
const LOG = '#A8744A';
const LOG_DARK = '#8A5C36';
const WINDOW = '#FFD45C';
const FENCE = '#9A6B45';
const GOLD = '#E8B93A';
const GOLD_DARK = '#C2932A';
const CORD = '#D9483B';
const HARE_EAR = '#D9B99B';
const SWIRL = '#FF7FBF';

const ramp = (v: number, a: number, b: number): number => clamp01((v - a) / (b - a));
/** Snow shading from white at `top` to a light blue at `low`. */
const snowy =
  (top: number, low: number) =>
  (p: Vector3): Color =>
    mix(SNOW, SNOW_SHADE, ramp(p.y, top, low));

const ball = (r: number, w = 10, h = 7): SphereGeometry => new SphereGeometry(r, w, h);

let snowLit: MeshLambertMaterial | null = null;
/**
 * Snow that lights itself a little (its colour adds to the light it gets), so its shaded side stays a soft light blue
 * rather than going grey: the snow wave, the snowmen, the heaps and the mountain's snow.
 */
function snowMaterial(side: typeof DoubleSide | undefined = undefined): MeshLambertMaterial {
  if (!side && snowLit) return snowLit;
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: true, ...(side ? { side } : {}) });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.45;');
  };
  m.customProgramCacheKey = () => 'snow-lit';
  if (!side) snowLit = m;
  return m;
}

// ---- the snow wave and the snowmen ----

/**
 * The snow wave "もこもこ", 36 × 9 × 16 m, its front along +Z: nine round, flattened balls of snow side by side with five
 * more behind and above, white on top shading to a light blue below. Round only: no spikes, no face. (The game rolls
 * and puffs it as a whole.)
 */
function snowWave(): Group {
  const parts: BufferGeometry[] = [];
  const paint = snowy(8, 0);
  for (let i = 0; i < 9; i++) {
    const x = -16 + i * 4;
    const r = 3.2 + hash(i, 1, 2) * 0.8;
    parts.push(part(ball(1, 8, 6), paint, { at: [x, r * 0.8, 4 + hash(i, 2, 3) * 1.5], scale: [r * 1.05, r * 0.85, r] }));
  }
  for (let i = 0; i < 5; i++) {
    const x = -14 + i * 7;
    const r = 4.2 + hash(i, 4, 5);
    parts.push(part(ball(1, 8, 6), paint, { at: [x, r * 0.95 + 1.4, -2.5], scale: [r * 1.2, r, r * 1.1] }));
  }
  return solid('snow-wave', parts, snowMaterial());
}

/** Two twig arms (little forks at the ends), sticking out left and right at height `y`, radius `r`. */
function twigArms(y: number, r: number, up: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    out.push(part(new CylinderGeometry(0.035, 0.045, 0.9, 5), TWIG, { at: [side * (r + 0.35), y + 0.15 * up, 0], rot: [0, 0, side * (Math.PI / 2 - 0.45 * up)] }));
    out.push(part(new CylinderGeometry(0.025, 0.03, 0.28, 4), TWIG, { at: [side * (r + 0.72), y + 0.42 * up, 0], rot: [0, 0, side * 0.3] }));
  }
  return out;
}

/**
 * A snowman, 1.8 × 2.6 × 1.8 m: a big ball Ø1.8 and a head Ø1.1, a green knitted hat with a white pompom, a yellow scarf,
 * twig arms; two round eyes and a small orange nose (no mouth). Facing +Z.
 */
function snowman(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(ball(0.9, 12, 8), snowy(1.6, 0), { at: [0, 0.85, 0] }));
  parts.push(part(ball(0.55, 12, 8), snowy(2.4, 1.4), { at: [0, 1.95, 0] }));
  parts.push(part(new TorusGeometry(0.46, 0.12, 5, 14), SCARF, { at: [0, 1.52, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new BoxGeometry(0.2, 0.5, 0.08), SCARF, { at: [0.25, 1.3, 0.45], rot: [0.2, 0, 0.15] }));
  parts.push(part(new CylinderGeometry(0.34, 0.46, 0.34, 12, 1), HAT, { at: [0, 2.42, 0] }));
  parts.push(part(ball(0.12, 7, 5), SNOW, { at: [0, 2.66, 0] }));
  parts.push(...eyes(0.18, 2.02, 0.47, 0.065));
  parts.push(part(new ConeGeometry(0.07, 0.3, 6), NOSE, { at: [0, 1.9, 0.62], rot: [Math.PI / 2, 0, 0] }));
  parts.push(...twigArms(1.2, 0.8, 1));
  return solid('snowman', parts, snowMaterial());
}

/**
 * Sakasa's upside-down snowman, 1.8 × 2.8 × 1.8 m: the big ball on top of the small one, the hat upside down on the
 * lower ball; eyes and nose on the big ball. Wobbly on purpose.
 */
function snowmanUpside(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(ball(0.5, 12, 8), snowy(1, 0), { at: [0, 0.5, 0] }));
  parts.push(part(ball(0.9, 12, 8), snowy(2.8, 1.1), { at: [0, 1.85, 0] }));
  // The hat upside down round the small ball (its brim up).
  parts.push(part(new CylinderGeometry(0.46, 0.34, 0.34, 12, 1), HAT, { at: [0, 0.3, 0] }));
  parts.push(part(ball(0.12, 7, 5), SNOW, { at: [0, 0.08, 0.35] }));
  parts.push(...eyes(0.26, 2.05, 0.8, 0.08));
  parts.push(part(new ConeGeometry(0.08, 0.34, 6), NOSE, { at: [0, 1.88, 0.98], rot: [Math.PI / 2, 0, 0] }));
  parts.push(...twigArms(0.75, 0.45, -1));
  return solid('snowman-upside', parts, snowMaterial());
}

/** Snow fallen on the rail from a pine's boughs, 3 × 1.3 × 2.5 m: a soft heap with one little twig on top. */
function snowPile(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), snowy(1.2, 0), { scale: [1.5, 1.2, 1.25] }));
  parts.push(part(ball(1, 8, 5), snowy(1.2, 0), { at: [0.5, 0.5, 0.3], scale: [0.7, 0.7, 0.6] }));
  parts.push(part(new CylinderGeometry(0.03, 0.04, 0.8, 4), TWIG, { at: [-0.2, 1.3, 0], rot: [0, 0, 0.9] }));
  return solid('snow-pile', parts, snowMaterial());
}

// ---- the mountain, the tunnel and the ice hall ----

/**
 * The snowy ridge the tunnel runs under, 1100 × 200 × 500 m: level on top (200 m) within 80 m of its middle line (x),
 * slowly down to 88 m 214 m out, then a steep snowy cliff to the ground 242 m out (the tunnel's mouths are in the
 * cliffs); both ends rounded down. Grey rock streaks, more rock on the cliffs.
 */
function snowRidge(): Group {
  const xs: number[] = [];
  for (let x = -550; x <= 550; x += 22) xs.push(x);
  const zs = [-250, -242, -236, -229, -222, -214, -190, -160, -125, -80, -40, 0, 40, 80, 125, 160, 190, 214, 222, 229, 236, 242, 250];
  const across = (d: number): number => {
    const a = Math.abs(d);
    if (a <= 80) return 200;
    if (a <= 214) return 200 - (112 * (1 - Math.cos(((a - 80) / 134) * (Math.PI / 2))));
    if (a <= 242) return 88 * (1 - (a - 214) / 28);
    return 0;
  };
  const along = (x: number): number => {
    const a = Math.abs(x);
    return a < 480 ? 1 : Math.max(0, Math.cos(((a - 480) / 70) * (Math.PI / 2)));
  };
  const h = (x: number, z: number): number => across(z) * along(x);
  const pts: number[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      const [x0, x1, z0, z1] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
      const a = [x0, h(x0, z0), z0];
      const b = [x1, h(x1, z0), z0];
      const c = [x1, h(x1, z1), z1];
      const d = [x0, h(x0, z1), z1];
      pts.push(...a, ...d, ...c, ...a, ...c, ...b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  const paint = (p: Vector3): Color => {
    const cliff = Math.abs(p.z) > 205 && p.y > 4 && p.y < 90;
    const streak = hash(Math.round(p.x / 40), Math.round(p.y / 25), 7) > (cliff ? 0.45 : 0.9);
    if (streak) return mix(ROCK, ROCK_DARK, hash(Math.round(p.x / 13), Math.round(p.y / 13), 3));
    return mix(SNOW, SNOW_SHADE, 0.2 + 0.5 * ramp(p.y, 200, 0));
  };
  return solid('snow-ridge', [part(g, paint)], snowMaterial());
}

/**
 * A tunnel's mouth, 14 × 12 × 10 m, its outside towards +Z: a round arch of grey stones (the opening 9 m wide and 8 m
 * high, as the tube), a hood reaching 8 m out, snow heaped on top and seven icicles along its lip.
 */
function tunnelPortal(): Group {
  const parts: BufferGeometry[] = [];
  const stone = (p: Vector3): Color => mix(STONE, STONE_DARK, hash(Math.round(p.x * 1.3), Math.round(p.y * 1.3), Math.round(p.z)) * 0.8);
  // The side walls up to the arch's spring (3.5 m), then the stones of the arch (radius 4.5 to 6.3).
  for (const side of [-1, 1]) parts.push(part(new BoxGeometry(1.8, 3.6, 10), stone, { at: [side * 5.4, 1.8, 3] }));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (i + 0.5)) / n;
    parts.push(part(new BoxGeometry(1.8, 1.55, 10), stone, { at: [Math.cos(a) * 5.4, 3.5 + Math.sin(a) * 5.4, 3], rot: [0, 0, a - Math.PI / 2] }));
  }
  // Snow heaped on the hood.
  parts.push(part(new SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), snowy(12.5, 9), { at: [0, 9.2, 3], scale: [7, 2.6, 5.4] }));
  // Icicles along the lip.
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * (i + 1)) / 8;
    const len = 0.7 + hash(i, 5, 1) * 0.9;
    parts.push(part(new ConeGeometry(0.16, len, 5), ICICLE, { at: [Math.cos(a) * 4.6, 3.5 + Math.sin(a) * 4.6 - len / 2, 7.9], rot: [Math.PI, 0, 0] }));
  }
  return solid('tunnel-portal', parts);
}

/**
 * The ice hall inside the mountain, 76 × 18 × 172 m, seen from inside: a pale blue dome (lighter up top), a snowy floor.
 * Its dome is drawn from inside (back faces).
 */
function iceHall(): Group {
  const g = new Group();
  const dome = part(new SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), (p) => mix(ICE, ICE_DEEP, ramp(p.y, 0.95, 0.05) * 0.8), { scale: [38, 18, 86] });
  const inside = new Mesh(merge([dome]), new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }));
  inside.name = 'ice-hall';
  g.add(inside);
  const floor = part(new CircleGeometry(1, 20), (p) => mix(SNOW, SNOW_SHADE, 0.3 + 0.3 * hash(Math.round(p.x * 4), 0, Math.round(p.y * 4))), {
    rot: [-Math.PI / 2, 0, 0],
    scale: [38, 86, 1],
    at: [0, 0.02, 0],
  });
  const floorMesh = new Mesh(merge([floor]), kitMaterial());
  floorMesh.name = 'ice-hall-floor';
  g.add(floorMesh);
  return g;
}

/** A pillar of ice in the hall, 3 × 18 × 3 m: a little narrower in the middle, pale see-through blue (drawn solid). */
function icePillar(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(1.2, 1.5, 18, 7, 3), (p) => mix(ICE, ICE_DEEP, 0.2 + 0.4 * hash(Math.round(p.x * 2), Math.round(p.y / 3), 1)), { at: [0, 9, 0] }));
  return solid('ice-pillar', parts);
}

let fakeGlow: MeshLambertMaterial | null = null;
/** The swirl on the false exit: faint until the light shows it, then glowing pink (setFakeExitGlow). */
function fakeGlowMaterial(): MeshLambertMaterial {
  fakeGlow ??= new MeshLambertMaterial({ vertexColors: true, emissive: new Color(SWIRL), emissiveIntensity: 0 });
  return fakeGlow;
}

/** v1.10 (4-3): how much the false exit's swirl glows (0 = hardly seen, 1 = seen through with the light). */
export function setFakeExitGlow(k: number): void {
  const m = fakeGlowMaterial();
  m.emissiveIntensity = 1.1 * k;
  m.opacity = 0.35 + 0.65 * k;
  m.transparent = k < 1;
}

/**
 * The false exit Sakasa painted on the ice wall, 10 × 8 × 1 m, its picture on +Z: a round white "way out" with pine
 * shadows in it on a slab of ice, and a swirl in the middle that only shows in the light.
 */
function fakeExit(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(10, 8, 1), (p) => mix(ICE, ICE_DEEP, 0.3 + 0.3 * ramp(p.y, 4, -4)), { at: [0, 4, 0] }));
  // Pine shadows painted in the way out.
  for (const [x, s] of [[-1.6, 1], [1.2, 1.3], [2.3, 0.8]] as const) {
    parts.push(part(new ConeGeometry(0.6 * s, 2 * s, 3), '#9FB7C9', { at: [x, 1.4 + s, 0.56], scale: [1, 1, 0.05] }));
  }
  const g = solid('fake-exit', parts);
  // The painted way out: a white round-topped opening that shines through the tunnel's dark like the real one.
  const light = new MeshBasicMaterial({ color: '#F7FBFF', fog: false });
  const opening = merge([
    part(new CircleGeometry(3.2, 16, 0, Math.PI), '#FFFFFF', { at: [0, 1.2, 0.52], scale: [1, 1.5, 1] }),
    part(new BoxGeometry(6.4, 1.2, 0.02), '#FFFFFF', { at: [0, 0.6, 0.52] }),
  ]);
  const shine = new Mesh(opening, light);
  shine.name = 'fake-exit-light';
  g.add(shine);
  // The swirl: a spiral ribbon in the middle.
  const pts: number[] = [];
  const turns = 2.2;
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * turns * Math.PI * 2;
    const a1 = ((i + 1) / steps) * turns * Math.PI * 2;
    const r0 = 0.15 + (i / steps) * 1.4;
    const r1 = 0.15 + ((i + 1) / steps) * 1.4;
    const w = 0.12;
    const p = (a: number, r: number): [number, number, number] => [Math.cos(a) * r, 3.4 + Math.sin(a) * r, 0.6];
    const [a, b, c, d] = [p(a0, r0 - w), p(a1, r1 - w), p(a1, r1 + w), p(a0, r0 + w)];
    pts.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const sg = new BufferGeometry();
  sg.setAttribute('position', new Float32BufferAttribute(pts, 3));
  sg.computeVertexNormals();
  const swirl = new Mesh(merge([part(sg, SWIRL)]), fakeGlowMaterial());
  swirl.name = 'fake-exit-swirl';
  g.add(swirl);
  setFakeExitGlow(0);
  return g;
}

/** The daylight at a tunnel's end, 8 × 7 × 0.1 m: a white round disc that the fog does not hide (seen from far in). */
function exitGlow(): Group {
  const g = new Group();
  const disc = new Mesh(new CircleGeometry(4, 16, 0, Math.PI), new MeshBasicMaterial({ color: '#F7FBFF', fog: false, side: DoubleSide }));
  disc.scale.set(1, 1.75, 1);
  const low = new Mesh(new BoxGeometry(8, 0.01, 0.01), new MeshBasicMaterial({ color: '#F7FBFF', fog: false }));
  disc.position.y = 0;
  disc.name = 'exit-glow';
  g.add(disc, low);
  return g;
}

// ---- the way down, the lodge ----

/**
 * The snow fence the wave runs into, 70 × 5 × 1.5 m (across the track along X): a gate of two posts and a beam over the
 * track (6 m wide inside), and a wooden fence 30 m each side, snow on top.
 */
function snowFence(): Group {
  const parts: BufferGeometry[] = [];
  const wood = (p: Vector3): Color => mix(FENCE, '#7A5234', hash(Math.round(p.x), 0, 1) * 0.5);
  for (const side of [-1, 1]) {
    parts.push(part(new BoxGeometry(0.5, 5, 0.5), wood, { at: [side * 3.4, 2.5, 0] }));
    // The fence: posts every 3 m and two rails.
    for (let x = 5; x <= 35; x += 3) parts.push(part(new BoxGeometry(0.25, 2.6, 0.25), wood, { at: [side * x, 1.3, 0] }));
    for (const y of [0.9, 2]) parts.push(part(new BoxGeometry(30, 0.3, 0.12), wood, { at: [side * 20, y, 0] }));
    parts.push(part(new BoxGeometry(30, 0.35, 0.6), snowy(2.8, 2.2), { at: [side * 20, 2.5, 0] }));
  }
  parts.push(part(new BoxGeometry(7.4, 0.5, 0.6), wood, { at: [0, 5, 0] }));
  parts.push(part(new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), snowy(5.9, 5.2), { at: [0, 5.2, 0], scale: [3.9, 0.6, 0.6] }));
  return solid('snow-fence', parts);
}

/**
 * The mountain lodge, 14 × 10 × 10 m: a log cabin, a steep roof deep in snow, a stone chimney, warm yellow windows and
 * a door towards +Z.
 */
function lodge(): Group {
  const parts: BufferGeometry[] = [];
  for (let y = 0.3; y < 4.6; y += 0.6) {
    parts.push(part(new CylinderGeometry(0.3, 0.3, 12, 6), (p) => mix(LOG, LOG_DARK, hash(0, Math.round(y * 10), Math.round(p.y))), { at: [0, y, 4], rot: [0, 0, Math.PI / 2] }));
    parts.push(part(new CylinderGeometry(0.3, 0.3, 12, 6), LOG_DARK, { at: [0, y, -4], rot: [0, 0, Math.PI / 2] }));
    for (const side of [-1, 1]) parts.push(part(new CylinderGeometry(0.3, 0.3, 8.6, 6), LOG, { at: [side * 5.7, y, 0], rot: [Math.PI / 2, 0, 0] }));
  }
  // The roof: a snowy triangular prism.
  const roof = new CylinderGeometry(1, 1, 13.4, 3, 1);
  parts.push(part(roof, snowy(9.5, 5), { at: [0, 6.6, 0], rot: [0, 0, Math.PI / 2], scale: [2.8, 1, 6.2] }));
  parts.push(part(new BoxGeometry(1.2, 4, 1.2), STONE, { at: [3.6, 8, -1.5] }));
  for (const x of [-3, 3]) parts.push(part(new BoxGeometry(1.6, 1.3, 0.1), WINDOW, { at: [x, 2.4, 4.35] }));
  parts.push(part(new BoxGeometry(1.4, 2.4, 0.1), '#6B4E3A', { at: [0, 1.2, 4.35] }));
  return solid('lodge', parts);
}

// ---- the records ----

/** Record ①: a white hare curled up in the snow, 0.6 × 0.5 × 0.8 m: round, eyes only, light brown ear tips. */
function snowHare(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(ball(0.3, 10, 7), '#FFFFFF', { at: [0, 0.24, -0.08], scale: [1, 0.8, 1.2] }));
  parts.push(part(ball(0.17, 9, 6), '#FFFFFF', { at: [0, 0.34, 0.22] }));
  for (const side of [-1, 1]) {
    parts.push(part(ball(0.06, 6, 4), '#FFFFFF', { at: [side * 0.07, 0.5, 0.14], scale: [0.7, 2.2, 0.6], rot: [-0.5, 0, side * 0.2] }));
    parts.push(part(ball(0.035, 5, 3), HARE_EAR, { at: [side * 0.09, 0.62, 0.08] }));
  }
  parts.push(...eyes(0.07, 0.37, 0.36, 0.022));
  return solid('snow-hare', parts);
}

/** Record ②: an ice flower from the bottom of the pond, 1.2 × 0.8 × 1.2 m: six clear blue petals round a white heart. */
function iceFlower(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(part(new ConeGeometry(0.2, 0.62, 5), (p) => mix(ICE, ICE_DEEP, ramp(p.y, 0.3, -0.3) * 0.6), { at: [Math.sin(a) * 0.3, 0.32, Math.cos(a) * 0.3], rot: [0.9, a, 0] }));
  }
  parts.push(part(ball(0.14, 8, 6), '#F4FBFF', { at: [0, 0.3, 0] }));
  parts.push(part(new CylinderGeometry(0.5, 0.55, 0.1, 10), ICE_DEEP, { at: [0, 0.05, 0] }));
  return solid('ice-flower', parts);
}

/** Record ③: sleigh bells in the snow, 0.5 × 0.6 × 0.5 m: three round gold bells on a red cord. */
function sleighBell(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new TorusGeometry(0.18, 0.025, 4, 12), CORD, { at: [0, 0.4, 0] }));
  for (const [x, y] of [[-0.14, 0.18], [0.14, 0.18], [0, 0.42]] as const) {
    parts.push(part(ball(0.11, 9, 6), (p) => mix(GOLD, GOLD_DARK, ramp(p.y, 0.1, -0.1)), { at: [x, y, 0.05] }));
    parts.push(part(new BoxGeometry(0.12, 0.015, 0.02), '#6E5418', { at: [x, y - 0.03, 0.15] }));
  }
  return solid('sleigh-bell', parts);
}

/**
 * The knoll the melting pond sits on, 104 × 40.2 × 154 m: the mountain's lower slope with a flat snowy top at 40.2 m
 * round a hole the shape of the pond (34 × 84 m, round ends, 4-3's `environment.water`), rounded sides down to the
 * ground. Seen from outside the pond is a pond in the snow, not a tank.
 */
function snowKnoll(): Group {
  const straight = 25;
  const rings: [number, number][] = [
    [17, 40.2],
    [27, 40.2],
    [36, 31],
    [45, 13],
    [52, 0],
  ];
  const n = 18;
  const outline = (r: number, y: number): Vector3[] => {
    const out: Vector3[] = [];
    for (const [cz, a0] of [[straight, 0], [-straight, Math.PI]] as const) {
      for (let i = 0; i <= n; i++) {
        const a = a0 + (Math.PI * i) / n;
        out.push(new Vector3(Math.cos(a) * r, y, cz + Math.sin(a) * r));
      }
    }
    return out;
  };
  const loops = rings.map(([r, y]) => outline(r, y));
  const pts: number[] = [];
  for (let j = 0; j + 1 < loops.length; j++) {
    const a = loops[j];
    const b = loops[j + 1];
    for (let i = 0; i < a.length; i++) {
      const i1 = (i + 1) % a.length;
      pts.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z, b[i1].x, b[i1].y, b[i1].z);
      pts.push(a[i].x, a[i].y, a[i].z, b[i1].x, b[i1].y, b[i1].z, a[i1].x, a[i1].y, a[i1].z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return solid('snow-knoll', [part(g, (p) => mix(SNOW, SNOW_SHADE, 0.15 + 0.55 * ramp(p.y, 40, 0)))], snowMaterial(DoubleSide));
}

/** A copy of `build`'s model scaled by `k` (the cutscenes' little snow wave and big snowman: a spawn has no scale). */
function scaled(name: string, build: () => Group, k: number): () => Group {
  return () => {
    const g = build();
    const mesh = g.children[0] as Mesh;
    mesh.geometry.scale(k, k, k);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    mesh.name = name;
    return g;
  };
}

const BUILDERS: Record<string, () => Group> = {
  'snow-wave': snowWave,
  'snow-wave-small': scaled('snow-wave-small', snowWave, 0.5),
  snowman,
  'snowman-big': scaled('snowman-big', snowman, 2.2),
  'snow-knoll': snowKnoll,
  'snowman-upside': snowmanUpside,
  'snow-pile': snowPile,
  'snow-ridge': snowRidge,
  'tunnel-portal': tunnelPortal,
  'ice-hall': iceHall,
  'ice-pillar': icePillar,
  'fake-exit': fakeExit,
  'exit-glow': exitGlow,
  'snow-fence': snowFence,
  lodge,
  'snow-hare': snowHare,
  'ice-flower': iceFlower,
  'sleigh-bell': sleighBell,
};

/** The names this module draws (ticket 0017; `amanojaku-blush` is the built Sakasa with pink cheeks, see models.ts). */
export const SNOW_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the snowy mountain set. */
export function buildSnowPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
