import type { Quaternion, Vector3 } from 'three';
import type { AbilityId, Emote } from '../stage/types';
import { Emitter } from './events';

/** Things that happened in the game that the view (and audio) may want to show. */
export type StageEvent =
  | { type: 'door'; open: boolean; stationId: string }
  | { type: 'passengers'; stationId: string; board: number; alight: number }
  | { type: 'actor:state'; id: string; state: string; position?: Vector3; seconds?: number }
  | { type: 'actor:spawn'; id: string; model: string; position: Vector3; quaternion: Quaternion }
  | { type: 'actor:move'; id: string; position: Vector3; seconds: number }
  | { type: 'actor:remove'; id: string }
  /**
   * A rail was cut (a gap from `from` to `to`). v1.7: `style` "fall" drops the stretch and props tagged `props`.
   * `instant` (a fast-forwarded cutscene): shown as it ends up, with no piece flying or falling and no sound.
   */
  | { type: 'rail:cut'; railId: string; from: number; to: number; style?: 'fly' | 'fall'; props?: string; instant?: boolean }
  | { type: 'goal'; stationId: string | null }
  | { type: 'partner:emote'; kind: Emote }
  | { type: 'stop'; grade: 'perfect' | 'ok' }
  | {
      type: 'fail';
      reason:
        | 'tooFast'
        | 'overshoot'
        | 'cat'
        | 'dino'
        | 'fellShort'
        | 'fellNoJump'
        | 'deadEnd'
        | 'nut'
        | 'hopper'
        | 'bridge'
        | 'fragile'
        // v1.7 (2-3)
        | 'rock'
        | 'slip'
        | 'timeUp'
        // v1.8: back from a record's side track (not a failure: no dip, no shake)
        | 'spur'
        // v1.10: "ぽよん" off a floater, or water without the dome (soft)
        | 'dive'
        // v1.10 (4-1): through thin ice, "ぽちゃん" (soft: the train bobs back up)
        | 'crack';
    }
  /**
   * Back to a station after a failure (or a resume). `boarded`: passengers who already got on this run, per station
   * id; they are not put back on the platform.
   */
  | { type: 'rewind'; boarded?: Record<string, number> }
  /** The player has this ability (at load and when it is learned). */
  | { type: 'ability'; id: AbilityId }
  | { type: 'light'; on: boolean }
  | { type: 'jump' }
  /** The light showed which way a reversed junction really goes. */
  | { type: 'sign:reveal'; junctionId: string }
  /** v1.6: the train passed a revealed junction; its sign shows the (reversed) way again for the next time. */
  | { type: 'sign:reset'; junctionId: string }
  | { type: 'record:found'; id: string }
  /** A jump pad shows (for `seconds`, blinking at the end) or hides again. `index` is its place in gimmicks[]. */
  | { type: 'pad'; index: number; visible: boolean; seconds?: number }
  /** v1.5: a bough's tip hangs `sag` m below rest (negative = springing up). `index` is its place in gimmicks[]. */
  | { type: 'bough'; index: number; sag: number }
  /**
   * v1.5: a nut. "roll": rolls from `at` towards the train at `speed` m/s (starting now); "rest": lies still at
   * `at`; "bonk": the train bumped it (it bounces off the rail); "hide": gone; "reset": back where it waits.
   */
  | { type: 'nut'; id: string; state: 'roll' | 'rest' | 'bonk' | 'hide' | 'reset'; railId: string; at: number; speed?: number }
  /** v1.5: a squirrel holding a nut over the rail: "hold", "drop-side" (whistled: off the rail), "drop-rail". */
  | { type: 'squirrel'; id: string; state: 'hold' | 'drop-side' | 'drop-rail' }
  /** v1.6: a grasshopper: back on its leaf ("sit"), hopping onto the roof ("board"), off onto a leaf ("off"). */
  | { type: 'hopper'; id: string; state: 'sit' | 'board' | 'off' }
  /** v1.6: a butterfly of flower bridge `index` (gimmicks[]): where it is along its rail and how it flies. */
  | { type: 'butterfly'; index: number; state: 'wait' | 'follow' | 'hover' | 'land' | 'open'; s: number; flustered: boolean }
  /** v1.6: flower bridge `index` opened (its petals now close the stream). `instant`: already open (a resume), no bloom. */
  | { type: 'bridge'; index: number; open: boolean; instant?: boolean }
  /** v1.6: silk bridge `index` (gimmicks[]): calm, shaking under a too-fast train, or bouncing it back. */
  | { type: 'fragile'; index: number; state: 'calm' | 'shake' | 'boing' }
  /** v1.7: the rocket fired ("burn"), burnt out ("end") or was cut short in a quiet place ("puff", "ぷしゅっ"). */
  | { type: 'rocket'; state: 'burn' | 'end' | 'puff' }
  /** v1.7: the train stopped on an uphill and slips back ("ずるずる"), sand puffing from the wheels. */
  | { type: 'slip' }
  /**
   * v1.7: a rock (actor `id`). Rolling ("rock-roll"): "wait" up the slope on the left, "wobble" (about to go),
   * "roll" across the rail in `seconds`, "bonk" (the train bumped it; it hops off to the sea). Dropping
   * ("rock-drop"): "hide" (up out of sight), "shadow" (its shadow on the rail), "drop" (falls onto the rail and
   * stays), "bonk". `at`/`railId`: where it crosses or lands; `lateral`: the rolling rock's start/end side (m).
   */
  | {
      type: 'rock';
      id: string;
      kind: 'roll' | 'drop';
      state: 'wait' | 'wobble' | 'roll' | 'bonk' | 'hide' | 'shadow' | 'drop';
      railId: string;
      at: number;
      lateral?: number;
      seconds?: number;
    }
  /** v1.7: the volcano sneezes (a big smoke ring; the time-up and the ending). */
  | { type: 'sneeze' }
  /** v1.7: the volcano's everyday small smoke ring ("ぽふっ"), every VOLCANO_PUFF seconds. */
  | { type: 'volcano:puff' }
  /**
   * v1.10: diving. "dive": a press dived ("ぷくっ・ざぶん"); "surface": the front came up ("ぷかっ") or the last car
   * left the water ("ぷはっ", `long`); "bounce": "ぽよん" off a floater or the water; "bob": a press only bobbed the
   * train. `railId`/`s`: where the train front was.
   */
  | { type: 'dive'; state: 'dive' | 'surface' | 'bounce' | 'bob'; long?: boolean; railId?: string; s?: number }
  /** v1.10: the bubble dome went on or off (`instant`: a rewind or a resume put it on, no inflating). */
  | { type: 'dome'; on: boolean; instant: boolean }
  /** v1.10 (4-1): slowing down on ice (the wheels throw up sparkling ice dust) or not any more. */
  | { type: 'ice'; sparkle: boolean }
  /**
   * v1.10 (4-1): thin ice `index` (gimmicks[]): "shake" (too slow on it, "ぴしぴし"), "crack" (it broke under the
   * train, "ぽちゃん"), "clear" (the last bogie got across).
   */
  | { type: 'thin'; index: number; state: 'shake' | 'crack' | 'clear' }
  /** v1.10 (4-1): the light caught in ice mirror `index` (gimmicks[]): "きらーん". */
  | { type: 'mirror'; index: number; state: 'flash' }
  /** v1.7: a countdown started ("run"), got low, was beaten ("safe"), ran out ("up") or was put away ("off"). */
  | { type: 'countdown'; state: 'run' | 'low' | 'safe' | 'up' | 'off' };

export class StageEventBus extends Emitter<{ event: StageEvent }> {
  post(event: StageEvent): void {
    this.emit('event', event);
  }
}
