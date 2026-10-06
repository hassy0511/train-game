import { Emitter } from '../core/events';
import type { JunctionDef, LineDef, StageData, StationDef } from '../stage/types';
import { RECORD, REVERSE, STOP_NOTCH } from '../train/params';
import type { ReverseStop } from '../train/consist';
import type { Train } from '../train/train';
import type { ReverseReader } from '../mission/lead';

/**
 * v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A14): the partner's lines for うしろむき (a mission's lines win; every one within
 * 20 letters). "backUp" is the overshot station's (A9); "needAbility" the post's without うしろむき (NEED_LINES too).
 */
export const REVERSE_LINES = {
  backNear: 'うしろむきで いって みよう！',
  backArrows: 'やじるしで わきみちへ！',
  reverseNudge: 'レバーを あげると うしろへ すすむよ',
  reverseStop: 'おっとっと！ ここまで',
  reverseStopGap: 'おっとっと！ きれめだ',
  reverseEnd: 'ついた！ まえに もどろう',
  backUp: 'いきすぎ〜！ うしろで もどって！',
  refuseRocketBack: 'うしろでは つかえないよ',
  reverseOops: 'あれれ？ まえに もどろう',
  needAbility: 'うしろむきに はしれたら…',
} as const;

export type ReverseLineKey = keyof typeof REVERSE_LINES;

/**
 * v1.11 (PR11b, 第 3 部 A14): the same lines in Sakasa's words, said by her when she rides along (`crew`, 6-2) and the
 * mission has no line of that key. The keys left out stay the partner's.
 */
export const SAKASA_REVERSE_LINES: Partial<Record<ReverseLineKey, string>> = {
  backNear: 'うしろむきの みち なのだ！',
  backArrows: 'やじるしで はいる のだ！',
  reverseNudge: 'レバーを あげる のだ〜',
  reverseStop: 'ここまで なのだ',
  reverseStopGap: 'きれめ なのだ！',
  reverseEnd: 'ついた のだ！',
  backUp: 'うしろで もどる のだ！',
};

/** A line to say: its key (the mission's own line of that key wins), or a stage's own text. */
export interface ReverseLine {
  key: ReverseLineKey;
  /** The stage's own words for it (a back junction's `line`, a record's `endLines`), said instead of the key's. */
  own?: (string | LineDef)[];
}

/** Phases the system cares about (the runner's; the test course: driving or stopped). */
export type ReversePhase = 'driving' | 'stopped' | 'doors' | 'cutscene' | 'failing' | 'clear' | 'idle';

/**
 * v1.11 (PR8a, 第 3 部 A3, A6, A8.2, A9): what うしろむき needs around the train: when the switch glows (a hint: past
 * a back junction whose siding has something for the child, an overshot station to back up to, at a siding's buffer
 * to go forward again), and the partner's lines (a glow starting, the first back arrows, standing reversed with the
 * lever at "とまる", the stop points, a record's end lines at the buffer, without うしろむき by a post).
 */
export class ReverseSystem implements ReverseReader {
  readonly events = new Emitter<{ line: ReverseLine; near: { junction: JunctionDef } }>();
  /** The child has うしろむき (the switch shows). */
  enabled = false;
  private glowNow = false;
  /** Back junctions whose glow window the train is in now (forward, past the point). */
  private readonly inWindow = new Set<string>();
  private readonly nearSaid = new Set<string>();
  private arrowsSaid = false;
  private nudgeSaid = false;
  private needSaid = false;
  private standReversed = 0;
  private lastStopLineAt = -Infinity;
  private clock = 0;
  /** A9: the station the train overshot and may back up to (the runner sets it), or null. */
  private backUpStation: string | null = null;
  private readonly endSaid = new Set<string>();
  /** The records lying in each back junction's siding (on it, or within reach of it), by junction id. */
  private readonly sidingRecords = new Map<string, string[]>();

  constructor(
    private readonly stage: StageData,
    private readonly train: Train,
    private readonly opts: {
      /** A record found already (this run or saved). */
      found: (id: string) => boolean;
      /** The station the current mission step drives to, or null. */
      stepStation?: () => StationDef | null;
    },
  ) {
    for (const j of stage.backJunctions) {
      const siding = this.sidingOf(j);
      const rail = stage.network.getRail(siding);
      const ids: string[] = [];
      for (const r of stage.records) {
        if (r.def.requires === 'magnetLight') continue;
        let near = r.onRail?.railId === siding;
        for (let s = 0; s <= rail.length && !near; s += 5) near = rail.frameAt(s).position.distanceTo(r.position) <= RECORD.distance;
        if (near) ids.push(r.def.id);
      }
      this.sidingRecords.set(j.id, ids);
    }
    train.events.on('backArrows', () => {
      if (this.arrowsSaid) return;
      this.arrowsSaid = true;
      this.events.emit('line', { key: 'backArrows' });
    });
    train.events.on('reverseStop', ({ why }) => this.onStop(why));
    train.events.on('reverseOn', () => {
      this.backUpStation = null;
      this.standReversed = 0;
    });
  }

  /** PR8b's ReverseReader (the lead, 6-1 M2, follows a train backing up): the train runs backwards now. */
  isReversing(): boolean {
    return this.train.reversing;
  }

