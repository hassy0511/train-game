import type { GimmickDef } from '../stage/types';
import { FLOWER_BRIDGE, LEVER_NOTCHES } from '../train/params';
import type { Train } from '../train/train';
import { param } from './zones';

export type ButterflyState = 'wait' | 'follow' | 'hover' | 'land' | 'open';

export interface BridgeView {
  index: number;
  railId: string;
  /** The stream (a gap until the bridge opens). */
  from: number;
  to: number;
  state: ButterflyState;
  /** Where the butterfly is along the rail (m). */
  s: number;
  /** Pushed towards the window (the train is too fast for it). */
  flustered: boolean;
}

export type BridgeOutcome =
  | { kind: 'near' }
  | { kind: 'follow' }
  | { kind: 'wait' }
  | { kind: 'fast' }
  | { kind: 'closed' }
  | { kind: 'open' }
  | null;

interface Bridge extends BridgeView {
  butterflyAt: number;
  range: number;
  lead: number;
  minLead: number;
  maxSpeed: number;
  catchSpeed: number;
  bud: number;
  /** Current lead (m ahead of the front), shrinking while the train is too fast. */
  leadNow: number;
  /** Seconds it has followed since it last waited (the "it waits" line comes again only after a real follow). */
  followSeconds: number;
  said: Set<string>;
}

/**
 * Butterflies and flower bridges (2-2, gimmicks "flower-bridge"). With the light on, the butterfly takes off and
 * flies just ahead of the cab; it waits wherever the light goes off; landing on the bud before the stream opens
 * the flower, whose petals close the gap for good. Never a fail by itself: too fast only flusters it.
 */
