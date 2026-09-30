import type { ParadeParams, ResolvedActor } from '../stage/types';
import { PARADE } from '../train/params';
import type { Train } from '../train/train';

/**
 * v1.11 (5-2): the band's states. "idle": not wound yet, marking time backwards where it stands; "back": walking back
 * towards the train (unwound); "turn": being wound (the keys turn, PARADE.turnSeconds); "march": marching on ahead of
 * the train; "wait": marking time for the train to come nearer; "exit": leaving the rail into the square; "gone".
 */
export type ParadeState = 'idle' | 'back' | 'turn' | 'march' | 'wait' | 'exit' | 'gone';

/** What happened this frame (the runner turns these into lines, sounds and the view's events). */
export type ParadeOutcome = 'near' | 'state' | 'bye';

/** The params with their defaults filled in. */
export interface ParadeSetup {
  members: string[];
  spacing: number;
  back: { from: number; speed: number; min: number };
  speed: number;
  gap: number;
  callRange: number;
  waitGap: number;
  exit: number;
  exitSide: 'left' | 'right';
}

export function paradeSetup(params: Record<string, unknown>, at: number): ParadeSetup {
  const p = params as unknown as Partial<ParadeParams>;
  const back = p.back ?? { min: at };
  return {
    members: p.members ?? [],
    spacing: p.spacing ?? PARADE.spacing,
    back: { from: back.from ?? PARADE.backFrom, speed: back.speed ?? PARADE.backSpeed, min: back.min },
    speed: p.speed ?? PARADE.speed,
    gap: p.gap ?? PARADE.gap,
    callRange: p.callRange ?? PARADE.callRange,
    waitGap: p.waitGap ?? PARADE.waitGap,
    exit: p.exit ?? at + 100,
    exitSide: p.exitSide ?? 'left',
  };
}

/**
 * v1.11 (5-2, PHASE9_CHAPTER5_6 第 5 部 §4.2): the toy band ("parade" actor) walking on the rail ahead of the train.
 * Unwound it walks back towards the train and stops; the whistle (glowing in `callRange`) winds it and it marches on,
 * the train following at its pace (Train.setLeader: never nearer than `gap`, never a fail). Where the tail is and how
 * fast the band goes are the runner's (the view is told on every change and moves the band between).
 */
export class Parade {
  readonly railId: string;
  readonly setup: ParadeSetup;
  state: ParadeState = 'idle';
  /** Where the tail (the last member) is along its rail now. */
  tail: number;
  private t = 0;
  private nearSaid = false;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
  ) {
    if (!actor.onRail) throw new Error(`parade "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.setup = paradeSetup(actor.params, actor.onRail.at);
    this.tail = actor.onRail.at;
  }

  /** The head (the first member) along the rail. */
  get head(): number {
    return this.tail + this.setup.spacing * Math.max(0, this.setup.members.length - 1);
  }

  /** How fast the band goes along its rail now (m/s; walking back is negative). */
  get speed(): number {
    if (this.state === 'march' || this.state === 'exit') return this.setup.speed;
    if (this.state === 'back') return this.walkingBack ? -this.setup.back.speed : 0;
    return 0;
  }

  /** While "back": still walking (it stops at back.min or `gap + stopAhead` m before the train). */
  private walkingBack = false;

  /** Distance from the train front to the tail along the way the train will go (null: not ahead on its way). */
  distance(): number | null {
    return this.train.routeDistance(this.railId, this.tail);
  }

  /** The whistle glows for it: not wound yet, and the front `callRange`..PARADE.callMin m before the tail. */
  get callable(): boolean {
    if (this.state !== 'idle' && this.state !== 'back') return false;
    const d = this.distance();
    return d !== null && d <= this.setup.callRange && d >= PARADE.callMin;
  }

  /** The limit it puts on the train (Train.setLeader), or null once gone. */
  leader(): { railId: string; at: number; speed: number; gap: number } | null {
    if (this.state === 'gone') return null;
    return { railId: this.railId, at: this.tail, speed: Math.max(0, this.speed), gap: this.setup.gap };
  }

  /** A whistle: "wound" when it was callable (it turns and marches); "fanfare" while marching (it answers only). */
  onWhistle(): 'wound' | 'fanfare' | null {
    if (this.callable) {
      this.set('turn');
      return 'wound';
    }
    if (this.state === 'march' || this.state === 'wait') return 'fanfare';
    return null;
  }

  private set(state: ParadeState): void {
    this.state = state;
    this.t = 0;
  }

  update(dt: number): ParadeOutcome[] {
    const out: ParadeOutcome[] = [];
    const s = this.setup;
    const before = this.state;
    const walkingBefore = this.walkingBack;
    const d = this.distance();
    this.t += dt;
    if (!this.nearSaid && (this.state === 'idle' || this.state === 'back') && d !== null && d > 0 && d <= PARADE.near) {
      this.nearSaid = true;
      out.push('near');
    }
    switch (this.state) {
      case 'idle':
        if (d !== null && d <= s.back.from && this.tail > s.back.min) {
          this.set('back');
          this.walkingBack = true;
        }
        break;
      case 'back': {
        if (!this.walkingBack) break;
        const next = Math.max(s.back.min, this.tail - s.back.speed * dt);
        this.tail = next;
        const close = d !== null && d - s.back.speed * dt <= s.gap + PARADE.stopAhead;
        if (next <= s.back.min || close) this.walkingBack = false;
        break;
      }
      case 'turn':
        if (this.t >= PARADE.turnSeconds) this.set('march');
        break;
      case 'march':
        if (d === null || d > s.waitGap) this.set('wait');
        else this.tail += s.speed * dt;
        break;
      case 'wait':
        if (d !== null && d < s.waitGap - 5) this.set('march');
        break;
      case 'exit':
        this.tail += s.speed * dt;
        if (this.t >= PARADE.exitSeconds) {
          this.set('gone');
          out.push('bye');
        }
        break;
      case 'gone':
        break;
    }
    if ((this.state === 'march' || this.state === 'wait') && this.head >= s.exit) this.set('exit');
    if (this.state !== before || this.walkingBack !== walkingBefore) out.push('state');
    return out;
  }

  /**
   * After a rewind to `target` (or at the start): gone for good once the way back lies at or past where it leaves the
   * rail (a fail at the next station, a resume from there); otherwise back where it waits, unwound.
   */
  reset(target?: { railId: string; at: number }): void {
    const past = target !== undefined && target.railId === this.railId && target.at >= this.setup.exit;
    this.tail = this.actor.onRail?.at ?? this.tail;
    this.walkingBack = false;
    this.nearSaid = past;
    this.set(past ? 'gone' : 'idle');
  }
}
