import { RUN_SURFACES, type RunSurface } from '../audio/run-sound';
import { SONGS } from '../audio/songs';
import { fireflyForks } from '../gimmick/fireflies';
import { hushZones } from '../gimmick/hush';
import { inFront, mirrorDefs } from '../gimmick/mirror';
import { iceZones, thinIceZones } from '../gimmick/ice';
import { plowSpans } from '../gimmick/plow';
import { reversedZones } from '../gimmick/reversed-whistle';
import { rocketZones } from '../gimmick/rocket';
import { slopeZones } from '../gimmick/slope';
import { tunnelZones } from '../gimmick/tunnel';
import type { RailNetwork } from '../rail/types';
import {
  AMBIENT_FIREFLIES,
  DIVE,
  FIREFLY_FORK,
  FLOATER,
  FLOWER_BRIDGE,
  FRAGILE,
  GRASSHOPPER,
  LEVER_NOTCHES,
  LURE,
  MAGNET,
  MIRROR_WORLD,
  PARADE,
  PLOW,
  RECORD,
  REWIND_DISTANCE,
  ROCK_ROLL,
  ROCKET,
  SLOPE,
  SPIN,
  STOP_RULE,
  THIN_ICE,
  TRAIN,
  WINDUP,
} from '../train/params';
import { inArea, openWaterAt } from './water';
import { AMBIENCE_KINDS, CAT_LOOKS, FLOATER_LOOKS, IRON_LOOKS, MAGNET_KINDS, MAGNET_LOOKS, WATER_LOOKS, type AmbienceKind, type CatLook, type FloaterLook, type IronLook, type MagnetKind, type MagnetLook, type MagnetTarget, type Placement, type StageFile, type WaterDef, type WaterLook } from './types';
import { paradeSetup } from '../actors/parade';
import { checkBubbleIcon, checkCrewDepartStep, checkLandmark, checkLeadShapes } from './validate-lead';

const MODEL_NAME = /^[a-z0-9-]+$/;
const ABILITIES = ['whistle', 'light', 'jump', 'rocket', 'dive', 'plow', 'magnetLight', 'reverse'];
/** v1.10 (3-3): the buttons a cutscene may ask the child to press. */
const PRESSABLE = ['light', 'whistle', 'rocket', 'jump', 'magnet'];
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
  // A press step may carry a line of its own ("say"): look at it first.
  if ('press' in st) {
    // v1.10 (3-3): the child presses one button in the cutscene.
    if (!PRESSABLE.includes(String(st.press))) fail(`${where}: press must be one of ${PRESSABLE.join(', ')}`);
    if (st.say !== undefined && !isString(st.say)) fail(`${where}: press "say" must be text`);
    if (st.press === 'magnet') {
      // v1.11 (PR5): the magnet light's first go: the figure `target` flies to the train.
      if (st.fx !== undefined) fail(`${where}: a press "magnet" takes no fx`);
      if (!isString(st.target)) fail(`${where}: a press "magnet" needs a "target" (a figure brought on before it)`);
      return;
    }
    if (st.fx !== undefined && st.fx !== 'beacon' && st.fx !== 'windup') fail(`${where}: press fx must be "beacon" or "windup"`);
    if (st.target !== undefined && (st.fx !== 'windup' || !isString(st.target))) fail(`${where}: only a press with fx "windup" or a press "magnet" takes a "target" (a figure id)`);
    if (st.fx === 'windup' && !isString(st.target)) fail(`${where}: a press with fx "windup" needs a "target" (the figure it winds)`);
  } else if ('say' in st) {
    if (!isString(st.say)) fail(`${where}: "say" must be text`);
    if (st.name !== undefined && !isString(st.name)) fail(`${where}: "name" must be text`);
    // v1.11 (5-3) "ride"; (6-1) "hand-stop", "run-swirl".
    checkBubbleIcon(st.icon, where);
  } else if ('spawn' in st) {
    if (!isString(st.spawn) || !isString(st.model) || !MODEL_NAME.test(st.model) || !onRailOk(st.onRail)) {
      fail(`${where}: spawn needs id, model and onRail`);
    }
    if (st.rotationY !== undefined && !isNumber(st.rotationY)) fail(`${where}: "rotationY" must be a number`);
    if (st.mirror !== undefined && st.mirror !== 'only' && st.mirror !== 'hide') fail(`${where}: spawn "mirror" must be "only" or "hide"`);
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
    if (c.style !== undefined && c.style !== 'fly' && c.style !== 'fall') fail(`${where}: cutRail style must be fly or fall`);
    if (c.props !== undefined && !isString(c.props)) fail(`${where}: cutRail props must be a tag`);
  } else if ('card' in st) {
    const c = st.card;
    if (!isObject(c) || !isString(c.title) || !isString(c.button)) fail(`${where}: card needs title and button`);
    if (c.icon !== undefined && c.icon !== 'badge' && c.icon !== 'drawing') fail(`${where}: card icon must be badge or drawing`);
    if (c.mirror !== undefined && typeof c.mirror !== 'boolean' && c.mirror !== 'reflect') fail(`${where}: card mirror must be true, false or "reflect"`);
    // v1.11 (5-3): the notes a "reflect" card holds up to its mirror.
    if (c.notes !== undefined && (c.mirror !== 'reflect' || (c.notes !== 1 && c.notes !== 2))) fail(`${where}: card "notes" (1 or 2) goes with mirror "reflect"`);
  } else if ('camera' in st) {
    if (st.camera === 'fixed') {
      if (!isVec3(st.at) || !isVec3(st.lookAt)) fail(`${where}: a fixed camera needs "at" and "lookAt" [x, y, z]`);
      if (st.reach !== undefined && !(typeof st.reach === 'number' && st.reach >= 1 && st.reach <= 4)) fail(`${where}: a fixed camera's "reach" must be 1 to 4`);
    } else if (!['cab', 'chase', 'side', 'top'].includes(String(st.camera))) fail(`${where}: camera`);
  } else if ('fx' in st) {
    if (st.fx !== 'sneeze' && st.fx !== 'pop' && st.fx !== 'festival' && st.fx !== 'mirrorTurn' && st.fx !== 'hearts') fail(`${where}: fx must be "sneeze", "pop", "festival", "mirrorTurn" or "hearts"`);
    if (st.id !== undefined && ((st.fx !== 'pop' && st.fx !== 'hearts') || !isString(st.id))) fail(`${where}: only fx "pop" and "hearts" take an "id" (a cutscene figure)`);
    // v1.11 (5-3): hearts round a figure.
    if (st.fx === 'hearts' && !isString(st.id)) fail(`${where}: fx "hearts" needs an "id" (a figure brought on before it)`);
    // v1.11 (5-3): a mirror turns round.
    if (st.fx === 'mirrorTurn' && !isString(st.mirror)) fail(`${where}: fx "mirrorTurn" needs "mirror" (a mirror's params.id)`);
    if (st.fx === 'mirrorTurn' && st.to !== undefined && st.to !== 'back' && st.to !== 'front') fail(`${where}: fx "mirrorTurn" "to" must be "back" or "front"`);
  } else if ('door' in st) {
    if (st.door !== 'open' && st.door !== 'close') fail(`${where}: door must be "open" or "close"`);
  } else if ('caption' in st) {
    if (!isString(st.caption)) fail(`${where}: "caption" must be text`);
    if (st.seconds !== undefined && !isNumber(st.seconds)) fail(`${where}: "seconds" must be a number`);
  } else if ('emote' in st) {
    if (!['jump', 'tilt', 'cheer'].includes(String(st.emote))) fail(`${where}: emote`);
  } else if ('unlock' in st) {
    if (!ABILITIES.includes(String(st.unlock))) fail(`${where}: unknown ability "${String(st.unlock)}"`);
  } else if ('sky' in st) {
    // v1.10 (4-2): the sky turns to evening for the rest of the stage.
    if (st.sky !== 'evening') fail(`${where}: sky must be "evening"`);
    if (st.seconds !== undefined && !(isNumber(st.seconds) && st.seconds >= 0)) fail(`${where}: "seconds" must be >= 0`);
  } else if ('environment' in st) {
    // v1.11 (PR2c): the look changes (the stage's own with these fields written over it).
    if (!isObject(st.environment)) fail(`${where}: "environment" must be an object (the fields to change; {} = the stage's own)`);
    checkEnvironmentParts(st.environment, `${where} environment`, true);
    if (st.seconds !== undefined && !(isNumber(st.seconds) && st.seconds >= 0)) fail(`${where}: "seconds" must be >= 0`);
  } else if ('crew' in st || 'depart' in st) {
    // v1.11 (6-1): friends ride along; the train rolls off.
    checkCrewDepartStep(st, where);
  } else {
    fail(`${where}: unknown step`);
  }
}

/**
 * The parts of an environment that may be written on their own (v1.11: a cutscene's "environment" step writes only
 * some of them; the stage's own environment is checked with them too): the sky, the fog, the light, the ground, the
 * stars, v1.11 the moon and the fireflies, the sound around.
 */
