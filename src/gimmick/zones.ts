import type { GimmickDef } from '../stage/types';

/** The first gimmick of `type` whose [from, to] range on `railId` contains `s` (stage data, no state). */
export function zoneAt(gimmicks: GimmickDef[], type: string, railId: string, s: number): GimmickDef | null {
  for (const g of gimmicks) {
    if (g.type !== type || g.railId !== railId || g.from === undefined || g.to === undefined) continue;
    if (s >= g.from && s <= g.to) return g;
  }
  return null;
}

/** A number from a gimmick's params, or the fallback. */
export function param(g: GimmickDef, key: string, fallback: number): number {
  const v = g.params?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
