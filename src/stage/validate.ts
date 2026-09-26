import { SONGS } from '../audio/songs';
import { FLOWER_BRIDGE, FRAGILE, GRASSHOPPER, REWIND_DISTANCE } from '../train/params';
import type { Placement, StageFile } from './types';

const MODEL_NAME = /^[a-z0-9-]+$/;
const ABILITIES = ['whistle', 'light', 'jump', 'rocket', 'dive', 'magnetLight', 'reverse'];
const JUMP_HINTS = ['normal', 'fast', 'max'];

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
  if (p.rotation !== undefined && !isVec3(p.rotation)) fail(`${where}: "rotation" must be [x, y, z] degrees`);
}

function checkCutsceneStep(st: unknown, where: string, railIds: Set<string>): void {
  if (!isObject(st)) fail(`${where}: must be an object`);
  const onRailOk = (r: unknown): boolean =>
    isObject(r) && isString(r.railId) && railIds.has(r.railId) && isNumber(r.at);
  if ('say' in st) {
    if (!isString(st.say)) fail(`${where}: "say" must be text`);
    if (st.name !== undefined && !isString(st.name)) fail(`${where}: "name" must be text`);
  } else if ('spawn' in st) {
    if (!isString(st.spawn) || !isString(st.model) || !MODEL_NAME.test(st.model) || !onRailOk(st.onRail)) {
      fail(`${where}: spawn needs id, model and onRail`);
    }
    if (st.rotationY !== undefined && !isNumber(st.rotationY)) fail(`${where}: "rotationY" must be a number`);
  } else if ('move' in st) {
    if (!isString(st.move) || !onRailOk(st.onRail) || !isNumber(st.seconds)) fail(`${where}: move needs id, onRail, seconds`);
    if (st.nowait !== undefined && typeof st.nowait !== 'boolean') fail(`${where}: "nowait" must be true or false`);
  } else if ('remove' in st) {
    if (!isString(st.remove)) fail(`${where}: "remove" must be an actor id`);
  } else if ('wait' in st) {
    if (!isNumber(st.wait)) fail(`${where}: "wait" must be seconds`);
  } else if ('cutRail' in st) {
    const c = st.cutRail;
    if (!isObject(c) || !isString(c.railId) || !railIds.has(c.railId) || !isNumber(c.from) || !isNumber(c.to)) {
      fail(`${where}: cutRail needs railId, from, to`);
    }
  } else if ('card' in st) {
    const c = st.card;
    if (!isObject(c) || !isString(c.title) || !isString(c.button)) fail(`${where}: card needs title and button`);
    if (c.icon !== undefined && c.icon !== 'badge') fail(`${where}: card icon`);
  } else if ('camera' in st) {
    if (!['cab', 'chase', 'side', 'top'].includes(String(st.camera))) fail(`${where}: camera`);
  } else if ('caption' in st) {
    if (!isString(st.caption)) fail(`${where}: "caption" must be text`);
    if (st.seconds !== undefined && !isNumber(st.seconds)) fail(`${where}: "seconds" must be a number`);
  } else if ('emote' in st) {
    if (!['jump', 'tilt', 'cheer'].includes(String(st.emote))) fail(`${where}: emote`);
  } else if ('unlock' in st) {
    if (!ABILITIES.includes(String(st.unlock))) fail(`${where}: unknown ability "${String(st.unlock)}"`);
  } else {
    fail(`${where}: unknown step`);
  }
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
  if (env.bgm !== null && (typeof env.bgm !== 'string' || !(env.bgm in SONGS))) {
    fail(`"environment.bgm" must be null or a song in src/audio/songs.ts (${Object.keys(SONGS).join(', ')})`);
  }
  if (env.fall !== undefined && !['dark', 'cloud', 'leaf'].includes(String(env.fall))) fail('"environment.fall" must be dark, cloud or leaf');
  if (env.cloudSea !== undefined && (!isObject(env.cloudSea) || !isNumber(env.cloudSea.y))) fail('"environment.cloudSea" needs y');

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
    if (r.gaps !== undefined) {
      if (!Array.isArray(r.gaps)) fail(`rail "${r.id}": "gaps" must be an array`);
      for (const g of r.gaps as unknown[]) {
        if (!isObject(g) || !isNumber(g.from) || !isNumber(g.to) || g.to <= g.from) fail(`rail "${r.id}": gap needs from < to`);
        if (g.hint !== undefined && !JUMP_HINTS.includes(String(g.hint))) fail(`rail "${r.id}": gap hint must be normal, fast or max`);
        if (g.rewind !== undefined && (!isObject(g.rewind) || !isString(g.rewind.railId) || !isNumber(g.rewind.at))) {
          fail(`rail "${r.id}": gap rewind needs railId and at`);
        }
        if (g.pit !== undefined && typeof g.pit !== 'boolean') fail(`rail "${r.id}": gap "pit" must be true or false`);
        if (g.bridge !== undefined) fail(`rail "${r.id}": gap "bridge" is set by the loader (write a flower-bridge gimmick instead)`);
      }
    }
    if (r.look !== undefined && r.look !== 'rail' && r.look !== 'silk') fail(`rail "${r.id}": "look" must be rail or silk`);
    if (r.deadEnd !== undefined && typeof r.deadEnd !== 'boolean') fail(`rail "${r.id}": "deadEnd" must be true or false`);
    if (r.upMode !== undefined && r.upMode !== 'fixed' && r.upMode !== 'follow') fail(`rail "${r.id}": "upMode" must be fixed or follow`);
    if (r.deadEnd === true && r.end.type !== 'buffer') fail(`rail "${r.id}": a dead end must end in a buffer`);
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
    if ((a.type === 'grasshopper' || a.type === 'nut' || a.type === 'squirrel') && !isObject(a.onRail)) {
      fail(`actor "${a.id}": a ${a.type} is placed with onRail`);
    }
    if (a.type === 'grasshopper' && a.reactsTo === 'light') fail(`actor "${a.id}": a grasshopper hops on by itself ("none") or when whistled for ("whistle")`);
  }

  for (const r of requireArray(raw, 'records')) {
    if (!isObject(r) || !isString(r.id) || !isString(r.name)) fail('each record needs "id" and "name"');
    if (r.requires !== null && !ABILITIES.includes(String(r.requires))) fail(`record "${r.id}": "requires" must be an ability or null`);
    if (r.model !== undefined && (!isString(r.model) || !MODEL_NAME.test(r.model))) fail(`record "${r.id}": "model" must match [a-z0-9-]+`);
    checkPlacement(r, `record "${r.id}"`, railIds);
  }

  const cutsceneIds = new Set<string>();
  if (raw.cutscenes !== undefined) {
    if (!isObject(raw.cutscenes)) fail('"cutscenes" must be an object');
    for (const [id, steps] of Object.entries(raw.cutscenes)) {
      if (!Array.isArray(steps)) fail(`cutscene "${id}" must be an array of steps`);
      steps.forEach((st, i) => checkCutsceneStep(st, `cutscene "${id}" step ${i}`, railIds));
      cutsceneIds.add(id);
    }
  }
  for (const key of ['opening', 'ending'] as const) {
    const id = raw[key];
    if (id !== undefined && (!isString(id) || !cutsceneIds.has(id))) fail(`"${key}" must name a cutscene`);
  }

  for (const m of requireArray(raw, 'missions')) {
    if (!isObject(m) || !isString(m.id)) fail('each mission needs an "id"');
    if (!['deliver', 'pickup', 'repair', 'timed'].includes(String(m.type))) fail(`mission "${m.id}": type`);
    if (!isString(m.title)) fail(`mission "${m.id}": "title" is required`);
    if (!Array.isArray(m.steps) || m.steps.length === 0) fail(`mission "${m.id}": "steps" must be a non-empty array`);
    for (const st of m.steps as unknown[]) {
      if (!isObject(st) || !stationIds.has(String(st.stationId))) fail(`mission "${m.id}": step needs a known stationId`);
      for (const k of ['board', 'alight'] as const) {
        if (st[k] !== undefined && (!isNumber(st[k]) || (st[k] as number) < 0)) fail(`mission "${m.id}": "${k}" must be >= 0`);
      }
      if (st.parcel !== undefined && st.parcel !== 'load' && st.parcel !== 'unload') fail(`mission "${m.id}": "parcel"`);
    }
    if (m.lines !== undefined && !isObject(m.lines)) fail(`mission "${m.id}": "lines" must be an object`);
    if (m.hints !== undefined) {
      if (!Array.isArray(m.hints)) fail(`mission "${m.id}": "hints" must be an array`);
      for (const h of m.hints as unknown[]) {
        if (!isObject(h) || !isString(h.railId) || !railIds.has(h.railId) || !isNumber(h.at) || !isString(h.text)) {
          fail(`mission "${m.id}": hint needs railId, at, text`);
        }
      }
    }
    if (m.onComplete !== undefined && (!isString(m.onComplete) || !cutsceneIds.has(m.onComplete))) {
      fail(`mission "${m.id}": "onComplete" must name a cutscene`);
    }
  }

  requireArray(raw, 'gimmicks').forEach((g, i) => {
    if (!isObject(g) || !isString(g.type)) fail(`gimmicks[${i}]: "type" is required`);
    const zoned = ['camera', 'updraft', 'fog', 'jump-pad', 'bough', 'flower-bridge', 'fragile'];
    if (zoned.includes(g.type)) {
      if (!isString(g.railId) || !railIds.has(g.railId) || !isNumber(g.from)) fail(`gimmicks[${i}] ${g.type}: needs a known railId and "from"`);
      if (g.type !== 'jump-pad' && (!isNumber(g.to) || (g.to as number) <= (g.from as number))) fail(`gimmicks[${i}] ${g.type}: needs "to" after "from"`);
    }
    const p = (g.params ?? {}) as Record<string, unknown>;
    if (g.type === 'flower-bridge') {
      const from = g.from as number;
      const to = g.to as number;
      const at = p.butterflyAt;
      if (!isNumber(at)) fail(`gimmicks[${i}] flower-bridge: params.butterflyAt is required`);
      if (to - from < 44) fail(`gimmicks[${i}] flower-bridge: the stream must be at least 44 m (no jump reaches over it)`);
      if ((at as number) >= from - Number(p.bud ?? 12) - Number(p.lead ?? 12)) fail(`gimmicks[${i}] flower-bridge: butterflyAt must be before the bud and its lead`);
    }
    if (g.type === 'camera' && !['cab', 'chase', 'side', 'top'].includes(String((g.params as Record<string, unknown> | undefined)?.mode))) {
      fail(`gimmicks[${i}] camera: params.mode must be cab, chase, side or top`);
    }
  });

  checkMeadow(raw as unknown as StageFile);

  return raw as unknown as StageFile;
}

