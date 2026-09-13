import type { ResolvedActor } from '../stage/types';
import type { Train } from '../train/train';

export type CatState = 'sleep' | 'awake' | 'fled';

export interface CatParams {
  wakeDistance: number;
  dangerDistance: number;
  /** Lateral distance (m, to the right of travel) the cat walks to when it leaves the rail. */
  fleeLateral: number;
  fleeSeconds: number;
}

const DEFAULTS: CatParams = { wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2 };

export type CatOutcome = { kind: 'near' } | { kind: 'danger' } | null;

/** A cat asleep on the rail. Wakes to the whistle when close enough; otherwise the train must stop. */
export class CatActor {
  state: CatState = 'sleep';
  readonly params: CatParams;
  readonly railId: string;
  readonly at: number;
  private nearAnnounced = false;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    this.params = { ...DEFAULTS, ...(actor.params as Partial<CatParams>) };
    if (!actor.onRail) throw new Error(`cat "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
  }

  reset(): void {
    this.state = 'sleep';
    this.nearAnnounced = false;
  }

  /** Distance from the train front to the cat along the rail (null if on another rail). */
  distance(): number | null {
    return this.train.distanceAhead(this.railId, this.at);
  }

  update(): CatOutcome {
    if (this.state !== 'sleep') return null;
    const d = this.distance();
    if (d === null) return null;
    if (!this.nearAnnounced && d <= this.params.wakeDistance && d > this.params.dangerDistance) {
      this.nearAnnounced = true;
      return { kind: 'near' };
    }
    if (d <= this.params.dangerDistance && d > -2) return { kind: 'danger' };
    return null;
  }

  /** Called when the whistle sounds. Returns true if the cat woke up. */
  onWhistle(): boolean {
    if (this.state !== 'sleep') return false;
    const d = this.distance();
    if (d === null || d > this.params.wakeDistance || d < -2) return false;
    this.state = 'awake';
    return true;
  }

  flee(): void {
    this.state = 'fled';
  }
}
