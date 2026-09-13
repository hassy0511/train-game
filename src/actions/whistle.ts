import { WHISTLE_COOLDOWN } from '../train/params';

export type WhistleReactor = () => void;

/** Whistle action: cooldown plus a registry of things that react to it (stage actors register here). */
export class Whistle {
  private remaining = 0;
  private readonly reactors = new Set<WhistleReactor>();

  get ready(): boolean {
    return this.remaining <= 0;
  }

  /** 0 while just fired, 1 when ready again. */
  get progress(): number {
    return 1 - Math.min(Math.max(this.remaining / WHISTLE_COOLDOWN, 0), 1);
  }

  onWhistle(reactor: WhistleReactor): () => void {
    this.reactors.add(reactor);
    return () => this.reactors.delete(reactor);
  }

  /** Fires the whistle if it is ready. Returns false during cooldown (nothing happens). */
  trigger(): boolean {
    if (!this.ready) return false;
    this.remaining = WHISTLE_COOLDOWN;
    for (const r of this.reactors) r();
    return true;
  }

  update(dt: number): void {
    if (this.remaining > 0) this.remaining = Math.max(0, this.remaining - dt);
  }
}
