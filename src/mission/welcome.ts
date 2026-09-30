import { Vector3 } from 'three';
import type { StationDef, WelcomeBeat, WelcomeDef } from '../stage/types';
import { WELCOME } from '../train/params';

/** Where the guest is: before the doors open ("ask"), a beat, or aboard ("done"). */
export type WelcomeState = WelcomeBeat | 'ask' | 'done';

/** What happened this frame (the mission runner moves the figure, plays the sounds and says the lines). */
export type WelcomeOutcome =
  | { kind: 'beat'; beat: WelcomeBeat; seconds: number; from: Vector3; to: Vector3 }
  | { kind: 'step' }
  | { kind: 'board' };

/** What a whistle did: she flinched back a beat (`n`: how many times so far), giggled, hid her face, or nothing. */
export type WelcomeWhistle =
  | { kind: 'flinch'; n: number; to: Vector3; beat: WelcomeBeat }
  | { kind: 'giggle'; n: number }
  | { kind: 'shy' }
  | { kind: 'none' };

/** The door the guest boards by: a step's own, else WELCOME.doorBack m behind the stop line on the platform side. */
export function welcomeDoor(def: WelcomeDef, station: StationDef): { railId: string; at: number; lateral: number } {
  if (def.door) return def.door;
  const side = station.platformSide === 'left' ? -1 : 1;
  return { railId: station.railId, at: station.at - WELCOME.doorBack, lateral: side * WELCOME.doorLateral };
}

/**
 * v1.11 (6-1, PHASE9_CHAPTER5_6 第 7 部 §4.3): "ドアを あけて まつ". Once the doors are open (and they stay open) the guest
 * comes aboard by herself in five beats: looks at the door, stands up, walks to it, peeks in, boards. A whistle while
 * she comes ("calling out") sends her one beat back and she keeps still a moment (at most `maxFlinches` times; after
 * that she only giggles); `boardBy` s after the doors opened she boards whatever happens (the beats left shrink to
 * WELCOME.rushBeatSeconds each). Never a fail, never a time-up. Counted in game time (a pause stops it).
 */
export class Welcome {
  state: WelcomeState = 'ask';
  flinches = 0;
  giggles = 0;
  private readonly beats: { beat: WelcomeBeat; seconds: number }[];
  private readonly flinchPause: number;
  private readonly maxFlinches: number;
  private readonly boardBy: number;
  readonly musicGain: number;
  readonly door: { railId: string; at: number; lateral: number };
  /** Where each beat starts (world), set by the caller from the rails. */
  private readonly places: Record<'seat' | 'walkStop' | 'door' | 'inside', Vector3>;
  private index = -1;
  private beatT = 0;
  private openT = 0;
  private pause = 0;
  private stepT = 0;
  private rushed = false;
  /** The beat to start again once a flinch's pause is over. */
  private restart: number | null = null;

  constructor(
    readonly def: WelcomeDef,
    readonly station: StationDef,
    /** A point `lateral` m right of `at` on `railId`, on the ground. */
    place: (railId: string, at: number, lateral: number) => Vector3,
  ) {
    const own = new Map((def.beats ?? []).map((b) => [b.beat, b.seconds]));
    this.beats = (['look', 'stand', 'walk', 'peek', 'board'] as const).map((beat) => ({ beat, seconds: own.get(beat) ?? WELCOME.beats[beat] }));
    this.flinchPause = def.flinchPause ?? WELCOME.flinchPause;
    this.maxFlinches = def.maxFlinches ?? WELCOME.maxFlinches;
    this.boardBy = def.boardBy ?? WELCOME.boardBy;
    this.musicGain = def.musicGain ?? WELCOME.musicGain;
    this.door = welcomeDoor(def, station);
    const seat = place(def.seat.railId, def.seat.at, def.seat.lateral);
    const door = place(this.door.railId, this.door.at, this.door.lateral);
    const walkStop = door.clone().add(seat.clone().sub(door).setLength(Math.min(WELCOME.walkStop, seat.distanceTo(door))));
    // Into the car: the door's lateral brought in to the car's side.
    const inside = place(this.door.railId, this.door.at, Math.sign(this.door.lateral || 1) * 0.6);
    inside.y = door.y;
    this.places = { seat, walkStop, door, inside };
  }

