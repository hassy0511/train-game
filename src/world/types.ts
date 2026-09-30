/**
 * src/world/world.json: the world map (docs/PHASE4_DESIGN.md), in pages of two chapters each
 * (docs/PHASE8_CHAPTER3_4.md 第 1 部 §3).
 */
export interface WorldFile {
  /** The map's pages: the heading shown beside "ちず" on each. */
  pages?: WorldPage[];
  chapters: WorldChapter[];
  islands: WorldIsland[];
  /**
   * [from, to, options?]: the rail from one island to the next; it is laid once `from` is cleared. A link to
   * "teaser:<chapter>" is the dotted line to that chapter's "?" island (never laid; drawn with the teaser).
   */
  links: WorldLink[];
}

export interface WorldPage {
  id: number;
  /** Beside "ちず" once there is more than one page to see, e.g. "3しょう みず・4しょう こおりと ゆき". */
  title: string;
}

export type WorldLink = [string, string] | [string, string, WorldLinkOptions];

/** A point on a page in % of the map area, with the curve's control point for the rail to or from it. */
export interface WorldGatePoint {
  x: number;
  y: number;
  via?: [number, number];
}

export interface WorldLinkOptions {
  /** Control point of the curve in % of the map (x, y). Default: above the midpoint (a gentle arc). */
  via?: [number, number];
  /** Not laid before this chapter is done, even with `from` cleared (the rail out of a finished chapter). */
  afterChapter?: number;
  /**
   * A rail to another page goes through the cloud gate ("くもの もん"): on `from`'s page it runs to the gate at
   * `exit`, on `to`'s page from the gate at `enter` on to `to`. One link key ("1-1>3-1") for both halves.
   */
  exit?: WorldGatePoint;
  enter?: WorldGatePoint;
}

export interface WorldChapter {
  id: number;
  /** The map page its islands are on (two chapters a page). */
  page: number;
  title: string;
  /**
   * Shown once, the first time the map draws `link` (docs/PHASE7_FINISH.md §3). Without a link, the first time
   * the map opens with the chapter done; then "finale:<id>" in the save's mapLinks marks it seen.
   */
  finale?: {
    /** "from>to": the rail that closes the chapter. */
    link?: string;
    /** The island ids in order: a golden light runs round them once, hopping each island. */
    ring?: string[];
    /** The island ids in order along one road (not closed): the light runs along it once. Not counted for done. */
    path?: string[];
    /**
     * gold (default): the light round the ring, islands hop. water: a blue light along the path, islands bob,
     * then snow on the next chapter's islands. aurora: a band of light across the sky, islands twinkle in turn.
     * v1.11 firefly (chapter 5): night falls, fireflies rise from each island of the path in turn and gather along the
     * rails into one big light that flies to `target`; dawn.
     */
    light?: 'gold' | 'water' | 'aurora' | 'firefly';
    /**
     * v1.11: where the big light of an end without a link lands (an island, or "teaser:<chapter>"; docs/
     * PHASE9_CHAPTER5_6.md §0.9 の 1: "teaser:6" until 6-1's island comes, then "6-1").
     */
    target?: string;
    /** Card text (lines split by "\n", 20 characters at most per line) and its button. */
    card: string;
    button: string;
    icon?: 'badge' | 'ring' | 'wave' | 'snow' | 'firefly';
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
  /** v1.11 (5-1): drawn under the night's blue light at 70 % (the map's pictures stay bright enough to read). */
  lighting?: 'night';
  /** v1.11 (5-3): the island top's colour (e.g. lavender "#d9cdf4"); the rock underneath keeps its own. */
  ground?: string;
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
