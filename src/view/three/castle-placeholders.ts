import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry } from 'three';
import { glowMaterial, hash, mix, part, solid } from './placeholder-kit';

/**
 * Stand-ins drawn in code for 6-1 "さかさまのしろ" (ticket 0021「さかさまの しろ セット」, PHASE9_CHAPTER5_6 第 7 部 §8)
 * until their models are built: the upside-down castle standing on its spire on the moat's island, the island, the
 * spiral stairs, houses standing on their roofs, trees with their roots up, lamps lit at the bottom, upside-down
 * topiary, the chimney under record ②, the clock tower, the upside-down arch bridge, the rainbow bridge (its stub and
 * the long one the ending sends up), the little upside-down library and its lectern, the bench, the promenade's slabs,
 * the castle's lit windows, and the three records (the raindrop falling up, the top spinning on its head, the book read
 * from the back). Same names, sizes and origins as the ticket: origin at the bottom centre, +Z forward (exceptions
 * written at each). One merged mesh per model in the shared vertex-coloured material (the windows and the records glow).
 * Pastel colours. **No faces, no letters, no crests**: not a real castle's or a theme park's shape, no floating rock,
 * no towers hanging down, no roots or dome under it (it must not recall a famous film's castle in the sky).
 */
const WALL = '#CDB8E8';
const WALL_DEEP = '#B9A3DE';
const ROOF = '#F29AC0';
const CREAM = '#FFF3D6';
const STONE = '#D9D4E6';
const STONE_DEEP = '#BDB6CF';
const PINK = '#E75BA0';
const GRASS = '#A3C98C';
const LEAF = '#7FBF6A';
const BARK = '#9C7458';
const WOOD = '#B07A4A';
const BRICK = '#C98A6B';
const WINDOW = '#FFE9A8';

const cyl = (rTop: number, rBottom: number, h: number, seg = 10): CylinderGeometry => new CylinderGeometry(rTop, rBottom, h, seg);
const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);
const PASTELS = ['#F6C7D8', '#CDE7F6', '#FDE9B5', '#D7EFC7', '#E4D6F6'];

/**
 * "sakasa-castle", 24 × 40 × 24 m: four round stout towers and a keep, upside down: the pink spires point down into the
 * island (the origin is the middle spire's tip, on the island's top), the walls widen upwards, and the old ground floor is
 * now the top, with a round balcony at y 34. Cream windows (never two-and-one like a face), pink swirl flags hanging down.
 */
function sakasaCastle(): Group {
  const parts: BufferGeometry[] = [];
  // The middle spire (downwards) and the keep standing on it.
  parts.push(part(new ConeGeometry(5, 9, 12), ROOF, { at: [0, 4.5, 0], rot: [Math.PI, 0, 0] }));
  parts.push(part(cyl(7, 5.5, 20, 14), WALL, { at: [0, 19, 0] }));
  // The four towers, each on its own downward spire, a little lower and outwards.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 8.5;
    const z = Math.sin(a) * 8.5;
    parts.push(part(new ConeGeometry(2.8, 6, 10), ROOF, { at: [x, 10, z], rot: [Math.PI, 0, 0] }));
    parts.push(part(cyl(3.2, 2.8, 16, 10), WALL_DEEP, { at: [x, 21, z] }));
    // Windows: a row of two on the outer side, high up (a pair, never with a mouth below).
    for (const dy of [17, 24]) {
      parts.push(part(box(1, 1.6, 0.4), WINDOW, { at: [Math.cos(a) * 11.6, dy, Math.sin(a) * 11.6], rot: [0, -a + Math.PI / 2, 0] }));
    }
    // A pink flag hanging down from the tower's top rim.
    parts.push(part(box(0.15, 3, 1.6), PINK, { at: [x + Math.cos(a) * 3.3, 27, z + Math.sin(a) * 3.3], rot: [0, -a, 0] }));
  }
  // The keep's windows, in a band.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(part(box(1.1, 2, 0.4), WINDOW, { at: [Math.cos(a) * 6.9, 22, Math.sin(a) * 6.9], rot: [0, -a + Math.PI / 2, 0] }));
  }
  // The top: the old ground floor, a wide drum with the round balcony at y 34.
  parts.push(part(cyl(12, 10, 5, 18), STONE, { at: [0, 31.5, 0] }));
  parts.push(part(cyl(12.6, 12.6, 0.6, 20), CREAM, { at: [0, 34, 0] }));
  parts.push(part(new TorusGeometry(12.2, 0.25, 4, 24), PINK, { at: [0, 35.2, 0], rot: [Math.PI / 2, 0, 0] }));
  // The old front door, now at the top, and a little swirl flag pole pointing down from the drum.
  parts.push(part(box(3, 4, 0.6), CREAM, { at: [0, 37, -9.5] }));
  parts.push(part(cyl(0.12, 0.12, 6), STONE_DEEP, { at: [0, 26, -11.8] }));
  parts.push(part(box(0.15, 2.4, 2), PINK, { at: [0, 24.5, -12.6] }));
  return solid('sakasa-castle', parts);
}

