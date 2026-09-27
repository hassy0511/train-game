import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Quaternion,
  Shape,
  ExtrudeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { eyes, glowMaterial, hash, mix, part, solid } from './placeholder-kit';

/**
 * Stand-ins drawn in code for the river set of 3-2 "たきのかわ" (ticket 0012) until its models are built. Origin at the
 * bottom centre, +Z forward, one merged vertex-coloured mesh per model. Living things are round, with small round
 * eyes only (no mouth, no beak teeth); the ducks are a real duck's plain colours (no hat, no clothes, not the blue
 * and white of a well-known cartoon duck). Nothing dark or sharp.
 */

const REED = '#8DB35A';
const REED_TIP = '#C9D27A';
const LEAF = '#6DBF5A';
const LEAF_DARK = '#57A247';
const PINK = '#F6B8CF';
const ROCK = '#A89F90';
const ROCK_LIGHT = '#C2B9A8';
const GRASS = '#8CC46A';
const SAND = '#E8D8A8';
const FOAM = '#F4FBFF';
const WATER = '#9FD8F0';
const PAPER_PINK = '#F7A8D8';
const SWIRL = '#E8579F';
const SNOW = '#F4F8FC';
const SNOW_SHADE = '#D6E4F0';

// ---- plants and water ------------------------------------------------------------------------------------

/** A bunch of reeds (`reed`, 1.4 × 3.2 × 1.4 m): thin blades, green at the foot, pale at the tip. */
function reed(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    const lean = 0.12 + hash(i, 1, 0) * 0.18;
    const h = 2.4 + hash(i, 2, 0) * 0.8;
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize());
    parts.push(part(new ConeGeometry(0.07, h, 4), (p) => mix(REED, REED_TIP, (p.y + h / 2) / h), { at: [Math.cos(a) * 0.3, h / 2, Math.sin(a) * 0.3], quat: q }));
  }
  return solid('reed', parts);
}

/** A big round lily pad (`lily-pad`, 9 × 0.4 × 9 m) with its rim turned up a little and one notch. */
function lilyPad(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(4.5, 4.4, 0.2, 24, 1, false, 0.25, Math.PI * 2 - 0.5), (p) => mix(LEAF_DARK, LEAF, Math.hypot(p.x, p.z) / 4.5), { at: [0, 0.1, 0] }));
  parts.push(part(new TorusGeometry(4.45, 0.12, 4, 24, Math.PI * 2 - 0.5), LEAF, { at: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0.25] }));
  return solid('lily-pad', parts);
}

/** A water lily (`lily-flower`, 1.2 × 1 × 1.2 m): pale pink petals round a yellow middle. */
function lilyFlower(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(part(new SphereGeometry(0.3, 6, 4), PINK, { at: [Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3], scale: [1, 1.6, 0.6], quat: new Quaternion().setFromAxisAngle(new Vector3(-Math.sin(a), 0, Math.cos(a)), 0.5) }));
  }
  parts.push(part(new SphereGeometry(0.2, 6, 4), '#FFE27A', { at: [0, 0.4, 0] }));
  parts.push(part(new CylinderGeometry(0.6, 0.6, 0.06, 12), LEAF, { at: [0, 0.03, 0] }));
  return solid('lily-flower', parts);
}

/** Water weed (`water-weed`, 2 × 5 × 0.6 m): three soft ribbons. */
function waterWeed(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const h = 4 + i * 0.5;
    parts.push(part(new BoxGeometry(0.4, h, 0.06, 1, 4, 1), (p) => mix('#3F8A5A', '#6FBF84', (p.y + h / 2) / h), { at: [(i - 1) * 0.6, h / 2, 0], rot: [0, i * 0.7, (i - 1) * 0.1] }));
  }
  return solid('water-weed', parts);
}

/** A sand and pebble island in the river (`islet`, 18 × 20 × 26 m): a round grey rock mound, grass on top. */
function islet(): Group {
  const parts: BufferGeometry[] = [];
  const H = 20;
  parts.push(part(new CylinderGeometry(1, 1.25, H, 18, 3), (p) => (p.y > H / 2 - 0.2 ? new Color(GRASS) : mix(ROCK, ROCK_LIGHT, (p.y + H / 2) / H)), { at: [0, H / 2, 0], scale: [7, 1, 10] }));
  for (let i = 0; i < 5; i++) parts.push(part(new SphereGeometry(1 + hash(i, 1, 1), 6, 4), ROCK_LIGHT, { at: [(hash(i, 2, 1) - 0.5) * 10, H, (hash(i, 3, 1) - 0.5) * 16], scale: [1, 0.6, 1] }));
  return solid('islet', parts);
}

