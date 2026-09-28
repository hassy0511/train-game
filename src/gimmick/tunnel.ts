import { Emitter } from '../core/events';
import type { GimmickDef } from '../stage/types';
import { TUNNEL } from '../train/params';
import type { Train } from '../train/train';

/** One "tunnel" gimmick (4-3) with its defaults filled in. */
export interface TunnelZone {
  /** Its place in gimmicks[]. */
  index: number;
  railId: string;
  from: number;
  to: number;
  near: number;
  far: number;
  lightFar: number;
  fogColor: string;
  dim: number;
  lightGlow: number;
  /** Stone arches at its mouths (default true). */
  portal: boolean;
  /** The big ice hall inside it (no tube there): a stretch of it, or the whole of it ("all"), or none. */
  hall: { from: number; to: number } | 'all' | null;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The tunnels of a stage, from its gimmicks (also used by the loader's checks, the sound and the view). */
export function tunnelZones(gimmicks: GimmickDef[]): TunnelZone[] {
  const out: TunnelZone[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'tunnel' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as Record<string, unknown>;
    const h = p.hall;
    const hall =
      h === 'all' ? 'all' : h && typeof h === 'object' && typeof (h as { from?: unknown }).from === 'number' ? (h as { from: number; to: number }) : null;
    out.push({
      index,
      railId: g.railId,
      from: g.from,
      to: g.to,
      near: num(p.near, TUNNEL.near),
      far: num(p.far, TUNNEL.far),
      lightFar: num(p.lightFar, TUNNEL.lightFar),
      fogColor: typeof p.fogColor === 'string' ? p.fogColor : TUNNEL.fogColor,
      dim: num(p.dim, TUNNEL.dim),
      lightGlow: num(p.lightGlow, TUNNEL.lightGlow),
      portal: p.portal !== false,
      hall,
    });
  });
  return out;
}

/** The tunnel whose stretch holds `s` on `railId`, or null. */
export function tunnelAt(zones: TunnelZone[], railId: string, s: number): TunnelZone | null {
  return zones.find((z) => z.railId === railId && s >= z.from && s <= z.to) ?? null;
}

export interface TunnelEvents extends Record<string, unknown> {
  /** The train front is `TUNNEL.lightGlow` m before a tunnel's mouth (once per approach). */
  near: TunnelZone;
  /** The train front went into a tunnel (null: out of it). */
  inside: TunnelZone | null;
}

/**
 * v1.10 (4-3): tunnels. Knows whether the train front is in one (dark: the view dims, the snow stops), names one
 * coming up, and makes the light button glow from `lightGlow` m before a mouth until the train is out again (while the
 * light is off). Driving in the dark is never a fail.
 */
export class TunnelSystem {
  readonly events = new Emitter<TunnelEvents>();
  readonly zones: TunnelZone[];
  current: TunnelZone | null = null;
  private readonly named = new Set<number>();

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
  ) {
    this.zones = tunnelZones(gimmicks);
  }

  /** After a rewind: a tunnel ahead may be named again. */
  reset(): void {
    this.named.clear();
  }

  /** The tunnel mouth ahead along the way the train will go, within `range` m (its zone and the distance), or null. */
  private ahead(range: number): { zone: TunnelZone; d: number } | null {
    let best: { zone: TunnelZone; d: number } | null = null;
    for (const z of this.zones) {
      // A tunnel entered from a rail joining it inside (the ice hall's loop) has no mouth there.
      const d = this.train.routeDistance(z.railId, z.from);
      if (d === null || d <= 0 || d > range) continue;
      if (!best || d < best.d) best = { zone: z, d };
    }
    return best;
  }

  /** The light button should glow now (the light is off): in a tunnel, or close before one. */
  lightHint(lightOn: boolean): boolean {
    if (lightOn || this.zones.length === 0) return false;
    if (this.current) return true;
    const a = this.ahead(Math.max(...this.zones.map((z) => z.lightGlow)));
    return a !== null && a.d <= a.zone.lightGlow;
  }

  update(): void {
    if (this.zones.length === 0) return;
    const here = tunnelAt(this.zones, this.train.state.railId, this.train.frontS);
    if (here !== this.current) {
      this.current = here;
      this.events.emit('inside', here);
    }
    const a = this.ahead(Math.max(...this.zones.map((z) => z.lightGlow)));
    // (Not from inside one: the hall's loop is another tunnel joining this one.)
    if (a && !here && a.d <= a.zone.lightGlow && !this.named.has(a.zone.index)) {
      this.named.add(a.zone.index);
      this.events.emit('near', a.zone);
    }
  }
}
