import { Emitter } from '../core/events';
import type { GimmickDef } from '../stage/types';
import { SLOPE } from '../train/params';
import type { Train } from '../train/train';

/** One "slope" gimmick (2-3), with its defaults filled in. */
export interface SlopeZone {
  /** Its place in gimmicks[]. */
  index: number;
  railId: string;
  from: number;
  to: number;
  pull: number;
  max: number;
  /** Where the train front goes back to after slipping on it (uphill). */
  rewind: { railId: string; at: number };
  line: string | null;
  sign: boolean;
  kind: 'up' | 'down';
}

export interface SlopeEvents extends Record<string, unknown> {
  /** An uphill is `SLOPE.nearDistance` m ahead (once per try). */
  near: SlopeZone;
  /** The train front entered a slope. */
  enter: SlopeZone;
  /** The train front left a slope. */
  exit: SlopeZone;
}

/** The slopes of a stage, from its gimmicks (also used by the loader's checks and the view). */
export function slopeZones(gimmicks: GimmickDef[]): SlopeZone[] {
  const out: SlopeZone[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'slope' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as Record<string, unknown>;
    const pull = Number(p.pull);
    const rewind = p.rewind as { railId?: string; at?: number } | undefined;
    out.push({
      index,
      railId: g.railId,
      from: g.from,
      to: g.to,
      pull,
      max: typeof p.max === 'number' ? p.max : SLOPE.max,
      rewind:
        rewind && typeof rewind.at === 'number'
          ? { railId: rewind.railId ?? g.railId, at: rewind.at }
          : { railId: g.railId, at: g.from - SLOPE.rewindBefore },
      line: typeof p.line === 'string' ? p.line : null,
      sign: p.sign !== false,
      kind: pull < 0 ? 'up' : 'down',
    });
  });
  return out;
}

/**
 * Slopes (2-3): tells the train which slope its front is on (the train does the physics) and reports entering,
 * leaving and nearing them. Works without a mission runner (the test course).
 */
export class SlopeSystem {
  readonly events = new Emitter<SlopeEvents>();
  readonly zones: SlopeZone[];
  /** The slope under the train front, or null. */
  current: SlopeZone | null = null;
  private readonly announced = new Set<number>();

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
  ) {
    this.zones = slopeZones(gimmicks);
  }

  /** "up" | "down" | "" (test hook). */
  get kind(): string {
    return this.current?.kind ?? '';
  }

  /** After a rewind: the partner may name the slopes again. */
  reset(): void {
    this.announced.clear();
    this.current = null;
    this.train.slope = null;
  }

  /** Call every frame before the train moves. */
  update(): void {
    const railId = this.train.state.railId;
    const front = this.train.frontS;
    let here: SlopeZone | null = null;
    for (const z of this.zones) {
      if (z.railId !== railId) continue;
      if (front >= z.from && front <= z.to) here = z;
      else if (z.kind === 'up' && !this.announced.has(z.index)) {
        const d = z.from - front;
        if (d > 0 && d <= SLOPE.nearDistance) {
          this.announced.add(z.index);
          this.events.emit('near', z);
        }
      }
    }
    // While slipping the train is carried back out of the slope: it stays "on" it until put back.
    if (here === null && this.train.isSlipping) here = this.current;
    if (here !== this.current) {
      const was = this.current;
      this.current = here;
      if (was) this.events.emit('exit', was);
      if (here) this.events.emit('enter', here);
    }
    this.train.slope = here ? { pull: here.pull, max: here.max } : null;
  }
}
