import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { buildRailNetwork } from '../rail/network';
import type { RailNetwork } from '../rail/types';
import { iceZones, thinIceZones } from '../gimmick/ice';
import { fireflyForks } from '../gimmick/fireflies';
import { hushZones } from '../gimmick/hush';
import { assignPlowSpans, plowSpans } from '../gimmick/plow';
import { reversedZones } from '../gimmick/reversed-whistle';
import { FIREFLY_FORK } from '../train/params';
import { rocketZones } from '../gimmick/rocket';
import { slopeZones } from '../gimmick/slope';
import { REVERSE_POST, type AbilityId, type JunctionDef, type Placement, type PropDef, type RecordDef, type ResolvedActor, type ResolvedProp, type ResolvedRecord, type ResolvedStation, type StageData, type StageFile, type Vec3 } from './types';
import { ironDrawsProp, ironPropsFor, magnetTargets } from '../gimmick/magnet-layout';
import {
  validateIceLayout,
  validateMagnetLayout,
  validateMirrorWorld,
  validateNightLayout,
  validatePlowLayout,
  validateSnowLayout,
  validateStageFile,
  validateBackJunctions,
  validateStageLayout,
  validateToyLayout,
  validateWaterLayout,
} from './validate';
import { computeWaterSpans, diveForkSide } from './water';
import { validateLeadLayout } from './validate-lead';

// One chunk per stage file; stages load lazily.
const stageModules = import.meta.glob('../stages/*.json');

