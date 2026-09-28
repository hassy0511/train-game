import './ui/styles.css';
import { Whistle } from './actions/whistle';
import { AudioEngine } from './audio/audio';
import { GAME_TITLE, GAME_TITLE_LINES, PARTNER_NAME } from './config';
import { StageEventBus } from './core/stage-events';
import { addToProgress, loadProgress, setResume, type Resume } from './core/progress';
import { ABILITY_NAMES, abilityInUse, MissionRunner, type MissionPorts } from './mission/runner';
import { PhysicsWorld } from './physics/world';
import { listStageIds, loadAllRecords, loadStage, peekStage } from './stage/loader';
import type { AbilityId, GimmickDef, Vec3 } from './stage/types';
import type { RunSurface } from './audio/run-sound';
import {
  DOOR_REMIND_SECONDS,
  FESTIVAL,
  JUMP,
  LEVER_NOTCHES,
  LIGHT,
  PLOW,
  RECORD,
  RESOLUTION_MIN_FPS,
  RESOLUTION_SLOW_SECONDS,
  RESOLUTION_STEPS,
  ROCK_ROLL,
  ROCK_SPLASH_SECONDS,
  SLOPE,
  SPEED_LABELS,
  STOP_NOTCH,
  TITLE_ORBIT,
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
import { createSkipButton, type SkipButton } from './ui/skip-button';
import { RocketSystem } from './gimmick/rocket';
import { SlopeSystem } from './gimmick/slope';
import { DiveSystem } from './gimmick/dive';
import { PlowSystem } from './gimmick/plow';
import { JumpSeat } from './gimmick/seat-face';
import { IceSystem, iceZones, thinIceZones } from './gimmick/ice';
import { ThinIceSystem } from './gimmick/thin-ice';
import { MirrorSystem } from './gimmick/mirror';
import { fallsLoudness, underFalls, waterfalls } from './gimmick/waterfall';
import { Vector3 } from 'three';
import { showZukan } from './ui/zukan';
import { loadSettings, saveSettings, VOLUME_GAIN, type Settings } from './core/settings';
import { showSettings } from './ui/settings';
import { showParents } from './ui/parents';
import { createPause } from './ui/pause';
import { showMap, type MapChoice, type MapFinale, type MapIsland, type MapTeaser } from './ui/map';
import world from './world/world.json';
import type { WorldFile } from './world/types';
import { chapterDone, crossPages, knownPages, laidLinks, linkOptions, openingPage, type PageFacts } from './world/pages';

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
    else {
      // v1.10: a required stage not made yet (4-1 needs 3-3 before chapter 3 is in): what the stages before it teach.
      const earlier = listStageIds().filter((id) => !id.startsWith('0-') && id.localeCompare(req, undefined, { numeric: true }) < 0);
      const last = earlier[earlier.length - 1];
      const prev = last ? await peekStage(last) : null;
      if (last && prev && !seen.has(last)) out.push(...prev.unlocks, ...(await inheritedAbilities(last, seen)));
    }
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
 * shown are saved right away, so leaving early does not replay it). A chapter's end is the exception
 * (docs/PHASE7_FINISH.md §3, docs/PHASE8_CHAPTER3_4.md 第 1 部 §4): its light and card play, and only once the card
 * is closed is its link (or "finale:<id>" for an end without one) saved, so leaving in the middle shows it again
 * next time. It waits for the whole chapter to be cleared. Rails through the cloud gate to another page, and rails
 * that wait for the end's card, grow after it and are saved once they are all in (§3.6).
 */
async function openMap(root: HTMLElement, audio: AudioEngine, options: { next?: string; closeLabel?: string }): Promise<MapChoice> {
  const file = world as unknown as WorldFile;
  const progress = loadProgress();
  const resume = await savedResume();
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
      resumeMission: resume?.stage === island.id ? resume.mission : undefined,
    });
  }
  const done = (id: number): boolean => {
    const chapter = file.chapters.find((c) => c.id === id);
    return !!chapter && chapterDone(file, chapter, progress.cleared);
  };
  // A rail is laid once its `from` is cleared, and a rail out of a chapter (`afterChapter`) once that chapter is done.
  const laid = laidLinks(file, progress.cleared);
  // A chapter's closing rail waits for the whole chapter (a stage opened on its own with ?stage= does not
  // finish it): until then it is drawn but neither new nor saved, so its finale still plays the first time
  // the chapter is really done.
  const waiting = new Set(file.chapters.filter((c) => c.finale?.link && !done(c.id)).map((c) => c.finale?.link));
  const fresh = laid.filter((key) => !progress.mapLinks.includes(key) && !waiting.has(key));
  // The latest chapter whose end shows now: its closing rail is new, or (an end without one) it is done and not seen.
  const endingChapter = [...file.chapters].reverse().find((c) => {
    if (!c.finale) return false;
    return c.finale.link ? fresh.includes(c.finale.link) : done(c.id) && !progress.mapLinks.includes(`finale:${c.id}`);
  });
  const ending = endingChapter?.finale;
  // Through the gate to another page, or waiting for this end's card: they grow after it, saved once they are in.
  const later = fresh.filter(
    (key) => key !== ending?.link && (crossPages(file, key) !== null || (!!endingChapter && linkOptions(file, key)?.afterChapter === endingChapter.id)),
  );
  addToProgress('mapLinks', fresh.filter((key) => key !== ending?.link && !later.includes(key)));
  let finale: MapFinale | undefined;
  if (endingChapter && ending) {
    const light = ending.light ?? 'gold';
    const last = ending.path?.[ending.path.length - 1];
    const lastChapter = file.islands.find((i) => i.id === last)?.chapter;
    const opens = islands.find((i) => i.id === last && i.unlocked && !i.cleared);
    finale = {
      chapter: endingChapter.id,
      link: ending.link,
      ring: ending.ring,
      path: ending.path,
      light,
      // The water light ends on the next chapter's first island: it wakes up then, and snow falls on its chapter.
      wake: light === 'water' && opens ? [opens.id] : undefined,
      snow: light === 'water' ? file.islands.filter((i) => i.chapter === lastChapter).map((i) => i.id) : undefined,
      onHop: () => (light === 'water' ? audio.playBubblePop() : audio.playRecord()),
      onSnow: () => audio.playSnowShimmer(),
      onShown: async () => {
        if (ending.ring || ending.path) audio.playFanfare();
        else audio.playCard();
        await showCard(root, ending.card, ending.button, ending.icon, FINALE_CARD_GUARD_SECONDS);
        addToProgress('mapLinks', [ending.link ?? `finale:${endingChapter.id}`]);
      },
    };
  }
  // The next chapter's "?" island, once the chapter its `after` island belongs to is done.
  const coming = file.chapters.find((c) => {
    if (!c.teaser) return false;
    const before = file.islands.find((i) => i.id === c.teaser?.after)?.chapter;
    return progress.cleared.includes(c.teaser.after) && before !== undefined && done(before);
  });
  const teaser: MapTeaser | undefined = coming?.teaser && { id: `teaser:${coming.id}`, ...coming.teaser };
  // Which pages the child knows about, and the one to open on (docs/PHASE8_CHAPTER3_4.md 第 1 部 §3.4–3.5).
  const facts: PageFacts = {
    unlocked: islands.filter((i) => i.title && i.unlocked).map((i) => i.id),
    cleared: progress.cleared,
    laid,
    fresh,
    teaser: teaser?.id,
    next: options.next,
    finale: endingChapter?.id,
  };
  const pages = knownPages(file, facts);
  return showMap(root, file, {
    islands,
    laid,
    fresh,
    later,
    onLinkShown: (key) => addToProgress('mapLinks', [key]),
    finale,
    teaser,
    pages,
    page: openingPage(file, facts, pages),
    ...options,
  });
}

