import type { GapDef, ResolvedActor } from '../stage/types';
import { GRASSHOPPER } from '../train/params';
import type { Train } from '../train/train';

export interface GrasshopperParams {
  /** Hops on by itself this far before its leaf (reactsTo "none"). */
  hop: number;
  /** Whistled on from this far before its leaf (reactsTo "whistle")... */
  whistleRange: number;
  /** ...until this far past it. */
  passBy: number;
  power: number;
  height: number;
  /** The notch the partner names for its gap ("fast" → はやい). */
  gapHint: 'normal' | 'fast' | 'max' | null;
  /** "Grasshopper jump!" this far before its gap. */
  readyDistance: number;
  /** v1.6: where it hops off to after its gap (on its own rail; the view lands it there). */
  off?: { at: number; lateral?: number; heightFromRail?: number };
}

export type GrasshopperOutcome = { kind: 'near' } | { kind: 'board' } | { kind: 'ready' } | { kind: 'done' } | null;

/**
 * A grasshopper sitting on a leaf by the rail (2-2). It rides on the roof and makes the train's jumps go twice
 * as far, until it has helped over "its" gap (the first gap after its leaf); then it hops off onto a leaf.
 */
export class Grasshopper {
  readonly railId: string;
  readonly at: number;
  readonly params: GrasshopperParams;
  readonly byWhistle: boolean;
  state: 'sit' | 'riding' | 'done' = 'sit';
  /** The gap it helps over. */
  gap: GapDef | null = null;
  private nearSaid = false;
  private readySaid = false;

  constructor(
    readonly actor: ResolvedActor,
    private readonly train: Train,
    gaps: GapDef[],
  ) {
    if (!actor.onRail) throw new Error(`grasshopper "${actor.id}" must be placed with onRail`);
    this.railId = actor.onRail.railId;
    this.at = actor.onRail.at;
    this.byWhistle = actor.reactsTo === 'whistle';
    this.params = { ...GRASSHOPPER, gapHint: null, ...(actor.params as Partial<GrasshopperParams>) };
    this.gap = gaps.filter((g) => g.from > this.at).sort((a, b) => a.from - b.from)[0] ?? null;
  }

  private distance(): number | null {
    return this.train.distanceAhead(this.railId, this.at);
  }

  /** The whistle reaches it now (the whistle button glows). */
  get inWhistleRange(): boolean {
    if (!this.byWhistle || this.state !== 'sit' || this.train.airborne) return false;
    const d = this.distance();
    return d !== null && d <= this.params.whistleRange && d >= -this.params.passBy;
  }

  /** Back on its leaf (a rewind to before its gap). */
  reset(): void {
    this.state = 'sit';
    this.nearSaid = false;
    this.readySaid = false;
  }

  /** Returns true when the whistle called it onto the roof. `free` = no other grasshopper is riding. */
  onWhistle(free: boolean): boolean {
    if (!free || !this.inWhistleRange || this.train.airborne) return false;
    this.state = 'riding';
    return true;
  }

  update(free: boolean): GrasshopperOutcome {
    const train = this.train;
    if (this.state === 'sit') {
      const d = this.distance();
      if (d === null) return null;
      if (this.byWhistle) {
        if (!this.nearSaid && d <= this.params.whistleRange + 30 && d > 0) {
          this.nearSaid = true;
          return { kind: 'near' };
        }
        return null;
      }
      if (free && d <= this.params.hop && d > -this.params.passBy && !train.airborne) {
        this.state = 'riding';
        return { kind: 'board' };
      }
      return null;
    }
    if (this.state !== 'riding') return null;
    const gap = this.gap;
    if (!gap || train.state.railId !== this.railId) return null;
    // Helped over its gap: off it goes once the train has landed beyond.
    if (train.bogieS > gap.to && !train.airborne && !train.isFalling) {
      this.state = 'done';
      return { kind: 'done' };
    }
    if (!this.readySaid && gap.from - train.frontS <= this.params.readyDistance && gap.from > train.frontS) {
      this.readySaid = true;
      return { kind: 'ready' };
    }
    return null;
  }
}
