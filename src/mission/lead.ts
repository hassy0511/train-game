import type { RailNetwork } from '../rail/types';
import type { JunctionDef, LeadDef, MissionJunctionRule } from '../stage/types';
import { LEAD } from '../train/params';
import type { Train } from '../train/train';
import { leadOffset, leadPlace, traceLeadPath, type LeadPath } from './lead-path';

/**
 * v1.11 (PR8b): what the lead needs to know of "うしろむき" (PHASE9 第 3 部 第 A 部), which PR8a builds. Until then the
 * game passes NO_REVERSE (never reversing) and a dev build can fake it (main.ts, `window.__debugReverse`). PR8a hands
 * the real one: `{ isReversing: () => train.reversing }`. While reversing, the train's `state.speed` may carry either
 * sign: the lead measures how the train really moves along the way (it never reads the sign).
 */
export interface ReverseReader {
  /** The switch is on "うしろ": the train runs (or, standing, would run) backwards. */
  isReversing(): boolean;
}

export const NO_REVERSE: ReverseReader = { isReversing: () => false };

/** The lead's stages (#app[data-lead]); '' before its step. */
export type LeadPhase = 'armed' | 'tease' | 'dash' | 'learn' | 'backup' | 'follow' | 'met' | 'gone';

/** Where the runner is and how it looks, for the view. */
export interface LeadPose {
  railId: string;
  s: number;
  lateral: number;
  /** m/s along the path (negative: back towards the train). */
  speed: number;
  /** "ahead": running on (its back to the train); "train": looking at the train. */
  facing: 'ahead' | 'train';
  dashing: boolean;
  /** Hopping on the spot, waving (waiting for the train). */
  waving: boolean;
  model: string;
}

/** What happened this frame (the mission runner says the lines and posts the events). */
export type LeadOutcome =
  | { kind: 'start' }
  | { kind: 'prompt' }
  | { kind: 'call'; n: number; auto: boolean }
  | { kind: 'run'; last: boolean }
  | { kind: 'again' }
  | { kind: 'learn' }
  | { kind: 'remind' }
  | { kind: 'follow'; auto: boolean }
  | { kind: 'met'; auto: boolean }
  | { kind: 'gone' };

/** The lead's numbers: LEAD with the step's own. */
type LeadNumbers = { -readonly [K in keyof typeof LEAD]: number };

/**
 * v1.11 (6-1, PHASE9_CHAPTER5_6 第 7 部 §4.1・§4.2): "おいかけっこ". Sakasa runs along the lead path (a ring round the
 * moat) always ahead of the train front on a rubber band: the whistle ("とまって〜！") makes her dash further off
 * (twice), then the train is braked to a stop and the step's `learn` cutscene plays (the partner works out "ぎゃく" and
 * the child learns うしろむき). Backing up, she turns round and follows; she stops before the train (or comes back by
 * herself after a while) and the step's station opens. Driving on past her, she goes home. Never caught, never out
 * of reach. Positions only (no physics); counted while driving or standing, never in a cutscene, a fail or a pause.
 */
export class LeadRunner {
  phase: LeadPhase = 'armed';
  /** Calls so far (the child's and the partner's automatic ones; only goes up). */
  calls = 0;
  autoCalls = 0;
  /** Metres from the train front to her along the way (the last measured). */
  gap = 0;
  /** Metres the train backed up while she followed. */
  reversedBy = 0;
  /** The step's station is closed (no gauge, no grading) until she stopped before the train. */
  stationClosed: boolean;
  readonly path: LeadPath;
  private readonly p: LeadNumbers;
  private readonly lateral: number;
  /** Where she is along the path (m) and her speed along it (m/s). */
  private at = 0;
  private speed = 0;
  /** The gap after her move last frame (the train's own move is measured against it). */
  private lastGap: number | null = null;
  /** Seconds in the phase now, and since the last press of the whistle (a dash's clock). */
  private t = 0;
  private dashT = 0;
  private prompted = false;
  private ranSaid = false;
  private remindT = 0;
  private standT = 0;
  /** Coming back by herself (backup timed out): she walks to the train. */
  private autoWalk = false;
  /** The train moved forward again once met: she stays where she stands. */
  private metStand = false;
  private turnedAt = 0;

