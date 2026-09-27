import { Emitter } from '../core/events';
import type { GimmickDef } from '../stage/types';
import { ACCELERATION, LEVER_NOTCHES, ROCKET, THIN_ICE } from '../train/params';
import type { Train } from '../train/train';
import { thinIceZones, type ThinIceZone } from './ice';
import type { RocketSystem } from './rocket';

/** What the thin ice under the train is doing: "" (not on it), "on", "shake" (too slow: "ぴしぴし"), "crack" ("ぽちゃん"). */
export type ThinIceStatus = '' | 'on' | 'shake' | 'crack';

export interface ThinIceEvents extends Record<string, unknown> {
  /** Its line: the front is THIN_ICE.warn m (the zone's warn) before it. */
  warn: ThinIceZone;
  /** Too slow on it: it starts cracking ("ぴしぴし"). */
  shake: ThinIceZone;
  /** Slow for its grace time: it breaks ("ぽちゃん", fail "crack"). */
  crack: ThinIceZone;
  /** The last bogie got across. */
  clear: ThinIceZone;
  /** The rocket button started glowing for it; `count`: the glows for this stretch this try (2 = "もういっかい"). */
  glow: { zone: ThinIceZone; count: number };
}

/** A moment of the train as the prediction starts from it. */
export interface ThinIcePredictStart {
  /** Train front (m along the zone's rail). */
  front: number;
  speed: number;
  /** The lever's target speed (m/s). */
  target: number;
  /** The lever notch's brake (m/s², the ice's grip already in it). */
  brake: number;
  /** Seconds already too slow on the ice. */
  slow: number;
}

/**
 * Would a press now carry the train across `zone` (PHASE8 第 7 部 §4.2 "wouldClear")? Steps `THIN_ICE.predictStep` s at
 * a time for up to `THIN_ICE.predictSeconds` s: the rocket pushes at ROCKET.accel up to ROCKET.speed for ROCKET.burn
 * s, then the train settles back to the lever's speed (at least ROCKET.settle m/s²). With `presses` above 1, the next
 * press comes THIN_ICE.repress s after each burn ends. Fails when the train is slower than the zone's minSpeed on it
 * for its grace time before the last bogie is past its end.
 */
export function wouldClear(zone: ThinIceZone, start: ThinIcePredictStart, presses: number): boolean {
  const dt = THIN_ICE.predictStep;
  let s = start.front;
  let v = start.speed;
  let slow = start.slow;
  let burn = ROCKET.burn;
  let burning = presses > 0;
  let left = presses - 1;
  let repressAt: number | null = null;
  for (let t = 0; t < THIN_ICE.predictSeconds; t += dt) {
    if (burning) {
      v = Math.min(ROCKET.speed, v + ROCKET.accel * dt);
      burn -= dt;
      if (burn <= 0) {
        burning = false;
        if (left > 0) repressAt = t + THIN_ICE.repress;
      }
    } else if (repressAt !== null && t >= repressAt) {
      burning = true;
      burn = ROCKET.burn;
      left -= 1;
      repressAt = null;
    } else if (v > start.target) v = Math.max(start.target, v - Math.max(start.brake, ROCKET.settle) * dt);
    else if (v < start.target) v = Math.min(start.target, v + ACCELERATION * dt);
    s += v * dt;
    if (s - THIN_ICE.rear > zone.to) return true;
    if (s >= zone.from) {
      if (v < zone.minSpeed) {
        slow += dt;
        if (slow >= zone.grace) return false;
      } else slow = 0;
    }
  }
  return false;
}

/** Can one press get the train across `zone` at all (from some speed and place before it)? Else it takes two. */
function oneIsEnough(zone: ThinIceZone): boolean {
  for (const notch of LEVER_NOTCHES) {
    if (notch.speed <= 0) continue;
    for (let d = -160; d <= 0; d += 2) {
      const start = { front: zone.from + d, speed: notch.speed, target: notch.speed, brake: notch.brake, slow: 0 };
      if (wouldClear(zone, start, 1)) return true;
    }
  }
  return false;
}

interface ZoneState {
  warned: boolean;
  slow: number;
  shook: boolean;
  cracked: boolean;
  cleared: boolean;
  was: boolean;
  glows: number;
  /** The button glowed on this approach (then the late fallback glow stays off: the moment was missed). */
  glowed: boolean;
}

/**
 * Thin ice (4-1): only the rocket gets the train across (PHASE8 第 7 部 §4.2). Watches the train on each stretch,
 * cracks it under a train too slow for too long, and works out when the rocket button should glow: while a press now
 * (and one more right after, on a stretch one burn cannot cover) would carry the train across. The rocket system asks
 * it through `glow` (RocketSystem.extraGlow).
 */