function checkEnvironmentParts(env: Record<string, unknown>, where: string, step = false): void {
  if (env.sky !== undefined && (!isObject(env.sky) || !isString(env.sky.top) || !isString(env.sky.bottom))) fail(`${where}: "sky" needs top/bottom`);
  if (env.fog !== undefined && env.fog !== null && (!isObject(env.fog) || !isNumber(env.fog.near) || !isNumber(env.fog.far))) {
    fail(`${where}: "fog" must be null or {color, near, far}`);
  }
  if (env.ground !== undefined && env.ground !== null && (!isObject(env.ground) || !isNumber(env.ground.y) || !isNumber(env.ground.size))) {
    fail(`${where}: "ground" must be null or {y, size, color}`);
  }
  // v1.11 (5-2): the play mat's pastel squares.
  if (isObject(env.ground) && env.ground.look !== undefined && env.ground.look !== 'playmat') fail(`${where}: "ground.look" must be "playmat"`);
  if (env.lighting !== undefined && !['day', 'evening', 'night', 'cave'].includes(String(env.lighting))) fail(`${where}: "lighting" must be day, evening, night or cave`);
  if (env.ambience !== undefined && !AMBIENCE_KINDS.includes(env.ambience as AmbienceKind)) fail(`${where}: "ambience" must be one of ${AMBIENCE_KINDS.join(', ')}`);
  if (env.stars !== undefined) {
    const st = env.stars;
    if (!isObject(st) || !Number.isInteger(st.count) || (st.count as number) < 1 || (st.count as number) > 1000) fail(`${where}: "stars.count" must be a whole number 1–1000`);
  }
  if (env.moon !== undefined) {
    // v1.11 (5-1): the moon (no face).
    const m = env.moon;
    if (!isObject(m) || !isNumber(m.azimuth) || m.azimuth < 0 || m.azimuth > 360) fail(`${where}: "moon.azimuth" must be 0–360 degrees`);
    if (!isNumber(m.elevation) || m.elevation < 5 || m.elevation > 80) fail(`${where}: "moon.elevation" must be 5–80 degrees`);
    if (m.size !== undefined && !(isNumber(m.size) && m.size >= 0.5 && m.size <= 3)) fail(`${where}: "moon.size" must be 0.5–3`);
  }
  if (env.fireflies !== undefined) {
    // v1.11 (5-1): firefly motes round the camera.
    const f = env.fireflies;
    if (!isObject(f) || !Number.isInteger(f.count) || (f.count as number) < 0 || (f.count as number) > AMBIENT_FIREFLIES.max) {
      fail(`${where}: "fireflies.count" must be a whole number 0–${AMBIENT_FIREFLIES.max}`);
    }
    if (f.radius !== undefined && !(isNumber(f.radius) && f.radius > 0)) fail(`${where}: "fireflies.radius" must be > 0`);
  }
  for (const k of ['water', 'snow', 'festival', 'cloudSea'] as const) {
    if (step && env[k] !== undefined) fail(`${where}: "${k}" belongs to the stage's own environment (a look change keeps it)`);
  }
  // v1.11 (6-1): the faraway landmark's shadow beyond the fog.
  checkLandmark(env.landmark, where, isObject(env.fog) && isNumber(env.fog.far) ? env.fog.far : null);
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
  if (env.fall !== undefined && !['dark', 'cloud', 'leaf', 'water', 'snow', 'balls'].includes(String(env.fall))) fail('"environment.fall" must be dark, cloud, leaf, water, snow or balls');
  if (env.cloudSea !== undefined && (!isObject(env.cloudSea) || !isNumber(env.cloudSea.y))) fail('"environment.cloudSea" needs y');
  if (env.ambience !== undefined && !AMBIENCE_KINDS.includes(env.ambience as AmbienceKind)) {
    fail(`"environment.ambience" must be one of ${AMBIENCE_KINDS.join(', ')}`);
  }
  if (env.water !== undefined) checkWater(env.water);
  if (env.snow !== undefined) {
    // v1.10 (4-1): snow falling round the camera.
    const sn = env.snow;
    if (!isObject(sn) || !Number.isInteger(sn.count) || (sn.count as number) < 0 || (sn.count as number) > 2000) fail('"environment.snow.count" must be a whole number 0–2000');
    for (const k of ['radius', 'fall']) if (sn[k] !== undefined && !(isNumber(sn[k]) && (sn[k] as number) > 0)) fail(`"environment.snow.${k}" must be > 0`);
  }
  if (env.surface !== undefined && !RUN_SURFACES.includes(env.surface as RunSurface)) fail(`"environment.surface" must be one of ${RUN_SURFACES.join(', ')}`);
  if (!['day', 'evening', 'night', 'cave'].includes(String(env.lighting))) fail('"environment.lighting" must be day, evening, night or cave');
  if (env.stars !== undefined) {
    // v1.10 (3-3): stars in the sky.
    const st = env.stars;
    if (!isObject(st) || !Number.isInteger(st.count) || (st.count as number) < 1 || (st.count as number) > 1000) fail('"environment.stars.count" must be a whole number 1–1000');
  }
  checkEnvironmentParts(env, '"environment"');
  if (env.festival !== undefined) {
    const fe = env.festival;
    if (!isObject(fe) || !Array.isArray(fe.bursts) || fe.bursts.length === 0 || !fe.bursts.every(isVec3)) fail('"environment.festival.bursts" must be a list of [x, y, z]');
    if (fe.moon !== undefined && !(isObject(fe.moon) && isNumber(fe.moon.azimuth) && isNumber(fe.moon.elevation))) fail('"environment.festival.moon" needs azimuth and elevation');
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
        if (g.line !== undefined && !isString(g.line)) fail(`rail "${r.id}": gap "line" must be text`);
        if (g.phantom !== undefined && typeof g.phantom !== 'boolean') fail(`rail "${r.id}": gap "phantom" must be true or false`);
        // v1.11 (5-3): a false bridge: no dark pit (a cloud under it), and the partner names the notch.
        if (g.phantom === true && g.pit !== false) fail(`rail "${r.id}": a phantom gap needs "pit": false (a cloud under it)`);
        if (g.phantom === true && g.hint === undefined) fail(`rail "${r.id}": a phantom gap needs a "hint" (the notch that clears it)`);
      }
    }
    if (r.look !== undefined && r.look !== 'rail' && r.look !== 'silk') fail(`rail "${r.id}": "look" must be rail or silk`);
    if (r.glass !== undefined) {
      // v1.11 (5-3): glass stretches (looks only).
      if (!Array.isArray(r.glass) || !r.glass.every((k) => isObject(k) && isNumber(k.from) && isNumber(k.to) && k.to > k.from)) fail(`rail "${r.id}": "glass" must be [{ from, to }] with from < to`);
      const spans = (r.glass as { from: number; to: number }[]).map((k) => [k.from, k.to]).sort((a, b) => a[0] - b[0]);
      for (let k = 1; k < spans.length; k++) if (spans[k][0] < spans[k - 1][1]) fail(`rail "${r.id}": glass stretches must not overlap`);
      if (r.look === 'silk') fail(`rail "${r.id}": a silk rail has no glass`);
    }
    if (r.deadEnd !== undefined && typeof r.deadEnd !== 'boolean') fail(`rail "${r.id}": "deadEnd" must be true or false`);
    if (r.upMode !== undefined && r.upMode !== 'fixed' && r.upMode !== 'follow') fail(`rail "${r.id}": "upMode" must be fixed or follow`);
    if (r.deadEnd === true && r.end.type !== 'buffer') fail(`rail "${r.id}": a dead end must end in a buffer`);
    if (r.spur !== undefined) {
      const back = isObject(r.spur) ? r.spur.back : undefined;
      if (!isObject(back) || !isString(back.railId) || !isNumber(back.at)) fail(`rail "${r.id}": spur needs back: { railId, at }`);
      if (r.end.type !== 'buffer') fail(`rail "${r.id}": a spur must end in a buffer`);
      if (r.deadEnd === true) fail(`rail "${r.id}": a spur is not a dead end (write one of them)`);
    }
    if (r.base !== undefined) {
      // v1.10 (3-3): one base, or a list of bases each over its own stretch (`from`–`to`, not overlapping).
      const list = Array.isArray(r.base) ? r.base : [r.base];
      if (list.length === 0) fail(`rail "${r.id}": base list is empty`);
      for (const b of list as unknown[]) {
        if (!isObject(b) || !['rock', 'pier', 'snow', 'blocks'].includes(String(b.look))) fail(`rail "${r.id}": base needs look "rock", "pier", "snow" or "blocks"`);
        if (b.depth !== undefined && (!isNumber(b.depth) || b.depth <= 0)) fail(`rail "${r.id}": base depth must be > 0`);
        if (b.toGround !== undefined && typeof b.toGround !== 'boolean') fail(`rail "${r.id}": base toGround must be true or false`);
        if (b.skip !== undefined && (!Array.isArray(b.skip) || !b.skip.every((k) => isObject(k) && isNumber(k.from) && isNumber(k.to) && k.to > k.from))) {
          fail(`rail "${r.id}": base skip must be [{ from, to }]`);
        }
        if (Array.isArray(r.base) && !(isNumber(b.from) && isNumber(b.to) && b.to > b.from)) fail(`rail "${r.id}": each base in a list needs from < to`);
      }
      if (Array.isArray(r.base)) {
        const spans = (r.base as { from: number; to: number }[]).map((b) => [b.from, b.to]).sort((a, b) => a[0] - b[0]);
        for (let k = 1; k < spans.length; k++) if (spans[k][0] < spans[k - 1][1]) fail(`rail "${r.id}": bases must not overlap`);
      }
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
    if (j.diveSide !== undefined) fail(`junction "${j.id}": "diveSide" is set by the loader (write "dive": true)`);
    if (j.dive !== undefined) {
      if (typeof j.dive !== 'boolean') fail(`junction "${j.id}": "dive" must be true or false`);
      if (j.dive && (j.needs !== undefined || j.signReversed === true)) fail(`junction "${j.id}": a dive fork has no sign (no "needs", no "signReversed")`);
      if (j.dive && (j.left === undefined || j.right === undefined)) fail(`junction "${j.id}": a dive fork needs both left and right`);
    }
    if (j.bubbles !== undefined) {
      // v1.10 (3-1): a bubble fork: one way rises (the true one), the other sinks.
      const b = j.bubbles;
      const kinds = ['rise', 'sink'];
      if (!isObject(b) || !kinds.includes(String(b.left)) || !kinds.includes(String(b.right)) || b.left === b.right) {
        fail(`junction "${j.id}": bubbles needs left and right, one "rise" and one "sink"`);
      }
      if (b.say !== undefined && !isString(b.say)) fail(`junction "${j.id}": bubbles.say must be text`);
      if (j.left === undefined || j.right === undefined) fail(`junction "${j.id}": a bubble fork needs both left and right`);
      if (j.dive === true || j.needs !== undefined || j.signReversed === true) fail(`junction "${j.id}": a bubble fork has no dive, needs or signReversed`);
      // The sinking side must lead back before the fork (a loop) or end: a wrong guess never gets the train further.
      const sinkRail = (rails as Record<string, unknown>[]).find((r) => r.id === j[b.left === 'sink' ? 'left' : 'right']);
      const end = sinkRail?.end as Record<string, unknown> | undefined;
      const loops = end?.type === 'merge' && end.railId === j.railId && isNumber(end.at) && end.at < (j.at as number);
      if (!sinkRail || sinkRail.id === j.railId || !(loops || sinkRail.deadEnd === true)) {
        fail(`junction "${j.id}": the sinking side must be a loop back before the fork or a dead end`);
      }
    }
    if (j.fireflies !== undefined) {
      // v1.11 (5-1): a firefly fork: the true way is the side that is not the default.
      const f = j.fireflies;
      if (!isObject(f)) fail(`junction "${j.id}": "fireflies" must be an object`);
      const callFrom = f.callFrom ?? FIREFLY_FORK.callFrom;
      const callTo = f.callTo ?? FIREFLY_FORK.callTo;
      if (!isNumber(callFrom) || !isNumber(callTo) || callTo < 6 || callFrom <= callTo) fail(`junction "${j.id}": fireflies need callFrom > callTo >= 6`);
      if (f.count !== undefined && !(Number.isInteger(f.count) && (f.count as number) >= 1 && (f.count as number) <= 64)) fail(`junction "${j.id}": fireflies.count must be a whole number 1–64`);
      if (f.fake !== undefined && typeof f.fake !== 'boolean') fail(`junction "${j.id}": fireflies.fake must be true or false`);
      if (j.left === undefined || j.right === undefined) fail(`junction "${j.id}": a firefly fork needs both left and right`);
      if (j.needs !== undefined || j.dive === true || j.bubbles !== undefined) fail(`junction "${j.id}": a firefly fork has no needs, dive or bubbles`);
      if (f.fake === true && j.signReversed !== true) fail(`junction "${j.id}": a fake firefly fork needs "signReversed": true (Sakasa's lie)`);
      if (f.fake !== true && j.signReversed === true) fail(`junction "${j.id}": only a fake firefly fork has a reversed sign`);
      // The false way (the default) must end or come back before the fork: a wrong guess never gets the train further.
      const falseRail = (rails as Record<string, unknown>[]).find((r) => r.id === j[j.default as 'left' | 'right']);
      const end = falseRail?.end as Record<string, unknown> | undefined;
      const loops = end?.type === 'merge' && end.railId === j.railId && isNumber(end.at) && end.at < (j.at as number);
      if (!falseRail || falseRail.id === j.railId || !(loops || falseRail.deadEnd === true)) {
        fail(`junction "${j.id}": a firefly fork's false way (its default) must be a dead end or a loop back before the fork`);
      }
    }
    if (j.spin !== undefined) {
      // v1.11 (5-2): a spinning fork: the good side goes on, the other is a loop back before it.
      const sp = j.spin;
      if (!isObject(sp) || (sp.good !== 'left' && sp.good !== 'right')) fail(`junction "${j.id}": spin needs good "left" or "right"`);
      if (j.left === undefined || j.right === undefined) fail(`junction "${j.id}": a spinning fork needs both left and right`);
      if (j.signReversed === true || j.needs !== undefined || j.dive === true || j.bubbles !== undefined || j.fireflies !== undefined) {
        fail(`junction "${j.id}": a spinning fork has no signReversed, needs, dive, bubbles or fireflies`);
      }
      const range = (key: string, lo: number, hi: number): void => {
        if (sp[key] !== undefined && !(isNumber(sp[key]) && (sp[key] as number) >= lo && (sp[key] as number) <= hi)) fail(`junction "${j.id}": spin.${key} must be ${lo}–${hi}`);
      };
      range('stay', 2, 8);
      range('turn', 0.5, 2);
      range('range', 80, 200);
      if (sp.line !== undefined && sp.line !== null && !isString(sp.line)) fail(`junction "${j.id}": spin.line must be text or null`);
      const otherRail = (rails as Record<string, unknown>[]).find((r) => r.id === j[sp.good === 'left' ? 'right' : 'left']);
      const end = otherRail?.end as Record<string, unknown> | undefined;
      const loops = end?.type === 'merge' && end.railId === j.railId && isNumber(end.at) && end.at < (j.at as number);
      if (!otherRail || otherRail.id === j.railId || !loops) fail(`junction "${j.id}": a spinning fork's other side must be a loop back onto its rail before the fork`);
    }
    if (j.turn !== undefined) fail(`junction "${j.id}": "turn" is set by the loader (write a magnet "turn" target naming it)`);
    if (j.phantom !== undefined) {
      // v1.11 (5-3): a phantom fork: its default way is Sakasa's phantom rail (a reversed sign's dead end).
      if (typeof j.phantom !== 'boolean') fail(`junction "${j.id}": "phantom" must be true or false`);
      if (j.phantom && j.signReversed !== true) fail(`junction "${j.id}": a phantom fork needs "signReversed": true`);
      if (j.phantom && (j.needs !== undefined || j.dive === true || j.bubbles !== undefined || j.fireflies !== undefined || j.spin !== undefined)) {
        fail(`junction "${j.id}": a phantom fork has no needs, dive, bubbles, fireflies or spin`);
      }
      const way = (rails as Record<string, unknown>[]).find((r) => r.id === j[j.default as 'left' | 'right']);
      if (j.phantom && (!way || way.id === j.railId || way.deadEnd !== true)) fail(`junction "${j.id}": a phantom fork's default way must be a dead end (its phantom rail)`);
    }
    if (j.needs !== undefined) {
      if (!ABILITIES.includes(String(j.needs))) fail(`junction "${j.id}": "needs" must be an ability`);
      const other = j.default === 'left' ? 'right' : 'left';
      if (j[other] === undefined || j[other] === j.railId) fail(`junction "${j.id}": "needs" is for the way off to the side, and the ${other} side has none`);
      if (j.signReversed === true) fail(`junction "${j.id}": a reversed sign cannot also need an ability`);
    }
  }

  const stationIds = new Set<string>();
  for (const s of requireArray(raw, 'stations')) {
    if (!isObject(s) || !isString(s.id) || !isString(s.name)) fail('each station needs "id" and "name"');
    if (!isString(s.railId) || !railIds.has(s.railId) || !isNumber(s.at)) fail(`station "${s.id}": needs known railId and at`);
    if (s.platformSide !== 'left' && s.platformSide !== 'right') fail(`station "${s.id}": platformSide`);
    if (s.buried !== undefined) fail(`station "${s.id}": "buried" is set by the loader (put the station in a plow-wall's stretch)`);
    stationIds.add(s.id);
  }

  requireArray(raw, 'props').forEach((p, i) => {
    if (!isObject(p) || !isString(p.model) || !MODEL_NAME.test(p.model)) fail(`props[${i}]: "model" must match [a-z0-9-]+`);
    if (p.tag !== undefined && !isString(p.tag)) fail(`props[${i}]: "tag" must be text`);
    if (p.trace !== undefined && typeof p.trace !== 'boolean') fail(`props[${i}]: "trace" must be true or false`);
    if (p.traceLine !== undefined && (!isString(p.traceLine) || p.trace !== true)) fail(`props[${i}]: "traceLine" is text on a prop with "trace": true`);
    if (p.sleeper !== undefined && typeof p.sleeper !== 'boolean') fail(`props[${i}]: "sleeper" must be true or false`);
    // v1.11 (5-2): a reverse-wound toy (its model ends in "-back").
    if (p.windup !== undefined && typeof p.windup !== 'boolean') fail(`props[${i}]: "windup" must be true or false`);
    if (p.windup === true && !String(p.model).endsWith('-back')) fail(`props[${i}]: a "windup" prop's model ends in "-back" (the model without it is the wound one)`);
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
    if (['grasshopper', 'nut', 'squirrel', 'rock-roll', 'rock-drop'].includes(a.type) && !isObject(a.onRail)) {
      fail(`actor "${a.id}": a ${a.type} is placed with onRail`);
    }
    if (a.type === 'grasshopper' && a.reactsTo === 'light') fail(`actor "${a.id}": a grasshopper hops on by itself ("none") or when whistled for ("whistle")`);
    const ap = (a.params ?? {}) as Record<string, unknown>;
    if (a.type === 'cat' && ap.look !== undefined && !CAT_LOOKS.includes(ap.look as CatLook)) fail(`actor "${a.id}": look must be one of ${CAT_LOOKS.join(', ')}`);
    if (a.type === 'cat' && ap.walk !== undefined) {
      // v1.11 (5-2): a reverse-wound toy walking back towards the train.
      const w = ap.walk;
      const wake = isNumber(ap.wakeDistance) ? ap.wakeDistance : 60;
      if (!isObject(w) || !isNumber(w.speed) || w.speed < 0.2 || w.speed > 2) fail(`actor "${a.id}": walk.speed must be 0.2–2 m/s`);
      if (!isNumber(w.max) || w.max < 0 || w.max > 20) fail(`actor "${a.id}": walk.max must be 0–20 m`);
      const from = w.from ?? WINDUP.walkFrom;
      if (!isNumber(from) || from <= wake) fail(`actor "${a.id}": walk.from must be more than its wakeDistance (${wake})`);
      if (!isObject(a.onRail)) fail(`actor "${a.id}": a walking toy is placed with onRail`);
    }
    if (a.type === 'parade') {
      // v1.11 (5-2): the toy band on the rail.
      if (!isObject(a.onRail)) fail(`actor "${a.id}": a parade is placed with onRail`);
      if (a.reactsTo !== 'whistle') fail(`actor "${a.id}": a parade reacts to the whistle`);
      const members = ap.members;
      if (!Array.isArray(members) || members.length < 1 || members.length > 6 || !members.every((m) => isString(m) && MODEL_NAME.test(m))) {
        fail(`actor "${a.id}": members must be 1–6 model names`);
      }
      const at = (a.onRail as Record<string, number>).at;
      const b = ap.back;
      if (b !== undefined && !(isObject(b) && isNumber(b.min))) fail(`actor "${a.id}": back needs "min"`);
      const setup = paradeSetup(ap, at);
      if (!(setup.speed >= 2 && setup.speed <= 8)) fail(`actor "${a.id}": speed must be 2–8 m/s`);
      if (!(setup.gap >= 8 && setup.gap <= 30)) fail(`actor "${a.id}": gap must be 8–30 m`);
      if (!(setup.spacing > 0 && setup.spacing <= 6)) fail(`actor "${a.id}": spacing must be above 0, at most 6 m`);
      if (!(setup.back.speed > 0 && setup.back.speed <= 3)) fail(`actor "${a.id}": back.speed must be above 0, at most 3 m/s`);
      if (!(setup.callRange < setup.back.from && setup.callRange > setup.gap + PARADE.stopAhead)) {
        fail(`actor "${a.id}": callRange must be less than back.from and more than gap + ${PARADE.stopAhead}`);
      }
      if (!(setup.back.min <= at)) fail(`actor "${a.id}": back.min must not be after its tail (onRail.at)`);
      if (!isNumber(ap.exit) || !(setup.exit > at + setup.spacing * (members as unknown[]).length)) fail(`actor "${a.id}": exit must be after its head`);
      if (ap.exitSide !== undefined && ap.exitSide !== 'left' && ap.exitSide !== 'right') fail(`actor "${a.id}": exitSide must be left or right`);
    }
    // v1.11 (5-1): an animal that lights the whistle (the hedgehog).
    if (a.type === 'cat' && ap.glow !== undefined && typeof ap.glow !== 'boolean') fail(`actor "${a.id}": "glow" must be true or false`);
    if (a.type === 'cat') for (const k of ['say', 'woke', 'danger', 'after']) if (ap[k] !== undefined && !isString(ap[k])) fail(`actor "${a.id}": "${k}" must be text`);
    if (a.type === 'dino-small' && ap.look !== undefined && !['dino', 'duck', 'fawn'].includes(String(ap.look))) fail(`actor "${a.id}": look must be dino, duck or fawn`);
    if (a.type === 'dino-small' && ap.glare !== undefined && typeof ap.glare !== 'boolean') fail(`actor "${a.id}": "glare" must be true or false`);
    if (a.type === 'dino-small' && ap.glare === true && ap.look !== 'fawn') fail(`actor "${a.id}": only a fawn (look "fawn") gazes at the light ("glare")`);
    if (a.type === 'lure') {
      // v1.11 (5-1): little tanukis coming to a reversed whistle.
      if (!isObject(a.onRail)) fail(`actor "${a.id}": a lure is placed with onRail`);
      if (a.reactsTo !== 'whistle') fail(`actor "${a.id}": a lure reacts to the whistle`);
      if (ap.look !== undefined && ap.look !== 'tanuki') fail(`actor "${a.id}": a lure's look must be tanuki`);
      if (ap.count !== undefined && !(Number.isInteger(ap.count) && (ap.count as number) >= 1 && (ap.count as number) <= LURE.countMax)) fail(`actor "${a.id}": count must be a whole number 1–${LURE.countMax}`);
      for (const k of ['dance', 'danceMax', 'dangerDistance', 'reaction', 'margin']) if (ap[k] !== undefined && !(isNumber(ap[k]) && (ap[k] as number) > 0)) fail(`actor "${a.id}": params.${k} must be > 0`);
    }
    if (a.type === 'rock-roll' && ap.look !== undefined && !['rock', 'snowbird', 'snowman-upside'].includes(String(ap.look))) fail(`actor "${a.id}": look must be rock, snowbird or snowman-upside`);
    // v1.10 (4-3): a snowman sliding down onto the rail, or snow falling off the pines.
    if (a.type === 'rock-drop' && ap.look !== undefined && !['rock', 'snowman', 'snow-pile'].includes(String(ap.look))) fail(`actor "${a.id}": look must be rock, snowman or snow-pile`);
    if (a.type === 'rock-roll' || a.type === 'rock-drop') {
      const rw = ap.rewind;
      if (rw !== undefined && !isNumber(rw) && !(isObject(rw) && isString(rw.railId) && railIds.has(rw.railId) && isNumber(rw.at))) {
        fail(`actor "${a.id}": rewind must be a place on its rail (a number) or { railId, at }`);
      }
      for (const k of ['say', 'hitAfter']) if (ap[k] !== undefined && !isString(ap[k])) fail(`actor "${a.id}": "${k}" must be text`);
    }
    if (a.type === 'whale') {
      // v1.10 (3-1): a whale greeted by the whistle, swimming along until `until`.
      if (!isObject(a.onRail)) fail(`actor "${a.id}": a whale is placed with onRail`);
      if (a.reactsTo !== 'whistle') fail(`actor "${a.id}": a whale reacts to the whistle`);
      if (!isNumber(ap.until) || ap.until <= (a.onRail as Record<string, number>).at) fail(`actor "${a.id}": params.until must be after the whale`);
      for (const k of ['callRange', 'lead', 'trail']) if (ap[k] !== undefined && !(isNumber(ap[k]) && (ap[k] as number) > 0)) fail(`actor "${a.id}": params.${k} must be > 0`);
      for (const k of ['lateral', 'height']) if (ap[k] !== undefined && !isNumber(ap[k])) fail(`actor "${a.id}": params.${k} must be a number`);
    }
  }

  for (const r of requireArray(raw, 'records')) {
    if (!isObject(r) || !isString(r.id) || !isString(r.name)) fail('each record needs "id" and "name"');
    if (r.requires !== null && !ABILITIES.includes(String(r.requires))) fail(`record "${r.id}": "requires" must be an ability or null`);
    if (r.model !== undefined && (!isString(r.model) || !MODEL_NAME.test(r.model))) fail(`record "${r.id}": "model" must match [a-z0-9-]+`);
    if (r.hint !== undefined && !isString(r.hint)) fail(`record "${r.id}": "hint" must be text`);
    if (r.hush !== undefined && typeof r.hush !== 'boolean') fail(`record "${r.id}": "hush" must be true or false`);
    checkPlacement(r, `record "${r.id}"`, railIds);
  }

  const cutsceneIds = new Set<string>();
  if (raw.cutscenes !== undefined) {
    if (!isObject(raw.cutscenes)) fail('"cutscenes" must be an object');
    for (const [id, steps] of Object.entries(raw.cutscenes)) {
      if (!Array.isArray(steps)) fail(`cutscene "${id}" must be an array of steps`);
      steps.forEach((st, i) => checkCutsceneStep(st, `cutscene "${id}" step ${i}`, railIds));
      // v1.11 (5-2): a press that winds (fx "windup") winds a figure this cutscene brought on before it (and has not
      // taken off yet), a reverse-wound one ("-back").
      const on = new Map<string, string>();
      steps.forEach((st: Record<string, unknown>, i) => {
        if (isString(st.spawn) && isString(st.model)) on.set(st.spawn, st.model);
        if (isString(st.remove)) on.delete(st.remove);
        // v1.11 (PR5): a press "magnet" pulls a figure this cutscene brought on (and has not taken off yet).
        if ('press' in st && st.press === 'magnet' && !on.has(String(st.target))) fail(`cutscene "${id}" step ${i}: press "magnet" target "${String(st.target)}" must be a figure brought on (spawn) before it`);
        if ('press' in st && st.fx === 'windup') {
          const model = on.get(String(st.target));
          if (!model) fail(`cutscene "${id}" step ${i}: press target "${String(st.target)}" must be a figure brought on (spawn) before it`);
          if (!model.endsWith('-back')) fail(`cutscene "${id}" step ${i}: press target "${String(st.target)}" must be a reverse-wound figure (a model ending in "-back")`);
        }
      });
      cutsceneIds.add(id);
    }
  }
  // v1.10 (3-3): a beacon needs a lighthouse to light, a festival its places.
  for (const steps of Object.values((raw.cutscenes ?? {}) as Record<string, Record<string, unknown>[]>)) {
    for (const st of steps) {
      if ('press' in st && st.fx === 'beacon' && !(raw.props as Record<string, unknown>[]).some((p) => p.model === 'lighthouse')) fail('a press with fx "beacon" needs a "lighthouse" prop');
      if (st.fx === 'festival' && env.festival === undefined) fail('fx "festival" needs "environment.festival"');
    }
  }
  // v1.11 (5-3): mirror names, and the cutscene steps that need a mirror.
  {
    const mirrors = (requireArray(raw, 'gimmicks') as Record<string, unknown>[]).filter((g) => isObject(g) && g.type === 'mirror');
    const ids = new Set<string>();
    for (const g of mirrors) {
      const id = (g.params as Record<string, unknown> | undefined)?.id;
      if (!isString(id)) continue;
      if (ids.has(id)) fail(`mirror params.id "${id}" is used twice`);
      ids.add(id);
    }
    const showsFigures = mirrors.some((g) => {
      const r = (g.params as Record<string, unknown> | undefined)?.reflect;
      return Array.isArray(r) && r.includes('cutscene');
    });
    for (const [id, steps] of Object.entries((raw.cutscenes ?? {}) as Record<string, Record<string, unknown>[]>)) {
      steps.forEach((st, i) => {
        if ('spawn' in st && st.mirror !== undefined && !showsFigures) fail(`cutscene "${id}" step ${i}: spawn "mirror" needs a mirror with reflect "cutscene"`);
        if (st.fx === 'mirrorTurn' && !ids.has(String(st.mirror))) fail(`cutscene "${id}" step ${i}: fx "mirrorTurn" names no mirror "${String(st.mirror)}"`);
      });
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
      if (st.chase !== undefined) checkChase(st.chase, `mission "${m.id}" chase`, railIds);
      if (st.countdown !== undefined && st.chase !== undefined) fail(`mission "${m.id}": a step has a countdown or a chase, not both`);
      if (st.countdown !== undefined) {
        const c = st.countdown;
        const where = `mission "${m.id}" countdown`;
        if (!isObject(c) || !isNumber(c.seconds) || c.seconds <= 0) fail(`${where}: "seconds" must be > 0`);
        if (c.until !== undefined && (!isObject(c.until) || !isString(c.until.railId) || !railIds.has(c.until.railId) || !isNumber(c.until.at))) {
          fail(`${where}: "until" needs a known railId and at`);
        }
        if (c.assist !== undefined && (!isNumber(c.assist) || c.assist < 0)) fail(`${where}: "assist" must be >= 0`);
        if (c.assistMax !== undefined && (!isNumber(c.assistMax) || c.assistMax < 0)) fail(`${where}: "assistMax" must be >= 0`);
        if (c.icon !== undefined && !['volcano', 'clock', 'moon'].includes(String(c.icon))) fail(`${where}: "icon" must be volcano, clock or moon`);
        if (c.music !== undefined && (typeof c.music !== 'string' || !(c.music in SONGS))) fail(`${where}: "music" must be a song in src/audio/songs.ts`);
      }
    }
    if (m.lines !== undefined && !isObject(m.lines)) fail(`mission "${m.id}": "lines" must be an object`);
    if (m.hints !== undefined) {
      if (!Array.isArray(m.hints)) fail(`mission "${m.id}": "hints" must be an array`);
      for (const h of m.hints as unknown[]) {
        if (!isObject(h) || !isString(h.railId) || !railIds.has(h.railId) || !isNumber(h.at) || !isString(h.text)) {
          fail(`mission "${m.id}": hint needs railId, at, text`);
        }
        if (h.unless !== undefined && !ABILITIES.includes(String(h.unless))) fail(`mission "${m.id}": hint "unless" must be an ability`);
      }
    }
    if (m.onComplete !== undefined && (!isString(m.onComplete) || !cutsceneIds.has(m.onComplete))) {
      fail(`mission "${m.id}": "onComplete" must name a cutscene`);
    }
  }

  const nightIds = new Set<string>();
  requireArray(raw, 'gimmicks').forEach((g, i) => {
    if (!isObject(g) || !isString(g.type)) fail(`gimmicks[${i}]: "type" is required`);
    const zoned = ['camera', 'updraft', 'fog', 'jump-pad', 'bough', 'flower-bridge', 'fragile', 'slope', 'rocket', 'sound', 'ice', 'thin-ice', 'tunnel', 'hush', 'whistle-reversed'];
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
    if (g.type === 'bubbles') {
      // v1.7: a bubble column in the sea (looks only).
      const pos = p.position;
      if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(isNumber)) fail(`gimmicks[${i}] bubbles: params.position must be [x, y, z]`);
      if (p.count !== undefined && !(Number.isInteger(p.count) && (p.count as number) >= 1 && (p.count as number) <= 64)) {
        fail(`gimmicks[${i}] bubbles: params.count must be a whole number 1–64`);
      }
      for (const k of ['height', 'radius']) if (p[k] !== undefined && !(isNumber(p[k]) && (p[k] as number) > 0)) fail(`gimmicks[${i}] bubbles: params.${k} must be > 0`);
    }
    if (g.type === 'slope') {
      if (!isNumber(p.pull) || p.pull === 0) fail(`gimmicks[${i}] slope: params.pull must be a number other than 0`);
      if (p.max !== undefined && (!isNumber(p.max) || p.max <= 0)) fail(`gimmicks[${i}] slope: params.max must be > 0`);
      const rw = p.rewind;
      if (rw !== undefined && !(isObject(rw) && isString(rw.railId) && railIds.has(rw.railId) && isNumber(rw.at))) {
        fail(`gimmicks[${i}] slope: params.rewind needs a known railId and at`);
      }
      if (p.line !== undefined && p.line !== null && !isString(p.line)) fail(`gimmicks[${i}] slope: params.line must be text or null`);
      if (p.sign !== undefined && typeof p.sign !== 'boolean') fail(`gimmicks[${i}] slope: params.sign must be true or false`);
      // v1.11 (5-2): a toy slide.
      if (p.look !== undefined && (p.look !== 'slide' || !(isNumber(p.pull) && p.pull > 0))) fail(`gimmicks[${i}] slope: params.look "slide" is for a slide (pull above 0) only`);
    }
    if (g.type === 'rocket') {
      if (p.allow !== undefined && typeof p.allow !== 'boolean') fail(`gimmicks[${i}] rocket: params.allow must be true or false`);
      if (p.glow !== undefined && typeof p.glow !== 'boolean') fail(`gimmicks[${i}] rocket: params.glow must be true or false`);
      if (p.allow === false && p.glow === true) fail(`gimmicks[${i}] rocket: allow false and glow true cannot go together`);
      if (p.icon !== undefined && !['none', 'sleep', 'bridge'].includes(String(p.icon))) fail(`gimmicks[${i}] rocket: params.icon must be none, sleep or bridge`);
      for (const k of ['line', 'pressLine']) if (p[k] !== undefined && !isString(p[k])) fail(`gimmicks[${i}] rocket: params.${k} must be text`);
    }
    if (g.type === 'sound' && !RUN_SURFACES.includes(p.surface as RunSurface)) {
      // v1.9: what the track sounds like on this stretch (the running sound; v1.10 adds ice, snow and tunnel).
      fail(`gimmicks[${i}] sound: params.surface must be one of ${RUN_SURFACES.join(', ')}`);
    }
    if (g.type === 'updraft') {
      // v1.10 (3-1): a current (bubble rings) that belongs to a whale.
      if (p.look !== undefined && p.look !== 'wind' && p.look !== 'current') fail(`gimmicks[${i}] updraft: params.look must be wind or current`);
      if (p.whale !== undefined && !(raw.actors as Record<string, unknown>[]).some((a) => a.id === p.whale && a.type === 'whale')) {
        fail(`gimmicks[${i}] updraft: params.whale must be the id of a whale actor`);
      }
      if (p.speed !== undefined && !(isNumber(p.speed) && p.speed > 0)) fail(`gimmicks[${i}] updraft: params.speed must be > 0`);
    }
    if (g.type === 'jump-pad' && p.look !== undefined && !['pad', 'whale', 'ski'].includes(String(p.look))) fail(`gimmicks[${i}] jump-pad: params.look must be pad, whale or ski`);
    if (g.type === 'plow-wall') {
      // v1.10 (4-2): a snow wall and the buried stretch behind it.
      const where = `gimmicks[${i}] plow-wall`;
      if (!isString(g.railId) || !railIds.has(g.railId) || !isNumber(g.from)) fail(`${where}: needs a known railId and "from"`);
      if (g.to !== undefined && !(isNumber(g.to) && g.to >= (g.from as number) + PLOW.wallDepth)) fail(`${where}: "to" must be at least ${PLOW.wallDepth} m after "from"`);
      if (p.look !== undefined && !['snow', 'sand', 'foam', 'hanging'].includes(String(p.look))) fail(`${where}: params.look must be snow, sand, foam or hanging`);
      if (p.line !== undefined && p.line !== null && !isString(p.line)) fail(`${where}: params.line must be text or null`);
      const rw = p.rewind;
      if (rw !== undefined && !(isObject(rw) && isString(rw.railId) && railIds.has(rw.railId) && isNumber(rw.at))) fail(`${where}: params.rewind needs a known railId and at`);
      for (const k of ['height', 'width']) if (p[k] !== undefined && !(isNumber(p[k]) && (p[k] as number) > 0)) fail(`${where}: params.${k} must be > 0`);
      if (p.sign !== undefined && typeof p.sign !== 'boolean') fail(`${where}: params.sign must be true or false`);
    }
    if (g.type === 'tunnel') checkTunnel(g as Record<string, unknown>, p, `gimmicks[${i}] tunnel`);
    if (g.type === 'hush' || g.type === 'whistle-reversed') {
      // v1.11 (5-1): a hush stretch, a whistle-reversed stretch.
      const where = `gimmicks[${i}] ${g.type}`;
      if (!isString(p.id)) fail(`${where}: params.id is required (text)`);
      if (nightIds.has(p.id)) fail(`${where}: params.id "${p.id}" is used twice`);
      nightIds.add(p.id);
      const rw = p.rewind;
      if (rw !== undefined && !(isObject(rw) && isString(rw.railId) && railIds.has(rw.railId) && isNumber(rw.at))) fail(`${where}: params.rewind needs a known railId and at`);
      if (p.sign !== undefined && typeof p.sign !== 'boolean') fail(`${where}: params.sign must be true or false`);
      if (p.line !== undefined && !isString(p.line)) fail(`${where}: params.line must be text`);
      if (g.type === 'hush') {
        if (p.glowBefore !== undefined && !(isNumber(p.glowBefore) && p.glowBefore >= 0 && p.glowBefore <= 80)) fail(`${where}: params.glowBefore must be 0–80`);
        if (p.startleAfter !== undefined && !(isNumber(p.startleAfter) && p.startleAfter > 0)) fail(`${where}: params.startleAfter must be > 0`);
      }
    }
    if (g.type === 'fog' && p.color !== undefined && !(typeof p.color === 'string' && COLOR.test(p.color))) fail(`gimmicks[${i}] fog: params.color must be #rrggbb`);
    if (g.type === 'fog' && p.glow !== undefined && typeof p.glow !== 'boolean') fail(`gimmicks[${i}] fog: params.glow must be true or false`);
    if (g.type === 'flock') {
      // v1.10 (3-2): a school that leaps out of the water.
      if (p.mode !== undefined && p.mode !== 'circle' && p.mode !== 'leap') fail(`gimmicks[${i}] flock: params.mode must be circle or leap`);
      if (p.mode === 'leap' && !isNumber(p.surface)) fail(`gimmicks[${i}] flock: a leaping school needs params.surface (the water's height)`);
    }
    if (g.type === 'waterfall') checkWaterfall(p, `gimmicks[${i}] waterfall`, (env.water ?? []) as Record<string, unknown>[]);
    if (g.type === 'camera' && !['cab', 'chase', 'side', 'top'].includes(String((g.params as Record<string, unknown> | undefined)?.mode))) {
      fail(`gimmicks[${i}] camera: params.mode must be cab, chase, side or top`);
    }
    checkIceGimmick(g as Record<string, unknown>, p, `gimmicks[${i}] ${g.type}`, railIds);
  });

  if (raw.floaters !== undefined) {
    if (!Array.isArray(raw.floaters)) fail('"floaters" must be an array');
    const floaterIds = new Set<string>();
    for (const f of raw.floaters as unknown[]) {
      if (!isObject(f) || !isString(f.id)) fail('each floater needs an "id"');
      if (floaterIds.has(f.id)) fail(`duplicate floater id "${f.id}"`);
      floaterIds.add(f.id);
      if (!isString(f.railId) || !railIds.has(f.railId) || !isNumber(f.at)) fail(`floater "${f.id}": needs a known railId and "at"`);
      if (f.look !== undefined && !FLOATER_LOOKS.includes(f.look as FloaterLook)) fail(`floater "${f.id}": "look" must be one of ${FLOATER_LOOKS.join(', ')}`);
      if (f.length !== undefined && !(isNumber(f.length) && f.length > 0 && f.length <= 16)) fail(`floater "${f.id}": "length" must be above 0 and at most 16 m`);
      const rw = f.rewind;
      if (rw !== undefined && !isNumber(rw) && !(isObject(rw) && isString(rw.railId) && railIds.has(rw.railId) && isNumber(rw.at))) {
        fail(`floater "${f.id}": rewind must be a place on its rail (a number) or { railId, at }`);
      }
      if (f.say !== undefined && !isString(f.say)) fail(`floater "${f.id}": "say" must be text`);
    }
  }

  checkMeadow(raw as unknown as StageFile);

  // v1.10 (4-3): a prop's mark revealed by a junction's light.
  for (const pr of raw.props as Record<string, unknown>[]) {
    if (pr.reveal === undefined) continue;
    if (!isString(pr.reveal) || !(raw.junctions as Record<string, unknown>[]).some((j) => j.id === pr.reveal && j.signReversed === true)) {
      fail(`prop "${String(pr.model)}": "reveal" must name a junction with a reversed sign`);
    }
  }

  // v1.11 (PR5): the magnet light's targets, the iron odds and ends.
  checkMagnetShapes(raw, railIds);

  // v1.11 (6-1): おいかけっこ, ドアを あけて まつ, the missions' own junction rules, junctions[].glow.
  checkLeadShapes(raw);
  return raw as unknown as StageFile;
}

