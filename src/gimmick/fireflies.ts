import type { JunctionDef } from '../stage/types';
import { FIREFLY_FORK } from '../train/params';
import type { JunctionSide, Train } from '../train/train';

/** sleep: resting in the grass; home: lining the true way; lost: circling over a fake fork. */
export type FireflyState = 'sleep' | 'home' | 'lost';

/** v1.11 (5-1): a firefly fork (junctions[].fireflies) with its defaults filled in, and how it is now. */
export interface FireflyFork {
  junction: JunctionDef;
  id: string;
  railId: string;
  at: number;
  callFrom: number;
  callTo: number;
  count: number;
  fake: boolean;
  /** The true way: the side that is not `default` (as at a reversed sign). */
  trueSide: JunctionSide;
  state: FireflyState;
  /** A fake fork the light has seen through. */
  revealed: boolean;
}

export function fireflyForks(junctions: JunctionDef[]): Omit<FireflyFork, 'state' | 'revealed'>[] {
  return junctions.flatMap((j) => {
    const f = j.fireflies;
    if (!f) return [];
    return [
      {
        junction: j,
        id: j.id,
        railId: j.railId,
        at: j.at,
        callFrom: f.callFrom ?? FIREFLY_FORK.callFrom,
        callTo: f.callTo ?? FIREFLY_FORK.callTo,
        count: f.count ?? FIREFLY_FORK.count,
        fake: f.fake === true,
        trueSide: j.default === 'left' ? ('right' as const) : ('left' as const),
      },
    ];
  });
}

/**
 * v1.11 (5-1): firefly forks (PHASE9_CHAPTER5_6 第 4 部 §4.5). While the train front is `callTo`–`callFrom` m before one
 * (along the way it is going) the whistle glows; whistled, the fireflies fly up and line the true way, whose arrow lights
 * and which becomes the way taken (the child can still tap the other arrow). A fork's fireflies fly once a try. A fake
 * fork (Sakasa's pink lanterns) does not glow the whistle until the light has seen through it: whistled before, its
 * fireflies lose their way over it until then.
 */
export class FireflyForks {
  readonly forks: FireflyFork[];
  /** Whistles that woke a fork's fireflies (only goes up; a test hook). */
  calls = 0;

  constructor(
    junctions: JunctionDef[],
    private readonly train: Train,
  ) {
    this.forks = fireflyForks(junctions).map((f) => ({ ...f, state: 'sleep' as const, revealed: false }));
  }

  /** Distance from the train front to fork `f` along the way it is going (null: not on it). */
  distance(f: FireflyFork): number | null {
    return this.train.distanceAhead(f.railId, f.at);
  }

  /** The fork whose calling reach the train front is in, or null. */
  get callable(): FireflyFork | null {
    for (const f of this.forks) {
      const d = this.distance(f);
      if (d !== null && d >= f.callTo && d <= f.callFrom) return f;
    }
    return null;
  }

  /** The whistle glows: a fork in reach whose fireflies can still fly (a fake one only once seen through). */
  get glow(): boolean {
    const f = this.callable;
    if (!f || f.state === 'home') return false;
    return f.fake ? f.revealed : f.state === 'sleep';
  }

  /** The whistle sounded: the fork in reach and what its fireflies did (null: none in reach, or they flew already). */
  call(): { fork: FireflyFork; state: 'home' | 'lost' } | null {
    const f = this.callable;
    if (!f || f.state === 'home' || (f.state === 'lost' && !f.revealed)) return null;
    this.calls += 1;
    f.state = f.fake && !f.revealed ? 'lost' : 'home';
    return { fork: f, state: f.state };
  }

  /** The light saw through fork `id`: lost fireflies find the true way now. Returns the fork when they did. */
  reveal(id: string): FireflyFork | null {
    const f = this.forks.find((x) => x.id === id);
    if (!f || !f.fake) return null;
    f.revealed = true;
    if (f.state !== 'lost') return null;
    f.state = 'home';
    return f;
  }

  /** "hotaru-1:home,hotaru-2:sleep" (test hook). */
  get states(): string {
    return this.forks.map((f) => `${f.id}:${f.state}`).join(',');
  }

  /** A rewind or a retry: every firefly back in the grass, every fake fork not seen through. */
  reset(): void {
    for (const f of this.forks) {
      f.state = 'sleep';
      f.revealed = false;
    }
  }
}