export class ThinIceSystem {
  readonly events = new Emitter<ThinIceEvents>();
  readonly zones: ThinIceZone[];
  status: ThinIceStatus = '';
  /** The rocket button should glow for thin ice now. */
  glow = false;
  private readonly states: ZoneState[];
  private readonly presses: number[];

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
    private readonly rocket: RocketSystem,
  ) {
    this.zones = thinIceZones(gimmicks);
    this.states = this.zones.map(() => this.fresh());
    this.presses = this.zones.map((z) => (oneIsEnough(z) ? 1 : 2));
  }

  private fresh(): ZoneState {
    return { warned: false, slow: 0, shook: false, cracked: false, cleared: false, was: false, glows: 0, glowed: false };
  }

  /** How many presses a stretch takes (1 or 2), by its length (test hook). */
  pressesFor(index: number): number {
    const i = this.zones.findIndex((z) => z.index === index);
    return i >= 0 ? this.presses[i] : 1;
  }

  /** After a rewind: every stretch is whole again and says its line again. */
  reset(): void {
    this.states.forEach((_, i) => (this.states[i] = this.fresh()));
    this.status = '';
    this.glow = false;
  }

  /** Call every frame after the train moved. */
  update(dt: number): void {
    const t = this.train;
    const railId = t.state.railId;
    const front = t.frontS;
    const rear = front - THIN_ICE.rear;
    let status: ThinIceStatus = '';
    let glow = false;
    this.zones.forEach((z, i) => {
      const st = this.states[i];
      if (z.railId !== railId) return;
      if (!st.warned && front >= z.from - z.warn && front < z.from) {
        st.warned = true;
        this.events.emit('warn', z);
      }
      if (st.cracked) {
        if (front >= z.from - 5 && rear <= z.to) status = 'crack';
        return;
      }
      const on = front >= z.from && rear <= z.to && !t.airborne;
      if (on) {
        if (t.state.speed < z.minSpeed) {
          st.slow += dt;
          // "ぴしぴし" only when it is going to break (not while a rocket-fast train slows down across its end).
          if (!st.shook && !wouldClear(z, this.startNow(st), 0)) {
            st.shook = true;
            this.events.emit('shake', z);
          }
          if (st.slow >= z.grace) {
            st.cracked = true;
            status = 'crack';
            this.events.emit('crack', z);
            return;
          }
        } else st.slow = 0;
        status = st.slow > 0 ? 'shake' : 'on';
      }
      if (st.was && !on && rear > z.to && !st.cleared) {
        st.cleared = true;
        this.events.emit('clear', z);
      }
      st.was = on;
      // The rocket's glow: from glowAhead m before it until the last bogie is across.
      const inWindow = front >= z.from - THIN_ICE.glowAhead && rear <= z.to && !st.cleared;
      if (!inWindow) {
        if (front < z.from - THIN_ICE.glowAhead) st.glowed = false;
        return;
      }
      if (this.zoneGlow(z, i, st)) {
        glow = true;
        if (!this.glow || !st.glowed) {
          st.glows += 1;
          st.glowed = true;
          this.events.emit('glow', { zone: z, count: st.glows });
        }
      }
    });
    this.status = status;
    this.glow = glow;
  }

  /** The train as it is now, for the prediction. */
  private startNow(st: ZoneState): ThinIcePredictStart {
    const t = this.train;
    const notch = LEVER_NOTCHES[t.state.notch];
    return { front: t.frontS, speed: t.state.speed, target: notch.speed * t.speedScale, brake: notch.brake * t.grip, slow: st.slow };
  }

  /** The button glows for stretch `z` now: a press now gets across, or (never glowed yet) nothing would. */
  private zoneGlow(z: ThinIceZone, i: number, st: ZoneState): boolean {
    const t = this.train;
    const r = this.rocket;
    if (!r.enabled || r.why !== '') return false;
    const start = this.startNow(st);
    // Already getting across as it is (the push of a burn just ended): no need to press again.
    if (wouldClear(z, start, 0)) return false;
    const presses = Math.min(this.presses[i], r.pips);
    if (presses > 0 && wouldClear(z, start, presses)) return true;
    // Nothing gets across from here (met almost stopped): glow where a press goes furthest, if it never glowed.
    return !st.glowed && t.frontS >= z.from - THIN_ICE.fallbackAhead && t.frontS < z.from;
  }
}
