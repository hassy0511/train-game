import type { StationDef, StopRule } from '../stage/types';
import { GAUGE_DISTANCE, REVERSE, STOP_RULE } from '../train/params';
import type { Train } from '../train/train';

export type StopGrade = 'perfect' | 'ok';

export type StopOutcome =
  | { kind: 'tooFast'; speed: number }
  | { kind: 'overshoot'; offset: number }
  | { kind: 'stopped'; grade: StopGrade; offset: number }
  | { kind: 'short'; offset: number }
  | { kind: 'near' }
  | { kind: 'gaugeShown' }
  /**
   * v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A9): past the line with うしろむき learned: no fail (every frame while so;
   * the runner says "うしろで もどって" once, again when the train just stands there).
   */
  | { kind: 'backUp'; offset: number; stationId: string };

/** What the stop gauge should show this frame. `offset` is stop line minus train front (m). */
export interface GaugeState {
  visible: boolean;
  offset: number;
  range: number;
  ok: number;
  perfect: number;
  tooFast: boolean;
}

const SHORT_REPEAT_SECONDS = 5;

/**
 * Watches the train approach one station and grades the stop.
 * Offsets are "stop line minus train front": positive = still short of the line.
 */
export class StopMonitor {
  readonly rule: StopRule;
  readonly gauge: GaugeState;
  private zoneEntered = false;
  private nearAnnounced = false;
  private gaugeAnnounced = false;
  private shortTimer = 0;
  private done = false;

  constructor(
    private readonly train: Train,
    readonly station: StationDef,
    /** Distance at which to announce the station (hint), in meters. */
    private readonly nearDistance = 120,
    /** v1.11 (PR8a, A9): うしろむき is learned: past the line (up to REVERSE.overshootGiveUp m) the train may back up. */
    private readonly canBackUp: () => boolean = () => false,
  ) {
    this.rule = { ...STOP_RULE, ...(station.stop ?? {}) };
    this.gauge = { visible: false, offset: GAUGE_DISTANCE, range: GAUGE_DISTANCE, ok: this.rule.ok, perfect: this.rule.perfect, tooFast: false };
  }

  reset(): void {
    this.zoneEntered = false;
    this.nearAnnounced = false;
    this.gaugeAnnounced = false;
    this.shortTimer = 0;
    this.done = false;
    this.gauge.visible = false;
  }

  /** True once the stop has been graded (or failed). */
  get finished(): boolean {
    return this.done;
  }

  update(dt: number): StopOutcome | null {
    if (this.done) return null;
    const st = this.train.state;
    if (st.railId !== this.station.railId) {
      // Off on another line (a side track, a wrong turn): no gauge until back on the station's line.
      this.gauge.visible = false;
      return null;
    }
    const offset = this.train.offsetTo(this.station.at);
    const { zone, ok, perfect, maxSpeed } = this.rule;

    this.gauge.offset = offset;
    const backUp = this.canBackUp();
    this.gauge.visible = offset <= GAUGE_DISTANCE && offset > (backUp ? -REVERSE.overshootGiveUp : -GAUGE_DISTANCE / 4);
    this.gauge.tooFast = this.gauge.visible && st.speed > maxSpeed;
    if (this.gauge.visible && !this.gaugeAnnounced) {
      this.gaugeAnnounced = true;
      return { kind: 'gaugeShown' };
    }

    if (!this.nearAnnounced && offset <= this.nearDistance && offset > zone) {
      this.nearAnnounced = true;
      return { kind: 'near' };
    }

    if (offset < -ok) {
      // v1.11 (PR8a, A9): with うしろむき, overshooting is not a fail until REVERSE.overshootGiveUp m past; backing up
      // to the line (the trail's floor is there) and standing is a stop graded as always. Too fast is still too fast.
      if (backUp && offset >= -REVERSE.overshootGiveUp) {
        if (!this.zoneEntered && offset <= zone) {
          this.zoneEntered = true;
          if (st.speed > maxSpeed) {
            this.done = true;
            this.gauge.visible = false;
            return { kind: 'tooFast', speed: st.speed };
          }
        }
        return { kind: 'backUp', offset, stationId: this.station.id };
      }
      this.done = true;
      this.gauge.visible = false;
      return { kind: 'overshoot', offset };
    }

    if (offset <= zone) {
      if (!this.zoneEntered) {
        this.zoneEntered = true;
        if (st.speed > maxSpeed) {
          this.done = true;
          this.gauge.visible = false;
          return { kind: 'tooFast', speed: st.speed };
        }
      }
      if (st.speed === 0) {
        if (offset <= ok) {
          this.done = true;
          this.gauge.visible = false;
          return { kind: 'stopped', grade: Math.abs(offset) <= perfect ? 'perfect' : 'ok', offset };
        }
        this.shortTimer -= dt;
        if (this.shortTimer <= 0) {
          this.shortTimer = SHORT_REPEAT_SECONDS;
          return { kind: 'short', offset };
        }
      } else {
        this.shortTimer = 0;
      }
    }
    return null;
  }
}
