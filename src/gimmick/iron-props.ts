import { Emitter } from '../core/events';
import type { IronProp } from '../stage/types';
import { IRON_PROPS } from '../train/params';
import type { Train } from '../train/train';
import type { LightMode } from './light-switch';

/** What the iron odd or end being tugged does now: flying over, stuck on the train, dropping off, a bell stretching. */
export type IronPhase = 'fly' | 'stuck' | 'fall' | 'bell';

export interface IronActive {
  prop: IronProp;
  phase: IronPhase;
  /** Seconds into the phase. */
  t: number;
}

/**
 * v1.11 (PR5, PHASE9_0 §3, 第 2 部 M3.4): the iron odds and ends by the line. In the magnet step, with nothing being
 * pulled, the nearest one IRON_PROPS.nearest..reach m along the way ahead and within sideMax m of the rail is tugged:
 * a can or a bucket flies over ("びよん"), sticks under the front of the train for a while and drops off ("からん"),
 * rolling to a stop by the line; a sign's bell stretches out on its string ("びよん… ちりん") and springs back
 * ("からん"), never coming off. One at a time; each once a try. No fail, no record, no speed change. Only once the
 * magnet light is learned (before that they are not drawn either).
 */
export class IronProps {
  enabled = false;
  readonly events = new Emitter<{ biyon: { prop: IronProp }; karan: { prop: IronProp } }>();
  private current: IronActive | null = null;
  private wait = 0;
  private readonly used = new Set<number>();
  /** Test hook: odds and ends tugged so far (only grows). */
  count = 0;

  constructor(
    readonly props: readonly IronProp[],
    private readonly train: Train,
  ) {}

  get active(): IronActive | null {
    return this.current;
  }

  update(dt: number, ctx: { mode: LightMode; pulling: boolean; phase: string }): void {
    const P = IRON_PROPS;
    const a = this.current;
    if (a) {
      a.t += dt;
      if (a.phase === 'fly' && a.t >= P.flySeconds) this.to('stuck');
      else if (a.phase === 'stuck' && a.t >= P.stickSeconds) {
        this.to('fall');
        this.events.emit('karan', { prop: a.prop });
      } else if (a.phase === 'fall' && a.t >= P.rollSeconds) this.end();
      else if (a.phase === 'bell' && a.t >= P.flySeconds + P.bellHold) {
        this.events.emit('karan', { prop: a.prop });
        this.end();
      }
      return;
    }
    if (this.wait > 0) {
      this.wait = Math.max(0, this.wait - dt);
      return;
    }
    const active = ctx.phase === 'driving' || ctx.phase === 'stopped';
    if (!this.enabled || !active || ctx.mode !== 'magnet' || ctx.pulling) return;
    let best: { prop: IronProp; d: number } | null = null;
    for (const prop of this.props) {
      if (this.used.has(prop.index) || Math.abs(prop.lateral) > P.sideMax) continue;
      const d = this.train.routeDistance(prop.railId, prop.at);
      if (d === null || d < P.nearest || d > P.reach) continue;
      if (!best || d < best.d) best = { prop, d };
    }
    if (!best) return;
    this.used.add(best.prop.index);
    this.count += 1;
    this.current = { prop: best.prop, phase: best.prop.look === 'bell' ? 'bell' : 'fly', t: 0 };
    this.events.emit('biyon', { prop: best.prop });
  }

  private to(phase: IronPhase): void {
    if (this.current) this.current = { prop: this.current.prop, phase, t: 0 };
  }

  private end(): void {
    this.current = null;
    this.wait = IRON_PROPS.gapSeconds;
  }

  /** A rewind, a resume, a start over: everything back in its place, and each may be tugged again. */
  reset(): void {
    this.current = null;
    this.wait = 0;
    this.used.clear();
  }
}
