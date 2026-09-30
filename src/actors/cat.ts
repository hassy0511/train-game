import type { ResolvedActor } from '../stage/types';
import { WINDUP } from '../train/params';
import type { Train } from '../train/train';

/** v1.11 (5-2): "stopped": a wind-up toy the train stopped for (it stays on the rail, ticking). */
export type CatState = 'sleep' | 'awake' | 'fled' | 'stopped';

export interface CatParams {
  wakeDistance: number;
  dangerDistance: number;
  /** Lateral distance (m, to the right of travel) the cat walks to when it leaves the rail. */
  fleeLateral: number;
  fleeSeconds: number;
  /**
   * v1.11 (5-2): walks back towards the train, `speed` m/s, from when the front is `from` m off (default
   * WINDUP.walkFrom), for at most `max` m.
   */
  walk?: { speed: number; max: number; from?: number };
}

const DEFAULTS: CatParams = { wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2 };

/** v1.11 (5-2): `walk` starts (the view moves the toy to `to` m along its rail in `seconds`). */
export type CatOutcome = { kind: 'near' } | { kind: 'danger' } | { kind: 'walk'; to: number; seconds: number } | null;

/** A cat asleep on the rail. Wakes to the whistle when close enough; otherwise the train must stop. */
export class CatActor {
  state: CatState = 'sleep';
  readonly params: CatParams;
  readonly railId: string;
  /** Where it was placed (the rewind goes back from here). */
  readonly placedAt: number;
  /** v1.11 (5-2): metres it has walked back towards the train this try. */
  private walked = 0;
  private walking = false;
  /**
   * v1.10 (3-3): this animal's own lines (params say / woke / danger / after), instead of the mission's catNear,
   * catWoke, catDanger and catDangerAfter: a stage with two animals on the rail (a seabird and a sea turtle).
   */
  readonly lines: { say?: string; woke?: string; danger?: string; after?: string };
  /** v1.11 (5-2): a reverse-wound toy (look "windup-chick" or "windup-car"): soft, turned by the whistle. */
  readonly windup: boolean;
  private nearAnnounced = false;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    this.params = { ...DEFAULTS, ...(actor.params as Partial<CatParams>) };
    if (!actor.onRail) throw new Error(`cat "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.placedAt = actor.onRail.at;
    const p = actor.params as Record<string, unknown>;
    const text = (k: string): string | undefined => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
    this.lines = { say: text('say'), woke: text('woke'), danger: text('danger'), after: text('after') };
    this.windup = typeof p.look === 'string' && p.look.startsWith('windup-');
  }

  /** Where it is now along its rail (v1.11: a walking toy comes nearer the train). */
  get at(): number {
    return this.placedAt - this.walked;
  }

  /** "sleep" | "walk" | "awake" | "fled" | "stopped" (the test hook data-actors). */
  get shownState(): string {
    return this.state === 'sleep' && this.walking ? 'walk' : this.state;
  }

  reset(): void {
    this.state = 'sleep';
    this.nearAnnounced = false;
    this.walked = 0;
    this.walking = false;
  }

  /** Distance from the train front to the cat along the rail (null if on another rail). */
  distance(): number | null {
    return this.train.distanceAhead(this.railId, this.at);
  }

  update(dt = 0): CatOutcome {
    if (this.state !== 'sleep') return null;
    const d = this.distance();
    if (d === null) return null;
    const walk = this.params.walk;
    if (walk && this.walked < walk.max) {
      if (!this.walking && d <= (walk.from ?? WINDUP.walkFrom) && d > this.params.dangerDistance) {
        this.walking = true;
        return { kind: 'walk', to: this.placedAt - walk.max, seconds: walk.max / walk.speed };
      }
      if (this.walking) this.walked = Math.min(walk.max, this.walked + walk.speed * dt);
    }
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
   * v1.11 (5-2): a wind-up toy next to one the whistle wound (a group within WINDUP.group m) is wound with it: one whistle
   * for the three chicks walking together. True if it was still wound backwards.
   */
  windWithGroup(): boolean {
    if (this.state !== 'sleep' || !this.windup) return false;
    this.state = 'awake';
    return true;
  }

  /**
   * v1.11 (5-1): an animal with params.glow true (the hedgehog) lights the whistle while the whistle would move it: not
   * moved yet, from `wakeDistance` to `dangerDistance` m before it (PHASE9_CHAPTER5_6 §0.9 の 8). Other cats never glow.
   * v1.11 (5-2): the wind-up toys too.
   */
  glows(): boolean {
    if (this.state !== 'sleep' || (this.actor.params as { glow?: boolean }).glow !== true) return false;
    const d = this.distance();
    return d !== null && d <= this.params.wakeDistance && d > this.params.dangerDistance;
  }

  flee(): void {
    this.state = this.windup ? 'stopped' : 'fled';
  }
}