export class FlowerBridges {
  readonly bridges: Bridge[];

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
    private readonly openGap: (railId: string, from: number, to: number) => void,
  ) {
    this.bridges = gimmicks.flatMap((g, index) => {
      if (g.type !== 'flower-bridge' || g.railId === undefined || g.from === undefined || g.to === undefined) return [];
      const butterflyAt = param(g, 'butterflyAt', g.from - 100);
      return [
        {
          index,
          railId: g.railId,
          from: g.from,
          to: g.to,
          state: 'wait' as ButterflyState,
          s: butterflyAt,
          flustered: false,
          butterflyAt,
          range: param(g, 'range', FLOWER_BRIDGE.range),
          lead: param(g, 'lead', FLOWER_BRIDGE.lead),
          minLead: param(g, 'minLead', FLOWER_BRIDGE.minLead),
          maxSpeed: param(g, 'maxSpeed', FLOWER_BRIDGE.maxSpeed),
          catchSpeed: param(g, 'catchSpeed', FLOWER_BRIDGE.catchSpeed),
          bud: param(g, 'bud', FLOWER_BRIDGE.bud),
          leadNow: param(g, 'lead', FLOWER_BRIDGE.lead),
          followSeconds: 0,
          said: new Set<string>(),
        },
      ];
    });
  }

  /** "1,0,0": which bridges are open (test hook). */
  get openFlags(): string {
    return this.bridges.map((b) => (b.state === 'open' ? '1' : '0')).join(',');
  }

  /** The butterfly nearest ahead on the train's rail (test hook and the view). */
  get active(): Bridge | null {
    const railId = this.train.state.railId;
    return this.bridges.find((b) => b.railId === railId && b.state !== 'open' && b.to > this.train.frontS) ?? null;
  }

  /** The light button should glow: a butterfly in reach is waiting for the light. */
  lightHint(lightOn: boolean): boolean {
    if (lightOn) return false;
    const front = this.train.frontS;
    return this.bridges.some(
      (b) =>
        b.railId === this.train.state.railId &&
        (b.state === 'wait' || b.state === 'hover') &&
        front >= b.butterflyAt - b.range - 20 &&
        front <= b.from,
    );
  }

  /** Is `gap` a bridge's stream? Returns its index. */
  bridgeOf(from: number, to: number, railId: string): number | null {
    const b = this.bridges.find((x) => x.railId === railId && x.from === from && x.to === to);
    return b ? b.index : null;
  }

  private once(b: Bridge, key: string): boolean {
    if (b.said.has(key)) return false;
    b.said.add(key);
    return true;
  }

  update(dt: number, lightOn: boolean): { bridge: Bridge; outcome: BridgeOutcome }[] {
    const out: { bridge: Bridge; outcome: BridgeOutcome }[] = [];
    const train = this.train;
    const front = train.frontS;
    for (const b of this.bridges) {
      if (b.state === 'open' || b.state === 'land') continue;
      if (train.state.railId !== b.railId) continue;
      const budS = b.from - b.bud;
      if (b.state === 'wait' || b.state === 'hover') {
        const inReach = front >= b.butterflyAt - b.range - 20 && front <= b.from;
        if (inReach && !lightOn && this.once(b, b.state === 'hover' ? 'wait' : 'near')) {
          out.push({ bridge: b, outcome: { kind: b.state === 'hover' ? 'wait' : 'near' } });
        }
        if (lightOn && front >= (b.state === 'hover' ? b.s - b.lead - b.range : b.butterflyAt - b.range)) {
          b.state = 'follow';
          b.followSeconds = 0;
          out.push({ bridge: b, outcome: this.once(b, 'follow') ? { kind: 'follow' } : null });
        }
        if (b.state !== 'follow') {
          if (b.from - front <= FLOWER_BRIDGE.closedWarn && b.from - front > 0 && this.once(b, 'closed')) {
            out.push({ bridge: b, outcome: { kind: 'closed' } });
          }
          continue;
        }
      }
      // Following: fly towards `front + lead`, pushed back towards the window when the train is too fast.
      if (!lightOn) {
        b.state = 'hover';
        // Said once; again only after it has really followed for a while (tapping the light on and off does
        // not pile up lines).
        if (this.once(b, 'wait')) out.push({ bridge: b, outcome: { kind: 'wait' } });
        continue;
      }
      b.followSeconds += dt;
      if (b.followSeconds >= FLOWER_BRIDGE.waitAgainAfter) b.said.delete('wait');
      const speed = train.state.speed;
      // Too fast only when the lever is taking it too fast: right after the light goes on the train is still
      // slowing from ふつう to the light's ふつう (7 m/s), which is just right for a butterfly.
      const heading = LEVER_NOTCHES[train.state.notch].speed * train.speedScale;
      if (speed > b.maxSpeed && heading > b.maxSpeed) {
        b.leadNow = Math.max(b.minLead, b.leadNow - (speed - b.maxSpeed) * dt);
        if (!b.flustered) {
          b.flustered = true;
          if (this.once(b, 'fast')) out.push({ bridge: b, outcome: { kind: 'fast' } });
        }
      } else {
        b.leadNow = Math.min(b.lead, b.leadNow + FLOWER_BRIDGE.recover * dt);
        if (b.leadNow >= b.lead) b.flustered = false;
      }
      const target = Math.min(front + b.leadNow, budS);
      const step = b.catchSpeed * dt;
      b.s = Math.abs(target - b.s) <= step ? target : b.s + Math.sign(target - b.s) * step;
      if (b.s >= budS - 0.01) {
        b.state = 'land';
        b.s = budS;
        // The flower opens: the petals close the stream at once (the view animates the bloom).
        this.openGap(b.railId, b.from, b.to);
        b.state = 'open';
        out.push({ bridge: b, outcome: { kind: 'open' } });
      }
    }
    return out;
  }

  /** After a rewind: a closed bridge's butterfly goes back to its flower, or waits just ahead of the train. */
  reset(): void {
    const front = this.train.frontS;
    for (const b of this.bridges) {
      if (b.state === 'open') continue;
      b.flustered = false;
      b.leadNow = b.lead;
      b.followSeconds = 0;
      b.said.clear();
      if (this.train.state.railId !== b.railId || front + b.lead <= b.butterflyAt) {
        b.state = 'wait';
        b.s = b.butterflyAt;
      } else {
        b.state = 'hover';
        b.s = Math.min(front + b.lead, b.from - b.bud);
      }
    }
  }
}
