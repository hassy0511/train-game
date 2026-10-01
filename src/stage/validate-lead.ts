import { SONGS } from '../audio/songs';
import { traceLeadPath } from '../mission/lead-path';
import { welcomeDoor } from '../mission/welcome';
import type { RailNetwork } from '../rail/types';
import { BUFFER_MARGIN, LEAD, WELCOME } from '../train/params';
import { BUBBLE_ICONS, WELCOME_BEATS, type CutsceneStep, type MagnetTarget, type StageFile } from './types';

/**
 * v1.11 (6-1, PHASE9_CHAPTER5_6 第 7 部 §4.9): the checks of "おいかけっこ" (`steps[].lead`), "ドアを あけて まつ"
 * (`steps[].welcome`), the missions' own junction rules (`missions[].junctions`), the cutscene steps `crew` and `depart`,
 * `junctions[].glow`, `environment.landmark` and the bubble pictures. The shapes are checked with the rest of the file
 * (checkLeadShapes, from validateStageFile), the ways along the rails once the network is built (validateLeadLayout).
 */

class LeadValidationError extends Error {
  constructor(message: string) {
    super(`Stage JSON invalid: ${message}`);
    this.name = 'StageValidationError';
  }
}

function fail(message: string): never {
  throw new LeadValidationError(message);
}

const MODEL_NAME = /^[a-z0-9-]+$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isVec3 = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every(isNumber);
const inRange = (v: unknown, lo: number, hi: number): boolean => isNumber(v) && v >= lo && v <= hi;
const onRailOk = (r: unknown, railIds: Set<string>): r is { railId: string; at: number; lateral?: number } =>
  isObject(r) && isString(r.railId) && railIds.has(r.railId) && isNumber(r.at) && (r.lateral === undefined || isNumber(r.lateral));

/** A cutscene step's bubble picture (`say` with `icon`). */
export function checkBubbleIcon(icon: unknown, where: string): void {
  if (icon !== undefined && !BUBBLE_ICONS.includes(icon as never)) fail(`${where}: "icon" must be one of ${BUBBLE_ICONS.join(', ')}`);
}

/** v1.11 (6-1): a cutscene step `crew` or `depart` (the where-it-may-be rules are in validateLeadLayout). */
export function checkCrewDepartStep(st: Record<string, unknown>, where: string): void {
  if ('crew' in st) {
    const c = st.crew;
    if (!Array.isArray(c) || c.length !== 1 || c[0] !== 'sakasa') fail(`${where}: "crew" must be ["sakasa"]`);
    return;
  }
  const d = st.depart;
  if (!isObject(d) || !isNumber(d.to)) fail(`${where}: "depart" needs "to" (m on the rail the train stands on)`);
  if (!inRange(d.seconds, 2, 10)) fail(`${where}: "depart.seconds" must be 2–10`);
}

/** v1.11 (6-1): `environment.landmark` (also in a cutscene's look change). */
export function checkLandmark(v: unknown, where: string, fogFar: number | null): void {
  if (v === undefined) return;
  if (!isObject(v) || !isString(v.model) || !MODEL_NAME.test(v.model)) fail(`${where}: "landmark.model" must match [a-z0-9-]+`);
  if (!isVec3(v.position)) fail(`${where}: "landmark.position" must be [x, y, z]`);
  if (!isNumber(v.height) || v.height <= 0) fail(`${where}: "landmark.height" must be > 0`);
  const near = v.near ?? LEAD_LANDMARK_NEAR;
  if (!isNumber(near) || near <= 0) fail(`${where}: "landmark.near" must be > 0`);
  if (fogFar !== null && near >= fogFar) fail(`${where}: "landmark.near" must be nearer than the fog's far (${fogFar} m)`);
}
const LEAD_LANDMARK_NEAR = 600;

/**
 * The shapes (called with the raw file, once the rails, stations, junctions and cutscenes are known to be there):
 * `steps[].lead`, `steps[].welcome`, `missions[].junctions`, `junctions[].glow`.
 */
