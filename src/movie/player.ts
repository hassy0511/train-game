import { AudioEngine } from '../audio/audio';
import { PARTNER_NAME } from '../config';
import { StageEventBus } from '../core/stage-events';
import { loadSettings, VOLUME_GAIN } from '../core/settings';
import { CutsceneSkip, runCutscene, type CutscenePorts } from '../cutscene/runner';
import { TrainWatch } from '../cutscene/train-watch';
import { loadMovie } from '../stage/loader';
import type { CutsceneStep, ShotDef } from '../stage/types';
import { RESOLUTION_MIN_FPS, RESOLUTION_SLOW_SECONDS, RESOLUTION_STEPS } from '../train/params';
import { Train } from '../train/train';
import { createBubbles } from '../ui/bubble';
import { createCaption } from '../ui/caption';
import { showCard } from '../ui/cards';
import { createFade } from '../ui/fade';
import { createLetterbox, LETTERBOX_PART } from '../ui/letterbox';
import { createSkipButton } from '../ui/skip-button';
import { createSceneView, type CameraFx } from '../view';

/*
 * v1.12 (えんしゅつ): the movie player (docs/STAGE_SCHEMA.md §25). A movie is a stage file with no missions in
 * src/movies/ (`movie.play` names the cutscene, `movie.card` the card after it). The player builds its scene like a
 * stage (the same view, train and figures), hides every control, puts the letterbox on and plays the cutscene; the
 * train runs by itself (`drive`), the camera frames shots (`shot`), the figures move (`act`), the lines are the usual
 * speech bubbles. "▶▶" (when allowed) skips to the last shot and the card.
 *
 * Opened as `?movie=<id>` (src/main.ts; behind the かくにん lock, or once the save has opened it). v1.11 (PR11b): the game
 * sends the child here after 6-2's clear (the first time; the map follows) and from the title's 「もういちど みる」.
 */

export interface MovieOptions {
  /** "▶▶" shows (the movie was seen before, or the owner's check). */
  skippable: boolean;
  /** Wait for a tap on 「みる」 first (a page opened by its address: iPad keeps the sound locked until a tap). */
  startButton: boolean;
  /**
   * After the card's button (the drawing stops: what comes next is DOM). `audio`: the movie's sound, unlocked by the
   * start tap, for a map opened on top (v1.11, PR11b).
   */
  onDone(audio: AudioEngine): void;
}

const MAX_DT = 0.1;