  constructor(
    readonly def: LeadDef,
    private readonly train: Train,
    network: RailNetwork,
    junctions: readonly JunctionDef[],
    rules: Record<string, MissionJunctionRule> | undefined,
    private readonly reverse: ReverseReader,
  ) {
    const own = Object.fromEntries(Object.entries(def).filter(([k, v]) => v !== undefined && k in LEAD));
    this.p = { ...LEAD, ...own } as LeadNumbers;
    this.lateral = def.lateral ?? LEAD.lateral;
    this.path = traceLeadPath(junctions, network, def.railId, def.from, rules);
    this.stationClosed = def.closeStation !== false;
  }

  get callsWanted(): number {
    return this.def.calls ?? 2;
  }

  /** Out on the path now (drawn by the view). */
  get active(): boolean {
    return this.phase !== 'armed' && this.phase !== 'gone';
  }

  /** The whistle glows: she teases, and the partner asked for the call (a hint only; a press works anyway). */
  get whistleGlow(): boolean {
    return this.phase === 'tease' && this.prompted;
  }

  /** The forward/back switch glows: waiting for the train to back up, or met while reversing (back to "まえ"). */
  get switchGlow(): boolean {
    if (this.phase === 'backup') return true;
    return this.phase === 'met' && this.reverse.isReversing();
  }

  /** The train is braked to a stop for the learn cutscene (Train speed cap "lead-learn"). */
  get holdTrain(): boolean {
    return this.phase === 'learn';
  }

  /** How far she is along the rails (for the view and the test hooks), or null while not out. */
  get pose(): LeadPose | null {
    if (!this.active) return null;
    const place = leadPlace(this.path, this.at);
    const standing = Math.abs(this.speed) < 0.3;
    const facing: LeadPose['facing'] =
      this.phase === 'learn' || this.phase === 'backup' || this.phase === 'follow' || this.phase === 'met' || standing ? 'train' : 'ahead';
    return {
      railId: place.railId,
      s: place.s,
      lateral: this.lateral,
      speed: this.speed,
      facing,
      dashing: this.phase === 'dash' && this.dashT >= this.p.iconLead,
      waving: standing && (this.phase === 'tease' || this.phase === 'learn' || this.phase === 'backup'),
      model: this.def.model ?? 'amanojaku',
    };
  }

  /** The train front's place along the path, or null when it is off it. */
  private frontAt(): number | null {
    return leadOffset(this.path, this.train.state.railId, this.train.frontS);
  }

  /** Metres from the train front to her along the train's way (null: the way does not reach her). */
  private measure(): number | null {
    const place = leadPlace(this.path, this.at);
    return this.train.routeDistance(place.railId, place.s);
  }

  private setPhase(phase: LeadPhase): void {
    this.phase = phase;
    this.t = 0;
  }