export function checkLeadShapes(raw: Record<string, unknown>): void {
  const railIds = new Set((raw.rails as Record<string, unknown>[]).map((r) => String(r.id)));
  const junctions = raw.junctions as Record<string, unknown>[];
  for (const j of junctions) {
    if (j.glow === undefined) continue;
    // PHASE9 第 3 部 A13: a back junction's own `glow` ("auto" | boolean) is checked with the back junctions (PR8a).
    if (j.back === true) continue;
    if (typeof j.glow !== 'boolean' || j.signReversed !== true) fail(`junction "${String(j.id)}": "glow" (true or false) is for a reversed sign ("signReversed": true) only`);
  }
  for (const m of raw.missions as Record<string, unknown>[]) {
    const mid = String(m.id);
    if (m.junctions !== undefined) {
      if (!isObject(m.junctions)) fail(`mission "${mid}": "junctions" must be an object (by junction id)`);
      for (const [id, rule] of Object.entries(m.junctions)) {
        const j = junctions.find((x) => x.id === id);
        const where = `mission "${mid}" junctions "${id}"`;
        if (!j) fail(`${where}: no such junction`);
        if (!isObject(rule) || (rule.lock === undefined) === (rule.default === undefined)) fail(`${where}: write exactly one of "lock" or "default"`);
        const side = rule.lock ?? rule.default;
        if (side !== 'left' && side !== 'right') fail(`${where}: the side must be "left" or "right"`);
        if (j[side] === undefined) fail(`${where}: the ${side} side has no rail`);
        if (rule.lock !== undefined && (j.signReversed === true || j.fireflies !== undefined || j.spin !== undefined || j.dive === true || j.needs !== undefined)) {
          fail(`${where}: "lock" is not for a reversed sign, a firefly, spinning or dive fork, or one that needs an ability`);
        }
      }
    }
    for (const st of m.steps as Record<string, unknown>[]) {
      if (st.lead !== undefined) checkLead(st.lead, `mission "${mid}" lead`, railIds, raw);
      if (st.welcome !== undefined) checkWelcome(st.welcome, `mission "${mid}" welcome`, railIds);
      if (st.lead !== undefined && (st.chase !== undefined || st.countdown !== undefined)) fail(`mission "${mid}": a step has a lead or a chase or a countdown, not two`);
      if (st.welcome !== undefined && (st.board !== undefined || st.alight !== undefined || st.parcel !== undefined)) {
        fail(`mission "${mid}": a step with "welcome" takes no board, alight or parcel (the guest boards by herself)`);
      }
    }
  }
}

function checkLead(v: unknown, where: string, railIds: Set<string>, raw: Record<string, unknown>): void {
  if (!isObject(v) || !isString(v.id)) fail(`${where}: needs an "id" (the figure's name)`);
  if (!isString(v.railId) || !railIds.has(v.railId) || !isNumber(v.from)) fail(`${where}: needs a known "railId" and "from"`);
  if (v.model !== undefined && (!isString(v.model) || !MODEL_NAME.test(v.model))) fail(`${where}: "model" must match [a-z0-9-]+`);
  const keep = v.keep ?? LEAD.keep;
  const min = v.min ?? LEAD.min;
  const dash = v.dash ?? LEAD.dash;
  if (!isNumber(keep) || !isNumber(min) || !isNumber(dash) || !(min < keep && keep < dash && dash <= 120)) fail(`${where}: needs min < keep < dash <= 120`);
  const calls = v.calls ?? 2;
  if (!Number.isInteger(calls) || (calls as number) < 1 || (calls as number) > 3) fail(`${where}: "calls" must be 1, 2 or 3`);
  const lateral = v.lateral ?? LEAD.lateral;
  if (!isNumber(lateral) || Math.abs(lateral) < 4 || Math.abs(lateral) > 10) fail(`${where}: "lateral" must be 4–10 m either side`);
  if (v.music !== undefined && (!isString(v.music) || !(v.music in SONGS))) fail(`${where}: "music" must be a song in src/audio/songs.ts`);
  if (v.followCamera !== undefined && v.followCamera !== 'front' && v.followCamera !== 'rear') fail(`${where}: "followCamera" must be "front" or "rear"`);
  if (v.closeStation !== undefined && typeof v.closeStation !== 'boolean') fail(`${where}: "closeStation" must be true or false`);
  for (const [k, lo, hi] of [
    ['autoCallAfter', 3, 60],
    ['remindEvery', 3, 30],
    ['autoFollowAfter', 5, 90],
    ['followBack', 5, 60],
  ] as const) {
    if (v[k] !== undefined && !inRange(v[k], lo, hi)) fail(`${where}: "${k}" must be ${lo}–${hi}`);
  }
  if (v.learn !== undefined) {
    const cutscenes = (raw.cutscenes ?? {}) as Record<string, unknown>;
    if (!isString(v.learn) || !(v.learn in cutscenes)) fail(`${where}: "learn" must name a cutscene`);
  }
  if (v.home !== undefined) {
    const h = v.home;
    if (!onRailOk(h, railIds)) fail(`${where}: "home" needs a known railId and at`);
    const hh = h as Record<string, unknown>;
    if (hh.model !== undefined && (!isString(hh.model) || !MODEL_NAME.test(hh.model))) fail(`${where}: "home.model" must match [a-z0-9-]+`);
    if (hh.rotationY !== undefined && !isNumber(hh.rotationY)) fail(`${where}: "home.rotationY" must be a number`);
    if (hh.heightFromRail !== undefined && !isNumber(hh.heightFromRail)) fail(`${where}: "home.heightFromRail" must be a number`);
  }
}

