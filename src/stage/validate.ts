import type { Placement, StageFile } from './types';

const MODEL_NAME = /^[a-z0-9-]+$/;

class StageValidationError extends Error {
  constructor(message: string) {
    super(`Stage JSON invalid: ${message}`);
    this.name = 'StageValidationError';
  }
}

function fail(message: string): never {
  throw new StageValidationError(message);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isVec3 = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function requireArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) fail(`"${key}" must be an array`);
  return v as unknown[];
}

function checkPlacement(p: unknown, where: string, railIds: Set<string>): void {
  if (!isObject(p)) fail(`${where}: placement must be an object`);
  const hasPosition = 'position' in p;
  const hasOnRail = 'onRail' in p;
  if (hasPosition === hasOnRail) fail(`${where}: use exactly one of "position" or "onRail"`);
  if (hasPosition && !isVec3(p.position)) fail(`${where}: "position" must be [x, y, z]`);
  if (hasOnRail) {
    const r = p.onRail;
    if (!isObject(r)) fail(`${where}: "onRail" must be an object`);
    if (!isString(r.railId) || !railIds.has(r.railId)) fail(`${where}: unknown railId "${String(r.railId)}"`);
    if (!isNumber(r.at)) fail(`${where}: "onRail.at" must be a number`);
    if (r.lateral !== undefined && !isNumber(r.lateral)) fail(`${where}: "onRail.lateral" must be a number`);
    if (r.heightFromRail !== undefined && !isNumber(r.heightFromRail)) {
      fail(`${where}: "onRail.heightFromRail" must be a number`);
    }
  }
  if (p.rotationY !== undefined && !isNumber(p.rotationY)) fail(`${where}: "rotationY" must be a number`);
}

