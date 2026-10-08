/**
 * The diorama of the six worlds (v1.12 えんしゅつ, ticket 0025), shared by the movies that show it: the ending
 * (scripts/layout-ending.mjs, "つながった ワールドレール") and the opening (scripts/layout-opening.mjs, "ワンダーごうと ふしぎな
 * せかい"). Six round islands in a calm sea, one for each chapter, on a ring of rail (radius RING m, one loop rail
 * "wa"). In the ending the last stretch, from the castle back to the town, is a rainbow arching over the water; in the
 * opening (before the story) it is an ordinary bridge on piers like the others.
 *
 * Conventions as scripts/layout-lib.mjs: y up, heading 0 = +Z, a left turn goes towards +X; `lateral` positive to the
 * right of the way the train runs. The ring turns left, so lateral + is OUTSIDE the ring (where the camera mostly is).
 */
import { Line, RAD, round } from './layout-lib.mjs';

export const RING = 92;
/** Rail top on the islands and the bridges (m); the islands' ground is at 0, the sea at SEA. */
export const RAIL_Y = 0.45;
export const SEA = -1.6;
/** The rainbow: from the castle island's edge to the town's (degrees round the ring) and how high it arches (m). */
export const BOW = { from: 294, to: 342, height: 10 };
/** Facing out of the ring (to the right of the way: rotationY turns +Z towards +X, the left), and into it. */
export const OUT = -90;
export const IN = 90;

/** The islands: chapter, model, ring angle (degrees) and radius (m). */
export const ISLES = [
  { id: 1, model: 'ring-isle-town', deg: 0, r: 34 },
  { id: 2, model: 'ring-isle-forest', deg: 58, r: 30 },
  { id: 3, model: 'ring-isle-sea', deg: 113, r: 28 },
  { id: 4, model: 'ring-isle-snow', deg: 166, r: 28 },
  { id: 5, model: 'ring-isle-night', deg: 220, r: 30 },
  { id: 6, model: 'ring-isle-castle', deg: 275, r: 30 },
];

/**
 * The ring of rail, with the rainbow lifting its last stretch or not, and the lookups the layouts place things with:
 * `sAt(deg)` (s at a ring angle), `at(deg, lateral, y)` (a world place by the rail), `yawAt(deg, turn)` (a world
 * rotationY facing `turn` degrees off the way the train runs).
 */
export function makeRing({ rainbow }) {
  const lift = (deg) => {
    if (!rainbow || deg <= BOW.from || deg >= BOW.to) return 0;
    const t = (deg - BOW.from) / (BOW.to - BOW.from);
    return (BOW.height * (1 - Math.cos(2 * Math.PI * t))) / 2;
  };
  const pts = [];
  let s = 0;
  for (let i = 0; i <= 3600; i++) {
    const deg = i / 10;
    const p = { x: RING * Math.sin(deg * RAD), y: RAIL_Y + lift(deg), z: RING * Math.cos(deg * RAD) };
    if (i > 0) {
      const q = pts[pts.length - 1];
      s += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    }
    pts.push({ ...p, s, deg });
  }
  // Exactly closed (the last point is the first).
  pts[pts.length - 1] = { ...pts[0], s, deg: 360 };
  const line = new Line('wa', pts);
  const L = line.length;
  const sAt = (deg) => {
    const d = ((deg % 360) + 360) % 360;
    const i = Math.round(d * 10);
    return pts[i].s;
  };
  const at = (deg, lateral, y = 0) => {
    const q = line.point(sAt(deg), lateral);
    return [round(q.x, 2), round(y, 2), round(q.z, 2)];
  };
  const yawAt = (deg, turn = 0) => round(line.at(sAt(deg)).h / RAD + turn, 1);
  /** s a little before a ring angle (the train front reaches it `ahead` m later). */
  const before = (deg, ahead) => round((sAt(deg) - ahead + L) % L, 1);
  return { line, L, sAt, at, yawAt, before };
}

/**
 * The ring's rail entry: the bridges between the islands stand on wooden piers (the islands' own ground carries the
 * rest). With the rainbow the last bridge (castle to town) is the rainbow itself; without it, piers too.
 */