/** Plays movie `id` in `app` (its view and UI layers); resolves once the movie is under way. */
export async function playMovie(id: string, app: HTMLElement, viewEl: HTMLElement, uiEl: HTMLElement, options: MovieOptions): Promise<void> {
  const stage = await loadMovie(id);
  const movie = stage.file.movie!;
  const steps = stage.file.cutscenes?.[movie.play] ?? [];
  const groundY = stage.file.environment.ground?.y ?? null;
  const train = new Train(stage.network, stage.file.junctions, stage.file.start, { waters: stage.file.environment.water ?? [], floaters: stage.file.floaters ?? [] });
  train.lockInput('movie');
  const events = new StageEventBus();
  const view = createSceneView(new URLSearchParams(location.search));
  await view.init(viewEl, stage, stage.network);
  events.on('event', (e) => view.onStageEvent(e));
  const settings = loadSettings();
  const audio = new AudioEngine();
  audio.setSoundVolume(VOLUME_GAIN[settings.sound]);
  audio.setMusicVolume(VOLUME_GAIN[settings.music]);
  app.classList.toggle('is-left-handed', settings.leftHanded);
  app.dataset.calm = settings.calm ? '1' : '0';
  view.setCalm(settings.calm);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  view.setReducedMotion?.(reduced);
  app.dataset.reducedMotion = reduced ? '1' : '0';
  app.classList.add('is-movie');
  app.dataset.movie = id;
  app.dataset.movieState = 'loading';
  app.dataset.beats = '';
  app.dataset.shots = '0';
  app.dataset.acts = '0';

  // The movie's own screen: bubbles, captions, the fade (black at first), the letterbox, "▶▶".
  const bubbles = createBubbles(uiEl, PARTNER_NAME);
  const caption = createCaption(uiEl);
  const fade = createFade(uiEl);
  void fade(true, 0);
  const letterbox = createLetterbox(uiEl, app);
  let skip: CutsceneSkip | null = null;
  const skipButton = options.skippable ? createSkipButton(uiEl, () => skip?.request()) : null;

  // Game time, its waits and the train's.
  let simTime = 0;
  const waiters: { at: number; resolve: () => void }[] = [];
  const waitSeconds = (seconds: number): Promise<void> => new Promise((resolve) => waiters.push({ at: simTime + seconds, resolve }));
  const trainWatch = new TrainWatch();
  const fx: CameraFx = { dip: 0, shake: 0 };
  let shots = 0;
  let acts = 0;
  let lastShot: ShotDef | null = null;
  const beats: string[] = [];
  events.on('event', (e) => {
    if (e.type === 'actor:act') app.dataset.acts = String(++acts);
  });

  // Draw: as fine as the device keeps up with (a step down after a few slow seconds, as in the game).
  let resolutionStep = 0;
  let slowSeconds = 0;
  const pixelRatio = (): number => Math.min(window.devicePixelRatio, RESOLUTION_STEPS[resolutionStep]);
  const resize = (): void => view.resize(viewEl.clientWidth, viewEl.clientHeight, pixelRatio());
  window.addEventListener('resize', resize);
  resize();
  let drawsMax = 0;
  let trisMax = 0;
  let frameErrors = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let last = performance.now();
  // Dev only: `&fast=<n>` runs the clock n times faster until the beat `&until=<beat>` (looking at one shot quickly).
  const devParams = new URLSearchParams(location.search);
  let fast = import.meta.env.DEV ? Number(devParams.get('fast') ?? 1) || 1 : 1;
  const until = devParams.get('until');
  const tick = (now: number): void => {
    if (fast !== 1 && until !== null && beats.includes(until)) fast = 1;
    const dt = Math.min((now - last) / 1000, MAX_DT) * fast;
    last = now;
    simTime += dt;
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (simTime >= waiters[i].at) waiters.splice(i, 1)[0].resolve();
    }
    trainWatch.update(train, simTime);
    train.update(dt);
    view.update(dt, train.getPose(), fx);
    audio.updateRun(dt, {
      speed: Math.abs(train.state.speed),
      target: train.targetSpeed,
      braking: train.targetSpeed < Math.abs(train.state.speed) - 0.3,
      airborne: false,
      surface: 'rail',
      quiet: false,
    });
    const stats = view.getStats();
    if (stats) {
      drawsMax = Math.max(drawsMax, stats.drawCalls);
      trisMax = Math.max(trisMax, stats.triangles);
    }
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      const fps = fpsFrames / fpsAccum;
      slowSeconds = fps < RESOLUTION_MIN_FPS && !document.hidden ? slowSeconds + fpsAccum : 0;
      if (slowSeconds >= RESOLUTION_SLOW_SECONDS && resolutionStep < RESOLUTION_STEPS.length - 1) {
        resolutionStep += 1;
        slowSeconds = 0;
        resize();
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
    skipButton?.setVisible(skip !== null && !skip.requested && uiEl.querySelector('#card') === null);
  };
  let drawing = true;
  const frame = (now: number): void => {
    if (!drawing) return;
    requestAnimationFrame(frame);
    try {
      tick(now);
    } catch (err) {
      frameErrors += 1;
      app.dataset.frameErrors = String(frameErrors);
      if (frameErrors <= 5) console.error('frame error', err);
    }
  };
  requestAnimationFrame(frame);

  const ports: CutscenePorts = {
    say: (text, who, name, icon) => bubbles.say(text, who, name, icon),
    card: (title, button, icon, mirror, notes) => {
      audio.playCard();
      return showCard(uiEl, title, button, icon, 0, undefined, { mirror, notes });
    },
    caption: (text, seconds) => caption(text, seconds),
    wait: waitSeconds,
    autoCamera: (mode) => view.setCamera(mode ?? 'chase'),
    // A movie teaches nothing.
    unlock: async () => undefined,
    learn: () => undefined,
    fixedCamera: (at, lookAt, reach) => view.setFixedCamera(at && lookAt ? { at, lookAt, reach } : null),
    sneeze: async () => {
      events.post({ type: 'sneeze' });
      await waitSeconds(2.5);
    },
    pop: async (figure) => {
      events.post({ type: 'pop', id: figure });
      audio.playPop();
      await waitSeconds(0.6);
    },
    // Nothing to press in a movie.
    press: async () => undefined,
    door: () => undefined,
    festival: async () => {
      events.post({ type: 'festival' });
      await waitSeconds(2.5);
    },
    interrupt: () => {
      bubbles.clear();
      caption.clear();
    },
    depart: (to, seconds) => train.depart(to, seconds),
    shot: (def) => {
      view.setShot?.(def);
      if (def) {
        lastShot = def;
        app.dataset.shots = String(++shots);
        app.dataset.shot = `${def.shot}:${Array.isArray(def.target) ? 'point' : def.target}`;
      }
      app.dataset.camera = def ? 'shot' : 'chase';
      return def?.seconds && !reduced ? waitSeconds(def.seconds) : Promise.resolve();
    },
    letterbox: (on) => {
      letterbox.set(on);
      view.setLetterbox?.(on ? LETTERBOX_PART : 0);
    },
    fade: (toBlack, seconds) => fade(toBlack, seconds),
    drive: (order) => train.setAutoDrive(order),
    trainAt: (at, max) => trainWatch.wait(train, at, max, simTime),
    beat: (name) => {
      beats.push(name);
      app.dataset.beat = name;
      app.dataset.beats = beats.join(',');
    },
  };

  view.setCamera('chase', true);
  // Dev only: the same handles as the game's debug tools (scripts/probe-budget.mjs measures the movie through them).
  if (import.meta.env.DEV) Object.assign(window, { __debugView: view, __debugTrain: train });
  app.dataset.ready = '1';
  document.getElementById('loading')?.remove();

  if (options.startButton) {
    app.dataset.movieState = 'start';
    await startTap(uiEl, stage.file.title);
  }
  audio.unlock();
  audio.playMusic(stage.file.environment.bgm);
  app.dataset.movieState = 'playing';
  skip = new CutsceneSkip();
  await runCutscene(steps, stage.network, groundY, events, ports, skip);
  const skipped = skip.requested;
  skip = null;
  trainWatch.clear();
  if (skipped) {
    // "▶▶": the last shot (as it ends), the train standing where the movie leaves it, then the card.
    app.dataset.movieState = 'skipped';
    await fade(true, 0.35);
    bubbles.clear();
    const ending = lastShotOf(steps);
    if (ending) {
      view.setShot?.({ ...ending, seconds: 0, push: 0, orbit: 0 });
      app.dataset.shot = `${ending.shot}:${Array.isArray(ending.target) ? 'point' : ending.target}`;
    }
    letterbox.set(true);
    view.setLetterbox?.(LETTERBOX_PART);
    await waitSeconds(0.2);
    await fade(false, 0.35);
  } else if (lastShot === null) {
    await fade(false, 0.5);
  }
  app.dataset.movieState = 'card';
  audio.playFanfare();
  await showCard(uiEl, movie.card.title, movie.card.button, undefined, skipped ? 0.8 : 0);
  app.dataset.movieState = 'done';
  drawing = false;
  options.onDone(audio);
}

/** The start screen of a movie opened by its address: its title and 「みる」 (the tap unlocks the sound). */
function startTap(root: HTMLElement, title: string): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'movie-start';
    el.className = 'movie-start';
    const h = document.createElement('h1');
    h.textContent = title;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'movie-play';
    b.textContent = '▶ みる';
    b.addEventListener('click', () => {
      el.remove();
      resolve();
    });
    el.append(h, b);
    root.appendChild(el);
  });
}

/** The cutscene's last shot (what a skip cuts to). */
function lastShotOf(steps: CutsceneStep[]): ShotDef | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if ('shot' in step) return step;
  }
  return null;
}
