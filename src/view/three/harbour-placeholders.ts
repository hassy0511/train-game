import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Quaternion, Shape, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { eyes, glowMaterial, hash, mix, part, solid } from './placeholder-kit';

/**
 * Stand-ins drawn in code for the harbour set of 3-3 "ほしのうみ" (ticket 0013) until its models are built. Origin at the
 * bottom centre, +Z forward, one merged vertex-coloured mesh per model. Living things are round, eyes only (no
 * mouth, no spikes, no stingers); the lighthouse is white with mint bands and like no real one; no letters or crests on
 * the lanterns. Glowing things (lanterns, coral, the trench's specks) use a material that lights itself a little.
 */

const CAPE = '#9C8A8E';
const CAPE_LIGHT = '#B8A8B0';
const GRASS = '#7FAF5A';
const TURTLE_SHELL = '#8CCB9E';
const TURTLE_SHELL_DARK = '#6FB287';
const TURTLE_SKIN = '#BFE3C8';
const TRENCH = '#2B3F6E';
const SPECK = '#9FE8FF';
const WOOD = '#B98A5E';
const WOOD_DARK = '#8A6A48';
const LANTERN = '#FFD08A';
const JELLY = '#FFC9E8';
const WHITE = '#F7F7F2';
const MINT = '#8FD3C1';

/** The cape's rocky point (`cape-rock`, 60 × 34.6 × 110 m): rock tinted pink by the sunset, a grass band on top. */
function capeRock(): Group {
  const H = 34.6;
  const parts = [
    part(new CylinderGeometry(1, 1.25, H, 20, 3), (p) => (p.y > H / 2 - 0.2 ? new Color(GRASS) : mix(CAPE, CAPE_LIGHT, (p.y + H / 2) / H + hash(Math.round(p.x), Math.round(p.y), 0) * 0.15)), {
      at: [0, H / 2, 0],
      scale: [30, 1, 55],
    }),
  ];
  for (let i = 0; i < 3; i++) parts.push(part(new SphereGeometry(3, 6, 4), CAPE_LIGHT, { at: [18 + i * 3, H - 0.5, -20 + i * 18], scale: [1, 0.6, 1] }));
  return solid('cape-rock', parts);
}

/** The shell and body of a sea turtle, flippers `spread` out (0 folded in, 1 swimming). */
function turtle(name: string, spread: number, awake: boolean): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), (p) => {
    // A soft hexagon pattern on the shell, by vertex.
    const k = hash(Math.round(p.x * 1.3), 0, Math.round(p.z * 1.3));
    return new Color(k > 0.5 ? TURTLE_SHELL : TURTLE_SHELL_DARK);
  }, { at: [0, 0.35, 0], scale: [1, 0.55, 1.3] }));
  parts.push(part(new CylinderGeometry(1.35, 1.35, 0.3, 14), TURTLE_SKIN, { at: [0, 0.3, 0], scale: [1, 1, 1.28] }));
  parts.push(part(new SphereGeometry(0.45, 8, 6), TURTLE_SKIN, { at: [0, 0.55, 2] }));
  if (awake) parts.push(...eyes(0.2, 0.7, 2.3, 0.08));
  else for (const s of [-1, 1]) parts.push(part(new BoxGeometry(0.16, 0.03, 0.02), '#2B3A4A', { at: [s * 0.2, 0.68, 2.4] }));
  for (const s of [-1, 1]) {
    parts.push(part(new SphereGeometry(0.5, 6, 4), TURTLE_SKIN, { at: [s * (1.1 + spread * 0.6), 0.3, 0.9], scale: [1.4, 0.25, 0.6], rot: [0, s * (0.4 + spread * 0.5), 0] }));
    parts.push(part(new SphereGeometry(0.35, 6, 4), TURTLE_SKIN, { at: [s * (0.9 + spread * 0.3), 0.3, -1.3], scale: [1.2, 0.25, 0.6], rot: [0, -s * 0.5, 0] }));
  }
  return solid(name, parts);
}

