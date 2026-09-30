import { Emitter } from '../core/events';
import type { JunctionDef, MagnetTarget } from '../stage/types';
import { MAGNET } from '../train/params';
import type { JunctionSide, Train, TrainBlock } from '../train/train';
import type { LightMode } from './light-switch';

/** A target as it stands: pick "pulled" (this try), bridge / gate / turn "open" (for the rest of the stage). */
export type MagnetState = 'idle' | 'pulled' | 'open';

/** A pull going on: the target flies over `seconds` s (`t` so far) from `distance` m ahead. */
export interface MagnetPull {
  target: MagnetTarget;
  seconds: number;
  t: number;
  distance: number;
}

export interface MagnetContext {
  mode: LightMode;
  /** The runner's phase ("driving", "stopped", …; the test course: "driving" or "stopped"). */
  phase: string;
  /** The stop line the train is braking for now (pick targets do not glow within MAGNET.stationQuiet m of it). */
  stopLine: { railId: string; at: number } | null;
}

/** The pull's flight time for a target `distance` m ahead (MAGNET.pullBase + distance / pullRate, clamped). */
export function pullSeconds(distance: number): number {
  return Math.min(MAGNET.pullMax, Math.max(MAGNET.pullMin, MAGNET.pullBase + Math.max(0, distance) / MAGNET.pullRate));
}

/**
 * v1.11 (PR5, PHASE9_CHAPTER5_6 第 2 部 M3, M5): the magnet light's iron targets. In the magnet step the nearest target
 * on the way ahead within reach is pulled, one at a time, by itself (the child only picks the step): a pick flies to the
 * train (a record is found when it arrives) and goes back; a gap closes, a gate opens and a mirror turns round the moment
 * the pull starts. Outside the magnet step (with the magnet light learned) the light button glows green before a target
 * still waiting: a hint only. Unopened gaps and gates are blocks the train bounces off ("ぽよん"), whether it has the
 * magnet or not. Judged along the rails (no Rapier bodies): the flight is looks only.
 */
export class MagnetSystem {
  /** The magnet light is learned (the button has three steps). */
  enabled = false;
  readonly events = new Emitter<{
    /** The train came within the hint's reach of `target` (once a try; also when already in the magnet step). */
    near: { target: MagnetTarget };
    pull: { target: MagnetTarget; seconds: number };
    /** The pulled thing arrived (records are found now). `instant`: finished at once (a rewind, a skip). */
    caught: { target: MagnetTarget; instant: boolean };
    /** A gap closed, a gate opened, a mirror turned (at the pull's start). `instant`: a resume. */
    open: { target: MagnetTarget; instant: boolean };
    /** The train went past a turn's fork without the magnet (onto the lie). */
    miss: { target: MagnetTarget };
  }>();
  private readonly states = new Map<string, MagnetState>();
  private readonly nearSaid = new Set<string>();
  private readonly missSaid = new Set<string>();
  private readonly lastFork = new Map<string, number | null>();
  private current: MagnetPull | null = null;
  private hinted: MagnetTarget | null = null;
  /** Test hooks: pulls so far and the targets that arrived (both only grow). */
  pulls = 0;
  readonly caughtIds: string[] = [];

  constructor(
    readonly targets: readonly MagnetTarget[],
    private readonly train: Train,
    private readonly junctions: readonly JunctionDef[],
    private readonly isFound: (recordId: string) => boolean,
  ) {
    for (const t of targets) this.states.set(t.id, 'idle');
  }

  /** The target the light button glows green for now (outside the magnet step), or null. */
  get hint(): MagnetTarget | null {
    return this.hinted;
  }

  /** The pull going on, or null. */
  get pulling(): MagnetPull | null {
    return this.current;
  }

  state(id: string): MagnetState {
    return this.states.get(id) ?? 'idle';
  }

  /** Unopened gaps and gates: the train front may not pass their faces (in the air too). */
  blocks(): readonly TrainBlock[] {
    const out: TrainBlock[] = [];
    for (const t of this.targets) {
      if ((t.kind === 'bridge' || t.kind === 'gate') && this.states.get(t.id) !== 'open') out.push({ kind: 'magnet', railId: t.railId, at: t.at, id: t.id });
    }
    return out;
  }

  /** The distance along the way ahead from the train front to `t` (to a gap's or gate's face), or null. */
  distance(t: MagnetTarget): number | null {
    return this.train.routeDistance(t.railId, t.at);
  }

  /** Whether `t` is within `range` m ahead (a pick or turn no nearer than its minAhead; a face not passed). */
  private within(t: MagnetTarget, d: number | null, range: number): d is number {
    if (d === null) return false;
    return t.kind === 'bridge' || t.kind === 'gate' ? d > 0 && d <= range : d >= t.minAhead && d <= range;
  }

  /** Still to be pulled this try (a pick not pulled yet; a gap, gate or mirror not open yet). */
  private waiting(t: MagnetTarget): boolean {
    return this.states.get(t.id) === 'idle';
  }