/** "castle-windows": the castle's windows lit (the ending's fx), drawn at the same place as the castle; they glow. */
function castleWindows(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    for (const dy of [17, 24]) parts.push(part(box(1.1, 1.7, 0.5), '#FFD45C', { at: [Math.cos(a) * 11.65, dy, Math.sin(a) * 11.65], rot: [0, -a + Math.PI / 2, 0] }));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(part(box(1.2, 2.1, 0.5), '#FFD45C', { at: [Math.cos(a) * 6.95, 22, Math.sin(a) * 6.95], rot: [0, -a + Math.PI / 2, 0] }));
  }
  return solid('castle-windows', parts, glowMaterial(), false);
}

/** "castle-island", 52 × 3 × 52 m: a round island, stone rim and grass; origin at its top centre (y 0). */
function castleIsland(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(26, 24, 3, 28), STONE_DEEP, { at: [0, -1.6, 0] }));
  parts.push(part(cyl(25.4, 25.4, 0.3, 28), GRASS, { at: [0, -0.15, 0] }));
  parts.push(part(new TorusGeometry(25.6, 0.5, 4, 28), STONE, { at: [0, -0.1, 0], rot: [Math.PI / 2, 0, 0] }));
  return solid('castle-island', parts, undefined, false);
}

/** "upside-stairs", 6 × 34 × 6 m: a white spiral stair with a pink rail, from the balcony down to the island. */
function upsideStairs(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(0.5, 0.5, 34, 8), CREAM, { at: [0, 17, 0] }));
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const a = i * 0.55;
    const y = 0.4 + (i / steps) * 33;
    parts.push(part(box(2.4, 0.25, 0.9), '#FFFFFF', { at: [Math.cos(a) * 1.6, y, Math.sin(a) * 1.6], rot: [0, -a, 0] }));
    if (i % 2 === 0) parts.push(part(box(0.12, 1, 0.12), ROOF, { at: [Math.cos(a) * 2.8, y + 0.6, Math.sin(a) * 2.8] }));
  }
  return solid('upside-stairs', parts);
}

/**
 * A house standing on its roof ("house-upside-a" 8 × 9 × 8, "-b" 10 × 11 × 9): the pointed roof is the ground, the walls
 * above it, the chimney's cotton smoke going down beside it. Pastel walls (a different tint per model).
 */
function houseUpside(name: string, w: number, h: number, d: number, tint: number): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    const roofH = h * 0.4;
    const wallH = h - roofH;
    parts.push(part(new ConeGeometry(Math.max(w, d) * 0.62, roofH, 4), ROOF, { at: [0, roofH / 2, 0], rot: [Math.PI, Math.PI / 4, 0] }));
    parts.push(part(box(w, wallH, d), (p) => mix(PASTELS[tint % PASTELS.length], PASTELS[(tint + 2) % PASTELS.length], hash(p.x, p.y, p.z) * 0.3), { at: [0, roofH + wallH / 2, 0] }));
    // A door at the top (the old ground floor) and windows (never two-and-one like a face).
    parts.push(part(box(1.4, 2, 0.2), WOOD, { at: [0, h - 1.1, d / 2 + 0.05] }));
    for (const x of [-w * 0.28, w * 0.28]) parts.push(part(box(1.2, 1.2, 0.2), CREAM, { at: [x, roofH + wallH * 0.35, d / 2 + 0.05] }));
    // The chimney (upside down: under the roof's edge) and its smoke going down.
    parts.push(part(box(0.9, 2, 0.9), BRICK, { at: [w * 0.35, roofH * 0.6, 0] }));
    parts.push(part(new SphereGeometry(0.8, 7, 5), '#FFFFFF', { at: [w * 0.35 + 0.6, 0.9, 0.3] }));
    parts.push(part(new SphereGeometry(0.6, 7, 5), '#F4F4F8', { at: [w * 0.35 + 1.3, 0.5, -0.2] }));
    return solid(name, parts);
  };
}