/** A wall of the star trench (`trench-wall`, 40 × 24 × 12 m): indigo rock with little glowing specks on it. */
function trenchWall(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(40, 24, 12, 8, 5, 2), (p) => mix('#1E2F58', TRENCH, (p.y + 12) / 24 + hash(Math.round(p.x / 3), Math.round(p.y / 3), 0) * 0.3), { at: [0, 12, 0] }));
  for (let i = 0; i < 26; i++) parts.push(part(new SphereGeometry(0.22, 4, 2), SPECK, { at: [(hash(i, 1, 4) - 0.5) * 38, 1 + hash(i, 2, 4) * 22, 6.05] }));
  return solid('trench-wall', parts, glowMaterial());
}

/** Softly glowing coral (`glow-coral`, 3 × 3 × 3 m): round branches in sky blue or lilac. */
function glowCoral(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    const c = i % 2 ? '#7FD6FF' : '#C9A0E0';
    const dir = new Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
    const mid = dir.clone().multiplyScalar(0.9);
    parts.push(part(new CylinderGeometry(0.18, 0.26, 1.8, 5), c, { at: [mid.x, mid.y, mid.z], quat: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir) }));
    const tip = dir.clone().multiplyScalar(1.85);
    parts.push(part(new SphereGeometry(0.34, 6, 4), c, { at: [tip.x, tip.y, tip.z] }));
  }
  return solid('glow-coral', parts, glowMaterial());
}

/** A festival raft (`festival-raft`, 8 × 3 × 6 m): planks, two poles and four round lanterns on a line. */
function festivalRaft(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) parts.push(part(new CylinderGeometry(0.4, 0.4, 8, 8), i % 2 ? WOOD : '#A87B50', { at: [0, 0.3, -2.5 + i], rot: [0, 0, Math.PI / 2] }));
  for (const x of [-3.2, 3.2]) parts.push(part(new CylinderGeometry(0.08, 0.1, 2.6, 5), WOOD_DARK, { at: [x, 1.6, 0] }));
  parts.push(part(new BoxGeometry(6.4, 0.05, 0.05), '#6B4A26', { at: [0, 2.9, 0] }));
  for (const [x, z] of [
    [-2.6, -1.6],
    [-2.6, 1.6],
    [2.6, -1.6],
    [2.6, 1.6],
  ]) {
    parts.push(part(new SphereGeometry(0.4, 8, 6), LANTERN, { at: [x, 2.6, z], scale: [1, 1.15, 1] }));
    parts.push(part(new CylinderGeometry(0.02, 0.02, 0.4, 3), '#6B4A26', { at: [x, 2.95, z * 0.5] }));
  }
  return solid('festival-raft', parts, glowMaterial());
}

/** A jellyfish lantern (`lantern-jelly`, 1.6 × 2.4 × 1.6 m): a round pink cap glowing inside, four short soft ribbons. */
function lanternJelly(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), (p) => mix('#FFE8F4', JELLY, p.y / 0.8), { at: [0, 1.4, 0], scale: [1, 0.9, 1] }));
  parts.push(part(new SphereGeometry(0.4, 8, 5), '#FFF3C4', { at: [0, 1.5, 0] }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(part(new BoxGeometry(0.12, 1.2, 0.03), '#FFB8DC', { at: [Math.cos(a) * 0.45, 0.8, Math.sin(a) * 0.45], rot: [0, a, 0.1] }));
  }
  return solid('lantern-jelly', parts, glowMaterial());
}

/**
 * The lighthouse (`lighthouse`, 8 × 24 × 8 m): a white round tower with two mint bands, a round lamp room with a rail
 * and a roof. Its lamp (at 20.6 m) is lit by harbour.ts.
 */
