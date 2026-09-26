import type { StageEvent, StageEventBus } from '../core/stage-events';
import type { RailNetwork } from '../rail/types';
import { resolvePlacement } from '../stage/loader';
import type { AbilityId, CutsceneStep, Emote, Speaker, Vec3 } from '../stage/types';
import type { CameraMode } from '../view/camera-rig';

/** What the cutscene runner needs from the UI. */
export interface CutscenePorts {
  say(text: string, who: Speaker, name?: string): Promise<void>;
  card(title: string, button: string, icon?: 'badge'): Promise<void>;
  caption(text: string, seconds: number): Promise<void>;
  wait(seconds: number): Promise<void>;
  /** Temporarily override the player's camera (null = give it back). */
  autoCamera(mode: CameraMode | null): void;
  /** Learn an ability: its button appears and a card says so. */
  unlock(ability: AbilityId): Promise<void>;
  /** v1.7: a camera standing still at `at` looking at `lookAt` (null = back to the usual camera). */
  fixedCamera(at: Vec3 | null, lookAt?: Vec3): void;
  /** v1.7: the volcano sneezes ("はっくしょーん！"). Resolves when it is over. */
  sneeze(): Promise<void>;
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
  for (let i = 0; i < steps.length; i++) {
    if (skip?.requested) {
      ports.interrupt();
      fastForwardCutscene(steps.slice(i), network, groundY, events, ports);
      return;
    }
    const step = steps[i];
    if ('say' in step) {
      if (step.emote) events.post({ type: 'partner:emote', kind: step.emote });
      await race(ports.say(step.say, step.who ?? 'partner', step.name));
    } else if ('spawn' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail }, rotationY: step.rotationY }, network, groundY);
      events.post({ type: 'actor:spawn', id: step.spawn, model: step.model, position: t.position, quaternion: t.quaternion });
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
      await ports.card(step.card.title, step.card.button, step.card.icon);
    } else if ('camera' in step) {
      if (step.camera === 'fixed') {
        ports.fixedCamera(step.at, step.lookAt);
        await race(ports.wait(0.3));
      } else {
        ports.fixedCamera(null);
        ports.autoCamera(step.camera);
        await race(ports.wait(0.6));
      }
    } else if ('fx' in step) {
      if (step.fx === 'sneeze') await race(ports.sneeze());
    } else if ('caption' in step) {
      await race(ports.caption(step.caption, step.seconds ?? 3));
    } else if ('emote' in step) {
      events.post({ type: 'partner:emote', kind: step.emote as Emote });
    } else if ('unlock' in step) {
      await ports.unlock(step.unlock);
    }
  }
  // Skipped during the last step: nothing left to fast-forward, but the line or caption showing goes away.
  if (skip?.requested) ports.interrupt();
}

/**
 * Applies at once only what the steps leave behind (PHASE7_FINISH §4 item 3): cut rails, learned abilities, and the
 * figures they bring on or take off, each where it ends up. Lines, waits, cards, captions, cameras and effects are
 * left out (the caller gives the usual camera back). Used for the cutscenes before a resumed mission, and for the
 * rest of one skipped with "▶▶".
 */
export function fastForwardCutscene(
  steps: CutsceneStep[],
  network: RailNetwork,
  groundY: number | null,
  events: StageEventBus,
  ports: Pick<CutscenePorts, 'learn'>,
): void {
  // Figures brought on in these steps: posted once, where their last move leaves them (a spawn loads its model
  // first, so a move or a remove posted right after it could come too early). Ones taken off again never show.
  const spawned = new Map<string, Extract<StageEvent, { type: 'actor:spawn' }>>();
  for (const step of steps) {
    if ('spawn' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail }, rotationY: step.rotationY }, network, groundY);
      spawned.set(step.spawn, { type: 'actor:spawn', id: step.spawn, model: step.model, position: t.position, quaternion: t.quaternion });
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
    }
  }
  for (const spawn of spawned.values()) events.post(spawn);
}
