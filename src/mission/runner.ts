import { Vector3 } from 'three';
import type { Whistle } from '../actions/whistle';
import { CatActor } from '../actors/cat';
import { LargeDino, makeDino, MidDino, SmallDino, type Dino } from '../actors/dino';
import { RollingNut, Squirrel } from '../actors/nut';
import { Grasshopper } from '../actors/grasshopper';
import { FlowerBridges, type BridgeOutcome } from '../gimmick/flower-bridge';
import { FragileBridges } from '../gimmick/fragile';
import { addToProgress, loadProgress } from '../core/progress';
import type { StageEvent, StageEventBus } from '../core/stage-events';
import { runCutscene, type CutscenePorts } from '../cutscene/runner';
import type {
  AbilityId,
  GapDef,
  JunctionDef,
  MissionDef,
  MissionLines,
  MissionStep,
  RecordDef,
  ResolvedRecord,
  Speaker,
  StageData,
  StationDef,
} from '../stage/types';
import { param } from '../gimmick/zones';
import { DOOR_REMIND_SECONDS, FALL, JUMP, LEVER_NOTCHES, LIGHT, PASSENGER_SECONDS, REWIND_DISTANCE } from '../train/params';
import type { JunctionSide, Train } from '../train/train';
import { StopMonitor, type GaugeState, type StopGrade } from './station-stop';

/** Everything the runner needs from the UI layer. */
export interface MissionPorts extends CutscenePorts {
  /** Say something without blocking (queued). */
  sayAsync(text: string, who?: Speaker): void;
  /** Drop every line still queued or showing (something more urgent is about to be said). */
  hush(): void;
  toast(text: string, kind: StopGrade): void;
  showDoorButton(onPress: () => void): void;
  hideDoorButton(): void;
  setCargo(passengers: number, parcel: boolean): void;
  fade(toBlack: boolean, seconds: number): Promise<void>;
  cameraFx(dip: number, shake: number): void;
  /** Lever back to "stop" after a rewind. */
  resetLever(): void;
  /** Stop gauge state for this frame. */
  gauge(state: GaugeState): void;
  /** The light revealed a reversed junction: highlight the true side on the arrows. */
  revealJunction(side: JunctionSide): void;
  /** A record was found (already saved). */
  recordFound(record: RecordDef): void;
  /** Stage clear: the fanfare just before the clear card. */
  fanfare(): void;
  /** Something nearby reacts to the whistle right now: make the whistle button glow. */
  whistleHint(on: boolean): void;
}

export type MissionPhase = 'idle' | 'driving' | 'stopped' | 'doors' | 'cutscene' | 'failing' | 'clear';

type DefaultLine =
  | 'tooFast'
  | 'overshoot'
  | 'short'
  | 'perfect'
  | 'ok'
  | 'catDanger'
  | 'catDangerAfter'
  | 'doorsOpenLever'
  | 'doorAsk'
  | 'doorsClosedLever'
  | 'jumpStopped'
  | 'fellShort'
  | 'fellNoJump'
  | 'dinoDanger'
  | 'dangerAfter'
  | 'deadEnd'
  | 'recordFound'
  | 'padGone'
  | 'padAppear'
  | 'nutHit'
  | 'boughJump'
  | 'squirrelDropped'
  | 'hopperNear'
  | 'hopperOn'
  | 'hopperReady'
  | 'hopperDone'
  | 'hopperFell'
  | 'butterflyNear'
  | 'butterflyFollow'
  | 'butterflyWait'
  | 'butterflyFast'
  | 'budClosed'
  | 'bridgeOpen'
  | 'bridgeFell'
  | 'fragileNear'
  | 'fragileShake'
  | 'fragileBoing'
  | 'fragileBoingAfter'
  | 'fragileClear'
  | 'fellLight';

const DEFAULT_LINES: Record<DefaultLine, string> = {
  tooFast: 'わわっ、はやすぎた〜！ もういっかい！',
  overshoot: 'いきすぎた〜！ もういっかい！',
  short: 'もうちょっと まえ！',
  perfect: 'ぴったり！ すごい！',
  ok: 'とまれた！',
  catDanger: 'あぶない！',
  catDangerAfter: 'びっくりした〜。もういっかい！',
  doorsOpenLever: 'ドアが あいてるよ！',
  doorAsk: 'ドアの ボタンを おして、ドアを あけよう！',
  doorsClosedLever: 'さきに ドアを あけよう！',
  jumpStopped: 'はしりながら おしてね',
  fellShort: 'もうちょっと はやく！',
  fellNoJump: 'ジャンプ わすれてた！',
  dinoDanger: 'あぶない！',
  dangerAfter: 'びっくりした〜。もういっかい！',
  deadEnd: 'いきどまり！ ライトで たしかめよう',
  recordFound: 'みつけた！',
  padGone: 'あれ？ ジャンプだいが きえてる… きてきを ならしてみよう！',
  padAppear: 'でた！ だいに のって！',
  nutHit: 'ぽこん！ きのみに ぶつかった〜',
  boughJump: 'えだが とばして くれるよ！',
  squirrelDropped: 'リスが きのみを おとした！ いまの うちに！',
  hopperNear: 'バッタさんだ！ きてきで よんでみよう',
  hopperOn: 'わっ！ バッタさんが のった！',
  hopperReady: 'バッタジャンプ！ {speed} で とぼう！',
  hopperDone: 'ありがとう、バッタさん！',
  hopperFell: 'バッタさんが いないと とどかない〜',
  butterflyNear: 'ちょうちょだ！ ライトで よんで みよう',
  butterflyFollow: 'ついてきた！ ライトは つけた まま ね',
  butterflyWait: 'ちょうちょが まってる！ ライトを つけて',
  butterflyFast: 'はやい！ ちょうちょが あわててる〜',
  budClosed: 'はしが ない！ ちょうちょを つれて こよう',
  bridgeOpen: 'さいた！ はなの はしだ！',
  bridgeFell: 'ぽちゃん！ はしが まだ ない〜',
  fragileNear: 'いとの はしだ！ ゆっくり わたろう',
  fragileShake: 'ゆれてる！ ゆっくり！',
  fragileBoing: 'ぼよよーん！ はやすぎた〜',
  fragileBoingAfter: 'いとの うえは ゆっくり ね',
  fragileClear: 'わたれた！ じょうず！',
  fellLight: 'ライトを けすと はやく なるよ！',
};

