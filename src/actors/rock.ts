import type { ResolvedActor, RockRewind } from '../stage/types';
import { REWIND_DISTANCE, ROCK_DROP, ROCK_ROLL } from '../train/params';
import type { Train } from '../train/train';
import { SmallDino, type SmallDinoParams } from './dino';
import { jumpNowClears, meet } from './nut';

/** What a rock tells the mission runner this frame. */
export type RockOutcome =
  | { kind: 'near' }
  | { kind: 'roll'; seconds: number }
  | { kind: 'shadow' }
  | { kind: 'drop' }
  | { kind: 'passed' }
  | { kind: 'danger' }
  | null;

/** Params every rock has on top of its own (2-3, PHASE6 §5.4). */
interface RockCommon {
  /** Where the train front goes back to after a "ぽこん" (default 80 m before the rock). */
  rewind?: RockRewind;
  /** This rock's own warning (instead of the mission's rockNear / rockDrop). */
  say?: string;
  /** Said after the "ぽこん" line. */
  hitAfter?: string;
}

/** The default line after bumping each kind of rock. */
export const ROCK_HIT_AFTER = { roll: 'ころころ いしは まってね', drop: 'おちた いしは ジャンプで こえてね' } as const;

function rewindOf(rewind: RockRewind | undefined, railId: string, at: number): { railId: string; at: number } {
  if (typeof rewind === 'number') return { railId, at: rewind };
  if (rewind && typeof rewind === 'object') return { railId: rewind.railId, at: rewind.at };
  return { railId, at: at - REWIND_DISTANCE };
}

export type RollingRockParams = SmallDinoParams & { warn: number; waitSeconds: number; waitSpeed: number };

/**
 * A rock rolling down the volcano across the rail ("ころころ いし = まつ"). The young dinosaur's rule (1-2) with a
 * rock's look: it starts across when the train comes close; reaching it mid-crossing is a "ぽこん" even in the air.
 * Before that it wobbles up the slope as a warning.
 */
export class RollingRock extends SmallDino {
  readonly rock: RockCommon;
  override readonly params: RollingRockParams;
  private warned = false;
  /** Seconds the train has stood waiting within `warn` m. */
  private waited = 0;

  constructor(actor: ResolvedActor, train: Train) {
    super({ ...actor, params: { ...ROCK_ROLL, ...actor.params } }, train);
    this.params = { ...ROCK_ROLL, ...(this.actor.params as Partial<RollingRockParams>) } as RollingRockParams;
    this.rock = actor.params as RockCommon;
  }

  get rewind(): { railId: string; at: number } {
    return rewindOf(this.rock.rewind, this.railId, this.at);
  }

  override reset(): void {
    super.reset();
    this.warned = false;
    this.waited = 0;
  }

  /**
   * The rock's own update, with the wobble before the young dinosaur's crossing rule. A train that waits in front
   * of it (as the partner asks) sees it roll by as well, however far back within `warn` it stopped.
   */
  step(dt: number): RockOutcome {
    const d = this.distance();
    if (!this.warned && this.state === 'waiting' && d !== null && d <= this.params.warn && d > this.params.startDistance) {
      this.warned = true;
      return { kind: 'near' };
    }
    const waiting = this.state === 'waiting' && d !== null && d > 0 && d <= this.params.warn && this.train.state.speed < this.params.waitSpeed;
    this.waited = waiting ? this.waited + dt : 0;
    if (waiting && this.waited >= this.params.waitSeconds) {
      this.warned = true;
      return { kind: 'roll', seconds: this.startCrossing().seconds };
    }
    const o = super.update(dt);
    if (!o) return null;
    if (o.kind === 'cross') {
      // Straight from close by (after a rewind): the warning is part of it.
      this.warned = true;
      return { kind: 'roll', seconds: o.seconds };
    }
    if (o.kind === 'danger') return { kind: 'danger' };
    return null;
  }
}

export interface DroppingRockParams {
  /** It drops onto the rail when the train front is this close (m). */
  drop: number;
  /** Its shadow shows on the rail from this far (m). */
  warn: number;
}

/**
 * A rock that drops onto the rail and stays ("ぽよん いし = とぶ"): the squirrel's "drop it on the rail" (2-1) without
 * the squirrel, so the whistle does nothing. Its shadow shows first; it only drops ahead of the train. Jump over it.
 */
export class DroppingRock {
  readonly railId: string;
  readonly at: number;
  readonly params: DroppingRockParams;
  readonly rock: RockCommon;
  state: 'up' | 'shadow' | 'rail' | 'passed' | 'stopped' = 'up';

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    if (!actor.onRail) throw new Error(`rock "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
    this.params = { ...ROCK_DROP, ...(actor.params as Partial<DroppingRockParams>) };
    this.rock = actor.params as RockCommon;
  }

  get rewind(): { railId: string; at: number } {
    return rewindOf(this.rock.rewind, this.railId, this.at);
  }

  reset(): void {
    this.state = 'up';
  }

  /** The rock lies on the rail and jumping now clears it (the jump button glows). */
  get jumpHint(): boolean {
    return this.state === 'rail' && this.train.state.railId === this.railId && jumpNowClears(this.train, this.at, 0);
  }

  update(): RockOutcome {
    if (this.train.state.railId !== this.railId) return null;
    if (this.state === 'up' || this.state === 'shadow') {
      const d = this.train.distanceAhead(this.railId, this.at);
      if (d === null || d <= 0) return null;
      if (d <= this.params.drop) {
        this.state = 'rail';
        return { kind: 'drop' };
      }
      if (this.state === 'up' && d <= this.params.warn) {
        this.state = 'shadow';
        return { kind: 'shadow' };
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