  /**
   * One frame while the step is driven (moving or standing). `standing`: the train stands still. Returns what
   * happened, in order.
   */
  update(dt: number): LeadOutcome[] {
    const out: LeadOutcome[] = [];
    const p = this.p;
    if (this.phase === 'gone') return out;
    if (this.phase === 'armed') {
      const front = this.frontAt();
      const d = this.train.state.railId === this.def.railId ? this.train.distanceAhead(this.def.railId, this.def.from) : null;
      if (front === null || d === null || d > 0 || d < -60) return out;
      // Out of the bushes `keep` m ahead ("ぴょこん").
      this.at = front + p.keep;
      this.speed = 0;
      this.lastGap = null;
      this.gap = p.keep;
      this.setPhase('tease');
      this.prompted = false;
      out.push({ kind: 'start' });
      return out;
    }
    this.t += dt;
    const measured = this.measure();
    if (measured === null) {
      // The train is off her way (it cannot see her from there): she waits where she is.
      this.lastGap = null;
      this.speed = 0;
      return out;
    }
    const gap = measured;
    // How fast the train front comes towards her along the way (backing up: negative), from how far it moved.
    let trainV = 0;
    if (this.lastGap !== null && dt > 0) trainV = Math.max(-40, Math.min(40, (this.lastGap - gap) / dt));
    const standing = Math.abs(this.train.state.speed) < 0.05;
    const reversing = this.reverse.isReversing();

    let aim = 0;
    let lo = 0;
    let hi = p.speedMax;
    let min: number | null = p.min;
    switch (this.phase) {
      case 'tease': {
        if (!this.prompted && this.t >= p.promptAfter && this.calls === 0) {
          this.prompted = true;
          out.push({ kind: 'prompt' });
        }
        // Nobody calls: the partner does ("とまって〜！") once the wait is long enough (each time she teases).
        if (this.t >= p.autoCallAfter) out.push(this.call(true));
        aim = trainV + p.follow * (p.keep - gap);
        break;
      }
      case 'dash': {
        this.dashT += dt;
        const running = this.dashT >= p.iconLead;
        aim = trainV + p.follow * ((running ? p.dash : p.keep) - gap);
        if (running) aim = Math.max(aim, trainV + 4);
        if (!this.ranSaid && this.dashT >= p.runLineAfter) {
          this.ranSaid = true;
          out.push({ kind: 'run', last: this.calls >= this.callsWanted });
        }
        if (this.dashT >= Math.max(p.dashSeconds, p.againAfter)) {
          if (this.calls >= this.callsWanted) {
            this.setPhase('learn');
          } else {
            this.setPhase('tease');
            this.prompted = true;
            out.push({ kind: 'again' });
          }
        }
        break;
      }
      case 'learn': {
        // She stops where she is and hops, looking back; the train is braked to a stop (the caller's speed cap).
        aim = Math.max(0, Math.min(trainV, p.follow * (p.dash - gap) + trainV));
        if (standing && this.t > 0.2) {
          out.push({ kind: 'learn' });
          // The caller plays the cutscene and calls learned(); until then nothing moves.
          this.setPhase('backup');
          this.standT = 0;
          this.remindT = 0;
          this.waitingForCutscene = true;
        }
        break;
      }
      case 'backup': {
        if (this.waitingForCutscene) {
          aim = 0;
          break;
        }
        this.remindT += dt;
        if (this.remindT >= p.remindEvery) {
          this.remindT = 0;
          out.push({ kind: 'remind' });
        }
        if (reversing && !standing) {
          this.setPhase('follow');
          this.turnedAt = 0;
          this.reversedBy = 0;
          this.standT = 0;
          this.autoWalk = false;
          out.push({ kind: 'follow', auto: false });
        } else if (this.t >= p.autoFollowAfter) {
          // She wonders and comes back by herself ("あれ？ もどって きた！").
          this.setPhase('follow');
          this.autoWalk = true;
          out.push({ kind: 'follow', auto: true });
        }
        aim = 0;
        break;
      }
      case 'follow': {
        this.turnedAt += dt;
        if (this.autoWalk) {
          // Coming back by herself: a quick trot while far off (twice followSpeed), "とこ とこ" the last followGap m.
          aim = trainV - (gap > p.followGap ? 2 * p.followSpeed : p.followSpeed);
          lo = -p.speedMax;
          min = p.metGap;
          if (gap <= p.metGap + 0.5) out.push(this.meet(true));
          break;
        }
        // Turning round first, then after the train at `followGap` m.
        aim = this.turnedAt < p.turnSeconds ? 0 : trainV + p.follow * (p.followGap - gap);
        lo = -p.speedMax;
        min = p.metGap;
        if (reversing && !standing) this.reversedBy += Math.abs(this.train.state.speed) * dt;
        this.standT = standing ? this.standT + dt : 0;
        if (this.reversedBy >= p.followBack || !reversing || this.standT >= p.metStandSeconds) out.push(this.meet(false));
        break;
      }
      case 'met': {
        // She comes to `metGap` m before the train front and stands there, looking at it; the train may pass her.
        if (!this.metStand && gap > p.metGap + 0.5) aim = trainV - p.followSpeed;
        else {
          this.metStand = true;
          aim = 0;
        }
        lo = -p.speedMax;
        min = null;
        // Driving on past her: once the last car's end is `goneBehind` m past her, she goes home.
        if (gap < -(TRAIN_LENGTH + p.goneBehind) && !reversing) {
          this.phase = 'gone';
          this.speed = 0;
          out.push({ kind: 'gone' });
          return out;
        }
        break;
      }
      default:
        break;
    }
    aim = Math.max(lo, Math.min(hi, aim));
    // Up to her aim at `accel` m/s² (either way).
    const dv = aim - this.speed;
    const step = p.accel * dt;
    this.speed += Math.max(-step, Math.min(step, dv));
    let move = this.speed * dt;
    // Never nearer than `min` (a rocket does not get past her either).
    if (min !== null && gap + move < min) {
      move = min - gap;
      this.speed = Math.max(this.speed, trainV);
    }
    this.at += move;
    if (!this.path.ring) this.at = Math.max(0, Math.min(this.path.length, this.at));
    this.gap = gap + move;
    this.lastGap = this.gap;
    return out;
  }

