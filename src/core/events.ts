/** Minimal typed event emitter. Events with a `void` payload are emitted without an argument. */
export type Listener<T> = (payload: T) => void;

type Args<T> = T extends void ? [] : [payload: T];

export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(key: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(fn as Listener<never>);
    return () => set?.delete(fn as Listener<never>);
  }

  emit<K extends keyof Events>(key: K, ...args: Args<Events[K]>): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const fn of set) (fn as Listener<unknown>)(args[0]);
  }
}
