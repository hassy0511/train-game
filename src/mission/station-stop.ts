import type { StationDef, StopRule } from '../stage/types';
import { STOP_RULE } from '../train/params';
import type { Train } from '../train/train';

export type StopGrade = 'perfect' | 'ok';

export type StopOutcome =
  | { kind: 'tooFast'; speed: number }
  | { kind: 'overshoot'; offset: number }
  | { kind: 'stopped'; grade: StopGrade; offset: number }
  | { kind: 'short'; offset: number }
  | { kind: 'near' };

const SHORT_REPEAT_SECONDS = 5;

/**
 * Watches the train approach one station and grades the stop.
 * Offsets are "stop mark minus car center": positive = still short of the mark.
 */
export class StopMonitor {
  readonly rule: StopRule;
  private zoneEntered = false;
  private nearAnnounced = false;
  private shortTimer = 0;
  private done = false;

  constructor(
    private readonly train: Train,
    readonly station: StationDef,
    /** Distance at which to announce the station (hint), in meters. */
    private readonly nearDistance = 120,
  ) {
    this.rule = { ...STOP_RULE, ...(station.stop ?? {}) };
  }

  reset(): void {
    this.zoneEntered = false;
    this.nearAnnounced = false;
    this.shortTimer = 0;
    this.done = false;
  }

  update(dt: number): StopOutcome | null {
    if (this.done) return null;
    const st = this.train.state;
    if (st.railId !== this.station.railId) return null;
    const offset = this.train.offsetTo(this.station.at);
    const { zone, ok, perfect, maxSpeed } = this.rule;

    if (!this.nearAnnounced && offset <= this.nearDistance && offset > zone) {
      this.nearAnnounced = true;
      return { kind: 'near' };
    }

    if (offset < -ok) {
      this.done = true;
      return { kind: 'overshoot', offset };
    }

    if (offset <= zone) {
      if (!this.zoneEntered) {
        this.zoneEntered = true;
        if (st.speed > maxSpeed) {
          this.done = true;
          return { kind: 'tooFast', speed: st.speed };
        }
      }
      if (st.speed === 0) {
        if (offset <= ok) {
          this.done = true;
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