  /** The learn cutscene is playing: she waits (counted from its end). */
  private waitingForCutscene = false;

  /** A call (the child's whistle, or the partner's automatic one): she dashes off. */
  private call(auto: boolean): LeadOutcome {
    this.calls += 1;
    if (auto) this.autoCalls += 1;
    this.setPhase('dash');
    this.dashT = 0;
    this.ranSaid = false;
    return { kind: 'call', n: this.calls, auto };
  }

  private meet(auto: boolean): LeadOutcome {
    this.setPhase('met');
    this.metStand = false;
    this.stationOpenWanted = true;
    return { kind: 'met', auto };
  }

  /** Set on meeting: the caller opens the station when it can (then clears it). */
  stationOpenWanted = false;

  /**
   * A whistle press (it sounded): while she teases it is a call ("call"); later she only gives a little hop ("hop");
   * otherwise nothing ("none"). The whistle's own rest spaces the presses (2 s); a dash does not count them.
   */
  onWhistle(): 'call' | 'hop' | 'none' {
    if (this.phase === 'tease') {
      this.lastCall = this.call(false);
      return 'call';
    }
    if (this.phase === 'learn' || this.phase === 'backup' || this.phase === 'follow' || this.phase === 'met') return 'hop';
    return 'none';
  }

  /** The call made by the last onWhistle() (for the caller's events). */
  lastCall: LeadOutcome | null = null;

  /** The learn cutscene is over: she waits for the train to back up (the helpers' clocks start now). */
  learned(): void {
    this.waitingForCutscene = false;
    if (this.phase !== 'backup') return;
    this.t = 0;
    this.remindT = 0;
  }

  /** The step's station opened (the caller tells it). */
  opened(): void {
    this.stationClosed = false;
    this.stationOpenWanted = false;
  }

  /**
   * After a fail put the train back (the lead path has no fails of its own; a fail elsewhere): met and gone stay; a
   * learn, a backup or a follow go back to waiting for the train to back up, `dash` m before it; a tease or a dash
   * start teasing again `keep` m before it (the calls made stay).
   */
  afterRewind(): void {
    if (this.phase === 'armed' || this.phase === 'met' || this.phase === 'gone') return;
    const front = this.frontAt();
    const back = this.phase === 'learn' || this.phase === 'backup' || this.phase === 'follow';
    if (front !== null) this.at = front + (back ? this.p.dash : this.p.keep);
    this.speed = 0;
    this.lastGap = null;
    if (back) {
      this.setPhase('backup');
      this.waitingForCutscene = false;
      this.autoWalk = false;
    } else {
      this.setPhase('tease');
      this.prompted = true;
    }
  }

  /** The step is over (the train stopped at its station): she goes home. False when she had gone already. */
  finish(): boolean {
    if (this.phase === 'gone') return false;
    this.phase = 'gone';
    this.speed = 0;
    return true;
  }
}

/** The train front to the end of its last car (m): 3 cars 12.5 m apart, 12 m long. */
const TRAIN_LENGTH = 37;
