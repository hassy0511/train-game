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
  | { type: 'rail:cut'; railId: string; from: number; to: number }
  | { type: 'goal'; stationId: string | null }
  | { type: 'partner:emote'; kind: Emote }
  | { type: 'stop'; grade: 'perfect' | 'ok' }
  | { type: 'fail'; reason: 'tooFast' | 'overshoot' | 'cat' | 'dino' | 'fellShort' | 'fellNoJump' | 'deadEnd' | 'nut' }
  | { type: 'rewind' }
  /** The player has this ability (at load and when it is learned). */
  | { type: 'ability'; id: AbilityId }
  | { type: 'light'; on: boolean }
  | { type: 'jump' }
  /** The light showed which way a reversed junction really goes. */
  | { type: 'sign:reveal'; junctionId: string }
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
  | { type: 'squirrel'; id: string; state: 'hold' | 'drop-side' | 'drop-rail' };

export class StageEventBus extends Emitter<{ event: StageEvent }> {
  post(event: StageEvent): void {
    this.emit('event', event);
  }
}
