import type { StationDef, StopRule } from '../stage/types';
import { GAUGE_DISTANCE, STOP_RULE } from '../train/params';
import type { Train } from '../train/train';

export type StopGrade = 'perfect' | 'ok';

export type StopOutcome =
  | { kind: 'tooFast'; speed: number }
  | { kind: 'overshoot'; offset: number }
  | { kind: 'stopped'; grade: StopGrade; offset: number }
  | { kind: 'short'; offset: number }
  | { kind: 'near' }
  | { kind: 'gaugeShown' };

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
    if (st.railId !== this.station.railId) return null;
    const offset = this.train.offsetTo(this.station.at);
    const { zone, ok, perfect, maxSpeed } = this.rule;

    this.gauge.offset = offset;
    this.gauge.visible = offset <= GAUGE_DISTANCE && offset > -GAUGE_DISTANCE / 4;
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
