import { Matrix4, Quaternion, Vector3 } from 'three';
import { Emitter } from '../core/events';
import type { Rail, RailNetwork } from '../rail/types';
import type { GapDef, JunctionDef, StartDef } from '../stage/types';
import {
  ACCELERATION,
  BRAKING,
  BUFFER_MARGIN,
  EMERGENCY_STOP_SECONDS,
  FALL,
  HARD_BRAKE_NOTCH,
  JUMP,
  JUNCTION_ARROW_DISTANCE,
  PAD_JUMP,
  UPDRAFT_ACCELERATION,
  JUNCTION_LOCK_DISTANCE,
  LEVER_NOTCHES,
  ROCKET,
  SLOPE,
  SPEED_NOTCHES,
  STOP_NOTCH,
  TRAIN,
} from './params';
import type { TrainPose, TrainState } from './types';

export type JunctionSide = 'left' | 'right';

export interface JunctionApproach {
  junction: JunctionDef;
  left: boolean;
  right: boolean;
  default: JunctionSide;
}

export interface TrainEvents extends Record<string, unknown> {
  junctionApproach: JunctionApproach;
  junctionLocked: void;
  junctionPassed: void;
  railChanged: { railId: string };
  endOfLine: void;
  /** The hard brake was applied while moving faster than a walking pace. */
  hardBrake: { speed: number };
  jumped: { distance: number };
  landed: void;
  /** The lead bogie ran into a gap. `short`: it jumped but not far enough; otherwise it never jumped. */
  fell: { gap: GapDef; railId: string; short: boolean };
  /** 2-3: stopped on an uphill slope; the train starts slipping back ("ずるずる"). */
  slipped: { railId: string; s: number };
  /** 2-3: the rocket fired. */
  rocketStarted: void;
  /** 2-3: the rocket stopped: burnt out (`cut` false) or cut short ("ぷしゅっ": a quiet place, an emergency stop). */
  rocketEnded: { cut: boolean };
}

/** 2-3: the slope under the train front (set every frame by the slope system). */
export interface SlopeUnder {
  /** m/s², negative = uphill (slows the train), positive = downhill (speeds it up). */
  pull: number;
  /** Downhill: the speed it runs up to (m/s). */
  max: number;
}

export type JumpResult = 'ok' | 'stopped' | 'cooldown' | 'air' | 'locked' | 'bough';

/** A jump arc in space: bogies between `from` and `from + length` on `railId` are lifted. */
interface JumpArc {
  railId: string;
  from: number;
  length: number;
  height: number;
}

/** Share of the arc's slope the car body shows while in the air (0 = stays level). */
const JUMP_PITCH = 0.3;

/** Height (m) of an arc at bogie position `s`; 0 outside it. */
function arcHeight(arc: JumpArc, s: number): number {
  const u = (s - arc.from) / arc.length;
  if (u <= 0 || u >= 1) return 0;
  return arc.height * 4 * u * (1 - u);
}

/** The train state machine. Moves along the rail network by arc length; no free physics. */
export class Train {
  readonly events = new Emitter<TrainEvents>();
  readonly state: TrainState;

  private pending: JunctionDef[] = [];
  private announced: JunctionDef | null = null;
  private locked = false;
  private choice: JunctionSide | null = null;
  private ended = false;
  private lockReason: string | null = null;
  private emergency = false;
  private arcs: JumpArc[] = [];
  private jumpCooldown = 0;
  private falling: { t: number } | null = null;
  /** Multiplies every notch's target speed (the light slows the train down). */
  speedScale = 1;
  /** An updraft pushes the train up to this speed (m/s) while the lever is on a running notch; 0 = none. */
  boostSpeed = 0;
  /** A bending bough under the train: how far (m) the rail hangs below rest at `s` on `railId`. */
  sagAt: ((railId: string, s: number) => number) | null = null;
  /** On a springy bough the jump button does nothing (the bough throws the train itself). */
  jumpBlocked = false;
  /** A grasshopper riding on the roof (2-2): jumps go `power` times as far and `height` m high. */
  jumpBoost: { power: number; height: number } | null = null;
  /** 2-3: the slope under the train front, or null on the level. */
  slope: SlopeUnder | null = null;
  /** 2-3: seconds of rocket burn left (0 = not burning). */
  private rocketLeft = 0;
  /** 2-3: after a burn, slowing back to the lever's speed (at least ROCKET.settle m/s²). */
  private settling = false;
  /** 2-3: slipping back down an uphill: seconds so far and where the car center was when it started. */
  private slipping: { t: number; from: number } | null = null;
  /**
   * v²·(m²/s²) an uphill took while the train flew up it (2·|pull|·metres flown), paid at landing: a jump does not
   * climb a steep slope for free (PHASE6 §5.2).
   */
  private airClimb = 0;

