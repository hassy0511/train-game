import './ui/styles.css';
import { Whistle } from './actions/whistle';
import { AudioEngine } from './audio/audio';
import { GAME_TITLE, PARTNER_NAME } from './config';
import { StageEventBus } from './core/stage-events';
import { addToProgress, loadProgress } from './core/progress';
import { ABILITY_NAMES, MissionRunner, type MissionPorts } from './mission/runner';
import { PhysicsWorld } from './physics/world';
import { listStageIds, loadAllRecords, loadStage, peekStage } from './stage/loader';
import type { AbilityId, Vec3 } from './stage/types';
import {
  JUMP,
  LEVER_NOTCHES,
  LIGHT,
  RESOLUTION_MIN_FPS,
  RESOLUTION_SLOW_SECONDS,
  RESOLUTION_STEPS,
  ROCK_ROLL,
  ROCK_SPLASH_SECONDS,
  SLOPE,
  SPEED_LABELS,
  STOP_NOTCH,
  VOLCANO_PUFF,
} from './train/params';
import { Train } from './train/train';
import { createUi } from './ui';
import { createBubbles } from './ui/bubble';
import { createCaption } from './ui/caption';
import { createCargoStrip } from './ui/cargo-strip';
import { showCard } from './ui/cards';
import { createDoorButton } from './ui/door-button';
import { createFade } from './ui/fade';
import { param, zoneAt } from './gimmick/zones';
import { BoughSystem } from './gimmick/bough';
import { showTitle } from './ui/title';
import { createToast } from './ui/toast';
import { CAMERA_LABELS, CAMERA_MODES, createSceneView, type CameraFx, type CameraMode } from './view';
import { createCameraButton } from './ui/camera-button';
import { createStopGauge } from './ui/stop-gauge';
import { createJumpButton, createLightButton, createRocketButton } from './ui/ability-buttons';
import { createCountdownPanel } from './ui/countdown-panel';
import { RocketSystem } from './gimmick/rocket';
import { SlopeSystem } from './gimmick/slope';
import { showZukan } from './ui/zukan';
import { loadSettings, saveSettings, VOLUME_GAIN, type Settings } from './core/settings';
import { showSettings } from './ui/settings';
import { createPause } from './ui/pause';
import { linkKey, showMap, type MapChoice, type MapIsland } from './ui/map';
import world from './world/world.json';
import type { WorldFile } from './world/types';

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

/**
 * The world map, from the stages and the save. The rail to a newly opened island grows in once (the links
 * shown are saved right away, so leaving early does not replay it).
 */
