import { Emitter } from '../core/events';
import type { ResolvedRecord } from '../stage/types';
import { DIVE } from '../train/params';
import type { DiveResult, JumpResult, Train } from '../train/train';

/** What the jump seat (the round button right of the lever) is now. */
export type SeatFace = 'jump' | 'dive';

export interface DiveEvents extends Record<string, unknown> {
  /** The seat turned into "もぐる". */
  near: void;
}

/**
 * v1.10 (chapter 3): the jump seat's face and glow. It is "もぐる" on and under water and from DIVE.approach m before
 * a water stretch or a dive fork (along the way the train will go), when the player can dive; the face changes at
 * most once per DIVE.faceHold s and never in the air. It glows when a dive now passes under the floater ahead,
 * takes the dive fork ahead down, or finds a dive record just ahead. The train does the diving.
 */
export class DiveSystem {
  readonly events = new Emitter<DiveEvents>();
  /** The player can dive (its ability). */
  enabled = false;
  private current: SeatFace = 'jump';
  /** Seconds since the face last changed. */
  private held: number = DIVE.faceHold;

  constructor(
    private readonly train: Train,
    private readonly records: ResolvedRecord[] = [],
    /** Whether a record was found already (none glow for those). */
    private readonly found: (id: string) => boolean = () => false,
  ) {}

  get face(): SeatFace {
    return this.current;
  }

  get glow(): boolean {
    if (this.current !== 'dive') return false;
    return this.train.diveWouldHelp || this.recordAhead();
  }

  /** Call every frame after the train moved. */
  update(dt: number): void {
    this.held += dt;
    const want = this.wanted();
    if (want === this.current || this.held < DIVE.faceHold || this.train.airborne) return;
    this.current = want;
    this.held = 0;
    if (want === 'dive') this.events.emit('near');
  }

  /** After a rewind: the face may change at once to what fits where the train stands now. */
  reset(): void {
    this.held = DIVE.faceHold;
  }

  /** The seat was pressed: a dive or a jump, by its face. */
  press(): { kind: 'dive'; result: DiveResult } | { kind: 'jump'; result: JumpResult } {
    if (this.current === 'dive') return { kind: 'dive', result: this.train.dive() };
    return { kind: 'jump', result: this.train.jump() };
  }

  private wanted(): SeatFace {
    if (!this.enabled) return 'jump';
    const t = this.train;
    if (t.domeOn || t.diving || t.onWaterSurface || t.submerged) return 'dive';
    return t.waterAhead(DIVE.approach) !== null ? 'dive' : 'jump';
  }

  /** A dive record not found yet lies just ahead, and the train could dive now to take it. */
  private recordAhead(): boolean {
    const t = this.train;
    if (t.diving || !t.onWaterSurface || t.state.speed < DIVE.minSpeed || t.diveProgress < 1) return false;
    for (const r of this.records) {
      if (r.def.requires !== 'dive' || !r.onRail || this.found(r.def.id)) continue;
      const d = t.distanceAhead(r.onRail.railId, r.onRail.at);
      if (d !== null && d > 0 && d <= DIVE.recordGlow) return true;
    }
    return false;
  }
}
