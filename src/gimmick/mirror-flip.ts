import { MathUtils, Vector3 } from 'three';
import { Emitter } from '../core/events';
import type { RailNetwork } from '../rail/types';
import type { GimmickDef, MirrorFlipParams } from '../stage/types';
import { MIRROR_WORLD } from '../train/params';
import type { Train, TrainBlock } from '../train/train';
import type { MirrorDef } from './mirror';

/** v1.11 (5-3): one "mirror-flip" gimmick ("かがみの なか") with its defaults filled in. */
export interface FlipSection {
  id: string;
  /** Its place in gimmicks[]. */
  index: number;
  railId: string;
  /** The entry gate's face (m along the rail). */
  from: number;
  /** The exit gate's face. */
  to: number;
  gate: 'open' | 'whistle';
  /** The mission's flipIn / flipOut unless written (null: nothing said). */
  line: string | null | undefined;
  lineOut: string | null | undefined;
  width: number;
  height: number;
}

/** The mirror-flip stretches of a stage, from its gimmicks. */
export function flipSections(gimmicks: GimmickDef[]): FlipSection[] {
  const out: FlipSection[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'mirror-flip' || g.railId === undefined || g.from === undefined || g.to === undefined) return;
    const p = (g.params ?? {}) as unknown as MirrorFlipParams;
    out.push({
      id: String(p.id),
      index,
      railId: g.railId,
      from: g.from,
      to: g.to,
      gate: p.gate ?? 'open',
      line: p.line,
      lineOut: p.lineOut,
      width: p.width ?? MIRROR_WORLD.gateWidth,
      height: p.height ?? MIRROR_WORLD.gateHeight,
    });
  });
  return out;
}

/**
 * v1.11 (5-3): the gates of the mirror-flip stretches as mirrors across the rail (the view's reflections: the train
 * coming the other way is "in" the gate it runs into). The entry gate faces the train coming up to it; the exit gate,
 * seen from inside, faces the train too. A shut whistle gate is frosted glass (not facing) until it opens. Indexes are
 * negative (−1 − 2 × section, −2 − 2 × section) so they never meet a gimmick's.
 */
export function gateMirrors(sections: FlipSection[], network: RailNetwork): MirrorDef[] {
  const out: MirrorDef[] = [];
  sections.forEach((sec, k) => {
    const rail = network.getRail(sec.railId);
    for (const [end, at] of [
      [0, sec.from],
      [1, sec.to],
    ] as const) {
      const f = rail.frameAt(at);
      // The glass faces back along the rail (towards the train coming up to it).
      const normal = f.tangent.clone().setY(0).normalize().negate();
      out.push({
        index: -1 - 2 * k - end,
        id: `${sec.id}:${end === 0 ? 'in' : 'out'}`,
        look: 'gate',
        facing: !(end === 0 && sec.gate === 'whistle'),
        turnFrom: 0,
        back: 'plain',
        position: f.position.clone(),
        rotationY: MathUtils.radToDeg(Math.atan2(normal.x, normal.z)),
        normal: new Vector3(normal.x, 0, normal.z),
        width: sec.width,
        height: sec.height,
        range: MIRROR_WORLD.gateRange,
        flashRange: 0,
        reflectRadius: 60,
        railId: null,
        junction: null,
        lightHint: false,
        reflectTrain: true,
        reflectCutscene: false,
      });
    }
  });
  return out;
}

export interface MirrorFlipEvents extends Record<string, unknown> {
  /** The train front went through a stretch's entry gate (`instant`: put there by a rewind or a resume). */
  in: { section: FlipSection; instant: boolean };
  out: { section: FlipSection; instant: boolean };
  /** A whistle gate opened (`byWhistle` false: a resume opened it). */
  open: { section: FlipSection; byWhistle: boolean };
  /** The train bounced off a shut whistle gate ("ぽよん"). */
  bump: { section: FlipSection; airborne: boolean };
  /** A shut whistle gate came within MIRROR_WORLD.gateApproach m: the whistle starts glowing (once per try). */
  near: FlipSection;
}

/**
 * v1.11 (5-3): "かがみの なか" (PHASE9_CHAPTER5_6 第 6 部 §4.1). Whether the view is mirrored now (the train front between
 * a stretch's gates, from its position, so a rewind or a resume puts it right at once), the gates' state (an "open"
 * gate is always open; a "whistle" gate is shut until the whistle is pressed while it glows), the whistle's glow for a
 * shut gate close ahead, and the shut gates as faces the train must not pass (Train.setBlocks, kind "mirror": the
 * train bounces off and is held, never a fail). Opened gates stay open until the stage starts again.
 */