/** v1.10 (4-3): the snow wave of a mission step (PHASE8 第 8 部 §4.7). */
function checkChase(c: unknown, where: string, railIds: Set<string>): void {
  if (!isObject(c) || !isString(c.railId) || !railIds.has(c.railId) || !isNumber(c.from)) fail(`${where}: needs a known railId and "from"`);
  const u = c.until;
  if (!isObject(u) || !isString(u.railId) || u.railId !== c.railId || !isNumber(u.at)) fail(`${where}: "until" must be { railId, at } on its own rail`);
  if (!isNumber(c.fence)) fail(`${where}: "fence" must be a number`);
  const from = c.from as number;
  const fence = c.fence as number;
  const until = (u as { at: number }).at;
  if (!(from < fence && fence < until)) fail(`${where}: needs from < fence < until`);
  if (until - fence < 40) fail(`${where}: "until" must be 40 m or more past the fence (the last car goes through it)`);
  if (!Array.isArray(c.retry) || c.retry.length === 0 || !c.retry.every(isNumber)) fail(`${where}: "retry" must be a list of places`);
  const retry = c.retry as number[];
  for (let i = 1; i < retry.length; i++) if (retry[i] <= retry[i - 1]) fail(`${where}: "retry" must go up`);
  if (retry[0] < from - 30) fail(`${where}: "retry" must start at from − 30 or later`);
  if (c.paces !== undefined) {
    if (!Array.isArray(c.paces)) fail(`${where}: "paces" must be a list`);
    for (const z of c.paces as unknown[]) {
      if (!isObject(z) || !isNumber(z.from) || !isNumber(z.to) || z.to <= z.from || !isNumber(z.speed) || z.speed <= 0) fail(`${where}: each pace needs from < to and a speed > 0`);
    }
  }
  for (const k of ['pace', 'start', 'restart', 'far', 'bandMax', 'assist', 'minPace']) {
    if (c[k] !== undefined && !(isNumber(c[k]) && (c[k] as number) >= 0)) fail(`${where}: "${k}" must be a number >= 0`);
  }
  if (c.music !== undefined && (typeof c.music !== 'string' || !(c.music in SONGS))) fail(`${where}: "music" must be a song in src/audio/songs.ts`);
}

