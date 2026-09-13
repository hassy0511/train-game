import './ui/styles.css';
import { Whistle } from './actions/whistle';
import { AudioEngine } from './audio/audio';
import { PhysicsWorld } from './physics/world';
import { loadStage } from './stage/loader';
import { SPEED_LABELS } from './train/params';
import { Train } from './train/train';
import { createUi } from './ui';
import { createSceneView } from './view';

const app = document.getElementById('app') as HTMLElement;
const viewEl = document.getElementById('view') as HTMLElement;
const uiEl = document.getElementById('ui') as HTMLElement;

const MAX_DT = 0.1;

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const stageId = params.get('stage') ?? '0-0';

  const [stage, physics] = await Promise.all([loadStage(stageId), PhysicsWorld.create()]);
  const train = new Train(stage.network, stage.file.junctions, stage.file.start);
  const whistle = new Whistle();
  const audio = new AudioEngine();

  const view = createSceneView(params);
  await view.init(viewEl, stage, stage.network);

  const ui = createUi(uiEl, {
    speedLabels: SPEED_LABELS,
    onNotch: (n) => train.setNotch(n),
    onWhistle: () => {
      audio.unlock();
      if (whistle.trigger()) audio.playWhistle();
    },
    onJunction: (side) => train.chooseJunction(side),
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  const startPose = train.getPose();
  physics.addTrain(startPose.position, startPose.quaternion);
  for (const actor of stage.actors) physics.addSensor(actor.id, actor.position, actor.quaternion, actor.size);

  train.events.on('junctionApproach', (e) => ui.junction.show(e));
  train.events.on('junctionLocked', () => ui.junction.hide());
  train.events.on('junctionPassed', () => ui.junction.hide());
  train.events.on('railChanged', ({ railId }) => console.info(`rail: now on ${railId}`));
  train.events.on('endOfLine', () => ui.overlays.showEnd());

  const resize = (): void => view.resize(viewEl.clientWidth, viewEl.clientHeight, window.devicePixelRatio);
  window.addEventListener('resize', resize);
  resize();

  const debug = import.meta.env.DEV
    ? (await import('./debug')).installDebug({ train, whistle, audio, view, network: stage.network, uiRoot: uiEl })
    : null;

  document.title = stage.file.title;
  app.dataset.stage = stage.file.id;
  app.dataset.ready = '1';

  let last = performance.now();
  let simTime = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fps = 0;

  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    simTime += dt;

    train.update(dt);
    whistle.update(dt);
    ui.whistle.setProgress(whistle.progress);

    const pose = train.getPose();
    physics.setTrainPose(pose.position, pose.quaternion);
    for (const ev of physics.step(dt)) console.log(`sensor: ${ev.id} ${ev.entered ? 'enter' : 'exit'}`);

    view.update(dt, pose);
    ui.hud.setSpeedWord(SPEED_LABELS[train.state.notch]);

    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
      app.dataset.fps = fps.toFixed(0);
    }
    // Test hooks (read by the Playwright smoke test).
    app.dataset.time = simTime.toFixed(2);
    app.dataset.s = train.state.s.toFixed(1);
    app.dataset.rail = train.state.railId;
    app.dataset.notch = String(train.state.notch);
    debug?.update(fps);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
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