function checkWelcome(v: unknown, where: string, railIds: Set<string>): void {
  if (!isObject(v) || !isString(v.actor)) fail(`${where}: needs "actor" (the guest's figure id)`);
  if (v.model !== undefined && (!isString(v.model) || !MODEL_NAME.test(v.model))) fail(`${where}: "model" must match [a-z0-9-]+`);
  if (v.pickup !== undefined && !isString(v.pickup)) fail(`${where}: "pickup" must be a figure id`);
  if (!onRailOk(v.seat, railIds) || !isNumber((v.seat as Record<string, unknown>).lateral)) fail(`${where}: "seat" needs railId, at and lateral`);
  if (v.door !== undefined && (!onRailOk(v.door, railIds) || !isNumber((v.door as Record<string, unknown>).lateral))) fail(`${where}: "door" needs railId, at and lateral`);
  if (v.beats !== undefined) {
    const beats = v.beats;
    if (!Array.isArray(beats) || beats.length !== WELCOME_BEATS.length || beats.some((b, i) => !isObject(b) || b.beat !== WELCOME_BEATS[i])) {
      fail(`${where}: "beats" must be the five beats in order: ${WELCOME_BEATS.join(', ')}`);
    }
    for (const b of beats as Record<string, unknown>[]) if (!inRange(b.seconds, 0.5, 6)) fail(`${where}: beat "${String(b.beat)}" must last 0.5–6 s`);
  }
  if (v.flinchPause !== undefined && !inRange(v.flinchPause, 1, 5)) fail(`${where}: "flinchPause" must be 1–5`);
  if (v.maxFlinches !== undefined && !(Number.isInteger(v.maxFlinches) && inRange(v.maxFlinches, 0, 3))) fail(`${where}: "maxFlinches" must be 0–3`);
  const total = ((v.beats as { seconds: number }[] | undefined) ?? WELCOME_BEATS.map((b) => ({ seconds: WELCOME.beats[b] }))).reduce((a, b) => a + b.seconds, 0);
  if (v.boardBy !== undefined && !inRange(v.boardBy, total + 5, 60)) fail(`${where}: "boardBy" must be ${(total + 5).toFixed(1)}–60 s (the beats and 5 s more)`);
  if (v.musicGain !== undefined && !inRange(v.musicGain, 0, 1)) fail(`${where}: "musicGain" must be 0–1`);
  if (v.music !== undefined) fail(`${where}: "music" is "musicGain" (the music's loudness while waiting)`);
  if (v.camera !== undefined) {
    const c = v.camera;
    if (!isObject(c) || !isVec3(c.at) || !isVec3(c.lookAt)) fail(`${where}: "camera" needs "at" and "lookAt" [x, y, z]`);
    if (c.reach !== undefined && !inRange(c.reach, 1, 4)) fail(`${where}: "camera.reach" must be 1–4`);
  }
}

