import type { ChaseDef } from '../stage/types';
import { SNOW_WAVE } from '../train/params';
import type { Train } from '../train/train';

/**
 * - `armed`: set for the step, not out yet (the front has not passed `from`).
 * - `run`: chasing.
 * - `wait`: put back after a fail: it waits where it is until the train moves.
 * - `caught`: it caught the train (the fail plays).
 * - `safe`: the train got past `until`; the wave runs into the fence and settles.
 */
export type SnowWaveState = 'armed' | 'run' | 'wait' | 'caught' | 'safe';

/** What the panel, the view and the test hooks read. */
export interface SnowWaveView {
  state: SnowWaveState;
  /** Metres from the last car back to the wave's front (0 = caught). */
  gap: number;
  /** The gap as a share of SNOW_WAVE.meter, 0..1 (the panel's band). */
  fraction: number;
  catches: number;
  /** Where the wave's front is (on the chase's rail) and how fast it runs, for the view. */
  railId: string;
  s: number;
  speed: number;
}

/** What happened this frame. */
export type SnowWaveOutcome = 'start' | 'near' | 'far' | 'caught' | 'safe' | null;

/**
 * v1.10 (4-3): the snow wave ("ゆきの なみ", PHASE8 第 8 部 §4.1): a "chaser" along the train's own rail (a place and a
 * speed; no physics). It runs behind the train over one mission step, faster on the downhills and slower up the
 * steep ones (`paces`), closes in on a far-ahead train like a rubber band, and gets slower each time it catches the
 * train (after SNOW_WAVE.giveUpAfter catches it cannot catch it any more). Counted while driving only.
 */
export class SnowWave {
  state: SnowWaveState = 'armed';
  /** Metres from the train's last car back to the wave. */
  gap = 0;
  speed = 0;
  catches = 0;
  private nearSaid = false;
  private farSaid = false;
  /** The train front where the wave caught it (for the retry place). */
  caughtAt = 0;
  /** Seconds since it got to the fence (the view settles it). */
  settled = 0;
  private readonly p: { [K in keyof typeof SNOW_WAVE]: number } & ChaseDef;

  constructor(
    readonly def: ChaseDef,
    private readonly train: Train,
  ) {
    const own = Object.fromEntries(Object.entries(def).filter(([, v]) => v !== undefined));
    this.p = { ...SNOW_WAVE, ...own } as { [K in keyof typeof SNOW_WAVE]: number } & ChaseDef;
  }

  /** True while it is out behind the train (not before it came out, not after the fence). */
  get active(): boolean {
    return this.state === 'run' || this.state === 'wait' || this.state === 'caught';
  }

  /** The wave's front on the chase's rail (m). */
  get s(): number {
    return this.train.frontS - this.p.trainLength - this.gap;
  }

  get view(): SnowWaveView {
    return {
      state: this.state,
      gap: this.gap,
      fraction: Math.max(0, Math.min(1, this.gap / this.p.meter)),
      catches: this.catches,
      railId: this.def.railId,
      s: this.state === 'safe' ? this.def.fence : this.s,
      speed: this.speed,
    };
  }

  /** The "はやい" notch should glow: the wave is close and the train is slower than "はやい". */
  get leverHint(): boolean {
    return (this.state === 'run' || this.state === 'wait') && this.gap < this.p.leverHintGap && this.train.state.speed < this.p.fastSpeed;
  }

  /** The wave is close enough for the rocket to help (the rocket system adds its own conditions). */
  get rocketNear(): boolean {
    return this.state === 'run' && this.gap < this.p.rocketGlow;
  }

  /** Near enough for the white at the screen edge and the "もこもこ" to be loud. */
  get near(): boolean {
    return (this.state === 'run' || this.state === 'wait') && this.gap < this.p.near;
  }

  /** The speed it aims for now, where it is. */
  private target(): number {
    const p = this.p;
    const w = this.s;
    let pace = p.pace;
    for (const z of p.paces ?? []) if (w >= z.from && w < z.to) pace = z.speed;
    // Far behind a fast train: it closes in (never faster than bandMax, so the rocket still gets away).
    if (this.gap > p.far) pace = Math.max(pace, Math.min(this.train.state.speed + p.bandLead, p.bandMax));
    // Each catch slows it; after giveUpAfter it is tired out.
    if (this.catches > 0) pace = Math.max(pace - p.assist * this.catches, p.minPace);
    if (this.catches >= p.giveUpAfter) pace = Math.min(pace, p.tiredPace);
    return pace;
  }

  /** One driving frame. */
  update(dt: number): SnowWaveOutcome {
    const t = this.train;
    const p = this.p;
    const front = t.state.railId === this.def.railId ? t.frontS : null;
    if (this.state === 'armed') {
      if (front === null || front < this.def.from) return null;
      this.state = 'run';
      this.gap = p.start;
      this.speed = p.pace;
      return 'start';
    }
    if (this.state === 'safe') {
      this.settled += dt;
      return null;
    }
    if (this.state === 'caught') return null;
    if (front !== null && front >= this.def.until.at && t.state.railId === this.def.until.railId) {
      this.state = 'safe';
      this.settled = 0;
      return 'safe';
    }
    if (this.state === 'wait') {
      if (t.state.speed <= p.moveToStart) return null;
      this.state = 'run';
      this.speed = 0;
    }
    const aim = this.target();
    this.speed = aim > this.speed ? Math.min(aim, this.speed + p.accel * dt) : aim;
    this.gap -= (this.speed - t.state.speed) * dt;
    if (this.gap <= 0 && !t.airborne && !t.isFalling) {
      this.gap = 0;
      this.state = 'caught';
      this.caughtAt = t.frontS;
      return 'caught';
    }
    // In the air it waits for the landing (the train lands in front of it or is caught then).
    this.gap = Math.max(0, this.gap);
    if (!this.nearSaid && this.gap < p.near) {
      this.nearSaid = true;
      return 'near';
    }
    if (!this.farSaid && this.gap > p.farLine) {
      this.farSaid = true;
      return 'far';
    }
    return null;
  }

  /**
   * Where a catch puts the train front back: the nearest `retry` place at least SNOW_WAVE.retryBehind m behind where
   * it was caught (the first one when none is that far back).
   */
  retryPlace(): { railId: string; at: number } {
    const limit = this.caughtAt - this.p.retryBehind;
    const places = [...this.def.retry].sort((a, b) => a - b);
    let at = places[0] ?? this.def.from - this.p.retryBehind;
    for (const r of places) if (r <= limit) at = r;
    return { railId: this.def.railId, at };
  }

  /**
   * After the train was put back (any fail): the wave waits `restart` m behind the last car and starts again once the
   * train moves. A catch counts (slower from now on). Its lines may be said again.
   */
  afterRewind(caught: boolean): void {
    if (!this.active) return;
    if (caught) this.catches += 1;
    this.state = 'wait';
    this.gap = this.p.restart;
    this.speed = 0;
    this.nearSaid = false;
    this.farSaid = false;
  }

  /** Tired out now (the catches that make it give up): its own line after the catch. */
  get tired(): boolean {
    return this.catches >= this.p.giveUpAfter;
  }
}
