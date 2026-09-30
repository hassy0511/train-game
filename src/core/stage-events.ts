import type { Quaternion, Vector3 } from 'three';
import type { AbilityId, Emote, EnvironmentDef } from '../stage/types';
import { Emitter } from './events';

/** Things that happened in the game that the view (and audio) may want to show. */
export type StageEvent =
  | { type: 'door'; open: boolean; stationId: string }
  | { type: 'passengers'; stationId: string; board: number; alight: number }
  /** v1.11 (5-2) `delay`: the move to `position` starts after this many seconds (a toy's key turns first). */
  | { type: 'actor:state'; id: string; state: string; position?: Vector3; seconds?: number; delay?: number }
  /** v1.11 (5-3) `mirror`: "only" = seen only in a mirror's reflection, "hide" = never reflected. */
  | { type: 'actor:spawn'; id: string; model: string; position: Vector3; quaternion: Quaternion; mirror?: 'only' | 'hide' }
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
        // v1.10 (3-1): "ぽよん" off a floater (soft; its own line)
        | 'floater'
        // v1.10 (4-1): through thin ice, "ぽちゃん" (soft: the train bobs back up)
        | 'crack'
        // v1.10 (4-2): "ぽすっ" into a snow wall without the snowplow (soft: a snowy window, the wiper)
        | 'plow'
        // v1.10 (4-3): caught by the snow wave, "もふっ" (soft: wrapped in soft snow)
        | 'snow'
        // v1.11 (5-1): a fawn gazing at the light stood on the rail, "ききっ… ぴょーん" (soft)
        | 'glare'
        // v1.11 (5-1): little tanukis dancing on the rail, "ききっ" (soft)
        | 'lure';
      /** v1.11 (5-2): a soft fail (a small dip, no shake): a wind-up toy, a ball pit, the snow… (a test hook). */
      soft?: boolean;
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
  /**
   * v1.10 (3-3): a countdown ran out: how it looks follows its picture ("volcano": the sneeze; "moon": the moon comes
   * up over the sea; "clock": a soft white).
   */
  | { type: 'timeUp'; icon: 'volcano' | 'clock' | 'moon' }
  /** v1.10 (3-3): the lighthouse's lamp comes on (`instant`: a skipped cutscene, no sweep of the light). */
  | { type: 'beacon'; instant?: boolean }
  /** v1.10 (3-3): the festival: the moon, the glowing balls, the lanterns (`instant`: skipped, as it ends up). */
  | { type: 'festival'; instant?: boolean }
  /** v1.10 (3-2): the shower under a waterfall starts or stops on the train. */
  | { type: 'shower'; on: boolean }
  /** v1.10 (3-3): the whistle sounded (the glowing motes of a dark stretch flash). */
  | { type: 'whistle' }
  /** v1.7: the volcano's everyday small smoke ring ("ぽふっ"), every VOLCANO_PUFF seconds. */
  | { type: 'volcano:puff' }
  /**
   * v1.10: diving. "dive": a press dived ("ぷくっ・ざぶん"); "surface": the front came up ("ぷかっ") or the last car
   * left the water ("ぷはっ", `long`); "bounce": "ぽよん" off a floater or the water; "bob": a press only bobbed the
   * train (`land`: a mole's dig on land, PHASE9_0 §3). `railId`/`s`: where the train front was.
   */
  | { type: 'dive'; state: 'dive' | 'surface' | 'bounce' | 'bob'; long?: boolean; railId?: string; s?: number; land?: boolean }
  /** v1.10: the bubble dome went on or off (`instant`: a rewind or a resume put it on, no inflating). */
  | { type: 'dome'; on: boolean; instant: boolean }
  /**
   * v1.10 (3-1): a whale (actor `id`): waiting at home, singing back to the whistle, swimming along beside the train,
   * trailing behind it, or swimming away ahead.
   */
  | { type: 'whale'; id: string; state: 'idle' | 'sing' | 'follow' | 'trail' | 'away' }
  /** v1.10 (3-1): the light showed the swirl on the sinking bubbles of bubble fork `junctionId` (reset: hidden again). */
  | { type: 'bubbles:reveal'; junctionId: string }
  | { type: 'bubbles:reset' }
  /** v1.10 (3-1): the train took the rising (true) way at bubble fork `junctionId` ("せいかい！"). */
  | { type: 'bubbles:true'; junctionId: string }
  /** v1.10 (3-1): a big bubble pops ("ぱちん") at cutscene figure `id` (or in front of the camera). */
  | { type: 'pop'; id?: string }
  /** v1.10 (4-1): slowing down on ice (the wheels throw up sparkling ice dust) or not any more. */
  | { type: 'ice'; sparkle: boolean }
  /**
   * v1.10 (4-1): thin ice `index` (gimmicks[]): "shake" (too slow on it, "ぴしぴし"), "crack" (it broke under the
   * train, "ぽちゃん"), "clear" (the last bogie got across).
   */
  | { type: 'thin'; index: number; state: 'shake' | 'crack' | 'clear' }
  /** v1.10 (4-1): the light caught in ice mirror `index` (gimmicks[]): "きらーん". */
  | { type: 'mirror'; index: number; state: 'flash' }
  /** v1.10 (4-2): the snowplow's blade went down or up (`instant`: a rewind or a resume, no motion or sound). */
  | { type: 'plow:blade'; down: boolean; instant: boolean }
  /**
   * v1.10 (4-2): snow wall `index` (gimmicks[]) now stands whole, with the train's dent ("ぽすっ"), or burst, its buried
   * stretch cleared up to `cleared` (s on its rail). `instant`: no burst of snow (a rewind or a resume).
   */
  | { type: 'plow:wall'; index: number; state: 'whole' | 'dented' | 'burst'; cleared: number; instant: boolean }
  /** v1.10 (4-2): the train front burst snow wall `index` ("ずぼーん！"); `boosted`: with the rocket (twice the snow). */
  | { type: 'plow:burst'; index: number; boosted: boolean }
  /** v1.10 (4-2): the snowplow is clearing a buried stretch now (snow flying off both sides) or not any more. */
  | { type: 'plow:spray'; on: boolean }
  /** PHASE9_0 §3: the snowplow pressed with no snow ahead: petals and leaves fly off both sides of the scoop. */
  | { type: 'plow:petals' }
  /** v1.10 (4-2): "ぽすっ" into snow wall `index`. */
  | { type: 'plow:bump'; index: number }
  /** v1.10 (4-2): a cutscene turned the sky to evening over `seconds` s (the lanterns come on with it). */
  | { type: 'sky'; sky: 'evening'; seconds: number }
  /** v1.10 (4-2): the light shows (or no longer shows) the swirl marks on the props with `trace`. */
  | { type: 'trace'; on: boolean }
  /**
   * v1.10 (4-3): the snow wave: out behind the train ("run"), caught it ("caught"), ran into the fence ("safe"), or
   * put away ("off"). Where it is each frame comes to the view on its own (SceneView.setSnowWave).
   */
  | { type: 'chase'; state: 'run' | 'caught' | 'safe' | 'off' }
  /** v1.10 (4-3): the train front went into a tunnel (`index` in gimmicks[]) or came out (null). */
  | { type: 'tunnel'; index: number | null }
  /**
   * v1.11 (PR2c): a cutscene changed the look: the stage's own environment with `env` written over it (`{}`: the stage's
   * own again), through a short fade of `seconds` (0: at once, a fast-forward).
   */
  | { type: 'environment'; env: Partial<EnvironmentDef>; seconds: number }
  /** v1.11 (5-1): the train front came near hush stretch `id` (the moon mark; its line). */
  | { type: 'hush:near'; id: string }
  /** v1.11 (5-1): the light or the whistle startled the sleepers of hush stretch `id` (`railId` `from`–`to`): they hide. */
  | { type: 'hush:startle'; id: string; railId: string; from: number; to: number }
  /** v1.11 (5-1): hush stretch `id` was passed without startling anyone. */
  | { type: 'hush:quiet'; id: string }
  /** v1.11 (5-1): fawn `id` stopped in the middle of the rail, gazing at the light; `free`: it hopped off again. */
  | { type: 'glare:freeze'; id: string }
  | { type: 'glare:free'; id: string }
  /**
   * v1.11 (5-1): lure group `id` (little tanukis): back in its bush ("idle"), hopping there ("hop", too near to come),
   * coming onto the rail ("come", `seconds`), dancing there ("dance"), going back ("back"), or skipping off after the
   * train stopped close by ("bump").
   */
  | { type: 'lure'; id: string; state: 'idle' | 'hop' | 'come' | 'dance' | 'back' | 'bump'; seconds?: number }
  /** v1.11 (5-1): lure groups came onto the rail to dance (a reversed whistle), or went home with the train stopped. */
  | { type: 'lure:come'; ids: string[] }
  | { type: 'lure:bye'; ids: string[] }
  /**
   * v1.11 (5-1): the fireflies of fork `junctionId`: whistled up ("call"), lining the true way ("home"), lost over the
   * fork (a fake one, "lost"), or drifting away up ahead after the train passed ("away").
   */
  | { type: 'fireflies:call'; junctionId: string }
  | { type: 'fireflies:home'; junctionId: string }
  | { type: 'fireflies:lost'; junctionId: string }
  | { type: 'fireflies:away'; junctionId: string }
  /** v1.11 (5-1): the light saw through fake fork `junctionId`: Sakasa's pink lanterns go out ("ぽしゅん"). */
  | { type: 'fake:out'; junctionId: string }
  /**
   * v1.11 (5-2): something was wound the right way round with the whistle ("きりきり… くるりん！"): a toy on the rail
   * ("toy", actor `id`), the band ("band"), a spinning fork stopped ("spin", junction `id`), or a cutscene figure
   * ("cutscene", its model loses "-back"; `town`: the whole town's toys turn round too). `instant`: fast-forwarded.
   */
  | { type: 'windup'; id: string; kind: 'toy' | 'band' | 'spin' | 'cutscene'; instant?: boolean; town?: boolean }
  /**
   * v1.11 (5-2): the band (parade actor `id`) changed what it does: `state` (idle, back, turn, march, wait, exit, gone),
   * its tail at `tail` on `railId` now, going `speed` m/s along it (back: negative). The view moves it between events.
   */
  | { type: 'parade'; id: string; state: string; railId: string; tail: number; speed: number }
  /** v1.11 (5-2): the marching band answers a whistle ("ぱっぱかぱーん！"). */
  | { type: 'parade:fanfare'; id: string }
  /** v1.11 (5-2): spinning fork `id`: woke, started turning to `side`, points the good way, stopped by the whistle. */
  | { type: 'spin'; id: string; state: 'wake' | 'turn' | 'good' | 'fixed'; side?: 'left' | 'right' }
  /** v1.11 (5-2): the train went `side` at spinning fork `id` (`good`: the way on, else round the loop). */
  | { type: 'spin:taken'; id: string; side: 'left' | 'right'; good: boolean }
  /**
   * v1.11 (5-3): the train front went through mirror-flip `id`'s entry gate ("in": the view is mirrored now) or its exit
   * gate ("out"). `instant`: put so by a rewind or a resume (no shimmer, no sound).
   */
  | { type: 'flip:in'; id: string; instant?: boolean }
  | { type: 'flip:out'; id: string; instant?: boolean }
  /** v1.11 (5-3): mirror-flip `id`'s whistle gate opened ("ぽわわん"; `instant`: a resume) or bounced the train ("ぽよん"). */
  | { type: 'flip:gate'; id: string; state: 'open' | 'bump'; instant?: boolean }
  /**
   * v1.11 (5-3): phantom `id` (a phantom fork's id, or "gap:<railId>:<from>") is whole ("solid"), popped ("gone") or
   * popped under the falling train ("fall").
   */
  | { type: 'phantom'; id: string; state: 'solid' | 'gone' | 'fall' }
  /** v1.11 (5-3): mirror `id` turned round (`face` "front": it faces the train; "back": its iron back). `instant`: skipped. */
  | { type: 'mirror:turn'; id: string; face: 'front' | 'back'; seconds: number; instant?: boolean }
  /** v1.11 (5-3): the train front went onto a glass stretch (the first time this mission: "しゃららん"). */
  | { type: 'glass'; on: boolean }
  /** v1.7: a countdown started ("run"), got low, was beaten ("safe"), ran out ("up") or was put away ("off"). */
  | { type: 'countdown'; state: 'run' | 'low' | 'safe' | 'up' | 'off' };

export class StageEventBus extends Emitter<{ event: StageEvent }> {
  post(event: StageEvent): void {
    this.emit('event', event);
  }
}