function lighthouse(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(3.4, 4, 2, 16), '#C9C2B6', { at: [0, 1, 0] }));
  parts.push(part(new CylinderGeometry(2.2, 3.2, 17, 16, 6), (p) => (Math.abs(p.y - 2) < 1.1 || Math.abs(p.y + 3.5) < 1.1 ? new Color(MINT) : new Color(WHITE)), { at: [0, 10.5, 0] }));
  parts.push(part(new CylinderGeometry(3, 3, 0.4, 16), WHITE, { at: [0, 19.2, 0] }));
  parts.push(part(new TorusGeometry(2.9, 0.06, 3, 20), '#7A8A94', { at: [0, 20.2, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new CylinderGeometry(1.6, 1.6, 2.2, 12, 1, true), '#DDEFF2', { at: [0, 20.5, 0] }));
  parts.push(part(new ConeGeometry(2.2, 1.8, 12), MINT, { at: [0, 22.5, 0] }));
  parts.push(part(new SphereGeometry(0.35, 6, 4), MINT, { at: [0, 23.6, 0] }));
  for (let i = 0; i < 3; i++) parts.push(part(new BoxGeometry(0.9, 1.3, 0.2), '#5A7A8A', { at: [0, 6 + i * 4, 2.75 - i * 0.28] }));
  return solid('lighthouse', parts);
}

/** A lantern post on a platform (`lantern-post`, 0.6 × 3.5 × 0.6 m): a wooden post with one round lantern. */
function lanternPost(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.08, 0.1, 3, 6), WOOD_DARK, { at: [0, 1.5, 0] }));
  parts.push(part(new BoxGeometry(0.5, 0.06, 0.06), WOOD_DARK, { at: [0.2, 3, 0] }));
  parts.push(part(new SphereGeometry(0.28, 8, 6), LANTERN, { at: [0.38, 2.6, 0], scale: [1, 1.2, 1] }));
  return solid('lantern-post', parts, glowMaterial());
}

/** A little house on the shore (`harbour-house`, 6 × 6 × 6 m), its window lit. Roofs in three colours. */
function harbourHouse(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(5, 3.6, 5), '#F2E6D8', { at: [0, 1.8, 0] }));
  const roof = ['#D98A8A', '#8AB4D9', '#9CCB8A'][0];
  parts.push(part(new ConeGeometry(4.2, 2.4, 4), roof, { at: [0, 4.8, 0], rot: [0, Math.PI / 4, 0] }));
  parts.push(part(new BoxGeometry(1.2, 1, 0.1), '#FFE08A', { at: [0, 2, 2.52] }));
  return solid('harbour-house', parts);
}

/** 3-3 record ①: a sunset-coloured starfish (`starfish`, 0.8 × 0.2 × 0.8 m), its edge lighter. */
function starfish(): Group {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.17 : 0.4;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const star = new ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06, bevelSegments: 2 });
  return solid('starfish', [part(star, (p) => mix('#F59B6B', '#FFD2B0', Math.hypot(p.x, p.y) / 0.45), { rot: [-Math.PI / 2, 0, 0] })]);
}

/** 3-3 record ②: an open shell holding star-shaped sand (`star-sand`, 1 × 0.6 × 1 m). */
function starSand(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#F4E2EC', { at: [0, 0.25, 0], scale: [1, 0.5, 1] }));
  for (let i = 0; i < 9; i++) parts.push(part(new SphereGeometry(0.07, 4, 2), '#FFF3A8', { at: [(hash(i, 1, 5) - 0.5) * 0.6, 0.27, (hash(i, 2, 5) - 0.5) * 0.6] }));
  return solid('star-sand', parts, glowMaterial());
}

/** 3-3 record ③ (the magnet light's): a round festival bell with a red cord (`festival-bell`, 0.6 × 0.7 × 0.6 m). */
function festivalBell(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.28, 10, 8), (p) => mix('#A8914F', '#E3CE86', (p.y + 0.28) / 0.56), { at: [0, 0.3, 0] }));
  parts.push(part(new BoxGeometry(0.3, 0.03, 0.06), '#5A4A2A', { at: [0, 0.22, 0.25] }));
  parts.push(part(new TorusGeometry(0.08, 0.025, 4, 10), '#E86A6A', { at: [0, 0.62, 0] }));
  return solid('festival-bell', parts);
}

const BUILDERS: Record<string, () => Group> = {
  'cape-rock': capeRock,
  'sea-turtle-sleep': () => turtle('sea-turtle-sleep', 0, false),
  'sea-turtle': () => turtle('sea-turtle', 1, true),
  'trench-wall': trenchWall,
  'glow-coral': glowCoral,
  'festival-raft': festivalRaft,
  'lantern-jelly': lanternJelly,
  lighthouse,
  'lantern-post': lanternPost,
  'harbour-house': harbourHouse,
  starfish,
  'star-sand': starSand,
  'festival-bell': festivalBell,
};

/** The names this module draws (ticket 0013). */
export const HARBOUR_PLACEHOLDERS = Object.keys(BUILDERS);

/** Builds the code stand-in for `name`, or null when it is not one of the harbour set. */
export function buildHarbourPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