/** White rapids over a riffle (`rapids`, 16 × 1.5 × 18 m): a lumpy white-to-blue mound of water with six round rocks. */
function rapids(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const x = (hash(i, 1, 2) - 0.5) * 12;
    const z = (hash(i, 2, 2) - 0.5) * 14;
    parts.push(part(new SphereGeometry(2.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), (p) => mix(WATER, FOAM, p.y / 1.2), { at: [x, 0, z], scale: [1, 0.5, 1.4] }));
  }
  for (let i = 0; i < 6; i++) parts.push(part(new SphereGeometry(0.9, 6, 4), ROCK, { at: [(hash(i, 5, 2) - 0.5) * 14, 0.3, (hash(i, 6, 2) - 0.5) * 16], scale: [1, 0.7, 1] }));
  return solid('rapids', parts);
}

/** A station's sand and stone bank in the river (`river-bank`, 24 × 19 × 100 m): a long low mound, sand on top. */
function riverBank(): Group {
  const H = 19;
  const parts = [part(new CylinderGeometry(1, 1.2, H, 20, 2), (p) => (p.y > H / 2 - 0.2 ? new Color(SAND) : mix('#8E8472', ROCK_LIGHT, (p.y + H / 2) / H)), { at: [0, H / 2, 0], scale: [12, 1, 50] })];
  return solid('river-bank', parts);
}

/** A river stone (`river-rock`, 2 × 1 × 1.6 m), grey, brown or white by where it lies. */
function riverRock(): Group {
  return solid('river-rock', [part(new SphereGeometry(1, 7, 5), (p) => new Color(['#A89F90', '#B59A7A', '#E4DFD4'][Math.floor(hash(Math.round(p.x * 2), 0, Math.round(p.z * 2)) * 3)]), { at: [0, 0.4, 0], scale: [1, 0.5, 0.8] })]);
}

/** The rock arch at the valley's south end (`sea-arch`, 60 × 30 × 20 m), the sea's blue showing through it. */
function seaArch(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new TorusGeometry(20, 7, 8, 16, Math.PI), (p) => mix('#9C8F7E', ROCK_LIGHT, p.y / 27), { scale: [1, 1.1, 1.3] }));
  for (const x of [-20, 20]) parts.push(part(new CylinderGeometry(8, 10, 4, 10), '#8E8472', { at: [x, 0, 0] }));
  parts.push(part(new BoxGeometry(32, 18, 0.5), '#6FC3E6', { at: [0, 9, -6] }));
  return solid('sea-arch', parts);
}

/** The waterfall's rock lip (`falls-lip`, 124 × 2.5 × 4 m): a long ledge of rock with a grassy top. */
function fallsLip(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(124, 2.5, 4, 24, 1, 1), (p) => (p.y > 1.1 ? new Color(GRASS) : mix('#8E8472', ROCK_LIGHT, (p.y + 1.25) / 2.5 + hash(Math.round(p.x), 0, 0) * 0.2)), { at: [0, 1.25, 0] }));
  return solid('falls-lip', parts);
}

/** The map island's little waterfall (`falls-mini`, 6 × 5 × 4 m): a rock, white streaks and a rainbow. */
function fallsMini(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(6, 5, 2), (p) => mix('#8E8472', ROCK_LIGHT, (p.y + 2.5) / 5), { at: [0, 2.5, -1] }));
  for (let i = 0; i < 5; i++) parts.push(part(new BoxGeometry(0.5, 4.6, 0.2), i % 2 ? FOAM : '#CFEFFF', { at: [-2 + i, 2.3, 0.15] }));
  const bands = ['#FF8C8C', '#FFC46B', '#FFF27A', '#8FE38F', '#7FC8FF'];
  bands.forEach((c, i) => parts.push(part(new TorusGeometry(2.4 + i * 0.25, 0.12, 3, 16, Math.PI), c, { at: [0, 0.2, 1.4] })));
  parts.push(part(new CylinderGeometry(3.4, 3.4, 0.2, 16), WATER, { at: [0, 0.1, 1.6] }));
  return solid('falls-mini', parts);
}