export function ringRail(ring, { rainbow }) {
  const { line, sAt } = ring;
  const bridges = ISLES.map((isle, i) => [isle, ISLES[(i + 1) % ISLES.length]]).slice(0, rainbow ? -1 : undefined);
  return {
    id: 'wa',
    points: line.points(),
    base: bridges.map(([isle, next]) => {
      const to = sAt(next.deg) - next.r * 0.8;
      return { look: 'pier', toGround: true, from: round(sAt(isle.deg) + isle.r * 0.8, 1), to: round(next.deg === 0 ? ring.L - next.r * 0.8 : to, 1) };
    }),
    end: { type: 'merge', railId: 'wa', at: 0 },
  };
}

/** The rainbow gimmick under the last stretch (the ending only). */
export const rainbowGimmick = (ring) => ({ type: 'rainbow', railId: 'wa', from: round(ring.sAt(BOW.from), 1), to: round(ring.sAt(BOW.to), 1) });

/**
 * The props on the islands: the six islands themselves and what stands on each. `town: false` leaves out chapter 1's
 * town (the headquarters, the houses, the trees by the line, the ferns inside the ring), for a layout that builds its
 * own town (the opening); the dinosaurs' corner outside the ring and the clouds stay.
 */
export function islandProps(ring, { town = true } = {}) {
  const { at, yawAt } = ring;
  const props = [];
  const prop = (model, deg, lateral, turn = 0, extra = {}) => {
    const { y = 0, scale, ...rest } = extra;
    props.push({ model, position: at(deg, lateral, y), rotationY: yawAt(deg, turn), ...(scale ? { scale } : {}), ...rest });
  };
  for (const isle of ISLES) props.push({ model: isle.model, position: at(isle.deg, 0, 0), rotationY: round(isle.deg * 7, 1) });

  // 1 はじまりの まち (chapter 1: the town, the dino valley, the clouds): the headquarters by the stop, houses, the
  // dinosaurs' corner past it, a cloud or two over it.
  if (town) {
    prop('hq', -4, -24, OUT);
    prop('house-a', -20, -14, OUT);
    prop('house-b', -12, 18, IN);
    prop('shop', 6, -16, OUT);
    prop('tower', -16, -30, OUT);
    prop('tree-a', -14, 12, 0);
    prop('tree-b', -2, 14, 0);
    prop('tree-a', 6, 30, 0);
    prop('tree-b', -24, 20, 0);
  }
  prop('cycad', 12, 16, 0);
  prop('fern-a', 15, 9, 0);
  prop('fern-b', 9, 10, 30);
  // Inside the ring: where the opening's town has the headquarters' platform.
  if (town) {
    prop('cycad', 17, -12, 0);
    prop('fern-a', 14, -8, 0);
  }
  prop('rock-a', 19, 13, 0);
  prop('dino-egg', 13, 11.5, 0);
  props.push({ model: 'cloud-a', position: [round(at(-8, -10)[0], 2), 22, round(at(-8, -10)[2], 2)], rotationY: 30 });
  props.push({ model: 'cloud-b', position: [round(at(12, -26)[0], 2), 26, round(at(12, -26)[2], 2)], rotationY: 70 });

  // 2 いきものの せかい (chapter 2: the big trees, the meadow, the volcano): a big tree inside the ring, giant flowers
  // and clover outside (the meadow seen small), a little volcano across the island.
  prop('tree-trunk', 54, -18, 0, { scale: 0.16 });
  prop('canopy', 54, -18, 0, { scale: 0.16, y: 0.16 * 90 - 3 });
  prop('meadow-flower', 62, 15, 0, { scale: 0.16 });
  prop('meadow-flower', 49, 18, 40, { scale: 0.12 });
  prop('clover', 66, 9, 0, { scale: 0.22 });
  prop('acorn-big', 57, 7.5, 0, { scale: 0.5 });
  prop('volcano', 70, -14, 0, { scale: 0.032 });
  prop('mushroom', 52, 9, 0);
  prop('tree-b', 46, -8, 0);
  prop('tree-a', 64, -9, 0);

  // 3 みずの せかい (chapter 3: the sea, the river): palms on the sand, a little lighthouse at the point, coral and a
  // rock by the water, lily pads on the sea, a whale out at sea.
  prop('palm', 106, 14, 0);
  prop('palm', 120, 17, 40);
  prop('palm', 112, -14, 0);
  prop('lighthouse', 122, -18, 0, { scale: 0.45 });
  prop('coral-a', 117, 10, 0, { scale: 0.6 });
  prop('river-rock', 108, 8, 0, { scale: 0.8 });
  prop('lily-pad', 102, 30, 0, { y: SEA + 0.02, scale: 0.5 });
  prop('lily-pad', 105, 33, 30, { y: SEA + 0.02, scale: 0.35 });
  props.push({ model: 'whale', position: [...at(118, 52, SEA - 1.5)], rotationY: yawAt(118, 160) });

  // 4 こおりと ゆき (chapter 4): snowy pines, a snow house and a kamakura, a snowman by the line.
  prop('snow-pine', 158, 14, 0);
  prop('snow-pine', 172, 15, 0);
  prop('snow-pine', 162, -16, 0);
  prop('snow-pine', 176, -10, 0);
  prop('snow-house', 168, -18, OUT, { scale: 0.7 });
  prop('kamakura', 156, -10, OUT);
  prop('snowman', 173, 8, OUT);
  prop('ice-hut', 152, 18, IN, { scale: 0.8 });

  // 5 ふしぎな せかい (chapter 5: the night forest, the toy town, the mirror world): dark trees and glowing mushrooms,
  // block houses, a crystal tree and a big mirror (it reflects nothing here: a stand-in), fireflies.
  prop('night-tree-a', 212, 15, 0, { scale: 0.7 });
  prop('night-tree-b', 206, -12, 0, { scale: 0.6 });
  prop('night-bush', 214, 8.5, 0, { scale: 0.7 });
  prop('glow-mushroom', 216, 7.5, 0, { scale: 1.4 });
  prop('glow-mushroom', 210, 9.5, 0, { scale: 1.1 });
  prop('block-house-a', 226, -16, OUT, { scale: 0.6 });
  prop('block-house-b', 232, -10, OUT, { scale: 0.6 });
  prop('toy-block-train', 228, 9, 30);
  prop('mirror-frame', 233, 16, IN, { scale: 0.32 });
  prop('crystal-tree-a', 236, 10, 0);
  prop('crystal-tree-b', 221, -8, 0, { scale: 0.7 });
  props.push({ model: 'firefly-swarm', position: [...at(213, 12, 1)], rotationY: 0 });

  // 6 さかさまの しろ (chapter 6): 6-1's upside-down castle ("sakasa-castle" at 0.42 of its size: as tall as the stand-in was), pink-roofed with its
  // swirl, an upside-down birdhouse and Sakasa's doodle by the line.
  prop('sakasa-castle', 275, -15, OUT, { scale: 0.42 });
  prop('birdhouse-upside', 268, 8, OUT, { y: 0 });
  prop('sakasa-doodle', 281, 9, OUT);
  prop('tree-b', 266, 16, 0);
  prop('tree-a', 285, -6, 0);
  prop('tree-b', 289, 14, 0);
  return props;
}

