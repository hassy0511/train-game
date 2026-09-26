import type { GimmickDef } from '../stage/types';
import { BOUGH, JUMP } from '../train/params';
import type { Train } from '../train/train';
import { param } from './zones';

interface Bough {
  /** Place in gimmicks[] (the view's id for it). */
  index: number;
  railId: string;
  from: number;
  to: number;
  sag: number;
  launch: number;
  height: number;
  /** Tip deflection (m, positive = down) and its speed. */
  y: number;
  v: number;
  /** Thrown this pass (cleared when the train is back before the bough). */
  thrown: boolean;
}

/**
 * Springy boughs (gimmicks "bough"): the rail from `from` (fixed at the trunk) to `to` (the free tip) bends
 * under the train, more the faster it runs, and throws it when the lead bogie reaches the tip. Owns the bend
 * (a damped spring per bough); the train follows it through `sagAt`, the view through `bough` events.
 */
export class BoughSystem {
  private readonly boughs: Bough[];

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
    private readonly onBend: (index: number, sag: number) => void,
    private readonly onThrow: () => void,
  ) {
    this.boughs = gimmicks.flatMap((g, index) =>
      g.type === 'bough' && g.railId !== undefined && g.from !== undefined && g.to !== undefined
        ? [
            {
              index,
              railId: g.railId,
              from: g.from,
              to: g.to,
              sag: param(g, 'sag', BOUGH.sag),
              launch: param(g, 'launch', BOUGH.launch),
              height: param(g, 'height', BOUGH.height),
              y: 0,
              v: 0,
              thrown: false,
            },
          ]
        : [],
    );
    if (this.boughs.length > 0) train.sagAt = (railId, s) => this.sagAt(railId, s);
  }

  get count(): number {
    return this.boughs.length;
  }

  /** Deflection (m, down) of the rail at `s`: none at the trunk, most at the tip (a cantilever, u²). */
  sagAt(railId: string, s: number): number {
    let total = 0;
    for (const b of this.boughs) {
      if (b.railId !== railId || s <= b.from || s >= b.to + 0.5) continue;
      const u = Math.min(1, (s - b.from) / (b.to - b.from));
      total += b.y * u * u;
    }
    return total;
  }

  update(dt: number): void {
    const train = this.train;
    const railId = train.state.railId;
    const bogie = train.bogieS;
    let blocked = false;
    for (const b of this.boughs) {
      const onIt = railId === b.railId && bogie > b.from - 2 && bogie < b.to && !train.airborne;
      if (railId === b.railId && bogie < b.from) b.thrown = false;
      if (onIt) blocked = true;
      // Heavier (faster) trains bend it further; off it, it springs back and wobbles out.
      const load = Math.min(1, train.state.speed / BOUGH.fullSpeed);
      const target = onIt ? b.sag * (0.3 + 0.7 * load) : 0;
      b.v += (BOUGH.stiffness * (target - b.y) - BOUGH.damping * b.v) * dt;
      b.y += b.v * dt;
      if (!b.thrown && railId === b.railId && bogie >= b.to - 1.5 && bogie < b.to + 1 && !train.airborne) {
        b.thrown = true;
        const length = train.jumpSpeed * JUMP.airTime * b.launch;
        if (train.launch(length, b.height)) {
          b.v -= BOUGH.kick;
          this.onThrow();
        }
      }
      if (Math.abs(b.y) > 0.002 || Math.abs(b.v) > 0.002) this.onBend(b.index, b.y);
    }
    train.jumpBlocked = blocked;
  }

  /** After a rewind: every bough at rest. */
  reset(): void {
    for (const b of this.boughs) {
      b.y = 0;
      b.v = 0;
      b.thrown = false;
      this.onBend(b.index, 0);
    }
  }
}
