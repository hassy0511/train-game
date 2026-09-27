import { Emitter } from '../core/events';
import type { GimmickDef, StationDef } from '../stage/types';
import { BRAKING, ICE, LEVER_NOTCHES, STOP_RULE, THIN_ICE } from '../train/params';
import type { Train } from '../train/train';

/** One "ice" gimmick (4-1) with its defaults filled in. */
export interface IceZone {
  /** Its place in gimmicks[]. */
  index: number;
  railId: string;
  from: number;
  to: number;
  grip: number;
  line: string | null;
  sign: boolean;
}

/** One "thin-ice" gimmick (4-1) with its defaults filled in. */
export interface ThinIceZone {
  index: number;
  railId: string;
  from: number;
  to: number;
  minSpeed: number;
  grace: number;
  warn: number;
  rewind: { railId: string; at: number };
  line: string | null;
  sign: boolean;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The ice stretches of a stage, from its gimmicks (also used by the loader's checks, the sound and the view). */
export function iceZones(gimmicks: GimmickDef[]): IceZone[] {
  const out: IceZone[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'ice' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as Record<string, unknown>;
    out.push({ index, railId: g.railId, from: g.from, to: g.to, grip: num(p.grip, ICE.grip), line: text(p.line), sign: p.sign !== false });
  });
  return out;
}

/** The thin-ice stretches of a stage, from its gimmicks. */
export function thinIceZones(gimmicks: GimmickDef[]): ThinIceZone[] {
  const out: ThinIceZone[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'thin-ice' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as Record<string, unknown>;
    out.push({
      index,
      railId: g.railId,
      from: g.from,
      to: g.to,
      minSpeed: num(p.minSpeed, THIN_ICE.minSpeed),
      grace: num(p.grace, THIN_ICE.grace),
      warn: num(p.warn, THIN_ICE.warn),
      rewind: { railId: g.railId, at: num(p.rewindAt, g.from - THIN_ICE.rewindBefore) },
      line: text(p.line),
      sign: p.sign !== false,
    });
  });
  return out;
}

/** The ice (or thin ice) zone holding `s` on `railId`, or null. */
export function iceAt(zones: { railId: string; from: number; to: number }[], railId: string, s: number): boolean {
  return zones.some((z) => z.railId === railId && s >= z.from && s <= z.to);
}

/** Which of the lever's notches glows at an ice station: "slow" (ゆっくり), "stop" (とまる) or none. */
export type IceHint = '' | 'slow' | 'stop';

export interface IceEvents extends Record<string, unknown> {
  /** The train front got onto an ice stretch. */
  enter: IceZone;
  /** The train started slowing down on ice (the wheels' "しゃーっ"). */
  brake: void;
  /** A notch started glowing at an ice station. */
  hint: { kind: 'slow' | 'stop'; station: StationDef };
}

/**
 * Ice (4-1): tells the train how hard its brakes work under its front (Train.grip; the train does the braking) and,
 * driving to a station whose stop line is on ice, which notch of the lever glows ("ゆっくり" early, then "とまる" just
 * in time; PHASE8 第 7 部 §4.1). Works without a mission runner (the test course: the next ice station ahead).
 */
export class IceSystem {
  readonly events = new Emitter<IceEvents>();
  readonly zones: IceZone[];
  /** The ice zone under the train front, or null. */
  current: IceZone | null = null;
  /** The station being driven to (the runner sets it), or null: then the next ice station ahead counts. */
  goal: StationDef | null = null;
  /** The notch glowing now. */
  hint: IceHint = '';
  /** Slowing down on ice now, or within ICE.sparkle s (the wheels' ice dust). */
  sparkle = false;
  private hintStation: StationDef | null = null;
  private braking = false;
  private sparkleLeft = 0;
  private readonly iceStations: { station: StationDef; zone: IceZone }[];

  constructor(
    gimmicks: GimmickDef[],
    stations: StationDef[],
    private readonly train: Train,
  ) {
    this.zones = iceZones(gimmicks);
    this.iceStations = stations.flatMap((station) => {
      const zone = this.zones.find((z) => z.railId === station.railId && station.at >= z.from && station.at <= z.to);
      return zone ? [{ station, zone }] : [];
    });
  }

  /** True when `station` stops on ice. */
  onIce(station: StationDef): boolean {
    return this.iceStations.some((s) => s.station.id === station.id);
  }

  /** After a rewind: getting onto the ice is announced again; no notch glows until worked out anew. */
  reset(): void {
    this.current = null;
    this.hint = '';
    this.hintStation = null;
    this.braking = false;
    this.sparkleLeft = 0;
    this.sparkle = false;
    this.train.grip = 1;
  }

  /** Call every frame before the train moves. */
  update(dt: number): void {
    const t = this.train;
    const railId = t.state.railId;
    const front = t.frontS;
    let here: IceZone | null = null;
    for (const z of this.zones) if (z.railId === railId && front >= z.from && front <= z.to) here = z;
    if (here !== this.current) {
      this.current = here;
      if (here) this.events.emit('enter', here);
    }
    t.grip = here ? here.grip : 1;
    // Slowing down on ice: the lever asks for less than the speed (not the rocket's settling, not a sudden stop).
    const braking = here !== null && t.state.speed > 0.5 && t.targetSpeed < t.state.speed - 0.3 && !t.rocketPushing && t.inputLock === null;
    if (braking && !this.braking) this.events.emit('brake');
    this.braking = braking;
    this.sparkleLeft = braking ? ICE.sparkle : Math.max(0, this.sparkleLeft - dt);
    this.sparkle = this.sparkleLeft > 0 && t.state.speed > 0.5;
    this.updateHint();
  }

  /** The station whose notches may glow now: the goal (when on ice), else the nearest ice station ahead. */
  private target(): { station: StationDef; zone: IceZone; remaining: number } | null {
    const t = this.train;
    const candidates = this.goal ? this.iceStations.filter((s) => s.station.id === this.goal?.id) : this.iceStations;
    let best: { station: StationDef; zone: IceZone; remaining: number } | null = null;
    for (const c of candidates) {
      const d = t.routeDistance(c.station.railId, c.station.at);
      if (d === null || d > 400) continue;
      const ok = c.station.stop?.ok ?? STOP_RULE.ok;
      if (d < -ok) continue;
      if (!best || d < best.remaining) best = { ...c, remaining: d };
    }
    return best;
  }

  private updateHint(): void {
    const t = this.train;
    const target = t.inputLock === null ? this.target() : null;
    if (!target) {
      this.hint = '';
      this.hintStation = null;
      return;
    }
    const { station, zone, remaining } = target;
    const v = t.state.speed;
    const brake = LEVER_NOTCHES[1].brake * zone.grip;
    const zoneLength = station.stop?.zone ?? STOP_RULE.zone;
    let hint: IceHint = '';
    // "とまる" stays lit until the train stands or has run past the stop zone.
    if (this.hint === 'stop' && this.hintStation?.id === station.id && v > 0.05) hint = 'stop';
    else if (v > 0.1 && remaining <= (v * v) / (2 * brake) + ICE.stopLead) hint = 'stop';
    else if (v > ICE.slowSpeed + 0.5 && remaining <= (v * v - ICE.slowSpeed * ICE.slowSpeed) / (2 * BRAKING * zone.grip) + zoneLength + ICE.slowMargin) hint = 'slow';
    if (hint !== this.hint && hint !== '') this.events.emit('hint', { kind: hint, station });
    this.hint = hint;
    this.hintStation = hint ? station : null;
  }
}