/** Structural validation of a stage file. Range checks that need rail lengths happen in the loader. */
export function validateStageFile(raw: unknown): StageFile {
  if (!isObject(raw)) fail('root must be an object');
  if (raw.schemaVersion !== 1) fail(`unsupported schemaVersion ${String(raw.schemaVersion)}`);
  if (!isString(raw.id)) fail('"id" is required');
  if (!isString(raw.title)) fail('"title" is required');
  if (!isNumber(raw.chapter)) fail('"chapter" must be a number');

  const unlock = raw.unlock;
  if (!isObject(unlock) || !Array.isArray(unlock.requires)) fail('"unlock.requires" must be an array');
  if (!Array.isArray(raw.unlocks)) fail('"unlocks" must be an array');

  const env = raw.environment;
  if (!isObject(env)) fail('"environment" is required');
  if (!isObject(env.sky) || !isString(env.sky.top) || !isString(env.sky.bottom)) fail('"environment.sky" needs top/bottom');
  if (env.fog !== null && (!isObject(env.fog) || !isNumber(env.fog.near) || !isNumber(env.fog.far))) {
    fail('"environment.fog" must be null or {color, near, far}');
  }
  if (env.ground !== null && (!isObject(env.ground) || !isNumber(env.ground.y) || !isNumber(env.ground.size))) {
    fail('"environment.ground" must be null or {y, size, color}');
  }

  const rails = requireArray(raw, 'rails');
  if (rails.length === 0) fail('at least one rail is required');
  const railIds = new Set<string>();
  for (const r of rails) {
    if (!isObject(r) || !isString(r.id)) fail('each rail needs an "id"');
    if (!Array.isArray(r.points) || r.points.length < 2 || !r.points.every(isVec3)) {
      fail(`rail "${r.id}": "points" needs at least 2 [x, y, z] entries`);
    }
    if (!isObject(r.end) || !['buffer', 'merge', 'open'].includes(String(r.end.type))) {
      fail(`rail "${r.id}": "end.type" must be buffer, merge or open`);
    }
    if (r.end.type === 'merge' && (!isString(r.end.railId) || !isNumber(r.end.at))) {
      fail(`rail "${r.id}": merge end needs railId and at`);
    }
    railIds.add(r.id);
  }
  for (const r of rails as Record<string, unknown>[]) {
    const end = r.end as Record<string, unknown>;
    if (end.type === 'merge' && !railIds.has(String(end.railId))) {
      fail(`rail "${String(r.id)}": merges into unknown rail "${String(end.railId)}"`);
    }
  }

  const start = raw.start;
  if (!isObject(start) || !isString(start.railId) || !railIds.has(start.railId) || !isNumber(start.at)) {
    fail('"start" needs a known railId and "at"');
  }
  if (start.direction !== 1 && start.direction !== -1) fail('"start.direction" must be 1 or -1');

  for (const j of requireArray(raw, 'junctions')) {
    if (!isObject(j) || !isString(j.id)) fail('each junction needs an "id"');
    if (!isString(j.railId) || !railIds.has(j.railId)) fail(`junction "${j.id}": unknown railId`);
    if (!isNumber(j.at)) fail(`junction "${j.id}": "at" must be a number`);
    if (j.left === undefined && j.right === undefined) fail(`junction "${j.id}": needs left and/or right`);
    for (const side of ['left', 'right'] as const) {
      const target = j[side];
      if (target !== undefined && (!isString(target) || !railIds.has(target))) {
        fail(`junction "${j.id}": ${side} points to unknown rail "${String(target)}"`);
      }
    }
    if (j.default !== 'left' && j.default !== 'right') fail(`junction "${j.id}": "default" must be left or right`);
    if (j[j.default] === undefined) fail(`junction "${j.id}": default side "${j.default}" has no target`);
  }

  const stationIds = new Set<string>();
  for (const s of requireArray(raw, 'stations')) {
    if (!isObject(s) || !isString(s.id) || !isString(s.name)) fail('each station needs "id" and "name"');
    if (!isString(s.railId) || !railIds.has(s.railId) || !isNumber(s.at)) fail(`station "${s.id}": needs known railId and at`);
    if (s.platformSide !== 'left' && s.platformSide !== 'right') fail(`station "${s.id}": platformSide`);
    stationIds.add(s.id);
  }

  requireArray(raw, 'props').forEach((p, i) => {
    if (!isObject(p) || !isString(p.model) || !MODEL_NAME.test(p.model)) fail(`props[${i}]: "model" must match [a-z0-9-]+`);
    checkPlacement(p, `props[${i}]`, railIds);
  });

  const actorIds = new Set<string>();
  for (const a of requireArray(raw, 'actors')) {
    if (!isObject(a) || !isString(a.id) || !isString(a.type)) fail('each actor needs "id" and "type"');
    if (actorIds.has(a.id)) fail(`duplicate actor id "${a.id}"`);
    actorIds.add(a.id);
    if (!['whistle', 'light', 'none'].includes(String(a.reactsTo))) fail(`actor "${a.id}": reactsTo`);
    if (a.size !== undefined && !isVec3(a.size)) fail(`actor "${a.id}": "size" must be [x, y, z]`);
    checkPlacement(a, `actor "${a.id}"`, railIds);
  }

  for (const r of requireArray(raw, 'records')) {
    if (!isObject(r) || !isString(r.id) || !isString(r.name)) fail('each record needs "id" and "name"');
    checkPlacement(r, `record "${r.id}"`, railIds);
  }

  for (const m of requireArray(raw, 'missions')) {
    if (!isObject(m) || !isString(m.id)) fail('each mission needs an "id"');
    if (!['deliver', 'pickup', 'repair', 'timed'].includes(String(m.type))) fail(`mission "${m.id}": type`);
    if (!stationIds.has(String(m.from)) || !stationIds.has(String(m.to))) fail(`mission "${m.id}": from/to must be station ids`);
    if (!Array.isArray(m.checkpoints)) fail(`mission "${m.id}": "checkpoints" must be an array`);
  }

  requireArray(raw, 'gimmicks').forEach((g, i) => {
    if (!isObject(g) || !isString(g.type)) fail(`gimmicks[${i}]: "type" is required`);
  });

  return raw as unknown as StageFile;
}

export type { Placement };