export function listStageIds(): string[] {
  return Object.keys(stageModules)
    .map((k) => k.replace('../stages/', '').replace('.json', ''))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Every record of every playable (non-hidden) stage, in stage order, for the picture book. */
export async function loadAllRecords(): Promise<{ stageId: string; stageTitle: string; record: RecordDef }[]> {
  const out: { stageId: string; stageTitle: string; record: RecordDef }[] = [];
  for (const id of listStageIds()) {
    const mod = (await stageModules[`../stages/${id}.json`]()) as { default: StageFile };
    const file = mod.default;
    if (file.hidden) continue;
    for (const record of file.records) out.push({ stageId: file.id, stageTitle: file.title, record });
  }
  return out;
}

/** Title and required stages of a stage, without building it. */
export async function peekStage(
  id: string,
): Promise<(Pick<StageFile, 'id' | 'title' | 'unlock' | 'unlocks' | 'records'> & { missionCount: number; missionTitles: string[]; openingUnlocks: AbilityId[] }) | null> {
  const load = stageModules[`../stages/${id}.json`];
  if (!load) return null;
  const file = ((await load()) as { default: StageFile }).default;
  const opening = (file.opening && file.cutscenes?.[file.opening]) || [];
  return {
    id: file.id,
    title: file.title,
    unlock: file.unlock,
    unlocks: file.unlocks,
    records: file.records,
    missionCount: file.missions.length,
    // The check mode's stage list (src/ui/kakunin.ts) shows them.
    missionTitles: file.missions.map((m) => m.title),
    // v1.11: the abilities the stage gives in its opening (so the child has them from its start: the map's badges).
    openingUnlocks: opening.flatMap((st) => ('unlock' in st ? [st.unlock] : [])),
  };
}

export async function loadStage(id: string): Promise<StageData> {
  const load = stageModules[`../stages/${id}.json`];
  if (!load) throw new Error(`Unknown stage "${id}"`);
  const mod = (await load()) as { default: unknown };
  return prepareStage(mod.default);
}

/**
 * Everything loading a stage does once its JSON is in hand: the checks, the rail network, the resolved props,
 * actors, stations and records. Pure (no browser, no fetch), so scripts/check-stages.mjs runs it over every stage
 * file at build time; anything wrong in a stage file throws here.
 */
export function prepareStage(raw: unknown): StageData {
  // A copy: gaps opened and closed at run time (rail cuts, flower bridges) must not touch the loaded module.
  const file = validateStageFile(structuredClone(raw));
  addBridgeGaps(file);
  // v1.11 (PR8a): back junctions (switchbacks) work only reversing: kept apart, so everything forward (the train's
  // forks, the checks, the rail network's feeders) sees the forward ones only.
  const backJunctions = file.junctions.filter((j) => j.back === true);
  file.junctions = file.junctions.filter((j) => j.back !== true);
  const network = buildRailNetwork(file);
  checkRanges(file, network);
  validateStageLayout(file, network);
  // v1.10: which stretches run on the water or under it, and which side of each dive fork goes under.
  computeWaterSpans(file, network);
  for (const j of file.junctions) if (j.dive) j.diveSide = diveForkSide(j, network) ?? undefined;
  validateWaterLayout(file, network);
  validateIceLayout(file, network);
  // v1.10 (4-2): snow walls and their buried stretches on the rails (and the stations buried under snow).
  assignPlowSpans(file, network);
  validatePlowLayout(file, network);
  validateSnowLayout(file, network);
  // v1.11 (5-1): hush stretches, fawns, whistle-reversed stretches and firefly forks.
  validateNightLayout(file, network);
  // v1.11 (5-2): walking toys, the band's way, spinning forks and the whistle's windows.
  validateToyLayout(file, network);
  // v1.11 (PR5): the magnet light's iron targets (a turn's fork shows no arrows), and the iron odds and ends by the line.
  const magnets = magnetTargets(file, network);
  validateMagnetLayout(file, network, magnets);
  for (const t of magnets) {
    const j = t.kind === 'turn' ? file.junctions.find((x) => x.id === t.junction) : undefined;
    if (j) j.turn = t.id;
  }
  const ironProps = ironPropsFor(file, network, magnets);
  // v1.11 (5-3): the mirror world, phantoms and glass; glass has no base under it.
  validateMirrorWorld(file, network);
  // v1.11 (6-1): the lead's ring, the welcome's platform, where crew and depart may be.
  validateLeadLayout(file, network, magnets);
  addGlassSkips(file);
  const groundY = file.environment.ground?.y ?? null;

  // v1.11 (PR5): a can, a bucket or a whole sign with `iron` is drawn by the iron layer (it flies or stretches).
  const props: ResolvedProp[] = [...file.props.filter((p) => !ironDrawsProp(p)), ...autoSigns(file), ...reversePosts(backJunctions, network)].map((p) => {
    const t = resolvePlacement(p, network, groundY);
    return {
      model: p.model,
      position: t.position,
      quaternion: t.quaternion,
      scale: p.scale ?? 1,
      physics: p.physics ?? 'none',
      tag: p.tag,
      onRail: 'onRail' in p ? { railId: p.onRail.railId, at: p.onRail.at } : undefined,
      ...(p.trace ? { trace: true, traceLine: p.traceLine } : {}),
      ...(p.reveal ? { reveal: p.reveal } : {}),
      ...(p.sleeper ? { sleeper: true } : {}),
      ...(p.windup ? { windup: true } : {}),
    };
  });

  const actors: ResolvedActor[] = file.actors.map((a) => {
    const t = resolvePlacement(a, network, groundY);
    const size = a.size ?? [4, 4, 4];
    return {
      id: a.id,
      type: a.type,
      position: t.position,
      quaternion: t.quaternion,
      onRail: 'onRail' in a ? { railId: a.onRail.railId, at: a.onRail.at } : undefined,
      size: new Vector3(size[0], size[1], size[2]),
      reactsTo: a.reactsTo,
      reversed: a.reversed ?? false,
      params: a.params ?? {},
    };
  });

  const stations: ResolvedStation[] = file.stations.map((def) => {
    // v1.11 (PR8a, 第 3 部 B6.3): a reverse platform faces −s (its platform, sign and queue run along +s from `at`).
    const t = resolvePlacement({ onRail: { railId: def.railId, at: def.at, heightFromRail: 0 }, rotationY: def.reverse ? 180 : 0 }, network, groundY);
    return { def, position: t.position, quaternion: t.quaternion };
  });

  const records: ResolvedRecord[] = file.records.map((def) => {
    const t = resolvePlacement(def, network, groundY);
    return { def, position: t.position, quaternion: t.quaternion, onRail: 'onRail' in def ? { ...def.onRail } : undefined };
  });

  validateBackJunctions(file, network, backJunctions, records.map((r) => ({ id: r.def.id, requires: r.def.requires, position: r.position })));

  return { file, network, props, actors, stations, records, magnets, ironProps, backJunctions };
}

/**
 * v1.11 (PR8a, 第 3 部 A8.3): the pink swirl post by each back junction's point, REVERSE_POST.lateral m out on the side
 * away from its siding (a hint: "a way to reverse into is here"). Two tagged props in one place: the grey one shows
 * until うしろむき is learned, then the pink one (the view swaps them).
 */

function reversePosts(back: JunctionDef[], network: RailNetwork): PropDef[] {
  const out: PropDef[] = [];
  for (const j of back) {
    const sidingId = j.left === j.railId ? j.right : j.left;
    if (!sidingId || !network.rails.has(sidingId) || !network.rails.has(j.railId)) continue;
    const mouth = network.getRail(j.railId).frameAt(j.at);
    const siding = network.getRail(sidingId);
    const side = siding.frameAt(Math.max(0, siding.length - 20)).position.clone().sub(mouth.position).dot(mouth.right);
    const lateral = side > 0 ? -REVERSE_POST.lateral : REVERSE_POST.lateral;
    for (const [model, tag] of [['reverse-post', REVERSE_POST.tag], ['reverse-post-off', REVERSE_POST.tagOff]] as const) {
      out.push({ model, tag, onRail: { railId: j.railId, at: j.at, lateral, heightFromRail: 0 } });
    }
  }
  return out;
}

/**
 * A flower bridge's stream is a gap on its rail until the butterfly opens it (v1.6). The loader adds it, with the
 * bridge's own rewind point and no pit drawn under the water.
 */
function addBridgeGaps(file: StageFile): void {
  file.gimmicks.forEach((g, index) => {
    if (g.type !== 'flower-bridge' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const rail = file.rails.find((r) => r.id === g.railId);
    if (!rail) return;
    const butterflyAt = Number((g.params as { butterflyAt?: number } | undefined)?.butterflyAt ?? g.from - 100);
    const rewindAt = Number((g.params as { rewindAt?: number } | undefined)?.rewindAt ?? butterflyAt - 60);
    rail.gaps = [...(rail.gaps ?? []), { from: g.from, to: g.to, pit: false, bridge: index, rewind: { railId: g.railId, at: rewindAt } }];
  });
}

/** v1.11 (5-3): a glass stretch floats: the rail's base (rock, blocks…) leaves it out. */
function addGlassSkips(file: StageFile): void {
  for (const r of file.rails) {
    if (!r.glass?.length || !r.base) continue;
    for (const b of Array.isArray(r.base) ? r.base : [r.base]) b.skip = [...(b.skip ?? []), ...r.glass.map((k) => ({ from: k.from, to: k.to }))];
  }
}

/** Signs a slope or a rocket rest stretch puts up by itself at its start (v1.7): on the left, facing the train. */
const AUTO_SIGN = { lateral: -3.2, heightFromRail: -0.5 } as const;

function autoSigns(file: StageFile): PropDef[] {
  const sign = (model: string, railId: string, at: number): PropDef => ({
    model,
    onRail: { railId, at, lateral: AUTO_SIGN.lateral, heightFromRail: AUTO_SIGN.heightFromRail },
    rotationY: 180,
  });
  const out: PropDef[] = [];
  // v1.11 (5-2): a toy slide (params.look "slide") has its own sign.
  for (const z of slopeZones(file.gimmicks)) {
    const toy = (file.gimmicks[z.index].params as { look?: string } | undefined)?.look === 'slide';
    if (z.sign) out.push(sign(z.kind === 'up' ? 'sign-steep' : toy ? 'sign-slide-toy' : 'sign-slide', z.railId, z.from));
  }
  for (const z of rocketZones(file.gimmicks)) if (!z.allow) out.push(sign('sign-no-rocket', z.railId, z.from));
  // v1.10 (4-1): ice (a snow crystal) and thin ice (cracks and the rocket).
  for (const z of iceZones(file.gimmicks)) if (z.sign) out.push(sign('sign-ice', z.railId, z.from));
  for (const z of thinIceZones(file.gimmicks)) if (z.sign) out.push(sign('sign-thin-ice', z.railId, Math.max(0, z.from - 20)));
  // v1.10 (4-2): a snow wall's purple snowplow sign, a little before the wall.
  for (const sp of plowSpans(file.gimmicks)) if (sp.sign) out.push(sign('sign-plow', sp.railId, Math.max(0, sp.from - 8)));
  // v1.11 (5-1): the hush sign (a crescent and ZZZ) and the dancing-tanuki sign, before their stretches.
  for (const z of hushZones(file.gimmicks)) if (z.sign) out.push(sign('sign-hush', z.railId, Math.max(0, z.from - 8)));
  for (const z of reversedZones(file.gimmicks)) if (z.sign) out.push(sign('sign-whistle-reversed', z.railId, Math.max(0, z.from - 10)));
  // v1.11 (5-1): the grass tufts the resting fireflies of a firefly fork sit in, both sides, 10–30 m before it.
  for (const f of fireflyForks(file.junctions)) {
    for (const [k, before] of FIREFLY_FORK.grass.entries()) {
      for (const side of [-1, 1]) {
        out.push({ model: 'firefly-grass', onRail: { railId: f.railId, at: Math.max(0, f.at - before), lateral: side * (3.2 + k) }, rotationY: k * 70 + side * 30 });
      }
    }
  }
  return out;
}

function checkRanges(file: StageFile, network: RailNetwork): void {
  const check = (railId: string, at: number, what: string): void => {
    const rail = network.getRail(railId);
    if (at < 0 || at > rail.length) {
      throw new Error(`${what}: at=${at} is outside rail "${railId}" (length ${rail.length.toFixed(1)} m)`);
    }
  };
  check(file.start.railId, file.start.at, 'start');
  for (const j of file.junctions) check(j.railId, j.at, `junction "${j.id}"`);
  for (const s of file.stations) check(s.railId, s.at, `station "${s.id}"`);
  for (const r of file.rails) {
    if (r.end.type === 'merge') check(r.end.railId, r.end.at, `rail "${r.id}" merge`);
    for (const g of r.gaps ?? []) {
      check(r.id, g.from, `rail "${r.id}" gap`);
      check(r.id, g.to, `rail "${r.id}" gap`);
      if (g.rewind) check(g.rewind.railId, g.rewind.at, `rail "${r.id}" gap rewind`);
    }
  }
  const placed: [Placement, string][] = [
    ...file.props.map((p, i): [Placement, string] => [p, `props[${i}]`]),
    ...file.actors.map((a): [Placement, string] => [a, `actor "${a.id}"`]),
    ...file.records.map((r): [Placement, string] => [r, `record "${r.id}"`]),
  ];
  for (const [p, what] of placed) if ('onRail' in p) check(p.onRail.railId, p.onRail.at, what);
  for (const f of file.floaters ?? []) check(f.railId, f.at, `floater "${f.id}"`);
  file.gimmicks.forEach((g, i) => {
    if (g.railId === undefined || g.from === undefined) return;
    check(g.railId, g.from, `gimmicks[${i}] ${g.type}`);
    if (g.to !== undefined) check(g.railId, g.to, `gimmicks[${i}] ${g.type}`);
  });
}

const Y_AXIS = new Vector3(0, 1, 0);

/**
 * Resolves a placement to a world transform. Rail placements without `heightFromRail` sit on the
 * ground plane; `rotationY` (degrees) is relative to the rail heading for rail placements.
 */
export function resolvePlacement(
  p: Placement,
  network: RailNetwork,
  groundY: number | null,
): { position: Vector3; quaternion: Quaternion } {
  const local = p.rotation
    ? new Quaternion().setFromEuler(
        new Euler(MathUtils.degToRad(p.rotation[0]), MathUtils.degToRad(p.rotation[1]), MathUtils.degToRad(p.rotation[2]), 'XYZ'),
      )
    : new Quaternion().setFromAxisAngle(Y_AXIS, MathUtils.degToRad(p.rotationY ?? 0));
  if ('position' in p) {
    const v = p.position as Vec3;
    return { position: new Vector3(v[0], v[1], v[2]), quaternion: local };
  }
  const rail = network.getRail(p.onRail.railId);
  const frame = rail.frameAt(p.onRail.at);
  const position = frame.position.clone().addScaledVector(frame.right, p.onRail.lateral ?? 0);
  if (p.onRail.heightFromRail !== undefined) position.addScaledVector(frame.up, p.onRail.heightFromRail);
  else if (groundY !== null) position.y = groundY;
  const xAxis = new Vector3().crossVectors(frame.up, frame.tangent).normalize();
  const basis = new Matrix4().makeBasis(xAxis, frame.up, frame.tangent);
  const quaternion = new Quaternion().setFromRotationMatrix(basis);
  quaternion.multiply(local);
  return { position, quaternion };
}