  /** Seconds since the doors opened (0 before). */
  get openFor(): number {
    return this.openT;
  }

  /** Where the guest sits before she comes (for bringing her on if she is not there). */
  get seat(): Vector3 {
    return this.places.seat.clone();
  }

  /** The place a beat starts at, and the one it goes to. */
  private span(beat: WelcomeBeat): { from: Vector3; to: Vector3 } {
    const P = this.places;
    switch (beat) {
      case 'look':
      case 'stand':
        return { from: P.seat, to: P.seat };
      case 'walk':
        return { from: P.seat, to: P.walkStop };
      case 'peek':
        return { from: P.walkStop, to: P.door };
      case 'board':
        return { from: P.door, to: P.inside };
    }
  }

  private startBeat(i: number): WelcomeOutcome {
    this.index = i;
    this.beatT = 0;
    this.stepT = 0;
    const b = this.beats[i];
    this.state = b.beat;
    const { from, to } = this.span(b.beat);
    return { kind: 'beat', beat: b.beat, seconds: this.beatSeconds(i), from: from.clone(), to: to.clone() };
  }

  private beatSeconds(i: number): number {
    const s = this.beats[i].seconds;
    return this.rushed ? Math.min(s, WELCOME.rushBeatSeconds) : s;
  }

  /** The doors opened: she starts coming. */
  doorOpened(): WelcomeOutcome[] {
    if (this.state !== 'ask') return [];
    this.openT = 0;
    return [this.startBeat(0)];
  }

  /** One frame with the doors open. */
  update(dt: number): WelcomeOutcome[] {
    const out: WelcomeOutcome[] = [];
    if (this.state === 'ask' || this.state === 'done') return out;
    this.openT += dt;
    // Time to board whatever happens: no more pauses, the beats left shrink.
    if (!this.rushed && this.openT >= this.boardBy) {
      this.rushed = true;
      this.pause = 0;
    }
    if (this.pause > 0) {
      this.pause = Math.max(0, this.pause - dt);
      if (this.pause > 0) return out;
    }
    if (this.restart !== null) {
      out.push(this.startBeat(this.restart));
      this.restart = null;
      return out;
    }
    this.beatT += dt;
    const b = this.beats[this.index];
    if (b.beat === 'walk') {
      this.stepT += dt;
      if (this.stepT >= WELCOME.stepSound) {
        this.stepT -= WELCOME.stepSound;
        out.push({ kind: 'step' });
      }
    }
    if (this.beatT >= this.beatSeconds(this.index)) {
      if (this.index + 1 < this.beats.length) out.push(this.startBeat(this.index + 1));
      else {
        this.state = 'done';
        out.push({ kind: 'board' });
      }
    }
    return out;
  }

  /**
   * A whistle ("calling out"). Before the doors open she only hides her face a moment ("shy"); coming, she flinches one
   * beat back and keeps still (`maxFlinches` times), then only giggles; boarding, nothing.
   */
  onWhistle(): WelcomeWhistle {
    if (this.state === 'ask') return { kind: 'shy' };
    if (this.state === 'done' || this.state === 'board') return { kind: 'none' };
    if (this.flinches >= this.maxFlinches || this.rushed) {
      this.giggles += 1;
      return { kind: 'giggle', n: this.giggles };
    }
    this.flinches += 1;
    const back = Math.max(0, this.index - 1);
    this.index = back;
    this.beatT = 0;
    this.stepT = 0;
    this.pause = this.flinchPause;
    this.restart = back;
    const beat = this.beats[back].beat;
    this.state = beat;
    return { kind: 'flinch', n: this.flinches, to: this.span(beat).from.clone(), beat };
  }
}
