import { Emitter } from '../core/events';
import type { GapDef, JunctionDef, StageFile } from '../stage/types';
import { FALL, LIGHT, MIRROR_WORLD } from '../train/params';
import type { Train } from '../train/train';

export type PhantomState = 'solid' | 'gone' | 'fall';

/** v1.11 (5-3): one of Sakasa's phantoms: a phantom fork's false way, or a false bridge over a gap. */
export interface Phantom {
  /** The fork's id, or "gap:<railId>:<from>". */
  id: string;
  kind: 'way' | 'bridge';
  /** The phantom rail (a false way), or the gap's rail. */
  railId: string;
  /** A false bridge's gap (null for a false way). */
  gap: GapDef | null;
  /** A false way's fork (null for a false bridge). */
  junction: JunctionDef | null;
}

/** The phantoms of a stage: the default ways of its phantom forks and the false bridges over its phantom gaps. */
export function phantomsOf(file: StageFile): Phantom[] {
  const out: Phantom[] = [];
  for (const j of file.junctions) {
    const way = j[j.default];
    if (j.phantom && way !== undefined && way !== j.railId) out.push({ id: j.id, kind: 'way', railId: way, gap: null, junction: j });
  }
  for (const r of file.rails) {
    for (const g of r.gaps ?? []) if (g.phantom) out.push({ id: gapPhantomId(r.id, g), kind: 'bridge', railId: r.id, gap: g, junction: null });
  }
  return out;
}

/** The id of the false bridge over gap `g` of rail `railId`. */
export function gapPhantomId(railId: string, g: GapDef): string {
  return `gap:${railId}:${g.from}`;
}

export interface PhantomEvents extends Record<string, unknown> {
  change: { id: string; state: PhantomState };
}

/**
 * v1.11 (5-3): the state of Sakasa's phantoms (PHASE9_CHAPTER5_6 第 6 部 §4.2). A false way pops ("ぽわん") when its fork
 * is seen through (the runner's reveal: the light within LIGHT.revealDistance m); a false bridge pops in the light
 * within LIGHT.revealDistance m of its gap, at a jump taken within MIRROR_WORLD.phantomTakeoff m of it, or under the
 * train falling into it ("fall"). The gap itself is the usual one (the bridge is looks only). After a rewind every
 * phantom is whole again (as the reveals are).
 */
export class PhantomSystem {
  readonly events = new Emitter<PhantomEvents>();
  readonly phantoms: readonly Phantom[];
  private readonly states = new Map<string, PhantomState>();

  constructor(
    file: StageFile,
    private readonly train: Train,
  ) {
    this.phantoms = phantomsOf(file);
    for (const p of this.phantoms) this.states.set(p.id, 'solid');
    train.events.on('jumped', () => {
      // A jump from near a false bridge: it pops as the train takes off (the mirror showed the cut).
      const gap = train.nextGap(MIRROR_WORLD.phantomTakeoff + FALL.bogieLead);
      if (gap?.phantom) this.set(gapPhantomId(train.state.railId, gap), 'gone');
    });
    train.events.on('fell', ({ gap, railId }) => {
      if (gap.phantom) this.set(gapPhantomId(railId, gap), 'fall');
    });
  }

  state(id: string): PhantomState {
    return this.states.get(id) ?? 'solid';
  }

  /** The test hook data-phantoms: "<id>:<state>" joined with commas. */
  get list(): string {
    return this.phantoms.map((p) => `${p.id}:${this.state(p.id)}`).join(',');
  }

  /** The phantom rails and false bridges drawn now (not popped), for the view. */
  get solid(): Phantom[] {
    return this.phantoms.filter((p) => this.state(p.id) === 'solid');
  }

  private set(id: string, state: PhantomState): void {
    if (!this.states.has(id) || this.states.get(id) === state) return;
    if (state !== 'solid' && this.states.get(id) !== 'solid') return;
    this.states.set(id, state);
    this.events.emit('change', { id, state });
  }

  /** Every frame: the light pops a false bridge close ahead. */
  update(ctx: { lightOn: boolean }): void {
    if (!ctx.lightOn) return;
    for (const p of this.phantoms) {
      if (p.kind !== 'bridge' || !p.gap || this.state(p.id) !== 'solid') continue;
      const d = this.train.distanceAhead(p.railId, p.gap.from);
      if (d !== null && d > -FALL.bogieLead && d <= LIGHT.revealDistance) this.set(p.id, 'gone');
    }
  }

  /** A fork was seen through (the runner's "sign:reveal"): its false way pops. */
  onReveal(junctionId: string): void {
    this.set(junctionId, 'gone');
  }

  /** After a rewind (or a loop coming back to a fork, "sign:reset"): the phantoms are whole again. */
  reset(junctionId?: string): void {
    for (const p of this.phantoms) {
      if (junctionId !== undefined && p.id !== junctionId) continue;
      if (this.state(p.id) === 'solid') continue;
      this.states.set(p.id, 'solid');
      this.events.emit('change', { id: p.id, state: 'solid' });
    }
  }
}
