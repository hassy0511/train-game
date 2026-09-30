import { Emitter } from '../core/events';
import type { PlowSpan } from '../stage/types';
import { PLOW } from '../train/params';
import type { Train } from '../train/train';
import type { PlowSystem } from './plow';

export interface PlowHintEvents extends Record<string, unknown> {
  /** Snow to clear came within PLOW.approach m ahead with the blade up: the button starts glowing (`span.line` said). */
  plowNear: { span: PlowSpan };
}

/**
 * The snowplow button's hint (PHASE9_0: "ゆきかき" has its own button and works anywhere; this only says where it
 * helps). It glows from PLOW.approach m before snow still to clear along the way the train will go, until the blade
 * is down. The jump seat's faces of PHASE8 (jump / もぐる / ゆきかき on one button) are gone.
 */
export class PlowHint {
  readonly events = new Emitter<PlowHintEvents>();
  private wasNear = false;

  constructor(
    private readonly plow: PlowSystem,
    private readonly train: Train,
  ) {}

  /** Snow to clear lies within PLOW.approach m ahead (test hook `data-plow="near"`). */
  get near(): boolean {
    return this.wasNear;
  }

  get glow(): boolean {
    return this.wasNear && !this.train.bladeDown;
  }

  /** Call every frame after the train moved. */
  update(): void {
    const next = this.plow.enabled ? this.train.nextPlowWall(PLOW.approach) : null;
    const near = next !== null;
    if (near === this.wasNear) return;
    this.wasNear = near;
    if (near && !this.train.bladeDown) this.events.emit('plowNear', { span: next.span });
  }
}
