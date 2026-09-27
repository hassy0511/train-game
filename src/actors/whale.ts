import type { ResolvedActor, WhaleParams } from '../stage/types';
import { WHALE } from '../train/params';
import type { Train } from '../train/train';

/**
 * What a whale is doing: waiting where it lives ("idle"), singing back to a whistle ("sing"), swimming along beside
 * the train front ("follow"), trailing behind a train that did not greet it ("trail"), or gone on ahead ("away").
 */
export type WhaleState = 'idle' | 'sing' | 'follow' | 'trail' | 'away';

/** Something the runner says or shows about a whale this frame. */
export type WhaleOutcome =
  | { kind: 'near' }
  /** The whistle starts to glow for it (first time on this try). */
  | { kind: 'call' }
  | { kind: 'state'; state: WhaleState };

/**
 * v1.10 (3-1): a gentle whale beside the rail (PHASE8 part 3 §4.5). Greeted with the whistle it sings back and swims
 * along with the train, and its current pushes the train on; never a fail. Distances are along its rail, at the
 * train front.
 */
export class Whale {
  readonly railId: string;
  readonly at: number;
  readonly params: Required<WhaleParams>;
  state: WhaleState = 'idle';
  /** Greeted once: a rewind to before `until` keeps it a friend (it follows again at once). */
  private friend = false;
  private singLeft = 0;
  private nearSaid = false;
  private callSaid = false;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    if (!actor.onRail) throw new Error(`whale "${actor.id}" must be placed on a rail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
    const p = actor.params as Partial<WhaleParams>;
    this.params = {
      until: Number(p.until),
      callRange: p.callRange ?? WHALE.callRange,
      lead: p.lead ?? WHALE.lead,
      lateral: p.lateral ?? WHALE.lateral,
      height: p.height ?? WHALE.height,
      trail: p.trail ?? WHALE.trail,
    };
  }

  /** Signed distance from the train front to the whale's home, or null on another rail. */
  private distance(): number | null {
    return this.train.distanceAhead(this.railId, this.at);
  }

  /** The train front is between where the whistle reaches it and `until`. */
  private get inReach(): boolean {
    const d = this.distance();
    return d !== null && d <= this.params.callRange && this.train.frontS < this.params.until;
  }

  /** It can be greeted now (the whistle glows). */
  get callable(): boolean {
    return (this.state === 'idle' || this.state === 'trail') && this.inReach;
  }

  /** It swims along and its current pushes (singing counts: the greeting is done). */
  get following(): boolean {
    return this.state === 'follow' || this.state === 'sing';
  }

  update(dt: number): WhaleOutcome[] {
    const out: WhaleOutcome[] = [];
    const d = this.distance();
    if (d !== null && !this.nearSaid && d > 0 && d <= WHALE.near) {
      this.nearSaid = true;
      out.push({ kind: 'near' });
    }
    if (this.callable && !this.callSaid) {
      this.callSaid = true;
      out.push({ kind: 'call' });
    }
    if (this.state === 'sing') {
      this.singLeft -= dt;
      if (this.singLeft <= 0) this.set('follow', out);
    }
    const front = this.train.state.railId === this.railId ? this.train.frontS : null;
    // Passed by without a greeting: it trails along behind, still ready to be called.
    if (this.state === 'idle' && d !== null && d < -this.params.trail) this.set('trail', out);
    // Past `until` (or off its rail ahead of it) it swims away.
    if ((this.state === 'follow' || this.state === 'trail') && front !== null && front >= this.params.until) this.set('away', out);
    return out;
  }

  /** The whistle: greets it when it can be greeted. */
  onWhistle(): boolean {
    if (!this.callable) return false;
    this.friend = true;
    this.singLeft = WHALE.singSeconds;
    this.state = 'sing';
    return true;
  }

  private set(state: WhaleState, out: WhaleOutcome[]): void {
    if (this.state === state) return;
    this.state = state;
    out.push({ kind: 'state', state });
  }

  /**
   * After a rewind to `target` (or the stage start): a friend put back before `until` swims along again at once (once
   * greeted it does not forget); a
   * train put back past `until` finds it gone; otherwise it waits at home. The lines may come again.
   */
  reset(target?: { railId: string; at: number }): WhaleState {
    const before = !target || target.railId !== this.railId || target.at < this.params.until;
    if (!before) this.state = 'away';
    else if (this.friend) this.state = 'follow';
    else this.state = 'idle';
    this.singLeft = 0;
    this.nearSaid = this.state !== 'idle';
    this.callSaid = this.state !== 'idle';
    return this.state;
  }
}