/** "tree-upside", 5 × 8 × 5 m: the round leafy crown on the ground, the trunk above it, the roots spreading at the top. */
function treeUpside(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(2.3, 8, 6), LEAF, { at: [0, 2.1, 0], scale: [1, 0.9, 1] }));
  parts.push(part(cyl(0.35, 0.45, 3.4, 7), BARK, { at: [0, 5.3, 0] }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(cyl(0.12, 0.2, 2, 5), BARK, { at: [Math.cos(a) * 0.7, 7.2, Math.sin(a) * 0.7], rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }));
  }
  return solid('tree-upside', parts);
}

/** "lamp-upside", 0.6 × 4 × 0.6 m: a street lamp upside down: its light at the bottom (glowing a little), the base on top. */
function lampUpside(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.28, 8, 6), WINDOW, { at: [0, 0.3, 0] }));
  parts.push(part(new ConeGeometry(0.3, 0.4, 8), '#7A8CA3', { at: [0, 0.75, 0], rot: [Math.PI, 0, 0] }));
  parts.push(part(cyl(0.06, 0.06, 2.8, 6), '#7A8CA3', { at: [0, 2.3, 0] }));
  parts.push(part(cyl(0.25, 0.3, 0.3, 8), '#7A8CA3', { at: [0, 3.85, 0] }));
  return solid('lamp-upside', parts, glowMaterial());
}

/** "garden-topiary-upside", 2 × 3 × 2 m: a clipped round bush at the bottom, its stick and a little pot on top. */
function topiaryUpside(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.95, 8, 6), LEAF, { at: [0, 0.95, 0] }));
  parts.push(part(cyl(0.08, 0.08, 1.3, 6), BARK, { at: [0, 2.3, 0] }));
  parts.push(part(cyl(0.5, 0.35, 0.5, 8), BRICK, { at: [0, 2.9, 0] }));
  return solid('garden-topiary-upside', parts);
}

/** "chimney-upside", 3 × 6 × 3 m: record ②'s stand, a brick chimney wider at the top. */
function chimneyUpside(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(cyl(1.5, 0.9, 5.4, 8), BRICK, { at: [0, 2.7, 0] }));
  parts.push(part(cyl(1.6, 1.6, 0.6, 8), '#B87A5C', { at: [0, 5.7, 0] }));
  return solid('chimney-upside', parts);
}

/**
 * "clock-tower", 8 × 22 × 8 m: a cream tower with a lavender roof; the dial (facing −X, towards the line) has twelve dots
 * only, and two hands (they run backwards: castle.ts turns the "clock-hands" model on top of it).
 */
function clockTower(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(7, 16, 7), CREAM, { at: [0, 8, 0] }));
  parts.push(part(box(7.6, 1, 7.6), STONE, { at: [0, 16.5, 0] }));
  parts.push(part(new ConeGeometry(5.6, 5, 4), WALL, { at: [0, 19.5, 0], rot: [0, Math.PI / 4, 0] }));
  parts.push(part(cyl(2.4, 2.4, 0.3, 20), '#FFFFFF', { at: [-3.6, 12.5, 0], rot: [0, 0, Math.PI / 2] }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(part(box(0.2, 0.25, 0.25), '#5A4A6A', { at: [-3.8, 12.5 + Math.cos(a) * 2, Math.sin(a) * 2] }));
  }
  return solid('clock-tower', parts);
}

/** "clock-hands": the clock tower's two hands, origin at their pivot (the game puts it on the dial and turns it). */
function clockHands(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(0.15, 1.7, 0.18), '#5A4A6A', { at: [0, 0.85, 0] }));
  parts.push(part(box(0.15, 0.18, 1.2), PINK, { at: [0, 0, 0.6] }));
  parts.push(part(cyl(0.2, 0.2, 0.2, 8), '#5A4A6A', { rot: [0, 0, Math.PI / 2] }));
  return solid('clock-hands', parts, undefined, false);
}

/** "upward-falls", 12 × 18 × 4 m: a waterfall flowing upwards (pale blue with white streaks; for the model page). */
function upwardFalls(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(12, 18, 1), '#8FD3FF', { at: [0, 9, 0] }));
  for (let i = 0; i < 9; i++) parts.push(part(box(0.3, 4 + (i % 3) * 2, 1.1), '#FFFFFF', { at: [-5 + i * 1.25, 4 + (i % 4) * 3.5, 0] }));
  parts.push(part(new SphereGeometry(2, 8, 5), '#FFFFFF', { at: [0, 18, 0], scale: [3, 0.6, 1] }));
  return solid('upward-falls', parts);
}

