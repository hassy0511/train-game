import type { RailNetwork } from '../rail/types';
import type { JunctionDef, MissionJunctionRule } from '../stage/types';
import { LEAD } from '../train/params';

/** One stretch of the lead path: `from`–`to` on `railId`, starting `start` m along the path. */
export interface LeadLeg {
  railId: string;
  from: number;
  to: number;
  start: number;
}

/**
 * v1.11 (6-1, PHASE9_CHAPTER5_6 第 7 部 §4.1・§4.9): the way the lead runs (おいかけっこ): from `from` on its rail along
 * the train's way through the junctions (the mission's `lock` / `default`, else the junction's default) and merges.
 * `ring`: it comes back round to where it started (the only kind the loader accepts). `junctions`: those it passes
 * over, with the side it takes.
 */
export interface LeadPath {
  legs: LeadLeg[];
  length: number;
  ring: boolean;
  junctions: { junction: JunctionDef; side: 'left' | 'right' }[];
  /** Where it stopped when it is not a ring: "buffer" (a rail's end), "long" (over LEAD.maxPath m). */
  end: 'ring' | 'buffer' | 'long';
}

/** The side the lead path takes at `j` (the mission's rule, else its default). */
export function leadSide(j: JunctionDef, rules: Record<string, MissionJunctionRule> | undefined): 'left' | 'right' {
  const r = rules?.[j.id];
  return r?.lock ?? r?.default ?? j.default;
}

/** Traces the lead path from `from` on `railId` (see LeadPath). Pure: the loader's checks and LeadRunner use it. */
export function traceLeadPath(
  junctions: readonly JunctionDef[],
  network: RailNetwork,
  railId: string,
  from: number,
  rules: Record<string, MissionJunctionRule> | undefined,
  max: number = LEAD.maxPath,
): LeadPath {
  const legs: LeadLeg[] = [];
  const passed: LeadPath['junctions'] = [];
  let rail = railId;
  let s = from;
  let total = 0;
  const push = (to: number): void => {
    if (to > s) {
      legs.push({ railId: rail, from: s, to, start: total });
      total += to - s;
    }
  };
  for (let hop = 0; hop < 40 && total <= max; hop++) {
    const r = network.getRail(rail);
    const ahead = junctions.filter((j) => j.railId === rail && j.at > s + 1e-6).sort((a, b) => a.at - b.at);
    // The first place on this rail where the path leaves it (a junction to another rail), else its end.
    let leave: { at: number; to: string | null; enter: number } | null = null;
    for (const j of ahead) {
      const side = leadSide(j, rules);
      passed.push({ junction: j, side });
      const target = j[side];
      if (target !== undefined && target !== rail) {
        leave = { at: j.at, to: target, enter: 0 };
        break;
      }
    }
    if (!leave) leave = r.end.type === 'merge' ? { at: r.length, to: r.end.railId, enter: r.end.at } : { at: r.length, to: null, enter: 0 };
    // Back round on the rail it started on, before `from` and reaching it: the ring closes there.
    if (hop > 0 && rail === railId && s <= from + 1e-6 && leave.at >= from - 1e-6) {
      // The junctions counted past `from` belong to the next lap.
      for (let i = passed.length - 1; i >= 0 && passed[i].junction.railId === rail && passed[i].junction.at > from; i--) passed.pop();
      push(from);
      return { legs, length: total, ring: true, junctions: passed, end: 'ring' };
    }
    push(leave.at);
    if (leave.to === null) return { legs, length: total, ring: false, junctions: passed, end: 'buffer' };
    rail = leave.to;
    s = leave.enter;
  }
  return { legs, length: total, ring: false, junctions: passed, end: 'long' };
}

/** Where `p` m along the path is (a ring wraps round). */
export function leadPlace(path: LeadPath, p: number): { railId: string; s: number } {
  const L = path.length;
  let q = p;
  if (path.ring && L > 0) q = ((p % L) + L) % L;
  else q = Math.max(0, Math.min(L, p));
  for (const leg of path.legs) {
    if (q <= leg.start + (leg.to - leg.from) + 1e-6) return { railId: leg.railId, s: leg.from + (q - leg.start) };
  }
  const last = path.legs[path.legs.length - 1];
  return { railId: last.railId, s: last.to };
}

/** How far along the path (railId, s) is, or null when the path does not run there. */
export function leadOffset(path: LeadPath, railId: string, s: number): number | null {
  for (const leg of path.legs) if (leg.railId === railId && s >= leg.from - 1e-6 && s <= leg.to + 1e-6) return leg.start + (s - leg.from);
  return null;
}