/** v1.10 (4-3): a tunnel's params (PHASE8 第 8 部 §4.2). */
function checkTunnel(g: Record<string, unknown>, p: Record<string, unknown>, where: string): void {
  for (const k of ['near', 'far', 'lightFar', 'lightGlow']) if (p[k] !== undefined && !(isNumber(p[k]) && (p[k] as number) > 0)) fail(`${where}: "${k}" must be above 0`);
  if (p.dim !== undefined && !(isNumber(p.dim) && p.dim > 0 && p.dim <= 1)) fail(`${where}: "dim" must be above 0, at most 1`);
  if (p.fogColor !== undefined && !(typeof p.fogColor === 'string' && COLOR.test(p.fogColor))) fail(`${where}: "fogColor" must be #rrggbb`);
  if (p.portal !== undefined && typeof p.portal !== 'boolean') fail(`${where}: "portal" must be true or false`);
  // v1.11 (5-2): the dark toy box (a square box, its open lid at the mouth) instead of the icy tube.
  if (p.look !== undefined && p.look !== 'ice' && p.look !== 'toybox') fail(`${where}: "look" must be ice or toybox`);
  const h = p.hall;
  if (h !== undefined && h !== 'all') {
    if (!isObject(h) || !isNumber(h.from) || !isNumber(h.to) || h.from >= h.to) fail(`${where}: "hall" must be "all" or { from, to }`);
    const hall = h as { from: number; to: number };
    if (hall.from < (g.from as number) || hall.to > (g.to as number)) fail(`${where}: its hall must be inside it`);
  }
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
/** v1.11 (5-3): a letter sign's text: 1–8 kana (and the long-vowel mark), no spaces. */
const LETTER_SIGN_TEXT = /^[\u3041-\u3096\u30a1-\u30fa\u30fc]{1,8}$/u;

/** v1.10 (4-1): the params of ice, thin-ice, mirror and ice-sheet gimmicks (PHASE8 第 7 部 §4.6). */
function checkIceGimmick(g: Record<string, unknown>, p: Record<string, unknown>, where: string, railIds: Set<string>): void {
  const optText = (k: string): void => {
    if (p[k] !== undefined && p[k] !== null && !isString(p[k])) fail(`${where}: params.${k} must be text or null`);
  };
  const optBool = (k: string): void => {
    if (p[k] !== undefined && typeof p[k] !== 'boolean') fail(`${where}: params.${k} must be true or false`);
  };
  const optPositive = (k: string): void => {
    if (p[k] !== undefined && !(isNumber(p[k]) && (p[k] as number) > 0)) fail(`${where}: params.${k} must be > 0`);
  };
  if (g.type === 'ice') {
    if (p.grip !== undefined && !(isNumber(p.grip) && p.grip > 0 && p.grip <= 1)) fail(`${where}: params.grip must be above 0 and at most 1`);
    optText('line');
    optBool('sign');
  }
  if (g.type === 'thin-ice') {
    const from = g.from as number;
    const to = g.to as number;
    // A jump at びゅーん goes 35.2 m: it must not hop over the thin ice.
    if (to - from < 36) fail(`${where}: must be at least 36 m long (no jump gets over it)`);
    const fastest = Math.max(...LEVER_NOTCHES.map((n) => n.speed));
    const minSpeed = isNumber(p.minSpeed) ? p.minSpeed : THIN_ICE.minSpeed;
    if (!(minSpeed > fastest && minSpeed < ROCKET.speed)) fail(`${where}: params.minSpeed must be above the lever's fastest (${fastest}) and below the rocket's (${ROCKET.speed})`);
    if (p.grace !== undefined && !(isNumber(p.grace) && p.grace >= 0)) fail(`${where}: params.grace must be >= 0`);
    optPositive('warn');
    if (p.rewindAt !== undefined && !isNumber(p.rewindAt)) fail(`${where}: params.rewindAt must be a number`);
    optText('line');
    optBool('sign');
  }
  if (g.type === 'mirror') {
    if (!isVec3(p.position)) fail(`${where}: params.position must be [x, y, z]`);
    if (p.rotationY !== undefined && !isNumber(p.rotationY)) fail(`${where}: params.rotationY must be a number`);
    for (const k of ['width', 'height', 'range', 'flashRange', 'reflectRadius']) optPositive(k);
    if (p.railId !== undefined && !(isString(p.railId) && railIds.has(p.railId))) fail(`${where}: params.railId must be a known rail`);
    if (p.junction !== undefined && !isString(p.junction)) fail(`${where}: params.junction must be a junction id`);
    if (p.junction !== undefined && p.railId === undefined) fail(`${where}: a mirror at a junction needs params.railId (its false way)`);
    optBool('lightHint');
    if (p.reflect !== undefined && !(Array.isArray(p.reflect) && p.reflect.every((r) => r === 'train' || r === 'cutscene'))) {
      fail(`${where}: params.reflect must be a list of "train" and "cutscene"`);
    }
    // v1.11 (5-3): a name, the framed look, turned away.
    if (p.id !== undefined && !isString(p.id)) fail(`${where}: params.id must be text`);
    if (p.look !== undefined && p.look !== 'ice' && p.look !== 'frame') fail(`${where}: params.look must be "ice" or "frame"`);
    optBool('facing');
    if (p.turnFrom !== undefined && !(isNumber(p.turnFrom) && p.turnFrom >= 30 && p.turnFrom <= 180)) fail(`${where}: params.turnFrom must be 30–180 degrees`);
    if (p.back !== undefined && p.back !== 'swirl' && p.back !== 'plain') fail(`${where}: params.back must be "swirl" or "plain"`);
  }
  if (g.type === 'mirror-flip') {
    // v1.11 (5-3): "かがみの なか".
    if (!isString(g.railId) || !railIds.has(g.railId) || !isNumber(g.from) || !isNumber(g.to) || g.to <= g.from) fail(`${where}: needs a known railId, "from" and "to" after it`);
    if (!isString(p.id)) fail(`${where}: params.id is required (text)`);
    if (p.gate !== undefined && p.gate !== 'open' && p.gate !== 'whistle') fail(`${where}: params.gate must be "open" or "whistle"`);
    optText('line');
    optText('lineOut');
    optPositive('width');
    optPositive('height');
  }
  if (g.type === 'letter-sign') {
    // v1.11 (5-3): a board with kana on it (mirror-wise when params.mirror).
    if (!isString(p.text) || !LETTER_SIGN_TEXT.test(p.text)) fail(`${where}: params.text must be 1–8 hiragana or katakana (no spaces)`);
    optBool('mirror');
    if (!isObject(p.onRail) && !isVec3(p.position)) fail(`${where}: params needs onRail or position`);
    checkPlacement(p, where, railIds);
  }
  if (g.type === 'ice-sheet') {
    const outline = p.outline;
    if (!Array.isArray(outline) || outline.length < 3 || !outline.every((q) => Array.isArray(q) && q.length === 2 && q.every(isNumber))) {
      fail(`${where}: params.outline must be 3 or more [x, z] points`);
    }
    if (p.y !== undefined && !isNumber(p.y)) fail(`${where}: params.y must be a number`);
    if (p.color !== undefined && !(typeof p.color === 'string' && COLOR.test(p.color))) fail(`${where}: params.color must be #rrggbb`);
  }
}

/** v1.10: `environment.water` (PHASE8 part 2 §2.13). */
function checkWater(water: unknown): void {
  if (!Array.isArray(water)) fail('"environment.water" must be an array');
  water.forEach((w, i) => {
    const where = `environment.water[${i}]`;
    if (!isObject(w) || !isNumber(w.y) || !isNumber(w.floor)) fail(`${where}: needs "y" and "floor" numbers`);
    if (w.floor >= w.y) fail(`${where}: "floor" must be below "y"`);
    if (w.look !== undefined && !WATER_LOOKS.includes(w.look as WaterLook)) fail(`${where}: "look" must be one of ${WATER_LOOKS.join(', ')}`);
    const pair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(isNumber);
    const a = w.area;
    if (a !== undefined) {
      if (!isObject(a)) fail(`${where}: "area" must be { circle } or { rect }`);
      if ('circle' in a) {
        const c = a.circle;
        if (!isObject(c) || !pair(c.center) || !isNumber(c.radius) || c.radius <= 0) fail(`${where}: circle needs center [x, z] and radius > 0`);
      } else if ('rect' in a) {
        const r = a.rect;
        if (!isObject(r) || !pair(r.center) || !pair(r.size) || !(r.size as number[]).every((n) => n > 0)) fail(`${where}: rect needs center [x, z] and size [across, along] > 0`);
        if (r.rotationY !== undefined && !isNumber(r.rotationY)) fail(`${where}: rect rotationY must be a number`);
        if (r.corner !== undefined && !(isNumber(r.corner) && r.corner >= 0)) fail(`${where}: rect corner must be >= 0`);
      } else fail(`${where}: "area" must be { circle } or { rect }`);
    }
    if (w.holes !== undefined) {
      // v1.10 (4-1): open water in an ice-covered water.
      if (w.look !== 'ice') fail(`${where}: "holes" are for look "ice" only`);
      if (!Array.isArray(w.holes) || w.holes.length === 0) fail(`${where}: "holes" must be a non-empty list`);
      for (const h of w.holes as unknown[]) {
        if (!isObject(h)) fail(`${where}: a hole must be { center, radius } or { rect }`);
        if ('rect' in h) {
          const r = h.rect;
          if (!isObject(r) || !pair(r.center) || !pair(r.size) || !(r.size as number[]).every((n) => n > 0)) fail(`${where}: a rect hole needs center [x, z] and size [across, along] > 0`);
        } else if (!pair(h.center) || !isNumber(h.radius) || h.radius <= 0) fail(`${where}: a hole needs center [x, z] and radius > 0`);
      }
    }
    if (w.under !== undefined) {
      const u = w.under;
      if (!isObject(u)) fail(`${where}: "under" must be { color, far }`);
      if (u.color !== undefined && !(typeof u.color === 'string' && COLOR.test(u.color))) fail(`${where}: under.color must be #rrggbb`);
      if (u.far !== undefined && !(isNumber(u.far) && u.far > 0)) fail(`${where}: under.far must be > 0`);
      if (u.sparkle !== undefined && !(typeof u.sparkle === 'string' && COLOR.test(u.sparkle))) fail(`${where}: under.sparkle must be #rrggbb`);
    }
    if (w.wall !== undefined && w.wall !== 'bowl' && w.wall !== 'cliff') fail(`${where}: "wall" must be bowl or cliff`);
    if (w.flow !== undefined && !(pair(w.flow) && Math.hypot(...(w.flow as [number, number])) <= 3)) fail(`${where}: "flow" must be [x, z] m/s, at most 3`);
  });
}

/** v1.10 (3-2): a waterfall's params (PHASE8 第 4 部 §4.8): its lip on the edge of the water it falls into. */
function checkWaterfall(p: Record<string, unknown>, where: string, waters: Record<string, unknown>[]): void {
  const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(isNumber);
  if (!pair(p.from) || !pair(p.to)) fail(`${where}: params.from and params.to must be [x, z]`);
  if (!isNumber(p.top) || !isNumber(p.bottom) || p.top <= p.bottom) fail(`${where}: params.top must be above params.bottom`);
  if (p.throw !== undefined && !(isNumber(p.throw) && p.throw >= 0 && p.throw <= 20)) fail(`${where}: params.throw must be 0–20`);
  if (p.lip !== undefined && !(isNumber(p.lip) && p.lip >= 0 && p.lip <= 5)) fail(`${where}: params.lip must be 0–5`);
  if (p.rainbow !== undefined && typeof p.rainbow !== 'boolean') fail(`${where}: params.rainbow must be true or false`);
  // v1.11 (6-1): an upward fall (looks only).
  if (p.up !== undefined && typeof p.up !== 'boolean') fail(`${where}: params.up must be true or false`);
  const into = waters.find((w) => isNumber(w.y) && Math.abs((w.y as number) - (p.bottom as number)) <= 0.1);
  if (!into) fail(`${where}: params.bottom must be the height of a water (environment.water[].y)`);
  const from = p.from as [number, number];
  const to = p.to as [number, number];
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const area = into.area as WaterDef['area'];
  if (area && !(inArea(area, mid[0], mid[1], 5) && !inArea(area, mid[0], mid[1], -5))) fail(`${where}: its lip must be on the edge of the water it falls into (within 5 m)`);
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

/**
 * v1.7 checks that need the rails' lengths (called by the loader once the network is built, PHASE6 §5.6):
 * slopes sit well inside their rail, with no stop line, junction, merge or gap in them, and an uphill leaves room
 * to slow down before the next station; no rewind (slope, rock, gap) lands on a slope or in a rolling rock's path;
 * a countdown's `until` is on its rail.
 */
export function validateStageLayout(file: StageFile, network: RailNetwork): void {
  const slopes = slopeZones(file.gimmicks);
  const where = (i: number): string => `gimmicks[${i}] slope`;
  for (const z of slopes) {
    const rail = network.getRail(z.railId);
    // Room behind the foot for the default rewind (from − 60, which lands inside the rail for a slope 30 m or more
    // in) and the slip; a slope with its own rewind only needs the slip's room.
    const ownRewind = (file.gimmicks[z.index].params as Record<string, unknown> | undefined)?.rewind !== undefined;
    const minFrom = ownRewind ? SLOPE.slipBack + 2 : 30;
    if (z.from < minFrom) fail(`${where(z.index)}: must start at least ${minFrom} m after the start of rail "${z.railId}"`);
    if (z.to > rail.length - 10) fail(`${where(z.index)}: must end at least 10 m before the end of rail "${z.railId}"`);
    const inside = (at: number): boolean => at >= z.from && at <= z.to;
    for (const st of file.stations) if (st.railId === z.railId && inside(st.at)) fail(`${where(z.index)}: station "${st.id}" stops on it`);
    for (const j of file.junctions) if (j.railId === z.railId && inside(j.at)) fail(`${where(z.index)}: junction "${j.id}" is on it`);
    for (const r of file.rails) {
      if (r.end.type === 'merge' && r.end.railId === z.railId && r.id !== z.railId && inside(r.end.at)) fail(`${where(z.index)}: rail "${r.id}" merges on it`);
    }
    // The train slips back SLOPE.slipBack m: no gap just behind the foot either.
    for (const g of rail.gaps) {
      if (g.to >= z.from - SLOPE.slipBack - 2 && g.from <= z.to) fail(`${where(z.index)}: a gap (${g.from}–${g.to}) is on it`);
    }
    if (z.kind === 'up') {
      const next = file.stations.filter((st) => st.railId === z.railId && st.at > z.to).sort((a, b) => a.at - b.at)[0];
      if (next && next.at - z.to < ROCKET.stationQuiet) {
        fail(`${where(z.index)}: its top must be at least ${ROCKET.stationQuiet} m before station "${next.id}" (the rocket rests there)`);
      }
    }
  }

  const rolling = file.actors.filter((a) => a.type === 'rock-roll' && 'onRail' in a);
  const checkRewind = (target: { railId: string; at: number }, what: string, inRail = true): void => {
    const rail = network.rails.get(target.railId);
    if (!rail) fail(`${what}: rewind on unknown rail "${target.railId}"`);
    if (inRail && (target.at < 0 || target.at > rail.length)) fail(`${what}: rewind at=${target.at} is outside rail "${target.railId}"`);
    for (const z of slopes) {
      if (z.railId === target.railId && target.at >= z.from && target.at <= z.to) fail(`${what}: rewinds onto ${where(z.index)}`);
    }
    for (const a of rolling) {
      if (!('onRail' in a) || a.onRail.railId !== target.railId) continue;
      const start = Number((a.params as { startDistance?: number } | undefined)?.startDistance ?? ROCK_ROLL.startDistance);
      if (target.at >= a.onRail.at - start && target.at <= a.onRail.at) fail(`${what}: rewinds into the path of rolling rock "${a.id}"`);
    }
  };
  for (const z of slopes) if (z.kind === 'up') checkRewind(z.rewind, where(z.index));
  for (const a of file.actors) {
    if ((a.type !== 'rock-roll' && a.type !== 'rock-drop') || !('onRail' in a)) continue;
    const rw = (a.params as { rewind?: number | { railId: string; at: number } } | undefined)?.rewind;
    const target =
      typeof rw === 'number' ? { railId: a.onRail.railId, at: rw } : rw ?? { railId: a.onRail.railId, at: a.onRail.at - REWIND_DISTANCE };
    checkRewind(target, `actor "${a.id}"`);
  }
  for (const r of file.rails) {
    // (A default gap rewind before the rail start is clamped by the train, as it always was.)
    for (const g of r.gaps ?? []) checkRewind(g.rewind ?? { railId: r.id, at: g.from - REWIND_DISTANCE }, `rail "${r.id}" gap ${g.from}`, false);
  }

  // v1.8: a spur's way back is a place on a rail (not on a slope).
  for (const r of file.rails) if (r.spur) checkRewind(r.spur.back, `rail "${r.id}" spur back`);

  for (const z of rocketZones(file.gimmicks)) {
    if (z.to < z.from) fail(`gimmicks[${z.index}] rocket: "to" must be after "from"`);
  }
  for (const m of file.missions) {
    for (const st of m.steps) {
      const until = st.countdown?.until;
      if (!until) continue;
      const rail = network.getRail(until.railId);
      if (until.at < 0 || until.at > rail.length) fail(`mission "${m.id}" countdown: until at=${until.at} is outside rail "${until.railId}"`);
    }
  }
}

/**
 * v1.10 checks on the water stretches the loader worked out (Rail.surfaces / Rail.dives) and the loader's dive-fork
 * sides (PHASE8 part 2 §2.13, part 3 §4.9): floaters float over a surface stretch, a dive fork has exactly one side
 * going under water, dive records can be reached. (Since PHASE9_0 diving has its own button, so jumping near water is
 * fine.)
 */
export function validateWaterLayout(file: StageFile, network: RailNetwork): void {
  const waters = file.environment.water ?? [];
  // Dive forks: on a surface stretch, exactly one side going under water within DIVE.forkReach m (the loader set
  // it), deep enough to take the whole dive, and the surface side as the default.
  for (const j of file.junctions) {
    if (!j.dive) continue;
    const where = `junction "${j.id}"`;
    const rail = network.getRail(j.railId);
    if (!rail.surfaces.some((sp) => j.at >= sp.from && j.at <= sp.to)) fail(`${where}: a dive fork must be on a stretch on the water surface`);
    if (!j.diveSide) fail(`${where}: exactly one side must go under water within ${DIVE.forkReach} m of the fork`);
    if (j.default === j.diveSide) fail(`${where}: "default" must be the side that stays on the surface`);
    const deep = network.getRail(j[j.diveSide] as string);
    const from = deep.id === j.railId ? j.at : 0;
    const topY = rail.frameAt(j.at).position.y;
    const span = deep.dives.find((d) => d.to >= from && d.from <= from + DIVE.forkReach);
    let lowest = Infinity;
    if (span) for (let s = span.from; s <= span.to; s += 1) lowest = Math.min(lowest, deep.frameAt(s).position.y);
    if (topY - lowest < DIVE.depth) fail(`${where}: its dive side must go at least ${DIVE.depth} m below the fork`);
  }
  // Every under-water stretch goes deep enough for the whole train and its dome somewhere.
  for (const rail of network.rails.values()) {
    for (const d of rail.dives) {
      const water = waters[d.water];
      let lowest = Infinity;
      for (let s = d.from; s <= d.to; s += 1) lowest = Math.min(lowest, rail.frameAt(s).position.y);
      if (water.y - lowest < TRAIN.height + 0.9) fail(`rail "${rail.id}": the stretch under water at ${d.from.toFixed(0)}–${d.to.toFixed(0)} must reach ${TRAIN.height + 0.9} m below the surface`);
      // v1.10 (4-1): under an ice sheet only through one of its holes.
      for (const at of [d.from, d.to]) {
        const p = rail.frameAt(at).position;
        if (water.holes?.length && !openWaterAt(water, p.x, p.z, 3)) fail(`rail "${rail.id}": goes under the ice at ${at.toFixed(0)} outside its holes`);
      }
    }
  }
  // Floaters float over a surface stretch, 40 m or more apart on one rail, and send the train back to a place on
  // land or on the surface, before themselves.
  const floaters = file.floaters ?? [];
  for (const f of floaters) {
    const where = `floater "${f.id}"`;
    const rail = network.getRail(f.railId);
    const half = (f.length ?? FLOATER[f.look ?? 'log'].length) / 2;
    if (!rail.surfaces.some((sp) => f.at - half >= sp.from && f.at + half <= sp.to)) fail(`${where}: must float over a stretch on the water surface`);
    for (const o of floaters) {
      if (o !== f && o.railId === f.railId && Math.abs(o.at - f.at) < 40) fail(`floaters "${f.id}" and "${o.id}": must be 40 m apart`);
    }
    const rw = f.rewind;
    const target = typeof rw === 'object' ? rw : { railId: f.railId, at: rw ?? f.at - DIVE.rewindBefore };
    const back = network.rails.get(target.railId);
    if (!back || target.at < 0 || target.at > back.length) fail(`${where}: rewind at=${target.at} is outside rail "${target.railId}"`);
    if (back.dives.some((d) => target.at >= d.from && target.at <= d.to)) fail(`${where}: must not rewind under water`);
    if (target.railId === f.railId && target.at >= f.at - half) fail(`${where}: must rewind to before itself`);
  }
  // A dive record is within RECORD.distance of a water stretch (dived there, it is always found). Stages without
  // water yet (2-2, 2-3: their dive records come with their own water later) are left alone.
  for (const r of file.records) {
    if (r.requires !== 'dive' || waters.length === 0) continue;
    let ok = false;
    if ('onRail' in r) {
      const rail = network.getRail(r.onRail.railId);
      const at = r.onRail.at;
      ok = [...rail.surfaces, ...rail.dives].some((sp) => at >= sp.from - RECORD.distance && at <= sp.to + RECORD.distance);
    } else {
      const [x, , z] = r.position;
      for (const rail of network.rails.values()) {
        for (const sp of [...rail.surfaces, ...rail.dives]) {
          for (let s = sp.from; s <= sp.to && !ok; s += 2) {
            const p = rail.frameAt(s).position;
            ok = Math.hypot(p.x - x, p.z - z) <= RECORD.distance;
          }
        }
      }
    }
    if (!ok) fail(`record "${r.id}": a dive record must be within ${RECORD.distance} m of a stretch on or under water`);
  }
}

/**
 * v1.10 (4-1) checks on ice, thin ice and mirrors that need the rails (PHASE8 第 7 部 §4.6): ice stretches do not
 * overlap each other or a slope; thin ice has room around it (no stop line, junction, merge, gap or rocket rest from
 * 10 m before it to 35 m past it; the train's way back leaves room to speed up; the rocket does not rest while the
 * train crosses it); a mirror at a junction stands at the end of its false way.
 */
export function validateIceLayout(file: StageFile, network: RailNetwork): void {
  const ice = iceZones(file.gimmicks);
  const thin = thinIceZones(file.gimmicks);
  const slopes = slopeZones(file.gimmicks);
  const overlaps = (a: { railId: string; from: number; to: number }, b: { railId: string; from: number; to: number }): boolean =>
    a.railId === b.railId && a.from < b.to && b.from < a.to;
  for (const z of ice) {
    const where = `gimmicks[${z.index}] ice`;
    for (const o of ice) if (o !== z && overlaps(z, o)) fail(`${where}: overlaps gimmicks[${o.index}] ice`);
    for (const sl of slopes) if (overlaps(z, sl)) fail(`${where}: overlaps gimmicks[${sl.index}] slope (ice and slopes do not go together yet)`);
  }
  const rockets = rocketZones(file.gimmicks);
  for (const z of thin) {
    const where = `gimmicks[${z.index}] thin-ice`;
    const rail = network.getRail(z.railId);
    const lo = z.from - 10;
    const hi = z.to + 35;
    const inside = (at: number): boolean => at >= lo && at <= hi;
    for (const st of file.stations) if (st.railId === z.railId && inside(st.at)) fail(`${where}: station "${st.id}" stops too near it`);
    for (const j of file.junctions) if (j.railId === z.railId && inside(j.at)) fail(`${where}: junction "${j.id}" is too near it`);
    for (const r of file.rails) {
      if (r.end.type === 'merge' && r.end.railId === z.railId && r.id !== z.railId && inside(r.end.at)) fail(`${where}: rail "${r.id}" merges too near it`);
    }
    for (const g of rail.gaps) if (g.to >= lo && g.from <= hi) fail(`${where}: a gap (${g.from}–${g.to}) is too near it`);
    for (const r of rockets) if (!r.allow && r.railId === z.railId && r.from <= hi && r.to >= lo) fail(`${where}: the rocket rests near it (gimmicks[${r.index}])`);
    for (const o of thin) if (o !== z && overlaps(z, o)) fail(`${where}: overlaps gimmicks[${o.index}] thin-ice`);
    for (const sl of slopes) if (overlaps(z, sl)) fail(`${where}: overlaps gimmicks[${sl.index}] slope`);
    // The way back: on this rail, before it with room to speed up, not on thin ice or a slope.
    const back = z.rewind;
    if (back.at > z.from - 120) fail(`${where}: rewindAt (${back.at}) must be at least 120 m before it (room to speed up)`);
    if (back.at < 0 || back.at > rail.length) fail(`${where}: rewindAt (${back.at}) is outside rail "${z.railId}"`);
    for (const o of thin) if (o.railId === back.railId && back.at >= o.from && back.at <= o.to) fail(`${where}: rewinds onto gimmicks[${o.index}] thin-ice`);
    for (const sl of slopes) if (sl.railId === back.railId && back.at >= sl.from && back.at <= sl.to) fail(`${where}: rewinds onto gimmicks[${sl.index}] slope`);
    // The rocket must not start resting before the last bogie is across (the next station's quiet stretch).
    const next = file.stations.filter((st) => st.railId === z.railId && st.at > z.to).sort((a, b) => a.at - b.at)[0];
    if (next && z.to + 35 + STOP_RULE.zone > next.at - ROCKET.stationQuiet) {
      fail(`${where}: must end at least ${35 + STOP_RULE.zone + ROCKET.stationQuiet} m before station "${next.id}" (the rocket rests there)`);
    }
  }
  file.gimmicks.forEach((g, i) => {
    if (g.type !== 'mirror') return;
    const p = (g.params ?? {}) as Record<string, unknown>;
    if (p.junction === undefined) return;
    const where = `gimmicks[${i}] mirror`;
    const j = file.junctions.find((x) => x.id === p.junction);
    if (!j) fail(`${where}: unknown junction "${String(p.junction)}"`);
    if (!j.signReversed) fail(`${where}: junction "${j.id}" must have a reversed sign (signReversed)`);
    if (j[j.default] !== p.railId) fail(`${where}: junction "${j.id}"'s default way must be the mirror's rail "${String(p.railId)}"`);
    const def = file.rails.find((r) => r.id === p.railId);
    if (!def?.deadEnd) fail(`${where}: rail "${String(p.railId)}" must be a dead end`);
  });
}

/** Actors that stand or move on the track (and the snowmen of later stages): never near a snow wall. */
const ON_TRACK_ACTORS = ['cat', 'rock-drop', 'rock-roll', 'nut', 'squirrel', 'grasshopper', 'snowman'];

/**
 * v1.10 (4-2) checks on the snow walls (docs/PHASE8_CHAPTER3_4.md 第 6 部 §A8; PHASE9_0 §3 dropped the jump seat's
 * checks). Each wall's zone runs from PLOW.zoneBefore m before it to PLOW.zoneAfter m past its buried stretch: no
 * creature stands on the track there (the snowplow is never used on animals). A jump does not clear a wall, so no gap
 * lands within PLOW.zoneBefore m before it or lies in its stretch, and no jump pad is within PLOW.padBefore m before it;
 * thin ice, boughs and bridges keep out of its stretch. A wall's face is not on a downhill; an uphill in its stretch starts PLOW.slopeGap m or more
 * past it. A station stopping in or just past a stretch has its stop zone start PLOW.stationGap m or more past the
 * wall. A side way's wall stands PLOW.sideWayMin m or more along it; a junction that needs the snowplow has a wall
 * within 400 m of its side way. Before chapter 4 walls stand only on such side ways. A record needing the snowplow lies
 * within RECORD.distance of a buried stretch. A wall's way back is before it, on no slope, thin ice or water.
 */
export function validatePlowLayout(file: StageFile, network: RailNetwork): void {
  const spans = plowSpans(file.gimmicks);
  // (A stage without walls yet may already name a snowplow record: its wall comes with it later, as for dive records.)
  if (spans.length === 0) return;
  const slopes = slopeZones(file.gimmicks);
  const thin = thinIceZones(file.gimmicks);
  const sideOf = (railId: string) => file.junctions.find((j) => j.railId !== railId && (j.left === railId || j.right === railId));
  for (const sp of spans) {
    const where = `gimmicks[${sp.index}] plow-wall`;
    const rail = network.getRail(sp.railId);
    if (sp.to > rail.length) fail(`${where}: its stretch runs past the end of rail "${sp.railId}"`);
    const lo = sp.from - PLOW.zoneBefore;
    const hi = sp.to + PLOW.zoneAfter;
    const inZone = (a: number, b = a): boolean => b >= lo && a <= hi;
    for (const o of spans) {
      if (o !== sp && o.railId === sp.railId && o.from < sp.to && sp.from < o.to) fail(`${where}: its stretch overlaps gimmicks[${o.index}] plow-wall`);
    }
    for (const g of rail.gaps) if (g.to >= lo && g.from <= sp.to) fail(`${where}: a gap (${g.from}–${g.to}) is too near it (a jump does not clear a wall)`);
    file.gimmicks.forEach((g, i) => {
      if (g.railId !== sp.railId || g.from === undefined) return;
      if (g.type === 'jump-pad' && g.from >= sp.from - PLOW.padBefore && g.from <= sp.to) fail(`${where}: jump pad gimmicks[${i}] is within ${PLOW.padBefore} m before it`);
      if (['bough', 'flower-bridge', 'fragile', 'thin-ice'].includes(g.type) && (g.to ?? g.from) >= sp.from && g.from <= sp.to) fail(`${where}: gimmicks[${i}] ${g.type} is in its stretch`);
    });
    for (const a of file.actors) {
      if (!('onRail' in a) || a.onRail.railId !== sp.railId) continue;
      if ((ON_TRACK_ACTORS.includes(a.type) || a.type.startsWith('dino')) && inZone(a.onRail.at)) fail(`${where}: actor "${a.id}" is on the track near it (no snowplow near creatures)`);
    }
    for (const z of slopes) {
      if (z.railId !== sp.railId) continue;
      if (z.kind === 'down' && sp.from >= z.from && sp.from <= z.to) fail(`${where}: its face is on a downhill (gimmicks[${z.index}])`);
      if (z.kind === 'up' && z.from <= sp.to && z.to >= sp.from && z.from < sp.from + PLOW.slopeGap) fail(`${where}: the uphill gimmicks[${z.index}] must start ${PLOW.slopeGap} m or more past the wall`);
    }
    for (const st of file.stations) {
      if (st.railId !== sp.railId || st.at < sp.from || st.at > hi) continue;
      const zone = st.stop?.zone ?? STOP_RULE.zone;
      if (st.at - zone < sp.from + PLOW.stationGap) fail(`${where}: station "${st.id}"'s stop zone must start ${PLOW.stationGap} m or more past the wall`);
    }
    const j = sideOf(sp.railId);
    if (j && sp.from < PLOW.sideWayMin) fail(`${where}: on a side way it must stand ${PLOW.sideWayMin} m or more past junction "${j.id}"`);
    if (file.chapter < 4 && !(j && j.needs === 'plow')) fail(`${where}: before chapter 4 a snow wall stands only on a side way that needs the snowplow`);
    const back = network.rails.get(sp.rewind.railId);
    if (!back || sp.rewind.at < 0 || sp.rewind.at > back.length) fail(`${where}: rewind at=${sp.rewind.at} is outside rail "${sp.rewind.railId}"`);
    if (sp.rewind.railId === sp.railId && sp.rewind.at >= sp.from) fail(`${where}: must rewind to before the wall`);
    for (const z of slopes) if (z.railId === sp.rewind.railId && sp.rewind.at >= z.from && sp.rewind.at <= z.to) fail(`${where}: rewinds onto gimmicks[${z.index}] slope`);
    for (const z of thin) if (z.railId === sp.rewind.railId && sp.rewind.at >= z.from && sp.rewind.at <= z.to) fail(`${where}: rewinds onto gimmicks[${z.index}] thin-ice`);
    if ([...back.surfaces, ...back.dives].some((w) => sp.rewind.at >= w.from && sp.rewind.at <= w.to)) fail(`${where}: must not rewind onto water`);
  }
  for (const j of file.junctions) {
    if (j.needs !== 'plow') continue;
    const side = j[j.default === 'left' ? 'right' : 'left'] as string;
    if (!spans.some((sp) => sp.railId === side && sp.from <= 400)) fail(`junction "${j.id}": needs the snowplow, so its side way needs a snow wall within 400 m`);
  }
  for (const r of file.records) {
    if (r.requires !== 'plow') continue;
    let ok = false;
    if ('onRail' in r) {
      const at = r.onRail.at;
      ok = spans.some((sp) => sp.railId === r.onRail.railId && at >= sp.from - RECORD.distance && at <= sp.to + RECORD.distance);
    } else {
      const [x, , z] = r.position;
      for (const sp of spans) {
        const rail = network.getRail(sp.railId);
        for (let s = sp.from; s <= sp.to && !ok; s += 2) {
          const p = rail.frameAt(s).position;
          ok = Math.hypot(p.x - x, p.z - z) <= RECORD.distance;
        }
      }
    }
    if (!ok) fail(`record "${r.id}": a snowplow record must be within ${RECORD.distance} m of a buried stretch`);
  }
}

/**
 * v1.10 (4-3) checks that need the rails (PHASE8 第 8 部 §4.7): a snow wave's places are on its rail, its retry places
 * are not on a slope, and the station after it leaves 60 m to settle before its stop zone; a tunnel lies on its rail
 * with no stop line inside it.
 */
export function validateSnowLayout(file: StageFile, network: RailNetwork): void {
  const slopes = slopeZones(file.gimmicks);
  for (const m of file.missions) {
    for (const st of m.steps) {
      const c = st.chase;
      if (!c) continue;
      const where = `mission "${m.id}" chase`;
      const rail = network.getRail(c.railId);
      if (c.until.at > rail.length || c.from < 0) fail(`${where}: its places must be on rail "${c.railId}"`);
      for (const r of c.retry) {
        if (r < 0 || r > rail.length) fail(`${where}: retry ${r} is off rail "${c.railId}"`);
        for (const z of slopes) if (z.railId === c.railId && r >= z.from && r <= z.to) fail(`${where}: retry ${r} is on gimmicks[${z.index}] slope`);
      }
      const station = file.stations.find((x) => x.id === st.stationId);
      if (station && station.railId === c.railId) {
        const zone = station.stop?.zone ?? STOP_RULE.zone;
        if (station.at - zone - c.until.at < 60) fail(`${where}: "until" must be 60 m or more before station "${station.id}"'s stop zone`);
      }
    }
  }
  for (const z of tunnelZones(file.gimmicks)) {
    const where = `gimmicks[${z.index}] tunnel`;
    const rail = network.getRail(z.railId);
    if (z.to > rail.length) fail(`${where}: runs past the end of rail "${z.railId}"`);
    for (const st of file.stations) if (st.railId === z.railId && st.at >= z.from && st.at <= z.to) fail(`${where}: station "${st.id}" stops in it`);
  }
}

/**
 * v1.11 (5-1) checks that need the rails (PHASE9_CHAPTER5_6 第 4 部 §4.9). A hush stretch (from its moon mark,
 * `from − glowBefore − 20`, to its end) asks for the light off, so nothing there asks for it on: no fog or tunnel over it
 * (nor its way back, which lies before it), no reversed-sign, bubble or firefly fork in it or up to 80 m past it, no
 * mirror, flower bridge, light record, trace or reveal prop in it; no station stops, gap, jump pad, water, snow wall or
 * whistle-reversed stretch in it. A fawn that gazes at the light stands in a hush stretch, starts crossing inside it,
 * and with the light off is across before even the fastest train comes (startDistance − 22 × crossSeconds ≥
 * dangerDistance + 20). A hush record lies in a hush stretch. A whistle-reversed stretch (`from − 20` to `to + 10`) has
 * nothing that wants the whistle (a cat or a sleeping dinosaur on the rail, a jump pad, a grasshopper or squirrel or
 * whale, a firefly fork's calling reach), no station, water or hush stretch; its way back lies before it; its lure groups
 * stand in it, 40 m or more past its start. Firefly forks' calling reaches do not overlap.
 */
export function validateNightLayout(file: StageFile, network: RailNetwork): void {
  const hush = hushZones(file.gimmicks);
  const reversed = reversedZones(file.gimmicks);
  const forks = fireflyForks(file.junctions);
  const overlaps = (railA: string, a0: number, a1: number, railB: string, b0: number, b1: number): boolean => railA === railB && a0 <= b1 && b0 <= a1;
  const zonesOf = (type: string): { index: number; railId: string; from: number; to: number }[] =>
    file.gimmicks.flatMap((g, index) => (g.type === type && g.railId !== undefined && g.from !== undefined ? [{ index, railId: g.railId, from: g.from, to: g.to ?? g.from }] : []));
  const fogs = [...zonesOf('fog'), ...tunnelZones(file.gimmicks)];
  const plows = plowSpans(file.gimmicks);
  const stopZone = (st: StageFile['stations'][number]): [number, number] => [st.at - (st.stop?.zone ?? STOP_RULE.zone), st.at + 20];
  const at = (p: Placement): { railId: string; at: number } | null => ('onRail' in p ? p.onRail : null);
  const calling = forks.map((f) => ({ f, railId: f.railId, from: f.at - f.callFrom, to: f.at - f.callTo }));

  for (const z of hush) {
    const where = `gimmicks[${z.index}] hush "${z.id}"`;
    const rail = network.getRail(z.railId);
    if (z.to > rail.length) fail(`${where}: runs past the end of rail "${z.railId}"`);
    const lo = z.from - z.glowBefore - 20;
    const hi = z.to;
    const inIt = (railId: string, a: number, b = a): boolean => overlaps(railId, a, b, z.railId, lo, hi);
    for (const o of fogs) if (inIt(o.railId, o.from, o.to)) fail(`${where}: gimmicks[${o.index}] (a dark stretch) is over it (the light is wanted off here)`);
    const back = z.rewind;
    const backRail = network.rails.get(back.railId);
    if (!backRail || back.at < 0 || back.at > backRail.length) fail(`${where}: rewind at=${back.at} is outside rail "${back.railId}"`);
    if (back.railId === z.railId && back.at >= z.from) fail(`${where}: its rewind must lie before it`);
    for (const o of fogs) if (overlaps(back.railId, back.at, back.at, o.railId, o.from, o.to)) fail(`${where}: its rewind lies in a dark stretch (gimmicks[${o.index}])`);
    for (const j of file.junctions) {
      if ((j.signReversed || j.bubbles || j.fireflies) && overlaps(j.railId, j.at, j.at, z.railId, lo, hi + 80)) fail(`${where}: junction "${j.id}" (it wants the light or the whistle) is in it or within 80 m past it`);
    }
    file.gimmicks.forEach((g, i) => {
      if (g.railId === undefined || g.from === undefined) return;
      if (['flower-bridge', 'jump-pad', 'whistle-reversed'].includes(g.type) && inIt(g.railId, g.from, g.to ?? g.from)) fail(`${where}: gimmicks[${i}] ${g.type} is in it`);
    });
    file.gimmicks.forEach((g, i) => {
      const mp = g.params as { railId?: string } | undefined;
      if (g.type === 'mirror' && mp?.railId === z.railId) fail(`${where}: mirror gimmicks[${i}] stands on its rail`);
    });
    for (const r of file.records) {
      const p = at(r);
      if (r.requires === 'light' && p && inIt(p.railId, p.at)) fail(`${where}: record "${r.id}" needs the light in it`);
    }
    file.props.forEach((pr, i) => {
      const p = at(pr);
      if ((pr.trace || pr.reveal) && p && inIt(p.railId, p.at)) fail(`${where}: props[${i}] (a mark the light shows) is in it`);
    });
    for (const st of file.stations) {
      const [a, b] = stopZone(st);
      if (inIt(st.railId, a, b)) fail(`${where}: station "${st.id}" stops in it`);
    }
    for (const g of rail.gaps) if (inIt(z.railId, g.from, g.to)) fail(`${where}: a gap (${g.from}–${g.to}) is in it`);
    for (const w of [...rail.surfaces, ...rail.dives]) if (inIt(z.railId, w.from, w.to)) fail(`${where}: water (${w.from.toFixed(0)}–${w.to.toFixed(0)}) is in it`);
    for (const sp of plows) if (inIt(sp.railId, sp.from, sp.to)) fail(`${where}: snow wall gimmicks[${sp.index}] is in it`);
  }

  for (const a of file.actors) {
    if (a.type !== 'dino-small' || (a.params as { glare?: boolean } | undefined)?.glare !== true) continue;
    const where = `actor "${a.id}"`;
    const p = at(a);
    if (!p) fail(`${where}: a fawn is placed with onRail`);
    const z = hush.find((h) => h.railId === p.railId && p.at >= h.from && p.at + 10 <= h.to);
    if (!z) fail(`${where}: a fawn that gazes at the light stands in a hush stretch (at least 10 m before its end)`);
    const params = a.params as { startDistance?: number; crossSeconds?: number; dangerDistance?: number };
    const start = params.startDistance ?? 60;
    const cross = params.crossSeconds ?? 4;
    const danger = params.dangerDistance ?? 6;
    if (p.at - start < z.from) fail(`${where}: it starts crossing (at − startDistance = ${p.at - start}) before its hush stretch (${z.from})`);
    const fastest = Math.max(...LEVER_NOTCHES.map((n) => n.speed));
    if (start - fastest * cross < danger + 20) {
      fail(`${where}: with the light off it must be across before the fastest train comes (startDistance − ${fastest} × crossSeconds ≥ dangerDistance + 20)`);
    }
  }
  for (const r of file.records) {
    if (!r.hush) continue;
    const p = at(r);
    if (!p || !hush.some((z) => z.railId === p.railId && p.at >= z.from && p.at <= z.to)) fail(`record "${r.id}": a hush record lies in a hush stretch`);
  }

  for (const z of reversed) {
    const where = `gimmicks[${z.index}] whistle-reversed "${z.id}"`;
    const rail = network.getRail(z.railId);
    if (z.to > rail.length) fail(`${where}: runs past the end of rail "${z.railId}"`);
    const lo = z.from - 20;
    const hi = z.to + 10;
    const inIt = (railId: string, a: number, b = a): boolean => overlaps(railId, a, b, z.railId, lo, hi);
    for (const a of file.actors) {
      const p = at(a);
      if (!p) continue;
      const wants = ['cat', 'dino-mid', 'squirrel', 'whale'].includes(a.type) || (a.type === 'grasshopper' && a.reactsTo === 'whistle');
      if (wants && inIt(p.railId, p.at)) fail(`${where}: actor "${a.id}" (it wants the whistle) is in it`);
    }
    file.gimmicks.forEach((g, i) => {
      if (g.type === 'jump-pad' && g.railId !== undefined && g.from !== undefined && inIt(g.railId, g.from)) fail(`${where}: jump pad gimmicks[${i}] is in it`);
    });
    for (const c of calling) if (inIt(c.railId, c.from, c.to)) fail(`${where}: firefly fork "${c.f.id}"'s calling reach is in it`);
    for (const st of file.stations) if (inIt(st.railId, st.at)) fail(`${where}: station "${st.id}" stops in it`);
    for (const w of [...rail.surfaces, ...rail.dives]) if (inIt(z.railId, w.from, w.to)) fail(`${where}: water (${w.from.toFixed(0)}–${w.to.toFixed(0)}) is in it`);
    for (const h of hush) if (inIt(h.railId, h.from, h.to)) fail(`${where}: hush stretch "${h.id}" overlaps it`);
    const back = z.rewind;
    const backRail = network.rails.get(back.railId);
    if (!backRail || back.at < 0 || back.at > backRail.length) fail(`${where}: rewind at=${back.at} is outside rail "${back.railId}"`);
    if (back.railId === z.railId && back.at >= z.from) fail(`${where}: its rewind must lie before it`);
  }
  for (const a of file.actors) {
    if (a.type !== 'lure') continue;
    const p = at(a);
    if (!p || !reversed.some((z) => z.railId === p.railId && p.at >= z.from + 40 && p.at <= z.to)) {
      fail(`actor "${a.id}": a lure group stands in a whistle-reversed stretch, 40 m or more past its start`);
    }
  }
  for (const c of calling) {
    if (c.from < 0) fail(`junction "${c.f.id}": its fireflies' calling reach starts before its rail does`);
    for (const o of calling) if (o !== c && overlaps(c.railId, c.from, c.to, o.railId, o.from, o.to)) fail(`junctions "${c.f.id}" and "${o.f.id}": their fireflies' calling reaches overlap`);
  }
}

/**
 * v1.11 (5-2) checks that need the rails (PHASE9_CHAPTER5_6 第 5 部 §4.9). A walking toy's way (`at − max −
 * dangerDistance − 20` to `at`) has no gap, junction, merge, slope or station stop zone. The band's way (`back.min −
 * gap − 60` to `exit + 40`) has nothing that could make a fail while it leads the train (a gap, a jump pad, a slope, a
 * junction, a merge, a station stop zone, another thing on the track, water, a snow wall, a chased stretch); one band
 * a rail. A spinning fork has room (`at − 80` to `at + 70`: no gap, slope, other junction or station stop zone), its
 * loop merges back before it, and spinning forks on a rail are `range + 60` m apart. The whistle's windows (toys
 * `[at − max − wakeDistance, at − dangerDistance]`, toys within 12 m counted as one group; the band `[back.min −
 * callRange, at − 8]`; a spinning fork `[at − range, at − minGlow]`; jump pads, whales) do not overlap each other.
 */
export function validateToyLayout(file: StageFile, network: RailNetwork): void {
  const onRail = (p: Placement): { railId: string; at: number } | null => ('onRail' in p ? p.onRail : null);
  const stopZone = (st: StageFile['stations'][number]): [number, number] => [st.at - (st.stop?.zone ?? STOP_RULE.zone), st.at + 20];
  const slopes = slopeZones(file.gimmicks);
  const plows = plowSpans(file.gimmicks);
  const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 <= b1 && b0 <= a1;
  /** Everything on `railId` from `lo` to `hi` that could make the train fail or turn, as a list of what it is. */
  const clutter = (railId: string, lo: number, hi: number, opts: { ignoreJunction?: string; actorsBut?: string; plus?: boolean } = {}): string[] => {
    const out: string[] = [];
    const rail = network.getRail(railId);
    for (const g of rail.gaps) if (overlaps(g.from, g.to, lo, hi)) out.push(`a gap (${g.from}–${g.to})`);
    for (const z of slopes) if (z.railId === railId && overlaps(z.from, z.to, lo, hi)) out.push(`gimmicks[${z.index}] slope`);
    for (const j of file.junctions) if (j.railId === railId && j.id !== opts.ignoreJunction && j.at >= lo && j.at <= hi) out.push(`junction "${j.id}"`);
    for (const r of file.rails) if (r.end.type === 'merge' && r.end.railId === railId && r.id !== railId && r.end.at >= lo && r.end.at <= hi) out.push(`rail "${r.id}"'s merge`);
    for (const st of file.stations) {
      const [a, b] = stopZone(st);
      if (st.railId === railId && overlaps(a, b, lo, hi)) out.push(`station "${st.id}"'s stop`);
    }
    if (opts.plus) {
      file.gimmicks.forEach((g, i) => {
        if (g.type === 'jump-pad' && g.railId === railId && g.from !== undefined && g.from >= lo && g.from <= hi) out.push(`jump pad gimmicks[${i}]`);
      });
      for (const a of file.actors) {
        const p = onRail(a);
        if (!p || p.railId !== railId || a.id === opts.actorsBut) continue;
        if ((ON_TRACK_ACTORS.includes(a.type) || a.type.startsWith('dino') || a.type === 'parade' || a.type === 'lure') && p.at >= lo && p.at <= hi) out.push(`actor "${a.id}"`);
      }
      for (const w of [...rail.surfaces, ...rail.dives]) if (overlaps(w.from, w.to, lo, hi)) out.push(`water (${w.from.toFixed(0)}–${w.to.toFixed(0)})`);
      for (const sp of plows) if (sp.railId === railId && overlaps(sp.from, sp.to, lo, hi)) out.push(`snow wall gimmicks[${sp.index}]`);
      for (const m of file.missions) {
        for (const st of m.steps) {
          const c = st.chase;
          if (c && c.railId === railId && overlaps(c.from, c.until.at, lo, hi)) out.push(`mission "${m.id}"'s chase`);
        }
      }
    }
    return out;
  };

  // The whistle's windows (front positions on a rail where it glows for something), to be kept apart.
  const windows: { railId: string; from: number; to: number; what: string; group?: string }[] = [];

  for (const a of file.actors) {
    const p = onRail(a);
    if (!p) continue;
    const ap = (a.params ?? {}) as Record<string, unknown>;
    if (a.type === 'cat' && isObject(ap.walk)) {
      const w = ap.walk as { max: number };
      const danger = isNumber(ap.dangerDistance) ? ap.dangerDistance : 8;
      const lo = p.at - w.max - danger - 20;
      const found = clutter(p.railId, lo, p.at);
      if (found.length) fail(`actor "${a.id}": ${found[0]} is on its walk (${lo}–${p.at})`);
    }
    if (a.type === 'cat' && ap.glow === true && String(ap.look ?? '').startsWith('windup-')) {
      const wake = isNumber(ap.wakeDistance) ? ap.wakeDistance : 60;
      const danger = isNumber(ap.dangerDistance) ? ap.dangerDistance : 8;
      const max = isObject(ap.walk) && isNumber(ap.walk.max) ? ap.walk.max : 0;
      windows.push({ railId: p.railId, from: p.at - max - wake, to: p.at - danger, what: `actor "${a.id}"`, group: 'toy' });
    }
    if (a.type === 'parade') {
      const setup = paradeSetup(ap, p.at);
      if (file.actors.some((o) => o !== a && o.type === 'parade' && onRail(o)?.railId === p.railId)) fail(`actor "${a.id}": one band a rail`);
      const lo = setup.back.min - setup.gap - 60;
      const hi = setup.exit + 40;
      const rail = network.getRail(p.railId);
      if (lo < 0 || hi > rail.length) fail(`actor "${a.id}": its way (${lo}–${hi}) runs off rail "${p.railId}"`);
      const found = clutter(p.railId, lo, hi, { actorsBut: a.id, plus: true });
      if (found.length) fail(`actor "${a.id}": ${found[0]} is on the band's way (${lo}–${hi}; nothing may make a fail while it leads)`);
      windows.push({ railId: p.railId, from: setup.back.min - setup.callRange, to: p.at - PARADE.callMin, what: `actor "${a.id}"` });
    }
    if (a.type === 'whale') {
      windows.push({ railId: p.railId, from: p.at - (isNumber(ap.callRange) ? ap.callRange : 80), to: p.at, what: `actor "${a.id}"` });
    }
  }
  file.gimmicks.forEach((g, i) => {
    if (g.type !== 'jump-pad' || g.railId === undefined || g.from === undefined) return;
    const range = isNumber((g.params as Record<string, unknown> | undefined)?.range) ? ((g.params as Record<string, unknown>).range as number) : 60;
    windows.push({ railId: g.railId, from: g.from - range, to: g.from, what: `jump pad gimmicks[${i}]` });
  });

  const spins = file.junctions.filter((j) => j.spin);
  for (const j of spins) {
    const sp = j.spin!;
    const range = sp.range ?? SPIN.range;
    const lo = j.at - 80;
    const hi = j.at + 70;
    const found = clutter(j.railId, lo, hi, { ignoreJunction: j.id });
    // The loop's own merge lies in the room before the fork: that is how it comes back.
    const other = j[sp.good === 'left' ? 'right' : 'left'];
    const real = found.filter((f) => f !== `rail "${other}"'s merge`);
    if (real.length) fail(`junction "${j.id}": ${real[0]} is too near the spinning fork (${lo}–${hi})`);
    if (j.at - range < 0) fail(`junction "${j.id}": its range starts before its rail does`);
    for (const o of spins) {
      if (o !== j && o.railId === j.railId && Math.abs(o.at - j.at) < range + 60) fail(`junctions "${j.id}" and "${o.id}": spinning forks must be ${range + 60} m apart`);
    }
    windows.push({ railId: j.railId, from: j.at - range, to: j.at - SPIN.minGlow, what: `junction "${j.id}"` });
  }

  for (let x = 0; x < windows.length; x++) {
    for (let y = x + 1; y < windows.length; y++) {
      const a = windows[x];
      const b = windows[y];
      if (a.railId !== b.railId || !overlaps(a.from, a.to, b.from, b.to)) continue;
      // Toys within 12 m of each other are one group (one whistle winds them all).
      if (a.group === 'toy' && b.group === 'toy' && Math.abs(a.to - b.to) <= 12) continue;
      fail(`${a.what} and ${b.what}: the whistle's windows overlap (${a.from.toFixed(0)}–${a.to.toFixed(0)} and ${b.from.toFixed(0)}–${b.to.toFixed(0)})`);
    }
  }
}

// ---- v1.11 (PR5): the magnet light (PHASE9_CHAPTER5_6 第 2 部 M10) -------------------------------------------------

/** The shape of the magnet gimmicks, `environment.ironProps` and `props[].iron` (before the rails are built). */
function checkMagnetShapes(raw: Record<string, unknown>, railIds: Set<string>): void {
  const ids = new Set<string>();
  (raw.gimmicks as Record<string, unknown>[]).forEach((g, i) => {
    if (g.type !== 'magnet') return;
    const where = `gimmicks[${i}] magnet`;
    const p = (g.params ?? {}) as Record<string, unknown>;
    if (!isString(g.railId) || !railIds.has(g.railId) || !isNumber(g.from)) fail(`${where}: needs a known railId and "from"`);
    if (!isString(p.id)) fail(`${where}: params.id is required (text)`);
    if (p.id.startsWith('record:')) fail(`${where}: params.id must not start with "record:"`);
    if (ids.has(p.id)) fail(`${where}: params.id "${p.id}" is used twice`);
    ids.add(p.id);
    if (p.kind === 'lever') fail(`${where}: kind "lever" is a candidate for version 2 and cannot be used yet`);
    if (!MAGNET_KINDS.includes(p.kind as MagnetKind)) fail(`${where}: params.kind must be one of ${MAGNET_KINDS.join(', ')}`);
    const kind = p.kind as MagnetKind;
    if (p.look !== undefined && !MAGNET_LOOKS[kind].includes(p.look as MagnetLook)) fail(`${where}: params.look for kind "${kind}" must be one of ${MAGNET_LOOKS[kind].join(', ')}`);
    if (kind === 'bridge') {
      if (!isNumber(g.to)) fail(`${where}: a bridge needs "to" (the end of the gap)`);
      const length = (g.to as number) - (g.from as number);
      if (length < MAGNET.gapMin || length > MAGNET.gapMax) fail(`${where}: a bridge's gap must be ${MAGNET.gapMin}–${MAGNET.gapMax} m long (it is ${length} m)`);
      const piece = p.piece;
      if (!isObject(piece) || !isNumber(piece.lateral)) fail(`${where}: a bridge needs params.piece { lateral, height?, rotationY? } (where the loose piece lies)`);
      for (const k of ['height', 'rotationY']) if (piece[k] !== undefined && !isNumber(piece[k])) fail(`${where}: params.piece.${k} must be a number`);
    } else if (g.to !== undefined) fail(`${where}: a ${kind} takes no "to"`);
    for (const k of ['lateral', 'height']) if (p[k] !== undefined && !isNumber(p[k])) fail(`${where}: params.${k} must be a number`);
    if (Math.hypot(Number(p.lateral ?? 0), Number(p.height ?? 0)) > MAGNET.maxOffset) fail(`${where}: must be within ${MAGNET.maxOffset} m of its rail`);
    for (const k of ['line', 'done', 'miss']) if (p[k] !== undefined && p[k] !== null && !isString(p[k])) fail(`${where}: params.${k} must be text or null`);
    if (p.model !== undefined && (!isString(p.model) || !MODEL_NAME.test(p.model))) fail(`${where}: params.model must match [a-z0-9-]+`);
    const rw = p.rewind;
    if (rw !== undefined) {
      if (kind !== 'bridge' && kind !== 'gate') fail(`${where}: only a bridge or a gate takes params.rewind`);
      if (!(isObject(rw) && isString(rw.railId) && railIds.has(rw.railId) && isNumber(rw.at))) fail(`${where}: params.rewind needs a known railId and at`);
    }
    if (kind === 'turn') {
      if (!isString(p.junction)) fail(`${where}: a turn needs params.junction (the fork with a reversed sign it shows the way at)`);
      const j = (raw.junctions as Record<string, unknown>[]).find((x) => x.id === p.junction);
      if (!j || j.signReversed !== true) fail(`${where}: params.junction "${p.junction}" must be a junction with a reversed sign`);
      if (p.mirror !== undefined) {
        const mirror = (raw.gimmicks as Record<string, unknown>[]).some((x) => x.type === 'mirror' && isObject(x.params) && x.params.id === p.mirror);
        if (!isString(p.mirror) || !mirror) fail(`${where}: params.mirror must be the id of a mirror (gimmicks "mirror" params.id)`);
      }
    } else if (p.junction !== undefined || p.mirror !== undefined) fail(`${where}: only a turn takes params.junction and params.mirror`);
  });
  for (const j of raw.junctions as Record<string, unknown>[]) if (j.turn !== undefined) fail(`junction "${String(j.id)}": "turn" is set by the loader (write a magnet "turn" instead)`);
  for (const r of raw.records as Record<string, unknown>[]) {
    if (r.requires === 'magnetLight' && !isObject(r.onRail)) fail(`record "${String(r.id)}": a record needing the magnet light is placed with onRail (the magnet pulls it along its rail)`);
  }
  const env = raw.environment as Record<string, unknown>;
  const ip = env.ironProps;
  if (ip !== undefined && ip !== false) {
    if (!isObject(ip)) fail('"environment.ironProps" must be false or { every?, looks? }');
    if (ip.every !== undefined && !(isNumber(ip.every) && ip.every >= 80 && ip.every <= 400)) fail('"environment.ironProps.every" must be 80–400 m');
    if (ip.looks !== undefined && !(Array.isArray(ip.looks) && ip.looks.length > 0 && ip.looks.every((l) => IRON_LOOKS.includes(l as IronLook)))) {
      fail(`"environment.ironProps.looks" must list some of ${IRON_LOOKS.join(', ')}`);
    }
  }
  (raw.props as Record<string, unknown>[]).forEach((pr, i) => {
    if (pr.iron === undefined) return;
    if (!IRON_LOOKS.includes(pr.iron as IronLook)) fail(`props[${i}]: "iron" must be one of ${IRON_LOOKS.join(', ')}`);
    const on = pr.onRail as Record<string, unknown> | undefined;
    const lateral = Math.abs(Number(on?.lateral ?? 0));
    if (!isObject(on) || lateral < 2 || lateral > 12) fail(`props[${i}]: an "iron" prop stands on a rail (onRail), 2–12 m from it`);
  });
}

/**
 * Where the magnet targets may be (第 2 部 M10, with PHASE9 §0.9 の 4・6・10): apart from each other, gaps and gates
 * clear of everything else that asks something of the child, side-way ones well past their fork, a side way that needs
 * the magnet light with a target on it, before 5-3 the gaps, gates and mirrors only behind such a side way (the test
 * stages of chapter 0 excepted), the records' glow outside the stations' braking, the turn's fork after its pull and a
 * pull left after the dead end's rewind.
 */
export function validateMagnetLayout(file: StageFile, network: RailNetwork, magnets: MagnetTarget[]): void {
  const where = (t: MagnetTarget): string => (t.recordId ? `record "${t.recordId}"` : `gimmicks[${t.gimmick}] magnet "${t.id}"`);
  const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 <= b1 && b0 <= a1;
  const feeder = (railId: string) => file.junctions.find((j) => j.railId !== railId && (j.left === railId || j.right === railId));
  const stopLines = (railId: string) => file.stations.filter((st) => st.railId === railId);
  for (const t of magnets) {
    const rail = network.getRail(t.railId);
    if (t.at < 0 || t.end > rail.length) fail(`${where(t)}: must be on rail "${t.railId}"`);
    if (t.recordId) {
      const r = file.records.find((x) => x.id === t.recordId);
      if (!r || !('onRail' in r)) fail(`${where(t)}: a record needing the magnet light is placed with onRail`);
    }
    if (Math.hypot(t.offset.lateral, t.offset.height) > MAGNET.maxOffset) fail(`${where(t)}: must be within ${MAGNET.maxOffset} m of its rail`);
    const open = t.kind === 'bridge' || t.kind === 'gate';
    // Two targets on one rail: at least MAGNET.spacing m apart.
    for (const u of magnets) {
      if (u === t || u.railId !== t.railId || u.at < t.at) continue;
      if (u.at - t.end < MAGNET.spacing) fail(`${where(t)} and ${where(u)}: two iron targets must be at least ${MAGNET.spacing} m apart`);
    }
    // A side way's gap or gate: well past its fork.
    const fed = feeder(t.railId);
    if (open && fed && t.at < MAGNET.sideWayMin) fail(`${where(t)}: must be at least ${MAGNET.sideWayMin} m past the fork of its side way`);
    // The glow (hint) of a record outside the stations' braking: at least 30 m of it.
    if (t.recordId) {
      const from = t.at - MAGNET.hintAhead;
      const to = t.at - t.minAhead;
      let covered = 0;
      for (const st of stopLines(t.railId)) covered += Math.max(0, Math.min(to, st.at) - Math.max(from, st.at - MAGNET.stationQuiet));
      if (to - from - covered < 30 - 0.05) fail(`${where(t)}: at least 30 m of its glow must be outside a station's braking`);
    }
    if (open) {
      const z0 = t.at - MAGNET.zoneBefore;
      const z1 = t.end + MAGNET.zoneAfter;
      const inZone = (what: string, a: number, b = a): void => {
        if (overlaps(z0, z1, a, b)) fail(`${where(t)}: ${what} is in its stretch (${Math.round(z0)}–${Math.round(z1)})`);
      };
      for (const g of rail.gaps) inZone(`a gap (${g.from}–${g.to})`, g.from - 60, g.to);
      for (const w of [...rail.surfaces, ...rail.dives]) {
        inZone('the way into water', w.from - 120, w.from + 40);
        inZone('the way out of water', w.to - 120, w.to + 40);
      }
      for (const sp of rail.plows) inZone('a snow wall', sp.from, sp.to);
      for (const j of file.junctions) if (j.railId === t.railId) inZone(`junction "${j.id}"`, j.at);
      for (const g of file.gimmicks) {
        if (g.railId !== t.railId || g.from === undefined) continue;
        if (['jump-pad', 'updraft', 'bough', 'flower-bridge', 'fragile', 'thin-ice'].includes(g.type)) inZone(`a "${g.type}"`, g.from, g.to ?? g.from);
      }
      for (const a of file.actors) {
        if (!('onRail' in a) || a.onRail.railId !== t.railId) continue;
        if (['cat', 'dino-small', 'dino-mid', 'dino-large', 'rock-roll', 'rock-drop', 'squirrel', 'nut', 'grasshopper'].includes(a.type)) inZone(`actor "${a.id}"`, a.onRail.at);
      }
      for (const m of file.missions) {
        for (const st of m.steps) {
          const c = st.chase;
          if (c && c.railId === t.railId) inZone('the snow wave', c.from, c.until.railId === t.railId ? c.until.at : rail.length);
        }
      }
      for (const st of stopLines(t.railId)) {
        if (st.at >= t.at - 30 && st.at <= t.end + 20) fail(`${where(t)}: station "${st.id}" stops too close to it`);
      }
      for (const z of slopeZones(file.gimmicks)) {
        if (z.kind === 'down' && z.railId === t.railId && t.at >= z.from && t.at <= z.to) fail(`${where(t)}: its face must not be on a slide`);
      }
      // Its glow and its rewind clear of a station's braking and stop (the child is braking there).
      const rw = t.rewind as { railId: string; at: number };
      for (const st of file.stations) {
        const b0 = st.at - MAGNET.stationQuiet;
        const b1 = st.at + (st.stop?.ok ?? STOP_RULE.ok);
        if (st.railId === t.railId && overlaps(t.at - MAGNET.hintAhead, t.at, b0, b1)) fail(`${where(t)}: its glow overlaps station "${st.id}"'s braking`);
        if (st.railId === rw.railId && rw.at >= b0 && rw.at <= b1) fail(`${where(t)}: its rewind is in station "${st.id}"'s braking`);
      }
      // The rewind: on a rail, before the face (or on the rail its side way forks off, before the fork).
      const back = network.rails.get(rw.railId);
      if (!back || rw.at < 0 || rw.at > back.length) fail(`${where(t)}: its rewind is not on a rail`);
      const before = rw.railId === t.railId ? rw.at < t.at : fed !== undefined && rw.railId === fed.railId && rw.at < fed.at;
      if (!before) fail(`${where(t)}: its rewind must be before it (on its rail, or before its side way's fork)`);
      for (const z of slopeZones(file.gimmicks)) if (z.railId === rw.railId && rw.at >= z.from && rw.at <= z.to) fail(`${where(t)}: rewinds onto a slope`);
      for (const z of thinIceZones(file.gimmicks)) if (z.railId === rw.railId && rw.at >= z.from && rw.at <= z.to) fail(`${where(t)}: rewinds onto thin ice`);
      for (const w of [...back.surfaces, ...back.dives]) if (rw.at >= w.from && rw.at <= w.to) fail(`${where(t)}: rewinds onto water`);
      for (const sp of back.plows) if (rw.at >= sp.from && rw.at <= sp.to) fail(`${where(t)}: rewinds into snow`);
    }
    if (t.kind === 'turn') {
      const j = file.junctions.find((x) => x.id === t.junction);
      if (!j || j.railId !== t.railId) fail(`${where(t)}: its junction must be on its rail`);
      const pullEnd = t.at - t.minAhead;
      if (pullEnd > j.at - MAGNET.turnBefore) fail(`${where(t)}: its pull must end at least ${MAGNET.turnBefore} m before junction "${j.id}"`);
      const left = pullEnd - Math.max(j.at - REWIND_DISTANCE, t.at - MAGNET.reach);
      if (left < MAGNET.turnWindowAfterRewind) fail(`${where(t)}: after the dead end's rewind only ${Math.round(left)} m of its pull is left (at least ${MAGNET.turnWindowAfterRewind})`);
    }
  }
  // Behind a side way that needs the magnet light: a target (a gap, a gate, a mirror or a magnet record) within reach.
  const reachable = (railId: string, budget: number, seen = new Set<string>()): string[] => {
    if (budget <= 0 || seen.has(railId)) return [];
    seen.add(railId);
    const rail = network.getRail(railId);
    const out = [railId];
    for (const j of file.junctions) {
      if (j.railId !== railId || j.at > budget) continue;
      for (const to of [j.left, j.right]) if (to && to !== railId) out.push(...reachable(to, budget - j.at, seen));
    }
    if (rail.end.type === 'merge' && rail.length <= budget) out.push(...reachable(rail.end.railId, budget - rail.length, seen));
    return out;
  };
  const behindNeeds = new Set<string>();
  for (const j of file.junctions) {
    if (j.needs !== 'magnetLight') continue;
    const side = j.default === 'left' ? j.right : j.left;
    if (!side) continue;
    const rails = reachable(side, MAGNET.needsReach);
    for (const r of rails) behindNeeds.add(r);
    const found = magnets.some((t) => (t.kind !== 'pick' || t.recordId) && rails.includes(t.railId));
    if (!found) fail(`junction "${j.id}": its side way needs the magnet light, but has no gap, gate, mirror or magnet record within ${MAGNET.needsReach} m`);
  }
  // Before 5-3 (chapters 1–4, and 5-1 and 5-2), gaps, gates and mirrors only behind such a side way.
  const early = file.chapter > 0 && (file.chapter < 5 || (file.chapter === 5 && !file.unlocks.includes('magnetLight')));
  if (early) {
    const behind = (railId: string): boolean => {
      for (let r: string | undefined = railId, hop = 0; r && hop < 6; hop++) {
        if (behindNeeds.has(r)) return true;
        r = feeder(r)?.railId;
      }
      return false;
    };
    for (const t of magnets) if (t.kind !== 'pick' && !behind(t.railId)) fail(`${where(t)}: before 5-3 a ${t.kind} goes only behind a side way that needs the magnet light`);
  }
}

/**
 * v1.11 (5-3) checks that need the rails (PHASE9_CHAPTER5_6 第 6 部 §4.9): "かがみの なか" is 150–400 m, 200 m from the next
 * on its rail, and from 20 m before it to 60 m after it there is nothing to choose or fail at (forks, merges, station
 * stops, gaps and their take-off, jump pads, updrafts, slopes, ice, water, snow walls, floaters, animals on the rail,
 * the magnet's rails and doors, camera zones, mirrors, chases); no fail puts the train back inside one; a whistle gate
 * has nothing else that lights the whistle near it and comes 150 m or more after the station before it. A false
 * bridge has a mirror that shows its gap. Glass stays off gaps and platforms. A turned-away mirror has one magnet
 * "turn" target to turn it round. A letter sign stands on a rail.
 */
export function validateMirrorWorld(file: StageFile, network: RailNetwork): void {
  const flips = file.gimmicks.map((g, index) => ({ g, index })).filter(({ g }) => g.type === 'mirror-flip');
  const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 <= b1 && b0 <= a1;
  const stopZone = (st: StageFile['stations'][number]): [number, number] => [st.at - (st.stop?.zone ?? STOP_RULE.zone), st.at + (st.stop?.ok ?? STOP_RULE.ok)];
  const onRail = (p: Placement): { railId: string; at: number; lateral?: number } | null => ('onRail' in p ? p.onRail : null);
  /** The place along `railId` nearest a world point within `reach` m of it, or null. */
  const along = (railId: string, x: number, z: number, reach: number): number | null => {
    const rail = network.getRail(railId);
    let best: number | null = null;
    let bestD = reach;
    for (let s = 0; s <= rail.length; s += 2) {
      const q = rail.frameAt(s).position;
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };
  const mirrorParams = file.gimmicks.filter((g) => g.type === 'mirror').map((g) => (g.params ?? {}) as Record<string, unknown>);

  flips.forEach(({ g, index }) => {
    const where = `gimmicks[${index}] mirror-flip`;
    const railId = g.railId as string;
    const from = g.from as number;
    const to = g.to as number;
    const p = (g.params ?? {}) as Record<string, unknown>;
    const length = to - from;
    if (length < MIRROR_WORLD.flipMin || length > MIRROR_WORLD.flipMax) fail(`${where}: must be ${MIRROR_WORLD.flipMin}–${MIRROR_WORLD.flipMax} m long (it is ${length} m)`);
    if (flips.some((o) => o.index !== index && (o.g.params as Record<string, unknown> | undefined)?.id === p.id)) fail(`${where}: params.id "${String(p.id)}" is used twice`);
    for (const o of flips) {
      if (o.index <= index || o.g.railId !== railId) continue;
      const gapM = Math.max((o.g.from as number) - to, from - (o.g.to as number));
      if (gapM < MIRROR_WORLD.flipSpacing) fail(`${where}: must be ${MIRROR_WORLD.flipSpacing} m from gimmicks[${o.index}] mirror-flip (it is ${gapM} m)`);
    }
    const lo = from - MIRROR_WORLD.flipClearBefore;
    const hi = to + MIRROR_WORLD.flipClearAfter;
    const rail = network.getRail(railId);
    const found: string[] = [];
    for (const j of file.junctions) if (j.railId === railId && j.at >= lo && j.at <= hi) found.push(`junction "${j.id}"`);
    for (const r of file.rails) if (r.end.type === 'merge' && r.end.railId === railId && r.id !== railId && r.end.at >= lo && r.end.at <= hi) found.push(`rail "${r.id}"'s merge`);
    for (const st of file.stations) {
      const [a, b] = stopZone(st);
      if (st.railId === railId && overlaps(a, b, lo, hi)) found.push(`station "${st.id}"'s stop`);
    }
    for (const gp of rail.gaps) if (overlaps(gp.from - 60, gp.to, lo, hi)) found.push(`a gap (${gp.from}–${gp.to}) or its take-off`);
    for (const w of [...rail.surfaces, ...rail.dives]) if (overlaps(w.from, w.to, lo, hi)) found.push(`water (${w.from.toFixed(0)}–${w.to.toFixed(0)})`);
    for (const sp of rail.plows) if (overlaps(sp.from, sp.to, lo, hi)) found.push(`a snow wall (gimmicks[${sp.index}])`);
    for (const f of file.floaters ?? []) if (f.railId === railId && f.at >= lo && f.at <= hi) found.push(`floater "${f.id}"`);
    file.gimmicks.forEach((o, i) => {
      if (i === index || o.railId !== railId || o.from === undefined) return;
      const oTo = o.to ?? o.from;
      const kind = (o.params as Record<string, unknown> | undefined)?.kind;
      const zoned = ['jump-pad', 'updraft', 'slope', 'ice', 'thin-ice', 'camera', 'bough', 'fragile', 'flower-bridge', 'plow-wall'];
      // The magnet light's rail pieces and doors (PR5) are fails; its stars (pick) may be inside.
      if (zoned.includes(o.type) || (o.type === 'magnet' && kind !== 'pick')) {
        if (overlaps(o.from, oTo, lo, hi)) found.push(`gimmicks[${i}] ${o.type}`);
      }
    });
    for (const a of file.actors) {
      const q = onRail(a);
      if (!q || q.railId !== railId || q.at < lo || q.at > hi) continue;
      if (Math.abs(q.lateral ?? 0) < 4 || ON_TRACK_ACTORS.includes(a.type) || a.type.startsWith('dino') || a.type === 'parade' || a.type === 'lure') found.push(`actor "${a.id}"`);
    }
    for (const m of mirrorParams) {
      const pos = m.position as number[] | undefined;
      if (!pos) continue;
      const s = along(railId, pos[0], pos[2], 40);
      if (s !== null && s >= lo && s <= hi) found.push(`mirror "${String(m.id ?? '')}"`);
    }
    for (const m of file.missions) {
      for (const st of m.steps) {
        const c = st.chase;
        if (c && c.railId === railId && overlaps(c.from, c.until.at, lo, hi)) found.push(`mission "${m.id}"'s chase`);
      }
    }
    if (found.length) fail(`${where}: ${found[0]} is in it or too near (${lo}–${hi}: nothing to choose or fail at in the mirror world)`);

    // No fail puts the train back inside (it would come back mirrored).
    const inside = (r: { railId: string; at: number } | undefined | null): boolean => !!r && r.railId === railId && r.at > from && r.at < to;
    const backs: [string, { railId: string; at: number } | null][] = [];
    for (const r of file.rails) {
      for (const gp of r.gaps ?? []) backs.push([`rail "${r.id}"'s gap (${gp.from}–${gp.to})`, gp.rewind ?? { railId: r.id, at: gp.from - REWIND_DISTANCE }]);
    }
    for (const j of file.junctions) {
      for (const side of ['left', 'right'] as const) {
        const way = file.rails.find((r) => r.id === j[side]);
        if (way?.deadEnd) backs.push([`junction "${j.id}"'s dead end`, { railId: j.railId, at: j.at - REWIND_DISTANCE }]);
      }
    }
    for (const st of file.stations) backs.push([`station "${st.id}"`, { railId: st.railId, at: st.at - REWIND_DISTANCE }]);
    for (const a of file.actors) {
      const q = onRail(a);
      if (q) backs.push([`actor "${a.id}"`, { railId: q.railId, at: q.at - REWIND_DISTANCE }]);
    }
    file.gimmicks.forEach((o, i) => {
      const op = (o.params ?? {}) as Record<string, unknown>;
      const rw = op.rewind;
      if (isObject(rw) && isString(rw.railId) && isNumber(rw.at)) backs.push([`gimmicks[${i}] ${o.type}`, { railId: rw.railId, at: rw.at }]);
      if (isNumber(op.rewindAt) && o.railId) backs.push([`gimmicks[${i}] ${o.type}`, { railId: o.railId, at: op.rewindAt }]);
    });
    for (const [what, r] of backs) if (inside(r)) fail(`${where}: ${what} puts the train back inside it (at ${r?.at})`);

    if (p.gate === 'whistle') {
      // Only the gate lights the whistle near it.
      const wlo = from - 120;
      const whi = from + 10;
      const lit: string[] = [];
      for (const a of file.actors) {
        const q = onRail(a);
        if (q && q.railId === railId && a.reactsTo === 'whistle' && q.at >= wlo && q.at <= whi) lit.push(`actor "${a.id}"`);
      }
      file.gimmicks.forEach((o, i) => {
        if (o.railId !== railId || o.from === undefined) return;
        if ((o.type === 'jump-pad' || o.type === 'whistle-reversed') && overlaps(o.from, o.to ?? o.from, wlo, whi)) lit.push(`gimmicks[${i}] ${o.type}`);
      });
      for (const j of file.junctions) if (j.railId === railId && (j.fireflies || j.spin) && j.at >= wlo && j.at <= whi + 80) lit.push(`junction "${j.id}"`);
      if (lit.length) fail(`${where}: ${lit[0]} also lights the whistle near the gate (${wlo}–${whi})`);
      const before = file.stations.filter((st) => st.railId === railId && st.at < from).sort((a, b) => b.at - a.at)[0];
      if (before && from - before.at < 150) fail(`${where}: a whistle gate comes 150 m or more after station "${before.id}" (it is ${from - before.at} m)`);
    }
  });

  // A false bridge: a mirror that shows its gap (within its reflectRadius, the gap's run-up in front of it).
  for (const r of file.rails) {
    for (const gp of r.gaps ?? []) {
      if (!gp.phantom) continue;
      const rail = network.getRail(r.id);
      const mid = rail.frameAt((gp.from + gp.to) / 2).position;
      const runUp = rail.frameAt(Math.max(0, gp.from - 60)).position;
      const shows = mirrorDefs(file.gimmicks).some(
        (m) => m.facing && Math.hypot(mid.x - m.position.x, mid.z - m.position.z) <= m.reflectRadius && inFront(m, mid) > 0 && inFront(m, runUp) > 0,
      );
      if (!shows) fail(`rail "${r.id}": the phantom gap ${gp.from}–${gp.to} needs a mirror that shows it (within its reflectRadius, facing the way in)`);
    }
  }

  // Glass: on the rail, off gaps and platforms.
  for (const r of file.rails) {
    if (!r.glass) continue;
    const rail = network.getRail(r.id);
    for (const k of r.glass) {
      if (k.from < 0 || k.to > rail.length + 1e-6) fail(`rail "${r.id}": glass ${k.from}–${k.to} runs off the rail (length ${rail.length.toFixed(1)} m)`);
      for (const gp of rail.gaps) if (overlaps(k.from, k.to, gp.from, gp.to)) fail(`rail "${r.id}": glass ${k.from}–${k.to} is over a gap`);
      for (const st of file.stations) {
        if (st.railId === r.id && overlaps(k.from, k.to, st.at - 45, st.at + 10)) fail(`rail "${r.id}": glass ${k.from}–${k.to} is at station "${st.id}"'s platform`);
      }
    }
  }

  // A turned-away mirror is turned round by one magnet "turn" target (the magnet light, PR5/PR6b).
  for (const m of mirrorParams) {
    if (m.facing !== false) continue;
    const id = String(m.id ?? '');
    if (!isString(m.id)) fail('a mirror with "facing": false needs params.id (the magnet "turn" target names it)');
    const turners = file.gimmicks.filter((g) => g.type === 'magnet' && (g.params as Record<string, unknown> | undefined)?.kind === 'turn' && (g.params as Record<string, unknown> | undefined)?.mirror === id);
    if (turners.length !== 1) fail(`mirror "${id}": a turned-away mirror needs exactly one magnet "turn" target naming it (it has ${turners.length})`);
  }
  // …and a magnet "turn" target naming a mirror turns a turned-away one (one already facing has nothing to turn).
  for (const g of file.gimmicks) {
    const p = (g.params ?? {}) as Record<string, unknown>;
    if (g.type !== 'magnet' || p.kind !== 'turn' || p.mirror === undefined) continue;
    const m = mirrorParams.find((x) => x.id === p.mirror);
    if (m && m.facing !== false) fail(`magnet "${String(p.id)}": params.mirror "${String(p.mirror)}" must be a mirror with "facing": false`);
  }

  // A letter sign stands on a rail that is there.
  file.gimmicks.forEach((g, i) => {
    if (g.type !== 'letter-sign') return;
    const q = onRail((g.params ?? {}) as unknown as Placement);
    if (!q) return;
    const rail = network.getRail(q.railId);
    if (q.at < 0 || q.at > rail.length) fail(`gimmicks[${i}] letter-sign: at=${q.at} is outside rail "${q.railId}"`);
  });
}
