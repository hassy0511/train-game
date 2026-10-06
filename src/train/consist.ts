import type { Rail, RailFrame, RailNetwork } from '../rail/types';
import type { JunctionDef } from '../stage/types';
import { REVERSE, TRAIL } from './params';

/**
 * v1.11 (PR7, PHASE9_CHAPTER5_6 第 3 部 A5): one stretch of the trail: rail `railId` from `from` to `to` (the train went
 * from `from` towards `to`, so `to` ≥ `from` while it runs forward). `d0` is the trail distance at `from`.
 */
export interface TrailPiece {
  railId: string;
  from: number;
  to: number;
  d0: number;
}

/**
 * v1.11 (PR8a, A6): why the train reversing stops where it does: a gap, a stretch it flew (`air`) or dived (`dive`)
 * through, the last station passed, the stage start or a rewind (`floor`), a portal (6-2), a siding's buffer.
 */
export type ReverseStop = 'gap' | 'air' | 'dive' | 'station' | 'floor' | 'portal' | 'buffer';

/** v1.11 (PR8a): a stretch of the trail (trail distances) the lead bogie flew or dived along. */
export interface TrailMark {
  from: number;
  to: number;
  kind: 'air' | 'dive';
}

/** v1.11 (PR8a): the trail ahead of the lead car that the train reversed along (forward order): its way back on. */
interface GhostPiece {
  railId: string;
  from: number;
  to: number;
}

/**
 * The way the train has come ("通った 道"): pieces of rails in the order it ran them, oldest first; the newest one ends
 * at the lead car centre (`Train.state`). Everything behind the lead car is placed by the trail distance ("道の 積算
 * きょり", an odometer that only the trail knows): car i's centre is TRAIN.carSpacing × i m back along it, so a car
 * behind a junction or a merge sits on the rail it really is on (not on the new rail run on backwards in a straight
 * line), and jump and dive arcs kept by trail distance lift every car where the lead car was lifted.
 *
 * A fresh trail (the start, a rewind) is traced back TRAIL.back m through the rails: from a rail's start into the rail
 * it forks off (its feeder junction), else into the rail merging into it there (the rail itself if it loops, else the
 * first in rails[] order), else it stops at the rail's start.
 *
 * v1.11 (PR8a, うしろむき, A5.2–A5.4): reversing, the lead car goes back along the trail (`retreat`); what it leaves is
 * kept as the ghost, the way on it came by. Going forward again over the ghost is "retracing" (the gimmicks stay as
 * they are; the forks take the ghost's side). The floor is where the rear end may go back to at most: where the
 * trail was made (the rear end as it was put there), the rear end when the train front passed a station's stop line
 * (`cutAt`), a back siding's buffer (`enterSiding`), or TRAIL.max m back. The stretches the lead bogie flew or dived
 * along are marked (`mark`): reversing stops before them.
 */
export class Trail {
  private pieces: TrailPiece[] = [];
  private marks: TrailMark[] = [];
  private ghost: GhostPiece[] = [];
  /** The trail distance the rear end may go back to at most, and why it is there. */
  private floorX = 0;
  private floorWhy: ReverseStop = 'floor';

  constructor(private readonly network: RailNetwork) {}

  /** The pieces, oldest first (read only; for the test hooks and the probe). */
  get list(): readonly TrailPiece[] {
    return this.pieces;
  }

  private get last(): TrailPiece {
    return this.pieces[this.pieces.length - 1];
  }

  /** Trail distance of the lead car centre (as of the last moveTo or retreat). */
  get head(): number {
    const p = this.last;
    return p.d0 + (p.to - p.from);
  }

  /** How long the trail is behind the lead car centre (m). */
  get length(): number {
    return this.head - this.pieces[0].d0;
  }

  /** v1.11 (PR8a): trail distance of the floor (the rear end goes back to it at most). */
  get floor(): number {
    return this.floorX;
  }

  /** v1.11 (PR8a): there is a way on the train reversed along (moving forward over it is retracing). */
  get hasGhost(): boolean {
    return this.ghost.length > 0;
  }

  /** v1.11 (PR8a): the rail the ghost goes on to after its piece on `railId` (a fork retraced takes it), or null. */
  ghostAfter(railId: string): string | null {
    if (this.ghost[0]?.railId !== railId) return null;
    return this.ghost[1]?.railId ?? null;
  }

  /** Trail distance of point `s` on the newest piece's rail (the lead car's rail), also ahead of its `to`. */
  odo(s: number): number {
    const p = this.last;
    return p.d0 + (s - p.from);
  }