/** Stepping stones (`stepping-stones`, 3 × 0.8 × 30 m): six flat round stones in a row. */
function steppingStones(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) parts.push(part(new CylinderGeometry(1.2, 1.4, 0.8, 9), ROCK_LIGHT, { at: [(i % 2 ? 0.6 : -0.6), 0.4, -12.5 + i * 5] }));
  return solid('stepping-stones', parts);
}

/** A flat rock in the river (`kawa-rock`, 5 × 1.5 × 4 m), where Sakasa sits. */
function kawaRock(): Group {
  return solid('kawa-rock', [part(new CylinderGeometry(2.4, 2.6, 1.5, 10), (p) => mix(ROCK, ROCK_LIGHT, (p.y + 0.75) / 1.5), { at: [0, 0.75, 0], scale: [1, 1, 0.8] })]);
}

/** A pink paper boat (`paper-boat`, 0.6 × 0.45 × 0.9 m), a swirl on its sail. */
function paperBoat(): Group {
  const parts: BufferGeometry[] = [];
  const hull = new Shape();
  hull.moveTo(-0.45, 0.2);
  hull.lineTo(0.45, 0.2);
  hull.lineTo(0.3, 0);
  hull.lineTo(-0.3, 0);
  hull.closePath();
  parts.push(part(new ExtrudeGeometry(hull, { depth: 0.36, bevelEnabled: false }), PAPER_PINK, { at: [0.18, 0, 0], rot: [0, -Math.PI / 2, 0] }));
  const sail = new Shape();
  sail.moveTo(-0.3, 0.2);
  sail.lineTo(0.3, 0.2);
  sail.lineTo(0, 0.45);
  sail.closePath();
  parts.push(part(new ExtrudeGeometry(sail, { depth: 0.02, bevelEnabled: false }), '#FBC6E6', { at: [0.01, 0, 0], rot: [0, -Math.PI / 2, 0] }));
  parts.push(part(new TorusGeometry(0.05, 0.012, 3, 10, Math.PI * 1.5), SWIRL, { at: [0.025, 0.29, 0], rot: [0, Math.PI / 2, 0] }));
  return solid('paper-boat', parts);
}

/** A frog (`frog`, 0.7 × 0.5 × 0.8 m): round and light green, a pale tummy, eyes on top. */
function frog(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.35, 8, 6), '#8CCB5E', { at: [0, 0.25, 0], scale: [1, 0.7, 1.1] }));
  parts.push(part(new SphereGeometry(0.28, 8, 5), '#EAF4C8', { at: [0, 0.18, 0.12], scale: [1, 0.6, 1] }));
  for (const s of [-1, 1]) parts.push(part(new SphereGeometry(0.13, 6, 4), '#8CCB5E', { at: [s * 0.16, 0.45, 0.18] }));
  parts.push(...eyes(0.16, 0.5, 0.26, 0.06));
  return solid('frog', parts);
}

/**
 * A mother duck and four ducklings in a row (`duck-family`, 1.2 × 1 × 4.5 m): plain cream and brown, a round orange
 * bill, eyes only. The ducklings follow behind her (−Z).
 */
function duckFamily(): Group {
  const parts: BufferGeometry[] = [];
  const duck = (z: number, s: number, body: string, wing: string): void => {
    parts.push(part(new SphereGeometry(0.4, 8, 6), body, { at: [0, 0.4 * s, z], scale: [0.9 * s, 0.75 * s, 1.3 * s] }));
    parts.push(part(new SphereGeometry(0.3, 6, 4), wing, { at: [0, 0.5 * s, z - 0.05 * s], scale: [1.05 * s, 0.5 * s, 0.9 * s] }));
    parts.push(part(new SphereGeometry(0.24, 8, 6), body, { at: [0, 0.85 * s, z + 0.35 * s], scale: s }));
    parts.push(part(new SphereGeometry(0.12, 6, 4), '#F2A94A', { at: [0, 0.8 * s, z + 0.58 * s], scale: [1.1 * s, 0.5 * s, 1.2 * s] }));
    parts.push(...eyes(0.12 * s, 0.9 * s, z + 0.5 * s, 0.035 * s));
  };
  duck(1.6, 1, '#EFE3C8', '#B89A74');
  for (let i = 0; i < 4; i++) duck(0.5 - i * 0.75, 0.5, '#FFE27A', '#F6D35A');
  return solid('duck-family', parts);
}

