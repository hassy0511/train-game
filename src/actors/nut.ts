import type { ResolvedActor } from '../stage/types';
import { JUMP } from '../train/params';
import type { Train } from '../train/train';

/** What a nut or a squirrel tells the mission runner this frame. */
export type NutOutcome =
  | { kind: 'roll'; speed: number }
  | { kind: 'passed' }
  | { kind: 'danger' }
  | { kind: 'near' }
  | { kind: 'drop-rail' }
  | null;

export interface NutParams {
  /** The nut starts rolling when the train front is this close (m). */
  trigger: number;
  /** Rolling speed towards the train (m/s). */
  speed: number;
  /** It rolls at most this far (m), then drops off the rail. */
  range: number;
}

/**
 * The lead bogie meets something at `s` on its rail: over it (airborne) is fine, on the ground it bumps.
 * Returns null while it is still ahead.
 */
function meet(train: Train, s: number): 'over' | 'bump' | null {
  if (train.bogieS < s - 0.3) return null;
  return train.airborne ? 'over' : 'bump';
}

/** Seconds until the lead bogie meets something at `s` that moves towards it at `speed`; null if never. */
function secondsToMeet(train: Train, s: number, speed: number): number | null {
  const gap = s - train.bogieS;
  const closing = train.state.speed + speed;
  if (gap <= 0 || closing <= 0.1) return null;
  return gap / closing;
}

/** True when a jump started now has the lead bogie in the air as it meets the thing (the jump button glows). */
function jumpNowClears(train: Train, s: number, speed: number): boolean {
  if (train.state.speed < JUMP.minSpeed || train.airborne) return false;
  const t = secondsToMeet(train, s, speed);
  return t !== null && t > JUMP.airTime * 0.2 && t < JUMP.airTime * 0.8;
}

/** A nut that rolls down the branch towards the train once it comes close. Jump over it. */
export class RollingNut {
  readonly railId: string;
  readonly at: number;
  readonly params: NutParams;
  state: 'waiting' | 'rolling' | 'gone' | 'stopped' = 'waiting';
  private travelled = 0;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    if (!actor.onRail) throw new Error(`nut "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
    this.params = { trigger: 80, speed: 5, range: 160, ...(actor.params as Partial<NutParams>) };
  }

  /** Where it is now (m along its rail). */
  get s(): number {
    return this.at - this.travelled;
  }

  reset(): void {
    this.state = 'waiting';
    this.travelled = 0;
  }

  /** The jump button should glow: jumping now takes the train over this nut. */
  get jumpHint(): boolean {
    return this.state === 'rolling' && this.train.state.railId === this.railId && jumpNowClears(this.train, this.s, this.params.speed);
  }

  update(dt: number): NutOutcome {
    if (this.train.state.railId !== this.railId) return null;
    if (this.state === 'waiting') {
      const d = this.train.distanceAhead(this.railId, this.at);
      if (d !== null && d <= this.params.trigger && d > 0) {
        this.state = 'rolling';
        return { kind: 'roll', speed: this.params.speed };
      }
      return null;
    }
    if (this.state !== 'rolling') return null;
    this.travelled = Math.min(this.params.range, this.travelled + this.params.speed * dt);
    const m = meet(this.train, this.s);
    if (m === 'over') {
      this.state = 'gone';
      return { kind: 'passed' };
    }
    if (m === 'bump') {
      this.state = 'stopped';
      return { kind: 'danger' };
    }
    if (this.travelled >= this.params.range) this.state = 'gone';
    return null;
  }
}

export interface SquirrelParams {
  /** The whistle reaches it from this far (m); it then drops the nut off the rail. */
  whistleRange: number;
  /** Without the whistle it drops the nut onto the rail when the train front is this close (m). */
  drop: number;
}

/**
 * A squirrel on the branch over the rail, holding a nut. Whistle and it drops the nut beside the rail; come
 * close without whistling and it drops it onto the rail at `at`, where it lies still: jump over it.
 */
export class Squirrel {
  readonly railId: string;
  readonly at: number;
  readonly params: SquirrelParams;
  state: 'hold' | 'side' | 'rail' | 'passed' | 'stopped' = 'hold';
  private nearSaid = false;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    if (!actor.onRail) throw new Error(`squirrel "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
    this.params = { whistleRange: 70, drop: 28, ...(actor.params as Partial<SquirrelParams>) };
  }

  reset(): void {
    this.state = 'hold';
    this.nearSaid = false;
  }

  /** Close enough for the whistle to make it let go (the whistle button glows). */
  get inWhistleRange(): boolean {
    if (this.state !== 'hold') return false;
    const d = this.train.distanceAhead(this.railId, this.at);
    return d !== null && d > this.params.drop && d <= this.params.whistleRange;
  }

  /** The nut lies on the rail and jumping now clears it. */
  get jumpHint(): boolean {
    return this.state === 'rail' && this.train.state.railId === this.railId && jumpNowClears(this.train, this.at, 0);
  }

  /** Returns true when the whistle made it drop the nut off the rail. */
  onWhistle(): boolean {
    if (!this.inWhistleRange) return false;
    this.state = 'side';
    return true;
  }

  update(): NutOutcome {
    if (this.train.state.railId !== this.railId) return null;
    if (this.state === 'hold') {
      const d = this.train.distanceAhead(this.railId, this.at);
      if (d === null) return null;
      if (d <= this.params.drop) {
        this.state = 'rail';
        return { kind: 'drop-rail' };
      }
      if (!this.nearSaid && d <= this.params.whistleRange + 20) {
        this.nearSaid = true;
        return { kind: 'near' };
      }
      return null;
    }
    if (this.state !== 'rail') return null;
    const m = meet(this.train, this.at);
    if (m === 'over') {
      this.state = 'passed';
      return { kind: 'passed' };
    }
    if (m === 'bump') {
      this.state = 'stopped';
      return { kind: 'danger' };
    }
    return null;
  }
}
