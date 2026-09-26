import type { ResolvedActor } from '../stage/types';
import { TRAIN } from '../train/params';
import type { Train } from '../train/train';

/** What a dinosaur tells the mission runner this frame. */
export type DinoOutcome =
  | { kind: 'near' }
  | { kind: 'danger' }
  | { kind: 'cross'; seconds: number }
  | { kind: 'neck'; down: boolean }
  | null;

/** Common shape of the valley's residents. All distances are from the train FRONT along the rail. */
export abstract class Dino {
  readonly railId: string;
  readonly at: number;

  constructor(
    readonly actor: ResolvedActor,
    protected readonly train: Train,
  ) {
    if (!actor.onRail) throw new Error(`${actor.type} "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
  }

  protected distance(): number | null {
    return this.train.distanceAhead(this.railId, this.at);
  }

  abstract reset(): void;
  abstract update(dt: number): DinoOutcome;
  /** Returns true when the whistle made it move. */
  onWhistle(): boolean {
    return false;
  }
}

export interface MidDinoParams {
  wakeDistance: number;
  dangerDistance: number;
  fleeLateral: number;
  fleeSeconds: number;
}

/** Middle-sized dinosaur asleep across the rail. The whistle wakes it and it walks off (like the cat). */
export class MidDino extends Dino {
  state: 'sleep' | 'awake' | 'stopped' = 'sleep';
  readonly params: MidDinoParams;
  private nearAnnounced = false;

  constructor(actor: ResolvedActor, train: Train) {
    super(actor, train);
    this.params = { wakeDistance: 60, dangerDistance: 8, fleeLateral: 9, fleeSeconds: 2.5, ...(actor.params as Partial<MidDinoParams>) };
  }

  reset(): void {
    this.state = 'sleep';
    this.nearAnnounced = false;
  }

  update(): DinoOutcome {
    if (this.state !== 'sleep') return null;
    const d = this.distance();
    if (d === null) return null;
    if (!this.nearAnnounced && d <= this.params.wakeDistance && d > this.params.dangerDistance) {
      this.nearAnnounced = true;
      return { kind: 'near' };
    }
    if (d <= this.params.dangerDistance && d > -2) {
      this.state = 'stopped';
      return { kind: 'danger' };
    }
    return null;
  }

  override onWhistle(): boolean {
    if (this.state !== 'sleep') return false;
    const d = this.distance();
    if (d === null || d > this.params.wakeDistance || d < -2) return false;
    this.state = 'awake';
    return true;
  }
}

export interface SmallDinoParams {
  /** It starts crossing when the train front is this close. */
  startDistance: number;
  crossSeconds: number;
  dangerDistance: number;
  /** It walks from -lateral to +lateral (m, right of travel). */
  lateral: number;
}

/**
 * A young dinosaur that crosses the rail when the train comes near. At はやい or faster the train
 * reaches it mid-crossing and has to stop; at ふつう it is already across.
 */
export class SmallDino extends Dino {
  state: 'waiting' | 'crossing' | 'across' | 'stopped' = 'waiting';
  readonly params: SmallDinoParams;
  private elapsed = 0;

  constructor(actor: ResolvedActor, train: Train) {
    super(actor, train);
    this.params = { startDistance: 60, crossSeconds: 4, dangerDistance: 6, lateral: 8, ...(actor.params as Partial<SmallDinoParams>) };
  }

  reset(): void {
    this.state = 'waiting';
    this.elapsed = 0;
  }

  /** Starts across now. */
  protected startCrossing(): { kind: 'cross'; seconds: number } {
    this.state = 'crossing';
    this.elapsed = 0;
    return { kind: 'cross', seconds: this.params.crossSeconds };
  }

  update(dt: number): DinoOutcome {
    const d = this.distance();
    if (d === null) return null;
    if (this.state === 'waiting' && d <= this.params.startDistance && d > 0) return this.startCrossing();
    if (this.state !== 'crossing') return null;
    this.elapsed += dt;
    if (this.elapsed >= this.params.crossSeconds) {
      this.state = 'across';
      return null;
    }
    if (d <= this.params.dangerDistance && d > -2) {
      this.state = 'stopped';
      return { kind: 'danger' };
    }
    return null;
  }
}

export interface LargeDinoParams {
  upSeconds: number;
  downSeconds: number;
  /**
   * The one line that matters: reaching it while the neck is down stops the train; reaching it while
   * the neck is up means the train is through (the neck stays up until the last car has passed).
   */
  gateDistance: number;
  nearDistance: number;
}

/**
 * A large dinosaur standing over the rail. It does not wake to the whistle; its head goes down to
 * look at the rail and back up on a fixed rhythm. Pass underneath while the head is up.
 */
export class LargeDino extends Dino {
  readonly params: LargeDinoParams;
  neckDown = false;
  private clock = 0;
  private passing = false;
  private nearAnnounced = false;
  private stopped = false;

  constructor(actor: ResolvedActor, train: Train) {
    super(actor, train);
    this.params = { upSeconds: 3.5, downSeconds: 1.5, gateDistance: 8, nearDistance: 90, ...(actor.params as Partial<LargeDinoParams>) };
  }

  reset(): void {
    this.clock = 0;
    this.neckDown = false;
    this.passing = false;
    this.nearAnnounced = false;
    this.stopped = false;
  }

  update(dt: number): DinoOutcome {
    const d = this.distance();
    const p = this.params;
    // Through once the last car has cleared the head.
    const trainLength = TRAIN.length + TRAIN.carSpacing * (TRAIN.carCount - 1);
    if (this.passing && (d === null || d < -trainLength - 3)) this.passing = false;

    let outcome: DinoOutcome = null;
    if (!this.passing) {
      this.clock = (this.clock + dt) % (p.upSeconds + p.downSeconds);
      const down = this.clock >= p.upSeconds;
      if (down !== this.neckDown) {
        this.neckDown = down;
        outcome = { kind: 'neck', down };
      }
    }
    if (d === null || this.stopped) return outcome;
    if (!this.passing && d <= p.gateDistance && d > -2) {
      if (this.neckDown) {
        this.stopped = true;
        return { kind: 'danger' };
      }
      this.passing = true;
    }
    // One outcome per frame: a neck change wins, the "near" line waits a frame.
    if (outcome) return outcome;
    if (!this.nearAnnounced && d <= p.nearDistance && d > p.gateDistance) {
      this.nearAnnounced = true;
      return { kind: 'near' };
    }
    return null;
  }
}

export function makeDino(actor: ResolvedActor, train: Train): Dino | null {
  if (actor.type === 'dino-mid') return new MidDino(actor, train);
  if (actor.type === 'dino-small') return new SmallDino(actor, train);
  if (actor.type === 'dino-large') return new LargeDino(actor, train);
  return null;
}
