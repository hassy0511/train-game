import { Emitter } from '../core/events';
import { LIGHT } from '../train/params';

/** v1.11 (PR5): the light button's steps. "magnet" only once the magnet light is learned. */
export type LightMode = 'off' | 'light' | 'magnet';

/**
 * v1.11 (PR5, PHASE9_0 §2, PHASE9_CHAPTER5_6 第 2 部 M5): the light button's step. Each press goes one step on: off →
 * light → magnet → off, or off ⇄ light before the magnet light is learned. Presses closer than LIGHT.cooldown s (game
 * time) are ignored, so mashing it changes the step no faster than that. The step is the child's own choice: nothing
 * changes it by place (a cutscene, a resume and a skip set it).
 */
export class LightSwitch {
  readonly events = new Emitter<{ mode: { mode: LightMode; from: LightMode } }>();
  private current: LightMode = 'off';
  private readyAt = -Infinity;

  constructor(
    private readonly hasMagnet: () => boolean,
    private readonly now: () => number,
  ) {}

  get mode(): LightMode {
    return this.current;
  }

  /** How many steps the button has: 3 with the magnet light, else 2. */
  get steps(): 2 | 3 {
    return this.hasMagnet() ? 3 : 2;
  }

  /** The step a press goes to from `mode`. */
  next(mode: LightMode = this.current): LightMode {
    if (mode === 'off') return 'light';
    if (mode === 'light') return this.hasMagnet() ? 'magnet' : 'off';
    return 'off';
  }

  /** One step on; false (nothing changes) while cooling down. */
  press(): boolean {
    const t = this.now();
    if (t < this.readyAt) return false;
    this.readyAt = t + LIGHT.cooldown;
    this.set(this.next());
    return true;
  }

  /** Sets the step (a cutscene, a resume, a skip; the press). No cooldown. */
  set(mode: LightMode): void {
    const from = this.current;
    if (mode === 'magnet' && !this.hasMagnet()) mode = 'light';
    if (mode === from) return;
    this.current = mode;
    this.events.emit('mode', { mode, from });
  }
}
