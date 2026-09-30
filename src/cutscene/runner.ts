import type { StageEvent, StageEventBus } from '../core/stage-events';
import type { RailNetwork } from '../rail/types';
import { resolvePlacement } from '../stage/loader';
import type { AbilityId, CutsceneStep, Emote, Speaker, Vec3 } from '../stage/types';
import { MIRROR_WORLD, WINDUP } from '../train/params';
import type { CameraMode } from '../view/camera-rig';

/** What the cutscene runner needs from the UI. */
export interface CutscenePorts {
  say(text: string, who: Speaker, name?: string): Promise<void>;
  /**
   * v1.10 `mirror`: a note on paper with its title written mirror-wise; icon "drawing" (3-2): a crayon picture. v1.11
   * (5-3) `mirror` "reflect": `notes` mirror-written notes held up to a mirror that shows the title in plain letters.
   */
  card(title: string, button: string, icon?: 'badge' | 'drawing', mirror?: boolean | 'reflect', notes?: 1 | 2): Promise<void>;
  caption(text: string, seconds: number): Promise<void>;
  wait(seconds: number): Promise<void>;
  /** Temporarily override the player's camera (null = give it back). */
  autoCamera(mode: CameraMode | null): void;
  /** Learn an ability: its button appears and a card says so. */
  unlock(ability: AbilityId): Promise<void>;
  /** v1.7: a camera standing still at `at` looking at `lookAt` (null = back to the usual camera). */
  fixedCamera(at: Vec3 | null, lookAt?: Vec3, reach?: number): void;
  /** v1.7: the volcano sneezes ("はっくしょーん！"). Resolves when it is over. */
  sneeze(): Promise<void>;
  /** v1.10: a big bubble pops ("ぱちん") at cutscene figure `id` (or in front of the camera). Resolves when it is over. */
  pop(id?: string): Promise<void>;
  /**
   * v1.11 (PR5) `ability` "magnet": the light comes on and its button glows green; the press turns it to the magnet step
   * and the figure `target` flies to the train (resolves once it has arrived; the runner then takes it off).
   * v1.10 (3-3): wait for the child to press `ability`'s button (it alone glows; `say` is said now and again every
   * DOOR_REMIND_SECONDS). The press does what the button does; `fx` "beacon" then lights the lighthouse. v1.11 (5-2)
   * `fx` "windup": the runner winds the press step's `target` itself (a "windup" event) once the press is in.
   */
  press(
    ability: 'light' | 'whistle' | 'rocket' | 'jump' | 'magnet',
    say: string | undefined,
    fx: 'beacon' | 'windup' | undefined,
    cancel?: Promise<void>,
    target?: string,
  ): Promise<void>;
  /** v1.10 (3-3): the doors on the platform side open or close again (looks only; closed again after the cutscene). */
  door(open: boolean): void;
  /** v1.10 (3-3): the festival ("しゃらら〜ん"). Resolves when it is over. */
  festival(): Promise<void>;
  /** PHASE7_FINISH §4 item 3: learn an ability quietly (its button appears; no card). Used by the fast-forward. */
  learn(ability: AbilityId): void;
  /** The cutscene is being skipped: put away the line and the caption showing now. */
  interrupt(): void;
}

/**
 * A request to skip the rest of a cutscene ("▶▶", PHASE7_FINISH §4 item 7). The waits in progress end at once and
 * the steps left are fast-forwarded (only what lasts is applied).
 */
export class CutsceneSkip {
  requested = false;
  readonly promise: Promise<void>;
  private resolve: () => void = () => undefined;

  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  request(): void {
    if (this.requested) return;
    this.requested = true;
    this.resolve();
  }
}

/** v1.11: how long a look change (day ⇄ night) takes by default (s): the fade down and back up. */
const ENVIRONMENT_SECONDS = 1.2;

/** How long a cut stretch takes to fall into the sea (s), v1.7 style "fall". */
const CUT_FALL_SECONDS = 1.8;

/**
 * Plays a list of cutscene steps in order. The caller locks the controls around it. With `skip`, a request ends the
 * wait in progress and fast-forwards the steps left. Cards (and the card of a learned ability) are waited for in
 * full: they are the child's own tap, and the "▶▶" is hidden under them.
 */
