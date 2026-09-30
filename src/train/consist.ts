import type { Rail, RailFrame, RailNetwork } from '../rail/types';
import { TRAIL } from './params';

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
 * The way the train has come ("通った 道"): pieces of rails in the order it ran them, oldest first; the newest one ends
 * at the lead car centre (`Train.state`). Everything behind the lead car is placed by the trail distance ("道の 積算
 * きょり", an odometer that only the trail knows): car i's centre is TRAIN.carSpacing × i m back along it, so a car
 * behind a junction or a merge sits on the rail it really is on (not on the new rail run on backwards in a straight
 * line), and jump and dive arcs kept by trail distance lift every car where the lead car was lifted.
 *
 * Forward only for now (PR7). A fresh trail (the start, a rewind) is traced back TRAIL.back m through the rails: from a
 * rail's start into the rail it forks off (its feeder junction), else into the rail merging into it there (the rail
 * itself if it loops, else the first in rails[] order), else it stops at the rail's start.
 */
export class Trail {
  private pieces: TrailPiece[] = [];

  constructor(private readonly network: RailNetwork) {}

  /** The pieces, oldest first (read only; for the test hooks and the probe). */
  get list(): readonly TrailPiece[] {
    return this.pieces;
  }

  private get last(): TrailPiece {
    return this.pieces[this.pieces.length - 1];
  }

  /** Trail distance of the lead car centre (as of the last moveTo). */
  get head(): number {
    const p = this.last;
    return p.d0 + (p.to - p.from);
  }

  /** How long the trail is behind the lead car centre (m). */
  get length(): number {
    return this.head - this.pieces[0].d0;
  }

  /** Trail distance of point `s` on the newest piece's rail (the lead car's rail), also ahead of its `to`. */
  odo(s: number): number {
    const p = this.last;
    return p.d0 + (s - p.from);
  }

  /** Starts over with the lead car centre at `s` on `railId` (the start, a rewind): traced back TRAIL.back m. */
  rebuild(railId: string, s: number): void {
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

  /** The lead car centre is at `s` on the newest piece's rail now. */
  moveTo(s: number): void {
    this.last.to = s;
    // Older pieces go once the trail is longer than TRAIL.max without them.
    while (this.pieces.length > 1 && this.head - this.pieces[1].d0 > TRAIL.max) this.pieces.shift();
  }

  /** The lead car centre left its rail at `leaveAt` for rail `railId` at `enterAt` (a junction, a merge, a loop's end). */
  switchRail(leaveAt: number, railId: string, enterAt: number): void {
    const p = this.last;
    p.to = leaveAt;
    this.pieces.push({ railId, from: enterAt, to: enterAt, d0: p.d0 + (leaveAt - p.from) });
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