  /**
   * Starts over with the lead car centre at `s` on `railId` (the start, a rewind): traced back TRAIL.back m. v1.11
   * (PR11a): `why` the floor is there ("portal": the train came through a gate, B6.2; it never reverses back through).
   */
  rebuild(railId: string, s: number, why: ReverseStop = 'floor'): void {
    const back: { railId: string; from: number; to: number }[] = [];
    let need: number = TRAIL.back;
    let rail = railId;
    let to = s;
    for (let hop = 0; hop < 8; hop++) {
      const from = Math.max(0, to - need);
      back.unshift({ railId: rail, from, to });
      need -= to - from;
      if (need <= 1e-6) break;
      const prev = this.before(rail);
      if (!prev) break;
      rail = prev.railId;
      to = prev.at;
    }
    let d = 0;
    this.pieces = back.map((p) => {
      const piece = { ...p, d0: d };
      d += p.to - p.from;
      return piece;
    });
    this.marks = [];
    this.ghost = [];
    // The rear end as it is put now (the rails behind it may run out sooner: then it is already there).
    this.floorX = this.head - REVERSE.tail;
    this.floorWhy = why;
  }

  /** Where the train came from onto rail `id` at its start (s = 0), or null. */
  private before(id: string): { railId: string; at: number } | null {
    const feeder = this.network.feeder(id);
    if (feeder) return feeder;
    const at0 = this.network.mergesInto(id).filter((m) => Math.abs(m.at) < 0.5);
    const self = at0.find((m) => m.railId === id);
    const m = self ?? at0[0];
    if (!m) return null;
    return { railId: m.railId, at: this.network.getRail(m.railId).length };
  }

  /**
   * The lead car centre is at `s` on the newest piece's rail now (moving forward, or a small step back: a bounce).
   * Retracing, the ghost is eaten as the train goes along it; off it, the ghost is gone.
   */
  moveTo(s: number): void {
    this.last.to = s;
    const g = this.ghost[0];
    if (g) {
      if (g.railId !== this.last.railId) this.ghost = [];
      else {
        g.from = Math.max(g.from, s);
        if (g.from >= g.to - 1e-6) this.ghost.shift();
      }
    }
    // Older pieces go once the trail is longer than TRAIL.max without them.
    while (this.pieces.length > 1 && this.head - this.pieces[1].d0 > TRAIL.max) this.pieces.shift();
    if (this.pieces[0].d0 > this.floorX) {
      this.floorX = this.pieces[0].d0;
      this.floorWhy = 'floor';
    }
    if (this.marks.length > 0 && this.marks[0].to < this.floorX) this.marks = this.marks.filter((m) => m.to >= this.floorX);
  }

  /**
   * The lead car centre left its rail at `leaveAt` for rail `railId` at `enterAt` (a junction, a merge, a loop's end).
   * Retracing goes on only when the ghost goes the same way.
   */
  switchRail(leaveAt: number, railId: string, enterAt: number): void {
    const p = this.last;
    p.to = leaveAt;
    if (this.ghost[0]?.railId === p.railId) this.ghost.shift();
    const g = this.ghost[0];
    if (g && (g.railId !== railId || Math.abs(g.from - enterAt) > 0.5)) this.ghost = [];
    this.pieces.push({ railId, from: enterAt, to: enterAt, d0: p.d0 + (leaveAt - p.from) });
  }

  /**
   * v1.11 (PR8a): reversing, the lead car centre goes `ds` m back along the trail (never behind the rear end's floor:
   * the caller stops before it). What it leaves becomes the ghost. True when it changed rails.
   */
  retreat(ds: number): boolean {
    let left = ds;
    let changed = false;
    while (left > 1e-9) {
      const p = this.last;
      const step = Math.min(left, Math.max(0, p.to - p.from));
      if (step > 0) {
        const g = this.ghost[0];
        if (g && g.railId === p.railId && Math.abs(g.from - p.to) < 1e-6) g.from = p.to - step;
        else this.ghost.unshift({ railId: p.railId, from: p.to - step, to: p.to });
        p.to -= step;
        left -= step;
      }
      if (left <= 1e-9 || this.pieces.length === 1) break;
      this.pieces.pop();
      changed = true;
    }
    return changed;
  }

  /**
   * v1.11 (PR8a): the train front passed a station's stop line with the rear end at trail distance `tailX`: that is the
   * floor now (backing up there puts the front right on the line), and the trail behind it goes.
   */
  cutAt(tailX: number): void {
    if (tailX <= this.floorX) return;
    this.floorX = tailX;
    this.floorWhy = 'station';
    // (Keep 2 m more, as a fresh trail does, for the last bogie.)
    while (this.pieces.length > 1 && this.pieces[1].d0 <= tailX - 2) this.pieces.shift();
    this.marks = this.marks.filter((m) => m.to >= tailX);
  }