export async function runCutscene(
  steps: CutsceneStep[],
  network: RailNetwork,
  groundY: number | null,
  events: StageEventBus,
  ports: CutscenePorts,
  skip?: CutsceneSkip,
): Promise<void> {
  const race = (p: Promise<void>): Promise<void> => (skip ? Promise.race([p, skip.promise]) : p);
  const models = spawnModels(steps);
  for (let i = 0; i < steps.length; i++) {
    if (skip?.requested) {
      ports.interrupt();
      fastForwardCutscene(steps.slice(i), network, groundY, events, ports, models);
      return;
    }
    const step = steps[i];
    // A press step may carry a line of its own ("say"): look at it first.
    if ('press' in step && step.press === 'magnet') {
      // v1.11 (PR5): the magnet light's first go: the target flies to the train, then it is gone (at once when skipped).
      await race(ports.press('magnet', step.say, undefined, skip?.promise, step.target));
      events.post({ type: 'actor:remove', id: step.target });
    } else if ('press' in step) {
      // "▶▶" while waiting: the press counts as done (the port puts the button back and lights the lamp at once).
      await race(ports.press(step.press, step.say, step.fx, skip?.promise));
      // v1.11 (5-2): the press winds its target the right way round (at once when skipped).
      if (step.fx === 'windup' && step.target) postWindup(events, step.target, models, skip?.requested === true);
    } else if ('door' in step) {
      ports.door(step.door === 'open');
    } else if ('say' in step) {
      if (step.emote) events.post({ type: 'partner:emote', kind: step.emote });
      await race(ports.say(step.say, step.who ?? 'partner', step.name));
    } else if ('spawn' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail }, rotationY: step.rotationY }, network, groundY);
      events.post({ type: 'actor:spawn', id: step.spawn, model: step.model, position: t.position, quaternion: t.quaternion, mirror: step.mirror });
    } else if ('move' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail } }, network, groundY);
      events.post({ type: 'actor:move', id: step.move, position: t.position, seconds: step.seconds });
      if (!step.nowait) await race(ports.wait(step.seconds));
    } else if ('remove' in step) {
      events.post({ type: 'actor:remove', id: step.remove });
    } else if ('wait' in step) {
      await race(ports.wait(step.wait));
    } else if ('cutRail' in step) {
      const { railId, from, to, style, props } = step.cutRail;
      network.getRail(railId).addGap(from, to);
      events.post({ type: 'rail:cut', railId, from, to, style, props });
      await race(ports.wait(style === 'fall' ? CUT_FALL_SECONDS : 1));
    } else if ('card' in step) {
      await ports.card(step.card.title, step.card.button, step.card.icon, step.card.mirror, step.card.notes);
    } else if ('camera' in step) {
      if (step.camera === 'fixed') {
        ports.fixedCamera(step.at, step.lookAt, step.reach);
        await race(ports.wait(0.3));
      } else {
        ports.fixedCamera(null);
        ports.autoCamera(step.camera);
        await race(ports.wait(0.6));
      }
    } else if ('fx' in step) {
      if (step.fx === 'sneeze') await race(ports.sneeze());
      else if (step.fx === 'pop') await race(ports.pop(step.id));
      else if (step.fx === 'festival') await race(ports.festival());
      else if (step.fx === 'mirrorTurn') {
        // v1.11 (5-3): a mirror turns round ("くるっ… ぱたん"); it stays so.
        events.post({ type: 'mirror:turn', id: step.mirror, face: step.to ?? 'back', seconds: MIRROR_WORLD.fxTurnSeconds });
        await race(ports.wait(MIRROR_WORLD.fxTurnSeconds));
      }
    } else if ('caption' in step) {
      await race(ports.caption(step.caption, step.seconds ?? 3));
    } else if ('emote' in step) {
      events.post({ type: 'partner:emote', kind: step.emote as Emote });
    } else if ('unlock' in step) {
      await ports.unlock(step.unlock);
    } else if ('sky' in step) {
      events.post({ type: 'sky', sky: step.sky, seconds: step.seconds ?? 3 });
    } else if ('environment' in step) {
      // v1.11 (PR2c): day ⇄ night (the look changes behind a short fade).
      const seconds = step.seconds ?? ENVIRONMENT_SECONDS;
      events.post({ type: 'environment', env: step.environment, seconds });
      if (seconds > 0) await race(ports.wait(seconds));
    }
  }
  // Skipped during the last step: nothing left to fast-forward, but the line or caption showing goes away.
  if (skip?.requested) ports.interrupt();
}

