/** src/world/world.json: the world map (docs/PHASE4_DESIGN.md). */
export interface WorldFile {
  chapters: { id: number; title: string }[];
  islands: WorldIsland[];
  /** [from, to]: the rail from one island to the next; it is laid once `from` is cleared. */
  links: [string, string][];
}

export interface WorldIsland {
  /** Stage id. Without a stage file (a later chapter) the island is a "?" silhouette. */
  id: string;
  chapter: number;
  /** Centre in % of the map area, from the left and from the top. */
  x: number;
  y: number;
  /** What the island picture (public/map/<id>.png) shows; see scripts/render-map.mjs. */
  diorama?: WorldDiorama;
}

export interface WorldDiorama {
  /** Island model under everything (top at y = 0). */
  base: string;
  /** A ring of track on the top. */
  rail?: { radius: number };
  camera?: { yaw: number; pitch: number };
  items: {
    model: string;
    /** [x, z] on the island top (m). */
    at: [number, number];
    rotY?: number;
    scale?: number;
    /** Extra height (m), e.g. clouds hanging above. */
    lift?: number;
    /** Offset in the model's own (rotated, scaled) frame, e.g. a neck on its joint. */
    local?: [number, number, number];
  }[];
}