  private readonly pose: TrainPose;
  private readonly front = new Vector3();
  private readonly rear = new Vector3();
  private readonly forward = new Vector3();
  private readonly up = new Vector3();
  private readonly xAxis = new Vector3();
  private readonly basis = new Matrix4();

  constructor(
    private readonly network: RailNetwork,
    private readonly junctions: JunctionDef[],
    start: StartDef,
  ) {
    // `start.at` is where the train front stands; the state tracks the lead car center.
    const s0 = start.at - TRAIN.length / 2;
    this.state = { railId: start.railId, s: s0, speed: 0, notch: STOP_NOTCH, direction: start.direction };
    this.pose = {
      railId: start.railId,
      s: s0,
      speed: 0,
      direction: start.direction,
      position: new Vector3(),
      quaternion: new Quaternion(),
      cars: Array.from({ length: TRAIN.carCount - 1 }, () => ({ position: new Vector3(), quaternion: new Quaternion() })),
    };
    this.refreshPending();
    this.computePose();
  }

  get currentRail(): Rail {
    return this.network.getRail(this.state.railId);
  }

  /** True once the train has stopped at the end of the line. */
  get isEnded(): boolean {
    return this.ended;
  }

  /** Distance from the car front to the car center (m). */
  get frontS(): number {
    return this.state.s + TRAIN.length / 2;
  }

  /** Why the controls are locked (doors open, cutscene), or null when the player may drive. */
  get inputLock(): string | null {
    return this.lockReason;
  }

  lockInput(reason: string): void {
    this.lockReason = reason;
  }

  unlockInput(): void {
    this.lockReason = null;
  }

  /** True while the lead bogie is in the air. */
  get airborne(): boolean {
    const arc = this.arcs[this.arcs.length - 1];
    const b = this.bogieS;
    return !!arc && arc.railId === this.state.railId && b > arc.from && b < arc.from + arc.length;
  }

  get isFalling(): boolean {
    return this.falling !== null;
  }

  /** 2-3: true while the rocket burns. */
  get rocketBurning(): boolean {
    return this.rocketLeft > 0;
  }

  /** v1.8: the rocket burns, or its push is still in the speed (slowing back to the lever's speed after a burn). */
  get rocketPushed(): boolean {
    return this.rocketLeft > 0 || this.settling;
  }

  /** 2-3: share of the burn still left (1 right after firing, 0 when not burning). */
  get rocketRemaining(): number {
    return Math.max(0, this.rocketLeft / ROCKET.burn);
  }

  /** 2-3: true while slipping back down an uphill ("ずるずる"). */
  get isSlipping(): boolean {
    return this.slipping !== null;
  }

  /** 2-3: on a downhill slide: the lever does nothing there. */
  get onSlide(): boolean {
    return this.slope !== null && this.slope.pull > 0;
  }

  /**
   * 2-3: fires the rocket (the caller checks pips and quiet places). Refused while locked, stopping for danger,
   * falling, slipping, in the air or already burning. Works from a standstill.
   */
  startRocket(): boolean {
    if (this.ended || this.lockReason !== null || this.emergency || this.falling || this.slipping) return false;
    if (this.airborne || this.rocketLeft > 0) return false;
    this.rocketLeft = ROCKET.burn;
    this.settling = false;
    this.events.emit('rocketStarted');
    return true;
  }

  /** 2-3: cuts the burn short ("ぷしゅっ"): the train then slows back to the lever's speed. */
  stopRocket(): void {
    if (this.rocketLeft <= 0) return;
    this.rocketLeft = 0;
    this.settling = true;
    this.events.emit('rocketEnded', { cut: true });
  }

  /** 0 right after a jump, 1 when the next jump is allowed. */
  get jumpProgress(): number {
    if (this.airborne) return 0;
    if (JUMP.cooldown <= 0) return 1;
    return 1 - Math.min(Math.max(this.jumpCooldown / JUMP.cooldown, 0), 1);
  }

