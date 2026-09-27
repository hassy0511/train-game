import { Emitter } from '../core/events';
import type { PlowSpan } from '../stage/types';
import { DIVE, PLOW } from '../train/params';
import type { DiveResult, JumpResult, PlowResult, Train } from '../train/train';
import type { DiveSystem } from './dive';
import type { PlowSystem } from './plow';

/** What the jump seat (the round button right of the lever) is now: v1.10 "もぐる" near water, "ゆきかき" near snow. */
export type SeatFace = 'jump' | 'dive' | 'plow';

export interface SeatEvents extends Record<string, unknown> {
  /** The seat turned into "ゆきかき" for the snow of `span` (its wall's own line, if any, is `span.line`). */
  plowNear: { span: PlowSpan };
  /** The blade went up and the seat is the jump again (after PLOW.faceHold s). */
  plowUp: void;
}

export type SeatPress =
  | { kind: 'dive'; result: DiveResult }
  | { kind: 'plow'; result: PlowResult }
  | { kind: 'jump'; result: JumpResult };

/**
 * v1.10 (chapter 4): the jump seat's face — jump, "もぐる" or "ゆきかき" (docs/PHASE8_CHAPTER3_4.md 第 6 部 §A4). Diving
 * keeps its own rules (DiveSystem: near water, it wins). Otherwise the seat is "ゆきかき" while the blade is down and
 * from PLOW.approach m before snow still to clear along the way the train will go (when the player has the snowplow),
 * and back to the jump PLOW.faceHold s after the blade went up. The face changes at most once per faceHold s and
 * never in the air. "ゆきかき" glows until the blade is down. The loader's checks keep water and snow apart, so the
 * two never want the seat at once (nearer wins, water on a tie, just in case).
 */
export class JumpSeat {
  readonly events = new Emitter<SeatEvents>();
  private current: SeatFace = 'jump';
  private held: number = PLOW.faceHold;
  /** Seconds left of the "ゆきかき" face after the blade went up. */
  private upHold = 0;

  constructor(
    private readonly dive: DiveSystem,
    private readonly plow: PlowSystem,
    private readonly train: Train,
  ) {
    train.events.on('bladeUp', ({ instant }) => {
      if (!instant) this.upHold = PLOW.faceHold;
    });
  }

  get face(): SeatFace {
    return this.current;
  }

  /** "もぐる" glows as the dive system says; "ゆきかき" until the blade is down (while there is snow ahead to clear). */
  get glow(): boolean {
    if (this.current === 'dive') return this.dive.glow;
    // (Not in the second after the blade went up: nothing is left to clear then.)
    if (this.current === 'plow') return !this.train.bladeDown && this.train.nextPlowWall(PLOW.approach) !== null;
    return false;
  }

  /** Call every frame after the train (and the dive system) moved. */
  update(dt: number): void {
    this.held += dt;
    if (this.upHold > 0) this.upHold = Math.max(0, this.upHold - dt);
    if (this.dive.face === 'dive') {
      // Diving decides at once (its own hold); snow never lies near water.
      if (this.current !== 'dive') {
        this.current = 'dive';
        this.held = 0;
      }
      return;
    }
    const snow = this.plowWanted();
    const want: SeatFace = snow ? 'plow' : 'jump';
    if (want === this.current) return;
    // Out of the dive face straight to what fits; otherwise at most once per faceHold s, never in the air.
    if (this.current !== 'dive' && (this.held < PLOW.faceHold || this.train.airborne)) return;
    const was = this.current;
    this.current = want;
    this.held = 0;
    if (want === 'plow' && snow && !this.train.bladeDown) this.events.emit('plowNear', { span: snow });
    if (was === 'plow' && want === 'jump') this.events.emit('plowUp');
  }

  /** After a rewind: the face may change at once to what fits where the train stands now. */
  reset(): void {
    this.held = Math.max(this.held, PLOW.faceHold, DIVE.faceHold);
    this.upHold = 0;
  }

  /** The seat was pressed: a dive, the snowplow or a jump, by its face. */
  press(): SeatPress {
    if (this.current === 'dive') return { kind: 'dive', result: this.train.dive() };
    if (this.current === 'plow') return { kind: 'plow', result: this.train.plow() };
    return { kind: 'jump', result: this.train.jump() };
  }

  /** The snow the seat is "ゆきかき" for (or the blade is down / just went up), or null. */
  private plowWanted(): PlowSpan | null {
    if (!this.plow.enabled) return null;
    const next = this.train.nextPlowWall(PLOW.approach);
    if (next) return next.span;
    if (this.train.bladeDown || this.upHold > 0) return this.plow.spans[0] ?? null;
    return null;
  }
}
