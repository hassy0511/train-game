import type { RailNetwork } from '../rail/types';
import type { GimmickDef, PlowSpan, StageFile } from '../stage/types';
import { PLOW } from '../train/params';
import type { Train } from '../train/train';

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * v1.10 (4-2): the snow walls of a stage ("plow-wall" gimmicks) with their defaults filled in: the wall at `from`,
 * its buried stretch up to `to` (the wall alone: PLOW.wallDepth m), the way back after "ぽすっ".
 */
export function plowSpans(gimmicks: GimmickDef[]): PlowSpan[] {
  const out: PlowSpan[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'plow-wall' || g.railId === undefined || g.from === undefined) return;
    const p = (g.params ?? {}) as Record<string, unknown>;
    const rw = p.rewind as { railId?: unknown; at?: unknown } | undefined;
    const rewind =
      rw && typeof rw.railId === 'string' && typeof rw.at === 'number'
        ? { railId: rw.railId, at: rw.at }
        : { railId: g.railId, at: Math.max(0, g.from - PLOW.rewindBefore) };
    const look = p.look === 'sand' || p.look === 'foam' ? p.look : 'snow';
    out.push({
      index,
      railId: g.railId,
      from: g.from,
      to: g.to ?? g.from + PLOW.wallDepth,
      rewind,
      line: text(p.line),
      look,
      height: num(p.height, 5),
      width: num(p.width, 8),
      sign: p.sign !== false,
    });
  });
  return out;
}

/**
 * The loader: every rail gets its snow walls (Rail.plows, sorted), and a station whose stop line lies in a buried
 * stretch is marked `buried` (its platform and sign are under snow until the snowplow clears them).
 */
export function assignPlowSpans(file: StageFile, network: RailNetwork): void {
  const spans = plowSpans(file.gimmicks);
  for (const rail of network.rails.values()) rail.plows = spans.filter((sp) => sp.railId === rail.id).sort((a, b) => a.from - b.from);
  for (const st of file.stations) {
    if (spans.some((sp) => sp.railId === st.railId && st.at > sp.from && st.at < sp.to)) st.buried = true;
  }
}

/** A snow wall as it stands now (test hook `data-wall-<index>`, the view). */
export type WallState = 'whole' | 'dented' | 'burst';

/**
 * v1.10 (4-2): the snow walls' state for the view and the tests. The train decides bursting and "ぽすっ"; this keeps
 * the dent a "ぽすっ" leaves in a wall (the train's shape, until it is burst) and hands the view each wall's state and
 * how far its buried stretch is cleared, when that changes.
 */
export class PlowSystem {
  /** The player has the snowplow (its ability). */
  enabled = false;
  readonly spans: PlowSpan[];
  private readonly dented = new Set<number>();
  private readonly posted = new Map<number, string>();
  bursts = 0;
  bumps = 0;

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
    /** Tells the view about a wall that changed. */
    private readonly post: (index: number, state: WallState, cleared: number, instant: boolean) => void = () => undefined,
  ) {
    this.spans = plowSpans(gimmicks);
    train.events.on('wallBurst', ({ span }) => {
      this.bursts += 1;
      this.dented.delete(span.index);
    });
    train.events.on('snowBump', ({ span }) => {
      this.bumps += 1;
      this.dented.add(span.index);
    });
  }

  wallState(index: number): WallState {
    if (this.train.wallBurst(index)) return 'burst';
    return this.dented.has(index) ? 'dented' : 'whole';
  }

  /** How far the buried stretch of wall `index` is cleared (s on its rail). */
  clearedTo(index: number): number {
    const sp = this.spans.find((x) => x.index === index);
    return sp ? this.train.plowClearedTo(sp) : 0;
  }

  /** Per frame: posts every wall whose state or cleared stretch changed (by half a metre or more). */
  update(instant = false): void {
    for (const sp of this.spans) {
      const state = this.wallState(sp.index);
      const cleared = this.train.plowClearedTo(sp);
      const key = `${state}:${Math.floor(cleared * 2)}`;
      if (this.posted.get(sp.index) === key) continue;
      this.posted.set(sp.index, key);
      this.post(sp.index, state, cleared, instant);
    }
  }
}