/** A gap as the running game sees it: `rails[].gaps` plus the streams the loader adds for flower bridges. */
interface RunGap {
  railId: string;
  from: number;
  to: number;
  rewind: { railId: string; at: number };
  what: string;
}

const numberParam = (params: Record<string, unknown> | undefined, key: string, fallback: number): number => {
  const v = params?.[key];
  return isNumber(v) ? v : fallback;
};

/**
 * v1.6 (2-2) checks across rails, actors and gimmicks: grasshoppers need a gap ahead to help over, flower bridges
 * need a clear run for the butterfly, and silk bridges must send the train back to before themselves.
 * docs/PHASE6_DESIGN.md §4.1–§4.3.
 */
function checkMeadow(file: StageFile): void {
  const gaps: RunGap[] = [];
  for (const r of file.rails) {
    for (const g of r.gaps ?? []) {
      gaps.push({ railId: r.id, from: g.from, to: g.to, rewind: g.rewind ?? { railId: r.id, at: g.from - REWIND_DISTANCE }, what: `rail "${r.id}" gap ${g.from}–${g.to}` });
    }
  }
  file.gimmicks.forEach((g, i) => {
    if (g.type !== 'flower-bridge' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const butterflyAt = numberParam(g.params, 'butterflyAt', g.from - 100);
    const rewindAt = numberParam(g.params, 'rewindAt', butterflyAt - 60);
    gaps.push({ railId: g.railId, from: g.from, to: g.to, rewind: { railId: g.railId, at: rewindAt }, what: `gimmicks[${i}] flower-bridge` });
  });

  // Flower bridges (§4.2): the stream overlaps no other gap, the train goes back to before the butterfly's lead,
  // and there is no junction between the butterfly and the stream.
  file.gimmicks.forEach((g, i) => {
    if (g.type !== 'flower-bridge' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const where = `gimmicks[${i}] flower-bridge`;
    const { railId, from, to } = g;
    const butterflyAt = numberParam(g.params, 'butterflyAt', from - 100);
    const lead = numberParam(g.params, 'lead', FLOWER_BRIDGE.lead);
    const rewindAt = numberParam(g.params, 'rewindAt', butterflyAt - 60);
    for (const other of gaps) {
      if (other.what === where || other.railId !== railId) continue;
      if (other.from < to && from < other.to) fail(`${where}: the stream ${from}–${to} overlaps ${other.what}`);
    }
    if (rewindAt >= butterflyAt - lead) fail(`${where}: rewindAt (${rewindAt}) must be before butterflyAt − lead (${butterflyAt - lead})`);
    for (const j of file.junctions) {
      if (j.railId === railId && j.at >= butterflyAt && j.at <= from) fail(`${where}: junction "${j.id}" lies between the butterfly and the stream`);
    }
  });

  // Silk bridges (§4.3): the bounce sends the train back to before the bridge, and no gap is inside it.
  file.gimmicks.forEach((g, i) => {
    if (g.type !== 'fragile' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const where = `gimmicks[${i}] fragile`;
    const { railId, from, to } = g;
    if (numberParam(g.params, 'maxSpeed', FRAGILE.maxSpeed) <= 0) fail(`${where}: params.maxSpeed must be above 0`);
    if (numberParam(g.params, 'grace', FRAGILE.grace) < 0) fail(`${where}: params.grace must not be negative`);
    const rewindAt = numberParam(g.params, 'rewindAt', from - 60);
    if (rewindAt >= from) fail(`${where}: rewindAt (${rewindAt}) must be before the bridge (${from})`);
    for (const gap of gaps) {
      if (gap.railId === railId && gap.from < to && from < gap.to) fail(`${where}: ${gap.what} is on the silk bridge`);
    }
  });

  // Grasshoppers (§4.1): a gap within 250 m ahead of the leaf, rewinding to before the point where it gets on;
  // grasshoppers on one rail at least 150 m apart.
  const hoppers = file.actors.filter((a) => a.type === 'grasshopper' && 'onRail' in a);
  for (const a of hoppers) {
    if (!('onRail' in a)) continue;
    const { railId, at } = a.onRail;
    const params = a.params;
    const gap = gaps.filter((g) => g.railId === railId && g.from > at).sort((x, y) => x.from - y.from)[0];
    if (!gap || gap.from - at > 250) fail(`actor "${a.id}": a grasshopper needs a gap within 250 m after its leaf`);
    // One whistled for is announced 30 m before the whistle reaches it: a retry must start before that line too.
    const reach =
      a.reactsTo === 'whistle' ? numberParam(params, 'whistleRange', GRASSHOPPER.whistleRange) + 30 : numberParam(params, 'hop', GRASSHOPPER.hop);
    const getOn = at - reach;
    if (gap.rewind.railId === railId && gap.rewind.at > getOn) {
      fail(`actor "${a.id}": its gap (${gap.what}) rewinds to ${gap.rewind.at}, after where the grasshopper is first met (${getOn})`);
    }
    const off = params?.off;
    if (off !== undefined) {
      const o = off as Record<string, unknown>;
      if (!isObject(off) || !isNumber(o.at) || (o.lateral !== undefined && !isNumber(o.lateral)) || (o.heightFromRail !== undefined && !isNumber(o.heightFromRail))) {
        fail(`actor "${a.id}": params.off needs at (and optional lateral, heightFromRail) numbers`);
      }
    }
    const hint = params?.gapHint;
    if (hint !== undefined && hint !== null && !JUMP_HINTS.includes(String(hint))) fail(`actor "${a.id}": params.gapHint must be normal, fast, max or null`);
    for (const b of hoppers) {
      if (b === a || !('onRail' in b) || b.onRail.railId !== railId) continue;
      if (Math.abs(b.onRail.at - at) < 150) fail(`actors "${a.id}" and "${b.id}": grasshoppers on one rail must be 150 m apart`);
    }
  }
}

export type { Placement };
