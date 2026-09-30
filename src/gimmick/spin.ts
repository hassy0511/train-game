import { Emitter } from '../core/events';
import type { JunctionDef } from '../stage/types';
import { SPIN } from '../train/params';
import type { JunctionSide, Train } from '../train/train';

/** v1.11 (5-2): how a spinning fork is now (the test hook data-spins). */
export type SpinState = 'sleep' | 'stay-good' | 'stay-other' | 'turn' | 'hold' | 'fixed' | 'mercy';

/** A spinning fork (junctions[].spin) with its defaults filled in, and how it is now. */
export interface SpinFork {
  junction: JunctionDef;
  id: string;
  railId: string;
  at: number;
  good: JunctionSide;
  other: JunctionSide;
  stay: number;
  turn: number;
  range: number;
  line: string | null;
  /** Asleep (pointing the other way), turning from side to side, or holding the way decided for the train. */
  mode: 'sleep' | 'run' | 'hold';
  /** Seconds since it woke (the side it points follows from it). */
  clock: number;
  /** The way decided at the lock (while holding). */
  held: JunctionSide | null;
  /** The whistle stopped it on the good side (for the rest of the stage). */
  fixed: boolean;
  /** Taken the other way often enough: it waits on the good side. */
  mercy: boolean;
  /** Times the train went the other way (the loop). */
  others: number;
}

export function spinForks(junctions: JunctionDef[]): SpinFork[] {
  return junctions.flatMap((j) => {
    const sp = j.spin;
    if (!sp) return [];
    const good = sp.good;
    return [
      {
        junction: j,
        id: j.id,
        railId: j.railId,
        at: j.at,
        good,
        other: good === 'left' ? ('right' as const) : ('left' as const),
        stay: sp.stay ?? SPIN.stay,
        turn: sp.turn ?? SPIN.turn,
        range: sp.range ?? SPIN.range,
        line: sp.line ?? null,
        mode: 'sleep' as const,
        clock: 0,
        held: null,
        fixed: false,
        mercy: false,
        others: 0,
      },
    ];
  });
}

export interface SpinEvents extends Record<string, unknown> {
  /** It woke up (the train front came within its range): it starts turning. */
  wake: { id: string; line: string | null };
  /** It started turning over towards `side` ("かたかた… くるっ"). */
  turn: { id: string; side: JunctionSide };
  /** It points the good way now ("ぴこん"; the whistle glows). */
  good: { id: string };
  /** The whistle stopped it on the good side ("ぴたっ！"). */
  fixed: { id: string };
  /** The train went `side` (the good way, or round the loop). */
  taken: { id: string; side: JunctionSide; good: boolean };
}

/**
 * v1.11 (5-2, PHASE9_CHAPTER5_6 第 5 部 §4.3): spinning forks ("くるくる ポイント"). Each sleeps pointing away from its good
 * side until the train front is `range` m off, then turns from side to side (the other side first, so the same driving
 * gives the same result). The whistle glows while it points the good way; a whistle then fixes it there for the rest
 * of the stage (a whistle while it does not glow changes nothing: mashing never stops it the wrong way). The way taken
 * is the one it points when the front is SPIN.lockAt m before it; it holds that until the front is SPIN.holdAfter m on.
 * The other side is a loop back before it (never a fail); after SPIN.mercy times round it waits on the good side.
 * Train.routeSide() asks side() (Train.setSpinSides).
 */
export class SpinSystem {
  readonly events = new Emitter<SpinEvents>();
  readonly forks: SpinFork[];
  /** Whistles that fixed a fork (only goes up). */
  fixes = 0;

  constructor(
    junctions: JunctionDef[],
    private readonly train: Train,
  ) {
    this.forks = spinForks(junctions);
  }

  private fork(id: string): SpinFork | undefined {
    return this.forks.find((f) => f.id === id);
  }

  /** Where in its turning cycle a running fork is. */
  private cycle(f: SpinFork): { state: 'stay-good' | 'stay-other' | 'turn'; side: JunctionSide; towards: JunctionSide } {
    const period = 2 * (f.stay + f.turn);
    const c = f.clock % period;
    if (c < f.stay) return { state: 'stay-other', side: f.other, towards: f.other };
    if (c < f.stay + f.turn) return { state: 'turn', side: c - f.stay >= f.turn / 2 ? f.good : f.other, towards: f.good };
    if (c < 2 * f.stay + f.turn) return { state: 'stay-good', side: f.good, towards: f.good };
    return { state: 'turn', side: c - 2 * f.stay - f.turn >= f.turn / 2 ? f.other : f.good, towards: f.other };
  }

  /** The side fork `junctionId` sends the train now (turning: the side it is past half-way to). */
  side(junctionId: string): JunctionSide {
    const f = this.fork(junctionId);
    if (!f) return 'left';
    if (f.mode === 'hold' && f.held) return f.held;
    if (f.fixed || f.mercy) return f.good;
    if (f.mode === 'sleep') return f.other;
    return this.cycle(f).side;
  }

