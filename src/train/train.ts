import { Matrix4, Quaternion, Vector3 } from 'three';
import { Emitter } from '../core/events';
import type { Rail, RailNetwork } from '../rail/types';
import type { JunctionDef, StartDef } from '../stage/types';
import {
  ACCELERATION,
  BRAKING,
  BUFFER_MARGIN,
  EMERGENCY_STOP_SECONDS,
  JUNCTION_ARROW_DISTANCE,
  JUNCTION_LOCK_DISTANCE,
  SPEED_NOTCHES,
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
    this.state = { railId: start.railId, s: start.at, speed: 0, notch: 0, direction: start.direction };
    this.pose = {
      railId: start.railId,
      s: start.at,
      speed: 0,
      direction: start.direction,
      position: new Vector3(),
      quaternion: new Quaternion(),
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

  /** Returns false when the controls are locked (the caller should tell the player why). */
  setNotch(notch: number): boolean {
    if (this.ended || this.lockReason !== null || this.emergency) return false;
    this.state.notch = Math.min(Math.max(Math.round(notch), 0), SPEED_NOTCHES.length - 1);
    return true;
  }

  /** Brakes hard to a stop regardless of the lever (danger ahead). Cleared by rewindTo(). */
  emergencyStop(): void {
    this.emergency = true;
    this.state.notch = 0;
  }

  /** Puts the train back at `s` on the current rail, stopped, lever at "stop". */
  rewindTo(s: number): void {
    const st = this.state;
    st.s = this.wrap(s);
    st.speed = 0;
    st.notch = 0;
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

  /** Signed distance from the car center to `at` on the current rail (loop-aware). */
  offsetTo(at: number): number {
    let d = at - this.state.s;
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

  chooseJunction(side: JunctionSide): void {
    if (!this.announced || this.locked) return;
    if (this.announced[side] === undefined) return;
    this.choice = side;
  }

  update(dt: number): void {
    const st = this.state;
    let rail = this.currentRail;

    let target: number = SPEED_NOTCHES[st.notch];
    const stopAt = this.stopDistance(rail);
    if (stopAt !== null) {
      const remaining = stopAt - st.s;
      const brakeDistance = (st.speed * st.speed) / (2 * BRAKING);
      if (remaining <= brakeDistance + 1) target = 0;
    }

    if (this.emergency) {
      target = 0;
      const rate = Math.max(BRAKING, SPEED_NOTCHES[SPEED_NOTCHES.length - 1] / EMERGENCY_STOP_SECONDS);
      st.speed = Math.max(0, st.speed - rate * dt);
    } else if (st.speed < target) st.speed = Math.min(target, st.speed + ACCELERATION * dt);
    else if (st.speed > target) st.speed = Math.max(target, st.speed - BRAKING * dt);

    st.s += st.speed * dt * st.direction;

    this.handleJunctions();
    rail = this.currentRail;
    this.handleEnd(rail);
    this.computePose();
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
    if (!this.ended && st.speed === 0 && st.notch > 0 && stopAt - st.s < 3) {
      this.ended = true;
      st.notch = 0;
      this.events.emit('endOfLine');
    }
  }

  private computePose(): void {
    const st = this.state;
    const rail = this.currentRail;
    const front = rail.frameAt(st.s + TRAIN.bogieOffset);
    const rear = rail.frameAt(st.s - TRAIN.bogieOffset);
    this.front.copy(front.position);
    this.rear.copy(rear.position);

    const pose = this.pose;
    pose.railId = st.railId;
    pose.s = st.s;
    pose.speed = st.speed;
    pose.direction = st.direction;
    pose.position.addVectors(this.front, this.rear).multiplyScalar(0.5);

    this.forward.subVectors(this.front, this.rear).normalize();
    this.up.addVectors(front.up, rear.up).normalize();
    this.xAxis.crossVectors(this.up, this.forward).normalize();
    this.up.crossVectors(this.forward, this.xAxis).normalize();
    this.basis.makeBasis(this.xAxis, this.up, this.forward);
    pose.quaternion.setFromRotationMatrix(this.basis);
  }
}