  /** Where the lead bogie is (m along the current rail): the point that falls into a gap. */
  get bogieS(): number {
    return this.frontS - FALL.bogieLead;
  }

  /** The first gap on the current rail the lead bogie has not passed yet, within `range` m. */
  nextGap(range: number): GapDef | null {
    const b = this.bogieS;
    let best: GapDef | null = null;
    for (const g of this.currentRail.gaps as GapDef[]) {
      if (g.to < b || g.from - b > range) continue;
      if (!best || g.from < best.from) best = g;
    }
    return best;
  }

  /**
   * The speed a jump's distance is worked out from. While the rocket's push is in the speed (burning, or slowing
   * back after it) it counts only up to JUMP.maxSpeed, so a rocket-fast train does not fly past the far edge when an
   * earlier stage is played again. An updraft's speed (1-3, whose 40 m gap needs it) still counts in full, also
   * when the rocket burns inside the updraft.
   */
  get jumpSpeed(): number {
    if (this.rocketLeft <= 0 && !this.settling) return this.state.speed;
    return Math.min(this.state.speed, Math.max(JUMP.maxSpeed, this.boostSpeed));
  }

  /** Distance the lead bogie would travel in a jump started now (with the glide to a near far edge). */
  private jumpDistance(): number {
    const plain = this.jumpSpeed * JUMP.airTime * (this.jumpBoost?.power ?? 1);
    const gap = this.nextGap(plain);
    if (!gap) return plain;
    const landing = this.bogieS + plain;
    const needed = gap.to + JUMP.landingMargin - this.bogieS;
    if (landing >= gap.from && landing < gap.to + JUMP.landingMargin && needed - plain <= JUMP.glide * plain) return needed;
    return plain;
  }

  /** True when a jump started now clears the next gap ahead (the button glows). */
  get jumpWouldClear(): boolean {
    if (this.state.speed < JUMP.minSpeed || this.airborne || this.jumpCooldown > 0 || this.falling || this.jumpBlocked) return false;
    const gap = this.nextGap(JUMP.hintDistance);
    if (!gap || this.bogieS >= gap.from) return false;
    return this.bogieS + this.jumpDistance() >= gap.to + JUMP.landingMargin;
  }

  /** Starts a jump. Distance = speed × air time; the lever does nothing until the lead car lands. */
  jump(): JumpResult {
    if (this.ended || this.lockReason !== null || this.emergency || this.falling || this.slipping) return 'locked';
    if (this.airborne) return 'air';
    if (this.jumpCooldown > 0) return 'cooldown';
    if (this.jumpBlocked) return 'bough';
    if (this.state.speed < JUMP.minSpeed) return 'stopped';
    const distance = this.jumpDistance();
    this.arcs.push({ railId: this.state.railId, from: this.bogieS, length: distance, height: this.jumpBoost?.height ?? JUMP.height });
    this.events.emit('jumped', { distance });
    return 'ok';
  }

  /**
   * A jump pad: a big, high jump that always clears the gap right after it (the pad is the helper; finding
   * and waking it is the puzzle). Returns false when the train cannot jump now.
   */
  padJump(): boolean {
    if (this.ended || this.emergency || this.falling || this.airborne || this.state.speed < JUMP.minSpeed) return false;
    const plain = this.jumpSpeed * JUMP.airTime * PAD_JUMP.scale;
    const gap = this.nextGap(plain + 40);
    const needed = gap ? gap.to + JUMP.landingMargin + PAD_JUMP.extra - this.bogieS : 0;
    const distance = Math.max(plain, needed);
    this.arcs.push({ railId: this.state.railId, from: this.bogieS, length: distance, height: PAD_JUMP.height });
    this.events.emit('jumped', { distance });
    return true;
  }

  /**
   * A springy bough throws the train: a jump of `length` m (lead bogie) and `height` m from here, whatever the
   * gap ahead (too slow = too short, and the train falls). Returns false when it cannot jump now.
   */
  launch(length: number, height: number): boolean {
    if (this.ended || this.emergency || this.falling || this.airborne || this.state.speed < JUMP.minSpeed) return false;
    this.arcs.push({ railId: this.state.railId, from: this.bogieS, length, height });
    this.events.emit('jumped', { distance: length });
    return true;
  }

