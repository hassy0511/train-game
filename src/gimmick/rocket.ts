import { Emitter } from '../core/events';
import type { GimmickDef } from '../stage/types';
import { ROCKET } from '../train/params';
import type { Train } from '../train/train';
import type { SlopeSystem, SlopeZone } from './slope';

/**
 * Why a press would not fire the rocket right now ('' = it would). "air", "burn" and "locked" say nothing;
 * the others make the button grey and the partner says why.
 */
export type RocketWhy = '' | 'locked' | 'air' | 'burn' | 'empty' | 'zone' | 'slide' | 'station';

/** One "rocket" gimmick (2-3): a stretch where the rocket rests, or where it glows. */
export interface RocketZone {
  index: number;
  railId: string;
  from: number;
  to: number;
  allow: boolean;
  glow: boolean;
  icon: 'none' | 'sleep' | 'bridge';
  line: string | null;
  pressLine: string | null;
}

export type RocketPress = { ok: true } | { ok: false; why: RocketWhy; zone: RocketZone | null };

export interface RocketEvents extends Record<string, unknown> {
  /** The train front entered a rocket zone. */
  zone: RocketZone;
  /** The button started glowing: for an uphill (`slope`) or in a glow zone (`zone`). */
  glow: { slope: SlopeZone | null; zone: RocketZone | null };
}

/** The rocket zones of a stage, from its gimmicks (also used by the loader's checks). */
export function rocketZones(gimmicks: GimmickDef[]): RocketZone[] {
  const out: RocketZone[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'rocket' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as Record<string, unknown>;
    const icon = p.icon === 'sleep' || p.icon === 'bridge' ? p.icon : 'none';
    out.push({
      index,
      railId: g.railId,
      from: g.from,
      to: g.to,
      allow: p.allow !== false,
      glow: p.glow === true,
      icon,
      line: typeof p.line === 'string' ? p.line : null,
      pressLine: typeof p.pressLine === 'string' ? p.pressLine : null,
    });
  });
  return out;
}

/**
 * The rocket (2-3): three flames, refilled when a drive starts and after a fail. Knows where it rests (quiet zones,
 * slides, near the station being driven to or a buffer stop), cuts a burn short there ("ぷしゅっ") and decides when
 * the button glows ("now, or the train will not make it up"). The train does the pushing.
 */
export class RocketSystem {
  readonly events = new Emitter<RocketEvents>();
  readonly zones: RocketZone[];
  /** Flames left. */
  pips: number = ROCKET.pips;
  /** The player has the rocket (its button shows). */
  enabled = false;
  /** Stop line of the station the train is driving to (the runner sets it), or null. */
  goal: { railId: string; at: number } | null = null;
  /** The uphill the button glows for, when it glows for one. */
  glowSlope: SlopeZone | null = null;
  private glowing = false;
  private inZone: RocketZone | null = null;

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
    private readonly slopes: SlopeSystem,
  ) {
    this.zones = rocketZones(gimmicks);
  }

  refill(): void {
    this.pips = ROCKET.pips;
  }

  /** After a rewind: zone lines may be said again. */
  reset(): void {
    this.inZone = null;
    this.glowing = false;
    this.glowSlope = null;
  }

  /** The rocket zone under the train front, or null. */
  get zoneHere(): RocketZone | null {
    const railId = this.train.state.railId;
    const front = this.train.frontS;
    let glowZone: RocketZone | null = null;
    for (const z of this.zones) {
      if (z.railId !== railId || front < z.from || front > z.to) continue;
      if (!z.allow) return z;
      glowZone ??= z;
    }
    return glowZone;
  }

  /** Why a press now would not fire ('' = it would). */
  get why(): RocketWhy {
    const t = this.train;
    if (t.inputLock !== null || t.isFalling || t.isSlipping || t.isEnded) return 'locked';
    if (t.airborne) return 'air';
    if (t.rocketBurning) return 'burn';
    // An empty gauge first (PHASE6 §5.1 order): it will not come back before the station, a quiet place will pass.
    if (this.pips <= 0) return 'empty';
    return this.quietPlace() ?? '';
  }

  /** The button is grey: no flames, or the rocket rests here. */
  get idle(): boolean {
    const w = this.why;
    return w === 'empty' || w === 'zone' || w === 'slide' || w === 'station';
  }

  /** The mark on the button while it rests: the zone's icon, or '' (test hook and CSS). */
  get icon(): string {
    const z = this.zoneHere;
    return z && !z.allow && z.icon !== 'none' ? z.icon : '';
  }

  get glow(): boolean {
    return this.glowing;
  }

  /** Fires the rocket when it can; otherwise says why not (the caller has the partner say it). */
  press(): RocketPress {
    if (!this.enabled) return { ok: false, why: 'locked', zone: null };
    const why = this.why;
    if (why !== '') return { ok: false, why, zone: this.zoneHere };
    if (!this.train.startRocket()) return { ok: false, why: 'locked', zone: null };
    this.pips -= 1;
    this.glowing = false;
    return { ok: true };
  }

  /** Call every frame after the slope system and before the train moves. */
  update(): void {
    const zone = this.zoneHere;
    if (zone !== this.inZone) {
      this.inZone = zone;
      if (zone && this.enabled) this.events.emit('zone', zone);
    }
    // Into a quiet place while burning: "ぷしゅっ", the burn just ends (not a fail).
    if (this.train.rocketBurning && this.quietPlace() !== null) this.train.stopRocket();

    const slope = this.enabled && this.why === '' ? this.slopeNeedingRocket() : null;
    const glowZone = this.enabled && this.why === '' && zone?.glow ? zone : null;
    const glow = slope !== null || glowZone !== null;
    if (glow && !this.glowing) this.events.emit('glow', { slope, zone: glowZone });
    this.glowing = glow;
    this.glowSlope = slope;
  }

  /** A quiet zone, a slide, or near the stop line / buffer ahead; null where the rocket may fire. */
  private quietPlace(): 'zone' | 'slide' | 'station' | null {
    const z = this.zoneHere;
    if (z && !z.allow) return 'zone';
    if (this.train.onSlide) return 'slide';
    if (this.nearStop()) return 'station';
    return null;
  }

  /** Within ROCKET.stationQuiet m of the goal's stop line, or ROCKET.bufferQuiet m of a buffer stop. */
  private nearStop(): boolean {
    const t = this.train;
    const rail = t.currentRail;
    if (rail.end.type === 'buffer' && rail.length - t.frontS <= ROCKET.bufferQuiet) return true;
    if (!this.goal) return false;
    // Along the way the train will go: junction choices (else defaults) and merges.
    const d = t.routeDistance(this.goal.railId, this.goal.at);
    return d !== null && d > -10 && d <= ROCKET.stationQuiet;
  }

  /**
   * The uphill ahead (from ROCKET.glowAhead m before it to its top) the train would not get up as it is: its
   * stopping distance v²/(2·decel) is shorter than what is left of the slope (+2 m). decel is |pull| plus the lever's
   * brake when the lever is below the speed (Train.uphillDecel, the rule the train itself slows by).
   */
  private slopeNeedingRocket(): SlopeZone | null {
    const t = this.train;
    const front = t.frontS;
    const v = t.state.speed;
    for (const z of this.slopes.zones) {
      if (z.kind !== 'up' || z.railId !== t.state.railId) continue;
      if (front < z.from - ROCKET.glowAhead || front > z.to) continue;
      const left = z.to - Math.max(front, z.from);
      if ((v * v) / (2 * t.uphillDecel(z.pull)) < left + 2) return z;
    }
    return null;
  }
}
