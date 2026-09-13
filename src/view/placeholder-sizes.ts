/**
 * Rough footprints (width, height, depth in meters) for models that are not built yet.
 * Used by the wireframe view and by the Three.js view when a .glb is missing.
 */
export const PLACEHOLDER_SIZES: Record<string, [number, number, number]> = {
  'tree-a': [3.2, 4.2, 3.2],
  'tree-b': [3.6, 4.6, 3.6],
  rock: [2, 1.2, 1.6],
  'buffer-stop': [3.2, 1.2, 1],
  'house-a': [8, 7, 7],
  'house-b': [10, 8, 8],
  'house-c': [7, 9, 7],
  shop: [12, 6, 8],
  tower: [6, 18, 6],
  hq: [20, 12, 14],
  platform: [4, 1, 30],
  'platform-roof': [4, 4.2, 12],
  'station-sign': [2.4, 3, 0.3],
  'crossing-sign': [1.2, 3, 0.2],
  'crossing-gate': [4.5, 3.2, 0.6],
  'cat-sleep': [0.7, 0.35, 0.5],
  'cat-stand': [0.7, 0.6, 0.4],
  cat: [0.7, 0.4, 0.5],
  partner: [0.6, 0.7, 0.5],
  amanojaku: [0.9, 1.4, 0.6],
  passenger: [0.6, 1.6, 0.4],
  parcel: [0.6, 0.5, 0.6],
  'goal-flag': [1.6, 2.4, 0.2],
};

export function placeholderSize(model: string): [number, number, number] {
  const key = Object.keys(PLACEHOLDER_SIZES).find((k) => model === k || model.startsWith(`${k}-`));
  return key ? PLACEHOLDER_SIZES[key] : [1, 1, 1];
}