  /**
   * Returns false when the controls are locked (the caller should tell the player why). The lever also stays put
   * while the rocket burns and on a downhill slide (2-3), like in the air.
   */
  setNotch(notch: number): boolean {
    if (this.ended || this.lockReason !== null || this.emergency || this.airborne || this.falling) return false;
    if (this.rocketLeft > 0 || this.slipping || this.onSlide) return false;
    const next = Math.min(Math.max(Math.round(notch), 0), SPEED_NOTCHES.length - 1);
    if (next === HARD_BRAKE_NOTCH && this.state.notch !== HARD_BRAKE_NOTCH && this.state.speed > 3) {
      this.events.emit('hardBrake', { speed: this.state.speed });
    }
    this.state.notch = next;
    return true;
  }

  /**
   * Brakes hard to a stop regardless of the lever (danger ahead). Cleared by rewindTo(). A train that is already
   * standing (e.g. time runs out at a station) keeps its notch, so the speed word still matches the lever.
   */
  emergencyStop(): void {
    this.stopRocket();
    this.emergency = true;
    if (this.state.speed > 0) this.state.notch = HARD_BRAKE_NOTCH;
  }

  /** Puts the train back with its front at `frontS` (on `railId`, default the current rail), stopped, lever at "stop". */
  rewindTo(frontS: number, railId?: string): void {
    const st = this.state;
    if (railId) st.railId = railId;
    this.arcs = [];
    this.falling = null;
    this.slipping = null;
    this.airClimb = 0;
    this.rocketLeft = 0;
    this.settling = false;
    this.slope = null;
    this.jumpCooldown = 0;
    st.s = this.wrap(frontS - TRAIN.length / 2);
    st.speed = 0;
    st.notch = STOP_NOTCH;
    this.emergency = false;
    this.ended = false;
    this.refreshPending();
    this.computePose();
  }

  /** True when the current rail loops back into itself. */
  get onLoop(): boolean {
    const end = this.currentRail.end;
    return end.type === 'merge' && end.railId === this.state.railId;
  }

  /** Signed distance along the current rail from the car front to `at` (loop-aware). Null on another rail. */
  distanceAhead(railId: string, at: number): number | null {
    if (railId !== this.state.railId) return null;
    let d = at - this.frontS;
    if (this.onLoop) {
      const L = this.currentRail.length;
      while (d < -L / 2) d += L;
      while (d > L / 2) d -= L;
    }
    return d;
  }

  /**
   * Distance from the car front to `at` on `railId` along the way the train will go from here: through the junctions
   * ahead (the side chosen, else the default) and merges. Null when that way does not reach it within a few rails.
   */
  routeDistance(railId: string, at: number): number | null {
    const direct = this.distanceAhead(railId, at);
    if (direct !== null) return direct;
    let rail = this.currentRail;
    // The front's position measured on `rail` (it may run past the rail's ends while following the route).
    let front = this.frontS;
    let ahead: JunctionDef[] = this.pending;
    for (let hop = 0; hop < 6; hop++) {
      const turn = ahead.find((j) => {
        const side = j === this.announced && this.choice ? this.choice : j.default;
        const to = j[side];
        return to !== undefined && to !== rail.id;
      });
      if (turn) {
        const side = turn === this.announced && this.choice ? this.choice : turn.default;
        front -= turn.at;
        rail = this.network.getRail(turn[side] as string);
        if (rail.id === railId) return at - front;
      } else if (rail.end.type === 'merge' && rail.end.railId !== rail.id) {
        const entry = rail.end.at;
        front = entry + front - rail.length;
        rail = this.network.getRail(rail.end.railId);
        if (rail.id === railId) return at >= entry ? at - front : null;
      } else {
        return null;
      }
      const center = front - TRAIN.length / 2;
      ahead = this.junctions.filter((j) => j.railId === rail.id && j.at > center).sort((a, b) => a.at - b.at);
    }
    return null;
  }

  /** Signed distance from the car FRONT to `at` on the current rail (loop-aware). */
  offsetTo(at: number): number {
    let d = at - this.frontS;
    if (this.onLoop) {
      const L = this.currentRail.length;
      while (d < -L / 2) d += L;
      while (d > L / 2) d -= L;
    }
    return d;
  }

  private wrap(s: number): number {
    if (!this.onLoop) return Math.max(0, s);
    const L = this.currentRail.length;
    return ((s % L) + L) % L;
  }

