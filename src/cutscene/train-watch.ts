/** What a TrainWatch reads from the train each frame (src/train/train.ts). */
export interface WatchedTrain {
  readonly state: { railId: string; speed: number };
  /** Signed distance from the car front to `at` on the current rail (loop-aware). */
  offsetTo(at: number): number;
}

interface Watch {
  railId: string;
  at: number;
  until: number;
  last: number | null;
  resolve: () => void;
}

/**
 * v1.12 (えんしゅつ): the cutscene step `trainAt`: waits until the train front passes a place on its rail (or stands
 * within STAND_REACH m of it), or until `max` seconds of game time are up. The caller ticks it every frame.
 */
export class TrainWatch {
  private readonly watches: Watch[] = [];

  /** Resolves when the train front passes `at` on the rail it is on now (game time `now`; at most `max` s). */
  wait(train: WatchedTrain, at: number, max: number, now: number): Promise<void> {
    return new Promise((resolve) => {
      this.watches.push({ railId: train.state.railId, at, until: now + max, last: null, resolve });
      this.update(train, now);
    });
  }

  update(train: WatchedTrain, now: number): void {
    for (let i = this.watches.length - 1; i >= 0; i--) {
      const w = this.watches[i];
      let done = now >= w.until;
      if (!done && train.state.railId === w.railId) {
        const d = train.offsetTo(w.at);
        // Passed now, standing by it, or (asked late) passed a moment ago.
        const late = w.last === null && d <= 0 && d >= -PASSED_REACH;
        done = late || (w.last !== null && w.last > 0 && d <= 0) || (Math.abs(d) <= STAND_REACH && train.state.speed < 0.1);
        w.last = d;
      }
      if (done) {
        this.watches.splice(i, 1);
        w.resolve();
      }
    }
  }

  /** Every wait ends now (a skip, the page leaving). */
  clear(): void {
    for (const w of this.watches.splice(0)) w.resolve();
  }
}

/** A train standing this near the place (m) counts as there. */
const STAND_REACH = 1.5;
/** Asked for a place the train passed less than this far back (m): it is there already. */
const PASSED_REACH = 60;
