import './ui/styles.css';
import { Whistle } from './actions/whistle';
import { AudioEngine } from './audio/audio';
import { GAME_TITLE, GAME_TITLE_LINES, PARTNER_NAME } from './config';
import { StageEventBus } from './core/stage-events';
import { addToProgress, loadProgress, setResume, startSandbox, type Resume } from './core/progress';
import { abilitiesTaughtBefore, kakuninMission, kakuninRunAllowed, movieBounces, stageBounces, stageLockActive } from './core/kakunin';
import { ABILITY_CARD_TITLES, ABILITY_NAMES, abilityInUse, MissionRunner, type MissionPorts } from './mission/runner';
import { PhysicsWorld } from './physics/world';
import { listStageIds, loadAllRecords, loadStage, peekMovie, peekStage } from './stage/loader';
import { playMovie } from './movie/player';
import type { AbilityId, AmbienceKind, EnvironmentDef, GimmickDef, Vec3 } from './stage/types';
import type { RunSurface } from './audio/run-sound';
import {
  DOOR_REMIND_SECONDS,
  FESTIVAL,
  JUMP,
  LEVER_NOTCHES,
  LIGHT,
  MAGNET,
  MIRROR_WORLD,
  PLOW,
  PORTAL,
  LEAD,
  RECORD,
  WINDUP,
  SNOW_WAVE,
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
import { ambienceAt, ambienceZones, sectionOf } from './stage/sections';
import { param, zoneAt } from './gimmick/zones';
import { BoughSystem } from './gimmick/bough';
import { showTitle } from './ui/title';
import { createToast } from './ui/toast';
import { CAMERA_LABELS, CAMERA_MODES, createSceneView, type CameraFx, type CameraMode } from './view';
import { reversedCamera } from './view/camera-rig';
import { REVERSE_LINES, ReverseSystem, type ReverseLine, type ReversePhase } from './gimmick/reverse';
import { createReverseSwitch } from './ui/reverse-switch';
import { createCameraButton } from './ui/camera-button';
import { createStopGauge } from './ui/stop-gauge';
import { createDiveButton, createJumpButton, createLightButton, createPlowButton, createRocketButton } from './ui/ability-buttons';
import { createCountdownPanel } from './ui/countdown-panel';
import { createSkipButton, type SkipButton } from './ui/skip-button';
import { createLetterbox, LETTERBOX_PART } from './ui/letterbox';
import { TrainWatch } from './cutscene/train-watch';
import { RocketSystem } from './gimmick/rocket';
import { SlopeSystem } from './gimmick/slope';
import { DiveSystem } from './gimmick/dive';
import { PlowSystem } from './gimmick/plow';
import { PlowHint } from './gimmick/plow-hint';
import { IceSystem, iceZones, thinIceZones } from './gimmick/ice';
import { ThinIceSystem } from './gimmick/thin-ice';
import { MirrorSystem } from './gimmick/mirror';
import { MirrorFlipSystem } from './gimmick/mirror-flip';
import { PhantomSystem } from './gimmick/phantom';
import { TunnelSystem } from './gimmick/tunnel';
import { LightSwitch } from './gimmick/light-switch';
import { MagnetSystem } from './gimmick/magnet';
import { IronProps } from './gimmick/iron-props';
import { fallsLoudness, underFalls, waterfalls } from './gimmick/waterfall';
import { Vector3 } from 'three';
import { showZukan } from './ui/zukan';
import { loadSettings, saveSettings, VOLUME_GAIN, type Settings } from './core/settings';
import { showSettings } from './ui/settings';
import { showParents } from './ui/parents';
import { createKakuninBadge, showKakuninList } from './ui/kakunin';
import { createPause } from './ui/pause';
import { showMap, type MapChoice, type MapEnding, type MapFinale, type MapIsland, type MapTeaser } from './ui/map';
import world from './world/world.json';
import type { WorldFile } from './world/types';
import {
  chapterDone,
  crossPages,
  ENDING_SEEN,
  endingBridges,
  endingDue,
  knownPages,
  laidLinks,
  linkOptions,
  openingPage,
  type PageFacts,
} from './world/pages';

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
 * that wait for the end's card, grow after it and are saved once they are all in (§3.6). v1.11 (PR10): the world's end
 * 「せかいの わ」 plays once after 6-1 (docs/PHASE9_CHAPTER5_6.md 第 1 部 §5.2), after a chapter's end if both are due; its
 * mark "finale:world" is saved once its card is closed.
 */
async function openMap(root: HTMLElement, audio: AudioEngine, options: { next?: string; closeLabel?: string }): Promise<MapChoice> {
  const file = world as unknown as WorldFile;
  const progress = loadProgress();
  const resume = await savedResume();
  const islands: MapIsland[] = [];
  // v1.11 (PHASE9_CHAPTER5_6 §0.4): the abilities stages before this one give (in world order), for "takeable".
  const givenBefore = new Set<string>();
  for (const island of file.islands) {
    const stage = await peekStage(island.id);
    if (!stage) {
      islands.push({ id: island.id, title: null, unlocked: false, cleared: false, recordsFound: 0, recordsTotal: 0, needsLater: false });
      continue;
    }
    const missing = stage.records.filter((r) => !progress.records.includes(r.id));
    // What the child has at this stage's start: the earlier stages' abilities and its own opening's.
    const atStart = new Set([...givenBefore, ...stage.openingUnlocks]);
    for (const a of stage.unlocks) givenBefore.add(a);
    islands.push({
      id: island.id,
      title: stage.title,
      unlocked: stage.unlock.requires.every((r) => progress.cleared.includes(r)),
      cleared: progress.cleared.includes(island.id),
      recordsFound: stage.records.length - missing.length,
      recordsTotal: stage.records.length,
      needsLater: missing.some((r) => r.requires !== null && !progress.abilities.includes(r.requires)),
      // A record for an ability this stage does not give at its start, and the child has it now: come back for it.
      takeable: missing.some((r) => r.requires !== null && !atStart.has(r.requires) && progress.abilities.includes(r.requires)),
      resumeMission: resume?.stage === island.id ? resume.mission : undefined,
    });
  }
  const done = (id: number): boolean => {
    const chapter = file.chapters.find((c) => c.id === id);
    return !!chapter && chapterDone(file, chapter, progress.cleared, listStageIds());
  };
  // A rail is laid once its `from` is cleared, and a rail out of a chapter (`afterChapter`) once that chapter is done.
  const laid = laidLinks(file, progress.cleared, listStageIds());
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
  // v1.11 (PR10): the world's end, when its clears are there and it was not seen yet.
  const worldEnd = file.ending && endingDue(file, progress.cleared, progress.mapLinks, listStageIds()) ? file.ending : undefined;
  // The rails out of its last island (6-2's, PR11b) grow after it.
  const endingLater = worldEnd ? fresh.filter((key) => key.startsWith(`${worldEnd.after}>`)) : [];
  // Through the gate to another page, or waiting for this end's card: they grow after it, saved once they are in.
  const later = fresh.filter(
    (key) =>
      key !== ending?.link &&
      (crossPages(file, key) !== null || (!!endingChapter && linkOptions(file, key)?.afterChapter === endingChapter.id) || endingLater.includes(key)),
  );
  addToProgress('mapLinks', fresh.filter((key) => key !== ending?.link && !later.includes(key)));
  let finale: MapFinale | undefined;
  if (endingChapter && ending) {
    const light = ending.light ?? 'gold';
    const last = ending.path?.[ending.path.length - 1];
    const lastChapter = file.islands.find((i) => i.id === last)?.chapter;
    const opens = islands.find((i) => i.id === last && i.unlocked && !i.cleared);
    // v1.11 (PR9): the island the fireflies' big light lands on (the castle, 6-1), when it opens with this end.
    const target = islands.find((i) => i.id === ending.target && i.title && i.unlocked && !i.cleared);
    finale = {
      chapter: endingChapter.id,
      link: ending.link,
      ring: ending.ring,
      path: ending.path,
      light,
      target: ending.target,
      // The water light ends on the next chapter's first island: it wakes up then, and snow falls on its chapter.
      // v1.11: the fireflies' path wakes its last island the same way (when it opens with the end).
      wake: [...((light === 'water' || light === 'firefly') && opens ? [opens.id] : []), ...(light === 'firefly' && target ? [target.id] : [])],
      snow: light === 'water' ? file.islands.filter((i) => i.chapter === lastChapter).map((i) => i.id) : undefined,
      onHop: () => (light === 'water' ? audio.playBubblePop() : light === 'firefly' ? audio.playFirefly() : audio.playRecord()),
      // v1.11: the fireflies' big light lands on the castle (6-1), which wakes up: its windows light, "ちりりん".
      onLand: () => audio.playFirefly(),
      onWindows: () => audio.playWindows(),
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
    ending: !!worldEnd,
  };
  // The world's end lays every page side by side.
  const pages = worldEnd ? [...new Set([...knownPages(file, facts), ...(file.pages ?? []).map((p) => p.id)])].sort((a, b) => a - b) : knownPages(file, facts);
  const worldEnding: MapEnding | undefined = worldEnd && {
    trail: worldEnd.trail,
    home: worldEnd.home,
    after: worldEnd.after,
    bridges: endingBridges(file, pages),
    later: endingLater,
    // The song "sekai" once (it does not loop), a bell on each island, "きらーん" for each rainbow rail.
    onStart: () => audio.playMusic('sekai'),
    onStep: (i) => audio.playWorldStep(i),
    onBridge: () => audio.playBridge(),
    onShown: async () => {
      await showCard(root, worldEnd.card, worldEnd.button, worldEnd.icon, FINALE_CARD_GUARD_SECONDS);
      addToProgress('mapLinks', [ENDING_SEEN]);
    },
  };
  // v1.11 (PR9, 第 1 部 §3.4): a child who saw a chapter's end before the island its light flew to was there (the
  // castle, 6-1): the new rail to it grows, and as it gets there the castle wakes and its windows light.
  const seenEnd = file.chapters.find((c) => c.finale?.target && progress.mapLinks.includes(`finale:${c.id}`) && fresh.some((key) => key.endsWith(`>${c.finale?.target}`)));
  const wakeTarget = seenEnd?.finale?.target;
  const windows = wakeTarget ? { island: wakeTarget, link: fresh.find((key) => key.endsWith(`>${wakeTarget}`)) ?? '', onWindows: () => audio.playWindows() } : undefined;
  // v1.11 (PR9b): the island a chapter's end flies its big light to (the castle, 6-1) sleeps until the child has seen
  // that end ("finale:5"); from then on it is awake with its windows lit.
  const lightTargets = file.chapters.filter((c) => c.finale?.target && !c.finale.target.startsWith('teaser:'));
  const seenTarget = (c: (typeof lightTargets)[number]): boolean => progress.mapLinks.includes(`finale:${c.id}`);
  const choice = await showMap(root, file, {
    ending: worldEnding,
    windows,
    asleep: lightTargets.filter((c) => !seenTarget(c)).map((c) => c.finale?.target ?? ''),
    lit: lightTargets.filter(seenTarget).map((c) => c.finale?.target ?? ''),
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
  // The world's end's song played once: back on the title its music box plays again.
  if (worldEnd && audio.musicId === 'sekai') audio.playMusic('title');
  return choice;
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
    // v1.11 (PR9): the same rule as the map's (6しょう stays ☆ while 6-2 is not on the map yet).
    out.push({ label: `${chapter.id}しょう`, done: chapterDone(file, chapter, cleared, listStageIds()), faint: !open });
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

/**
 * v1.12 (えんしゅつ): `?movie=<id>`: a movie (src/movie/player.ts) instead of a stage. Behind the かくにん lock (dev and
 * browser automation are not locked), or opened by the save (the ending once 6-2 is cleared). From the check mode's
 * list (`kakunin=1`) it goes back to the list after its card; otherwise to the title.
 */
async function bootMovie(params: URLSearchParams, id: string): Promise<void> {
  if (await movieBounces(params, loadProgress(), peekMovie)) {
    location.replace(location.pathname);
    return;
  }
  const kakunin = params.get('kakunin') === '1' && kakuninRunAllowed();
  // TODO(6-2): a child watching it again (「もういちど みる」) skips with "▶▶" once it has been seen (keep a mark of it
  // in the save, like the map's "finale:" marks). Until then only the owner's check (and dev) can skip.
  const owner = kakunin || !stageLockActive();
  document.title = GAME_TITLE;
  app.dataset.build = __BUILD_ID__;
  await playMovie(id, app, viewEl, uiEl, {
    skippable: owner,
    startButton: true,
    onDone: () => {
      if (kakunin) showKakuninList(uiEl, { onClose: () => (location.href = location.pathname) });
      else location.href = location.pathname;
    },
  });
}

/**
 * v1.12: TODO(6-2): the hook for the ending movie. After 6-2's clear card (the end of boot() below), and from the
 * title's 「もういちど みる」 once 6-2 is cleared, the game goes here; the movie then goes back to the title.
 */
export function goToMovie(id: string): void {
  location.search = `?movie=${encodeURIComponent(id)}`;
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const movie = params.get('movie');
  if (movie !== null) {
    await bootMovie(params, movie);
    return;
  }
  // The `?stage=` lock (src/core/kakunin.ts): a kid's address bar cannot open a test stage or one the save has not opened.
  if (await stageBounces(params, loadProgress(), peekStage)) {
    location.replace(location.pathname);
    return;
  }
  const stageId = params.get('stage') ?? '1-1';
  // 「かくにん モード」: the run plays in memory only; nothing reaches the progress save.
  const kakunin = params.get('kakunin') === '1' && kakuninRunAllowed();
  if (kakunin) startSandbox();

  const [stage, physics] = await Promise.all([loadStage(stageId), PhysicsWorld.create()]);
  for (const rail of stage.file.rails) railLooks.set(rail.id, rail.look);
  const hasMissions = stage.file.missions.length > 0;
  // The hidden test course has every button, so the jump, the light, the rocket and diving can be tried there.
  // v1.11 (PR5): and the magnet light (the light button's third step), for its side way "jishaku".
  // v1.11 (PR8a): and うしろむき (the まえ／うしろ switch), for its back siding "ura".
  // A check run starts at mission `mission=` with every ability the stage needs there (what its opening and the
  // missions before taught, besides the save's and the stages before's).
  const kakuninFrom = kakunin ? kakuninMission(params, stage.file.missions.length) : 0;
  const abilities = new Set<AbilityId>(
    hasMissions
      ? [
          ...loadProgress().abilities,
          ...(await inheritedAbilities(stageId)),
          ...(kakunin ? abilitiesTaughtBefore(stage.file, kakuninFrom) : []),
        ]
      : ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight', 'reverse'],
  );
  const train = new Train(stage.network, stage.file.junctions, stage.file.start, {
    waters: stage.file.environment.water ?? [],
    floaters: stage.file.floaters ?? [],
  });
  // v1.11 (PR8a): the back junctions (switchbacks), and the stop lines the trail's floor moves up to (A5.2).
  train.setBackJunctions(stage.backJunctions);
  train.setStationLines(stage.file.stations.map((st) => ({ railId: st.railId, at: st.at })));
  // 2-3: slopes and the rocket also work on the test course (no mission runner there).
  const slopes = new SlopeSystem(stage.file.gimmicks, train);
  const rocket = new RocketSystem(stage.file.gimmicks, train, slopes);
  // v1.10: records found so far (the save's; the test course's only for this run), for the dive button's glow.
  const foundRecords = new Set<string>(hasMissions ? loadProgress().records : []);
  // v1.10: "もぐる" (its own button since PHASE9_0): where it helps (the hint and the glow).
  const dive = new DiveSystem(train, stage.records, (id) => foundRecords.has(id));
  let diveBounces = 0;
  // v1.10 (4-2): snow walls (the train bursts them or bumps them), and where "ゆきかき" helps (its button's glow).
  const plow = new PlowSystem(stage.file.gimmicks, train, (index, state, cleared, instant) =>
    events.post({ type: 'plow:wall', index, state, cleared, instant }),
  );
  const plowHint = new PlowHint(plow, train);
  // v1.10 (4-1): ice (weaker brakes, the glowing notches at an ice station), thin ice (only the rocket gets across,
  // it lights the rocket button) and ice mirrors.
  const ice = new IceSystem(stage.file.gimmicks, stage.file.stations, train);
  const thinIce = new ThinIceSystem(stage.file.gimmicks, train, rocket);
  // v1.10 (4-3): the rocket also glows when the snow wave is close (the runner knows the wave).
  rocket.extraGlow = () => thinIce.glow || (runner?.chaseRocketGlow ?? false);
  const mirrors = new MirrorSystem(stage.file.gimmicks, train);
  // v1.11 (5-3): "かがみの なか" (the view mirrored between two gates; a whistle gate holds the train until it opens) and
  // Sakasa's phantoms (a false way, a false bridge; never in a mirror).
  const flip = new MirrorFlipSystem(stage.file.gimmicks, train);
  const phantoms = new PhantomSystem(stage.file, train);
  // v1.10 (4-3): tunnels (dark inside; the light button glows for them).
  const tunnels = new TunnelSystem(stage.file.gimmicks, train);
  // v1.11 (PR5): the magnet light's iron targets (unopened gaps and gates stop the train: "ぽよん") and the iron odds
  // and ends by the line. Both do nothing until the magnet light is learned (showAbility).
  const magnet = new MagnetSystem(stage.magnets, train, stage.file.junctions, (id) => foundRecords.has(id));
  // v1.11 (PR8a): うしろむき: the switch's glow and the partner's lines (nothing until it is learned: showAbility).
  const reverse = new ReverseSystem(stage, train, { found: (id) => foundRecords.has(id), stepStation: () => runner?.stepStation ?? null });
  // The shut whistle gates (5-3) and the unopened magnet gaps and gates: "ぽよん" before them.
  train.setBlocks(() => [...flip.blocks(), ...magnet.blocks()]);
  const ironProps = new IronProps(stage.ironProps, train);
  const hasMagnetHooks = stage.magnets.length > 0 || stage.ironProps.length > 0;
  const hasIce = iceZones(stage.file.gimmicks).length > 0 || thinIceZones(stage.file.gimmicks).length > 0;
  // v1.11 (5-1): a stage with the night's mechanisms (their test hooks are written every frame).
  const hasNight =
    stage.file.gimmicks.some((g) => g.type === 'hush' || g.type === 'whistle-reversed') ||
    stage.file.junctions.some((j) => j.fireflies) ||
    stage.file.actors.some((a) => a.type === 'lure' || (a.params as { glare?: boolean } | undefined)?.glare === true);
  // v1.11 (6-1): a stage with "おいかけっこ", "ドアを あけて まつ" or the friends riding along (their test hooks).
  const hasLeadHooks =
    stage.file.missions.some((m) => m.steps.some((st) => st.lead || st.welcome)) ||
    Object.values(stage.file.cutscenes ?? {}).some((steps) => steps.some((st) => 'crew' in st || 'depart' in st));
  const whistle = new Whistle();
  const audio = new AudioEngine();
  if (hasLeadHooks) {
    app.dataset.crew = '';
    app.dataset.depart = '';
  }
  // The island's quiet sound around the train (from the first tap on; under the title too). v1.10 (3-3): the sea's
  // faraway volcano only where there is a volcano.
  audio.setAmbience(stage.file.environment.ambience ?? null, stage.file.props.some((p) => p.model === 'volcano'));
  const events = new StageEventBus();

  const view = createSceneView(params);
  await view.init(viewEl, stage, stage.network);
  events.on('event', (e) => view.onStageEvent(e));
  // v1.11 (PR11a, PHASE9_CHAPTER5_6 第 3 部 B6.4・A10): friends riding along from the start (6-2): Sakasa sits behind
  // the driver's seat, and hops to the rear window while reversing (#app[data-sakasa] "seat" / "rear").
  let crewOn = (stage.file.crew ?? []).length > 0;
  events.on('event', (e) => {
    if (e.type === 'crew') crewOn = true;
  });
  if (crewOn) {
    app.dataset.crew = (stage.file.crew ?? []).join(',');
    events.post({ type: 'crew', ids: [...(stage.file.crew ?? [])] });
  }

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
  // v1.12: prefers-reduced-motion: a cutscene shot's moves become cuts, the figures' motions smaller.
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  view.setReducedMotion?.(reducedMotion);
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
  let cutscenePress: { ability: 'light' | 'whistle' | 'rocket' | 'jump' | 'magnet'; done: () => void } | null = null;
  const pressWanted = (ability: 'light' | 'whistle' | 'rocket' | 'jump' | 'magnet'): boolean | null => {
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
        // v1.11 (5-1): in a whistle-reversed stretch it sounds reversed ("…っぴー"; it still works: PHASE9_0 §6).
        audio.playWhistle({ reversed: runner?.whistleReversed ?? false });
        // v1.11 (5-3): a shut mirror gate glowing ahead opens ("ぽわわん"); only once (the whistle's own rest spaces presses).
        flip.onWhistle();
        // v1.10 (3-3): in the dark the glowing motes flash ("ちりりん").
        const fog = zoneAt(stage.file.gimmicks, 'fog', train.state.railId, train.frontS);
        if (fog && typeof fog.params?.color === 'string') audio.playGlimmer();
        events.post({ type: 'whistle' });
      }
    },
    onJunction: (side) => {
      // v1.11 (PR8a): a back junction's arrows (reversing).
      if (train.backJunction) {
        train.chooseBack(side);
        return true;
      }
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
    const result = train.jump();
    // v1.11 (PR8a, A11): reversing, a little hop where it is ("ぴょこっ").
    if (result === 'hop') {
      audio.playHopBack();
      return;
    }
    if (result === 'ok') {
      // With a grasshopper on the roof the jump goes "びよーん".
      if (train.jumpBoost) audio.playHopperJump();
      else audio.playJump();
      events.post({ type: 'jump' });
    } else runner?.onJumpRefused(result);
  });
  // PHASE9_0: "もぐる" and "ゆきかき" on their own buttons, anywhere (the train's events play their sounds). A cutscene
  // waiting for another button keeps them quiet.
  const diveButton = createDiveButton(actionButtons, () => {
    audio.unlock();
    if (cutscenePress) return;
    train.dive();
  });
  const plowButton = createPlowButton(actionButtons, () => {
    audio.unlock();
    if (cutscenePress) return;
    train.plow();
  });
  let lightOn = false;
  // v1.11 (PR5): the light button's step (off → light → magnet → off; off ⇄ light before the magnet light).
  const lightSwitch = new LightSwitch(() => abilities.has('magnetLight'), () => simTime);
  const lightButton = createLightButton(actionButtons, () => {
    audio.unlock();
    // v1.10 (3-3): a cutscene asking for another button: the light waits. Asked for, it comes on (never off).
    // v1.11 (PR5): a cutscene's "press": "magnet" (the light is on already): the press turns it to the magnet step.
    if (cutscenePress?.ability === 'magnet') {
      lightSwitch.set('magnet');
      pressWanted('magnet');
      return;
    }
    const wanted = pressWanted('light');
    if (wanted === false) return;
    if (wanted === true) {
      if (lightSwitch.mode !== 'light') lightSwitch.set('light');
      return;
    }
    // One step on, with a short lockout so a double tap does not flicker it (LightSwitch).
    lightSwitch.press();
  });
  lightSwitch.events.on('mode', ({ mode, from }) => {
    const on = mode === 'light';
    lightOn = on;
    if (mode === 'magnet') audio.playMagnetOn();
    else audio.playLight(on);
    train.setSpeedCap('light', mode === 'off' ? null : { scale: LIGHT.speedScale });
    lightButton.setMode(mode);
    mirrors.lightOn = on;
    runner?.setLight(on);
    // "light" as before (the light's own step on or off), then the step itself (the beam's colour).
    if (on || from === 'light') events.post({ type: 'light', on });
    events.post({ type: 'light:mode', mode });
  });
  const rocketButton = createRocketButton(actionButtons, () => {
    audio.unlock();
    if (pressWanted('rocket') !== null) return;
    const result = rocket.press();
    if (!result.ok) {
      // v1.11 (PR8a, A11): reversing, "ぷすっ" and the partner says it does not work backwards.
      if (result.why === 'reverse') {
        audio.playPuff();
        if (!runner && simTime - rocketBackSaidAt > 4) {
          rocketBackSaidAt = simTime;
          void bubbles.say(REVERSE_LINES.refuseRocketBack);
        }
      }
      runner?.onRocketRefused(result);
    }
  });
  let rocketBackSaidAt = -Infinity;
  // v1.11 (PR8a, 第 3 部 A3): the まえ／うしろ switch beside the lever (shown once うしろむき is learned).
  let reverseToggles = 0;
  let pendingTickIn = 0;
  const reverseSwitch = createReverseSwitch(uiEl, () => {
    audio.unlock();
    if (cutscenePress) return;
    train.pressSwitch();
  });
  const showAbility = (ability: AbilityId): void => {
    abilities.add(ability);
    app.dataset.abilities = [...abilities].sort().join(',');
    if (ability === 'jump') jumpButton.show();
    if (ability === 'dive') {
      dive.enabled = true;
      diveButton.show();
    }
    if (ability === 'plow') {
      plow.enabled = true;
      plowButton.show();
    }
    if (ability === 'light') lightButton.show();
    if (ability === 'magnetLight') {
      // v1.11 (PR5): the light button's third step, the magnet targets and the odds and ends by the line.
      magnet.enabled = true;
      ironProps.enabled = true;
      lightButton.setSteps(3);
    }
    if (ability === 'rocket') {
      rocket.enabled = true;
      rocketButton.show();
      app.dataset.hasRocket = '1';
    }
    if (ability === 'reverse') {
      reverse.enabled = true;
      reverseSwitch.show();
      app.dataset.hasReverse = '1';
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
  const FALL_COLORS = { dark: '#000000', cloud: '#ffffff', leaf: '#d6efb4', water: '#cdeefe', snow: '#f2f7fc', balls: '#ffe0f0' } as const;
  const fade = createFade(uiEl, FALL_COLORS[stage.file.environment.fall ?? 'dark']);
  /**
   * v1.11 (PR2c): a cutscene changes the look (day ⇄ night): the stage's own environment with the step's fields written
   * over it, behind a short dusk-blue fade (at once when fast-forwarded). The sound around follows it.
   */
  const lookFade = createFade(uiEl, '#1b2350', 'look-fade');
  app.dataset.lighting = stage.file.environment.lighting;
  const hasVolcanoProp = stage.file.props.some((p) => p.model === 'volcano');
  /**
   * v1.11 (PR11a, PHASE9_CHAPTER5_6 第 3 部 B6.1): a stage in sections looks as the section the view is in (checked
   * every frame from train.viewAnchor: the rear window reversing, the lead car else; a rewind or a resume anywhere
   * lands in its section's look at once). Its sound around, its rails' sound, its fall's colour go with it.
   */
  const sections = stage.sections;
  let section = sectionOf(sections, stage.file.start.railId);
  /** The look as last applied (a cutscene's change over the section's or the stage's own). */
  let look: EnvironmentDef = section?.environment ?? stage.file.environment;
  /** v1.11 (PR11a, B6.5): the `ambience` stretches; the sound around as last set. */
  const ambiences = ambienceZones(stage.file.gimmicks);
  let ambienceNow: AmbienceKind | null = look.ambience ?? null;
  const applyLook = (env: Partial<EnvironmentDef>): void => {
    look = { ...(section?.environment ?? stage.file.environment), ...env };
    view.applyEnvironment(look, section?.centre);
    ambienceNow = look.ambience ?? null;
    audio.setAmbience(ambienceNow, hasVolcanoProp);
    app.dataset.lighting = look.lighting;
    if (sections.length > 0) {
      app.dataset.sky = look.sky.top;
      fadeEl.style.background = FALL_COLORS[look.fall ?? 'dark'];
    }
  };
  const fadeEl = uiEl.querySelector<HTMLElement>('#fade') as HTMLElement;
  if (section) {
    app.dataset.section = section.id;
    applyLook({});
  }
  /** Every frame: the section the view is in (its look when it changed), and an `ambience` stretch's sound. */
  const updateSection = (): void => {
    const at = train.viewAnchor;
    if (sections.length > 0) {
      const now = sectionOf(sections, at.railId);
      if (now && now !== section) {
        section = now;
        app.dataset.section = now.id;
        // Built a slice a frame since the stage came up: whatever is left of it now (B13).
        view.buildSection?.(now.id);
        applyLook({});
      }
    }
    if (ambiences.length > 0) {
      const kind = ambienceAt(ambiences, at.railId, at.s)?.kind ?? look.ambience ?? null;
      if (kind !== ambienceNow) {
        ambienceNow = kind;
        audio.setAmbience(kind, hasVolcanoProp);
      }
      app.dataset.ambience = kind ?? '';
    }
  };
  let lookChanges = 0;
  events.on('event', (e) => {
    if (e.type !== 'environment') return;
    lookChanges += 1;
    app.dataset.lookChanges = String(lookChanges);
    if (e.seconds <= 0) {
      applyLook(e.env);
      return;
    }
    void (async () => {
      await lookFade(true, e.seconds * 0.45);
      applyLook(e.env);
      await lookFade(false, e.seconds * 0.45);
    })();
  });
  const doorButton = createDoorButton(actionButtons);
  const countdownPanel = createCountdownPanel(uiEl);
  // Speed lines at the screen edges while the rocket burns (CSS, shown by #app[data-burn="1"]).
  const speedLines = document.createElement('div');
  speedLines.className = 'speed-lines';
  speedLines.innerHTML = '<span></span>'.repeat(8);
  uiEl.appendChild(speedLines);

  // v1.12 (えんしゅつ): a cutscene's shot (the view frames a figure; it wins over every other camera), the letterbox and
  // the waits for the train to pass a place.
  let shotOn = false;
  const letterbox = createLetterbox(uiEl, app);
  const trainWatch = new TrainWatch();
  // Camera: the player picks a mode; the game may override it for a moment (doors, cutscenes).
  let userCamera: CameraMode = 'cab';
  let cameraOverride: CameraMode | null = null;
  // Stage camera zones (gimmicks "camera"): e.g. the outside view while the train rides a loop upside down.
  let zoneCamera: CameraMode | null = null;
  // v1.7: a cutscene's camera standing still (the ending's view from the sea).
  let fixedCamera: { at: Vec3; lookAt: Vec3; reach?: number } | null = null;
  // The title screen's camera circling the train (set while the title is up).
  let orbiting = false;
  // v1.11 (PR8a × 6-1): Sakasa following a train backing up keeps the view the child picked (#app[data-camera-hold]).
  let leadHoldsFront = false;
  app.dataset.cameraHold = '';
  const applyCamera = (snap = false): void => {
    const picked = cameraOverride ?? zoneCamera ?? userCamera;
    // v1.11 (PR8a, A10): reversing, the cab turns into the rear window and "うしろから" into the view from ahead.
    const mode = train.reversing && !leadHoldsFront ? reversedCamera(picked) : picked;
    view.setCamera(mode, snap);
    view.setFixedCamera(fixedCamera);
    app.dataset.camera = shotOn ? 'shot' : fixedCamera ? 'fixed' : orbiting ? 'orbit' : mode;
    cameraButton.setMode(picked);
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
    // v1.11 (5-2): into the ball pit under a toy-block gap: "ぼよよん… ぽふっ".
    if (stage.file.environment.fall === 'balls') audio.playBallPit();
    else audio.playFall();
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

  // v1.11 (PR5): the magnet light's sounds and events; "ぽよん" off a film or a gate is the runner's soft fail (the test
  // course puts the train back itself); a record pulled to the train is found (the runner's; the test course's here).
  let magnetBumps = 0;
  let magnetHintPosted: string | null = null;
  let testCourseFailing = false;
  magnet.events.on('pull', ({ target, seconds }) => {
    audio.playMagnetPull(seconds);
    events.post({ type: 'magnet:pull', id: target.id, kind: target.kind, seconds, distance: magnet.pulling?.distance ?? 0 });
  });
  magnet.events.on('caught', ({ target, instant }) => {
    if (!instant) {
      if (target.kind === 'bridge') audio.playRailSnap();
      else if (target.kind === 'pick') audio.playMagnetCatch();
    }
    events.post({ type: 'magnet:caught', id: target.id, instant });
    if (!hasMissions && target.recordId && !foundRecords.has(target.recordId)) {
      const record = stage.records.find((r) => r.def.id === target.recordId);
      if (record) {
        foundRecords.add(record.def.id);
        app.dataset.records = [...foundRecords].join(',');
        events.post({ type: 'record:found', id: record.def.id });
        toast.show(`みつけた！\n${record.def.name}`, 'perfect');
        audio.playRecord();
      }
    }
  });
  magnet.events.on('open', ({ target, instant }) => {
    if (!instant && target.kind === 'gate') audio.playGateOpen();
    // A turn with `mirror` turns 5-3's framed mirror round (its own "きらーん"); without, PR5's code-drawn stand-in.
    if (target.kind === 'turn' && target.mirror) {
      events.post({ type: 'mirror:turn', id: target.mirror, face: 'front', seconds: MIRROR_WORLD.turnSeconds, instant });
    } else if (!instant && target.kind === 'turn') audio.playMirror();
    events.post({ type: 'magnet:open', id: target.id, instant });
    // The test course has no runner to show the fork's true way.
    if (!hasMissions && target.kind === 'turn' && target.junction) events.post({ type: 'sign:reveal', junctionId: target.junction });
  });
  magnet.events.on('miss', ({ target }) => events.post({ type: 'magnet:miss', id: target.id }));
  train.events.on('magnetBounce', ({ id }) => {
    magnetBumps += 1;
    audio.playMagnetBounce();
    events.post({ type: 'magnet:bump', id });
    if (hasMissions) return;
    // Test course: put the train back before it (the fade in the stage's fall colour).
    const target = stage.magnets.find((t) => t.id === id);
    const back = target?.rewind ?? { railId: train.state.railId, at: Math.max(0, train.frontS - MAGNET.rewindBefore) };
    testCourseFailing = true;
    void (async () => {
      await waitSeconds(0.8);
      await fade(true, 0.4);
      train.rewindTo(back.at, back.railId);
      rocket.reset();
      rocket.refill();
      ui.lever.setNotch(STOP_NOTCH);
      events.post({ type: 'rewind' });
      testCourseFailing = false;
      await fade(false, 0.4);
    })();
  });
  ironProps.events.on('biyon', ({ prop }) => {
    audio.playIronBiyon();
    if (prop.look === 'bell') audio.playSignBell();
    events.post({ type: 'iron:biyon', index: prop.index, look: prop.look });
  });
  ironProps.events.on('karan', ({ prop }) => {
    audio.playIronKaran();
    events.post({ type: 'iron:karan', index: prop.index, look: prop.look });
  });
  events.on('event', (e) => {
    if (e.type !== 'rewind') return;
    // A flight going on lands at once (a record is found); picks and odds and ends are back; open things stay open.
    magnet.reset();
    ironProps.reset();
    // A turned mirror still shows its fork's true way.
    for (const t of stage.magnets) {
      if (t.kind === 'turn' && t.junction && magnet.state(t.id) === 'open') events.post({ type: 'sign:reveal', junctionId: t.junction });
    }
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
  train.events.on('bob', ({ land }) => {
    bobs += 1;
    app.dataset.bobs = String(bobs);
    // PHASE9_0 §3: on land a mole's dig ("ずぶっ" … "ぽこっ"), elsewhere bubbles.
    if (land) audio.playDig();
    else audio.playBubbles();
    events.post({ type: 'dive', state: 'bob', land });
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
  // PHASE9_0 §3: the snowplow pressed with no snow ahead flings petals ("ずざーっ").
  let petals = 0;
  train.events.on('petals', () => {
    petals += 1;
    app.dataset.petals = String(petals);
    audio.playPlowSpray(Math.max(4, Math.abs(train.state.speed)));
    events.post({ type: 'plow:petals' });
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
  // ---- v1.11 (5-3) the mirror world: the view mirrored between two gates, the whistle gate, phantoms, glass ----
  const mirrorWorld = flip.sections.length > 0 || phantoms.phantoms.length > 0 || stage.file.rails.some((r) => r.glass?.length) || mirrors.mirrors.some((m) => m.id !== '');
  const mirrorFade = document.createElement('div');
  mirrorFade.className = 'mirror-fade';
  mirrorFade.id = 'mirror-fade';
  mirrorFade.addEventListener('animationend', () => mirrorFade.classList.remove('is-on'));
  uiEl.prepend(mirrorFade);
  /** The shimmer the view turns round behind ("しゃらん"). */
  const shimmer = (): void => {
    mirrorFade.classList.remove('is-on');
    void mirrorFade.offsetWidth;
    mirrorFade.classList.add('is-on');
  };
  const turnedMirrors = new Map<string, 'front' | 'back'>();
  if (mirrorWorld) {
    app.dataset.flip = '';
    app.dataset.flips = '0';
    app.dataset.gateBumps = '0';
    app.dataset.phantoms = phantoms.list;
    app.dataset.glass = '0';
    app.dataset.mirrorFacing = '';
  }
  flip.events.on('in', ({ section, instant }) => {
    app.dataset.flips = String(flip.flips);
    events.post({ type: 'flip:in', id: section.id, instant });
    if (instant) return;
    shimmer();
    audio.playMirrorGate();
    runner?.sayMirrorWorld('flipIn', { own: section.line });
  });
  flip.events.on('out', ({ section, instant }) => {
    events.post({ type: 'flip:out', id: section.id, instant });
    if (instant) return;
    shimmer();
    audio.playMirrorGate();
    runner?.sayMirrorWorld('flipOut', { own: section.lineOut });
  });
  flip.events.on('near', (section) => runner?.sayMirrorWorld('mirrorGateNear', { tag: section.id }));
  flip.events.on('open', ({ section, byWhistle }) => {
    events.post({ type: 'flip:gate', id: section.id, state: 'open', instant: !byWhistle });
    if (!byWhistle) return;
    audio.playMirrorRipple();
    runner?.sayMirrorWorld('mirrorGateOpen', { tag: section.id });
  });
  flip.events.on('bump', ({ section }) => {
    app.dataset.gateBumps = String(flip.bumps);
    audio.playMirrorBump();
    events.post({ type: 'flip:gate', id: section.id, state: 'bump' });
    runner?.sayMirrorWorld('mirrorGateBump', { tag: section.id });
    runner?.sayMirrorWorld('mirrorGateAfter', { tag: section.id });
  });
  phantoms.events.on('change', ({ id, state }) => {
    app.dataset.phantoms = phantoms.list;
    events.post({ type: 'phantom', id, state });
    if (state !== 'solid') audio.playPhantomPop();
  });
  // Glass: "しゃららん" the first time in a mission the train front goes onto it.
  const glassRails = new Map(stage.file.rails.filter((r) => r.glass?.length).map((r) => [r.id, r.glass ?? []]));
  let onGlass = false;
  let glassMission = -2;
  const updateGlass = (): void => {
    if (glassRails.size === 0) return;
    const f = train.frontS;
    const on = (glassRails.get(train.state.railId) ?? []).some((k) => f >= k.from && f <= k.to);
    if (on === onGlass) return;
    onGlass = on;
    app.dataset.glass = on ? '1' : '0';
    events.post({ type: 'glass', on });
    const mission = runner?.missionIndex ?? -1;
    if (on && mission !== glassMission) {
      glassMission = mission;
      audio.playGlassOn();
    }
  };
  events.on('event', (e) => {
    if (e.type === 'sign:reveal') phantoms.onReveal(e.junctionId);
    if (e.type === 'sign:reset') phantoms.reset(e.junctionId);
    if (e.type === 'rewind') {
      phantoms.reset();
      flip.reset();
    }
    if (e.type === 'mirror:turn') {
      // A cutscene's fx "mirrorTurn" (and the magnet's "turn", PR5/PR6b): the mirror turns round and stays so.
      if (mirrors.turn(e.id, e.face) && !e.instant) audio.playMirrorTurn(e.face === 'front');
      turnedMirrors.set(e.id, e.face);
      app.dataset.mirrorFacing = [...turnedMirrors].map(([id, face]) => `${id}:${face}`).join(',');
    }
  });
  events.on('event', (e) => {
    if (e.type === 'rewind') {
      snowSplat.classList.remove('is-on');
      chasePuff.classList.remove('is-on');
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
  // v1.10 (4-3): the snow wave close behind: powder blowing past the screen edge (CSS shows it by #app[data-chase]),
  // and caught, soft snow swelling up from the bottom ("もふっ").
  const chaseVignette = document.createElement('div');
  chaseVignette.className = 'chase-vignette';
  chaseVignette.innerHTML = Array.from({ length: 10 }, (_, i) => `<i style="left:${(i * 9.7 + 4) % 100}%;--dx:${((i % 5) - 2) * 40};animation-delay:${((i * 0.29) % 1.4).toFixed(2)}s"></i>`).join('');
  uiEl.prepend(chaseVignette);
  const chasePuff = document.createElement('div');
  chasePuff.className = 'chase-puff';
  chasePuff.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
  uiEl.prepend(chasePuff);
  let chaseSoundIn = 0;
  if (tunnels.zones.length > 0) app.dataset.tunnel = '0';
  tunnels.events.on('inside', (z) => {
    app.dataset.tunnel = z ? '1' : '0';
    events.post({ type: 'tunnel', index: z ? z.index : null });
  });
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
    // v1.11 (5-2): a spinning fork shows no arrows (its flag and the whistle's glow are the sign).
    // v1.11 (5-3): nor does a turned-away mirror's fork (only the magnet turns the mirror round to show the way).
    if (e.junction.spin || e.junction.turn) {
      ui.junction.hide();
      ui.junction.spin(e.junction.id);
      return;
    }
    ui.junction.spin(null);
    // v1.11 (PR5): a fork whose true way a mirror shows (magnet "turn"): no arrows (only the magnet sees it through).
    if (e.junction.turn) {
      ui.junction.hide();
      return;
    }
    const ability = e.junction.needs;
    const side = e.default === 'left' ? 'right' : 'left';
    ui.junction.show({ ...e, needs: ability ? { side, ability, has: abilities.has(ability) } : undefined, bubbles: e.junction.bubbles });
    // v1.11 (5-1): the fireflies already showed the true way (called before the arrows came): its arrow lights.
    const shown = runner?.revealedSide(e.junction.id);
    if (shown) ui.junction.reveal(shown);
  });
  train.events.on('junctionLocked', () => ui.junction.hide());
  train.events.on('junctionPassed', () => ui.junction.hide());

  // ---- v1.11 (PR8a) うしろむき (PHASE9_CHAPTER5_6 第 3 部 第 A 部) ----------------------------------------------------
  // The rear window's frame (CSS shows it by #app[data-camera="rear"]) and the swirl crossing the screen as it turns.
  const rearWindow = document.createElement('div');
  rearWindow.className = 'rear-window';
  rearWindow.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12m-1.5 0a1.5 1.5 0 1 1 3 0a3.5 3.5 0 1 1-7 0a5.5 5.5 0 1 1 11 0a7.5 7.5 0 1 1-15 0" fill="none" stroke="#E75BA0" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  uiEl.prepend(rearWindow);
  const swirl = document.createElement('div');
  swirl.className = 'reverse-swirl';
  swirl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12m-1.5 0a1.5 1.5 0 1 1 3 0a3.5 3.5 0 1 1-7 0a5.5 5.5 0 1 1 11 0a7.5 7.5 0 1 1-15 0a9.5 9.5 0 1 1 19 0" fill="none" stroke="#E75BA0" stroke-width="2" stroke-linecap="round"/></svg>`;
  swirl.addEventListener('animationend', () => swirl.classList.remove('is-on'));
  uiEl.prepend(swirl);
  app.dataset.reverseToggles = '0';
  app.dataset.reverseStop = '';
  app.dataset.backArrows = '';
  const turned = (on: boolean, instant: boolean): void => {
    if (!instant) {
      reverseToggles += 1;
      app.dataset.reverseToggles = String(reverseToggles);
      if (on) audio.playReverseOn();
      else audio.playReverseOff();
      swirl.classList.remove('is-on');
      void swirl.offsetWidth;
      swirl.classList.add('is-on');
    }
    app.dataset.reverseStop = '';
    // v1.11 (PR11a): Sakasa riding along hops to the rear window and back ("ぴょん").
    if (crewOn && !instant) audio.playSakasaHop();
    events.post({ type: 'reverse', on });
    // The camera swaps during the turn (the swirl covers it).
    applyCamera(true);
  };
  train.events.on('reverseOn', ({ instant }) => turned(true, instant));
  train.events.on('reverseOff', ({ instant }) => turned(false, instant));
  events.on('event', (e) => {
    if (e.type === 'rewind') reverse.reset();
  });
  train.events.on('switchPending', ({ on }) => {
    pendingTickIn = on ? 0 : Infinity;
  });
  train.events.on('reverseStop', ({ why }) => {
    app.dataset.reverseStop = why;
    if (why === 'buffer') audio.playReverseBump();
    else audio.playReverseStop();
    events.post({ type: 'reverse:stop', why });
  });
  train.events.on('backArrows', (e) => {
    app.dataset.backArrows = e.junction.id;
    ui.junction.spin(null);
    ui.junction.show({ left: e.left, right: e.right, default: e.default, back: true });
  });
  const backArrowsOff = (): void => {
    app.dataset.backArrows = '';
    ui.junction.hide();
  };
  train.events.on('backLocked', backArrowsOff);
  train.events.on('backPassed', backArrowsOff);
  train.events.on('backSiding', ({ junction }) => events.post({ type: 'reverse:siding', junction: junction.id }));
  // v1.11 (PR11a, PHASE9_CHAPTER5_6 第 3 部 B6.2): a gate ("もん"): the white comes in just before it ("ふわぁ・きらら"),
  // the other side's look and the camera are put at once while it is white, then it goes. The section ahead is
  // built in full first if it is not yet (B13). Test hooks: #fade[data-kind="gate"], #app[data-portals] (only goes
  // up), #app[data-portal] ("from>to" the last one).
  let gate: { rail: string; on: Promise<void> } | null = null;
  let portals = 0;
  const GATE_WHITE = '#fbfdff';
  const gateOut = (): void => {
    const was = gate;
    gate = null;
    void (async () => {
      await was?.on;
      if (gate) return;
      await fade(false, PORTAL.whiteSeconds);
      if (gate) return;
      delete fadeEl.dataset.kind;
      fadeEl.style.background = FALL_COLORS[look.fall ?? 'dark'];
    })();
  };
  train.events.on('portalAhead', ({ seconds }) => {
    audio.playGate();
    fadeEl.dataset.kind = 'gate';
    fadeEl.style.background = GATE_WHITE;
    gate = { rail: train.state.railId, on: fade(true, Math.max(0.05, Math.min(PORTAL.whiteSeconds, seconds))) };
  });
  train.events.on('portal', ({ from, to }) => {
    portals += 1;
    app.dataset.portals = String(portals);
    app.dataset.portal = `${from}>${to}`;
    updateSection();
    applyCamera(true);
    events.post({ type: 'portal', from, to });
    gateOut();
  });
  /** Every frame: a gate's white goes again if the train stopped before it; the section past it is built in time. */
  const updateGate = (): void => {
    if (gate && (train.state.railId !== gate.rail || train.state.speed < 1e-3)) gateOut();
    const rail = train.currentRail;
    if (rail.end.type === 'portal' && rail.length - train.frontS <= PORTAL.buildBefore) {
      const next = sectionOf(sections, rail.end.railId);
      if (next) view.buildSection?.(next.id);
    }
  };
  // The lines (a mission's words through the runner; the test course's straight to the bubble).
  reverse.events.on('line', (line: ReverseLine) => {
    if (runner) {
      runner.sayReverse(line);
      return;
    }
    const own = line.own?.map((l) => (typeof l === 'string' ? l : l.text));
    for (const text of own ?? [REVERSE_LINES[line.key]]) void bubbles.say(text);
  });
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

  // The small 「かくにん」 mark while a check run goes on; a tap opens the stage list over the game (held still).
  if (kakunin) {
    app.dataset.kakunin = '1';
    createKakuninBadge(uiEl, () => {
      const was = paused;
      paused = true;
      showKakuninList(uiEl, { open: stageId, onClose: () => (paused = was) });
    });
  }

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
    // v1.11 (PR10, 第 1 部 §5.7): once Sakasa has joined the team (the stage the world's end comes after, 6-1, cleared)
    // she rides in the first car on the title, seen through its window.
    const joinedAfter = (world as unknown as WorldFile).ending?.after;
    if (joinedAfter && loadProgress().cleared.includes(joinedAfter)) {
      view.setTitleCrew?.(true);
      app.dataset.titleCrew = 'sakasa';
    }
  }

  document.title = GAME_TITLE;
  app.dataset.stage = stage.file.id;
  app.dataset.build = __BUILD_ID__;
  console.info(`build ${__BUILD_ID__}`);
  app.dataset.ready = '1';
  // v1.11 (PR11a, B13): how long the page took to be ready to play (ms since it began loading).
  app.dataset.loadMs = String(Math.round(performance.now()));
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
      // v1.11 (PR8a, §0.8): reversing, from the tail car.
      const tail = train.reversing ? train.tailFrame() : null;
      const d = tail
        ? record.onRail && record.onRail.railId === tail.railId
          ? record.onRail.at - tail.s
          : record.position.distanceTo(train.getPose().tail.position)
        : record.onRail
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
    // v1.12: cutscene waits for the train to pass a place ("trainAt").
    trainWatch.update(train, simTime);

    // Stage zones along the rail (front of the train): camera views and updrafts.
    const gimmicks = stage.file.gimmicks;
    const camZone = zoneAt(gimmicks, 'camera', train.state.railId, train.frontS);
    // v1.11 (PR8a, A7): no stage camera reversing (the rear window) nor retracing (seen once already).
    const nextCamera = camZone && !train.stillGimmicks ? (camZone.params?.mode as CameraMode) : null;
    if (nextCamera !== zoneCamera) {
      zoneCamera = nextCamera;
      applyCamera();
    }
    // v1.10 (3-1): a whale's current pushes only while its whale swims along (the test course has no whales to greet).
    const zone = train.stillGimmicks ? null : zoneAt(gimmicks, 'updraft', train.state.railId, train.frontS);
    const updraft = zone && (runner?.updraftOn(zone) ?? true) ? zone : null;
    train.boostSpeed = updraft ? param(updraft, 'speed', 28) : 0;
    app.dataset.updraft = updraft ? '1' : '0';
    // 2-3: the slope under the train front, and the rocket resting in quiet places (before the train moves).
    // v1.11 (PR8a, A7): reversing and retracing, the slopes are level and the ice holds (never "ずるずる", never
    // "つるーん" on the way back), and the thin ice, the boughs and the mirrors passed stay as they are.
    const still = train.stillGimmicks;
    if (still) {
      train.slope = null;
      train.grip = 1;
    } else {
      slopes.update();
      ice.update(dt);
    }
    rocket.update();
    // v1.11 (PR5): the magnet light pulls (its phase: the runner's; on the test course driving, stopped or failing),
    // the odds and ends by the line, and the speed caps (the light's and the magnet's 0.7, pulling 0.5).
    const magnetPhase = runner ? runner.phase : testCourseFailing || train.isBouncing || train.isFalling ? 'failing' : train.state.speed < 0.05 ? 'stopped' : 'driving';
    // v1.11 (PR8a, A7): the magnet's targets passed stay as they are reversing (open ones stay open); no odds and ends.
    magnet.update(dt, { mode: lightSwitch.mode, phase: still ? 'stopped' : magnetPhase, stopLine: runner?.stopLine ?? null });
    ironProps.update(dt, { mode: still ? 'off' : lightSwitch.mode, pulling: magnet.pulling !== null, phase: magnetPhase });
    const pulling = magnet.pulling !== null;
    train.setSpeedCap('magnet', pulling ? { scale: MAGNET.pullScale } : null);
    train.setSpeedCap('light', lightSwitch.mode !== 'off' && !pulling ? { scale: LIGHT.speedScale } : null);
    const hintId = magnet.hint?.id ?? null;
    if (hintId !== magnetHintPosted) {
      magnetHintPosted = hintId;
      events.post({ type: 'magnet:hint', id: hintId });
    }

    train.update(dt);
    // v1.11 (PR11a): the section the view is in (its look), and a gate's white going away if the train stopped short.
    updateSection();
    updateGate();
    dive.update();
    plowHint.update();
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
    if (!still) {
      thinIce.update(dt);
      mirrors.update();
    }
    // v1.11 (5-3): the view is mirrored while the train front is between a stretch's gates (a box's CSS: no draw cost).
    flip.update();
    if (!still) phantoms.update({ lightOn });
    updateGlass();
    viewEl.classList.toggle('is-flipped', flip.flipped);
    tunnels.update();
    if (ice.sparkle !== iceSparkle) {
      iceSparkle = ice.sparkle;
      events.post({ type: 'ice', sparkle: iceSparkle });
    }
    audio.setUnderwater(train.submerged);
    updateFalls();
    // Under water the island's sound turns to the underwater bed, and the rails to a soft "ことっ" with bubbles.
    audio.setAmbienceUnderwater(train.submerged);
    // v1.11 (5-3): in a cutscene the mirror world's sound stops, the song alone (the mirror Sakasa is never eerie).
    if (stage.file.environment.ambience === 'mirror') {
      const quiet = runner?.phase === 'cutscene';
      audio.setAmbience(quiet ? null : 'mirror', hasVolcanoProp);
      app.dataset.ambience = quiet ? '' : 'mirror';
    }
    view.setSubmerged(train.submerged);
    audio.updateRun(dt, {
      speed: Math.abs(train.state.speed),
      target: train.targetSpeed,
      braking: train.targetSpeed < Math.abs(train.state.speed) - 0.3,
      airborne: train.airborne || train.isFalling,
      // v1.11 (PR8a, A10): where the view is (the rear window reversing).
      surface: runSurface(gimmicks, train.viewAnchor.railId, train.viewAnchor.s, look.surface),
      rocket: train.rocketBurning,
      underwater: train.submerged,
      quiet: false,
    });
    app.dataset.runJoints = String(audio.runStats.joints);
    app.dataset.runReleases = String(audio.runStats.releases);
    if (!still) boughs.update(dt);
    whistle.update(dt);
    ui.whistle.setProgress(whistle.progress);
    diveButton.setDiving(train.domeOn);
    plowButton.setPlowing(train.bladeDown, spraying);
    // v1.11 (PR8a): reversing, nothing ahead is to be jumped, dived or ploughed (the buttons work, no glow).
    const driving = (runner === null || runner.phase === 'driving') && !train.reversing;
    diveButton.set(train.diveProgress, dive.glow && driving);
    // "ゆきかき" glows until the blade is down, and is never grey (it works standing too).
    plowButton.set(plowHint.glow && driving);
    jumpButton.set(train.jumpProgress, !train.reversing && (train.jumpWouldClear || (runner?.jumpHint ?? false)), train.state.speed < JUMP.minSpeed);
    // v1.11 (PR8a): うしろむき: the switch (its side, waiting to turn, its glow) and "ちっ ちっ" while it waits.
    const reversePhase: ReversePhase = runner ? runner.phase : testCourseFailing || train.isFalling ? 'failing' : train.state.speed < 0.05 ? 'stopped' : 'driving';
    reverse.update(dt, reversePhase);
    reverseSwitch.set(train.direction, train.switchPending !== null);
    // v1.11 (PR8a × 6-1): while Sakasa follows the train backing up, the view stays the one picked (she is in front).
    const holdFront = train.reversing && (runner?.leadHoldsFront ?? false);
    if (holdFront !== leadHoldsFront) {
      leadHoldsFront = holdFront;
      app.dataset.cameraHold = holdFront ? 'lead' : '';
      applyCamera();
    }
    // The switch glows for うしろむき's own hints (A3) or for the lead waiting to be backed up to (6-1 M2, `backup`).
    reverseSwitch.setGlow(reverse.glow || (runner?.switchGlow ?? false));
    if (train.switchPending !== null) {
      pendingTickIn -= dt;
      if (pendingTickIn <= 0) {
        pendingTickIn = 0.25;
        audio.playSwitchPending();
      }
    }
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
    lightButton.setPulling(pulling);
    if (cutscenePress) {
      // v1.10 (3-3): a cutscene waits for one button: it alone glows. v1.11 (PR5): green for the magnet's first go.
      lightButton.setGlow(cutscenePress.ability === 'light' || cutscenePress.ability === 'magnet', cutscenePress.ability === 'magnet' ? 'magnet' : 'light');
      ui.whistle.setGlow(cutscenePress.ability === 'whistle');
    } else if (runner) {
      // v1.11 (5-1): yellow for "the light helps here"; the hush glow ("dim", press = off) while it is on by sleepers.
      // v1.11 (PR5): green first: an iron thing ahead and the light not in the magnet step (a hint only).
      if (magnet.hint) lightButton.setGlow(true, 'magnet');
      else lightButton.setGlow(runner.lightHint || runner.lightOffHint, runner.lightOffHint ? 'dim' : 'light');
      jumpButton.setHopper(runner.hopperId !== '');
      const hint = runner.phase === 'driving' ? runner.leverHintSpeed : null;
      // The notch the partner names (ゆっくり): judged on the plain notch speeds, so the light does not change it.
      const silk = hint === null ? null : (fastestNotchUnder(hint, 1) ?? fastestNotchUnder(hint, train.speedScale));
      // v1.10 (4-3): the snow wave close behind a slow train: "はやい" glows.
      // v1.11 (5-1): tanukis dancing on the rail ahead: "とまる" glows.
      // v1.11 (5-2): close behind the marching band: "ゆっくり" glows.
      const parade = runner.paradeLeverHint;
      ui.lever.setHint(runner.chaseLeverHint ? FAST_NOTCH : runner.lureStopHint ? STOP_NOTCH : parade !== null ? parade : runner.phase === 'driving' && iceNotch !== null ? iceNotch : silk);
    } else if (hasIce) ui.lever.setHint(iceNotch);
    // v1.11 (PR5): the test course's light glows green for the magnet (it has no runner).
    if (!runner && !cutscenePress && hasMagnetHooks) lightButton.setGlow(magnet.hint !== null, 'magnet');

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
      glow: rocket.glow && (runner === null || runner.phase === 'driving') && !train.reversing,
      idle: rocket.idle,
      why,
      mark: rocket.icon || (why === 'slide' || why === 'station' ? why : ''),
    });
    const timer = runner?.timer ?? null;
    // v1.10 (4-3): the snow wave's meter in the same place (there is never a countdown with it).
    const chasePanel = runner?.chasePanel ?? null;
    countdownPanel.set(timer, chasePanel);
    const wave = runner?.snowWave ?? null;
    view.setSnowWave(wave && { railId: wave.railId, s: wave.s, speed: wave.speed, state: wave.state });
    if (wave && (wave.state === 'run' || wave.state === 'wait')) {
      app.dataset.chase = wave.gap < SNOW_WAVE.near ? 'near' : 'run';
      app.dataset.chaseGap = String(Math.round(wave.gap));
      // "もこもこ" again and again while it is not far off (louder the closer: it plays over itself when near).
      chaseSoundIn -= dt;
      if (chaseSoundIn <= 0 && wave.gap < SNOW_WAVE.farLine) {
        chaseSoundIn = wave.gap < SNOW_WAVE.near ? SNOW_WAVE.soundEvery * 0.6 : SNOW_WAVE.soundEvery;
        audio.playSnowWave();
      }
    } else if (wave) {
      app.dataset.chase = wave.state === 'caught' ? 'caught' : wave.state === 'safe' ? 'safe' : '';
    } else if (app.dataset.chase !== undefined) app.dataset.chase = '';
    if (wave) app.dataset.chaseCatches = String(wave.catches);
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
      // v1.11 (PR11a, B13): the sections built so far (the others are built a slice a frame).
      if (sections.length > 0) app.dataset.sectionsReady = (view.sectionsReady?.() ?? sections.map((x) => x.id)).join(',');
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
    // v1.11 (PR7, 第 3 部 A5.5): the cars along the trail: the first two cars' gap and the cars' height against the lead
    // car's at the same trail distance.
    app.dataset.carGap = train.carGap.toFixed(3);
    app.dataset.carLiftErr = train.carLiftErr.toFixed(3);
    // v1.11 (PR8a, 第 3 部 A17) test hooks.
    app.dataset.direction = String(train.direction);
    app.dataset.reverse = train.switchPending !== null ? 'pending' : train.turning ? 'turning' : train.atReverseStop ? 'stop' : train.reversing ? 'on' : '';
    app.dataset.retracing = train.retracing ? '1' : '0';
    const tail = train.tailFrame();
    app.dataset.tailRail = tail.railId;
    app.dataset.tailS = tail.s.toFixed(1);
    app.dataset.trailM = train.trail.length.toFixed(1);
    if (crewOn) app.dataset.sakasa = train.reversing ? 'rear' : 'seat';
    app.dataset.hop = train.hopLift.toFixed(2);
    app.dataset.air = train.airborne ? '1' : '0';
    app.dataset.speed = train.state.speed.toFixed(1);
    app.dataset.rocketPips = String(rocket.pips);
    app.dataset.burn = train.rocketBurning ? '1' : '0';
    app.dataset.push = train.rocketPushing ? '1' : '0';
    app.dataset.slope = slopes.kind;
    app.dataset.slip = train.isSlipping ? '1' : '0';
    app.dataset.dive = train.domeOn ? 'on' : dive.near ? 'near' : '';
    if (plow.spans.length > 0) {
      app.dataset.plow = train.bladeDown ? 'on' : plowHint.near ? 'near' : '';
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
    if (hasMagnetHooks) {
      // v1.11 (PR5) test hooks (PHASE9_CHAPTER5_6 第 2 部 M15). Counts and lists only grow.
      app.dataset.magnet = pulling ? 'pull' : magnet.hint ? 'hint' : '';
      app.dataset.magnetTarget = magnet.pulling?.target.id ?? magnet.hint?.id ?? '';
      app.dataset.magnetPulls = String(magnet.pulls);
      app.dataset.magnetCaught = magnet.caughtIds.join(',');
      app.dataset.magnetBumps = String(magnetBumps);
      for (const t of stage.magnets) if (!t.recordId) app.setAttribute(`data-magnet-${t.id}`, magnet.state(t.id));
      app.dataset.iron = String(ironProps.count);
      app.dataset.lightMode = lightSwitch.mode;
    }
    if (mirrorWorld) {
      // v1.11 (5-3) test hooks (PHASE9_CHAPTER5_6 第 6 部 §4.10). Counts only go up.
      app.dataset.flip = flip.flipped ? '1' : '';
      app.dataset.flipGate = flip.gateNear;
      if (!runner) ui.whistle.setGlow(flip.whistleGlow);
    }
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
      if (hasNight) {
        // v1.11 (5-1) test hooks (PHASE9_CHAPTER5_6 第 4 部 §4.10). Counts only go up.
        app.dataset.hush = runner.hushStatus;
        app.dataset.hushStartles = String(runner.hushStartles);
        app.dataset.fawns = runner.fawnStates;
        app.dataset.glareFreezes = String(runner.glareFreezes);
        app.dataset.reversed = runner.whistleReversed ? '1' : '0';
        app.dataset.lure = runner.lureStatus;
        app.dataset.lureCalls = String(runner.lureCalls);
        app.dataset.lureDances = String(runner.lureDances);
        app.dataset.fireflies = runner.fireflyStates;
        app.dataset.fireflyCalls = String(runner.fireflyCalls);
      }
      if (runner.hasToys) {
        // v1.11 (5-2) test hooks (PHASE9_CHAPTER5_6 第 5 部 §4.10).
        app.dataset.parade = runner.paradeState;
        app.dataset.paradeGap = runner.paradeGap;
        app.dataset.paradeHeld = runner.paradeHeld ? '1' : '0';
        app.dataset.spins = runner.spinStates;
        app.dataset.spinTaken = runner.spinTakenList;
        view.setSpinLooks?.(runner.spinLooks);
        // The band's footsteps on the song's beat while it walks ("とん").
        const walking = runner.paradeState === 'march' || runner.paradeState === 'exit';
        if (walking) {
          bandStepIn -= dt;
          if (bandStepIn <= 0) {
            bandStepIn += BAND_STEP_SECONDS;
            bandSteps += 1;
            audio.playBandStep(bandSteps % 4 === 0);
          }
        } else bandStepIn = 0;
      }
      // v1.11 (6-1): おいかけっこ and ドアを あけて まつ (PHASE9_CHAPTER5_6 第 7 部 §4.10). Counts only go up.
      view.setLead?.(runner.leadPose);
      if (hasLeadHooks) {
        app.dataset.lead = runner.leadPhase;
        app.dataset.leadCalls = String(runner.leadCalls);
        app.dataset.leadAuto = String(runner.leadAutoCalls);
        app.dataset.leadGap = String(runner.leadGap);
        app.dataset.leadBack = String(runner.leadBack);
        app.dataset.stationClosed = runner.closedStation;
        app.dataset.inlineCutscene = runner.inlineCutscene;
        app.dataset.welcome = runner.welcomeState;
        app.dataset.welcomeFlinches = String(runner.welcomeFlinches);
        app.dataset.welcomeGiggles = String(runner.welcomeGiggles);
        app.dataset.musicGain = String(Math.round(audio.musicGain * 100) / 100);
      }
      // The hush mark (a moon and ZZZ): a hint only; both buttons work as always (PHASE9_0 §6).
      lightButton.setMark(runner.lightMark ? 'hush' : null);
      ui.whistle.setMark(runner.whistleMark ? 'hush' : null);
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
  // A check run never goes on from the save's place: it starts at `mission=`.
  const resume = kakunin ? null : await savedResume();
  let resumeFrom = kakunin ? kakuninFrom : params.get('resume') === '1' && resume?.stage === stageId ? resume.mission : 0;
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
    // The title's Sakasa gets off (the stage's own story decides where she is).
    if (app.dataset.titleCrew) {
      view.setTitleCrew?.(false);
      delete app.dataset.titleCrew;
    }
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
  /** v1.10 (4-3): snowmen and snow heaps ("rock-roll" / "rock-drop" looks snowman, snowman-upside, snow-pile). */
  const snowRocks = new Set(
    stage.file.actors.filter((a) => (a.type === 'rock-roll' || a.type === 'rock-drop') && String(lookOf(a) ?? '').startsWith('snow')).map((a) => a.id),
  );
  /** v1.10 (3-2, 3-3): the duck family ("dino-small" look "duck") and sea turtles ("cat" look "turtle"). */
  const ducks = new Set(stage.file.actors.filter((a) => a.type === 'dino-small' && lookOf(a) === 'duck').map((a) => a.id));
  const turtles = new Set(stage.file.actors.filter((a) => a.type === 'cat' && lookOf(a) === 'turtle').map((a) => a.id));
  /** v1.11 (5-1): fawns ("dino-small" look "fawn") and hedgehogs ("cat" look "hedgehog"): their own sounds. */
  const fawns = new Set(stage.file.actors.filter((a) => a.type === 'dino-small' && lookOf(a) === 'fawn').map((a) => a.id));
  const hedgehogs = new Set(stage.file.actors.filter((a) => a.type === 'cat' && lookOf(a) === 'hedgehog').map((a) => a.id));
  let lastFailReason: string | null = null;
  let welcomeSteps = 0;
  // v1.11 (5-2): windings so far (toys, the band, spinning forks, cutscene figures; only goes up), the town wound.
  let windups = 0;
  app.dataset.windups = '0';
  const figureModels = new Map<string, string>();
  let fails = 0;
  const fakeOut = new Set<string>();
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
    say: (text, who, name, icon) => bubbles.say(text, who, name, icon),
    sayAsync: (text, who) => void bubbles.say(text, who),
    sayIfQuiet: (text) => {
      if (!bubbles.quiet) return false;
      void bubbles.say(text);
      return true;
    },
    hush: () => bubbles.clear(),
    sayNow: (text, icon) => {
      bubbles.clear();
      void bubbles.say(text, 'partner', undefined, icon);
    },
    musicGain: (gain, seconds) => audio.setMusicGain(gain, seconds),
    depart: (to, seconds) => train.depart(to, seconds),
    card: (title, button, icon, mirror, notes) => {
      // v1.11 (5-3): the notes shown in a mirror ring "しゃらーん" as the words come out in it.
      if (mirror === 'reflect') audio.playLetterReflect();
      else audio.playCard();
      return showCard(uiEl, title, button, icon, skipGuard(), undefined, { mirror, notes });
    },
    // v1.10 (3-3): the runner opens and closes a cutscene's doors itself (it knows the station).
    door: () => undefined,
    press: (ability, say, fx, cancel, target) =>
      new Promise<void>((resolve) => {
        const buttons = { light: lightButton, magnet: lightButton, whistle: null, rocket: rocketButton, jump: jumpButton } as const;
        const el =
          ability === 'whistle' ? document.getElementById('whistle') : document.getElementById(ability === 'jump' ? 'jump' : ability === 'magnet' ? 'light' : ability);
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
        if (ability === 'magnet') {
          // v1.11 (PR5, 第 2 部 M5): the light comes on first; the press turns it to the magnet step and `target` flies to
          // the train ("きゅいーん… かちっ… ぽん"). "▶▶" skips it: the step goes back to off (the target is taken off).
          lightSwitch.set('light');
          const seconds = 1.0;
          cutscenePress = {
            ability,
            done: () => {
              cutscenePress = null;
              delete app.dataset.cutscenePress;
              el?.classList.remove('is-press');
              lightButton.setGlow(false);
              if (target) events.post({ type: 'magnet:fetch', id: target, seconds });
              audio.playMagnetPull(seconds);
              void waitSeconds(seconds).then(() => {
                if (over) return;
                audio.playMagnetCatch();
                finish(true);
              });
            },
          };
          app.dataset.cutscenePress = ability;
          el?.classList.add('is-press');
          if (say) {
            void bubbles.say(say);
            void (async () => {
              while (!over && cutscenePress?.ability === 'magnet') {
                await waitSeconds(DOOR_REMIND_SECONDS);
                if (!over && cutscenePress?.ability === 'magnet') void bubbles.say(say);
              }
            })();
          }
          void cancel?.then(() => {
            if (over) return;
            lightSwitch.set('off');
            finish(false);
          });
          return;
        }
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
      // v1.11 (PR5): so does the magnet's soap film and cushion.
      if (lastFailReason !== 'rock' && lastFailReason !== 'dive' && lastFailReason !== 'crack' && lastFailReason !== 'plow' && lastFailReason !== 'snow' && lastFailReason !== 'magnet') audio.playBoing();
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
      await showCard(uiEl, ABILITY_CARD_TITLES[ability] ?? `${ABILITY_NAMES[ability] ?? ability}を\nおぼえた！`, 'やったね！', 'badge');
    },
    revealJunction: (side) => ui.junction.reveal(side),
    // v1.11 (5-3): a shut mirror gate close ahead lights it too (a hint: it opens on the whistle).
    whistleHint: (on) => ui.whistle.setGlow(on || flip.whistleGlow),
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
    // v1.12 (えんしゅつ): shots, the letterbox, the train running by itself, a wait for it, a named point.
    shot: (def) => {
      if (!def && !shotOn) return Promise.resolve();
      shotOn = def !== null;
      view.setShot?.(def);
      applyCamera(!def);
      // With prefers-reduced-motion the move is a cut: nothing to wait for.
      return def?.seconds && !reducedMotion ? waitSeconds(def.seconds) : Promise.resolve();
    },
    letterbox: (on) => {
      letterbox.set(on);
      view.setLetterbox?.(on ? LETTERBOX_PART : 0);
    },
    drive: (order) => train.setAutoDrive(order),
    trainAt: (at, max) => trainWatch.wait(train, at, max, simTime),
    beat: (name) => {
      app.dataset.beat = name;
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
    // v1.10 (4-3): the snow wave comes out ("もこもこ"), catches the train ("もふっ"), runs into the fence ("もふん").
    if (e.type === 'chase') {
      if (e.state === 'run' && app.dataset.chase !== 'caught') chaseSoundIn = Math.min(chaseSoundIn, 0.1);
      if (e.state === 'caught') {
        audio.playSnowCatch();
        chasePuff.classList.remove('is-on');
        void chasePuff.offsetWidth;
        chasePuff.classList.add('is-on');
      }
      if (e.state === 'safe') audio.playSnowCatch();
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
    if (e.type === 'fail') {
      lastFailReason = e.reason;
      // Test hooks (v1.11): the last fail's reason, and how many fails so far (only goes up).
      fails += 1;
      app.dataset.failReason = e.reason;
      app.dataset.failSoft = e.soft ? '1' : '0';
      app.dataset.fails = String(fails);
    }
    // v1.11 (5-1): the fake firefly forks the light has seen through this try (a test hook).
    if (e.type === 'rewind' && fakeOut.size > 0) {
      fakeOut.clear();
      app.dataset.fakeOut = '';
    }
    if (e.type === 'fake:out') {
      fakeOut.add(e.junctionId);
      app.dataset.fakeOut = [...fakeOut].join(',');
    }
    if (e.type === 'rock' && snowbirds.has(e.id)) {
      // v1.10 (4-1): little birds in a row: "ぴよぴよ" as they line up and set off, wings flapping when surprised.
      if (e.state === 'wobble' || e.state === 'roll') audio.playSnowbirds();
      if (e.state === 'bonk') audio.playFlap();
    } else if (e.type === 'rock' && snowRocks.has(e.id)) {
      // v1.10 (4-3): snowmen roll "ころころ" and land "ぽすん"; bumping one is a soft "ぽすっ" (never a splash).
      if (e.state === 'wobble') audio.playRockWobble();
      if (e.state === 'roll') audio.playRockRoll(e.seconds ?? ROCK_ROLL.crossSeconds);
      if (e.state === 'drop') audio.playPadFlop();
      if (e.state === 'bonk') audio.playPlowBump();
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
    // v1.11 (5-1): the night forest's small sounds.
    if (e.type === 'hush:startle') audio.playHushStartle();
    if (e.type === 'actor:state' && fawns.has(e.id) && e.state === 'blink') audio.playFawnBlink();
    if (e.type === 'actor:state' && fawns.has(e.id) && (e.state === 'hop' || e.state === 'bump')) audio.playFawnHop();
    if (e.type === 'actor:state' && hedgehogs.has(e.id) && (e.state === 'awake' || e.state === 'flee')) audio.playHedgehogRoll();
    if (e.type === 'lure:come') audio.playLureCome();
    if (e.type === 'lure' && e.state === 'dance') audio.playLureDance();
    if (e.type === 'fireflies:call') audio.playFireflyWake();
    if (e.type === 'fake:out') audio.playFakeOut();
    // v1.11 (5-2): the toy town's sounds and test hooks.
    if (e.type === 'windup') {
      if (!e.instant) {
        windups += 1;
        app.dataset.windups = String(windups);
        audio.playWindUp();
        if (e.kind === 'band') audio.playBandFanfare(WINDUP.keySeconds);
        if (e.kind === 'spin') audio.playSpinStop();
      }
      if (e.town) {
        app.dataset.town = 'wound';
        if (!e.instant) audio.playBandFanfare(WINDUP.keySeconds + 0.4);
      }
    }
    if (e.type === 'parade:fanfare') audio.playBandFanfare();
    // v1.11 (6-1): おいかけっこ ("ぴょこん", "しゅたたた〜", "くるっ"; the partner's own call blows the whistle too) and
    // ドアを あけて まつ ("とこ とこ", "ぴゃっ", "ぽろろん"), the friends riding along, the train rolling off.
    if (e.type === 'lead:start') audio.playLeadPop();
    if (e.type === 'lead:call') {
      if (e.auto) {
        audio.playWhistle();
        events.post({ type: 'whistle' });
      }
      void waitSeconds(LEAD.iconLead).then(() => audio.playLeadDash());
    }
    if (e.type === 'lead:follow' || e.type === 'lead:met') audio.playLeadTurn();
    if (e.type === 'lead:hop') audio.playFlinch();
    if (e.type === 'welcome:step') {
      welcomeSteps += 1;
      audio.playWelcomeStep(welcomeSteps % 2 === 0);
    }
    if (e.type === 'welcome:flinch' || e.type === 'welcome:shy') audio.playFlinch();
    if (e.type === 'welcome:giggle') audio.playWelcomeStep(true);
    if (e.type === 'welcome:board') audio.playBoardHarp();
    if (e.type === 'crew') app.dataset.crew = e.ids.join(',');
    if (e.type === 'depart') app.dataset.depart = e.state;
    if (e.type === 'spin' && e.state === 'turn') audio.playSpinTurn();
    if (e.type === 'spin' && e.state === 'good') audio.playSpinGood();
    if (e.type === 'actor:spawn') figureModels.set(e.id, e.model);
    if (e.type === 'actor:move' && figureModels.get(e.id) === 'toy-block-train' && e.seconds > 0) audio.playToyPuff();
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
    mapLabel: kakunin ? 'かくにんの いちらん' : undefined,
    onMap: async () => {
      if (kakunin) {
        // The check mode has no map to go back to: the stage list.
        await new Promise<void>((resolve) => showKakuninList(uiEl, { open: stageId, onClose: resolve }));
        return;
      }
      const choice = await openMap(uiEl, audio, { next: next?.id, closeLabel: 'もどる' });
      if (choice.kind === 'stage') goToStage(choice.id, choice.resume);
    },
  });
  pause.show();
  skipButton = createSkipButton(uiEl, () => {
    if (runner?.skipCutscene()) skippedAt = performance.now();
  });

  runner = new MissionRunner(stage, train, whistle, events, ports, { rocket, slopes, dive, ice, thinIce, mirrors, plow, plowHint, tunnel: tunnels, magnet, iron: ironProps, reverse });
  runner.knowAbilities(abilities);
  runner.setLight(lightOn);
  if (resumeFrom > 0) {
    runner.prepareResume(resumeFrom, resume ?? undefined);
    // v1.11 (5-3): the whistle gates on the way to the station it starts at are open.
    const before = stage.file.missions[resumeFrom - 1].steps;
    const at = stage.file.stations.find((st) => st.id === before[before.length - 1].stationId);
    if (at) flip.reset({ resumeAt: { railId: at.railId, at: at.at } });
    // The train stands at another station now: the camera jumps there instead of flying over the stage.
    applyCamera(true);
  }
  await runner.run(resumeFrom);
  pause.hide();
  if (kakunin) {
    // After the clear card: back to the stage list (this stage opened), not the map. Nothing was saved.
    audio.playMusic('title');
    showKakuninList(uiEl, { open: stage.file.id, onClose: () => (location.href = location.pathname) });
    return;
  }
  addToProgress('cleared', [stage.file.id]);
  if (loadProgress().resume?.stage === stage.file.id) setResume(null);
  // TODO(6-2): after 6-2's clear the ending movie plays here, before the map: `goToMovie('ending')` (the movie goes
  // back to the title; the map's chapter-6 card then waits for the next time the map opens).
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

/** v1.11 (5-2): the band's footsteps: one a beat of the song "omocha" (116 a minute). */
const BAND_STEP_SECONDS = 60 / 116;
let bandStepIn = 0;
let bandSteps = 0;

/** v1.10 (4-1): the "ゆっくり" notch (the ice station's first glow). */
const ICE_SLOW_NOTCH = 2;
/** v1.10 (4-3): the "はやい" notch (the snow wave close behind). */
const FAST_NOTCH = 4;

/** The fastest notch whose speed (scaled by the light) is at most `limit` m/s: the lever's glowing hint. */
function fastestNotchUnder(limit: number, scale: number): number | null {
  let best: number | null = null;
  LEVER_NOTCHES.forEach((n, i) => {
    if (n.speed > 0 && n.speed * scale <= limit + 1e-6) best = i;
  });
  return best;
}