  /** The junction the arrows are shown for (announced and not passed yet), or null. */
  get announcedJunction(): JunctionDef | null {
    return this.announced;
  }

  chooseJunction(side: JunctionSide): void {
    if (!this.announced || this.locked) return;
    if (this.announced[side] === undefined) return;
    this.choice = side;
  }

  /** The lever's target speed and brake now (the automatic stop before a buffer / stop point included). */
  private leverTarget(rail: Rail): { target: number; brake: number } {
    const st = this.state;
    const notch = LEVER_NOTCHES[st.notch];
    let target: number = notch.speed * this.speedScale;
    let brake: number = notch.brake;
    const stopAt = this.stopDistance(rail);
    if (stopAt !== null) {
      const remaining = stopAt - st.s;
      const brakeDistance = (st.speed * st.speed) / (2 * BRAKING);
      if (remaining <= brakeDistance + 1) {
        target = 0;
        brake = Math.max(brake, BRAKING);
      }
    }
    return { target, brake };
  }

  /** How fast an uphill of `pull` (< 0) slows the train as it is now (m/s²): the same rule as update(). */
  uphillDecel(pull: number): number {
    const { target, brake } = this.leverTarget(this.currentRail);
    return this.uphillRate(-pull, target, brake);
  }

  private uphillRate(pull: number, target: number, brake: number): number {
    return this.settling ? Math.max(pull, ROCKET.settle, brake) : pull + (target < this.state.speed ? brake : 0);
  }

  update(dt: number): void {
    const st = this.state;
    let rail = this.currentRail;
    const wasAirborne = this.airborne;

    const lever = this.leverTarget(rail);
    let target = lever.target;
    const brake = lever.brake;

    // The rocket burns for its time wherever the train is (in the air too), but only pushes on the rail.
    const burning = this.rocketLeft > 0 && !this.falling && !this.emergency;
    if (burning) {
      this.rocketLeft = Math.max(0, this.rocketLeft - dt);
      if (this.rocketLeft === 0) {
        this.settling = true;
        this.events.emit('rocketEnded', { cut: false });
      }
    }
    const slope = this.slope;
    if (this.settling && st.speed <= target + 1e-3) this.settling = false;

    if (this.falling) {
      // Slide on a little while sinking; the runner fades out and puts the train back.
      this.falling.t = Math.min(this.falling.t + dt, FALL.seconds);
      st.speed = Math.max(0, st.speed - st.speed * 1.8 * dt);
    } else if (wasAirborne) {
      // Ballistic: the speed does not change in the air (the arc keeps its shape). Up a steep slope without the
      // rocket, the climb is still paid, at landing (handleJump), as if the train had rolled the distance flown.
      if (slope && slope.pull < 0 && !burning) this.airClimb += 2 * -slope.pull * st.speed * dt;
    } else if (this.emergency) {
      target = 0;
      const rate = Math.max(BRAKING, SPEED_NOTCHES[SPEED_NOTCHES.length - 1] / EMERGENCY_STOP_SECONDS);
      st.speed = Math.max(0, st.speed - rate * dt);
    } else if (this.slipping) {
      // "ずるずる": back down the slope a few metres, wheels spinning (the runner puts the train back).
      this.slipping.t = Math.min(this.slipping.t + dt, SLOPE.slipSeconds);
      const k = this.slipping.t / SLOPE.slipSeconds;
      st.speed = 0;
      st.s = this.slipping.from - SLOPE.slipBack * k * (2 - k);
    } else if (burning) {
      // Lever, light and uphill pull do not matter while the rocket pushes.
      if (st.speed < ROCKET.speed) st.speed = Math.min(ROCKET.speed, st.speed + ROCKET.accel * dt);
    } else if (slope && slope.pull > 0) {
      // A slide: the lever does nothing; faster and faster up to its top speed.
      if (st.speed > slope.max) st.speed = Math.max(slope.max, st.speed - SLOPE.overMax * dt);
      else st.speed = Math.min(slope.max, st.speed + slope.pull * dt);
      // Rocket speed carried onto the slide stays capped for jumps until the slide has slowed it to its top speed.
      if (st.speed <= slope.max) this.settling = false;
    } else if (slope && slope.pull < 0) {
      // Too steep for the lever: it only slows down. Braking adds the notch's brake; after the rocket the pull
      // (stronger than the settle) is what slows the train, as in the design's climb table (PHASE6 §7).
      const rate = this.uphillRate(-slope.pull, target, brake);
      st.speed = Math.max(0, st.speed - rate * dt);
      if (st.speed === 0) {
        this.slipping = { t: 0, from: st.s };
        this.settling = false;
        this.events.emit('slipped', { railId: st.railId, s: this.frontS });
      }
    } else if (this.boostSpeed > target && st.notch > STOP_NOTCH) {
      // An updraft takes over the speed (and its jumps count it in full).
      this.settling = false;
      st.speed = Math.min(this.boostSpeed, st.speed + UPDRAFT_ACCELERATION * dt);
    } else if (st.speed < target) st.speed = Math.min(target, st.speed + ACCELERATION * dt);
    else if (st.speed > target) st.speed = Math.max(target, st.speed - (this.settling ? Math.max(brake, ROCKET.settle) : brake) * dt);

    st.s += st.speed * dt * st.direction;

    this.handleJunctions();
    rail = this.currentRail;
    this.handleEnd(rail);
    this.handleJump(dt, wasAirborne);
    this.computePose();
  }

