import './ui/styles.css';
import { Whistle } from './actions/whistle';
import { AudioEngine } from './audio/audio';
import { GAME_TITLE, PARTNER_NAME } from './config';
import { StageEventBus } from './core/stage-events';
import { addToProgress, loadProgress } from './core/progress';
import { ABILITY_NAMES, MissionRunner, type MissionPorts } from './mission/runner';
import { PhysicsWorld } from './physics/world';
import { listStageIds, loadAllRecords, loadStage, peekStage } from './stage/loader';
import type { AbilityId } from './stage/types';
import { JUMP, LIGHT, SPEED_LABELS, STOP_NOTCH } from './train/params';
import { Train } from './train/train';
import { createUi } from './ui';
import { createBubbles } from './ui/bubble';
import { createCaption } from './ui/caption';
import { createCargoStrip } from './ui/cargo-strip';
import { showCard } from './ui/cards';
import { createDoorButton } from './ui/door-button';
import { createFade } from './ui/fade';
import { param, zoneAt } from './gimmick/zones';
import { showTitle } from './ui/title';
import { createToast } from './ui/toast';
import { CAMERA_LABELS, CAMERA_MODES, createSceneView, type CameraFx, type CameraMode } from './view';
import { createCameraButton } from './ui/camera-button';
import { createStopGauge } from './ui/stop-gauge';
import { createJumpButton, createLightButton } from './ui/ability-buttons';
import { showZukan } from './ui/zukan';

const app = document.getElementById('app') as HTMLElement;
const viewEl = document.getElementById('view') as HTMLElement;
const uiEl = document.getElementById('ui') as HTMLElement;

const MAX_DT = 0.1;

/** Abilities granted by the stages `id` requires (recursively): playing a later stage directly still works. */
async function inheritedAbilities(id: string, seen = new Set<string>()): Promise<AbilityId[]> {
  const stage = await peekStage(id);
  if (!stage || seen.has(id)) return [];
  seen.add(id);
  const out: AbilityId[] = [];
  for (const req of stage.unlock.requires) {
    const before = await peekStage(req);
    if (before) out.push(...before.unlocks, ...(await inheritedAbilities(req, seen)));
  }
  return out;
}

/**
 * The first playable stage not cleared yet whose required stages are all cleared. With `after`, only
 * stages after that one count (the stage to go on to after a clear).
 */
async function nextStage(cleared: string[], after?: string): Promise<{ id: string; title: string } | null> {
  for (const id of listStageIds()) {
    if (after !== undefined && id.localeCompare(after, undefined, { numeric: true }) <= 0) continue;
    const stage = await peekStage(id);
    if (!stage || cleared.includes(id) || id.startsWith('0-')) continue;
    if (stage.unlock.requires.every((r) => cleared.includes(r))) return { id: stage.id, title: stage.title };
  }
  return null;
}

/**
 * Production only: the service worker caches the game so it also starts without a connection (home-screen
 * app). Online it still loads the latest deploy first. Failure is harmless: the game simply needs the network.
 */
function registerOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err: unknown) => console.info('offline cache off:', err));
}