/** Where each creature stands: ring angle, lateral, which way it looks (degrees off the train's way), its size. */
export const CREATURES = {
  dino: { model: 'dino-mid-stand', deg: 16, lat: 11, turn: -120 },
  'dino-small': { model: 'dino-small-walk', deg: 19.5, lat: 6.5, turn: -140 },
  squirrel: { model: 'squirrel', deg: 59.5, lat: 6.2, turn: -110 },
  butterfly: { model: 'butterfly', deg: 62.5, lat: 9, turn: -60, scale: 0.35, y: 1.6 },
  seal: { model: 'seal', deg: 115, lat: 6.5, turn: -120 },
  hare: { model: 'snow-hare', deg: 168, lat: 5.6, turn: -115, scale: 1.4 },
  tanuki: { model: 'tanuki', deg: 218, lat: 5.6, turn: -115, scale: 1.3 },
  chick: { model: 'windup-chick', deg: 224, lat: 6, turn: -120 },
};

/** The cutscene steps that bring the creatures on, each where it stands (they move: the props stand still). */
export const creatureSpawns = (ring) =>
  Object.entries(CREATURES).map(([id, c]) => ({
    spawn: id,
    model: c.model,
    position: ring.at(c.deg, c.lat, c.y ?? 0),
    rotationY: ring.yawAt(c.deg, c.turn),
    ...(c.scale ? { scale: c.scale } : {}),
  }));
