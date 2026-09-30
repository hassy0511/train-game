import type { ResolvedActor } from '../stage/types';
import { BRAKING, LURE } from '../train/params';
import type { Train } from '../train/train';

export interface LureParams {
  look: 'tanuki';
  count: number;
  dance: number;
  danceMax: number;
  dangerDistance: number;
  reaction: number;
  margin: number;
}

/**
 * idle: in its bush; hop: hopping there (too near to come, or dancing in the bush after two fails in a row); come:
 * coming onto the rail; dance: dancing on the rail; back: going back to the bush; bumped: skipped off after the train
 * stopped close by.
 */
export type LureState = 'idle' | 'hop' | 'come' | 'dance' | 'back' | 'bumped';

/** What a group tells the runner: its dance started, it went back, it is home, or the train came too close. */
export type LureOutcome = 'dance' | 'back' | 'idle' | 'danger' | null;

/** How far (m) a train at `speed` m/s needs to stop for a group coming onto the rail (PHASE9 第 4 部 §4.4, §6.2). */
export function stoppingReach(speed: number, reaction: number = LURE.reaction, margin: number = LURE.margin): number {
  const v = Math.abs(speed);
  return (v * v) / (2 * BRAKING) + v * reaction + margin;
}

/**
 * v1.11 (5-1): a group of dance-loving little tanukis ("lure" actor, reactsTo "whistle"; PHASE9_CHAPTER5_6 第 4 部 §4.4)
 * in the bushes of a whistle-reversed stretch. A reversed whistle brings a group that is further ahead than the train
 * can stop in onto the rail at its `at` (LURE.hop s) to dance (LURE.dance s; each whistle while it dances adds
 * LURE.extend s, never past LURE.danceMax in all); a group nearer only hops in its bush. A group comes onto the rail
 * once a try: however often the child whistles, it never keeps the train waiting for good.
 */
export class LureGroup {
  state: LureState = 'idle';
  readonly params: LureParams;
  readonly railId: string;
  readonly at: number;
  /** Came onto the rail this try. */
  private came = false;
  private t = 0;
  private danceLeft = 0;
  private danced = 0;
  private hopFor = 0;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    if (!actor.onRail) throw new Error(`lure "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
    this.params = {
      look: 'tanuki',
      count: 2,
      dance: LURE.dance,
      danceMax: LURE.danceMax,
      dangerDistance: LURE.dangerDistance,
      reaction: LURE.reaction,
      margin: LURE.margin,
      ...(actor.params as Partial<LureParams>),
    };
  }

  distance(): number | null {
    return this.train.distanceAhead(this.railId, this.at);
  }

  /** On the rail (coming or dancing). */
  get onRail(): boolean {
    return this.state === 'come' || this.state === 'dance';
  }

  /**
   * A reversed whistle in its stretch. `mercy`: dance in the bush only. Returns "come" (onto the rail), "hop" (in the
   * bush), "extend" (danced a little longer) or null (nothing: behind the train, or on its way back).
   */
  onWhistle(speed: number, mercy: boolean): 'come' | 'hop' | 'extend' | null {
    if (this.onRail) {
      const more = Math.min(LURE.extend, this.params.danceMax - this.danced - this.danceLeft);
      if (more <= 0 || this.state !== 'dance') return null;
      this.danceLeft += more;
      return 'extend';
    }
    if (this.state !== 'idle') return null;
    const d = this.distance();
    if (d === null || d <= 0) return null;
    if (mercy || this.came || d <= stoppingReach(speed, this.params.reaction, this.params.margin)) {
      this.state = 'hop';
      this.t = 0;
      this.hopFor = mercy ? this.params.dance : LURE.hop * 2;
      return 'hop';
    }
    this.state = 'come';
    this.came = true;
    this.t = 0;
    return 'come';
  }

  update(dt: number): LureOutcome {
    this.t += dt;
    switch (this.state) {
      case 'come':
        if (this.near()) return this.bump();
        if (this.t < LURE.hop) return null;
        this.state = 'dance';
        this.danceLeft = this.params.dance;
        this.danced = 0;
        return 'dance';
      case 'dance':
        if (this.near()) return this.bump();
        this.danceLeft -= dt;
        this.danced += dt;
        if (this.danceLeft > 0) return null;
        this.state = 'back';
        this.t = 0;
        return 'back';
      case 'back':
      case 'hop':
        if (this.t < (this.state === 'hop' ? this.hopFor : LURE.hop)) return null;
        this.state = 'idle';
        return 'idle';
      default:
        return null;
    }
  }

  private near(): boolean {
    const d = this.distance();
    return d !== null && d <= this.params.dangerDistance && d > -2;
  }

  private bump(): LureOutcome {
    this.state = 'bumped';
    return 'danger';
  }

  /** A rewind or a retry: back in its bush, ready to come again. */
  reset(): void {
    this.state = 'idle';
    this.came = false;
    this.t = 0;
    this.danceLeft = 0;
    this.danced = 0;
  }
}