  private handleJump(dt: number, wasAirborne: boolean): void {
    const airborne = this.airborne;
    if (wasAirborne && !airborne) {
      this.jumpCooldown = JUMP.cooldown;
      this.events.emit('landed');
      if (this.airClimb > 0) this.payAirClimb();
    }
    if (!airborne && this.jumpCooldown > 0) this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    // Forget arcs the last car has left behind.
    const lastBogie = this.state.s - TRAIN.carSpacing * (TRAIN.carCount - 1) - TRAIN.bogieOffset;
    this.arcs = this.arcs.filter((a) => a.railId !== this.state.railId || a.from + a.length > lastBogie);
    if (airborne || this.falling) return;
    const b = this.bogieS;
    const gap = (this.currentRail.gaps as GapDef[]).find((g) => b >= g.from && b <= g.to);
    if (!gap) return;
    const short = this.arcs.some((a) => a.railId === this.state.railId && a.from + a.length > gap.from - 12);
    this.falling = { t: 0 };
    this.stopRocket();
    this.events.emit('fell', { gap, railId: this.state.railId, short });
  }

  /**
   * Landed after flying up a steep slope: the speed the climb took (v² − 2·|pull|·d, the same as rolling it). Out of
   * speed, the train slips from where it came down; the arcs go, so the cars still over them do not rise again as
   * it slides back along them.
   */
  private payAirClimb(): void {
    const st = this.state;
    st.speed = Math.sqrt(Math.max(0, st.speed * st.speed - this.airClimb));
    this.airClimb = 0;
    if (st.speed > 0 || this.slipping || this.emergency || !this.slope || this.slope.pull >= 0) return;
    this.arcs = [];
    this.slipping = { t: 0, from: st.s };
    this.settling = false;
    this.events.emit('slipped', { railId: st.railId, s: this.frontS });
  }

  /** Shifts jump arcs when the train's s is re-based (junction or merge). */
  private shiftArcs(delta: number, railId: string): void {
    for (const a of this.arcs) {
      a.from += delta;
      a.railId = railId;
    }
  }

  getPose(): TrainPose {
    return this.pose;
  }

  /** Where the train must stop on this rail, or null when the rail continues (merge). */
  private stopDistance(rail: Rail): number | null {
    if (rail.end.type === 'merge') return null;
    return rail.length - BUFFER_MARGIN;
  }

  private refreshPending(): void {
    const st = this.state;
    this.pending = this.junctions
      .filter((j) => j.railId === st.railId && j.at > st.s)
      .sort((a, b) => a.at - b.at);
    this.announced = null;
    this.locked = false;
    this.choice = null;
  }

