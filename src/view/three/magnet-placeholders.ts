import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { kitMaterial, merge, part, solid } from './placeholder-kit';

/**
 * v1.11 (PR5): stand-ins drawn in code for the magnet light's things (PHASE9_CHAPTER5_6 第 2 部 M12, ticket 0020
 * 「じしゃくライトの しかけ（共通）」) until their models are built: the U magnet on the roof, the loose rail piece, the
 * iron gate with its round cushion, the level crossing bar, the little iron star and bell, the mirror that looks away
 * (5-3 draws its own), and the odds and ends by the line (a tin can, a tin bucket, a sign with a bell). Origin at the
 * bottom centre, +Z forward (a gate and a crossing face the coming train on −Z); one merged mesh per model in the
 * shared vertex-coloured material. No faces, no letters, no logos; the magnet is any toy's horseshoe with its mouth up.
 */

const RED = '#E0473C';
const WHITE = '#FFFFFF';
const IRON = '#7A8CA3';
const IRON_LIGHT = '#A9B8CC';
const IRON_DARK = '#56657A';
const CUSHION = '#FFF3D6';
const RAIL = '#8A96A3';
const SLEEPER = '#8B6A4A';
const TIN = '#C9D3DC';
const TIN_BAND = '#4FA3D9';
const BUCKET = '#8FD0E8';
const BUCKET_RIM = '#C8ECF7';
const GOLD = '#E5B93C';
const POLE = '#9C7A55';
const PLANK = '#F2E3C6';
const SILVER = '#DDE6EE';
const YELLOW = '#F2C230';
const DARK = '#2E3440';

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, n = 8, open = false): CylinderGeometry => new CylinderGeometry(r0, r1, h, n, 1, open);

/** "magnet-mark": a U magnet standing on the roof, its mouth up (0.6 × 0.7 × 0.2 m), red with white tips. */
function magnetMark(): Group {
  const parts: BufferGeometry[] = [];
  // The bend: half a torus below, the two legs up.
  parts.push(part(new TorusGeometry(0.2, 0.08, 5, 8, Math.PI), RED, { at: [0, 0.28, 0], rot: [0, 0, Math.PI] }));
  for (const side of [-1, 1]) {
    parts.push(part(box(0.16, 0.26, 0.16), RED, { at: [side * 0.2, 0.41, 0] }));
    parts.push(part(box(0.16, 0.12, 0.16), WHITE, { at: [side * 0.2, 0.6, 0] }));
  }
  return solid('magnet-mark', parts);
}

/** A stretch of track `length` m long (two rails and sleepers), centred on the origin, along +Z. */
export function trackPieceParts(length: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const n = Math.max(2, Math.round(length / 0.9));
  for (let i = 0; i < n; i++) parts.push(part(box(2.4, 0.16, 0.24), SLEEPER, { at: [0, 0.08, -length / 2 + (i + 0.5) * (length / n)] }));
  for (const side of [-1, 1]) parts.push(part(box(0.12, 0.16, length), RAIL, { at: [side * 0.72, 0.24, 0] }));
  return parts;
}

/** "rail-piece": the loose piece of rail (8 m) that the magnet puts into a gap. */
function railPiece(): Group {
  return solid('rail-piece', trackPieceParts(8));
}

/** "iron-door": two iron doors (7 m wide in all, 6 m high, 0.6 m thick) with round rivets; a cream cushion on −Z. */
function ironDoor(): Group {
  const parts: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(part(box(3.45, 5.7, 0.6), IRON, { at: [side * 1.75, 2.85, 0] }));
    parts.push(part(box(3.45, 0.3, 0.66), IRON_LIGHT, { at: [side * 1.75, 5.85, 0] }));
    for (const y of [1.2, 3, 4.8]) parts.push(part(new SphereGeometry(0.12, 5, 3), IRON_DARK, { at: [side * 3.1, y, -0.32] }));
  }
  // The round cushion over the middle (the soft face the train bumps).
  parts.push(part(new SphereGeometry(1.4, 10, 6), CUSHION, { at: [0, 2.6, -0.3], scale: [1, 1, 0.35] }));
  return solid('iron-door', parts);
}

/** "crossing-bar-iron": the game's own crossing post with its striped bar across the line (Sakasa's upside-down one). */
function crossingBar(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(0.1, 0.12, 3, 6), SILVER, { at: [-3.2, 1.5, 0] }));
  parts.push(part(box(0.5, 0.5, 0.3), DARK, { at: [-3.2, 2.9, 0] }));
  for (let i = 0; i < 6; i++) parts.push(part(box(1, 0.16, 0.12), i % 2 ? DARK : YELLOW, { at: [-2.7 + i + 0.5, 1.1, 0] }));
  return solid('crossing-bar-iron', parts);
}