  /**
   * v1.11 (PR8a, A8.2): reversing, the rear end passed back junction `j`'s point at trail distance `x` taking its
   * siding: the trail now comes out of the siding (its buffer end, `bufferGap` in, is the floor) and merges into `j`'s
   * rail there. The ghost ahead is kept (forward again out of the siding onto the rail, the train is retracing).
   */
  enterSiding(j: JunctionDef, siding: string, x: number): void {
    const length = this.network.getRail(siding).length;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (p.d0 > x + 1e-6 && i > 0) continue;
      p.from += x - p.d0;
      p.d0 = x;
      this.pieces.splice(0, i);
      break;
    }
    const from = REVERSE.bufferGap;
    this.pieces.unshift({ railId: siding, from, to: length, d0: x - (length - from) });
    this.floorX = this.pieces[0].d0;
    this.floorWhy = 'buffer';
    this.marks = this.marks.filter((m) => m.from > x);
    void j;
  }

  /** v1.11 (PR8a): the lead bogie went from `from` to `to` (trail distances) in the air or diving. */
  mark(kind: TrailMark['kind'], from: number, to: number): void {
    if (to <= from) return;
    const m = this.marks[this.marks.length - 1];
    if (m && m.kind === kind && from <= m.to + 0.5 && to >= m.from) {
      m.to = Math.max(m.to, to);
      m.from = Math.min(m.from, from);
      return;
    }
    this.marks.push({ from, to, kind });
  }

  /**
   * v1.11 (PR8a, A6): the nearest place behind the rear end (at trail distance `tailX`) where reversing stops: where the
   * rear end is then (trail distance `x`), how far back that is and why. A gap on the trail: REVERSE.gapStop m short of
   * its near edge; a flown or dived stretch (one flown over a gap counts as that gap): as much short of its end; else
   * the floor.
   */
  nextStop(tailX: number): { x: number; distance: number; why: ReverseStop } {
    let best = { x: this.floorX, why: this.floorWhy };
    const consider = (x: number, why: ReverseStop): void => {
      if (x <= tailX + 1e-6 && x > best.x) best = { x, why };
    };
    const gapXs: { from: number; to: number }[] = [];
    for (const p of this.pieces) {
      const lo = Math.min(p.from, p.to);
      const hi = Math.max(p.from, p.to);
      for (const g of this.network.getRail(p.railId).gaps) {
        if (g.to < lo || g.from > hi) continue;
        const from = p.d0 + (Math.max(g.from, lo) - p.from);
        const to = p.d0 + (Math.min(g.to, hi) - p.from);
        gapXs.push({ from, to });
        consider(to + REVERSE.gapStop, 'gap');
      }
    }
    for (const m of this.marks) {
      if (m.kind === 'air' && gapXs.some((g) => g.to >= m.from && g.from <= m.to)) continue;
      consider(m.to + REVERSE.gapStop, m.kind);
    }
    return { x: best.x, distance: Math.max(0, tailX - best.x), why: best.why };
  }

  /**
   * v1.11 (PR8a, A8.2): the nearest back junction whose point lies behind the rear end (at trail distance `tailX`) on
   * the trail, where the trail runs along its rail through the point (not out of its siding): the point's trail
   * distance and how far back it is.
   */
  nextBackJunction(tailX: number, junctions: readonly JunctionDef[]): { junction: JunctionDef; x: number; distance: number } | null {
    let best: { junction: JunctionDef; x: number; distance: number } | null = null;
    for (const j of junctions) {
      for (const p of this.pieces) {
        if (p.railId !== j.railId || j.at <= p.from + 0.5 || j.at > p.to + 1e-6) continue;
        const x = p.d0 + (j.at - p.from);
        if (x > tailX + 1e-6) continue;
        if (!best || x > best.x) best = { junction: j, x, distance: tailX - x };
      }
    }
    return best;
  }

  /** The rail and s at trail distance `x` (beyond either end the end piece's rail runs on). */
  at(x: number): { railId: string; s: number } {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (x >= p.d0 || i === 0) return { railId: p.railId, s: p.from + (x - p.d0) };
    }
    return { railId: this.last.railId, s: this.last.to };
  }

  /** The rail frame at trail distance `x` (a loop wraps; other rails run on straight past their ends). */
  frameAt(x: number): RailFrame {
    const { railId, s } = this.at(x);
    return frameOn(this.network.getRail(railId), s);
  }
}

/** A frame on `rail` at `s`: wrapped on a loop, else extrapolated past its ends. */
export function frameOn(rail: Rail, s: number): RailFrame {
  const loop = rail.end.type === 'merge' && rail.end.railId === rail.id;
  if (!loop) return rail.frameAt(s);
  const L = rail.length;
  return rail.frameAt(((s % L) + L) % L);
}