/** A stretch on the rails (m) and what is there, for the lead path's checks. */
interface Span {
  railId: string;
  from: number;
  to: number;
  what: string;
}

/**
 * The ways (with the rail network): a lead's path is a ring back to its `from` (within LEAD.maxPath m) with its step's
 * station on it (the platform on the other side from her), long enough before the station to stop for "ぎゃくだ！",
 * clear of anything that asks for a button or can go wrong (gaps, jump pads, water, snow walls, magnet gaps and gates,
 * slopes, ice, floaters, figures on the rail, the night's stretches, back junctions), and its junctions locked by the
 * mission or going the ring's way; its learn cutscene opens no doors, rolls no train and seats no friends. A welcome's
 * seat and door are on its station's platform. `crew` and `depart` only where they may be.
 */
export function validateLeadLayout(file: StageFile, network: RailNetwork, magnets: readonly MagnetTarget[]): void {
  const cutscenes = file.cutscenes ?? {};
  const uses = (steps: CutsceneStep[] | undefined, kind: 'door' | 'depart' | 'crew'): boolean => (steps ?? []).some((st) => kind in st);
  // Depart only in the stage's ending, forwards on the rail the train stands on then (the last station's).
  for (const [id, steps] of Object.entries(cutscenes)) {
    if (id !== file.ending && uses(steps, 'depart')) fail(`cutscene "${id}": "depart" is only for the stage's ending`);
  }
  if (file.ending && uses(cutscenes[file.ending], 'depart')) {
    const last = file.missions[file.missions.length - 1];
    const station = last && file.stations.find((s) => s.id === last.steps[last.steps.length - 1].stationId);
    if (station) {
      const rail = network.getRail(station.railId);
      for (const st of cutscenes[file.ending]) {
        if (!('depart' in st)) continue;
        const to = st.depart.to;
        if (to <= station.at || to > rail.length - BUFFER_MARGIN - 1) {
          fail(`cutscene "${file.ending}": "depart.to" must be past the last station (${station.at}) and before the end of "${rail.id}" (${(rail.length - BUFFER_MARGIN - 1).toFixed(1)})`);
        }
      }
    }
  }
  const stuff = pathStuff(file, network, magnets);
  for (const m of file.missions) {
    for (const step of m.steps) {
      const station = file.stations.find((s) => s.id === step.stationId);
      if (!station) continue;
      if (step.welcome) {
        const w = step.welcome;
        const where = `mission "${m.id}" welcome`;
        const side = station.platformSide === 'left' ? -1 : 1;
        const door = welcomeDoor(w, station);
        for (const [name, p] of [
          ['seat', w.seat],
          ['door', door],
        ] as const) {
          if (p.railId !== station.railId || p.at < station.at - 45 || p.at > station.at) fail(`${where}: "${name}" must be on the station's rail, 0–45 m behind its stop line`);
          if (Math.sign(p.lateral) !== side) fail(`${where}: "${name}" must be on the platform's side (${station.platformSide})`);
        }
        if (door.at < station.at - 34 || door.at > station.at - 27) fail(`${where}: "door" must be 27–34 m behind the stop line (the last car's back door)`);
      }
      const lead = step.lead;
      if (!lead) continue;
      const where = `mission "${m.id}" lead`;
      const rail = network.getRail(lead.railId);
      if (lead.from < 0 || lead.from > rail.length) fail(`${where}: "from" is outside rail "${lead.railId}"`);
      if (lead.home) {
        const hr = network.getRail(lead.home.railId);
        if (lead.home.at < 0 || lead.home.at > hr.length) fail(`${where}: "home" is outside rail "${lead.home.railId}"`);
      }
      if (lead.learn) {
        const steps = cutscenes[lead.learn];
        if (uses(steps, 'door') || uses(steps, 'depart') || uses(steps, 'crew')) fail(`${where}: its learn cutscene "${lead.learn}" may not open doors, depart or seat the crew`);
      }
      const path = traceLeadPath(file.junctions, network, lead.railId, lead.from, m.junctions);
      if (!path.ring) fail(`${where}: its way from ${lead.railId} ${lead.from} must be a ring back to it (within ${LEAD.maxPath} m; it ${path.end === 'buffer' ? 'ends at a buffer' : 'is too long'})`);
      for (const { junction: j, side } of path.junctions) {
        const locked = m.junctions?.[j.id]?.lock !== undefined;
        const to = j[side];
        const dead = to !== undefined && file.rails.find((r) => r.id === to)?.deadEnd === true;
        if (!locked && (dead || j.signReversed || j.spin || j.fireflies || j.dive)) fail(`${where}: junction "${j.id}" on its way must be locked by the mission (or go the ring's way by itself)`);
      }
      const onPath = path.legs.find((l) => l.railId === station.railId && station.at >= l.from && station.at <= l.to);
      if (!onPath) fail(`${where}: its station "${station.id}" must be on its way`);
      const lateral = lead.lateral ?? LEAD.lateral;
      if ((station.platformSide === 'left') === lateral < 0) fail(`${where}: station "${station.id}"'s platform is on Sakasa's side (${station.platformSide}); put it on the other side`);
      const before = onPath.start + (station.at - onPath.from);
      const calls = lead.calls ?? 2;
      const need = calls * 60 + 60;
      if (before < need) fail(`${where}: from "from" to the station there must be ${need} m or more (${before.toFixed(0)} m): room for ${calls} calls and the stop`);
      // Nothing on the way that asks for a button or can go wrong (from 20 m before `from`).
      const legs = [...path.legs, { railId: lead.railId, from: Math.max(0, lead.from - 20), to: lead.from, start: 0 }];
      for (const s of stuff) {
        for (const l of legs) {
          if (s.railId === l.railId && s.from <= l.to && s.to >= l.from) fail(`${where}: its way (${l.railId} ${l.from.toFixed(0)}–${l.to.toFixed(0)}) runs over ${s.what}`);
        }
      }
      for (const j of file.junctions) {
        if ((j as { back?: boolean }).back !== true) continue;
        if (legs.some((l) => l.railId === j.railId && j.at >= l.from && j.at <= l.to)) fail(`${where}: the back junction "${j.id}" is on its way`);
      }
    }
  }
}

