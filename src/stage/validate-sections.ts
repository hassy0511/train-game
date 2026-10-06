import type { RailNetwork } from '../rail/types';
import { PORTAL } from '../train/params';
import { SECTION_ENVIRONMENT_KEYS, type JunctionDef, type MagnetTarget, type StageFile } from './types';

/**
 * v1.11 (PR11a, PHASE9_CHAPTER5_6 第 3 部 B6.7): the checks of sections (`sections`), gates (`end.type` "portal") and
 * the friends riding along (`crew`). The shapes are checked with the rest of the file (checkSectionShapes, from
 * validateStageFile; a section's look with checkEnvironmentParts), where things lie once the network is built
 * (validateSectionLayout).
 */

class SectionValidationError extends Error {
  constructor(message: string) {
    super(`Stage JSON invalid: ${message}`);
    this.name = 'StageValidationError';
  }
}

function fail(message: string): never {
  throw new SectionValidationError(message);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * `sections` and `crew` as written. `checkLook` checks a section's look like the stage's own (sky, fog, lighting, …).
 */
export function checkSectionShapes(raw: Record<string, unknown>, railIds: Set<string>, checkLook: (env: Record<string, unknown>, where: string) => void): void {
  if (raw.crew !== undefined) {
    const c = raw.crew;
    if (!Array.isArray(c) || c.length !== 1 || c[0] !== 'sakasa') fail('"crew" must be ["sakasa"]');
  }
  if (raw.sections === undefined) return;
  const list = raw.sections;
  if (!Array.isArray(list) || list.length < 2) fail('"sections" must list two sections or more');
  const ids = new Set<string>();
  const owner = new Map<string, string>();
  for (const sec of list as unknown[]) {
    if (!isObject(sec) || !isString(sec.id)) fail('each section needs an "id"');
    const where = `section "${sec.id}"`;
    if (ids.has(sec.id)) fail(`${where}: the id is used twice`);
    ids.add(sec.id);
    if (!Array.isArray(sec.rails) || sec.rails.length === 0 || !sec.rails.every(isString)) fail(`${where}: "rails" must list its rails`);
    for (const id of sec.rails as string[]) {
      if (!railIds.has(id)) fail(`${where}: unknown rail "${id}"`);
      if (owner.has(id)) fail(`${where}: rail "${id}" is in section "${owner.get(id)}" already (every rail in exactly one)`);
      owner.set(id, sec.id);
    }
    const env = sec.environment;
    if (!isObject(env)) fail(`${where}: "environment" must be an object (the fields it changes; {} for none)`);
    for (const k of Object.keys(env)) {
      if (!(SECTION_ENVIRONMENT_KEYS as readonly string[]).includes(k)) {
        fail(`${where}: "environment.${k}" cannot change by section (${k === 'water' ? 'the water is the stage\'s, put by its area' : k === 'bgm' ? 'one song for the stage' : `only ${SECTION_ENVIRONMENT_KEYS.join(', ')}`})`);
      }
    }
    checkLook(env, `${where} "environment"`);
  }
  for (const id of railIds) if (!owner.has(id)) fail(`rail "${id}" is in no section (every rail in exactly one)`);
}

/**
 * Where the gates and sections lie (B6.7): a gate arrives on a known rail at least PORTAL.minAt m in; the rail it
 * arrives on holds nothing up to its arrival point, nor the gate's own rail in its last PORTAL.clearBefore m (no fork,
 * merge, gap, water, snow wall, slope, station), and nothing asks something at once for PORTAL.clearAfter m after the
 * arrival (no animal on the rail, gap, water's edge, snow wall, magnet stretch, mirrored stretch). Sections: no fork or
 * merge joins rails of two sections, and their rails keep the fog's farthest reach apart.
 */
export function validateSectionLayout(file: StageFile, network: RailNetwork, back: readonly JunctionDef[], magnets: readonly MagnetTarget[]): void {
  const junctions = [...file.junctions, ...back];
  for (const r of file.rails) {
    if (r.end.type !== 'portal') continue;
    const where = `rail "${r.id}"'s portal`;
    const end = r.end;
    const to = network.getRail(end.railId);
    if (end.railId === r.id) fail(`${where}: leads to its own rail (a ring is a merge)`);
    if (end.at < PORTAL.minAt) fail(`${where}: arrives at ${end.at} on "${end.railId}" (at least ${PORTAL.minAt}: the three cars fit in)`);
    if (end.at > to.length - PORTAL.clearBefore) fail(`${where}: arrives at ${end.at}, too near the end of "${end.railId}"`);
    const from = network.getRail(r.id);
    const lo = from.length - PORTAL.clearBefore;
    const before = (railId: string, a: number, b: number): string[] => thingsOn(file, network, junctions, railId, a, b);
    for (const what of before(r.id, lo, from.length)) fail(`${where}: ${what} in its last ${PORTAL.clearBefore} m`);
    for (const what of before(end.railId, 0, end.at)) fail(`${where}: ${what} on "${end.railId}" before its arrival (${end.at})`);
    // After the arrival: nothing that wants something at once (the white is just gone).
    const hi = end.at + PORTAL.clearAfter;
    const inAfter = (a: number, b = a): boolean => b >= end.at && a <= hi;
    for (const a of file.actors) {
      if ('onRail' in a && a.onRail.railId === end.railId && a.type !== 'trigger' && inAfter(a.onRail.at)) fail(`${where}: actor "${a.id}" within ${PORTAL.clearAfter} m after its arrival`);
    }
    for (const g of to.gaps) if (inAfter(g.from, g.to)) fail(`${where}: a gap (${g.from}–${g.to}) within ${PORTAL.clearAfter} m after its arrival`);
    for (const w of [...to.surfaces, ...to.dives]) if (inAfter(w.from)) fail(`${where}: the water's edge within ${PORTAL.clearAfter} m after its arrival`);
    for (const p of to.plows) if (inAfter(p.from)) fail(`${where}: a snow wall within ${PORTAL.clearAfter} m after its arrival`);
    for (const m of magnets) if (m.railId === end.railId && inAfter(m.at, m.end)) fail(`${where}: magnet "${m.id}" within ${PORTAL.clearAfter} m after its arrival`);
    file.gimmicks.forEach((g, i) => {
      if (g.type === 'mirror-flip' && g.railId === end.railId && g.from !== undefined && inAfter(g.from, g.to ?? g.from)) fail(`${where}: gimmicks[${i}] mirror-flip within ${PORTAL.clearAfter} m after its arrival`);
    });
    for (const f of file.floaters ?? []) if (f.railId === end.railId && inAfter(f.at)) fail(`${where}: floater "${f.id}" within ${PORTAL.clearAfter} m after its arrival`);
  }

  if (!file.sections) return;
  const sectionOf = new Map<string, string>();
  for (const sec of file.sections) for (const id of sec.rails) sectionOf.set(id, sec.id);
  for (const j of junctions) {
    for (const side of [j.left, j.right]) {
      if (side !== undefined && sectionOf.get(side) !== sectionOf.get(j.railId)) fail(`junction "${j.id}": joins rails of sections "${sectionOf.get(j.railId)}" and "${sectionOf.get(side)}" (only a gate joins sections)`);
    }
  }
  for (const r of file.rails) {
    if (r.end.type === 'merge' && sectionOf.get(r.end.railId) !== sectionOf.get(r.id)) fail(`rail "${r.id}": merges into rail "${r.end.railId}" of another section (only a gate joins sections)`);
  }
  // The farthest any camera sees here (a fixed cutscene camera stretches the fog up to PORTAL.reachMax times).
  const looks = [file.environment, ...file.sections.map((s) => ({ ...file.environment, ...s.environment }))];
  const seen = Math.max(...looks.map((e) => (e.fog ? e.fog.far * PORTAL.reachMax + PORTAL.farMargin : PORTAL.noFogFar)));
  const need = seen + PORTAL.sectionMargin;
  const samples = new Map<string, { x: number; y: number; z: number }[]>();
  for (const sec of file.sections) {
    const pts: { x: number; y: number; z: number }[] = [];
    for (const id of sec.rails) {
      const rail = network.getRail(id);
      for (let s = 0; s <= rail.length + 1e-6; s += 10) pts.push(rail.frameAt(Math.min(s, rail.length)).position);
      pts.push(rail.frameAt(rail.length).position);
    }
    samples.set(sec.id, pts);
  }
  const secs = file.sections;
  for (let a = 0; a < secs.length; a++) {
    for (let b = a + 1; b < secs.length; b++) {
      let best = Infinity;
      for (const p of samples.get(secs[a].id) ?? []) {
        for (const q of samples.get(secs[b].id) ?? []) {
          const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
          if (d < best) best = d;
        }
      }
      if (best < need) fail(`sections "${secs[a].id}" and "${secs[b].id}": their rails come ${best.toFixed(0)} m near (at least ${need.toFixed(0)}: the farthest a camera sees, ${seen.toFixed(0)}, and ${PORTAL.sectionMargin})`);
    }
  }
}

/** What lies on rail `railId` between `a` and `b` that a gate keeps clear (described for the error). */
function thingsOn(file: StageFile, network: RailNetwork, junctions: readonly JunctionDef[], railId: string, a: number, b: number): string[] {
  const out: string[] = [];
  const inside = (x: number, y = x): boolean => y >= a && x <= b;
  const rail = network.getRail(railId);
  for (const j of junctions) if (j.railId === railId && inside(j.at)) out.push(`junction "${j.id}"`);
  for (const r of file.rails) if (r.id !== railId && r.end.type === 'merge' && r.end.railId === railId && inside(r.end.at)) out.push(`rail "${r.id}"'s merge`);
  for (const g of rail.gaps) if (inside(g.from, g.to)) out.push(`a gap (${g.from}–${g.to})`);
  for (const w of [...rail.surfaces, ...rail.dives]) if (inside(w.from, w.to)) out.push('water');
  for (const p of rail.plows) if (inside(p.from, p.to)) out.push('a snow wall');
  file.gimmicks.forEach((g, i) => {
    if (g.type === 'slope' && g.railId === railId && g.from !== undefined && inside(g.from, g.to ?? g.from)) out.push(`gimmicks[${i}] slope`);
  });
  for (const st of file.stations) if (st.railId === railId && inside(st.at)) out.push(`station "${st.id}"`);
  return out;
}
