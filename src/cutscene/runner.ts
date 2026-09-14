import type { StageEventBus } from '../core/stage-events';
import type { RailNetwork } from '../rail/types';
import { resolvePlacement } from '../stage/loader';
import type { CutsceneStep, Emote, Speaker } from '../stage/types';
import type { CameraMode } from '../view/camera-rig';

/** What the cutscene runner needs from the UI. */
export interface CutscenePorts {
  say(text: string, who: Speaker): Promise<void>;
  card(title: string, button: string, icon?: 'badge'): Promise<void>;
  caption(text: string, seconds: number): Promise<void>;
  wait(seconds: number): Promise<void>;
  /** Temporarily override the player's camera (null = give it back). */
  autoCamera(mode: CameraMode | null): void;
}

/** Plays a list of cutscene steps in order. The caller locks the controls around it. */
export async function runCutscene(
  steps: CutsceneStep[],
  network: RailNetwork,
  groundY: number | null,
  events: StageEventBus,
  ports: CutscenePorts,
): Promise<void> {
  for (const step of steps) {
    if ('say' in step) {
      if (step.emote) events.post({ type: 'partner:emote', kind: step.emote });
      await ports.say(step.say, step.who ?? 'partner');
    } else if ('spawn' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail } }, network, groundY);
      events.post({ type: 'actor:spawn', id: step.spawn, model: step.model, position: t.position, quaternion: t.quaternion });
    } else if ('move' in step) {
      const t = resolvePlacement({ onRail: { heightFromRail: 0, ...step.onRail } }, network, groundY);
      events.post({ type: 'actor:move', id: step.move, position: t.position, seconds: step.seconds });
      await ports.wait(step.seconds);
    } else if ('remove' in step) {
      events.post({ type: 'actor:remove', id: step.remove });
    } else if ('wait' in step) {
      await ports.wait(step.wait);
    } else if ('cutRail' in step) {
      const { railId, from, to } = step.cutRail;
      network.getRail(railId).addGap(from, to);
      events.post({ type: 'rail:cut', railId, from, to });
      await ports.wait(1);
    } else if ('card' in step) {
      await ports.card(step.card.title, step.card.button, step.card.icon);
    } else if ('camera' in step) {
      ports.autoCamera(step.camera);
      await ports.wait(0.6);
    } else if ('caption' in step) {
      await ports.caption(step.caption, step.seconds ?? 3);
    } else if ('emote' in step) {
      events.post({ type: 'partner:emote', kind: step.emote as Emote });
    }
  }
}