  state(junctionId: string): SpinState {
    const f = this.fork(junctionId);
    if (!f) return 'sleep';
    if (f.mode === 'hold') return 'hold';
    if (f.fixed) return 'fixed';
    if (f.mercy) return 'mercy';
    if (f.mode === 'sleep') return 'sleep';
    return this.cycle(f).state;
  }

  /** "kuru-1:sleep,kuru-2:stay-good" (the test hook data-spins). */
  get states(): string {
    return this.forks.map((f) => `${f.id}:${this.state(f.id)}`).join(',');
  }

  /** Where each fork points now and whether it glows (for the view). */
  get looks(): { id: string; side: JunctionSide; turning: boolean; good: boolean }[] {
    return this.forks.map((f) => {
      const side = this.side(f.id);
      const turning = f.mode === 'run' && !f.fixed && !f.mercy && this.cycle(f).state === 'turn';
      return { id: f.id, side, turning, good: side === f.good && !turning };
    });
  }

  /** The front's distance to fork `f` along the way the train is going (null: not ahead on its way). */
  distance(f: SpinFork): number | null {
    return this.train.routeDistance(f.railId, f.at);
  }

  /** The fork the whistle glows for now: pointing the good way, `range`..SPIN.minGlow m ahead, not fixed yet. */
  get glowing(): SpinFork | null {
    for (const f of this.forks) {
      if (f.fixed || f.mode === 'hold') continue;
      const good = f.mercy || (f.mode === 'run' && this.cycle(f).state === 'stay-good');
      if (!good) continue;
      const d = this.distance(f);
      if (d !== null && d <= f.range && d >= SPIN.minGlow) return f;
    }
    return null;
  }

  get glow(): boolean {
    return this.glowing !== null;
  }

  /** A whistle: true when it fixed a fork (only while one glows; otherwise nothing changes). */
  onWhistle(): boolean {
    const f = this.glowing;
    if (!f) return false;
    f.fixed = true;
    this.fixes += 1;
    this.events.emit('fixed', { id: f.id });
    return true;
  }

  /** How far past fork `f` the front is along the way it was sent (for the end of the hold). */
  private pastBy(f: SpinFork): number {
    const t = this.train;
    if (t.state.railId === f.railId) return t.frontS - f.at;
    const to = f.held ? f.junction[f.held] : undefined;
    if (to !== undefined && t.state.railId === to) return t.frontS;
    return Infinity;
  }

  update(dt: number): void {
    for (const f of this.forks) {
      if (f.mode === 'hold') {
        if (this.pastBy(f) < SPIN.holdAfter) continue;
        const side = f.held ?? f.good;
        const good = side === f.good;
        if (!good) {
          f.others += 1;
          if (f.others >= SPIN.mercy) f.mercy = true;
        }
        f.mode = 'sleep';
        f.held = null;
        f.clock = 0;
        this.events.emit('taken', { id: f.id, side, good });
        continue;
      }
      const d = this.distance(f);
      if (d !== null && d <= SPIN.lockAt && d > -TRAIN_PAST) {
        f.held = this.side(f.id);
        f.mode = 'hold';
        continue;
      }
      if (f.mode === 'sleep') {
        if (d === null || d > f.range || d <= SPIN.lockAt) continue;
        f.mode = 'run';
        f.clock = 0;
        if (!f.fixed && !f.mercy) this.events.emit('wake', { id: f.id, line: f.line });
        continue;
      }
      // Running: it only turns while the train is on its way to it (put back out of range, it sleeps again).
      if (d === null || d > f.range) {
        f.mode = 'sleep';
        f.clock = 0;
        continue;
      }
      if (f.fixed || f.mercy) continue;
      const before = this.cycle(f);
      f.clock += dt;
      const after = this.cycle(f);
      if (after.state !== before.state) {
        if (after.state === 'turn') this.events.emit('turn', { id: f.id, side: after.towards });
        if (after.state === 'stay-good') this.events.emit('good', { id: f.id });
      }
    }
  }

  /**
   * After a rewind: every fork asleep again (it wakes as the train comes into range; fixed and mercy stay). Resume
   * (`resumeAt`): the forks on the way there (before it on its rail) are fixed.
   */
  reset(opts: { resumeAt?: { railId: string; at: number } } = {}): void {
    for (const f of this.forks) {
      f.mode = 'sleep';
      f.clock = 0;
      f.held = null;
      const r = opts.resumeAt;
      if (r && r.railId === f.railId && f.at < r.at) f.fixed = true;
    }
  }
}

/** A fork the front is already this far past is not locked again (the front on its rail past it). */
const TRAIN_PAST = 2;