/** A chapter's end card: its button comes after this long (the map ignored taps until then; the child may still be tapping). */
const FINALE_CARD_GUARD_SECONDS = 0.9;

/**
 * Chapters with islands, and whether every one of their islands is cleared (the title's stars). A chapter whose
 * first island is not open yet (or has no stage yet) is shown faint.
 */
async function chapterStars(): Promise<{ label: string; done: boolean; faint: boolean }[]> {
  const file = world as unknown as WorldFile;
  const cleared = loadProgress().cleared;
  const out: { label: string; done: boolean; faint: boolean }[] = [];
  for (const chapter of file.chapters) {
    const ids = file.islands
      .filter((i) => i.chapter === chapter.id)
      .map((i) => i.id)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (ids.length === 0) continue;
    const first = await peekStage(ids[0]);
    const open = !!first && first.unlock.requires.every((r) => cleared.includes(r));
    out.push({ label: `${chapter.id}しょう`, done: ids.every((id) => cleared.includes(id)), faint: !open });
  }
  return out;
}


/**
 * What the track sounds like under the train front: a "sound" zone (v1.9) wins; else silk rails are silk, and a
 * flower bridge's petals are soft; v1.10: ice and thin ice are ice, elsewhere the stage's own surface.
 */
function runSurface(gimmicks: GimmickDef[], railId: string, s: number, fallback: RunSurface = 'rail'): RunSurface {
  const zone = zoneAt(gimmicks, 'sound', railId, s);
  if (zone) return zone.params?.surface as RunSurface;
  if (railLooks.get(railId) === 'silk') return 'silk';
  if (zoneAt(gimmicks, 'ice', railId, s) || zoneAt(gimmicks, 'thin-ice', railId, s)) return 'ice';
  return zoneAt(gimmicks, 'flower-bridge', railId, s) ? 'soft' : fallback;
}
/** Each rail's look (set when the stage loads), for runSurface(). */
const railLooks = new Map<string, string | undefined>();

/** Opens a stage straight into play (no title); with `resume`, at the mission the save says to go on from. */
function goToStage(id: string, resume = false): void {
  location.search = `?stage=${encodeURIComponent(id)}&go=1${resume ? '&resume=1' : ''}`;
}

/** The saved mission to go on from ("つづきから"), if it still fits its stage (a later mission than the first). */
async function savedResume(): Promise<Resume | null> {
  const resume = loadProgress().resume;
  if (!resume) return null;
  const stage = await peekStage(resume.stage);
  return stage && resume.mission < stage.missionCount ? resume : null;
}

/**
 * A card coming within this long (ms) of a "▶▶" holds its button back for SKIP_CARD_GUARD_SECONDS: a child tapping
 * "▶▶" twice, or tapping on after it, does not close the mission card unseen.
 */
