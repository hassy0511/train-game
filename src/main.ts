import './ui/styles.css';
import { Whistle } from './actions/whistle';
import { AudioEngine } from './audio/audio';
import { GAME_TITLE, PARTNER_NAME } from './config';
import { StageEventBus } from './core/stage-events';
import { MissionRunner, type MissionPorts } from './mission/runner';
import { PhysicsWorld } from './physics/world';
import { loadStage } from './stage/loader';
import { SPEED_LABELS } from './train/params';
import { Train } from './train/train';
import { createUi } from './ui';
import { createBubbles } from './ui/bubble';
import { createCargoStrip } from './ui/cargo-strip';
import { showCard } from './ui/cards';
import { createDoorButton } from './ui/door-button';
import { createFade } from './ui/fade';
import { showTitle } from './ui/title';
import { createToast } from './ui/toast';
import { createSceneView, type CameraFx } from './view';

const app = document.getElementById('app') as HTMLElement;
const viewEl = document.getElementById('view') as HTMLElement;
const uiEl = document.getElementById('ui') as HTMLElement;

const MAX_DT = 0.1;

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const stageId = params.get('stage') ?? '1-1';

  const [stage, physics] = await Promise.all([loadStage(stageId), PhysicsWorld.create()]);
  const hasMissions = stage.file.missions.length > 0;
  const train = new Train(stage.network, stage.file.junctions, stage.file.start);
  const whistle = new Whistle();
  const audio = new AudioEngine();
  const events = new StageEventBus();

  const view = createSceneView(params);
  await view.init(viewEl, stage, stage.network);
  events.on('event', (e) => view.onStageEvent(e));

  // Test/dev hooks for waiting on game time.
  let simTime = 0;
  const waiters: { at: number; resolve: () => void }[] = [];
  const waitSeconds = (seconds: number): Promise<void> =>
    new Promise((resolve) => waiters.push({ at: simTime + seconds, resolve }));

  const fx: CameraFx = { dip: 0, shake: 0 };
  let runner: MissionRunner | null = null;

  const ui = createUi(uiEl, {
    speedLabels: SPEED_LABELS,
    onNotch: (n) => {
      if (!train.setNotch(n)) {
        ui.lever.setNotch(train.state.notch);
        runner?.onLeverRejected();
      }
    },
    onWhistle: () => {
      audio.unlock();
      if (whistle.trigger()) audio.playWhistle();
    },
    onJunction: (side) => train.chooseJunction(side),
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  const bubbles = createBubbles(uiEl, PARTNER_NAME);
  const cargo = createCargoStrip(uiEl);
  const toast = createToast(uiEl);
  const fade = createFade(uiEl);
  const doorButton = createDoorButton(uiEl.querySelector('.action-buttons') as HTMLElement);

  const startPose = train.getPose();
  physics.addTrain(startPose.position, startPose.quaternion);
  for (const actor of stage.actors) {
    if (actor.type === 'trigger') physics.addSensor(actor.id, actor.position, actor.quaternion, actor.size);
  }

  train.events.on('junctionApproach', (e) => ui.junction.show(e));
  train.events.on('junctionLocked', () => ui.junction.hide());
  train.events.on('junctionPassed', () => ui.junction.hide());
  train.events.on('railChanged', ({ railId }) => console.info(`rail: now on ${railId}`));
  train.events.on('endOfLine', () => {
    if (!hasMissions) ui.overlays.showEnd();
  });

  const resize = (): void => view.resize(viewEl.clientWidth, viewEl.clientHeight, window.devicePixelRatio);
  window.addEventListener('resize', resize);
  resize();

  const debug = import.meta.env.DEV
    ? (await import('./debug')).installDebug({ train, whistle, audio, view, network: stage.network, uiRoot: uiEl })
    : null;

  document.title = GAME_TITLE;
  app.dataset.stage = stage.file.id;
  app.dataset.ready = '1';

  let last = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fps = 0;

  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    simTime += dt;
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (simTime >= waiters[i].at) {
        const w = waiters[i];
        waiters.splice(i, 1);
        w.resolve();
      }
    }

    train.update(dt);
    whistle.update(dt);
    ui.whistle.setProgress(whistle.progress);
    runner?.update(dt);

    const pose = train.getPose();
    physics.setTrainPose(pose.position, pose.quaternion);
    for (const ev of physics.step(dt)) console.log(`sensor: ${ev.id} ${ev.entered ? 'enter' : 'exit'}`);

    fx.dip = Math.max(0, fx.dip - dt * 1.2);
    fx.shake = Math.max(0, fx.shake - dt * 2.5);
    view.update(dt, pose, fx);
    ui.hud.setSpeedWord(SPEED_LABELS[train.state.notch]);

    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
      app.dataset.fps = fps.toFixed(0);
    }
    app.dataset.time = simTime.toFixed(2);
    app.dataset.s = train.state.s.toFixed(1);
    app.dataset.rail = train.state.railId;
    app.dataset.notch = String(train.state.notch);
    if (runner) {
      app.dataset.phase = runner.phase;
      app.dataset.mission = String(runner.missionIndex);
      app.dataset.step = String(runner.stepIndex);
    }
    debug?.update(fps);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (!hasMissions) return; // Test course: just drive.

  await showTitle(uiEl, GAME_TITLE);
  audio.unlock();

  const ports: MissionPorts = {
    say: (text, who) => bubbles.say(text, who),
    sayAsync: (text, who) => void bubbles.say(text, who),
    card: (title, button) => {
      audio.playCard();
      return showCard(uiEl, title, button);
    },
    wait: waitSeconds,
    toast: (text, kind) => {
      toast.show(text, kind);
      audio.playStop(kind);
    },
    showDoorButton: (onPress) => doorButton.show(onPress),
    hideDoorButton: () => doorButton.hide(),
    setCargo: (p, parcel) => cargo.set(p, parcel),
    fade,
    cameraFx: (dip, shake) => {
      fx.dip = Math.max(fx.dip, dip);
      fx.shake = Math.max(fx.shake, shake);
      audio.playBoing();
    },
    resetLever: () => ui.lever.setNotch(0),
  };
  events.on('event', (e) => {
    if (e.type === 'door') audio.playDoor(e.open);
  });

  runner = new MissionRunner(stage, train, whistle, events, ports);
  await runner.run();
  location.reload();
}

boot().catch((err: unknown) => {
  console.error(err);
  app.dataset.error = '1';
  const p = document.createElement('div');
  p.className = 'overlay';
  p.innerHTML = '<h1>うまく うごかなかった</h1>';
  const msg = document.createElement('p');
  msg.textContent = err instanceof Error ? err.message : String(err);
  p.appendChild(msg);
  uiEl.appendChild(p);
});