  private handleJunctions(): void {
    const st = this.state;
    const j = this.pending[0];
    if (!j) return;

    if (!this.announced && st.s >= j.at - JUNCTION_ARROW_DISTANCE) {
      this.announced = j;
      this.choice = null;
      this.locked = false;
      this.events.emit('junctionApproach', {
        junction: j,
        left: j.left !== undefined,
        right: j.right !== undefined,
        default: j.default,
      });
    }
    if (this.announced && !this.locked && st.s >= j.at - JUNCTION_LOCK_DISTANCE) {
      this.locked = true;
      this.events.emit('junctionLocked');
    }
    if (st.s >= j.at) {
      const side = this.choice ?? j.default;
      const targetId = j[side] ?? st.railId;
      this.pending.shift();
      this.announced = null;
      this.locked = false;
      this.choice = null;
      if (targetId !== st.railId) {
        st.s -= j.at;
        this.shiftArcs(-j.at, targetId);
        st.railId = targetId;
        this.refreshPending();
        this.events.emit('railChanged', { railId: targetId });
      }
      this.events.emit('junctionPassed');
    }
  }

  private handleEnd(rail: Rail): void {
    const st = this.state;
    if (rail.end.type === 'merge') {
      if (st.s >= rail.length) {
        st.s = rail.end.at + (st.s - rail.length);
        this.shiftArcs(rail.end.at - rail.length, rail.end.railId);
        st.railId = rail.end.railId;
        this.refreshPending();
        this.events.emit('railChanged', { railId: st.railId });
      }
      return;
    }
    const stopAt = rail.length - BUFFER_MARGIN;
    if (st.s >= stopAt) {
      st.s = stopAt;
      st.speed = 0;
    }
    if (!this.ended && st.speed === 0 && st.notch > STOP_NOTCH && stopAt - st.s < 3) {
      this.ended = true;
      st.notch = STOP_NOTCH;
      this.events.emit('endOfLine');
    }
  }

  /** Frame on the current rail; wraps on loops, extrapolates at the ends otherwise. */
  private frameOnRail(s: number) {
    return this.currentRail.frameAt(this.onLoop ? this.wrap(s) : s);
  }

  /** Lift (m) from jump arcs at position `s`. */
  private arcLift(s: number): number {
    let h = 0;
    for (const a of this.arcs) if (a.railId === this.state.railId) h = Math.max(h, arcHeight(a, s));
    return h;
  }

  /** Sink (m) while falling; the front bogie sinks deeper so the car tips forward. */
  private fallDrop(front: boolean): number {
    if (!this.falling) return 0;
    const k = this.falling.t / FALL.seconds;
    return FALL.depth * k * k * (front ? 1.25 : 0.85);
  }

  /** Writes the body transform of a car centered at `s` into `position`/`quaternion`. */
  private carPose(s: number, position: Vector3, quaternion: Quaternion): void {
    const front = this.frameOnRail(s + TRAIN.bogieOffset);
    const rear = this.frameOnRail(s - TRAIN.bogieOffset);
    // The car rides the arc at its center and keeps only a hint of the arc's slope, so the cab view
    // stays on the horizon ("ぴょん" like a toy, not a ski jump). Falling tips it forward.
    const hc = this.arcLift(s);
    const sag = this.sagAt;
    const id = this.state.railId;
    const sf = sag ? sag(id, s + TRAIN.bogieOffset) : 0;
    const sr = sag ? sag(id, s - TRAIN.bogieOffset) : 0;
    const hf = hc + JUMP_PITCH * (this.arcLift(s + TRAIN.bogieOffset) - hc) - this.fallDrop(true) - sf;
    const hr = hc + JUMP_PITCH * (this.arcLift(s - TRAIN.bogieOffset) - hc) - this.fallDrop(false) - sr;
    this.front.copy(front.position).addScaledVector(front.up, hf);
    this.rear.copy(rear.position).addScaledVector(rear.up, hr);
    position.addVectors(this.front, this.rear).multiplyScalar(0.5);
    this.forward.subVectors(this.front, this.rear).normalize();
    this.up.addVectors(front.up, rear.up).normalize();
    this.xAxis.crossVectors(this.up, this.forward).normalize();
    this.up.crossVectors(this.forward, this.xAxis).normalize();
    this.basis.makeBasis(this.xAxis, this.up, this.forward);
    quaternion.setFromRotationMatrix(this.basis);
  }

  private computePose(): void {
    const st = this.state;
    const pose = this.pose;
    pose.railId = st.railId;
    pose.s = st.s;
    pose.speed = st.speed;
    pose.direction = st.direction;
    this.carPose(st.s, pose.position, pose.quaternion);
    pose.cars.forEach((car, i) => this.carPose(st.s - TRAIN.carSpacing * (i + 1), car.position, car.quaternion));
  }
}