/** Lever labels by jump hint, for the partner's "つぎの きれめは ふつう で とべる". */
const HINT_NOTCH: Record<NonNullable<GapDef['hint']>, number> = { normal: 3, fast: 4, max: 5 };

/** Card titles for newly learned abilities. */
export const ABILITY_NAMES: Partial<Record<AbilityId, string>> = { jump: 'ジャンプ', light: 'ライト', whistle: 'きてき' };

/**
 * Drives a stage: opening → missions (steps at stations) → ending.
 * Sequencing is async; per-frame monitoring happens in update().
 */
export class MissionRunner {
  phase: MissionPhase = 'idle';
  missionIndex = -1;
  stepIndex = -1;
  passengers = 0;
  parcel = false;

  private stop: StopMonitor | null = null;
  private cats: CatActor[] = [];
  private dinos: Dino[] = [];
  private readonly nuts: RollingNut[];
  private readonly squirrels: Squirrel[];
  private readonly hoppers: Grasshopper[];
  private readonly bridges: FlowerBridges;
  private readonly fragiles: FragileBridges;
  /** Reversed-sign junctions the train has once gone the wrong way at (the light button glows there after). */
  private readonly wrongTurns = new Set<string>();
  /** What the view was last told about each butterfly (state, place). */
  private readonly butterflyPosted = new Map<number, string>();
  private lightOn = false;
  private readonly gapHints = new Set<GapDef>();
  private readonly signLines = new Set<string>();
  private readonly revealed = new Set<string>();
  private readonly found: Set<string>;
  private readonly abilities: Set<AbilityId>;
  /** Jump pads: shown for a few seconds after a whistle; `index` into gimmicks[]. */
  private readonly pads: { index: number; railId: string; at: number; seconds: number; range: number; left: number; hinted: boolean }[];
  private movingSaid = false;
  /** In the 'doors' phase: false while waiting for the door button, true once the doors are open. */
  private doorsOpen = false;
  private hintsFired = new Set<number>();
  private resolveDrive: ((outcome: DriveOutcome) => void) | null = null;
  private lines: MissionLines = {};
  private readonly groundY: number | null;

  constructor(
    private readonly stage: StageData,
    private readonly train: Train,
    private readonly whistle: Whistle,
    private readonly events: StageEventBus,
    private readonly ports: MissionPorts,
  ) {
    this.groundY = stage.file.environment.ground?.y ?? null;
    this.cats = stage.actors.filter((a) => a.type === 'cat').map((a) => new CatActor(a, train));
    this.dinos = stage.actors.map((a) => makeDino(a, train)).filter((d): d is Dino => d !== null);
    this.nuts = stage.actors.filter((a) => a.type === 'nut').map((a) => new RollingNut(a, train));
    this.squirrels = stage.actors.filter((a) => a.type === 'squirrel').map((a) => new Squirrel(a, train));
    this.hoppers = stage.actors
      .filter((a) => a.type === 'grasshopper' && a.onRail)
      .map((a) => new Grasshopper(a, train, stage.network.getRail(a.onRail!.railId).gaps as GapDef[]));
    this.bridges = new FlowerBridges(stage.file.gimmicks, train, (railId, from, to) => {
      stage.network.getRail(railId).removeGap(from, to);
    });
    this.fragiles = new FragileBridges(stage.file.gimmicks, train);
    // A reversed sign's lie leads somewhere wrong: remember it, so the light button glows at that junction next time.
    train.events.on('railChanged', ({ railId }) => {
      for (const j of stage.file.junctions) if (j.signReversed && j[j.default] === railId && j[j.default] !== j.railId) this.wrongTurns.add(j.id);
    });
    // A junction seen through once can be seen through again when a loop brings the train back to it.
    train.events.on('junctionPassed', () => {
      for (const id of this.revealed) this.events.post({ type: 'sign:reset', junctionId: id });
      this.revealed.clear();
    });
    this.pads = stage.file.gimmicks.flatMap((g, index) =>
      g.type === 'jump-pad' && g.railId !== undefined && g.from !== undefined
        ? [{ index, railId: g.railId, at: g.from, seconds: param(g, 'seconds', 8), range: param(g, 'range', 60), left: 0, hinted: false }]
        : [],
    );
    const progress = loadProgress();
    this.found = new Set(progress.records);
    this.abilities = new Set(progress.abilities);
    whistle.onWhistle(() => this.onWhistle());
    train.events.on('fell', (e) => this.onFell(e.gap, e.railId, e.short));
  }