  /** The switch glows now (a hint only). */
  get glow(): boolean {
    return this.glowNow;
  }

  /** A new mission: its once-a-mission lines may come again. */
  newMission(): void {
    this.nearSaid.clear();
    this.endSaid.clear();
  }

  /** A rewind: the overshot station is gone (the train is put back before it). */
  reset(): void {
    this.backUpStation = null;
    this.inWindow.clear();
    this.standReversed = 0;
  }

  /** A9: the train overshot station `id` (the switch glows until it reverses or the stop is over); null clears it. */
  setBackUp(id: string | null): void {
    this.backUpStation = id;
  }

  /** The siding of back junction `j`. */
  private sidingOf(j: JunctionDef): string {
    return (j.left === j.railId ? j.right : j.left) as string;
  }

  /** A8.1 `glow`: something for the child in `j`'s siding (a record not found yet, or the step's platform). */
  private worth(j: JunctionDef): boolean {
    if (j.glow === true) return true;
    if (j.glow === false) return false;
    if ((this.sidingRecords.get(j.id) ?? []).some((id) => !this.opts.found(id))) return true;
    const st = this.opts.stepStation?.() ?? null;
    return st !== null && st.railId === this.sidingOf(j);
  }

  update(dt: number, phase: ReversePhase): void {
    this.clock += dt;
    const t = this.train;
    const st = t.state;
    const moving = phase === 'driving' || phase === 'stopped';
    let glow = false;
    if (!this.enabled) {
      this.inWindow.clear();
      // Without うしろむき, standing by a post: "うしろむきに はしれたら…" (once).
      if (!this.needSaid && phase === 'driving' && st.speed < 0.05) {
        for (const j of this.stage.backJunctions) {
          if (st.railId !== j.railId || Math.abs(t.frontS - REVERSE.tail / 2 - j.at) > REVERSE.arrowDistance) continue;
          this.needSaid = true;
          this.events.emit('line', { key: 'needAbility' });
          break;
        }
      }
      this.glowNow = false;
      return;
    }
    if (t.reversing) {
      this.inWindow.clear();
      // (d): at a siding's buffer, forward again next.
      if (t.atReverseStop && t.lastReverseStop === 'buffer' && moving) glow = true;
      // Reversed with the lever at "とまる" a while: "レバーを あげると うしろへ すすむよ" (the first time).
      if (!t.atReverseStop && !t.turning && st.speed < 0.05 && st.notch <= STOP_NOTCH && phase === 'driving') {
        this.standReversed += dt;
        if (!this.nudgeSaid && this.standReversed >= REVERSE.nudgeSeconds) {
          this.nudgeSaid = true;
          this.events.emit('line', { key: 'reverseNudge' });
        }
      } else this.standReversed = 0;
    } else {
      // (a): past a back junction with something in its siding, until the front is glowAfter m on.
      for (const j of this.stage.backJunctions) {
        const tail = st.s - REVERSE.tail; // the rear end (the lead car centre less 31 m)
        const inside = st.railId === j.railId && tail >= j.at + 1 && tail <= j.at + REVERSE.glowAfter && !t.retracing;
        if (inside && this.worth(j)) {
          glow = true;
          if (!this.inWindow.has(j.id)) {
            this.inWindow.add(j.id);
            this.events.emit('near', { junction: j });
            if (!this.nearSaid.has(j.id) && phase === 'driving') {
              this.nearSaid.add(j.id);
              const own = j.line === null ? [] : j.line !== undefined ? [j.line] : undefined;
              if (own === undefined || own.length > 0) this.events.emit('line', { key: 'backNear', own });
            }
          }
        } else this.inWindow.delete(j.id);
      }
      // (b): an overshot station to back up to.
      if (this.backUpStation !== null) glow = true;
    }
    this.glowNow = glow && (phase === 'driving' || phase === 'stopped' || phase === 'doors');
  }

  /** A6: a stop point reached: "おっとっと" (a gap's own words), at a buffer "ついた" or a found record's end lines. */
  private onStop(why: ReverseStop): void {
    if (why === 'station') return;
    if (why === 'buffer') {
      const siding = this.train.state.railId;
      // A platform the step drives to: its arrival is the runner's ("ぴたっ！").
      const st = this.opts.stepStation?.() ?? null;
      if (st?.reverse && st.railId === siding) return;
      for (const r of this.stage.records) {
        if (!r.def.endLines || !this.opts.found(r.def.id) || this.endSaid.has(r.def.id)) continue;
        const rail = this.stage.network.getRail(siding);
        const near = r.onRail?.railId === siding || rail.frameAt(Math.min(rail.length, 12)).position.distanceTo(r.position) <= RECORD.distance * 2;
        if (!near) continue;
        this.endSaid.add(r.def.id);
        this.events.emit('line', { key: 'reverseEnd', own: r.def.endLines });
        return;
      }
      this.events.emit('line', { key: 'reverseEnd' });
      return;
    }
    // At most one "おっとっと" every 20 s.
    if (this.clock - this.lastStopLineAt < 20) return;
    this.lastStopLineAt = this.clock;
    this.events.emit('line', { key: why === 'gap' ? 'reverseStopGap' : 'reverseStop' });
  }
}