// ---- snow (the melt at the spring, a promise of chapter 4) ------------------------------------------------

/** A patch of old snow (`snow-patch`, 10 × 1.5 × 8 m). */
function snowPatch(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(part(new SphereGeometry(2.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), (p) => mix(SNOW_SHADE, SNOW, p.y / 1.5), { at: [(hash(i, 1, 3) - 0.5) * 5, 0, (hash(i, 2, 3) - 0.5) * 4], scale: [1, 0.55, 0.8] }));
  return solid('snow-patch', parts);
}

/** A far snowy mountain (`snow-peak`, 400 × 260 × 400 m): a broad cone, white above, blue-grey below. */
function snowPeak(): Group {
  return solid('snow-peak', [part(new ConeGeometry(200, 260, 10, 3), (p) => (p.y > 20 ? mix('#DDE8F2', SNOW, (p.y - 20) / 110) : mix('#8FA3B8', '#B5C4D4', (p.y + 130) / 150)), { at: [0, 130, 0] })]);
}

// ---- records ---------------------------------------------------------------------------------------------

/** 3-2 record ①: a kingfisher's blue feather (`blue-feather`, 0.3 × 0.1 × 1 m), its tip orange. */
function blueFeather(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.5, 8, 4), (p) => (p.z > 0.3 ? new Color('#F28C3A') : mix('#2E86C9', '#3FA7E0', p.z + 0.5)), { at: [0, 0.05, 0], scale: [0.28, 0.06, 1] }));
  parts.push(part(new CylinderGeometry(0.015, 0.015, 1, 4), '#E8E2D4', { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0] }));
  return solid('blue-feather', parts);
}

/** 3-2 record ②: a round jade stone on the river bed (`jade-stone`, 0.8 × 0.5 × 0.8 m), with a sparkle. */
function jadeStone(): Group {
  const parts = [part(new SphereGeometry(0.4, 10, 7), (p) => mix('#3FA880', '#8EE0BC', (p.y + 0.4) / 0.8), { at: [0, 0.25, 0], scale: [1, 0.62, 1] })];
  parts.push(part(new SphereGeometry(0.06, 4, 2), '#FFFFFF', { at: [-0.12, 0.45, 0.14] }));
  return solid('jade-stone', parts, glowMaterial());
}

/** 3-2 record ③ (the snowplow's): a butterbur bud under the snow (`fukinotou`, 0.6 × 0.6 × 0.6 m). */
function fukinotou(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.22, 8, 6), '#C8E07A', { at: [0, 0.25, 0], scale: [1, 1.2, 1] }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new SphereGeometry(0.16, 6, 4), '#8CC45A', { at: [Math.cos(a) * 0.16, 0.18, Math.sin(a) * 0.16], scale: [0.8, 1.4, 0.5], quat: new Quaternion().setFromAxisAngle(new Vector3(-Math.sin(a), 0, Math.cos(a)), 0.4) }));
  }
  return solid('fukinotou', parts);
}

const BUILDERS: Record<string, () => Group> = {
  reed,
  'lily-pad': lilyPad,
  'lily-flower': lilyFlower,
  'water-weed': waterWeed,
  islet,
  rapids,
  'river-bank': riverBank,
  'river-rock': riverRock,
  'sea-arch': seaArch,
  'falls-lip': fallsLip,
  'falls-mini': fallsMini,
  'stepping-stones': steppingStones,
  'kawa-rock': kawaRock,
  'paper-boat': paperBoat,
  frog,
  'duck-family': duckFamily,
  'snow-patch': snowPatch,
  'snow-peak': snowPeak,
  'blue-feather': blueFeather,
  'jade-stone': jadeStone,
  fukinotou,
};

/** The names this module draws (ticket 0012). */
export const RIVER_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the river set. */
export function buildRiverPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
