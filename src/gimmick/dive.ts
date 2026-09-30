import { Emitter } from '../core/events';
import type { ResolvedRecord } from '../stage/types';
import { DIVE } from '../train/params';
import type { Train } from '../train/train';

export interface DiveEvents extends Record<string, unknown> {
  /** The dive button's hint started: water or a dive fork ahead (the partner's first line about it). */
  near: void;
}

/**
 * v1.10 (chapter 3): the dive button's hint (PHASE9_0: "もぐる" has its own button and works anywhere; this only
 * says where it helps). `near` on and under water and from DIVE.approach m before a water stretch or a dive fork
 * (along the way the train will go), when the player can dive. It glows when a dive now passes under the floater
 * ahead, takes the dive fork ahead down, or finds a dive record just ahead. The train does the diving.
 */
export class DiveSystem {
  readonly events = new Emitter<DiveEvents>();
  /** The player can dive (its ability). */
  enabled = false;
  private isNear = false;

  constructor(
    private readonly train: Train,
    private readonly records: ResolvedRecord[] = [],
    /** Whether a record was found already (none glow for those). */
    private readonly found: (id: string) => boolean = () => false,
  ) {}

  /** Water (or a dive fork) is here or just ahead (test hook `data-dive="near"`). */
  get near(): boolean {
    return this.isNear;
  }

  get glow(): boolean {
    if (!this.isNear) return false;
    return this.train.diveWouldHelp || this.recordAhead();
  }

  /** Call every frame after the train moved. */
  update(): void {
    const want = this.wanted();
    if (want === this.isNear) return;
    this.isNear = want;
    if (want) this.events.emit('near');
  }

  private wanted(): boolean {
    if (!this.enabled) return false;
    const t = this.train;
    if (t.domeOn || t.diving || t.onWaterSurface || t.submerged) return true;
    return t.waterAhead(DIVE.approach) !== null;
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
