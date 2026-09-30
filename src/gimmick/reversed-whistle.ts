import { LureGroup } from '../actors/lure';
import type { GimmickDef, ResolvedActor, WhistleReversedParams } from '../stage/types';
import { LURE } from '../train/params';
import type { Train } from '../train/train';

/** v1.11 (5-1): a whistle-reversed stretch (たぬきの もり, gimmicks "whistle-reversed") with its defaults filled in. */
export interface ReversedZone {
  index: number;
  id: string;
  railId: string;
  from: number;
  to: number;
  rewind: { railId: string; at: number };
  sign: boolean;
  line: string | null;
}

export function reversedZones(gimmicks: GimmickDef[]): ReversedZone[] {
  const out: ReversedZone[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'whistle-reversed' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as Partial<WhistleReversedParams>;
    out.push({
      index,
      id: typeof p.id === 'string' ? p.id : `reversed-${index}`,
      railId: g.railId,
      from: g.from,
      to: g.to,
      rewind: p.rewind ?? { railId: g.railId, at: g.from - LURE.rewindBefore },
      sign: p.sign !== false,
      line: typeof p.line === 'string' ? p.line : null,
    });
  });
  return out;
}

/**
 * v1.11 (5-1): the whistle-reversed stretches and their lure groups (PHASE9_CHAPTER5_6 第 4 部 §4.4). In a stretch the
 * whistle still sounds (reversed: "…っぴー") and brings the groups ahead that the train can stop for onto the rail to
 * dance; stopping and waiting is never a fail. The whistle button carries the hush mark there (a hint only) and never
 * glows. After LURE.mercyAfter lure fails in a row in a stretch its groups dance in the bushes only.
 */
export class ReversedWhistle {
  readonly zones: ReversedZone[];
  readonly groups: LureGroup[];
  /** Whistles blown inside a stretch, and groups that came onto the rail (both only go up; test hooks). */
  calls = 0;
  dances = 0;
  private readonly fails = new Map<string, number>();

  constructor(
    gimmicks: GimmickDef[],
    actors: ResolvedActor[],
    private readonly train: Train,
  ) {
    this.zones = reversedZones(gimmicks);
    this.groups = actors.filter((a) => a.type === 'lure' && a.onRail).map((a) => new LureGroup(a, train));
  }

  /** The stretch the train front is in, or null. */
  get current(): ReversedZone | null {
    const st = this.train.state;
    const f = this.train.frontS;
    return this.zones.find((z) => z.railId === st.railId && f >= z.from && f <= z.to) ?? null;
  }

  /** The stretch around `railId` `at` (a group), or null. */
  zoneAt(railId: string, at: number): ReversedZone | null {
    return this.zones.find((z) => z.railId === railId && at >= z.from && at <= z.to) ?? null;
  }

  mercy(z: ReversedZone): boolean {
    return (this.fails.get(z.id) ?? 0) >= LURE.mercyAfter;
  }

  /**
   * The whistle sounded. Outside every stretch: null. Inside one: what each group of it ahead did ("come", "hop",
   * "extend"), and the stretch.
   */
  onWhistle(): { zone: ReversedZone; came: LureGroup[]; hopped: LureGroup[]; extended: LureGroup[] } | null {
    const zone = this.current;
    if (!zone) return null;
    this.calls += 1;
    const out = { zone, came: [] as LureGroup[], hopped: [] as LureGroup[], extended: [] as LureGroup[] };
    const speed = Math.abs(this.train.state.speed);
    const mercy = this.mercy(zone);
    for (const g of this.groups) {
      if (this.zoneAt(g.railId, g.at) !== zone) continue;
      const r = g.onWhistle(speed, mercy);
      if (r === 'come') {
        this.dances += 1;
        out.came.push(g);
      } else if (r === 'hop') out.hopped.push(g);
      else if (r === 'extend') out.extended.push(g);
    }
    return out;
  }

  /** A lure fail in `zone` (for the mercy), or a clean pass through it (the count starts again). */
  failed(zone: ReversedZone): void {
    this.fails.set(zone.id, (this.fails.get(zone.id) ?? 0) + 1);
  }

  passed(zone: ReversedZone): void {
    this.fails.delete(zone.id);
  }

  /** "" | "come" | "dance": the liveliest group on the rail (test hook). */
  get status(): string {
    if (this.groups.some((g) => g.state === 'dance')) return 'dance';
    if (this.groups.some((g) => g.state === 'come')) return 'come';
    return '';
  }

  /** A rewind or a retry: every group back in its bush. */
  reset(): void {
    for (const g of this.groups) g.reset();
  }
}