/**
 * "upside-arch-bridge", 10 × 6 × 70 m: white stone, its arches hanging down under the deck (the middle 12 m missing:
 * the gap). Origin at the deck's top centre (the rail's height), +Z along the rail.
 */
function upsideArchBridge(): Group {
  const parts: BufferGeometry[] = [];
  for (const [z0, z1] of [
    [-35, -6],
    [6, 35],
  ]) {
    const len = z1 - z0;
    const mid = (z0 + z1) / 2;
    parts.push(part(box(10, 0.8, len), '#FFFFFF', { at: [0, -0.5, mid] }));
    for (const x of [-5, 5]) parts.push(part(box(0.4, 0.6, len), ROOF, { at: [x, 0.2, mid] }));
    // The arch hangs down, its lowest point in the middle of each half.
    for (let k = 0; k < 8; k++) {
      const t = (k + 0.5) / 8;
      const depth = 5.2 * Math.sin(Math.PI * t);
      parts.push(part(box(9, 0.8, len / 8 + 0.1), STONE, { at: [0, -0.9 - depth, z0 + t * len] }));
    }
  }
  return solid('upside-arch-bridge', parts, undefined, false);
}

/** A rainbow bridge: seven bands side by side, fading at the far end (origin at its root, +Z along it). */
function rainbow(name: string, w: number, len: number, rise: number): () => Group {
  const colours = ['#FF8A8A', '#FFB86B', '#FFE27A', '#9FE08A', '#8FD3FF', '#9CA8FF', '#D2A8FF'];
  return () => {
    const parts: BufferGeometry[] = [];
    const n = 12;
    colours.forEach((c, i) => {
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const y0 = rise * Math.sin((Math.PI / 2) * t0);
        const y1 = rise * Math.sin((Math.PI / 2) * t1);
        const z0 = len * t0;
        const z1 = len * t1;
        const seg = Math.hypot(z1 - z0, y1 - y0);
        parts.push(part(box(w / 7, 0.3, seg + 0.05), `#${mix(c, '#FFFFFF', t0 * 0.6).getHexString()}`, { at: [-w / 2 + (i + 0.5) * (w / 7), (y0 + y1) / 2, (z0 + z1) / 2], rot: [-Math.atan2(y1 - y0, z1 - z0), 0, 0] }));
      }
    });
    return solid(name, parts, glowMaterial(), false);
  };
}

/** "upside-library", 10 × 9 × 8 m: a little library on its roof, a big window with shelves of coloured book spines. */
function upsideLibrary(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new ConeGeometry(7, 3.5, 4), ROOF, { at: [0, 1.75, 0], rot: [Math.PI, Math.PI / 4, 0] }));
  parts.push(part(box(10, 5.5, 8), WALL, { at: [0, 6.25, 0] }));
  parts.push(part(box(6, 3.2, 0.2), CREAM, { at: [0, 6, 4.05] }));
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 12; i++) {
      const c = PASTELS[(i + row) % PASTELS.length];
      parts.push(part(box(0.35, 0.8, 0.15), `#${mix(c, PINK, (i % 3) * 0.2).getHexString()}`, { at: [-2.6 + i * 0.47, 4.9 + row * 1, 4.2] }));
    }
  }
  parts.push(part(box(1.6, 2.2, 0.2), WOOD, { at: [3.6, 7.8, 4.05] }));
  return solid('upside-library', parts);
}

/** "lectern", 0.8 × 1.2 × 0.6 m: record ③'s wooden stand. */
function lectern(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(0.5, 0.08, 0.5), WOOD, { at: [0, 0.04, 0] }));
  parts.push(part(box(0.14, 1, 0.14), WOOD, { at: [0, 0.55, 0] }));
  parts.push(part(box(0.8, 0.08, 0.6), WOOD, { at: [0, 1.12, 0], rot: [-0.35, 0, 0] }));
  return solid('lectern', parts);
}

/** "bench", 2 × 0.9 × 0.6 m: the castle station's wooden bench with a pink rim; the seat at 0.45 m, its front +Z. */
function bench(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(box(2, 0.1, 0.5), WOOD, { at: [0, 0.42, 0] }));
  parts.push(part(box(2, 0.45, 0.08), WOOD, { at: [0, 0.68, -0.26] }));
  parts.push(part(box(2.05, 0.06, 0.1), PINK, { at: [0, 0.92, -0.26] }));
  for (const x of [-0.85, 0.85]) parts.push(part(box(0.1, 0.4, 0.45), '#7A8CA3', { at: [x, 0.2, 0] }));
  return solid('bench', parts);
}

