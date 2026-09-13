import type { StageEventBus } from '../core/stage-events';
import type { RailNetwork } from '../rail/types';
import { resolvePlacement } from '../stage/loader';
import type { CutsceneStep, Emote, Speaker } from '../stage/types';

/** What the cutscene runner needs from the UI. */
export interface CutscenePorts {
  say(text: string, who: Speaker): Promise<void>;
  card(title: string, button: string): Promise<void>;
  wait(seconds: number): Promise<void>;
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
      await ports.card(step.card.title, step.card.button);
    } else if ('emote' in step) {
      events.post({ type: 'partner:emote', kind: step.emote as Emote });
    }
  }
}
