import type { GimmickDef } from '../stage/types';
import { FRAGILE } from '../train/params';
import type { Train } from '../train/train';
import { param } from './zones';

export type FragileOutcome = { kind: 'near' } | { kind: 'shake' } | { kind: 'calm' } | { kind: 'boing' } | { kind: 'clear' } | null;

interface Fragile {
  index: number;
  railId: string;
  from: number;
  to: number;
  maxSpeed: number;
  grace: number;
  warn: number;
  rewindAt: number;
  /** Seconds spent too fast on it. */
  over: number;
  state: 'ahead' | 'near' | 'on' | 'shake' | 'done';
}

/**
 * Sagging silk bridges (2-2, gimmicks "fragile"): cross slowly. Too fast for `grace` seconds and the silk
 * bounces the train back ("ぼよよーん", never scary). The lever's slow notch glows from `warn` m before.
 */
export class FragileBridges {
  readonly items: Fragile[];

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
  ) {
    this.items = gimmicks.flatMap((g, index) =>
      g.type === 'fragile' && g.railId !== undefined && g.from !== undefined && g.to !== undefined
        ? [
            {
              index,
              railId: g.railId,
              from: g.from,
              to: g.to,
              maxSpeed: param(g, 'maxSpeed', FRAGILE.maxSpeed),
              grace: param(g, 'grace', FRAGILE.grace),
              warn: param(g, 'warn', FRAGILE.warn),
              rewindAt: param(g, 'rewindAt', g.from - 60),
              over: 0,
              state: 'ahead' as const,
            },
          ]
        : [],
    );
  }

  /** "" | near | on | shake: the bridge the train is at (test hook). */
  get status(): string {
    const f = this.current();
    return f && f.state !== 'ahead' && f.state !== 'done' ? f.state : '';
  }

  /** The fastest notch speed allowed on the bridge ahead or under the train, or null (lever hint). */
  get hintSpeed(): number | null {
    const f = this.current();
    return f && (f.state === 'near' || f.state === 'on' || f.state === 'shake') ? f.maxSpeed : null;
  }

  private current(): Fragile | null {
    const railId = this.train.state.railId;
    const front = this.train.frontS;
    return this.items.find((f) => f.railId === railId && front >= f.from - f.warn && front <= f.to + 2) ?? null;
  }

  update(dt: number): { item: Fragile; outcome: FragileOutcome }[] {
    const out: { item: Fragile; outcome: FragileOutcome }[] = [];
    const train = this.train;
    const front = train.frontS;
    for (const f of this.items) {
      if (train.state.railId !== f.railId) continue;
      if (f.state === 'ahead' && front >= f.from - f.warn && front < f.to) {
        f.state = 'near';
        out.push({ item: f, outcome: { kind: 'near' } });
      }
      if ((f.state === 'near' || f.state === 'on' || f.state === 'shake') && front > f.to) {
        f.state = 'done';
        f.over = 0;
        out.push({ item: f, outcome: { kind: 'clear' } });
        continue;
      }
      const onIt = front >= f.from && front <= f.to && !train.airborne;
      if (!onIt) continue;
      if (f.state === 'near') f.state = 'on';
      if (train.state.speed > f.maxSpeed + FRAGILE.slack) {
        f.over += dt;
        if (f.state !== 'shake') {
          f.state = 'shake';
          out.push({ item: f, outcome: { kind: 'shake' } });
        }
        if (f.over >= f.grace) {
          f.over = 0;
          out.push({ item: f, outcome: { kind: 'boing' } });
        }
      } else {
        f.over = Math.max(0, f.over - dt);
        if (f.state === 'shake' && f.over === 0) {
          f.state = 'on';
          out.push({ item: f, outcome: { kind: 'calm' } });
        }
      }
    }
    return out;
  }

  /** After a rewind: bridges the train is back before start over. */
  reset(): void {
    const railId = this.train.state.railId;
    const front = this.train.frontS;
    for (const f of this.items) {
      if (f.railId !== railId || front < f.to) {
        f.state = 'ahead';
        f.over = 0;
      }
    }
  }
}