/**
 * Applies at once only what the steps leave behind (PHASE7_FINISH §4 item 3): cut rails, learned abilities, and the
 * figures they bring on or take off, each where it ends up, and v1.10 (4-2) the evening sky, v1.11 the look (day ⇄ night)
 * and (5-3) mirrors turned round. Lines, waits, cards, captions, cameras and effects are
 * left out (the caller gives the usual camera back). Used for the cutscenes before a resumed mission, and for the
 * rest of one skipped with "▶▶".
 */
export function fastForwardCutscene(
  steps: CutsceneStep[],
  network: RailNetwork,
  groundY: number | null,
  events: StageEventBus,
  ports: Pick<CutscenePorts, 'learn'>,
  models: Map<string, string> = spawnModels(steps),
): void {
  // Figures brought on in these steps: posted once, where their last move leaves them. Ones taken off again never
  // show. (A spawn loads its model first; for one posted before a "▶▶", ActorsView holds a move until it is in and
  // drops it when a remove overtakes it.)
  const spawned = new Map<string, Extract<StageEvent, { type: 'actor:spawn' }>>();
  const windups: string[] = [];
  for (const step of steps) {
    if ('spawn' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail }, rotationY: step.rotationY }, network, groundY);
      spawned.set(step.spawn, { type: 'actor:spawn', id: step.spawn, model: step.model, position: t.position, quaternion: t.quaternion, mirror: step.mirror });
    } else if ('move' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail } }, network, groundY);
      const own = spawned.get(step.move);
      if (own) own.position = t.position;
      else events.post({ type: 'actor:move', id: step.move, position: t.position, seconds: 0 });
    } else if ('remove' in step) {
      // Also posted for one brought on here: it may have been on screen already before a "▶▶".
      spawned.delete(step.remove);
      events.post({ type: 'actor:remove', id: step.remove });
    } else if ('cutRail' in step) {
      const { railId, from, to, style, props } = step.cutRail;
      network.getRail(railId).addGap(from, to);
      events.post({ type: 'rail:cut', railId, from, to, style, props, instant: true });
    } else if ('unlock' in step) {
      ports.learn(step.unlock);
    } else if ('press' in step && step.press === 'magnet') {
      // v1.11 (PR5): skipped, the magnet's first go leaves the target gone (it flew to the train).
      spawned.delete(step.target);
      events.post({ type: 'actor:remove', id: step.target });
    } else if ('press' in step) {
      // v1.10 (3-3): skipped, the press counts as done: the lighthouse is lit.
      if (step.fx === 'beacon') events.post({ type: 'beacon', instant: true });
      // v1.11 (5-2): and the wind-up figure turned the right way round (after it is brought on, below).
      if (step.fx === 'windup' && step.target) windups.push(step.target);
    } else if ('fx' in step && step.fx === 'festival') {
      events.post({ type: 'festival', instant: true });
    } else if ('fx' in step && step.fx === 'mirrorTurn') {
      // v1.11 (5-3): the mirror stays turned (▶▶ and a resume too).
      events.post({ type: 'mirror:turn', id: step.mirror, face: step.to ?? 'back', seconds: 0, instant: true });
    } else if ('sky' in step) {
      events.post({ type: 'sky', sky: step.sky, seconds: 0 });
    } else if ('environment' in step) {
      events.post({ type: 'environment', env: step.environment, seconds: 0 });
    }
  }
  for (const spawn of spawned.values()) events.post(spawn);
  for (const target of windups) postWindup(events, target, models, true);
}

/** The model each figure a cutscene brings on has (its last spawn), by id. */
function spawnModels(steps: CutsceneStep[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const step of steps) if ('spawn' in step) out.set(step.spawn, step.model);
  return out;
}

/**
 * v1.11 (5-2): cutscene figure `id` is wound the right way round (its model loses "-back"); the town's big key
 * (WINDUP.townKey) winds the whole town's toys with it.
 */
function postWindup(events: StageEventBus, id: string, models: Map<string, string>, instant: boolean): void {
  events.post({ type: 'windup', id, kind: 'cutscene', instant, town: models.get(id) === WINDUP.townKey });
}
