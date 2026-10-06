import type { RailNetwork } from '../rail/types';
import type { AmbienceKind, EnvironmentDef, GimmickDef, ResolvedSection, StageFile } from './types';

/**
 * v1.11 (PR11a, PHASE9_CHAPTER5_6 第 3 部 B6.1): a stage's sections resolved: each one's look (the stage's own
 * `environment` with the section's fields written over it; `water` and the song stay the stage's) and the middle of
 * its rails (where the one ground board goes). Empty for a stage without `sections`.
 */
export function resolveSections(file: StageFile, network: RailNetwork): ResolvedSection[] {
  return (file.sections ?? []).map((sec) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const id of sec.rails) {
      const rail = network.getRail(id);
      for (let s = 0; s <= rail.length; s += Math.max(10, rail.length / 40)) {
        const p = rail.frameAt(s).position;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    }
    const environment: EnvironmentDef = { ...file.environment, ...sec.environment };
    return {
      id: sec.id,
      rails: new Set(sec.rails),
      environment,
      centre: { x: Math.round((minX + maxX) / 2), z: Math.round((minZ + maxZ) / 2) },
    };
  });
}

/** v1.11 (PR11a): the section rail `railId` belongs to (null: the stage has no sections). */
export function sectionOf(sections: readonly ResolvedSection[], railId: string): ResolvedSection | null {
  for (const sec of sections) if (sec.rails.has(railId)) return sec;
  return null;
}

/** v1.11 (PR11a, 第 3 部 B6.5): a stretch whose sound around the train is `kind` (the view inside it, A10). */
export interface AmbienceZone {
  railId: string;
  from: number;
  to: number;
  kind: AmbienceKind;
}

/** v1.11 (PR11a): the `ambience` gimmicks (a section whose look changes along the way: the sound around changes there). */
export function ambienceZones(gimmicks: readonly GimmickDef[]): AmbienceZone[] {
  return gimmicks.flatMap((g) =>
    g.type === 'ambience' && g.railId !== undefined && g.from !== undefined && g.to !== undefined
      ? [{ railId: g.railId, from: g.from, to: g.to, kind: (g.params as { kind: AmbienceKind }).kind }]
      : [],
  );
}

/** The ambience zone at (`railId`, `s`), or null. */
export function ambienceAt(zones: readonly AmbienceZone[], railId: string, s: number): AmbienceZone | null {
  for (const z of zones) if (z.railId === railId && s >= z.from && s < z.to) return z;
  return null;
}
