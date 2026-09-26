import type { CountdownDef, StationDef } from '../stage/types';
import { COUNTDOWN, STOP_RULE } from '../train/params';
import type { Train } from '../train/train';

export type CountdownState = 'run' | 'low' | 'safe' | 'up';

/** What the countdown panel shows (and the test hooks read). */
export interface CountdownView {
  state: CountdownState;
  /** Whole seconds left (rounded up). */
  seconds: number;
  /** Share of the time left, 0..1 (the shrinking band). */
  fraction: number;
  icon: 'volcano' | 'clock';
}

/**
 * A countdown over one mission step's drive (2-3 M3, PHASE6 §5.3). Counts game time while driving only. Beaten
 * when the train front passes `until` (or reaches the station's stop zone). Running out puts the train back where
 * the step started with more time; any other fail gives back the time it had when it last passed that place.
 */
export class Countdown {
  state: CountdownState = 'run';
  remaining: number;
  full: number;
  private timeUps = 0;
  private lowSaid = false;
  private readonly until: { railId: string; at: number };
  private readonly samples: { railId: string; s: number; remaining: number }[] = [];
  private lastSample: { railId: string; s: number } | null = null;

  constructor(
    readonly def: CountdownDef,
    /** Where a time-up puts the train front back (the stop line the step started from). */
    readonly origin: { railId: string; at: number },
    station: StationDef,
  ) {
    this.full = def.seconds;
    this.remaining = def.seconds;
    const zone = station.stop?.zone ?? STOP_RULE.zone;
    this.until = def.until ?? { railId: station.railId, at: station.at - zone };
  }

  get view(): CountdownView {
    return {
      state: this.state,
      seconds: Math.max(0, Math.ceil(this.remaining - 1e-6)),
      fraction: this.full > 0 ? Math.max(0, Math.min(1, this.remaining / this.full)) : 0,
      icon: this.def.icon ?? 'volcano',
    };
  }

  /** True while it still counts (not beaten). */
  get active(): boolean {
    return this.state === 'run' || this.state === 'low' || this.state === 'up';
  }

  /** One driving frame. Returns what just happened, if anything. */
  update(dt: number, train: Train): 'low' | 'safe' | 'up' | null {
    if (this.state !== 'run' && this.state !== 'low') return null;
    const d = train.distanceAhead(this.until.railId, this.until.at);
    if (d !== null && d <= 0) {
      this.state = 'safe';
      return 'safe';
    }
    this.note(train);
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining === 0) {
      this.state = 'up';
      return 'up';
    }
    if (!this.lowSaid && this.remaining <= COUNTDOWN.lowAt) {
      this.lowSaid = true;
      this.state = 'low';
      return 'low';
    }
    return null;
  }

  /** After a time-up and its rewind: a fresh try with a little more time. */
  restartAfterTimeUp(): void {
    this.timeUps += 1;
    const assist = this.def.assist ?? COUNTDOWN.assist;
    const assistMax = this.def.assistMax ?? COUNTDOWN.assistMax;
    this.full = this.def.seconds + Math.min(assist * this.timeUps, assistMax);
    this.remaining = this.full;
    this.state = 'run';
    this.lowSaid = false;
    this.samples.length = 0;
    this.lastSample = null;
  }

  /**
   * After another fail (a rock, a slip...): the time goes back with the train, to what was left when it last
   * passed `target` (+COUNTDOWN.restoreBonus s, never more than the full time). Never passed there: full time.
   */
  restoreAt(target: { railId: string; at: number }): void {
    if (this.state === 'safe') return;
    let found: number | null = null;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const p = this.samples[i];
      if (p.railId === target.railId && Math.abs(p.s - target.at) <= COUNTDOWN.sampleEvery) {
        found = p.remaining;
        break;
      }
    }
    this.remaining = found === null ? this.full : Math.min(this.full, found + COUNTDOWN.restoreBonus);
    this.state = 'run';
    this.lowSaid = this.remaining <= COUNTDOWN.lowAt;
    if (this.lowSaid) this.state = 'low';
    this.lastSample = null;
  }

  /** Notes where the train is and the time left every COUNTDOWN.sampleEvery m. */
  private note(train: Train): void {
    const railId = train.state.railId;
    const s = train.frontS;
    const last = this.lastSample;
    if (last && last.railId === railId && Math.abs(s - last.s) < COUNTDOWN.sampleEvery) return;
    this.lastSample = { railId, s };
    this.samples.push({ railId, s, remaining: this.remaining });
  }
}
