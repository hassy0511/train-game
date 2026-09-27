import type { RailNetwork } from '../rail/types';
import { DIVE } from '../train/params';
import type { JunctionDef, StageFile, WaterArea, WaterDef, WaterLook, WaterSpan } from './types';

/**
 * v1.10 water helpers shared by the loader, the checks, the view and the train: where a water is, and which rail
 * stretches run on its surface or under it.
 */

/** Under-water colour and seeing distance (m) by look (PHASE8 part 2 §2.7). */
export const WATER_UNDER: Record<WaterLook, { color: string; far: number }> = {
  sea: { color: '#2f8fc8', far: 70 },
  lake: { color: '#5fb4d8', far: 60 },
  puddle: { color: '#7fc6c9', far: 40 },
  ice: { color: '#8fd0ea', far: 60 },
};

/** The floor's colour by look. */
export const WATER_FLOOR: Record<WaterLook, string> = {
  sea: '#e3d3a4',
  lake: '#b9b08a',
  puddle: '#a89a78',
  ice: '#c9d8de',
};

/** True when (x, z) lies inside `area` (a missing area is a sea: everywhere). */
export function inArea(area: WaterArea | undefined, x: number, z: number, grow = 0): boolean {
  if (!area) return true;
  if ('circle' in area) {
    const c = area.circle;
    return Math.hypot(x - c.center[0], z - c.center[1]) <= c.radius + grow;
  }
  const r = area.rect;
  const a = ((r.rotationY ?? 0) * Math.PI) / 180;
  // Into the rect's own frame: "along" is its +Z turned by rotationY about +Y, "across" its +X.
  const dx = x - r.center[0];
  const dz = z - r.center[1];
  const across = dx * Math.cos(a) - dz * Math.sin(a);
  const along = dx * Math.sin(a) + dz * Math.cos(a);
  const hx = r.size[0] / 2 + grow;
  const hz = r.size[1] / 2 + grow;
  const corner = Math.min(r.corner ?? 0, hx, hz);
  const qx = Math.abs(across) - (hx - corner);
  const qz = Math.abs(along) - (hz - corner);
  if (qx <= 0 || qz <= 0) return Math.abs(across) <= hx && Math.abs(along) <= hz;
  return Math.hypot(qx, qz) <= corner;
}

/** The outline of an area as points [x, z] going round once (a rect's rounded corners in a few steps). */
export function areaOutline(area: WaterArea, segments = 48): [number, number][] {
  if ('circle' in area) {
    const c = area.circle;
    return Array.from({ length: segments }, (_, i): [number, number] => {
      const t = (i / segments) * Math.PI * 2;
      return [c.center[0] + Math.cos(t) * c.radius, c.center[1] + Math.sin(t) * c.radius];
    });
  }
  const r = area.rect;
  const a = ((r.rotationY ?? 0) * Math.PI) / 180;
  const hx = r.size[0] / 2;
  const hz = r.size[1] / 2;
  const corner = Math.min(r.corner ?? 0, hx, hz);
  const local: [number, number][] = [];
  const steps = corner > 0 ? 6 : 1;
  // Corner centres going round, each with the quarter it draws.
  const corners: [number, number, number][] = [
    [hx - corner, hz - corner, 0],
    [-(hx - corner), hz - corner, 90],
    [-(hx - corner), -(hz - corner), 180],
    [hx - corner, -(hz - corner), 270],
  ];
  for (const [cx, cz, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const t = ((start + (90 * i) / steps) * Math.PI) / 180;
      local.push([cx + Math.cos(t) * corner, cz + Math.sin(t) * corner]);
    }
  }
  // Back to the world: across = x', along = z' turned by rotationY.
  return local.map(([across, along]): [number, number] => [
    r.center[0] + across * Math.cos(a) + along * Math.sin(a),
    r.center[1] - across * Math.sin(a) + along * Math.cos(a),
  ]);
}

/** The water whose area holds (x, z) (the first one), with its index, or null. */
export function waterAt(waters: WaterDef[] | undefined, x: number, z: number): { water: WaterDef; index: number } | null {
  if (!waters) return null;
  for (let i = 0; i < waters.length; i++) if (inArea(waters[i].area, x, z)) return { water: waters[i], index: i };
  return null;
}

/** Sampling step (m) along a rail when working out its water stretches. */
const STEP = 1;

/**
 * Works out every rail's stretches on the water surface and under water (Rail.surfaces / Rail.dives), 1 m at a
 * time: under water where the rail top is DIVE.submerge m or more below the surface, on the surface where it is
 * between that and DIVE.surfaceAbove m above it, both inside the water's area.
 */
export function computeWaterSpans(file: StageFile, network: RailNetwork): void {
  const waters = file.environment.water ?? [];
  for (const rail of network.rails.values()) {
    rail.surfaces = [];
    rail.dives = [];
    if (waters.length === 0) continue;
    let open: { kind: 'surface' | 'dive'; from: number; water: number } | null = null;
    const close = (to: number): void => {
      if (!open) return;
      const span: WaterSpan = { from: open.from, to, water: open.water };
      (open.kind === 'surface' ? rail.surfaces : rail.dives).push(span);
      open = null;
    };
    const n = Math.ceil(rail.length / STEP);
    for (let i = 0; i <= n; i++) {
      const s = Math.min(rail.length, i * STEP);
      const p = rail.frameAt(s).position;
      const hit = waterAt(waters, p.x, p.z);
      let kind: 'surface' | 'dive' | null = null;
      if (hit) {
        const rel = p.y - hit.water.y;
        if (rel <= -DIVE.submerge) kind = 'dive';
        else if (rel <= DIVE.surfaceAbove) kind = 'surface';
      }
      const current = open as { kind: 'surface' | 'dive'; from: number; water: number } | null;
      if (current && (current.kind !== kind || current.water !== hit?.index)) close(s);
      if (kind && !open) open = { kind, from: s, water: hit?.index ?? 0 };
    }
    close(rail.length);
  }
}

/** A rail's water stretch holding `s` among `spans`, or null. */
export function spanAt(spans: WaterSpan[], s: number): WaterSpan | null {
  for (const span of spans) if (s >= span.from && s <= span.to) return span;
  return null;
}

/**
 * The side of a dive fork whose rail goes under water within DIVE.forkReach m of the fork (through merges too), or
 * null when neither or both do.
 */
export function diveForkSide(j: JunctionDef, network: RailNetwork): 'left' | 'right' | null {
  const goesUnder = (railId: string | undefined, from: number): boolean => {
    if (railId === undefined) return false;
    const rail = network.getRail(railId);
    return rail.dives.some((d) => d.to >= from && d.from <= from + DIVE.forkReach);
  };
  // The side that stays on the junction's own rail starts at the fork; a branch starts at 0.
  const sideFrom = (railId: string | undefined): number => (railId === j.railId ? j.at : 0);
  const left = goesUnder(j.left, sideFrom(j.left));
  const right = goesUnder(j.right, sideFrom(j.right));
  if (left === right) return null;
  return left ? 'left' : 'right';
}