  /** '1' while the first large dinosaur's neck is down, '0' while up, '' when there is none (test hook). */
  get bigDinoNeck(): string {
    const big = this.dinos.find((d): d is LargeDino => d instanceof LargeDino);
    return big ? (big.neckDown ? '1' : '0') : '';
  }

  /** The light button was toggled (the train's speed cap is handled by the caller). */
  setLight(on: boolean): void {
    this.lightOn = on;
  }

  /** The jump button was pressed while stopped or otherwise refused. */
  onJumpRefused(reason: string): void {
    if (this.phase !== 'driving') return;
    if (reason === 'stopped') this.ports.sayAsync(this.lines.jumpStopped ?? DEFAULT_LINES.jumpStopped);
    if (reason === 'bough') this.ports.sayAsync(this.lines.boughJump ?? DEFAULT_LINES.boughJump);
  }

  /** Test hooks and UI: the grasshopper riding on the roof (its id, or ""). */
  get hopperId(): string {
    return this.hoppers.find((h) => h.state === 'riding')?.actor.id ?? '';
  }

  /** Which flower bridges are open, "1,0,0" (test hook). */
  get bridgeFlags(): string {
    return this.bridges.openFlags;
  }

  /** The nearest butterfly's state (test hook). */
  get butterflyState(): string {
    return this.bridges.active?.state ?? '';
  }

  /** "" | near | on | shake: the silk bridge at the train (test hook). */
  get fragileStatus(): string {
    return this.fragiles.status;
  }

  /** The fastest speed the lever should show (a silk bridge ahead), or null. */
  get leverHintSpeed(): number | null {
    return this.phase === 'driving' ? this.fragiles.hintSpeed : null;
  }

  /**
   * The light button glows: a butterfly in reach is waiting for the light, or a reversed sign the train was
   * fooled by before comes up again.
   */
  get lightHint(): boolean {
    if (this.phase !== 'driving' || this.lightOn) return false;
    if (this.bridges.lightHint(this.lightOn)) return true;
    for (const id of this.wrongTurns) {
      const j = this.stage.file.junctions.find((x) => x.id === id);
      if (!j || this.revealed.has(j.id)) continue;
      const d = this.train.distanceAhead(j.railId, j.at);
      if (d !== null && d > 0 && d <= 80) return true;
    }
    return false;
  }

  /** A nut ahead can be jumped right now (the jump button glows). */
  get jumpHint(): boolean {
    return this.phase === 'driving' && (this.nuts.some((n) => n.jumpHint) || this.squirrels.some((s) => s.jumpHint));
  }

  /** Abilities the player already has on entering the stage (saved, or inherited when opened directly). */
  knowAbilities(abilities: Iterable<AbilityId>): void {
    for (const a of abilities) this.abilities.add(a);
  }

  /** Grants an ability (cutscene step). The caller shows its button; this saves it. */
  grant(ability: AbilityId): void {
    this.abilities.add(ability);
    addToProgress('abilities', [ability]);
  }

  get currentMission(): MissionDef | null {
    return this.stage.file.missions[this.missionIndex] ?? null;
  }

  /** Runs the whole stage. Resolves when the clear card was dismissed. */
  async run(): Promise<void> {
    const file = this.stage.file;
    this.resetActors();
    if (file.opening) await this.cutscene(file.opening);

    for (let i = 0; i < file.missions.length; i++) {
      const mission = file.missions[i];
      this.missionIndex = i;
      this.lines = mission.lines ?? {};
      this.movingSaid = false;
      this.hintsFired.clear();
      await this.ports.card(`ミッション ${i + 1}\n${mission.title}`, 'スタート');
      if (this.lines.start) for (const line of this.lines.start.split('\n')) await this.ports.say(line, 'partner');

      for (let j = 0; j < mission.steps.length; j++) {
        this.stepIndex = j;
        await this.runStep(mission.steps[j]);
      }

      this.events.post({ type: 'goal', stationId: null });
      if (this.lines.complete) this.ports.sayAsync(this.lines.complete);
      this.events.post({ type: 'partner:emote', kind: 'cheer' });
      await this.ports.card('できた！', 'つぎへ');
      if (mission.onComplete) await this.cutscene(mission.onComplete);
    }

    if (file.ending) await this.cutscene(file.ending);
    this.phase = 'clear';
    this.ports.fanfare();
    await this.ports.card(`${file.title}\nクリア！`, 'つづく');
  }