export class MirrorFlipSystem {
  readonly events = new Emitter<MirrorFlipEvents>();
  readonly sections: readonly FlipSection[];
  /** The stretch the train front is in now, or null. */
  current: FlipSection | null = null;
  /** Times the train went into a stretch (only goes up; a test hook). */
  flips = 0;
  /** Bounces off shut gates (only goes up; a test hook). */
  bumps = 0;
  private readonly opened = new Set<string>();
  private readonly nearSaid = new Set<string>();
  private snap = true;

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
  ) {
    this.sections = flipSections(gimmicks);
    train.events.on('mirrorBump', ({ id, airborne }) => {
      const section = this.sections.find((sec) => sec.id === id);
      if (!section) return;
      this.bumps += 1;
      this.events.emit('bump', { section, airborne });
    });
  }

  /** The view is mirrored now. */
  get flipped(): boolean {
    return this.current !== null;
  }

  /** A stretch's gate state ("open" for an open gate). */
  state(id: string): 'shut' | 'open' {
    const sec = this.sections.find((s) => s.id === id);
    return !sec || sec.gate === 'open' || this.opened.has(id) ? 'open' : 'shut';
  }

  /** The nearest shut whistle gate ahead within `range` m of the train front, or null. */
  private shutAhead(range: number): FlipSection | null {
    let best: FlipSection | null = null;
    let bestD = Infinity;
    for (const sec of this.sections) {
      if (sec.gate !== 'whistle' || this.opened.has(sec.id)) continue;
      const d = this.train.distanceAhead(sec.railId, sec.from);
      if (d === null || d <= -1 || d > range || d >= bestD) continue;
      best = sec;
      bestD = d;
    }
    return best;
  }

  /** The nearest shut gate for the test hook data-flip-gate ("shut", "open", or "" with none ahead within 200 m). */
  get gateNear(): '' | 'shut' | 'open' {
    let best: FlipSection | null = null;
    let bestD = Infinity;
    for (const sec of this.sections) {
      if (sec.gate !== 'whistle') continue;
      const d = this.train.distanceAhead(sec.railId, sec.from);
      if (d === null || d <= -1 || d > 200 || d >= bestD) continue;
      best = sec;
      bestD = d;
    }
    return best ? this.state(best.id) : '';
  }

  /** A shut whistle gate is within MIRROR_WORLD.gateApproach m ahead (or the train is held at it): the whistle glows. */
  get whistleGlow(): boolean {
    return this.shutAhead(MIRROR_WORLD.gateApproach) !== null;
  }

  /** The whistle was pressed (and sounded): opens the glowing gate ("ぽわわん") and returns true, else false. */
  onWhistle(): boolean {
    const sec = this.shutAhead(MIRROR_WORLD.gateApproach);
    if (!sec) return false;
    this.opened.add(sec.id);
    this.events.emit('open', { section: sec, byWhistle: true });
    return true;
  }

  /** The shut whistle gates: faces the train must not pass (Train.setBlocks). */
  blocks(): readonly TrainBlock[] {
    const out: TrainBlock[] = [];
    for (const sec of this.sections) {
      if (sec.gate === 'whistle' && !this.opened.has(sec.id)) out.push({ railId: sec.railId, at: sec.from, id: sec.id, kind: 'mirror' });
    }
    return out;
  }

  /** Call every frame after the train moved. */
  update(): void {
    if (this.sections.length === 0) return;
    let inside: FlipSection | null = null;
    for (const sec of this.sections) {
      const a = this.train.distanceAhead(sec.railId, sec.from);
      const b = this.train.distanceAhead(sec.railId, sec.to);
      if (a !== null && b !== null && a <= 0 && b > 0) inside = sec;
    }
    if (inside !== this.current) {
      const instant = this.snap;
      if (this.current) this.events.emit('out', { section: this.current, instant });
      this.current = inside;
      if (inside) {
        this.flips += instant ? 0 : 1;
        this.events.emit('in', { section: inside, instant });
      }
    }
    this.snap = false;
    const near = this.shutAhead(MIRROR_WORLD.gateApproach);
    if (near && !this.nearSaid.has(near.id)) {
      this.nearSaid.add(near.id);
      this.events.emit('near', near);
    }
  }

  /**
   * After a rewind: opened gates stay open, the "near" line may come again, and the view follows where the train was
   * put at once. A resume (`resumeAt`): the whistle gates on the way to the station it starts at are open.
   */
  reset(opts: { resumeAt?: { railId: string; at: number } } = {}): void {
    this.nearSaid.clear();
    this.snap = true;
    const at = opts.resumeAt;
    if (!at) return;
    for (const sec of this.sections) {
      if (sec.gate !== 'whistle' || this.opened.has(sec.id) || sec.railId !== at.railId || sec.from >= at.at) continue;
      this.opened.add(sec.id);
      this.events.emit('open', { section: sec, byWhistle: false });
    }
  }
}