  update(dt: number, ctx: MagnetContext): void {
    // The pull going on flies to the end whatever the step is now.
    const pull = this.current;
    if (pull) {
      pull.t += dt;
      if (pull.t >= pull.seconds) this.finish(false);
    }
    this.checkTurns();
    this.keepTurns();
    const active = ctx.phase === 'driving' || ctx.phase === 'stopped';
    let hint: MagnetTarget | null = null;
    let nearest: { t: MagnetTarget; d: number } | null = null;
    for (const t of this.targets) {
      if (!this.waiting(t)) continue;
      const d = this.distance(t);
      if (!this.within(t, d, MAGNET.hintAhead)) continue;
      if (this.enabled && active && !this.nearSaid.has(t.id)) {
        this.nearSaid.add(t.id);
        this.events.emit('near', { target: t });
      }
      if (this.within(t, d, MAGNET.reach) && (nearest === null || d < nearest.d)) nearest = { t, d };
      // A found record is fetched again (it only sparkles then) but not pointed out.
      if (t.recordId && this.isFound(t.recordId)) continue;
      // Pick targets do not glow while the train brakes for the station it stops at (the child is busy there).
      if (t.kind === 'pick' && ctx.stopLine) {
        const s = this.train.routeDistance(ctx.stopLine.railId, ctx.stopLine.at);
        if (s !== null && s >= -1 && s <= MAGNET.stationQuiet) continue;
      }
      if (hint === null || (this.distance(hint) ?? Infinity) > d) hint = t;
    }
    this.hinted = this.enabled && active && ctx.mode !== 'magnet' ? hint : null;
    if (this.enabled && active && ctx.mode === 'magnet' && !this.current && nearest) this.start(nearest.t, nearest.d);
  }

  private start(t: MagnetTarget, d: number): void {
    const seconds = pullSeconds(d);
    this.current = { target: t, seconds, t: 0, distance: d };
    this.pulls += 1;
    this.states.set(t.id, t.kind === 'pick' ? 'pulled' : 'open');
    this.events.emit('pull', { target: t, seconds });
    // A gap closes, a gate opens, a mirror turns the moment the pull starts (the look catches up).
    if (t.kind !== 'pick') this.open(t, false);
  }

  private open(t: MagnetTarget, instant: boolean): void {
    this.states.set(t.id, 'open');
    if (t.kind === 'turn') this.preferTrue(t);
    this.events.emit('open', { target: t, instant });
  }

  private finish(instant: boolean): void {
    const pull = this.current;
    if (!pull) return;
    this.current = null;
    if (!this.caughtIds.includes(pull.target.id)) this.caughtIds.push(pull.target.id);
    this.events.emit('caught', { target: pull.target, instant });
  }

  /** A turned mirror shows the true way: the train takes it (the side that is not the reversed sign's default). */
  private preferTrue(t: MagnetTarget): void {
    const j = this.junctions.find((x) => x.id === t.junction);
    if (!j) return;
    const side: JunctionSide = j.default === 'left' ? 'right' : 'left';
    this.train.preferJunction(j.id, side);
  }

  /** Open mirrors keep their fork's true way chosen (a rewind forgets preferred ways). */
  private keepTurns(): void {
    for (const t of this.targets) if (t.kind === 'turn' && this.states.get(t.id) === 'open') this.preferTrue(t);
  }

  /** A turn's fork passed while its mirror still looked away: "miss" (once a try). */
  private checkTurns(): void {
    for (const t of this.targets) {
      if (t.kind !== 'turn' || this.states.get(t.id) === 'open' || this.missSaid.has(t.id)) continue;
      const j = this.junctions.find((x) => x.id === t.junction);
      if (!j) continue;
      const d = this.train.routeDistance(j.railId, j.at);
      const before = this.lastFork.get(t.id) ?? null;
      this.lastFork.set(t.id, d);
      if (before !== null && before > 0 && before < 20 && (d === null || d <= 0)) {
        this.missSaid.add(t.id);
        this.events.emit('miss', { target: t });
      }
    }
  }

  /**
   * After a rewind: a flight going on arrives at once (a record is found), picks may be pulled again, the lines come
   * again. Gaps closed, gates opened and mirrors turned stay so. With `passed` (a resume), every gap, gate and mirror on
   * the way to the station started from is open (at once).
   */
  reset(opts: { passed?: (t: MagnetTarget) => boolean } = {}): void {
    this.finish(true);
    for (const t of this.targets) if (t.kind === 'pick') this.states.set(t.id, 'idle');
    this.nearSaid.clear();
    this.missSaid.clear();
    this.lastFork.clear();
    this.hinted = null;
    if (opts.passed) {
      for (const t of this.targets) if (t.kind !== 'pick' && this.states.get(t.id) !== 'open' && opts.passed(t)) this.open(t, true);
    }
  }
}