/** A flat five-pointed star `r` m across its points, `depth` m thick, standing up facing +Z. */
function starShape(r: number, depth: number): BufferGeometry {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** "iron-star-small": a little iron star, 0.6 m (5-3's first go and M1). */
function ironStar(): Group {
  const shine = (p: Vector3): Color => new Color(IRON).lerp(new Color(SILVER), Math.min(1, Math.max(0, p.y / 0.3 + 0.5)));
  return solid('iron-star-small', [part(starShape(0.3, 0.1), shine, { at: [0, 0.3, 0] })]);
}

/** "iron-bell-small": a little iron bell on a ring, 0.5 m. */
function ironBell(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(0.08, 0.22, 0.34, 8, true), IRON_LIGHT, { at: [0, 0.2, 0] }));
  parts.push(part(new SphereGeometry(0.08, 6, 4), IRON, { at: [0, 0.38, 0] }));
  parts.push(part(new TorusGeometry(0.06, 0.02, 3, 6), IRON_DARK, { at: [0, 0.48, 0] }));
  parts.push(part(new SphereGeometry(0.05, 5, 3), GOLD, { at: [0, 0.04, 0] }));
  return solid('iron-bell-small', parts);
}

/** "turn-mirror-small" (a magnet "turn" without `mirror`; 5-3's own is "turn-mirror"): a standing mirror that looks away (its back towards the rail: a plain iron back), 3 × 4 m. */
function turnMirror(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(3, 4, 0.12), '#E9EEF6', { at: [0, 2.6, 0.08] }));
  parts.push(part(box(3.3, 4.3, 0.14), IRON, { at: [0, 2.6, -0.02] }));
  parts.push(part(box(0.3, 0.6, 0.3), IRON_DARK, { at: [0, 0.3, 0] }));
  return solid('turn-mirror-small', parts);
}

/** The odds and ends' parts, each a merged geometry with its origin at the bottom centre (instanced by the view). */
export function ironCanGeometry(): BufferGeometry {
  return merge([part(cyl(0.06, 0.06, 0.2, 6), TIN, { at: [0, 0.1, 0] }), part(cyl(0.062, 0.062, 0.08, 6, true), TIN_BAND, { at: [0, 0.1, 0] })]);
}

export function ironBucketGeometry(): BufferGeometry {
  return merge([
    part(cyl(0.16, 0.12, 0.3, 8, true), BUCKET, { at: [0, 0.15, 0] }),
    part(new CylinderGeometry(0.12, 0.12, 0.01, 8), BUCKET, { at: [0, 0.005, 0] }),
    part(new TorusGeometry(0.16, 0.012, 3, 8), BUCKET_RIM, { at: [0, 0.3, 0], rot: [Math.PI / 2, 0, 0] }),
    part(new TorusGeometry(0.15, 0.01, 3, 6, Math.PI), DARK, { at: [0, 0.3, 0] }),
  ]);
}

/** A sign by the line: a pole (1.6 m), a small plank with no letters, a short arm the bell hangs from. */
export function signPostGeometry(): BufferGeometry {
  return merge([
    part(cyl(0.04, 0.05, 1.6, 5), POLE, { at: [0, 0.8, 0] }),
    part(box(0.7, 0.4, 0.05), PLANK, { at: [0, 1.25, 0.03] }),
    part(box(0.04, 0.04, 0.4), POLE, { at: [0, 1.55, 0.2] }),
  ]);
}

/** The sign's golden bell (its top, where the string ties, at the origin). */
export function signBellGeometry(): BufferGeometry {
  return merge([
    part(cyl(0.04, 0.1, 0.14, 7, true), GOLD, { at: [0, -0.12, 0] }),
    part(new SphereGeometry(0.04, 5, 3), GOLD, { at: [0, -0.05, 0] }),
    part(box(0.012, 0.05, 0.012), '#6B5A3A', { at: [0, -0.02, 0] }),
  ]);
}

/** Where a sign's bell hangs, from the sign's origin (under the end of its arm). */
export const SIGN_BELL_AT = new Vector3(0, 1.53, 0.38);

function ironCan(): Group {
  return one('iron-can', ironCanGeometry());
}
function ironBucket(): Group {
  return one('iron-bucket', ironBucketGeometry());
}
function signBell(): Group {
  const bell = signBellGeometry();
  bell.translate(SIGN_BELL_AT.x, SIGN_BELL_AT.y, SIGN_BELL_AT.z);
  return one('sign-bell', merge([signPostGeometry(), bell]));
}

function one(name: string, geometry: BufferGeometry): Group {
  const g = new Group();
  const mesh = new Mesh(geometry, kitMaterial());
  mesh.name = name;
  g.add(mesh);
  return g;
}

const BUILDERS: Record<string, () => Group> = {
  'magnet-mark': magnetMark,
  'rail-piece': railPiece,
  'iron-door': ironDoor,
  'crossing-bar-iron': crossingBar,
  'iron-star-small': ironStar,
  'iron-bell-small': ironBell,
  'turn-mirror-small': turnMirror,
  'iron-can': ironCan,
  'iron-bucket': ironBucket,
  'sign-bell': signBell,
};

/** The magnet light's stand-in for `name`, or null when it is not one of them. */
export function buildMagnetPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}

/** Every model drawn here (assets/models.json "_pending"). */
export const MAGNET_PLACEHOLDERS = Object.keys(BUILDERS);
