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
  /**
   * v1.10 (3-3): this animal's own lines (params say / woke / danger / after), instead of the mission's catNear,
   * catWoke, catDanger and catDangerAfter: a stage with two animals on the rail (a seabird and a sea turtle).
   */
  readonly lines: { say?: string; woke?: string; danger?: string; after?: string };
  private nearAnnounced = false;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    this.params = { ...DEFAULTS, ...(actor.params as Partial<CatParams>) };
    if (!actor.onRail) throw new Error(`cat "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
    const p = actor.params as Record<string, unknown>;
    const text = (k: string): string | undefined => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
    this.lines = { say: text('say'), woke: text('woke'), danger: text('danger'), after: text('after') };
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

  /**
   * v1.11 (5-1): an animal with params.glow true (the hedgehog) lights the whistle while the whistle would move it: not
   * moved yet, from `wakeDistance` to `dangerDistance` m before it (PHASE9_CHAPTER5_6 §0.9 の 8). Other cats never glow.
   */
  glows(): boolean {
    if (this.state !== 'sleep' || (this.actor.params as { glow?: boolean }).glow !== true) return false;
    const d = this.distance();
    return d !== null && d <= this.params.wakeDistance && d > this.params.dangerDistance;
  }

  flee(): void {
    this.state = 'fled';
  }
}
