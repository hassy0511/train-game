import { Vector3 } from 'three';
import type { Whistle } from '../actions/whistle';
import { CatActor } from '../actors/cat';
import type { StageEventBus } from '../core/stage-events';
import { runCutscene, type CutscenePorts } from '../cutscene/runner';
import type { MissionDef, MissionLines, MissionStep, Speaker, StageData, StationDef } from '../stage/types';
import { PASSENGER_SECONDS, REWIND_DISTANCE } from '../train/params';
import type { Train } from '../train/train';
import type { CameraMode } from '../view/camera-rig';
import { StopMonitor, type GaugeState, type StopGrade } from './station-stop';

/** Everything the runner needs from the UI layer. */
export interface MissionPorts extends CutscenePorts {
  /** Say something without blocking (queued). */
  sayAsync(text: string, who?: Speaker): void;
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
  /** Temporarily override the player's camera (null = give it back). */
  autoCamera(mode: CameraMode | null): void;
}

export type MissionPhase = 'idle' | 'driving' | 'stopped' | 'doors' | 'cutscene' | 'failing' | 'clear';

const DEFAULT_LINES: Required<Pick<MissionLines, 'tooFast' | 'overshoot' | 'short' | 'perfect' | 'ok' | 'catDanger' | 'catDangerAfter' | 'doorsOpenLever'>> = {
  tooFast: 'わわっ、はやすぎた〜！ もういっかい！',
  overshoot: 'いきすぎた〜！ もういっかい！',
  short: 'もうちょっと まえ！',
  perfect: 'ぴったり！ すごい！',
  ok: 'とまれた！',
  catDanger: 'あぶない！',
  catDangerAfter: 'びっくりした〜。もういっかい！',
  doorsOpenLever: 'ドアが あいてるよ！',
};

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
  private movingSaid = false;
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
    whistle.onWhistle(() => this.onWhistle());
  }

  get currentMission(): MissionDef | null {
    return this.stage.file.missions[this.missionIndex] ?? null;
  }

  /** Runs the whole stage. Resolves when the clear card was dismissed. */
  async run(): Promise<void> {
    const file = this.stage.file;
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
        this.finishDrive({ kind: 'fail', reason: 'cat' });
        return;
      }
    }
  }

  /** Lever moved while locked: explain why. */
  onLeverRejected(): void {
    if (this.phase === 'doors') this.ports.sayAsync(this.lines.doorsOpenLever ?? DEFAULT_LINES.doorsOpenLever);
  }

  private onWhistle(): void {
    if (this.phase !== 'driving') return;
    for (const cat of this.cats) {
      if (cat.onWhistle()) {
        this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'awake', position: this.catFleePosition(cat), seconds: cat.params.fleeSeconds });
        if (this.lines.catWoke) this.ports.sayAsync(this.lines.catWoke);
        this.events.post({ type: 'partner:emote', kind: 'jump' });
      }
    }
  }

  private catFleePosition(cat: CatActor): Vector3 {
    const frame = this.stage.network.getRail(cat.railId).frameAt(cat.at);
    const p = frame.position.clone().addScaledVector(frame.right, cat.params.fleeLateral);
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
      await this.fail(outcome.reason, station);
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

  private async fail(reason: 'tooFast' | 'overshoot' | 'cat', station: StationDef): Promise<void> {
    this.events.post({ type: 'fail', reason });
    this.ports.cameraFx(reason === 'cat' ? 1 : 0.5, 1);
    const line = this.lines[reason === 'cat' ? 'catDanger' : reason] ?? DEFAULT_LINES[reason === 'cat' ? 'catDanger' : reason];
    await this.ports.say(line, 'partner');
    if (reason === 'cat') await this.ports.say(this.lines.catDangerAfter ?? DEFAULT_LINES.catDangerAfter, 'partner');
    await this.ports.fade(true, 0.4);
    // Rewind to a bit before whatever we failed at (the station, or the cat that was in the way).
    let target = station.at;
    if (reason === 'cat') {
      const cat = this.cats.find((c) => c.state === 'fled');
      if (cat) target = cat.at;
    }
    this.train.rewindTo(target - REWIND_DISTANCE);
    for (const cat of this.cats) cat.reset();
    for (const cat of this.cats) this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'sleep', position: cat.actor.position });
    this.events.post({ type: 'rewind' });
    this.ports.resetLever();
    this.ports.autoCamera(null);
    await this.ports.wait(0.3);
    await this.ports.fade(false, 0.4);
  }

  private async doors(step: MissionStep, station: StationDef): Promise<void> {
    this.phase = 'doors';
    this.train.lockInput('doors');
    await new Promise<void>((resolve) => this.ports.showDoorButton(resolve));
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
    this.phase = 'idle';
    this.train.unlockInput();
  }

  private async cutscene(id: string): Promise<void> {
    const steps = this.stage.file.cutscenes?.[id];
    if (!steps) throw new Error(`Unknown cutscene "${id}"`);
    const previous = this.phase;
    this.phase = 'cutscene';
    this.train.lockInput('cutscene');
    this.ports.autoCamera('chase');
    await runCutscene(steps, this.stage.network, this.groundY, this.events, this.ports);
    this.ports.autoCamera(null);
    this.phase = previous === 'driving' ? 'idle' : previous;
  }
}

type DriveOutcome = { kind: 'stopped'; grade: StopGrade } | { kind: 'fail'; reason: 'tooFast' | 'overshoot' | 'cat' };
