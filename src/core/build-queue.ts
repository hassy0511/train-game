/**
 * v1.11 (PR11a, PHASE9_CHAPTER5_6 第 3 部 B13): a small queue of building work done a slice at a time ("あとから
 * 作る"): every frame `run(ms)` does tasks until `ms` milliseconds are used (at least one), the rest waits for the next
 * frame. iPad Safari has no requestIdleCallback, so the game's own frame loop drives it. Tasks belong to a group (a
 * section): `flush(group)` does all of one group's at once (the white of a gate hides the hitch), `ready(group)` says
 * whether nothing of it is left.
 */
export class BuildQueue {
  private readonly tasks: { group: string; run: () => void }[] = [];
  private readonly groups = new Set<string>();
  /** Milliseconds spent building so far (the test hooks show it). */
  spentMs = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Adds a task of group `group` (run in the order added). */
  add(group: string, run: () => void): void {
    this.tasks.push({ group, run });
    this.groups.add(group);
  }

  /** Nothing of group `group` is left to build (a group never added is ready). */
  ready(group: string): boolean {
    return !this.tasks.some((t) => t.group === group);
  }

  /** The groups ever added whose tasks are all done. */
  readyGroups(): string[] {
    return [...this.groups].filter((g) => this.ready(g));
  }

  get pending(): number {
    return this.tasks.length;
  }

  /** Does tasks for up to `ms` milliseconds (always at least one when any are left). */
  run(ms: number): void {
    if (this.tasks.length === 0) return;
    const start = this.now();
    do {
      const task = this.tasks.shift();
      task?.run();
    } while (this.tasks.length > 0 && this.now() - start < ms);
    this.spentMs += this.now() - start;
  }

  /** Does every task of group `group` now. */
  flush(group: string): void {
    if (this.ready(group)) return;
    const start = this.now();
    const mine = this.tasks.filter((t) => t.group === group);
    for (let i = this.tasks.length - 1; i >= 0; i--) if (this.tasks[i].group === group) this.tasks.splice(i, 1);
    for (const t of mine) t.run();
    this.spentMs += this.now() - start;
  }
}
