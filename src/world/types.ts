/** src/world/world.json: the world map (docs/PHASE4_DESIGN.md). */
export interface WorldFile {
  chapters: WorldChapter[];
  islands: WorldIsland[];
  /**
   * [from, to, options?]: the rail from one island to the next; it is laid once `from` is cleared. A link to
   * "teaser:<chapter>" is the dotted line to that chapter's "?" island (never laid; drawn with the teaser).
   */
  links: WorldLink[];
}

export type WorldLink = [string, string] | [string, string, WorldLinkOptions];

export interface WorldLinkOptions {
  /** Control point of the curve in % of the map (x, y). Default: above the midpoint (a gentle arc). */
  via?: [number, number];
}

export interface WorldChapter {
  id: number;
  title: string;
  /** Shown once, the first time the map draws `link` (docs/PHASE7_FINISH.md §3). */
  finale?: {
    /** "from>to": the rail that closes the chapter. */
    link: string;
    /** The island ids in order: a golden light runs round them once, hopping each island. */
    ring?: string[];
    /** Card text (lines split by "\n", 20 characters at most per line) and its button. */
    card: string;
    button: string;
    icon?: 'badge' | 'ring';
  };
  /** A chapter without stages yet: one "?" island with a dotted line, once `after` is cleared. */
  teaser?: {
    label: string;
    x: number;
    y: number;
    /** The island the dotted line starts from (the link "<from>>teaser:<id>" gives its curve). */
    from: string;
    after: string;
    /** What the partner says when it is tapped. */
    line: string;
  };
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
    /** Extra stretch of the height only (× scale), e.g. the wide, low volcano so it reads as a mountain. */
    scaleY?: number;
    /** Extra height (m), e.g. clouds hanging above. */
    lift?: number;
    /** Offset in the model's own (rotated, scaled) frame, e.g. a neck on its joint. */
    local?: [number, number, number];
  }[];
}