/** Opens a stage straight into play (no title). */
function goToStage(id: string): void {
  location.search = `?stage=${encodeURIComponent(id)}&go=1`;
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const stageId = params.get('stage') ?? '1-1';

  const [stage, physics] = await Promise.all([loadStage(stageId), PhysicsWorld.create()]);
  const hasMissions = stage.file.missions.length > 0;
  // The hidden test course has every button, so the jump and the light can be tried there.
  const abilities = new Set<AbilityId>(
    hasMissions ? [...loadProgress().abilities, ...(await inheritedAbilities(stageId))] : ['whistle', 'jump', 'light'],
  );
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
    initialNotch: STOP_NOTCH,
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
  const actionButtons = uiEl.querySelector('.action-buttons') as HTMLElement;
  const jumpButton = createJumpButton(actionButtons, () => {
    audio.unlock();
    const result = train.jump();
    if (result === 'ok') {
      audio.playJump();
      events.post({ type: 'jump' });
    } else runner?.onJumpRefused(result);
  });
  let lightOn = false;
  let lightReadyAt = 0;
  const lightButton = createLightButton(actionButtons, () => {
    // Toggle, with a short lockout so a double tap does not flicker it.
    if (simTime < lightReadyAt) return;
    lightReadyAt = simTime + LIGHT.cooldown;
    lightOn = !lightOn;
    audio.unlock();
    audio.playLight(lightOn);
    train.speedScale = lightOn ? LIGHT.speedScale : 1;
    lightButton.setOn(lightOn);
    runner?.setLight(lightOn);
    events.post({ type: 'light', on: lightOn });
  });
  const showAbility = (ability: AbilityId): void => {
    abilities.add(ability);
    if (ability === 'jump') jumpButton.show();
    if (ability === 'light') lightButton.show();
    events.post({ type: 'ability', id: ability });
  };
  for (const ability of abilities) showAbility(ability);
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  const bubbles = createBubbles(uiEl, PARTNER_NAME);
  const gauge = createStopGauge(uiEl);
  const caption = createCaption(uiEl);
  const cargo = createCargoStrip(uiEl);
  const toast = createToast(uiEl);
  const fade = createFade(uiEl, stage.file.environment.fall === 'cloud' ? '#ffffff' : '#000000');
  const doorButton = createDoorButton(actionButtons);

  // Camera: the player picks a mode; the game may override it for a moment (doors, cutscenes).
  let userCamera: CameraMode = 'cab';
  let cameraOverride: CameraMode | null = null;
  // Stage camera zones (gimmicks "camera"): e.g. the outside view while the train rides a loop upside down.
  let zoneCamera: CameraMode | null = null;
  const applyCamera = (snap = false): void => {
    const mode = cameraOverride ?? zoneCamera ?? userCamera;
    view.setCamera(mode, snap);
    app.dataset.camera = mode;
    cameraButton.setMode(mode);
  };
  const cameraButton = createCameraButton(
    actionButtons,
    CAMERA_MODES.map((mode) => ({ mode, label: CAMERA_LABELS[mode] })),
    (mode) => {
      userCamera = mode;
      cameraOverride = null;
      applyCamera();
    },
  );
  applyCamera(true);

  train.events.on('landed', () => audio.playLand());
  train.events.on('fell', () => {
    audio.playFall();
    if (!hasMissions) {
      // Test course: no runner to handle it; fade and put the train back before the gap.
      void (async () => {
        await fade(true, 0.4);
        train.rewindTo(Math.max(40, train.frontS - 80));
        ui.lever.setNotch(STOP_NOTCH);
        await fade(false, 0.4);
      })();
    }
  });

  train.events.on('hardBrake', () => {
    fx.dip = Math.max(fx.dip, 0.5);
    audio.playSqueal();
    if (hasMissions) void bubbles.say('わわっ！');
  });

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
  app.dataset.build = __BUILD_ID__;
  console.info(`build ${__BUILD_ID__}`);
  app.dataset.ready = '1';
  registerOffline();

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

    // Stage zones along the rail (front of the train): camera views and updrafts.
    const gimmicks = stage.file.gimmicks;
    const camZone = zoneAt(gimmicks, 'camera', train.state.railId, train.frontS);
    const nextCamera = camZone ? (camZone.params?.mode as CameraMode) : null;
    if (nextCamera !== zoneCamera) {
      zoneCamera = nextCamera;
      applyCamera();
    }
    const updraft = zoneAt(gimmicks, 'updraft', train.state.railId, train.frontS);
    train.boostSpeed = updraft ? param(updraft, 'speed', 28) : 0;
    app.dataset.updraft = updraft ? '1' : '0';

    train.update(dt);
    whistle.update(dt);
    ui.whistle.setProgress(whistle.progress);
    jumpButton.set(train.jumpProgress, train.jumpWouldClear, train.state.speed < JUMP.minSpeed);
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
    app.dataset.air = train.airborne ? '1' : '0';
    app.dataset.speed = train.state.speed.toFixed(1);
    if (runner) {
      app.dataset.phase = runner.phase;
      app.dataset.mission = String(runner.missionIndex);
      app.dataset.step = String(runner.stepIndex);
      app.dataset.neck = runner.bigDinoNeck;
    }
    debug?.update(fps);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (!hasMissions) return; // Test course: just drive.

  const progress = loadProgress();
  const next = await nextStage(progress.cleared);
  if (!params.has('go')) {
    const choice = await showTitle(uiEl, GAME_TITLE, {
      continueLabel: next && next.id !== stageId ? `つづきから（${next.title}）` : undefined,
      onZukan: () => {
        void loadAllRecords().then((all) => {
          const found = loadProgress().records;
          showZukan(
            uiEl,
            all.map(({ stageTitle, record }) => ({ stageTitle, record, found: found.includes(record.id) })),
          );
        });
      },
    });
    if (choice === 'continue' && next) {
      goToStage(next.id);
      return;
    }
  }
  audio.unlock();

  const ports: MissionPorts = {
    say: (text, who) => bubbles.say(text, who),
    sayAsync: (text, who) => void bubbles.say(text, who),
    card: (title, button, icon) => {
      audio.playCard();
      return showCard(uiEl, title, button, icon);
    },
    caption,
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
    resetLever: () => ui.lever.setNotch(STOP_NOTCH),
    gauge: (state) => gauge.set(state),
    autoCamera: (mode) => {
      cameraOverride = mode;
      applyCamera();
    },
    unlock: async (ability) => {
      showAbility(ability);
      audio.playCard();
      await showCard(uiEl, `${ABILITY_NAMES[ability] ?? ability}を\nおぼえた！`, 'やったね！', 'badge');
    },
    revealJunction: (side) => ui.junction.reveal(side),
    whistleHint: (on) => ui.whistle.setGlow(on),
    recordFound: (record) => {
      toast.show(`みつけた！\n${record.name}`, 'perfect');
      audio.playStop('perfect');
    },
  };
  events.on('event', (e) => {
    if (e.type === 'door') audio.playDoor(e.open);
  });

  runner = new MissionRunner(stage, train, whistle, events, ports);
  runner.knowAbilities(abilities);
  runner.setLight(lightOn);
  await runner.run();
  addToProgress('cleared', [stage.file.id]);
  addToProgress('abilities', stage.file.unlocks);
  const after = await nextStage(loadProgress().cleared, stage.file.id);
  if (after) goToStage(after.id);
  else location.href = location.pathname;
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