/** "promenade", 2.5 × 0.1 × 3 m: one stone slab of the moat's promenade (the script lays them along the ring). */
function promenade(): Group {
  return solid('promenade', [part(box(2.5, 0.1, 3), (p) => mix(STONE, STONE_DEEP, hash(p.x, 0, p.z) * 0.6))]);
}

/** "promenade-board", 2.5 × 0.15 × 3 m: a wooden board where `shiro` crosses the promenade. */
function promenadeBoard(): Group {
  return solid('promenade-board', [part(box(2.5, 0.15, 3), WOOD)]);
}

/** "up-raindrop", 0.5 × 0.8 × 0.5 m: record ①, a raindrop with its point up (it falls upwards); origin at its middle. */
function upRaindrop(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(0.25, 10, 8), '#9FD8FF', { at: [0, -0.12, 0] }));
  parts.push(part(new ConeGeometry(0.24, 0.5, 10), '#9FD8FF', { at: [0, 0.22, 0] }));
  parts.push(part(new SphereGeometry(0.07, 6, 4), '#FFFFFF', { at: [0.1, -0.05, 0.18] }));
  return solid('up-raindrop', parts, glowMaterial(), false);
}

/** "upside-top", 0.6 × 0.7 × 0.6 m: record ②, an iron spinning top on its head (the axle up), a pink swirl band. */
function upsideTop(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new ConeGeometry(0.3, 0.35, 12), '#7A8CA3', { at: [0, 0.18, 0], rot: [Math.PI, 0, 0] }));
  parts.push(part(cyl(0.3, 0.3, 0.12, 14), PINK, { at: [0, 0.4, 0] }));
  parts.push(part(cyl(0.22, 0.3, 0.12, 14), '#8C9DB3', { at: [0, 0.52, 0] }));
  parts.push(part(cyl(0.04, 0.04, 0.2, 6), '#5C6B80', { at: [0, 0.68, 0] }));
  return solid('upside-top', parts, glowMaterial());
}

/** "backward-book", 0.8 × 0.2 × 0.6 m: record ③, an open lavender picture book (a swirl, no letters); origin at its middle. */
function backwardBook(): Group {
  const parts: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(part(box(0.38, 0.04, 0.56), WALL_DEEP, { at: [side * 0.2, -0.02, 0], rot: [0, 0, side * -0.12] }));
    parts.push(part(box(0.35, 0.06, 0.52), CREAM, { at: [side * 0.19, 0.03, 0], rot: [0, 0, side * -0.12] }));
  }
  parts.push(part(new TorusGeometry(0.08, 0.018, 4, 12), PINK, { at: [0.19, 0.075, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new TorusGeometry(0.04, 0.015, 4, 10), PINK, { at: [0.19, 0.076, 0], rot: [Math.PI / 2, 0, 0] }));
  return solid('backward-book', parts, glowMaterial(), false);
}

const BUILDERS: Record<string, () => Group> = {
  'sakasa-castle': sakasaCastle,
  'castle-windows': castleWindows,
  'castle-island': castleIsland,
  'upside-stairs': upsideStairs,
  'house-upside-a': houseUpside('house-upside-a', 8, 9, 8, 0),
  'house-upside-b': houseUpside('house-upside-b', 10, 11, 9, 3),
  'tree-upside': treeUpside,
  'lamp-upside': lampUpside,
  'garden-topiary-upside': topiaryUpside,
  'chimney-upside': chimneyUpside,
  'clock-tower': clockTower,
  'clock-hands': clockHands,
  'upward-falls': upwardFalls,
  'upside-arch-bridge': upsideArchBridge,
  'rainbow-stub': rainbow('rainbow-stub', 5, 40, 3),
  'rainbow-rail-long': rainbow('rainbow-rail-long', 5, 200, 40),
  'upside-library': upsideLibrary,
  lectern,
  bench,
  promenade,
  'promenade-board': promenadeBoard,
  'up-raindrop': upRaindrop,
  'upside-top': upsideTop,
  'backward-book': backwardBook,
};

/** 6-1's stand-in for `name`, or null when it is not one of them. */
export function buildCastlePlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}

/** Every model drawn here (assets/models.json "_pending"). */
export const CASTLE_PLACEHOLDERS = Object.keys(BUILDERS);