const SKIP_CARD_WINDOW_MS = 1500;
const SKIP_CARD_GUARD_SECONDS = 0.8;

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const stageId = params.get('stage') ?? '1-1';

  const [stage, physics] = await Promise.all([loadStage(stageId), PhysicsWorld.create()]);
  for (const rail of stage.file.rails) railLooks.set(rail.id, rail.look);
  const hasMissions = stage.file.missions.length > 0;
  // The hidden test course has every button, so the jump, the light, the rocket and diving can be tried there.
  const abilities = new Set<AbilityId>(
    hasMissions ? [...loadProgress().abilities, ...(await inheritedAbilities(stageId))] : ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow'],
  );
  const train = new Train(stage.network, stage.file.junctions, stage.file.start, {
    waters: stage.file.environment.water ?? [],
    floaters: stage.file.floaters ?? [],
  });
  // 2-3: slopes and the rocket also work on the test course (no mission runner there).
  const slopes = new SlopeSystem(stage.file.gimmicks, train);
  const rocket = new RocketSystem(stage.file.gimmicks, train, slopes);
  // v1.10: records found so far (the save's; the test course's only for this run), for the dive button's glow.
  const foundRecords = new Set<string>(hasMissions ? loadProgress().records : []);
  // v1.10: near water the jump seat turns into "もぐる".
  const dive = new DiveSystem(train, stage.records, (id) => foundRecords.has(id));
  let diveBounces = 0;
  // v1.10 (4-2): snow walls (the train bursts them or bumps them), and the jump seat's face: jump, もぐる or ゆきかき.
  const plow = new PlowSystem(stage.file.gimmicks, train, (index, state, cleared, instant) =>
    events.post({ type: 'plow:wall', index, state, cleared, instant }),
  );
  const seat = new JumpSeat(dive, plow, train);
  // v1.10 (4-1): ice (weaker brakes, the glowing notches at an ice station), thin ice (only the rocket gets across,
  // it lights the rocket button) and ice mirrors.
  const ice = new IceSystem(stage.file.gimmicks, stage.file.stations, train);
  const thinIce = new ThinIceSystem(stage.file.gimmicks, train, rocket);
  rocket.extraGlow = () => thinIce.glow;
  const mirrors = new MirrorSystem(stage.file.gimmicks, train);
  const hasIce = iceZones(stage.file.gimmicks).length > 0 || thinIceZones(stage.file.gimmicks).length > 0;
  const whistle = new Whistle();
  const audio = new AudioEngine();
  // The island's quiet sound around the train (from the first tap on; under the title too). v1.10 (3-3): the sea's
  // faraway volcano only where there is a volcano.
  audio.setAmbience(stage.file.environment.ambience ?? null, stage.file.props.some((p) => p.model === 'volcano'));
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
  // "▶▶" on cutscenes (PHASE7_FINISH §4 item 7): only on a stage cleared before this run.
  let skipButton: SkipButton | null = null;
  const clearedBefore = loadProgress().cleared.includes(stage.file.id);
  const cardUp = (): boolean => uiEl.querySelector('#card') !== null;
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

  /**
   * v1.10 (3-3): a cutscene waiting for one button (`press`): that button alone does something (and glows); `done`
   * ends the wait.
   */
  let cutscenePress: { ability: 'light' | 'whistle' | 'rocket' | 'jump'; done: () => void } | null = null;
  const pressWanted = (ability: 'light' | 'whistle' | 'rocket' | 'jump'): boolean | null => {
    if (!cutscenePress) return null;
    if (cutscenePress.ability !== ability) return false;
    const done = cutscenePress.done;
    cutscenePress = null;
    done();
    return true;
  };
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
      if (pressWanted('whistle') === false) return;
      if (whistle.trigger()) {
        audio.playWhistle();
        // v1.10 (3-3): in the dark the glowing motes flash ("ちりりん").
        const fog = zoneAt(stage.file.gimmicks, 'fog', train.state.railId, train.frontS);
        if (fog && typeof fog.params?.color === 'string') audio.playGlimmer();
        events.post({ type: 'whistle' });
      }
    },
    onJunction: (side) => {
      // v1.8: a side way that needs an ability the player does not have yet stays shut ("ロケットが あれば…").
      const j = train.announcedJunction;
      if (j?.needs && side !== j.default && !abilities.has(j.needs)) {
        runner?.onJunctionRefused(j);
        return false;
      }
      train.chooseJunction(side);
      return true;
    },
  });
  const actionButtons = uiEl.querySelector('.action-buttons') as HTMLElement;
  const jumpButton = createJumpButton(actionButtons, () => {
    audio.unlock();
    if (pressWanted('jump') !== null) return;
    // v1.10: the seat is "もぐる" near water, "ゆきかき" near snow (the train's events play their sounds).
    const press = seat.press();
    if (press.kind === 'dive' || press.kind === 'plow') return;
    const result = press.result;
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
    // v1.10 (3-3): a cutscene asking for another button: the light waits.
    const wanted = pressWanted('light');
    if (wanted === false) return;
    // Asked for in a cutscene, it comes on (never off).
    if (wanted === true && lightOn) return;
    // Toggle, with a short lockout so a double tap does not flicker it.
    if (wanted === null && simTime < lightReadyAt) return;
    lightReadyAt = simTime + LIGHT.cooldown;
    lightOn = !lightOn;
    audio.unlock();
    audio.playLight(lightOn);
    train.speedScale = lightOn ? LIGHT.speedScale : 1;
    lightButton.setOn(lightOn);
    mirrors.lightOn = lightOn;
    runner?.setLight(lightOn);
    events.post({ type: 'light', on: lightOn });
  });
  const rocketButton = createRocketButton(actionButtons, () => {
    audio.unlock();
    if (pressWanted('rocket') !== null) return;
    const result = rocket.press();
    if (!result.ok) runner?.onRocketRefused(result);
  });
  const showAbility = (ability: AbilityId): void => {
    abilities.add(ability);
    if (ability === 'jump') jumpButton.show();
    if (ability === 'dive') {
      // "もぐる" takes the jump's seat (no new round button).
      dive.enabled = true;
      jumpButton.show();
    }
    if (ability === 'plow') {
      // v1.10 (4-2): "ゆきかき" takes the jump's seat too.
      plow.enabled = true;
      jumpButton.show();
    }
    if (ability === 'light') lightButton.show();
    if (ability === 'rocket') {
      rocket.enabled = true;
      rocketButton.show();
      app.dataset.hasRocket = '1';
    }
    events.post({ type: 'ability', id: ability });
  };
  for (const ability of abilities) showAbility(ability);
  audio.listenForGestures();

  const bubbles = createBubbles(uiEl, PARTNER_NAME);
  const gauge = createStopGauge(uiEl);
  const caption = createCaption(uiEl);
  const cargo = createCargoStrip(uiEl);
  const toast = createToast(uiEl);
  /** What a fall fades to: black, a white cloud (1-3) or a green leaf (2-1). */
  const FALL_COLORS = { dark: '#000000', cloud: '#ffffff', leaf: '#d6efb4', water: '#cdeefe', snow: '#f2f7fc' } as const;
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
  let fixedCamera: { at: Vec3; lookAt: Vec3; reach?: number } | null = null;
  // The title screen's camera circling the train (set while the title is up).
  let orbiting = false;
  const applyCamera = (snap = false): void => {
    const mode = cameraOverride ?? zoneCamera ?? userCamera;
    view.setCamera(mode, snap);
    view.setFixedCamera(fixedCamera);
    app.dataset.camera = fixedCamera ? 'fixed' : orbiting ? 'orbit' : mode;
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

  // v1.10: diving. The sounds, the view's dome and splashes; "ぽよん" is the runner's fail (the test course puts the
  // train back itself).
  let dives = 0;
  let bobs = 0;
  app.dataset.dives = '0';
  app.dataset.bobs = '0';
  app.dataset.diveBounces = '0';
  train.events.on('dived', () => {
    dives += 1;
    app.dataset.dives = String(dives);
    audio.playDive();
    events.post({ type: 'dive', state: 'dive', railId: train.state.railId, s: train.frontS });
  });
  train.events.on('surfaced', ({ long }) => {
    audio.playSurface(long);
    events.post({ type: 'dive', state: 'surface', long, railId: train.state.railId, s: train.frontS });
  });
  train.events.on('bob', () => {
    bobs += 1;
    app.dataset.bobs = String(bobs);
    audio.playBubbles();
    events.post({ type: 'dive', state: 'bob' });
  });
  train.events.on('dome', ({ on, instant }) => events.post({ type: 'dome', on, instant }));
  events.post({ type: 'dome', on: train.domeOn, instant: true });
  train.events.on('waterBounce', ({ rewind, railId, s }) => {
    diveBounces += 1;
    app.dataset.diveBounces = String(diveBounces);
    audio.playWaterBounce();
    events.post({ type: 'dive', state: 'bounce', railId, s });
    if (hasMissions) return;
    void (async () => {
      await waitSeconds(0.8);
      await fade(true, 0.4);
      train.rewindTo(rewind.at, rewind.railId);
      rocket.reset();
      rocket.refill();
      ui.lever.setNotch(STOP_NOTCH);
      events.post({ type: 'rewind' });
      await fade(false, 0.4);
    })();
  });
  dive.events.on('near', () => runner?.onDiveNear());
  // v1.10 (4-2): the snowplow. Its sounds, the view's blade, walls and flying snow, and "ぽすっ" (the runner makes it a
  // soft fail; the test course puts the train back itself): the window goes white and the wiper clears it.
  app.dataset.plowBursts = '0';
  app.dataset.plowBumps = '0';
  const snowSplat = document.createElement('div');
  snowSplat.className = 'snow-splat';
  snowSplat.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><b></b>';
  uiEl.prepend(snowSplat);
  let plowSprayIn = 0;
  let plowSpraying = false;
  let bladeDrops = 0;
  train.events.on('bladeDown', ({ instant }) => {
    if (!instant) {
      bladeDrops += 1;
      app.dataset.bladeDrops = String(bladeDrops);
      audio.playPlow();
    }
    events.post({ type: 'plow:blade', down: true, instant });
  });
  train.events.on('bladeUp', ({ instant }) => {
    if (!instant) audio.playBladeUp();
    events.post({ type: 'plow:blade', down: false, instant });
  });
  train.events.on('wallBurst', ({ span, boosted }) => {
    app.dataset.plowBursts = String(plow.bursts);
    audio.playWallBurst(boosted);
    events.post({ type: 'plow:burst', index: span.index, boosted });
  });
  train.events.on('snowBump', ({ span, rewind }) => {
    app.dataset.plowBumps = String(plow.bumps);
    audio.playPlowBump();
    events.post({ type: 'plow:bump', index: span.index });
    // Snow all over the screen, and the wiper clears it ("きゅっ きゅっ").
    snowSplat.classList.remove('is-on');
    void snowSplat.offsetWidth;
    snowSplat.classList.add('is-on');
    audio.playWiper();
    if (hasMissions) return;
    void (async () => {
      await waitSeconds(PLOW.splatSeconds);
      await fade(true, 0.4);
      train.rewindTo(rewind.at, rewind.railId);
      rocket.reset();
      rocket.refill();
      ui.lever.setNotch(STOP_NOTCH);
      events.post({ type: 'rewind' });
      await fade(false, 0.4);
    })();
  });
  // v1.10 (4-1): thin ice ("ぴしぴし", "ぽちゃん", across) and the mirrors' "きらーん"; the runner makes "ぽちゃん" a fail,
  // the test course puts the train back itself.
  let iceSparkle = false;
  let cracks = 0;
  app.dataset.cracks = '0';
  app.dataset.mirrorFlash = '0';
  thinIce.events.on('shake', (z) => {
    audio.playIceCrack();
    events.post({ type: 'thin', index: z.index, state: 'shake' });
  });
  thinIce.events.on('clear', (z) => events.post({ type: 'thin', index: z.index, state: 'clear' }));
  thinIce.events.on('crack', (z) => {
    cracks += 1;
    app.dataset.cracks = String(cracks);
    audio.playIceSplash();
    events.post({ type: 'thin', index: z.index, state: 'crack' });
    if (hasMissions) return;
    train.emergencyStop();
    void (async () => {
      await waitSeconds(1.6);
      await fade(true, 0.4);
      train.rewindTo(z.rewind.at, z.rewind.railId);
      rocket.reset();
      rocket.refill();
      ice.reset();
      thinIce.reset();
      ui.lever.setNotch(STOP_NOTCH);
      events.post({ type: 'rewind' });
      await fade(false, 0.4);
    })();
  });
  mirrors.events.on('flash', (m) => {
    app.dataset.mirrorFlash = String(mirrors.flashes);
    audio.playMirror();
    events.post({ type: 'mirror', index: m.index, state: 'flash' });
  });
  events.on('event', (e) => {
    if (e.type === 'rewind') {
      dive.reset();
      seat.reset();
      snowSplat.classList.remove('is-on');
      // v1.10 (4-1): the ice is whole again, and its lines come again.
      ice.reset();
      thinIce.reset();
      mirrors.reset();
    }
    if (e.type === 'record:found') foundRecords.add(e.id);
  });
  // v1.10 (3-2): waterfalls: their "さーーっ" by how near they are, and the shower on the roof (the cab's window gets
  // streaks of water; CSS shows them by #app[data-shower]).
  const falls = waterfalls(stage.file.gimmicks, stage.file.environment.water ?? []);
  let showerOn = false;
  if (falls.length > 0) {
    app.dataset.shower = '0';
    const showerVignette = document.createElement('div');
    showerVignette.className = 'shower-vignette';
    showerVignette.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 7.3 + 3) % 100}%;animation-delay:${((i * 0.37) % 0.9).toFixed(2)}s"></i>`).join('');
    uiEl.prepend(showerVignette);
  }
  const roofs = Array.from({ length: 3 }, () => new Vector3());
  const updateFalls = (): void => {
    if (falls.length === 0) return;
    const pose = train.getPose();
    const cars = [pose, ...pose.cars];
    cars.forEach((c, i) => {
      if (roofs[i]) roofs[i].set(0, 3.6, 0).applyQuaternion(c.quaternion).add(c.position);
    });
    audio.setWaterfall(fallsLoudness(falls, pose.position));
    const on = underFalls(falls, roofs.slice(0, cars.length));
    if (on === showerOn) return;
    showerOn = on;
    app.dataset.shower = on ? '1' : '0';
    if (on) {
      showers += 1;
      app.dataset.showers = String(showers);
      audio.playShower();
    }
    events.post({ type: 'shower', on });
  };
  let showers = 0;
  // In the cab under water: the dome's rim round the screen edge (CSS shows it by #app[data-underwater]).
  const diveVignette = document.createElement('div');
  diveVignette.className = 'dive-vignette';
  diveVignette.innerHTML = '<i></i><i></i><i></i>';
  uiEl.prepend(diveVignette);

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

  train.events.on('junctionApproach', (e) => {
    const ability = e.junction.needs;
    const side = e.default === 'left' ? 'right' : 'left';
    ui.junction.show({ ...e, needs: ability ? { side, ability, has: abilities.has(ability) } : undefined, bubbles: e.junction.bubbles });
  });
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

  // The title shows the stage behind it, the camera circling the train at its start (PHASE7_FINISH §4 item 6).
  const titleShown = hasMissions && !params.has('go');
  if (titleShown) {
    orbiting = true;
    // The driving controls wait under the title (it no longer covers the screen).
    app.dataset.title = '1';
    // On the side away from the platform the train stands at (1-1: the headquarters stand behind the platform).
    const start = stage.file.start;
    const platform = stage.file.stations.find((st) => st.railId === start.railId && Math.abs(st.at - start.at) < 30);
    // platformSide is along the rail; the train runs against the rail when its direction is -1.
    const platformOnTrainLeft = (platform?.platformSide === 'left') === start.direction >= 0;
    view.setOrbit({ ...TITLE_ORBIT, centerDeg: platform && !platformOnTrainLeft ? 0 : 180 });
    applyCamera(true);
  }

  document.title = GAME_TITLE;
  app.dataset.stage = stage.file.id;
  app.dataset.build = __BUILD_ID__;
  console.info(`build ${__BUILD_ID__}`);
  app.dataset.ready = '1';
  // index.html's loading screen (CSS only, shown from the first paint): gone now that the game is drawn.
  document.getElementById('loading')?.remove();
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
  /**
   * v1.10: the test course has no runner: its records are found here the same way (not saved), so a dive record can
   * be tried there.
   */
  const findTestCourseRecords = (): void => {
    for (const record of stage.records) {
      if (foundRecords.has(record.def.id) || !abilityInUse(record.def.requires, train, lightOn)) continue;
      const d = record.onRail
        ? train.distanceAhead(record.onRail.railId, record.onRail.at)
        : record.position.distanceTo(train.getPose().position);
      if (d === null || Math.abs(d) > RECORD.distance) continue;
      foundRecords.add(record.def.id);
      app.dataset.records = [...foundRecords].join(',');
      events.post({ type: 'record:found', id: record.def.id });
      toast.show(`みつけた！\n${record.def.name}`, 'perfect');
      audio.playRecord();
    }
  };
  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    app.dataset.paused = paused ? '1' : '0';
    app.dataset.audio = audio.state;
    app.dataset.music = audio.musicId ?? '';
    if (paused) {
      // Game time stands still; keep drawing so a resize or the returning view stay right.
      view.update(0, train.getPose(), fx);
      audio.setWaterfall(0);
      audio.updateRun(0, { speed: 0, target: 0, braking: false, airborne: false, surface: 'rail', quiet: true });
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
    // v1.10 (3-1): a whale's current pushes only while its whale swims along (the test course has no whales to greet).
    const zone = zoneAt(gimmicks, 'updraft', train.state.railId, train.frontS);
    const updraft = zone && (runner?.updraftOn(zone) ?? true) ? zone : null;
    train.boostSpeed = updraft ? param(updraft, 'speed', 28) : 0;
    app.dataset.updraft = updraft ? '1' : '0';
    // 2-3: the slope under the train front, and the rocket resting in quiet places (before the train moves).
    slopes.update();
    rocket.update();
    ice.update(dt);

    train.update(dt);
    dive.update(dt);
    seat.update(dt);
    plow.update();
    // v1.10 (4-2): snow flying off the snowplow ("ざざざー") while it clears a buried stretch.
    const spraying = train.plowing && Math.abs(train.state.speed) > 0.3;
    if (spraying !== plowSpraying) {
      plowSpraying = spraying;
      events.post({ type: 'plow:spray', on: spraying });
    }
    if (spraying) {
      plowSprayIn -= dt;
      if (plowSprayIn <= 0) {
        plowSprayIn = PLOW.sprayEvery;
        audio.playPlowSpray(Math.abs(train.state.speed));
      }
    } else plowSprayIn = 0;
    thinIce.update(dt);
    mirrors.update();
    if (ice.sparkle !== iceSparkle) {
      iceSparkle = ice.sparkle;
      events.post({ type: 'ice', sparkle: iceSparkle });
    }
    audio.setUnderwater(train.submerged);
    updateFalls();
    // Under water the island's sound turns to the underwater bed, and the rails to a soft "ことっ" with bubbles.
    audio.setAmbienceUnderwater(train.submerged);
    view.setSubmerged(train.submerged);
    audio.updateRun(dt, {
      speed: Math.abs(train.state.speed),
      target: train.targetSpeed,
      braking: train.targetSpeed < Math.abs(train.state.speed) - 0.3,
      airborne: train.airborne || train.isFalling,
      surface: runSurface(gimmicks, train.currentRail.id, train.frontS, stage.file.environment.surface),
      rocket: train.rocketBurning,
      underwater: train.submerged,
      quiet: false,
    });
    app.dataset.runJoints = String(audio.runStats.joints);
    app.dataset.runReleases = String(audio.runStats.releases);
    boughs.update(dt);
    whistle.update(dt);
    ui.whistle.setProgress(whistle.progress);
    jumpButton.setMode(seat.face);
    jumpButton.setDiving(train.domeOn);
    jumpButton.setPlowing(train.bladeDown, spraying);
    const driving = runner === null || runner.phase === 'driving';
    if (seat.face === 'dive') jumpButton.set(train.diveProgress, dive.glow && driving, false);
    // "ゆきかき" glows until the blade is down, and is never grey (it works standing too).
    else if (seat.face === 'plow') jumpButton.set(1, seat.glow && driving, false);
    else jumpButton.set(train.jumpProgress, train.jumpWouldClear || (runner?.jumpHint ?? false), train.state.speed < JUMP.minSpeed);
    runner?.update(dt);
    if (!runner) findTestCourseRecords();
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
    // v1.10 (4-1): at an ice station the notch to go to glows ("ゆっくり", then "とまる").
    const iceNotch = ice.hint === 'stop' ? STOP_NOTCH : ice.hint === 'slow' ? ICE_SLOW_NOTCH : null;
    if (cutscenePress) {
      // v1.10 (3-3): a cutscene waits for one button: it alone glows.
      lightButton.setGlow(cutscenePress.ability === 'light');
      ui.whistle.setGlow(cutscenePress.ability === 'whistle');
    } else if (runner) {
      lightButton.setGlow(runner.lightHint);
      jumpButton.setHopper(runner.hopperId !== '');
      const hint = runner.phase === 'driving' ? runner.leverHintSpeed : null;
      // The notch the partner names (ゆっくり): judged on the plain notch speeds, so the light does not change it.
      const silk = hint === null ? null : (fastestNotchUnder(hint, 1) ?? fastestNotchUnder(hint, train.speedScale));
      ui.lever.setHint(runner.phase === 'driving' && iceNotch !== null ? iceNotch : silk);
    } else if (hasIce) ui.lever.setHint(iceNotch);

    const pose = train.getPose();
    physics.setTrainPose(pose.position, pose.quaternion);
    for (const ev of physics.step(dt)) console.log(`sensor: ${ev.id} ${ev.entered ? 'enter' : 'exit'}`);

    fx.dip = Math.max(0, fx.dip - dt * 1.2);
    fx.shake = Math.max(0, fx.shake - dt * 2.5);
    view.update(dt, pose, fx);
    // 2-3: the lever does nothing while the rocket burns or on a slide: the knob and the speed word say so.
    ui.hud.setSpeedWord(train.rocketBurning ? 'ロケット！' : train.onSlide ? 'つるつる〜' : SPEED_LABELS[train.state.notch]);
    ui.lever.setMark(train.rocketBurning ? 'rocket' : train.onSlide ? 'slide' : ice.current ? 'ice' : null);
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
    app.dataset.push = train.rocketPushing ? '1' : '0';
    app.dataset.slope = slopes.kind;
    app.dataset.slip = train.isSlipping ? '1' : '0';
    app.dataset.dive = train.domeOn ? 'on' : dive.face === 'dive' ? 'near' : '';
    if (plow.spans.length > 0) {
      app.dataset.plow = train.bladeDown ? 'on' : seat.face === 'plow' ? 'near' : '';
      app.dataset.plowing = train.plowing ? '1' : '0';
      for (const sp of plow.spans) app.setAttribute(`data-wall-${sp.index}`, plow.wallState(sp.index));
    }
    app.dataset.diving = train.diving ? '1' : '0';
    app.dataset.submerged = train.submerged ? '1' : '0';
    app.dataset.underwater = view.isCameraUnderwater() ? '1' : '0';
    if (hasIce) {
      app.dataset.ice = ice.current ? '1' : '0';
      app.dataset.iceHint = ice.hint;
      app.dataset.thin = thinIce.status === 'shake' ? 'on' : thinIce.status;
    }
    if (mirrors.mirrors.length > 0) app.dataset.mirror = mirrors.active ? String(mirrors.active.index) : '';
    app.dataset.timer = timer ? String(timer.seconds) : '';
    app.dataset.timerState = timer?.state ?? '';
    app.dataset.timerIcon = timer?.icon ?? '';
    if (runner) {
      app.dataset.phase = runner.phase;
      app.dataset.mission = String(runner.missionIndex);
      app.dataset.step = String(runner.stepIndex);
      app.dataset.neck = runner.bigDinoNeck;
      app.dataset.hopper = runner.hopperId;
      app.dataset.bridges = runner.bridgeFlags;
      app.dataset.butterfly = runner.butterflyState;
      app.dataset.fragile = runner.fragileStatus;
      app.dataset.whales = runner.whaleStates;
      app.dataset.actors = runner.actorStates;
      app.dataset.bubbleRevealed = runner.bubbleRevealedId;
      // Under a card (a cutscene's own, or a learned ability's) it waits: the card is the child's tap.
      skipButton?.setVisible(clearedBefore && !paused && runner.canSkip && !cardUp());
    }
    debug?.update(fps);
  };
  requestAnimationFrame(frame);

  if (!hasMissions) return; // Test course: just drive.

  const progress = loadProgress();
  const next = await nextStage(progress.cleared);
  // "つづきから" (PHASE7_FINISH §4 item 3): a mission to go on from wins over the next stage.
  const resume = await savedResume();
  let resumeFrom = params.get('resume') === '1' && resume?.stage === stageId ? resume.mission : 0;
  if (titleShown) {
    // The title's music box (it starts with the first tap: iPad keeps sound locked until then).
    audio.playMusic('title');
    const choice = await showTitle(uiEl, GAME_TITLE, {
      lines: GAME_TITLE_LINES,
      chapters: await chapterStars(),
      continueLabel: resume
        ? `つづきから（${resume.stage} ミッション ${resume.mission + 1}）`
        : next && next.id !== stageId
          ? `つづきから（${next.title}）`
          : undefined,
      // Starting that stage over stays one tap away.
      startLabel: resume ? `はじめから（${resume.stage}）` : undefined,
      allCleared: !next && progress.cleared.length > 0,
      onMap: () => {
        void openMap(uiEl, audio, { next: next?.id, closeLabel: 'もどる' }).then((choice) => {
          if (choice.kind === 'stage') goToStage(choice.id, choice.resume);
        });
      },
      onSettings: () => {
        showSettings(
          uiEl,
          settings,
          (changed) => {
            settings = changed;
            saveSettings(settings);
            applySettings();
          },
          // "おうちの かたへ" (a 2-second press): a new or erased progress starts over from the title.
          () => showParents(uiEl, { buildId: __BUILD_ID__, onProgressChanged: () => (location.href = location.pathname) }),
        );
      },
      onZukan: () => {
        void loadAllRecords().then((all) => {
          const progress = loadProgress();
          showZukan(
            uiEl,
            all.map(({ stageId, stageTitle, record }) => ({ stageId, stageTitle, record, found: progress.records.includes(record.id) })),
            new Set(progress.abilities),
          );
        });
      },
    });
    if (choice === 'continue' && resume) {
      if (resume.stage !== stageId) {
        goToStage(resume.stage, true);
        return;
      }
      resumeFrom = resume.mission;
    } else if (choice === 'continue' && next) {
      goToStage(next.id);
      return;
    } else if (choice === 'start' && resume && resume.stage !== stageId) {
      goToStage(resume.stage);
      return;
    }
    orbiting = false;
    delete app.dataset.title;
    view.setOrbit(null);
    applyCamera(true);
  }
  audio.unlock();
  audio.playMusic(stage.file.environment.bgm);

  /** v1.7: the seabirds (cats that look like seabirds) flap off with "ぱたぱた" instead of walking aside. */
  const seabirds = new Set(
    stage.file.actors.filter((a) => a.type === 'cat' && (a.params as { look?: string } | undefined)?.look === 'seabird').map((a) => a.id),
  );
  /** v1.10 (4-1): seals ("cat" look "seal") and snowbirds ("rock-roll" look "snowbird"): their own sounds. */
  const lookOf = (a: { params?: Record<string, unknown> }): unknown => a.params?.look;
  const seals = new Set(stage.file.actors.filter((a) => a.type === 'cat' && lookOf(a) === 'seal').map((a) => a.id));
  const snowbirds = new Set(stage.file.actors.filter((a) => a.type === 'rock-roll' && lookOf(a) === 'snowbird').map((a) => a.id));
  /** v1.10 (3-2, 3-3): the duck family ("dino-small" look "duck") and sea turtles ("cat" look "turtle"). */
  const ducks = new Set(stage.file.actors.filter((a) => a.type === 'dino-small' && lookOf(a) === 'duck').map((a) => a.id));
  const turtles = new Set(stage.file.actors.filter((a) => a.type === 'cat' && lookOf(a) === 'turtle').map((a) => a.id));
  let lastFailReason: string | null = null;
  /** v1.10 (3-1): jump pads that are a whale's back (it surfaces with a song and throws the train with its spout). */
  const whalePads = new Set(
    stage.file.gimmicks.flatMap((g, i) => (g.type === 'jump-pad' && (g.params as { look?: string } | undefined)?.look === 'whale' ? [i] : [])),
  );
  /** v1.10 (4-2): jump pads that are a folded ski jump. */
  const skiPads = new Set(
    stage.file.gimmicks.flatMap((g, i) => (g.type === 'jump-pad' && (g.params as { look?: string } | undefined)?.look === 'ski' ? [i] : [])),
  );
  const nearWhalePad = (): boolean =>
    [...whalePads].some((i) => {
      const g = stage.file.gimmicks[i];
      const d = g.railId !== undefined && g.from !== undefined ? train.distanceAhead(g.railId, g.from) : null;
      return d !== null && Math.abs(d) < 10;
    });
  let skippedAt = -Infinity;
  const skipGuard = (): number => (performance.now() - skippedAt < SKIP_CARD_WINDOW_MS ? SKIP_CARD_GUARD_SECONDS : 0);
  const ports: MissionPorts = {
    say: (text, who, name) => bubbles.say(text, who, name),
    sayAsync: (text, who) => void bubbles.say(text, who),
    hush: () => bubbles.clear(),
    sayNow: (text) => {
      bubbles.clear();
      void bubbles.say(text);
    },
    card: (title, button, icon, mirror) => {
      audio.playCard();
      return showCard(uiEl, title, button, icon, skipGuard(), undefined, { mirror });
    },
    // v1.10 (3-3): the runner opens and closes a cutscene's doors itself (it knows the station).
    door: () => undefined,
    press: (ability, say, fx, cancel) =>
      new Promise<void>((resolve) => {
        const buttons = { light: lightButton, whistle: null, rocket: rocketButton, jump: jumpButton } as const;
        const el = ability === 'whistle' ? document.getElementById('whistle') : document.getElementById(ability === 'jump' ? 'jump' : ability);
        let over = false;
        const finish = (pressed: boolean): void => {
          if (over) return;
          over = true;
          cutscenePress = null;
          delete app.dataset.cutscenePress;
          el?.classList.remove('is-press');
          if (buttons[ability] === lightButton) lightButton.setGlow(false);
          if (ability === 'whistle') ui.whistle.setGlow(false);
          if (fx === 'beacon') {
            app.dataset.beacon = '1';
            if (pressed) audio.playBeacon();
            events.post({ type: 'beacon', instant: !pressed });
          }
          resolve();
        };
        cutscenePress = { ability, done: () => finish(true) };
        app.dataset.cutscenePress = ability;
        el?.classList.add('is-press');
        if (say) {
          void bubbles.say(say);
          void (async () => {
            while (!over) {
              await waitSeconds(DOOR_REMIND_SECONDS);
              if (!over) void bubbles.say(say);
            }
          })();
        }
        void cancel?.then(() => finish(false));
      }),
    festival: async () => {
      events.post({ type: 'festival' });
      audio.playFestival();
      await waitSeconds(FESTIVAL.seconds);
    },
    clearCard: (title, button, rewards) => {
      audio.playCard();
      return showCard(uiEl, title, button, undefined, skipGuard(), rewards);
    },
    caption,
    learn: (ability) => showAbility(ability),
    interrupt: () => {
      bubbles.clear();
      caption.clear();
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
      fx.dip = Math.max(fx.dip, dip * shakeScale());
      fx.shake = Math.max(fx.shake, shake * shakeScale());
      // A bumped rock has its own rounder "ぽよん" (played with its bonk), and so does the water (v1.10).
      if (lastFailReason !== 'rock' && lastFailReason !== 'dive' && lastFailReason !== 'crack' && lastFailReason !== 'plow') audio.playBoing();
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
    fixedCamera: (at, lookAt, reach) => {
      const next = at && lookAt ? { at, lookAt, reach } : null;
      // Nothing to do when no fixed camera was set (every cutscene end): the eased return must not snap.
      if (!next && !fixedCamera) return;
      fixedCamera = next;
      applyCamera(true);
    },
    sneeze: async () => {
      events.post({ type: 'sneeze' });
      await caption('はっくしょーん！', 2.5, true);
    },
    pop: async (id) => {
      events.post({ type: 'pop', id });
      audio.playPop();
      await waitSeconds(0.6);
    },
  };
  events.on('event', (e) => {
    if (e.type === 'door') audio.playDoor(e.open);
    if (e.type === 'hopper' && e.state === 'board') audio.playHopperBoard();
    if (e.type === 'bridge' && e.open && !e.instant) audio.playBloom();
    if (e.type === 'fragile' && e.state === 'shake') audio.playSilkShake();
    if (e.type === 'butterfly') {
      if (e.state === 'follow') butterfliesFollowing.add(e.index);
      else butterfliesFollowing.delete(e.index);
    }
    if (e.type === 'sneeze') audio.playSneeze();
    // v1.10 (3-1): the whale's song, its spout under the train, the true bubbles.
    if (e.type === 'whale' && e.state === 'sing') audio.playWhaleSong();
    if (e.type === 'pad' && e.visible && whalePads.has(e.index)) audio.playWhaleSong();
    if (e.type === 'jump' && nearWhalePad()) audio.playSpout();
    if (e.type === 'bubbles:true') audio.playBubbleTrue();
    if (e.type === 'volcano:puff') audio.playVolcanoPuff();
    // v1.10 (3-2, 3-3): a sign turning the right way round, the ducks, the sea turtle, the moon at a time-up.
    if (e.type === 'sign:reveal') audio.playSignFlip();
    if (e.type === 'actor:state' && e.state === 'cross' && ducks.has(e.id)) audio.playDuck();
    if (e.type === 'actor:state' && e.state === 'awake' && turtles.has(e.id)) audio.playTurtleWake();
    if (e.type === 'timeUp') {
      app.dataset.timeup = e.icon;
      if (e.icon === 'moon') audio.playMoonUp();
    }
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
    if (e.type === 'rock' && snowbirds.has(e.id)) {
      // v1.10 (4-1): little birds in a row: "ぴよぴよ" as they line up and set off, wings flapping when surprised.
      if (e.state === 'wobble' || e.state === 'roll') audio.playSnowbirds();
      if (e.state === 'bonk') audio.playFlap();
    } else if (e.type === 'rock') {
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
    if (e.type === 'actor:state' && (e.state === 'awake' || e.state === 'flee') && seals.has(e.id)) audio.playSeal();
    if (e.type === 'rail:cut' && e.style === 'fall' && !e.instant) audio.playBridgeFall();
    // v1.10 (4-2): the ski jump folds down ("ばたん！"), the lanterns come on at dusk.
    if (e.type === 'pad' && e.visible && skiPads.has(e.index)) audio.playPadFlop();
    if (e.type === 'sky' && e.seconds > 0) audio.playLanterns();
    // Test hooks: the evening sky, the swirl marks shown by the light.
    if (e.type === 'sky') app.dataset.sky = e.sky;
    if (e.type === 'trace') app.dataset.trace = e.on ? '1' : '0';
  });

  // "||" in the corner: stop the game, go on, or leave for the map.
  const pause = createPause(uiEl, {
    onPause: (p) => {
      paused = p;
      audio.setMusicPaused(p);
    },
    onMap: async () => {
      const choice = await openMap(uiEl, audio, { next: next?.id, closeLabel: 'もどる' });
      if (choice.kind === 'stage') goToStage(choice.id, choice.resume);
    },
  });
  pause.show();
  skipButton = createSkipButton(uiEl, () => {
    if (runner?.skipCutscene()) skippedAt = performance.now();
  });

  runner = new MissionRunner(stage, train, whistle, events, ports, { rocket, slopes, dive, ice, thinIce, mirrors, plow, seat });
  runner.knowAbilities(abilities);
  runner.setLight(lightOn);
  if (resumeFrom > 0) {
    runner.prepareResume(resumeFrom, resume ?? undefined);
    // The train stands at another station now: the camera jumps there instead of flying over the stage.
    applyCamera(true);
  }
  await runner.run(resumeFrom);
  pause.hide();
  addToProgress('cleared', [stage.file.id]);
  if (loadProgress().resume?.stage === stage.file.id) setResume(null);
  addToProgress('abilities', stage.file.unlocks);
  // Back to the map: the rail to the next island grows in, and the child taps it to go on.
  const after = await nextStage(loadProgress().cleared, stage.file.id);
  audio.playMusic('title');
  const choice = await openMap(uiEl, audio, { next: after?.id, closeLabel: 'タイトルへ' });
  if (choice.kind === 'stage') goToStage(choice.id, choice.resume);
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

/** v1.10 (4-1): the "ゆっくり" notch (the ice station's first glow). */
const ICE_SLOW_NOTCH = 2;

/** The fastest notch whose speed (scaled by the light) is at most `limit` m/s: the lever's glowing hint. */
function fastestNotchUnder(limit: number, scale: number): number | null {
  let best: number | null = null;
  LEVER_NOTCHES.forEach((n, i) => {
    if (n.speed > 0 && n.speed * scale <= limit + 1e-6) best = i;
  });
  return best;
}
