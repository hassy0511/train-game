import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { buildRailNetwork } from '../rail/network';
import type { RailNetwork } from '../rail/types';
import type { Placement, RecordDef, ResolvedActor, ResolvedProp, ResolvedRecord, ResolvedStation, StageData, StageFile, Vec3 } from './types';
import { validateStageFile } from './validate';

// One chunk per stage file; stages load lazily.
const stageModules = import.meta.glob('../stages/*.json');

export function listStageIds(): string[] {
  return Object.keys(stageModules)
    .map((k) => k.replace('../stages/', '').replace('.json', ''))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Every record of every playable (non-hidden) stage, in stage order, for the picture book. */
export async function loadAllRecords(): Promise<{ stageTitle: string; record: RecordDef }[]> {
  const out: { stageTitle: string; record: RecordDef }[] = [];
  for (const id of listStageIds()) {
    const mod = (await stageModules[`../stages/${id}.json`]()) as { default: StageFile };
    const file = mod.default;
    if (file.hidden) continue;
    for (const record of file.records) out.push({ stageTitle: file.title, record });
  }
  return out;
}

/** Title and required stages of a stage, without building it. */
export async function peekStage(id: string): Promise<Pick<StageFile, 'id' | 'title' | 'unlock' | 'unlocks'> | null> {
  const load = stageModules[`../stages/${id}.json`];
  if (!load) return null;
  const file = ((await load()) as { default: StageFile }).default;
  return { id: file.id, title: file.title, unlock: file.unlock, unlocks: file.unlocks };
}

export async function loadStage(id: string): Promise<StageData> {
  const load = stageModules[`../stages/${id}.json`];
  if (!load) throw new Error(`Unknown stage "${id}"`);
  const mod = (await load()) as { default: unknown };
  const file = validateStageFile(mod.default);
  const network = buildRailNetwork(file);
  checkRanges(file, network);
  const groundY = file.environment.ground?.y ?? null;

  const props: ResolvedProp[] = file.props.map((p) => {
    const t = resolvePlacement(p, network, groundY);
    return { model: p.model, position: t.position, quaternion: t.quaternion, scale: p.scale ?? 1, physics: p.physics ?? 'none' };
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
    const t = resolvePlacement({ onRail: { railId: def.railId, at: def.at, heightFromRail: 0 } }, network, groundY);
    return { def, position: t.position, quaternion: t.quaternion };
  });

  const records: ResolvedRecord[] = file.records.map((def) => {
    const t = resolvePlacement(def, network, groundY);
    return { def, position: t.position, quaternion: t.quaternion, onRail: 'onRail' in def ? { ...def.onRail } : undefined };
  });

  return { file, network, props, actors, stations, records };
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
    }
  }
  const placed: [Placement, string][] = [
    ...file.props.map((p, i): [Placement, string] => [p, `props[${i}]`]),
    ...file.actors.map((a): [Placement, string] => [a, `actor "${a.id}"`]),
    ...file.records.map((r): [Placement, string] => [r, `record "${r.id}"`]),
  ];
  for (const [p, what] of placed) if ('onRail' in p) check(p.onRail.railId, p.onRail.at, what);
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