  /** Per-frame monitoring while driving. */
  update(dt: number): void {
    if (this.phase !== 'driving') return;
    if (this.stop) this.ports.gauge(this.stop.gauge);
    if (!this.movingSaid && this.train.state.speed > 0) {
      this.movingSaid = true;
      if (this.lines.moving) this.ports.sayAsync(this.lines.moving);
    }
    const hints = this.currentMission?.hints ?? [];
    hints.forEach((h, i) => {
      if (this.hintsFired.has(i)) return;
      const d = this.train.distanceAhead(h.railId, h.at);
      if (d !== null && d <= 0 && d > -30) {
        this.hintsFired.add(i);
        this.ports.sayAsync(h.text);
      }
    });
    this.updateGapHints();
    this.updatePads(dt);
    this.updateJunctionSigns();
    this.updateRecords();
    if (this.checkDeadEnd()) return;
    const outcome = this.stop?.update(dt) ?? null;
    if (outcome) {
      switch (outcome.kind) {
        case 'gaugeShown':
          if (this.lines.gauge) this.ports.sayAsync(this.lines.gauge);
          break;
        case 'near':
          if (this.lines.stationNear) this.ports.sayAsync(this.lines.stationNear);
          break;
        case 'short':
          this.ports.sayAsync(this.lines.short ?? DEFAULT_LINES.short);
          break;
        case 'tooFast':
          this.finishDrive({ kind: 'fail', reason: 'tooFast' });
          return;
        case 'overshoot':
          this.finishDrive({ kind: 'fail', reason: 'overshoot' });
          return;
        case 'stopped':
          this.finishDrive({ kind: 'stopped', grade: outcome.grade });
          return;
      }
    }
    for (const cat of this.cats) {
      const c = cat.update();
      if (!c) continue;
      if (c.kind === 'near' && this.lines.catNear) this.ports.sayAsync(this.lines.catNear);
      if (c.kind === 'danger') {
        this.train.emergencyStop();
        this.ports.autoCamera('side');
        cat.flee();
        this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'flee', position: this.catFleePosition(cat), seconds: 0.6 });
        this.finishDrive({ kind: 'fail', reason: 'cat', rewind: { railId: cat.railId, at: cat.at - REWIND_DISTANCE } });
        return;
      }
    }
    for (const dino of this.dinos) {
      const o = dino.update(dt);
      if (!o) continue;
      const id = dino.actor.id;
      if (o.kind === 'near') {
        const line = dino instanceof LargeDino ? this.lines.bigDinoNear : this.lines.dinoNear;
        if (line) this.ports.sayAsync(line);
      } else if (o.kind === 'cross') {
        if (this.lines.smallCrossing) this.ports.sayAsync(this.lines.smallCrossing);
        const lateral = (dino as SmallDino).params.lateral;
        this.events.post({ type: 'actor:state', id, state: 'cross', position: this.lateralPosition(dino.railId, dino.at, lateral), seconds: o.seconds });
      } else if (o.kind === 'neck') {
        this.events.post({ type: 'actor:state', id, state: o.down ? 'neck-down' : 'neck-up' });
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.ports.autoCamera('side');
        if (dino instanceof LargeDino) this.events.post({ type: 'actor:state', id, state: 'neck-down' });
        if (dino instanceof SmallDino) this.events.post({ type: 'actor:state', id, state: 'stop' });
        if (dino instanceof MidDino) {
          this.events.post({ type: 'actor:state', id, state: 'awake', position: this.lateralPosition(dino.railId, dino.at, dino.params.fleeLateral), seconds: 0.8 });
        }
        this.finishDrive({ kind: 'fail', reason: 'dino', rewind: { railId: dino.railId, at: dino.at - REWIND_DISTANCE } });
        return;
      }
    }
    for (const nut of this.nuts) {
      const o = nut.update(dt);
      if (!o) continue;
      const id = nut.actor.id;
      if (o.kind === 'roll') {
        this.events.post({ type: 'nut', id, state: 'roll', railId: nut.railId, at: nut.at, speed: o.speed });
        if (this.lines.nutNear) this.ports.sayAsync(this.lines.nutNear);
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.events.post({ type: 'nut', id, state: 'bonk', railId: nut.railId, at: nut.s });
        this.finishDrive({ kind: 'fail', reason: 'nut', rewind: { railId: nut.railId, at: nut.at - nut.params.trigger - 30 } });
        return;
      }
    }
    for (const squirrel of this.squirrels) {
      const o = squirrel.update();
      if (!o) continue;
      const id = squirrel.actor.id;
      if (o.kind === 'near') {
        if (this.lines.squirrelNear) this.ports.sayAsync(this.lines.squirrelNear);
      } else if (o.kind === 'drop-rail') {
        this.events.post({ type: 'squirrel', id, state: 'drop-rail' });
        this.events.post({ type: 'nut', id, state: 'rest', railId: squirrel.railId, at: squirrel.at });
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.events.post({ type: 'nut', id, state: 'bonk', railId: squirrel.railId, at: squirrel.at });
        this.finishDrive({ kind: 'fail', reason: 'nut', rewind: { railId: squirrel.railId, at: squirrel.at - REWIND_DISTANCE } });
        return;
      }
    }
    this.updateHoppers();
    this.updateBridges(dt);
    this.updateFragiles(dt);
  }

  /** Grasshoppers: one hops on (by itself or when whistled for), helps over its gap, and hops off. */
  private updateHoppers(): void {
    for (const hopper of this.hoppers) {
      const o = hopper.update(this.hopperFree);
      if (!o) continue;
      const id = hopper.actor.id;
      if (o.kind === 'near') this.ports.sayAsync(this.lines.hopperNear ?? DEFAULT_LINES.hopperNear);
      else if (o.kind === 'board') this.board(hopper);
      else if (o.kind === 'ready') {
        const hint = hopper.params.gapHint ?? hopper.gap?.hint ?? 'fast';
        const text = this.lines.hopperReady ?? DEFAULT_LINES.hopperReady;
        this.ports.sayAsync(text.replace('{speed}', LEVER_NOTCHES[HINT_NOTCH[hint]].label));
      } else if (o.kind === 'done') {
        this.train.jumpBoost = null;
        this.events.post({ type: 'hopper', id, state: 'off' });
        this.ports.sayAsync(this.lines.hopperDone ?? DEFAULT_LINES.hopperDone);
      }
    }
  }

  /** No grasshopper is riding (only one fits on the roof). */
  private get hopperFree(): boolean {
    return !this.hoppers.some((h) => h.state === 'riding');
  }

  private board(hopper: Grasshopper): void {
    this.train.jumpBoost = { power: hopper.params.power, height: hopper.params.height };
    this.events.post({ type: 'hopper', id: hopper.actor.id, state: 'board' });
    this.events.post({ type: 'partner:emote', kind: 'jump' });
    this.ports.sayAsync(this.lines.hopperOn ?? DEFAULT_LINES.hopperOn);
  }

  /** Butterflies follow the light to their bud; the flower opens a bridge over the stream. */
  private updateBridges(dt: number): void {
    for (const { bridge, outcome } of this.bridges.update(dt, this.lightOn)) {
      if (!outcome) continue;
      const key: DefaultLine = BRIDGE_LINES[outcome.kind];
      this.ports.sayAsync(this.lines[key] ?? DEFAULT_LINES[key]);
      if (outcome.kind === 'open') {
        this.events.post({ type: 'bridge', index: bridge.index, open: true });
        this.events.post({ type: 'partner:emote', kind: 'jump' });
      }
    }
    this.postButterflies();
  }

  /** Tells the view where each butterfly is, when that changed. */
  private postButterflies(): void {
    for (const b of this.bridges.bridges) {
      const key = `${b.state}:${b.s.toFixed(2)}:${b.flustered ? 1 : 0}`;
      if (this.butterflyPosted.get(b.index) === key) continue;
      this.butterflyPosted.set(b.index, key);
      this.events.post({ type: 'butterfly', index: b.index, state: b.state, s: b.s, flustered: b.flustered });
    }
  }

  /** Silk bridges: slow over them, or the silk bounces the train back. */
  private updateFragiles(dt: number): void {
    for (const { item, outcome } of this.fragiles.update(dt)) {
      if (!outcome) continue;
      switch (outcome.kind) {
        case 'near':
          this.ports.sayAsync(this.lines.fragileNear ?? DEFAULT_LINES.fragileNear);
          break;
        case 'shake':
          this.events.post({ type: 'fragile', index: item.index, state: 'shake' });
          this.ports.sayAsync(this.lines.fragileShake ?? DEFAULT_LINES.fragileShake);
          break;
        case 'calm':
          this.events.post({ type: 'fragile', index: item.index, state: 'calm' });
          break;
        case 'clear':
          this.events.post({ type: 'fragile', index: item.index, state: 'calm' });
          this.ports.sayAsync(this.lines.fragileClear ?? DEFAULT_LINES.fragileClear);
          break;
        case 'boing':
          this.train.emergencyStop();
          this.events.post({ type: 'fragile', index: item.index, state: 'boing' });
          this.finishDrive({ kind: 'fail', reason: 'fragile', rewind: { railId: item.railId, at: item.rewindAt } });
          return;
      }
    }
  }

  /**
   * Puts every actor back where it waits (start of the stage and after a rewind to `target`): grasshoppers
   * riding, or whose leaf is ahead of the train again, go back to their leaf.
   */
  private resetActors(target?: { railId: string; at: number }): void {
    for (const hopper of this.hoppers) {
      const behind = target !== undefined && hopper.state === 'done' && (hopper.railId !== target.railId || hopper.at <= target.at);
      if (behind) continue;
      if (hopper.state !== 'sit') this.events.post({ type: 'hopper', id: hopper.actor.id, state: 'sit' });
      hopper.reset();
    }
    this.train.jumpBoost = null;
    this.bridges.reset();
    this.postButterflies();
    this.fragiles.reset();
    for (const f of this.fragiles.items) this.events.post({ type: 'fragile', index: f.index, state: 'calm' });
    for (const nut of this.nuts) {
      nut.reset();
      this.events.post({ type: 'nut', id: nut.actor.id, state: 'reset', railId: nut.railId, at: nut.at });
    }
    for (const squirrel of this.squirrels) {
      squirrel.reset();
      this.events.post({ type: 'squirrel', id: squirrel.actor.id, state: 'hold' });
      this.events.post({ type: 'nut', id: squirrel.actor.id, state: 'hide', railId: squirrel.railId, at: squirrel.at });
    }
    for (const dino of this.dinos) {
      dino.reset();
      const id = dino.actor.id;
      if (dino instanceof SmallDino) {
        this.events.post({ type: 'actor:state', id, state: 'wait', position: this.lateralPosition(dino.railId, dino.at, -dino.params.lateral), seconds: 0 });
      } else if (dino instanceof LargeDino) {
        this.events.post({ type: 'actor:state', id, state: 'neck-up' });
      } else {
        this.events.post({ type: 'actor:state', id, state: 'sleep', position: dino.actor.position, seconds: 0 });
      }
    }
  }

  /**
   * Jump pads: the partner points out the missing pad and the whistle button glows while it is in reach;
   * a shown pad counts down and launches the train when the lead bogie runs over it.
   */
  private updatePads(dt: number): void {
    let glow = false;
    for (const pad of this.pads) {
      const d = this.train.distanceAhead(pad.railId, pad.at);
      if (pad.left > 0) {
        pad.left = Math.max(0, pad.left - dt);
        if (pad.left === 0) this.events.post({ type: 'pad', index: pad.index, visible: false });
      }
      if (d === null) continue;
      if (!pad.hinted && d > 0 && d <= pad.range + 30) {
        pad.hinted = true;
        this.ports.sayAsync(this.lines.padGone ?? DEFAULT_LINES.padGone);
      }
      if (pad.left === 0 && d > -FALL.bogieLead && d <= pad.range) glow = true;
      // The lead bogie is FALL.bogieLead behind the front: launch when it reaches the pad.
      if (pad.left > 0 && d <= -FALL.bogieLead && d > -FALL.bogieLead - 4 && this.train.padJump()) {
        this.events.post({ type: 'jump' });
      }
    }
    if (this.squirrels.some((s) => s.inWhistleRange)) glow = true;
    if (this.hopperFree && this.hoppers.some((h) => h.inWhistleRange)) glow = true;
    this.ports.whistleHint(glow);
  }

  /** "つぎの きれめは ふつう で とべる！" once per gap and attempt. */
  private updateGapHints(): void {
    const gap = this.train.nextGap(JUMP.hintDistance);
    if (!gap || !gap.hint || this.gapHints.has(gap) || !this.lines.gapNear) return;
    this.gapHints.add(gap);
    this.ports.sayAsync(this.lines.gapNear.replace('{speed}', LEVER_NOTCHES[HINT_NOTCH[gap.hint]].label));
  }

  /** The junction ahead on the current rail, if it is within `range` m of the train front. */
  private junctionAhead(range: number): JunctionDef | null {
    for (const j of this.stage.file.junctions) {
      const d = this.train.distanceAhead(j.railId, j.at);
      if (d !== null && d > 0 && d <= range) return j;
    }
    return null;
  }

  /** Reversed signs: a line when one comes up; with the light on, the true way lights up and becomes the default. */
  private updateJunctionSigns(): void {
    const j = this.junctionAhead(80);
    if (!j || !j.signReversed || this.revealed.has(j.id)) return;
    if (!this.signLines.has(j.id)) {
      this.signLines.add(j.id);
      if (this.lines.signNear && !this.lightOn) this.ports.sayAsync(this.lines.signNear);
    }
    const d = this.train.distanceAhead(j.railId, j.at);
    if (!this.lightOn || d === null || d > LIGHT.revealDistance) return;
    this.revealed.add(j.id);
    const truth: JunctionSide = j.default === 'left' ? 'right' : 'left';
    this.train.chooseJunction(truth);
    this.ports.revealJunction(truth);
    this.events.post({ type: 'sign:reveal', junctionId: j.id });
    if (this.lines.signRevealed) this.ports.sayAsync(this.lines.signRevealed);
  }

  /** Records: found by passing close (no ability needed) or by lighting them up when they need the light. */
  private updateRecords(): void {
    for (const record of this.stage.records) {
      const def = record.def;
      if (this.found.has(def.id)) continue;
      if (def.requires !== null && !(def.requires === 'light' && this.lightOn && this.abilities.has('light'))) continue;
      const d = this.recordDistance(record);
      if (d === null || d > LIGHT.recordDistance) continue;
      this.found.add(def.id);
      addToProgress('records', [def.id]);
      this.events.post({ type: 'record:found', id: def.id });
      this.ports.recordFound(def);
      this.ports.sayAsync(this.lines.recordFound ?? DEFAULT_LINES.recordFound);
    }
  }

  private recordDistance(record: ResolvedRecord): number | null {
    if (record.onRail) {
      const d = this.train.distanceAhead(record.onRail.railId, record.onRail.at);
      return d === null ? null : Math.abs(d);
    }
    return record.position.distanceTo(this.train.getPose().position);
  }

  /** Stopped at the buffer of a wrong turn: back before the junction. */
  private checkDeadEnd(): boolean {
    const rail = this.train.currentRail;
    const def = this.stage.file.rails.find((r) => r.id === rail.id);
    if (!def?.deadEnd || this.train.state.speed > 0) return false;
    if (rail.length - this.train.frontS > 10) return false;
    const feeder = this.stage.file.junctions.find((j) => j.left === rail.id || j.right === rail.id);
    if (!feeder) return false;
    this.finishDrive({ kind: 'fail', reason: 'deadEnd', rewind: { railId: feeder.railId, at: feeder.at - REWIND_DISTANCE } });
    return true;
  }

  private onFell(gap: GapDef, railId: string, short: boolean): void {
    if (this.phase !== 'driving') return;
    this.ports.autoCamera('chase');
    const same = (g: GapDef | null) => g !== null && g.from === gap.from && g.to === gap.to;
    let reason: FailReason = short ? 'fellShort' : 'fellNoJump';
    let line: DefaultLine | undefined;
    if (gap.bridge !== undefined) reason = 'bridge';
    else if (this.hoppers.some((h) => h.railId === railId && h.state === 'sit' && same(h.gap))) reason = 'hopper';
    // Short with the light on: the light caps the speed, which is what made the jump too short.
    else if (short && this.lightOn) line = 'fellLight';
    this.finishDrive({ kind: 'fail', reason, line, rewind: gap.rewind ?? { railId, at: gap.from - REWIND_DISTANCE } });
  }

  /** Lever moved while locked: explain why. */
  onLeverRejected(): void {
    if (this.phase !== 'doors') return;
    if (this.doorsOpen) this.ports.sayAsync(this.lines.doorsOpenLever ?? DEFAULT_LINES.doorsOpenLever);
    else this.ports.sayAsync(this.lines.doorsClosedLever ?? DEFAULT_LINES.doorsClosedLever);
  }

  private onWhistle(): void {
    if (this.phase !== 'driving') return;
    for (const pad of this.pads) {
      const d = this.train.distanceAhead(pad.railId, pad.at);
      if (d === null || d > pad.range || d <= -FALL.bogieLead) continue;
      const fresh = pad.left === 0;
      pad.left = pad.seconds;
      this.events.post({ type: 'pad', index: pad.index, visible: true, seconds: pad.seconds });
      if (fresh) this.ports.sayAsync(this.lines.padAppear ?? DEFAULT_LINES.padAppear);
    }
    for (const cat of this.cats) {
      if (cat.onWhistle()) {
        this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'awake', position: this.catFleePosition(cat), seconds: cat.params.fleeSeconds });
        if (this.lines.catWoke) this.ports.sayAsync(this.lines.catWoke);
        this.events.post({ type: 'partner:emote', kind: 'jump' });
      }
    }
    for (const hopper of this.hoppers) {
      if (hopper.onWhistle(this.hopperFree)) this.board(hopper);
    }
    for (const squirrel of this.squirrels) {
      if (!squirrel.onWhistle()) continue;
      this.events.post({ type: 'squirrel', id: squirrel.actor.id, state: 'drop-side' });
      this.ports.sayAsync(this.lines.squirrelDropped ?? DEFAULT_LINES.squirrelDropped);
      this.events.post({ type: 'partner:emote', kind: 'jump' });
    }
    for (const dino of this.dinos) {
      if (!dino.onWhistle() || !(dino instanceof MidDino)) continue;
      const position = this.lateralPosition(dino.railId, dino.at, dino.params.fleeLateral);
      this.events.post({ type: 'actor:state', id: dino.actor.id, state: 'awake', position, seconds: dino.params.fleeSeconds });
      if (this.lines.dinoWoke) this.ports.sayAsync(this.lines.dinoWoke);
      this.events.post({ type: 'partner:emote', kind: 'jump' });
    }
  }

  private catFleePosition(cat: CatActor): Vector3 {
    return this.lateralPosition(cat.railId, cat.at, cat.params.fleeLateral);
  }

  /** A point on the ground `lateral` m to the right of the rail at `at`. */
  private lateralPosition(railId: string, at: number, lateral: number): Vector3 {
    const frame = this.stage.network.getRail(railId).frameAt(at);
    const p = frame.position.clone().addScaledVector(frame.right, lateral);
    if (this.groundY !== null) p.y = this.groundY;
    return p;
  }

  private station(id: string): StationDef {
    const st = this.stage.file.stations.find((s) => s.id === id);
    if (!st) throw new Error(`Unknown station "${id}"`);
    return st;
  }

  private async runStep(step: MissionStep): Promise<void> {
    const station = this.station(step.stationId);
    // Already standing at this station (previous mission ended here): no driving, no grading.
    const alreadyHere =
      this.train.state.speed === 0 &&
      this.train.state.railId === station.railId &&
      Math.abs(this.train.offsetTo(station.at)) <= new StopMonitor(this.train, station).rule.ok;
    // Drive until a graded stop; fails rewind and retry the same step.
    while (!alreadyHere) {
      this.events.post({ type: 'goal', stationId: station.id });
      const outcome = await this.drive(station);
      if (outcome.kind === 'stopped') {
        this.ports.toast(outcome.grade === 'perfect' ? 'ぴったり！' : 'とまれた！', outcome.grade);
        this.events.post({ type: 'stop', grade: outcome.grade });
        this.ports.sayAsync(this.lines[outcome.grade] ?? DEFAULT_LINES[outcome.grade]);
        if (outcome.grade === 'perfect') this.events.post({ type: 'partner:emote', kind: 'jump' });
        break;
      }
      await this.fail(outcome, station);
    }
    if ((step.board ?? 0) > 0 || (step.alight ?? 0) > 0 || step.parcel) await this.doors(step, station);
  }

  private drive(station: StationDef): Promise<DriveOutcome> {
    this.stop = new StopMonitor(this.train, station);
    this.phase = 'driving';
    this.train.unlockInput();
    return new Promise((resolve) => {
      this.resolveDrive = resolve;
    });
  }

  private finishDrive(outcome: DriveOutcome): void {
    this.phase = outcome.kind === 'fail' ? 'failing' : 'stopped';
    if (this.stop) this.ports.gauge(this.stop.gauge);
    this.train.lockInput(this.phase);
    const r = this.resolveDrive;
    this.resolveDrive = null;
    r?.(outcome);
  }

  private async fail(outcome: FailOutcome, station: StationDef): Promise<void> {
    const reason = outcome.reason;
    // The train is stopped and the lever is locked until the rewind: say why now, not after older lines.
    this.ports.hush();
    this.events.post({ type: 'fail', reason });
    const scary = reason === 'cat' || reason === 'dino';
    // The silk bounces the train back softly: a dip, no shake.
    this.ports.cameraFx(scary ? 1 : 0.5, reason === 'fragile' ? 0 : 1);
    const key: DefaultLine = outcome.line ?? FAIL_LINES[reason] ?? (reason as DefaultLine);
    await this.ports.say(this.lines[key] ?? DEFAULT_LINES[key], 'partner');
    if (reason === 'cat') await this.ports.say(this.lines.catDangerAfter ?? DEFAULT_LINES.catDangerAfter, 'partner');
    if (reason === 'dino') await this.ports.say(this.lines.dangerAfter ?? DEFAULT_LINES.dangerAfter, 'partner');
    if (reason === 'fragile') await this.ports.say(this.lines.fragileBoingAfter ?? DEFAULT_LINES.fragileBoingAfter, 'partner');
    await this.ports.fade(true, 0.4);
    // Rewind to a bit before whatever we failed at (the station, a cat or dinosaur, a gap, a junction).
    const target = outcome.rewind ?? { railId: station.railId, at: station.at - REWIND_DISTANCE };
    this.train.rewindTo(target.at, target.railId);
    for (const cat of this.cats) cat.reset();
    for (const cat of this.cats) this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'sleep', position: cat.actor.position });
    this.resetActors(target);
    for (const pad of this.pads) {
      pad.left = 0;
      pad.hinted = false;
      this.events.post({ type: 'pad', index: pad.index, visible: false });
    }
    this.ports.whistleHint(false);
    this.gapHints.clear();
    this.signLines.clear();
    this.revealed.clear();
    this.events.post({ type: 'rewind' });
    this.ports.resetLever();
    this.ports.autoCamera(null);
    await this.ports.wait(0.3);
    await this.ports.fade(false, 0.4);
  }

  private async doors(step: MissionStep, station: StationDef): Promise<void> {
    this.phase = 'doors';
    this.doorsOpen = false;
    this.train.lockInput('doors');
    // Nothing moves until the door button is tapped: ask for it, and keep asking.
    const ask = this.lines.doorAsk ?? DEFAULT_LINES.doorAsk;
    let pressed = false;
    const press = new Promise<void>((resolve) =>
      this.ports.showDoorButton(() => {
        pressed = true;
        resolve();
      }),
    );
    this.ports.sayAsync(ask);
    void (async () => {
      while (!pressed) {
        await this.ports.wait(DOOR_REMIND_SECONDS);
        if (!pressed) this.ports.sayAsync(ask);
      }
    })();
    await press;
    this.ports.hush();
    this.doorsOpen = true;
    this.ports.hideDoorButton();
    this.ports.autoCamera('side');
    this.events.post({ type: 'door', open: true, stationId: station.id });
    if (this.lines.doorOpen) this.ports.sayAsync(this.lines.doorOpen);
    await this.ports.wait(0.6);

    const alight = Math.min(step.alight ?? 0, this.passengers);
    const board = step.board ?? 0;
    this.events.post({ type: 'passengers', stationId: station.id, board, alight });
    if (step.say) {
      this.ports.sayAsync(step.say, 'passenger');
      if (step.reply) this.ports.sayAsync(step.reply, 'partner');
    }
    for (let i = 0; i < alight; i++) {
      await this.ports.wait(PASSENGER_SECONDS);
      this.passengers -= 1;
      this.ports.setCargo(this.passengers, this.parcel);
    }
    for (let i = 0; i < board; i++) {
      await this.ports.wait(PASSENGER_SECONDS);
      this.passengers += 1;
      this.ports.setCargo(this.passengers, this.parcel);
    }
    if (step.parcel) {
      await this.ports.wait(PASSENGER_SECONDS);
      this.parcel = step.parcel === 'load';
      this.ports.setCargo(this.passengers, this.parcel);
    }

    await this.ports.wait(0.8);
    this.events.post({ type: 'door', open: false, stationId: station.id });
    if (this.lines.doorClosed) this.ports.sayAsync(this.lines.doorClosed);
    await this.ports.wait(0.4);
    this.ports.autoCamera(null);
    this.doorsOpen = false;
    // Stay put until the next drive() unlocks: a train rolling between missions has no one watching it.
    this.phase = 'stopped';
    this.train.lockInput('stopped');
  }

  private async cutscene(id: string): Promise<void> {
    const steps = this.stage.file.cutscenes?.[id];
    if (!steps) throw new Error(`Unknown cutscene "${id}"`);
    const previous = this.phase;
    this.phase = 'cutscene';
    this.train.lockInput('cutscene');
    this.ports.autoCamera('chase');
    await runCutscene(steps, this.stage.network, this.groundY, this.events, {
      ...this.ports,
      unlock: async (ability) => {
        this.grant(ability);
        await this.ports.unlock(ability);
      },
    });
    this.ports.autoCamera(null);
    this.phase = previous === 'driving' ? 'idle' : previous;
  }
}

type FailReason = Extract<StageEvent, { type: 'fail' }>['reason'];
/** Fail reasons whose line has another key. */
const FAIL_LINES: Partial<Record<FailReason, DefaultLine>> = {
  cat: 'catDanger',
  dino: 'dinoDanger',
  nut: 'nutHit',
  hopper: 'hopperFell',
  bridge: 'bridgeFell',
  fragile: 'fragileBoing',
};
const BRIDGE_LINES: Record<NonNullable<BridgeOutcome>['kind'], DefaultLine> = {
  near: 'butterflyNear',
  follow: 'butterflyFollow',
  wait: 'butterflyWait',
  fast: 'butterflyFast',
  closed: 'budClosed',
  open: 'bridgeOpen',
};
interface FailOutcome {
  kind: 'fail';
  reason: FailReason;
  /** Say this instead of the reason's line. */
  line?: DefaultLine;
  /** Where to put the train front back; default: REWIND_DISTANCE before the station. */
  rewind?: { railId: string; at: number };
}
type DriveOutcome = { kind: 'stopped'; grade: StopGrade } | FailOutcome;
