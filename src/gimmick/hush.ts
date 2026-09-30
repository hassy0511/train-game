import { Emitter } from '../core/events';
import type { GimmickDef, HushParams } from '../stage/types';
import { HUSH } from '../train/params';
import type { Train } from '../train/train';

/**
 * v1.11 (5-1): a hush stretch (つきの はらっぱ, gimmicks "hush"; PHASE9_CHAPTER5_6 第 4 部 §4.2) with its defaults
 * filled in. `index` is its place in gimmicks[].
 */
export interface HushZone {
  index: number;
  id: string;
  railId: string;
  from: number;
  to: number;
  glowBefore: number;
  startleAfter: number;
  rewind: { railId: string; at: number };
  sign: boolean;
  line: string | null;
}

/** The hush stretches of a stage (stage data, no state). */
export function hushZones(gimmicks: GimmickDef[]): HushZone[] {
  const out: HushZone[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'hush' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as Partial<HushParams>;
    out.push({
      index,
      id: typeof p.id === 'string' ? p.id : `hush-${index}`,
      railId: g.railId,
      from: g.from,
      to: g.to,
      glowBefore: typeof p.glowBefore === 'number' ? p.glowBefore : HUSH.glowBefore,
      startleAfter: typeof p.startleAfter === 'number' ? p.startleAfter : HUSH.startleAfter,
      rewind: p.rewind ?? { railId: g.railId, at: g.from - HUSH.rewindBefore },
      sign: p.sign !== false,
      line: typeof p.line === 'string' ? p.line : null,
    });
  });
  return out;
}

/** "" (none near), "near" (the moon mark before it), "in", "startled" (the sleepers hid): the stretch at the train front. */
export type HushStatus = '' | 'near' | 'in' | 'startled';

/**
 * v1.11 (5-1): where everyone sleeps. From `glowBefore` m before a stretch to its end the buttons carry the moon mark
 * (a hint only: every button works as always, PHASE9_0 §6), and the light button glows while the light is on (press =
 * off). Inside it, `startleAfter` s of light in all (the magnet's stage does not count) or a whistle startles the
 * sleepers: they hide (not a fail; a record sleeping there cannot be found this try). Passed without that: "quiet".
 * Judged along the rail at the train front (no physics body), like the cats and the young dinosaurs.
 */
export class HushSystem {
  readonly zones: HushZone[];
  readonly events = new Emitter<{ near: HushZone; startle: HushZone; quiet: HushZone }>();
  /** Times any stretch was startled (only goes up; a test hook). */
  startles = 0;
  private readonly startled = new Set<string>();
  private readonly lit = new Map<string, number>();
  private readonly nearSeen = new Set<string>();
  private readonly inside = new Set<string>();

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
  ) {
    this.zones = hushZones(gimmicks);
  }

  /** The train front on `z`'s rail, or null. */
  private front(z: HushZone): number | null {
    return this.train.state.railId === z.railId ? this.train.frontS : null;
  }

  /** The stretch whose marked reach (from − glowBefore … to) the train front is in, or null. */
  get current(): HushZone | null {
    for (const z of this.zones) {
      const f = this.front(z);
      if (f !== null && f >= z.from - z.glowBefore && f <= z.to) return z;
    }
    return null;
  }

  /** The moon mark on the light and whistle buttons (a hint). */
  get mark(): boolean {
    return this.current !== null;
  }

  get status(): HushStatus {
    const z = this.current;
    if (!z) return '';
    if (this.startled.has(z.id)) return 'startled';
    const f = this.front(z) ?? 0;
    return f >= z.from ? 'in' : 'near';
  }

  /** Per frame while driving: `lightOn` is the light's own stage (the magnet does not count). */
  update(dt: number, lightOn: boolean): void {
    for (const z of this.zones) {
      const f = this.front(z);
      const reach = f !== null && f >= z.from - z.glowBefore && f <= z.to;
      if (reach && !this.nearSeen.has(z.id)) {
        this.nearSeen.add(z.id);
        this.events.emit('near', z);
      }
      const inside = f !== null && f >= z.from && f <= z.to;
      if (inside && lightOn && !this.startled.has(z.id)) {
        const t = (this.lit.get(z.id) ?? 0) + dt;
        this.lit.set(z.id, t);
        if (t > z.startleAfter) this.startle(z);
      }
      if (inside) this.inside.add(z.id);
      else if (this.inside.delete(z.id) && f !== null && f > z.to && !this.startled.has(z.id)) this.events.emit('quiet', z);
    }
  }

  /** The whistle sounded: sleepers in the stretch the front is in are startled. Returns that stretch, or null. */
  onWhistle(): HushZone | null {
    for (const z of this.zones) {
      const f = this.front(z);
      if (f === null || f < z.from || f > z.to || this.startled.has(z.id)) continue;
      this.startle(z);
      return z;
    }
    return null;
  }

  private startle(z: HushZone): void {
    this.startled.add(z.id);
    this.startles += 1;
    this.events.emit('startle', z);
  }

  /** The stretch around `railId` `at` (a record or a sleeper), or null. */
  zoneAt(railId: string, at: number): HushZone | null {
    return this.zones.find((z) => z.railId === railId && at >= z.from && at <= z.to) ?? null;
  }

  /** The sleepers at `railId` `at` hid this try. */
  startledAt(railId: string, at: number): boolean {
    const z = this.zoneAt(railId, at);
    return z !== null && this.startled.has(z.id);
  }

  /** A rewind or a retry: everyone asleep again, the light's time forgotten. */
  reset(): void {
    this.startled.clear();
    this.lit.clear();
    this.nearSeen.clear();
    this.inside.clear();
  }
}