/** What may not be on a lead's way: stretches and places on the rails. */
function pathStuff(file: StageFile, network: RailNetwork, magnets: readonly MagnetTarget[]): Span[] {
  const out: Span[] = [];
  for (const r of file.rails) for (const g of r.gaps ?? []) out.push({ railId: r.id, from: g.from, to: g.to, what: `a gap (${g.from}–${g.to})` });
  for (const rail of network.rails.values()) {
    for (const w of [...rail.surfaces, ...rail.dives]) out.push({ railId: rail.id, from: w.from, to: w.to, what: 'water' });
    for (const p of rail.plows) out.push({ railId: rail.id, from: p.from, to: p.to, what: 'a snow wall' });
  }
  const zoned = ['jump-pad', 'slope', 'ice', 'thin-ice', 'hush', 'whistle-reversed', 'fragile', 'flower-bridge', 'bough', 'plow-wall'];
  for (const g of file.gimmicks) {
    if (!zoned.includes(g.type) || g.railId === undefined || g.from === undefined) continue;
    out.push({ railId: g.railId, from: g.from, to: g.to ?? g.from, what: `a ${g.type}` });
  }
  for (const t of magnets) if (t.kind === 'bridge' || t.kind === 'gate') out.push({ railId: t.railId, from: t.at - 1, to: t.at + 1, what: `a magnet ${t.kind}` });
  for (const f of file.floaters ?? []) out.push({ railId: f.railId, from: f.at - 3, to: f.at + 3, what: `a floater "${f.id}"` });
  for (const a of file.actors) if ('onRail' in a) out.push({ railId: a.onRail.railId, from: a.onRail.at, to: a.onRail.at, what: `a ${a.type} "${a.id}"` });
  return out;
}