async function openMap(root: HTMLElement, options: { next?: string; closeLabel?: string }): Promise<MapChoice> {
  const file = world as unknown as WorldFile;
  const progress = loadProgress();
  const islands: MapIsland[] = [];
  for (const island of file.islands) {
    const stage = await peekStage(island.id);
    if (!stage) {
      islands.push({ id: island.id, title: null, unlocked: false, cleared: false, recordsFound: 0, recordsTotal: 0, needsLater: false });
      continue;
    }
    const missing = stage.records.filter((r) => !progress.records.includes(r.id));
    islands.push({
      id: island.id,
      title: stage.title,
      unlocked: stage.unlock.requires.every((r) => progress.cleared.includes(r)),
      cleared: progress.cleared.includes(island.id),
      recordsFound: stage.records.length - missing.length,
      recordsTotal: stage.records.length,
      needsLater: missing.some((r) => r.requires !== null && !progress.abilities.includes(r.requires)),
    });
  }
  const laid = file.links.filter(([from]) => progress.cleared.includes(from)).map(([from, to]) => linkKey(from, to));
  const fresh = laid.filter((key) => !progress.mapLinks.includes(key));
  addToProgress('mapLinks', fresh);
  return showMap(root, file, { islands, laid, fresh, ...options });
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
  // The hidden test course has every button, so the jump, the light and the rocket can be tried there.
  const abilities = new Set<AbilityId>(
    hasMissions ? [...loadProgress().abilities, ...(await inheritedAbilities(stageId))] : ['whistle', 'jump', 'light', 'rocket'],
  );
  const train = new Train(stage.network, stage.file.junctions, stage.file.start);
  // 2-3: slopes and the rocket also work on the test course (no mission runner there).
  const slopes = new SlopeSystem(stage.file.gimmicks, train);
  const rocket = new RocketSystem(stage.file.gimmicks, train, slopes);
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
  // Settings from the title's gear: sound volume, calmer camera, left-handed layout.
  let settings: Settings = loadSettings();
  const applySettings = (): void => {
    audio.setSoundVolume(VOLUME_GAIN[settings.sound]);
    audio.setMusicVolume(VOLUME_GAIN[settings.music]);
    app.classList.toggle('is-left-handed', settings.leftHanded);
    app.dataset.calm = settings.calm ? '1' : '0';
    view.setCalm(settings.calm);
  };
  /** Screen shake and dips are dropped with "がめんの ゆれ: へらす". */
  const shakeScale = (): number => (settings.calm ? 0 : 1);
  applySettings();
  let paused = false;
  let runner: MissionRunner | null = null;
  // A following butterfly rings a tiny bell every 1.5 s (on the game clock, so a pause stops it too).
  const butterfliesFollowing = new Set<number>();
  let butterflyBellAt = 0;
  // 2-3: the volcano's smoke rings (only on a stage with a "volcano" prop).
  const hasVolcano = stage.file.props.some((p) => p.model === 'volcano');
  let volcanoPuffIn: number = VOLCANO_PUFF.first;
  let volcanoPuffs = 0;
  let hurrying = false;
  const cutsceneActors = new Set<string>();
  const rockStates = new Map<string, string>();

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
      // With a grasshopper on the roof the jump goes "びよーん".
      if (train.jumpBoost) audio.playHopperJump();
      else audio.playJump();
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
  const rocketButton = createRocketButton(actionButtons, () => {
    audio.unlock();
    const result = rocket.press();
    if (!result.ok) runner?.onRocketRefused(result);
  });
  const showAbility = (ability: AbilityId): void => {
    abilities.add(ability);
    if (ability === 'jump') jumpButton.show();
    if (ability === 'light') lightButton.show();
    if (ability === 'rocket') {
      rocket.enabled = true;
      rocketButton.show();
      app.dataset.hasRocket = '1';
    }
    events.post({ type: 'ability', id: ability });
  };
  for (const ability of abilities) showAbility(ability);
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  const bubbles = createBubbles(uiEl, PARTNER_NAME);
  const gauge = createStopGauge(uiEl);
  const caption = createCaption(uiEl);
  const cargo = createCargoStrip(uiEl);
  const toast = createToast(uiEl);
  /** What a fall fades to: black, a white cloud (1-3) or a green leaf (2-1). */
  const FALL_COLORS = { dark: '#000000', cloud: '#ffffff', leaf: '#d6efb4' } as const;
  const fade = createFade(uiEl, FALL_COLORS[stage.file.environment.fall ?? 'dark']);
  const doorButton = createDoorButton(actionButtons);
  const countdownPanel = createCountdownPanel(uiEl);
  // Speed lines at the screen edges while the rocket burns (CSS, shown by #app[data-burn="1"]).
  const speedLines = document.createElement('div');
  speedLines.className = 'speed-lines';
  speedLines.innerHTML = '<span></span>'.repeat(8);
  uiEl.appendChild(speedLines);

  // Camera: the player picks a mode; the game may override it for a moment (doors, cutscenes).
  let userCamera: CameraMode = 'cab';
  let cameraOverride: CameraMode | null = null;
  // Stage camera zones (gimmicks "camera"): e.g. the outside view while the train rides a loop upside down.
  let zoneCamera: CameraMode | null = null;
  // v1.7: a cutscene's camera standing still (the ending's view from the sea).
  let fixedCamera: { at: Vec3; lookAt: Vec3 } | null = null;
  const applyCamera = (snap = false): void => {
    const mode = cameraOverride ?? zoneCamera ?? userCamera;
    view.setCamera(mode, snap);
    view.setFixedCamera(fixedCamera);
    app.dataset.camera = fixedCamera ? 'fixed' : mode;
    cameraButton.setMode(mode);
  };
  // In the top corner beside the pause button (PHASE7 §1), for every stage.
  const cameraButton = createCameraButton(
    uiEl,
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
        rocket.refill();
        ui.lever.setNotch(STOP_NOTCH);
        await fade(false, 0.4);
      })();
    }
  });
  // 2-3: the rocket fires and stops ("ぷしゅっ" when cut short in a quiet place or by a sudden stop).
  train.events.on('rocketStarted', () => {
    audio.playRocket();
    events.post({ type: 'rocket', state: 'burn' });
  });
  train.events.on('rocketEnded', ({ cut }) => {
    if (cut) audio.playPuff();
    events.post({ type: 'rocket', state: cut ? 'puff' : 'end' });
  });
  // 2-3: stopped on an uphill: "ずるずる〜". The runner makes it a fail; the test course just puts the train back.
  train.events.on('slipped', ({ railId, s }) => {
    audio.playSlip();
    events.post({ type: 'slip' });
    if (hasMissions) return;
    const target = slopes.current?.rewind ?? { railId, at: s - SLOPE.rewindBefore };
    void (async () => {
      await waitSeconds(SLOPE.slipSeconds);
      await fade(true, 0.4);
      train.rewindTo(target.at, target.railId);
      slopes.reset();
      rocket.reset();
      rocket.refill();
      ui.lever.setNotch(STOP_NOTCH);
      events.post({ type: 'rewind' });
      await fade(false, 0.4);
    })();
  });

  train.events.on('hardBrake', () => {
    fx.dip = Math.max(fx.dip, 0.5 * shakeScale());
    audio.playSqueal();
    if (hasMissions) void bubbles.say('わわっ！');
  });

  // Springy boughs (2-1): they bend under the train and throw it at the tip.
  const boughs = new BoughSystem(
    stage.file.gimmicks,
    train,
    (index, sag) => view.onStageEvent({ type: 'bough', index, sag }),
    () => {
      audio.playJump();
      events.post({ type: 'jump' });
    },
  );
  events.on('event', (e) => {
    if (e.type === 'rewind') boughs.reset();
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

  // Render resolution: the device's pixel ratio, capped by the current step (lowered on a slow device).
  let resolutionStep = 0;
  let slowSeconds = 0;
  const pixelRatio = (): number => Math.min(window.devicePixelRatio, RESOLUTION_STEPS[resolutionStep]);
  const resize = (): void => {
    view.resize(viewEl.clientWidth, viewEl.clientHeight, pixelRatio());
    app.dataset.pixelRatio = String(pixelRatio());
  };
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
  // The heaviest frame seen (draw calls, triangles), for the smoke tests' budget log (TECH_SPEC §6).
  let drawsMax = 0;
  let trisMax = 0;

  let frameErrors = 0;
  const frame = (now: number): void => {
    // Schedule first: an error in one frame must never stop the game for good (it would look frozen).
    requestAnimationFrame(frame);
    try {
      tick(now);
    } catch (err) {
      frameErrors += 1;
      app.dataset.frameErrors = String(frameErrors);
      if (frameErrors <= 5) console.error('frame error', err);
    }
  };
  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    app.dataset.paused = paused ? '1' : '0';
    app.dataset.music = audio.musicId ?? '';
    if (paused) {
      // Game time stands still; keep drawing so a resize or the returning view stay right.
      view.update(0, train.getPose(), fx);
      return;
    }
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
    // 2-3: the slope under the train front, and the rocket resting in quiet places (before the train moves).
    slopes.update();
    rocket.update();

    train.update(dt);
    boughs.update(dt);
    whistle.update(dt);
    ui.whistle.setProgress(whistle.progress);
    jumpButton.set(train.jumpProgress, train.jumpWouldClear || (runner?.jumpHint ?? false), train.state.speed < JUMP.minSpeed);
    runner?.update(dt);
    // 2-3: the volcano's everyday smoke ring, more often while a countdown runs.
    if (hasVolcano) {
      volcanoPuffIn -= dt;
      if (volcanoPuffIn <= 0) {
        volcanoPuffIn = hurrying ? VOLCANO_PUFF.hurry : VOLCANO_PUFF.every;
        volcanoPuffs += 1;
        app.dataset.volcanoPuffs = String(volcanoPuffs);
        events.post({ type: 'volcano:puff' });
      }
    }
    if (butterfliesFollowing.size > 0 && simTime >= butterflyBellAt) {
      audio.playButterfly();
      butterflyBellAt = simTime + 1.5;
    }
    if (runner) {
      lightButton.setGlow(runner.lightHint);
      jumpButton.setHopper(runner.hopperId !== '');
      const hint = runner.leverHintSpeed;
      // The notch the partner names (ゆっくり): judged on the plain notch speeds, so the light does not change it.
      ui.lever.setHint(hint === null ? null : (fastestNotchUnder(hint, 1) ?? fastestNotchUnder(hint, train.speedScale)));
    }

    const pose = train.getPose();
    physics.setTrainPose(pose.position, pose.quaternion);
    for (const ev of physics.step(dt)) console.log(`sensor: ${ev.id} ${ev.entered ? 'enter' : 'exit'}`);

    fx.dip = Math.max(0, fx.dip - dt * 1.2);
    fx.shake = Math.max(0, fx.shake - dt * 2.5);
    view.update(dt, pose, fx);
    // 2-3: the lever does nothing while the rocket burns or on a slide: the knob and the speed word say so.
    ui.hud.setSpeedWord(train.rocketBurning ? 'ロケット！' : train.onSlide ? 'つるつる〜' : SPEED_LABELS[train.state.notch]);
    ui.lever.setMark(train.rocketBurning ? 'rocket' : train.onSlide ? 'slide' : null);
    const why = rocket.why;
    rocketButton.set({
      pips: rocket.pips,
      burn: train.rocketRemaining,
      glow: rocket.glow && (runner === null || runner.phase === 'driving'),
      idle: rocket.idle,
      why,
      mark: rocket.icon || (why === 'slide' || why === 'station' ? why : ''),
    });
    const timer = runner?.timer ?? null;
    countdownPanel.set(timer);
    // Every frame, so the budget check sees the heaviest one (one render per frame; cheap to read).
    const stats = view.getStats();
    if (stats) {
      drawsMax = Math.max(drawsMax, stats.drawCalls);
      trisMax = Math.max(trisMax, stats.triangles);
    }

    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      fps = fpsFrames / fpsAccum;
      // Too slow for RESOLUTION_SLOW_SECONDS in a row: draw fewer pixels (one step at a time).
      slowSeconds = fps < RESOLUTION_MIN_FPS && !document.hidden ? slowSeconds + fpsAccum : 0;
      if (slowSeconds >= RESOLUTION_SLOW_SECONDS && resolutionStep < RESOLUTION_STEPS.length - 1) {
        const before = pixelRatio();
        resolutionStep += 1;
        slowSeconds = 0;
        if (pixelRatio() < before) {
          resize();
          console.info(`render resolution ${before} → ${pixelRatio()} (fps ${fps.toFixed(0)})`);
        }
      }
      fpsAccum = 0;
      fpsFrames = 0;
      app.dataset.fps = fps.toFixed(0);
      if (stats) {
        app.dataset.draws = String(stats.drawCalls);
        app.dataset.drawsMax = String(drawsMax);
        app.dataset.trisMax = String(trisMax);
      }
    }
    app.dataset.time = simTime.toFixed(2);
    app.dataset.s = train.state.s.toFixed(1);
    app.dataset.rail = train.state.railId;
    app.dataset.notch = String(train.state.notch);
    app.dataset.air = train.airborne ? '1' : '0';
    app.dataset.speed = train.state.speed.toFixed(1);
    app.dataset.rocketPips = String(rocket.pips);
    app.dataset.burn = train.rocketBurning ? '1' : '0';
    app.dataset.slope = slopes.kind;
    app.dataset.slip = train.isSlipping ? '1' : '0';
    app.dataset.timer = timer ? String(timer.seconds) : '';
    app.dataset.timerState = timer?.state ?? '';
    if (runner) {
      app.dataset.phase = runner.phase;
      app.dataset.mission = String(runner.missionIndex);
      app.dataset.step = String(runner.stepIndex);
      app.dataset.neck = runner.bigDinoNeck;
      app.dataset.hopper = runner.hopperId;
      app.dataset.bridges = runner.bridgeFlags;
      app.dataset.butterfly = runner.butterflyState;
      app.dataset.fragile = runner.fragileStatus;
    }
    debug?.update(fps);
  };
  requestAnimationFrame(frame);

  if (!hasMissions) return; // Test course: just drive.

  const progress = loadProgress();
  const next = await nextStage(progress.cleared);
  if (!params.has('go')) {
    // The title's music box (it starts with the first tap: iPad keeps sound locked until then).
    audio.playMusic('title');
    const choice = await showTitle(uiEl, GAME_TITLE, {
      continueLabel: next && next.id !== stageId ? `つづきから（${next.title}）` : undefined,
      onMap: () => {
        void openMap(uiEl, { next: next?.id, closeLabel: 'もどる' }).then((choice) => {
          if (choice.kind === 'stage') goToStage(choice.id);
        });
      },
      onSettings: () => {
        showSettings(uiEl, settings, (changed) => {
          settings = changed;
          saveSettings(settings);
          applySettings();
        });
      },
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
  audio.playMusic(stage.file.environment.bgm);

  /** v1.7: the seabirds (cats that look like seabirds) flap off with "ぱたぱた" instead of walking aside. */
  const seabirds = new Set(
    stage.file.actors.filter((a) => a.type === 'cat' && (a.params as { look?: string } | undefined)?.look === 'seabird').map((a) => a.id),
  );
  let lastFailReason: string | null = null;
  const ports: MissionPorts = {
    say: (text, who, name) => bubbles.say(text, who, name),
    sayAsync: (text, who) => void bubbles.say(text, who),
    hush: () => bubbles.clear(),
    sayNow: (text) => {
      bubbles.clear();
      void bubbles.say(text);
    },
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
      fx.dip = Math.max(fx.dip, dip * shakeScale());
      fx.shake = Math.max(fx.shake, shake * shakeScale());
      // A bumped rock has its own rounder "ぽよん" (played with its bonk).
      if (lastFailReason !== 'rock') audio.playBoing();
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
      audio.playRecord();
    },
    fanfare: () => audio.playFanfare(),
    music: (id) => audio.playMusic(id ?? stage.file.environment.bgm),
    fixedCamera: (at, lookAt) => {
      const next = at && lookAt ? { at, lookAt } : null;
      // Nothing to do when no fixed camera was set (every cutscene end): the eased return must not snap.
      if (!next && !fixedCamera) return;
      fixedCamera = next;
      applyCamera(true);
    },
    sneeze: async () => {
      events.post({ type: 'sneeze' });
      await caption('はっくしょーん！', 2.5, true);
    },
  };
  events.on('event', (e) => {
    if (e.type === 'door') audio.playDoor(e.open);
    if (e.type === 'hopper' && e.state === 'board') audio.playHopperBoard();
    if (e.type === 'bridge' && e.open) audio.playBloom();
    if (e.type === 'fragile' && e.state === 'shake') audio.playSilkShake();
    if (e.type === 'butterfly') {
      if (e.state === 'follow') butterfliesFollowing.add(e.index);
      else butterfliesFollowing.delete(e.index);
    }
    if (e.type === 'sneeze') audio.playSneeze();
    if (e.type === 'volcano:puff') audio.playVolcanoPuff();
    if (e.type === 'countdown') {
      const was = hurrying;
      hurrying = e.state === 'run' || e.state === 'low';
      if (hurrying && !was) volcanoPuffIn = Math.min(volcanoPuffIn, VOLCANO_PUFF.hurry);
    }
    // Test hooks: the stretch a cutscene cut, and the cutscene figures on screen.
    if (e.type === 'rail:cut') app.dataset.railCut = `${e.railId}:${e.from}-${e.to}`;
    if (e.type === 'actor:spawn') cutsceneActors.add(e.id);
    if (e.type === 'actor:remove') cutsceneActors.delete(e.id);
    if (e.type === 'actor:spawn' || e.type === 'actor:remove') app.dataset.cutsceneActors = [...cutsceneActors].join(',');
    if (e.type === 'rock') {
      rockStates.set(e.id, e.state);
      app.dataset.rocks = [...rockStates].map(([id, state]) => `${id}:${state}`).join(',');
    }
    // v1.7 (2-3): rocks, seabirds and the falling bridge.
    if (e.type === 'fail') lastFailReason = e.reason;
    if (e.type === 'rock') {
      if (e.state === 'wobble') audio.playRockWobble();
      if (e.state === 'roll') {
        const seconds = e.seconds ?? ROCK_ROLL.crossSeconds;
        audio.playRockRoll(seconds);
        // It rolls on off the far side into the sea.
        audio.playSplash(seconds + ROCK_SPLASH_SECONDS);
      }
      if (e.state === 'bonk') {
        audio.playRockBonk();
        audio.playSplash(ROCK_SPLASH_SECONDS);
      }
    }
    if (e.type === 'actor:state' && (e.state === 'awake' || e.state === 'flee') && seabirds.has(e.id)) audio.playFlap();
    if (e.type === 'rail:cut' && e.style === 'fall') audio.playBridgeFall();
  });

  // "||" in the corner: stop the game, go on, or leave for the map.
  const pause = createPause(uiEl, {
    onPause: (p) => {
      paused = p;
      audio.setMusicPaused(p);
    },
    onMap: async () => {
      const choice = await openMap(uiEl, { next: next?.id, closeLabel: 'もどる' });
      if (choice.kind === 'stage') goToStage(choice.id);
    },
  });
  pause.show();

  runner = new MissionRunner(stage, train, whistle, events, ports, { rocket, slopes });
  runner.knowAbilities(abilities);
  runner.setLight(lightOn);
  await runner.run();
  pause.hide();
  addToProgress('cleared', [stage.file.id]);
  addToProgress('abilities', stage.file.unlocks);
  // Back to the map: the rail to the next island grows in, and the child taps it to go on.
  const after = await nextStage(loadProgress().cleared, stage.file.id);
  audio.playMusic('title');
  const choice = await openMap(uiEl, { next: after?.id, closeLabel: 'タイトルへ' });
  if (choice.kind === 'stage') goToStage(choice.id);
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

/** The fastest notch whose speed (scaled by the light) is at most `limit` m/s: the lever's glowing hint. */
function fastestNotchUnder(limit: number, scale: number): number | null {
  let best: number | null = null;
  LEVER_NOTCHES.forEach((n, i) => {
    if (n.speed > 0 && n.speed * scale <= limit + 1e-6) best = i;
  });
  return best;
}
