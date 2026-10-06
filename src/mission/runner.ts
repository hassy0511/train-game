import { Vector3, type Quaternion } from 'three';
import type { Whistle } from '../actions/whistle';
import { CatActor } from '../actors/cat';
import { Parade } from '../actors/parade';
import { SpinSystem } from '../gimmick/spin';
import { GlareDino, LargeDino, makeDino, MidDino, SmallDino, type Dino } from '../actors/dino';
import type { LureGroup } from '../actors/lure';
import { FireflyForks, type FireflyFork } from '../gimmick/fireflies';
import { HushSystem } from '../gimmick/hush';
import { ReversedWhistle } from '../gimmick/reversed-whistle';
import { RollingNut, Squirrel } from '../actors/nut';
import { Grasshopper } from '../actors/grasshopper';
import { DroppingRock, ROCK_HIT_AFTER, RollingRock } from '../actors/rock';
import { Whale } from '../actors/whale';
import type { DiveSystem } from '../gimmick/dive';
import type { PlowSystem } from '../gimmick/plow';
import type { PlowHint } from '../gimmick/plow-hint';
import type { RocketPress, RocketSystem } from '../gimmick/rocket';
import type { IceSystem, ThinIceZone } from '../gimmick/ice';
import type { ThinIceSystem } from '../gimmick/thin-ice';
import type { MirrorSystem } from '../gimmick/mirror';
import type { SlopeSystem, SlopeZone } from '../gimmick/slope';
import { Countdown, type CountdownView } from './countdown';
import { SnowWave, type SnowWaveView } from './chase';
import { LeadRunner, NO_REVERSE, type LeadOutcome, type LeadPhase, type LeadPose } from './lead';
import { Welcome, type WelcomeOutcome, type WelcomeState } from './welcome';
import { resolvePlacement } from '../stage/loader';
import { sectionOf } from '../stage/sections';
import type { TunnelSystem } from '../gimmick/tunnel';
import type { MagnetSystem } from '../gimmick/magnet';
import type { IronProps } from '../gimmick/iron-props';
import { FlowerBridges, type BridgeOutcome } from '../gimmick/flower-bridge';
import { FragileBridges } from '../gimmick/fragile';
import { addToProgress, advanceResume, loadProgress, type Resume } from '../core/progress';
import type { StageEvent, StageEventBus } from '../core/stage-events';
import { CutsceneSkip, fastForwardCutscene, runCutscene, type CutscenePorts } from '../cutscene/runner';
import type {
  AbilityId,
  BubbleIcon,
  GapDef,
  LeadDef,
  LeadLine,
  WelcomeLine,
  JunctionDef,
  MissionDef,
  MissionLines,
  MissionStep,
  RecordDef,
  ResolvedRecord,
  Speaker,
  StageData,
  StationDef,
} from '../stage/types';
import { param, zoneAt } from '../gimmick/zones';
import {
  BUBBLE_FORK,
  COUNTDOWN,
  DIVE,
  DOOR_REMIND_SECONDS,
  FALL,
  FIREFLY_FORK,
  GLARE,
  HUSH,
  JUMP,
  LEAD,
  LEVER_NOTCHES,
  LIGHT,
  LURE,
  MIRROR,
  MAGNET,
  PARADE,
  PASSENGER_SECONDS,
  RECORD,
  REFUSE_COOLDOWN,
  REVERSE,
  REWIND_DISTANCE,
  SLOPE,
  SNOW_WAVE,
  STOP_NOTCH,
  WELCOME,
  WINDUP,
} from '../train/params';
import type { JunctionSide, Train } from '../train/train';
import { StopMonitor, type GaugeState, type StopGrade } from './station-stop';
import { REVERSE_LINES, SAKASA_REVERSE_LINES, type ReverseLine, type ReverseSystem } from '../gimmick/reverse';

/**
 * What the clear card shows (PHASE7_FINISH §4 item 10): the graded stops of this run (`perfect` of them "ぴったり")
 * and the stage's records in order, found (in the save) or not, `fresh` when found in this run.
 */
export interface ClearRewards {
  stops: number;
  perfect: number;
  records: { id: string; name: string; found: boolean; fresh: boolean }[];
}

/** Everything the runner needs from the UI layer. */
export interface MissionPorts extends CutscenePorts {
  /** Say something without blocking (queued). */
  sayAsync(text: string, who?: Speaker): void;
  /** Drop every line still queued or showing (something more urgent is about to be said). */
  hush(): void;
  /**
   * v1.7: say this now, dropping the lines still queued or showing (a cue that is only useful on time). v1.11 (6-1)
   * `icon`: a little picture on the bubble ("とまって〜！" with an open hand).
   */
  sayNow(text: string, icon?: BubbleIcon): void;
  toast(text: string, kind: StopGrade): void;
  /** The stage's clear card, with what went well this run (PHASE7_FINISH §4 item 10). */
  clearCard(title: string, button: string, rewards: ClearRewards): Promise<void>;
  showDoorButton(onPress: () => void): void;
  hideDoorButton(): void;
  setCargo(passengers: number, parcel: boolean): void;
  cameraFx(dip: number, shake: number): void;
  /** Lever back to "stop" after a rewind. */
  resetLever(): void;
  /** Stop gauge state for this frame. */
  gauge(state: GaugeState): void;
  /** The light revealed a reversed junction: highlight the true side on the arrows. */
  revealJunction(side: JunctionSide): void;
  /** A record was found (already saved). */
  recordFound(record: RecordDef): void;
  /** Stage clear: the fanfare just before the clear card. */
  fanfare(): void;
  /** Something nearby reacts to the whistle right now: make the whistle button glow. */
  whistleHint(on: boolean): void;
  /** v1.7: play this song (a countdown's hurry music), or the stage's own song again (null). */
  music(id: string | null): void;
  /** v1.11 (PR5): say this only when nothing is being said or waiting (a hint that may as well not come). */
  sayIfQuiet(text: string): boolean;
  /** v1.11 (6-1): the music's loudness times `gain` (0..1), over `seconds` (welcome.musicGain while waiting at the door). */
  musicGain(gain: number, seconds: number): void;
}

/** v1.7: the rocket and the slopes (made by the caller: they also work on the test course, without a runner). */
export interface MissionSystems {
  rocket: RocketSystem;
  slopes: SlopeSystem;
  /** v1.10: the dive button's hint and glow (for the partner's "いまだ！ もぐる！"). */
  dive?: DiveSystem;
  /** v1.10 (4-1): ice, thin ice and ice mirrors (made by the caller, like the rocket). */
  ice?: IceSystem;
  thinIce?: ThinIceSystem;
  mirrors?: MirrorSystem;
  /** v1.10 (4-2): the snow walls and the snowplow button's hint (made by the caller). */
  plow?: PlowSystem;
  plowHint?: PlowHint;
  /** v1.10 (4-3): tunnels (the light button glows for them; "トンネルだ！"). */
  tunnel?: TunnelSystem;
  /** v1.11 (PR5): the magnet light's targets, and the iron odds and ends by the line (made by the caller). */
  magnet?: MagnetSystem;
  iron?: IronProps;
  /**
   * v1.11 (PR8a): うしろむき's glow and lines (made by the caller). It is also how the runner (and the lead, 6-1 M2,
   * PR8b's ReverseReader) knows the train runs backwards. Omitted: never (NO_REVERSE).
   */
  reverse?: ReverseSystem;
}

export type MissionPhase = 'idle' | 'driving' | 'stopped' | 'doors' | 'cutscene' | 'failing' | 'clear';

type DefaultLine =
  | 'tooFast'
  | 'overshoot'
  | 'short'
  | 'perfect'
  | 'ok'
  | 'catDanger'
  | 'catDangerAfter'
  | 'doorsOpenLever'
  | 'doorAsk'
  | 'doorsClosedLever'
  | 'jumpStopped'
  | 'fellShort'
  | 'fellNoJump'
  | 'dinoDanger'
  | 'dangerAfter'
  | 'deadEnd'
  | 'recordFound'
  | 'padGone'
  | 'padAppear'
  | 'nutHit'
  | 'boughJump'
  | 'squirrelDropped'
  | 'hopperNear'
  | 'hopperOn'
  | 'hopperReady'
  | 'hopperDone'
  | 'hopperFell'
  | 'butterflyNear'
  | 'butterflyFollow'
  | 'butterflyWait'
  | 'butterflyFast'
  | 'budClosed'
  | 'bridgeOpen'
  | 'bridgeFell'
  | 'fragileNear'
  | 'fragileShake'
  | 'fragileBoing'
  | 'fragileBoingAfter'
  | 'fragileClear'
  | 'fellLight'
  | 'rocketLever'
  | 'rocketEmpty'
  | 'rocketQuiet'
  | 'slip'
  | 'slipEmpty'
  | 'slipAfter'
  | 'slipEmptyAfter'
  | 'noBrakeLever'
  | 'rockHit'
  | 'timeSafe'
  | 'timeUp'
  | 'spurBack'
  | 'diveNear'
  | 'diveBoing'
  | 'diveBoingAfter'
  | 'floatHit'
  | 'floatHitAfter'
  | 'whaleCall'
  | 'whaleSang'
  | 'currentWait'
  | 'bubbleNear'
  | 'bubbleTrue'
  | 'bubbleRevealed'
  | 'iceOvershoot'
  | 'iceOvershootAfter'
  | 'crackShake'
  | 'crackFall'
  | 'crackAfter'
  | 'crackEmpty'
  | 'crackEmptyAfter'
  | 'mirrorFlash'
  | 'mirrorFake'
  | 'plowNear'
  | 'plowBump'
  | 'plowBumpAfter'
  | 'chaseStart'
  | 'chaseNear'
  | 'chaseRocket'
  | 'chaseFar'
  | 'chaseCaught'
  | 'chaseCaughtAfter'
  | 'chaseTired'
  | 'chaseSafe'
  | 'tunnelNear'
  // v1.11 (5-1 よるの もり)
  | 'hushNear'
  | 'hushLightOff'
  | 'hushStartle'
  | 'hushQuiet'
  | 'glareFreeze'
  | 'glareFreezeAfter'
  | 'glareFree'
  | 'glareMercy'
  | 'glareBump'
  | 'glareBumpAfter'
  | 'lureMercy'
  | 'reversedNear'
  | 'reversedIn'
  | 'lureCome'
  | 'lureBye'
  | 'lureBump'
  | 'lureBumpAfter'
  | 'reversedQuiet'
  | 'fireflyNear'
  | 'fireflyCall'
  | 'fireflyAgain'
  | 'fireflyFakeNear'
  | 'fireflyConfused'
  | 'fireflyConfusedLit'
  | 'fakeRevealed'
  // v1.11 (5-2 おもちゃの まち)
  | 'spinCall'
  | 'spinStop'
  | 'paradeNear'
  | 'paradeCall'
  | 'paradeTurn'
  | 'paradeFollow'
  | 'paradeMatch'
  | 'paradeWait'
  | 'paradeBye'
  // v1.11 (PR5 じしゃくライト)
  | 'magnetNear'
  | 'magnetGo'
  | 'magnetBump'
  | 'magnetBumpAfter'
  | 'magnetPlay'
  // v1.11 (5-3 かがみの せかい)
  | MirrorWorldLine
  // v1.11 (PR8a うしろむき)
  | Exclude<keyof typeof REVERSE_LINES, 'needAbility'>
  // v1.11 (PR11a 区画と もん)
  | 'wrongGate'
  // v1.11 (6-1 おいかけっこ・ドアを あけて まつ)
  | LeadLine
  | WelcomeLine;

/** v1.11 (5-3): the mirror world's lines (PHASE9_CHAPTER5_6 第 6 部 §4.8). */
export type MirrorWorldLine = 'flipIn' | 'flipOut' | 'mirrorGateNear' | 'mirrorGateOpen' | 'mirrorGateBump' | 'mirrorGateAfter';

const DEFAULT_LINES: Record<DefaultLine, string> = {
  tooFast: 'わわっ、はやすぎた〜！ もういっかい！',
  overshoot: 'いきすぎた〜！ もういっかい！',
  short: 'もうちょっと まえ！',
  perfect: 'ぴったり！ すごい！',
  ok: 'とまれた！',
  catDanger: 'あぶない！',
  catDangerAfter: 'びっくりした〜。もういっかい！',
  doorsOpenLever: 'ドアが あいてるよ！',
  doorAsk: 'ドアの ボタンを おして、ドアを あけよう！',
  doorsClosedLever: 'さきに ドアを あけよう！',
  jumpStopped: 'はしりながら おしてね',
  fellShort: 'もうちょっと はやく！',
  fellNoJump: 'ジャンプ わすれてた！',
  dinoDanger: 'あぶない！',
  dangerAfter: 'びっくりした〜。もういっかい！',
  deadEnd: 'いきどまり！ ライトで たしかめよう',
  recordFound: 'みつけた！',
  padGone: 'あれ？ ジャンプだいが きえてる… きてきを ならしてみよう！',
  padAppear: 'でた！ だいに のって！',
  nutHit: 'ぽこん！ きのみに ぶつかった〜',
  boughJump: 'えだが とばして くれるよ！',
  squirrelDropped: 'リスが きのみを おとした！ いまの うちに！',
  hopperNear: 'バッタさんだ！ きてきで よんでみよう',
  hopperOn: 'わっ！ バッタさんが のった！',
  hopperReady: 'バッタジャンプ！ {speed} で とぼう！',
  hopperDone: 'ありがとう、バッタさん！',
  hopperFell: 'バッタさんが いないと とどかない〜',
  butterflyNear: 'ちょうちょだ！ ライトで よんで みよう',
  butterflyFollow: 'ついてきた！ ライトは つけた まま ね',
  butterflyWait: 'ちょうちょが まってる！ ライトを つけて',
  butterflyFast: 'はやい！ ちょうちょが あわててる〜',
  budClosed: 'はしが ない！ ちょうちょを つれて こよう',
  bridgeOpen: 'さいた！ はなの はしだ！',
  bridgeFell: 'ぽちゃん！ はしが まだ ない〜',
  fragileNear: 'いとの はしだ！ ゆっくり わたろう',
  fragileShake: 'ゆれてる！ ゆっくり！',
  fragileBoing: 'ぼよよーん！ はやすぎた〜',
  fragileBoingAfter: 'いとの うえは ゆっくり ね',
  fragileClear: 'わたれた！ じょうず！',
  fellLight: 'ライトを けすと はやく なるよ！',
  // v1.7 (2-3). Lines without a default here (steepNear, rocketReady, rocketGo, rocketAgain, noBrake, rockNear,
  // rockDrop, timerStart, timeLow) are only said when the mission has them.
  rocketLever: 'ロケット ちゅうは レバーが きかないよ',
  rocketEmpty: 'からっぽ！ えきで まんたんに なるよ',
  rocketQuiet: 'えきの ちかくは ロケット おやすみ',
  slip: 'ずるずる〜… のぼれなかった',
  slipEmpty: 'ずるずる〜… ロケットが たりない！',
  slipAfter: 'ひかったら ロケットを おしてね',
  slipEmptyAfter: 'ひかったら ロケットを おしてね',
  noBrakeLever: 'つるつる〜！ レバーが きかない！',
  rockHit: 'ぽこん！ いしに ぶつかった〜',
  timeSafe: 'セーフ！',
  timeUp: 'はっくしょーん！',
  // v1.8
  // Reaching a record's side track end is a success: not the dead end's "いきどまり！".
  spurBack: 'やったね！ もとの みちに もどるよ',
  // v1.10 (もぐる)
  diveNear: 'みずだ！ もぐるを おして！',
  diveBoing: 'ぽよん！ もぐるの わすれた〜',
  diveBoingAfter: 'ひかったら もぐるを おしてね',
  // v1.10 (3-1). No default: diveGo, diveReady, floatNear, whaleNear, currentIn (said only when the mission has them).
  floatHit: 'ぽよん！ ぶつかっちゃった〜',
  floatHitAfter: 'ひかったら もぐるを おしてね',
  whaleCall: 'きてきで あいさつ しよう！',
  whaleSang: 'おへんじ してくれた！',
  currentWait: 'くじらさんを よんでみよう！',
  bubbleNear: 'あわが ふたつ！ どっちかな？',
  bubbleTrue: 'せいかい！ ほんものの あわ！',
  bubbleRevealed: 'ぐるぐる もよう！ サカサの あわだ',
  // v1.10 (4-1). iceNear, iceStop, iceBrake, thinIceClear and mirrorNear have no default: only said when written.
  iceOvershoot: 'つるーん！ すべって いきすぎた〜',
  iceOvershootAfter: 'こおりは はやめに ブレーキ ね',
  crackShake: 'ぴしぴし！ われちゃう〜！',
  crackFall: 'ぽちゃん！ ぷかぷか〜',
  crackAfter: 'ひかったら ロケットで いっきに！',
  crackEmpty: 'ぽちゃん！ ロケットが たりない〜',
  crackEmptyAfter: 'こんどは ロケットを とっておこう',
  mirrorFlash: 'きらーん！ あれは かがみ だ！',
  mirrorFake: 'わっ！ ワンダーごうが もう 1だい！？',
  // v1.10 (4-2 ゆきかき). plowGo and plowLong have no default: only said when the mission has them.
  plowNear: 'ゆきの かべ！ ゆきかきを おして！',
  plowBump: 'ぽすっ！ ゆきに ささった〜',
  plowBumpAfter: 'ひかったら ゆきかきを おしてね',
  // v1.10 (4-3 ゆきの なみ・トンネル)
  chaseStart: 'ゆきの なみだ！ はやい で にげよう！',
  chaseNear: 'もこもこが くる！ はやい！',
  chaseRocket: 'もこもこが きた！ ロケット！',
  chaseFar: 'はなれた！ すごい！',
  chaseCaught: 'もふっ！ ゆきまみれ〜',
  chaseCaughtAfter: 'もういっかい！ はやい で にげよう',
  chaseTired: 'もこもこ、つかれてきた みたい',
  chaseSafe: 'セーフ！',
  tunnelNear: 'トンネルだ！ ライトを つけよう',
  // v1.11 (5-1 よるの もり, PHASE9_CHAPTER5_6 第 4 部 §4.8). Every one within 20 letters.
  hushNear: 'つきの はらっぱ… みんな ねてる',
  hushLightOff: 'ライトを けして、しーっ',
  hushStartle: 'あっ、びっくりして かくれちゃった',
  hushQuiet: 'しずかに とおれたね！',
  glareFreeze: 'こじかさんが ライトに みとれてる！',
  glareFreezeAfter: 'ライトを けすと わたれるよ',
  glareFree: 'ぱちぱち… わたれた！ よかった〜',
  glareMercy: 'こじかさん、こんどは わたれたね',
  glareBump: 'ききっ… こじかさん、ぴょーん！',
  glareBumpAfter: 'つきの ばしょでは ライトを けしてね',
  lureMercy: 'たぬきさん、やぶで おどってる！',
  reversedNear: 'たぬきの ふだ… さかさ きてき？',
  reversedIn: 'ここは きてき がまんだよ',
  lureCome: 'わわっ、よってきちゃった！ とまって！',
  lureBye: 'ばいばい！ きてきは がまんだね',
  lureBump: 'ききっ… たぬきさん、おどってた〜',
  lureBumpAfter: 'たぬきの もりは きてき がまん',
  reversedQuiet: 'しずかに とおれた！ えらい！',
  fireflyNear: 'くさの なかに ちいさな ひかり…\nきてきで あいずを しよう！',
  fireflyCall: 'ほたるが とんだ！ みちを おしえてる！',
  fireflyAgain: 'きてきで ほたるに あいず！',
  fireflyFakeNear: 'ピンクの ひかり…？ へんだね',
  fireflyConfused: 'ほたるが まよってる！ ライトで みて！',
  fireflyConfusedLit: 'ちかづくと わかるよ！',
  fakeRevealed: 'にせものの ひかりだ！ サカサの かな',
  // v1.11 (5-2 おもちゃの まち, PHASE9_CHAPTER5_6 第 5 部 §4.8). paradeNear has no default (said only when written).
  spinCall: 'こっちを むいた！ いま きてき！',
  spinStop: 'ぴたっ！ とまった！',
  paradeNear: '',
  paradeCall: 'がくたいさんを きてきで まきなおそう',
  paradeTurn: 'くるりん！ ぱっぱかぱーん！',
  paradeFollow: 'パレードだ！ ゆっくり ついていこう',
  paradeMatch: 'ぴったり！ パレードの なかまだ！',
  paradeWait: 'がくたいさんが まってるよ！',
  paradeBye: 'ありがとう〜 がくたいさん！',
  // v1.11 (PR5 じしゃくライト, PHASE9_CHAPTER5_6 第 2 部 M14). magnetBump's default is by kind (magnetBumpLine).
  magnetNear: 'てつの ものだ！ じしゃくに しよう！',
  magnetGo: 'きゅいーん… くっついた！',
  magnetBump: 'ぽよん！ レールが たりない〜',
  magnetBumpAfter: 'ひかったら じしゃくに してね',
  magnetPlay: 'びよん！ くっついちゃった！',
  // v1.11 (5-3 かがみの せかい, PHASE9_CHAPTER5_6 第 6 部 §4.8). Every one within 20 letters.
  flipIn: 'かがみの なかに はいった！',
  flipOut: 'もどって きた！',
  mirrorGateNear: 'かがみの もん！ きてきで あいずだ！',
  mirrorGateOpen: 'かがみが ぷるん！ はいれる！',
  mirrorGateBump: 'ぽよん！ かがみが かたい〜',
  mirrorGateAfter: 'きてきで あいず しよう！',
  // v1.11 (PR8a うしろむき, PHASE9_CHAPTER5_6 第 3 部 A14).
  backNear: REVERSE_LINES.backNear,
  backArrows: REVERSE_LINES.backArrows,
  reverseNudge: REVERSE_LINES.reverseNudge,
  reverseStop: REVERSE_LINES.reverseStop,
  reverseStopGap: REVERSE_LINES.reverseStopGap,
  reverseEnd: REVERSE_LINES.reverseEnd,
  backUp: REVERSE_LINES.backUp,
  refuseRocketBack: REVERSE_LINES.refuseRocketBack,
  reverseOops: REVERSE_LINES.reverseOops,
  // v1.11 (PR11a 区画と もん, PHASE9_CHAPTER5_6 第 3 部 B9): through a gate to a section with nothing for this step.
  wrongGate: 'こっちの せかいも みて いこう！',
  // v1.11 (6-1 おいかけっこ, PHASE9_CHAPTER5_6 第 7 部 §4.8). Every one within 20 letters. leadStart is Sakasa's.
  leadStart: 'さようなら〜！',
  leadStartReply: 'でた！ まてまて〜！',
  leadPrompt: 'きてきで よんで みよう！',
  leadCall: 'とまって〜！',
  leadRun: 'あれれ？ もっと にげた！',
  leadAgain: 'もう いっかい！',
  leadFlip: 'ぎゃくだ！\nサカサは なんでも ぎゃく なんだ',
  leadBackRemind: 'うしろへ さがって みよう！',
  leadFollow: 'ついて きた！\nほんとに ぎゃく だったんだ！',
  leadMet: 'まえに もどして えきへ！',
  leadAutoCall: 'とまって〜！',
  leadAutoFollow: 'あれ？ もどって きた！',
  leadGone: 'おしろの ほうへ いった…',
  stationClosed: 'えきは あとで！ サカサを おいかけよう',
  // v1.11 (6-1 ドアを あけて まつ)
  welcomeAsk: 'ドアを あけて、まって みよう',
  welcomeFlinch: 'しーっ… なにも いわないで まとう',
  welcomeFlinchAgain: 'しーっ',
  welcomeCalm: 'まつ だけで いいよ',
};

/**
 * v1.8: what the partner says at a junction whose side way needs an ability the player does not have yet
 * (the mission's "needAbility" line wins).
 */
const NEED_LINES: Partial<Record<AbilityId, string>> = {
  rocket: 'ロケットが あれば のぼれそう…',
  jump: 'ジャンプが できたら いけそう…',
  light: 'ライトが あれば みえそう…',
  dive: 'もぐれたら いけそう…',
  plow: 'ゆきかきが あれば いけそう…',
  // v1.11 (PR5)
  magnetLight: 'じしゃくライトが あれば いけそう…',
  // v1.11 (PR8a, 第 3 部 A14)
  reverse: REVERSE_LINES.needAbility,
};
const NEED_LINE_OTHER = 'いまは まだ いけないみたい…';

/** Car front to car centre (m): a fork is taken when the car centre passes it. */
const TRAIN_HALF = 6;

/** v1.11 (5-2): the lever notch nearest the band's pace ("ゆっくり", 5 m/s): it glows behind the marching band. */
const PARADE_NOTCH = LEVER_NOTCHES.reduce((best, n, i) => (Math.abs(n.speed - PARADE.speed) < Math.abs(LEVER_NOTCHES[best].speed - PARADE.speed) ? i : best), 1);

/** Lever labels by jump hint, for the partner's "つぎの きれめは ふつう で とべる". */
const HINT_NOTCH: Record<NonNullable<GapDef['hint']>, number> = { normal: 3, fast: 4, max: 5 };

/** Card titles for newly learned abilities. */
export const ABILITY_NAMES: Partial<Record<AbilityId, string>> = {
  jump: 'ジャンプ',
  light: 'ライト',
  whistle: 'きてき',
  rocket: 'ロケット',
  dive: 'もぐる',
  // v1.10 (4-2): chapter 4's, given by 4-2 (3-2's third record waits for it).
  plow: 'ゆきかき',
  // Chapter 5's ability (5-3): the third records of chapters 3–5 wait for it.
  magnetLight: 'じしゃくライト',
  // v1.11 (PR8a; 6-1 M2 gives it, PHASE9 §0.11 の 7): chapter 6's: 1-3's, 5-3's and 6-1's third records wait for it.
  reverse: 'うしろむき',
};

/**
 * v1.11 (6-1): an ability whose "learned" card says more than "<name>を おぼえた！" (PHASE9 §0.11 の 7:
 * "うしろむき うんてんを／おぼえた！").
 */
export const ABILITY_CARD_TITLES: Partial<Record<AbilityId, string>> = {
  reverse: 'うしろむき うんてんを\nおぼえた！',
};

/**
 * v1.8: the ability a record needs is in use right now (null: nothing needed): the light on, in the air (jump), the
 * rocket's push (Train.rocketUsedHere), v1.10 diving (in a dive, sent down at a dive fork, or under water).
 */
export function abilityInUse(ability: AbilityId | null, train: Train, lightOn: boolean): boolean {
  switch (ability) {
    case null:
      return true;
    case 'light':
      return lightOn;
    case 'jump':
      return train.airborne;
    case 'rocket':
      return train.rocketUsedHere;
    case 'dive':
      return train.diving;
    case 'plow':
      // v1.10 (4-2): clearing a buried stretch with the snowplow.
      return train.plowing;
    case 'magnetLight':
      // v1.11 (PR5): never by passing near: a record needing the magnet is found when it has been pulled to the train.
      return false;
    case 'reverse':
      // v1.11 (PR8a, 第 3 部 A12.1): reversing (standing too), measured from the tail car.
      return train.reversing;
    default:
      return false;
  }
}

/**
 * Drives a stage: opening → missions (steps at stations) → ending.
 * Sequencing is async; per-frame monitoring happens in update().
 */
export class MissionRunner {
  phase: MissionPhase = 'idle';
  missionIndex = -1;
  stepIndex = -1;
  passengers = 0;
  parcel = false;

  private stop: StopMonitor | null = null;
  private cats: CatActor[] = [];
  private dinos: Dino[] = [];
  private readonly nuts: RollingNut[];
  private readonly squirrels: Squirrel[];
  private readonly hoppers: Grasshopper[];
  private readonly bridges: FlowerBridges;
  private readonly fragiles: FragileBridges;
  private readonly rollingRocks: RollingRock[];
  private readonly droppingRocks: DroppingRock[];
  private readonly rocket: RocketSystem | null;
  private readonly slopes: SlopeSystem | null;
  /** v1.10 (4-1). */
  private readonly ice: IceSystem | null;
  private readonly thinIce: ThinIceSystem | null;
  private readonly mirrors: MirrorSystem | null;
  /** v1.10 (4-1): ice lines said in this mission (iceNear, iceStop, iceBrake). */
  private readonly iceSaid = new Set<string>();
  /** v1.10 (4-1): mirror junctions whose mirrorNear was said this try. */
  private readonly mirrorNearSaid = new Set<string>();
  /** The countdown of the step being driven, if it has one. */
  private countdown: Countdown | null = null;
  /** Seconds the "セーフ！" panel still shows. */
  private safeLeft = 0;
  /** v1.10 (4-3): the snow wave of the step being driven, if it has one, and whether its rocket line was said this try. */
  private chase: SnowWave | null = null;
  private chaseRocketSaid = false;
  private readonly tunnel: TunnelSystem | null;
  /** Where the train last stopped for a step (a countdown's time-up goes back there). */
  private lastStop: { railId: string; at: number } | null = null;
  /** v1.10 (3-3): the station the train last stood at (a cutscene's doors open on its side). */
  private lastStationId: string | null = null;
  /** Rocket lines: rocketReady / rocketGo once per mission (PHASE6 §5.1); rocketAgain counts glows per slope (reset on rewind). */
  private rocketReadySaid = false;
  private rocketGoSaid = false;
  private rocketLeverSaid = false;
  private noBrakeLeverSaid = false;
  private readonly slopeGlows = new Map<number, number>();
  /** Zone lines already said this try. */
  private readonly zoneLines = new Set<string>();
  /** Reversed-sign junctions the train has once gone the wrong way at (the light button glows there after). */
  private readonly wrongTurns = new Set<string>();
  /** What the view was last told about each butterfly (state, place). */
  private readonly butterflyPosted = new Map<number, string>();
  private lightOn = false;
  private readonly gapHints = new Set<GapDef>();
  private readonly signLines = new Set<string>();
  /** v1.8: records whose hint was said this stage run. */
  private readonly recordHints = new Set<string>();
  private readonly revealed = new Set<string>();
  private readonly found: Set<string>;
  /** Records already found before this run (the clear card marks the new ones; a resume brings its own back). */
  private readonly foundBefore: Set<string>;
  /** Passengers who got on so far this run, per station (a rewind does not put them back on the platform). */
  private readonly boarded = new Map<string, number>();
  /** Graded stops this run, and how many of them were "ぴったり" (the clear card). */
  private stopsMade = 0;
  private perfectStops = 0;
  private readonly abilities: Set<AbilityId>;
  /** Jump pads: shown for a few seconds after a whistle; `index` into gimmicks[]. */
  private readonly pads: { index: number; railId: string; at: number; seconds: number; range: number; left: number; hinted: boolean }[];
  private movingSaid = false;
  /** v1.10: "みずだ！ もぐるを おして！" was said in this mission. */
  private diveNearSaid = false;
  /** v1.10 (3-1): the first dive and the first glow of "もぐる" in this mission were named. */
  private diveGoSaid = false;
  private diveReadySaid = false;
  private readonly dive: DiveSystem | null;
  /** v1.10 (4-2): the snow walls, and the snowplow lines said in this mission. */
  private readonly plow: PlowSystem | null;
  private plowNearSaid = false;
  private plowGoSaid = false;
  private plowLongSaid = false;
  /** Metres cleared in a row with the snowplow (for plowLong). */
  private plowRun = 0;
  private plowRunFrom: number | null = null;
  /** v1.10 (4-2): the light shows the swirl marks on the trace props now; their line was said this stage run. */
  private traceOn = false;
  private traceSaid = false;
  /** v1.10 (3-1): floaters named this try. */
  private readonly floaterLines = new Set<string>();
  private readonly whales: Whale[];
  /** v1.10 (3-1): the current (whale updraft) the train front is in, by gimmick index, or −1. */
  private inCurrent = -1;
  /** v1.10 (3-1) bubble forks: pointed out (this mission), coming up (not passed yet), taken the sinking way before. */
  private readonly bubbleNearSaid = new Set<string>();
  private readonly bubbleTrueSaid = new Set<string>();
  private readonly bubbleArmed = new Set<string>();
  private readonly bubbleWrong = new Set<string>();
  private readonly bubbleShown = new Set<string>();
  private bubbleRevealedSaid = false;
  /** Test hook: the last bubble fork whose sinking swirl the light showed. */
  bubbleRevealedId = '';
  /** In the 'doors' phase: false while waiting for the door button, true once the doors are open. */
  private doorsOpen = false;
  private hintsFired = new Set<number>();
  /** Game time while driving (s), for the refusal lines' cooldown. */
  private clock = 0;
  /** The last "not now" line (a refused rocket or jump press) and when it was said: a mashing child hears it once. */
  private lastRefusal: { text: string; at: number } | null = null;
  /** The next drive comes after a fail: the slopes and the rocket announce again once it starts. */
  private rearm = false;
  private resolveDrive: ((outcome: DriveOutcome) => void) | null = null;
  /** The cutscene playing now can be skipped through this ("▶▶"); null outside cutscenes. */
  private skip: CutsceneSkip | null = null;
  private lines: MissionLines = {};
  private readonly groundY: number | null;
  /** v1.11 (5-1): hush stretches, whistle-reversed stretches with their tanukis, firefly forks, and the fawns. */
  private readonly hush: HushSystem;
  private readonly reversed: ReversedWhistle;
  private readonly fireflies: FireflyForks;
  private readonly fawns: GlareDino[];
  /** v1.11 (5-1): night lines said this try, this mission and this stage run (by key). */
  private readonly nightTry = new Set<string>();
  private readonly nightMission = new Set<string>();
  private readonly nightStage = new Set<string>();
  /** v1.11 (5-1): fawn fails in a row per hush stretch (the mercy), fireflies gone ahead, forks gone wrong at. */
  private readonly glareFails = new Map<string, number>();
  private readonly fireflyAway = new Set<string>();
  private readonly wrongForks = new Set<string>();
  /** v1.11 (5-1): whistle-reversed stretches the train entered, and those whistled in, this try. */
  private readonly reversedEntered = new Set<string>();
  private readonly reversedCalled = new Set<string>();
  /** v1.11 (5-1): times a fawn stopped to gaze at the light (only goes up; a test hook). */
  glareFreezes = 0;
  /** v1.11 (5-2): the toy band(s) and the spinning forks. */
  private readonly parades: Parade[];
  private readonly spins: SpinSystem;
  /** v1.11 (5-2): the band's timers: held standing (paradeCall again), standing behind it (paradeWait), at "ゆっくり". */
  private paradeHeldFor = 0;
  private paradeStandFor = 0;
  private paradeMatchFor = 0;
  /** v1.11 (5-2): the ways taken at spinning forks, "kuru-1:loop,kuru-1:good" (only grows; a test hook). */
  private readonly spinTaken: string[] = [];
  /** v1.11 (PR5): the magnet light's targets and the odds and ends; their lines said (this mission, this try, the stage). */
  private readonly magnet: MagnetSystem | null;
  private readonly iron: IronProps | null;
  private magnetNearSaid = false;
  private magnetGoSaid = false;
  private magnetPlaySaid = false;
  private readonly magnetLines = new Set<string>();
  /** v1.11 (PR5): target lines waiting for a quiet moment (said while the train is in the first half of the glow). */
  private readonly magnetWaiting = new Map<string, { text: string; railId: string; at: number; until: number }>();
  /** v1.11 (PR8a): うしろむき's glow and lines; the station overshot this drive (A9) and when "うしろで もどって" came. */
  private readonly reverse: ReverseSystem | null;
  private backUpAt = -Infinity;
  private backUpSaidFor: string | null = null;
  /** v1.11 (PR8a, B6.3): the step drives to a reverse platform: arriving is stopping at its siding's buffer. */
  private reverseArrival: StationDef | null = null;
  /** v1.11 (PR11a): the sections "こっちの せかいも みて いこう！" was said for (this stage run). */
  private readonly wrongGateSaid = new Set<string>();
  /** v1.11 (6-1): "おいかけっこ" of the step being driven (kept after it for the test hooks). */
  private lead: LeadRunner | null = null;
  /** v1.11 (6-1): the mid-step cutscene playing now (a lead's `learn`), or "". */
  inlineCutscene = '';
  /** v1.11 (6-1): "えきは あとで！" was said at the closed station on this lap. */
  private stationClosedSaid = false;
  /** v1.11 (6-1): "ドアを あけて まつ" of the station stood at now (kept after it for the test hooks). */
  private welcome: Welcome | null = null;
  private welcomeCalmSaid = false;
  /** v1.11 (6-1): the figures on the stage now (cutscenes', a lead's home) by id, with their model. */
  private readonly figures = new Map<string, string>();

  constructor(
    private readonly stage: StageData,
    private readonly train: Train,
    private readonly whistle: Whistle,
    private readonly events: StageEventBus,
    private readonly ports: MissionPorts,
    systems?: MissionSystems,
  ) {
    this.groundY = stage.file.environment.ground?.y ?? null;
    this.rocket = systems?.rocket ?? null;
    this.slopes = systems?.slopes ?? null;
    this.dive = systems?.dive ?? null;
    this.plow = systems?.plow ?? null;
    this.tunnel = systems?.tunnel ?? null;
    this.magnet = systems?.magnet ?? null;
    this.iron = systems?.iron ?? null;
    this.reverse = systems?.reverse ?? null;
    // v1.11 (PR11a, 第 3 部 B5・B9): through a gate into a section where this step's station is not (not the one the
    // stage starts in: every way back goes through it): "こっちの せかいも みて いこう！", once a section. Never a fail.
    train.events.on('portal', ({ to }) => {
      const sec = sectionOf(stage.sections, to);
      const station = this.stepStation;
      if (!sec || !station || this.phase !== 'driving' || this.wrongGateSaid.has(sec.id)) return;
      if (sec.rails.has(station.railId) || sec === sectionOf(stage.sections, stage.file.start.railId)) return;
      this.wrongGateSaid.add(sec.id);
      this.ports.sayAsync(this.lines.wrongGate ?? DEFAULT_LINES.wrongGate);
    });
    // v1.11 (PR8a, B6.3): arriving at a reverse platform = stopping at its siding's buffer, reversing.
    train.events.on('reverseStop', ({ why }) => {
      const st = this.reverseArrival;
      if (!st || this.phase !== 'driving' || why !== 'buffer' || train.state.railId !== st.railId) return;
      this.finishDrive({ kind: 'stopped', grade: 'perfect' });
    });
    // v1.11 (6-1): who stands on the stage (a guest at the door is brought on if a skipped cutscene left her out).
    events.on('event', (e) => {
      if (e.type === 'actor:spawn') this.figures.set(e.id, e.model);
      if (e.type === 'actor:remove') this.figures.delete(e.id);
    });
    this.listenMagnet();
    // v1.10 (4-3): "トンネルだ！ ライトを つけよう" (only useful now: said at once), unless the light is on already.
    this.tunnel?.events.on('near', () => {
      if (this.phase !== 'driving' || this.lightOn) return;
      this.ports.sayNow(this.lines.tunnelNear ?? DEFAULT_LINES.tunnelNear);
    });
    this.whales = stage.actors.filter((a) => a.type === 'whale' && a.onRail).map((a) => new Whale(a, train));
    this.ice = systems?.ice ?? null;
    this.thinIce = systems?.thinIce ?? null;
    this.mirrors = systems?.mirrors ?? null;
    this.rollingRocks = stage.actors.filter((a) => a.type === 'rock-roll').map((a) => new RollingRock(a, train));
    this.droppingRocks = stage.actors.filter((a) => a.type === 'rock-drop').map((a) => new DroppingRock(a, train));
    this.listenRocketAndSlopes();
    this.listenIce();
    this.cats = stage.actors.filter((a) => a.type === 'cat').map((a) => new CatActor(a, train));
    const dinos = stage.actors.map((a) => makeDino(a, train)).filter((d): d is Dino => d !== null);
    // v1.11 (5-1): fawns speak their own outcomes (step()).
    this.fawns = dinos.filter((d): d is GlareDino => d instanceof GlareDino);
    this.dinos = dinos.filter((d) => !(d instanceof GlareDino));
    this.hush = new HushSystem(stage.file.gimmicks, train);
    this.reversed = new ReversedWhistle(stage.file.gimmicks, stage.actors, train);
    this.fireflies = new FireflyForks(stage.file.junctions, train);
    this.listenNight();
    // v1.11 (5-2): the band holds the train behind it; the spinning forks pick the way at themselves.
    this.parades = stage.actors.filter((a) => a.type === 'parade' && a.onRail).map((a) => new Parade(a, train));
    if (this.parades.length > 0) train.setLeader(() => this.leaderNow());
    this.spins = new SpinSystem(stage.file.junctions, train);
    if (this.spins.forks.length > 0) train.setSpinSides((j) => this.spins.side(j.id));
    this.listenToys();
    this.nuts = stage.actors.filter((a) => a.type === 'nut').map((a) => new RollingNut(a, train));
    this.squirrels = stage.actors.filter((a) => a.type === 'squirrel').map((a) => new Squirrel(a, train));
    this.hoppers = stage.actors
      .filter((a) => a.type === 'grasshopper' && a.onRail)
      .map((a) => new Grasshopper(a, train, stage.network.getRail(a.onRail!.railId).gaps as GapDef[]));
    this.bridges = new FlowerBridges(stage.file.gimmicks, train, (railId, from, to) => {
      stage.network.getRail(railId).removeGap(from, to);
    });
    this.fragiles = new FragileBridges(stage.file.gimmicks, train);
    // A reversed sign's lie leads somewhere wrong: remember it, so the light button glows at that junction next time.
    train.events.on('railChanged', ({ railId }) => {
      for (const j of stage.file.junctions) if (j.signReversed && j[j.default] === railId && j[j.default] !== j.railId) this.wrongTurns.add(j.id);
    });
    // A junction seen through once can be seen through again when a loop brings the train back to it.
    train.events.on('junctionPassed', () => {
      for (const id of this.revealed) this.events.post({ type: 'sign:reset', junctionId: id });
      this.revealed.clear();
    });
    this.pads = stage.file.gimmicks.flatMap((g, index) =>
      g.type === 'jump-pad' && g.railId !== undefined && g.from !== undefined
        ? [{ index, railId: g.railId, at: g.from, seconds: param(g, 'seconds', 8), range: param(g, 'range', 60), left: 0, hinted: false }]
        : [],
    );
    const progress = loadProgress();
    this.found = new Set(progress.records);
    this.foundBefore = new Set(progress.records);
    this.abilities = new Set(progress.abilities);
    whistle.onWhistle(() => this.onWhistle());
    train.events.on('fell', (e) => this.onFell(e.gap, e.railId, e.short));
    // v1.10: "ぽよん" off a floater or the water: a soft fail, back before it.
    train.events.on('waterBounce', (e) => {
      if (this.phase !== 'driving') return;
      // v1.10 (3-1): off a floater it is its own soft fail ("ぶつかっちゃった"); off the water "もぐるの わすれた".
      this.finishDrive({ kind: 'fail', reason: e.floater ? 'floater' : 'dive', rewind: e.rewind });
    });
    // v1.10 (4-2): "ぽすっ" into a snow wall without the snowplow: a soft fail, back before the wall.
    train.events.on('snowBump', (e) => {
      if (this.phase !== 'driving') return;
      this.finishDrive({ kind: 'fail', reason: 'plow', rewind: e.rewind });
    });
    // v1.10 (4-2): the first "ずぼーん！" of a mission.
    train.events.on('wallBurst', () => {
      if (this.phase !== 'driving' || this.plowGoSaid) return;
      this.plowGoSaid = true;
      if (this.lines.plowGo) this.ports.sayAsync(this.lines.plowGo);
    });
    systems?.plowHint?.events.on('plowNear', ({ span }) => this.onPlowNear(span.index, span.line));
    // v1.10 (3-1): the first dive of a mission ("わあ… うみの なかだ！").
    train.events.on('dived', () => {
      if (this.phase !== 'driving' || this.diveGoSaid) return;
      this.diveGoSaid = true;
      if (this.lines.diveGo) this.ports.sayAsync(this.lines.diveGo);
    });
  }

  /**
   * v1.10 (4-2): the snowplow button started glowing for wall `index`: its own line (once per try), else the mission's
   * plowNear the first time in the mission. Said at once: it is only useful now.
   */
  private onPlowNear(index: number, line: string | null): void {
    if (this.phase !== 'driving') return;
    if (line) {
      const key = `plow:${index}`;
      if (this.zoneLines.has(key)) return;
      this.zoneLines.add(key);
      this.plowNearSaid = true;
      this.ports.sayNow(line);
      return;
    }
    if (this.plowNearSaid) return;
    this.plowNearSaid = true;
    this.ports.sayNow(this.lines.plowNear ?? DEFAULT_LINES.plowNear);
  }

  /**
   * v1.11 (PR5, PHASE9_CHAPTER5_6 第 2 部 M7・M8・M14): the magnet light's lines, records and "ぽよん". A target's own
   * line (a record's hint) once a try, else magnetNear the first time in a mission, both only when nothing else is
   * being said (while the train is in the first half of the glow); the first catch "きゅいーん… くっついた！"; a gap
   * closed or a gate opened says its `done`; a record pulled to the train is found; "ぽよん" off a film or a gate is a
   * soft fail; the first odd or end of the stage "びよん！ くっついちゃった！".
   */
  private listenMagnet(): void {
    const m = this.magnet;
    if (!m) return;
    m.events.on('near', ({ target }) => {
      // v1.11 (PR6b): also standing at the station a mission starts from (4-3's bell glows at once there).
      if (this.phase !== 'driving' && this.phase !== 'stopped') return;
      let text = target.line;
      if (text) {
        if (this.magnetLines.has(target.id)) return;
        this.magnetLines.add(target.id);
      } else {
        if (this.magnetNearSaid) return;
        this.magnetNearSaid = true;
        text = this.lines.magnetNear ?? DEFAULT_LINES.magnetNear;
      }
      // The first half of the glow (from MAGNET.hintAhead m to half way to where the pull ends). v1.11 (PR6b): a glow
      // that starts nearer (the train standing at a station 40 m before it, 4-3) keeps its line for the next 10 m.
      const d = this.train.routeDistance(target.railId, target.at);
      const half = (MAGNET.hintAhead + target.minAhead) / 2;
      const until = d !== null && d < half + 10 ? Math.max(target.minAhead, d - 10) : half;
      this.magnetWaiting.set(target.id, { text, railId: target.railId, at: target.at, until });
    });
    m.events.on('caught', ({ target }) => {
      // A record is found when it arrives (also in a fail's fade or a cutscene: the flight got there).
      if (target.recordId) {
        const def = this.stage.records.find((r) => r.def.id === target.recordId)?.def;
        if (def && !this.found.has(def.id)) this.takeRecord(def);
        return;
      }
      if (this.phase !== 'driving' || target.kind !== 'pick') return;
      if (target.done) this.ports.sayAsync(target.done);
      else if (!this.magnetGoSaid) {
        this.magnetGoSaid = true;
        this.ports.sayAsync(this.lines.magnetGo ?? DEFAULT_LINES.magnetGo);
      }
    });
    m.events.on('open', ({ target, instant }) => {
      // The mirror turned round: the fork's true way shows (instead of the light's "signRevealed", its `done`).
      if (target.kind === 'turn' && target.junction) this.revealTurn(target.junction);
      if (instant || this.phase !== 'driving') return;
      this.magnetWaiting.delete(target.id);
      if (target.done) this.ports.sayNow(target.done);
      if (!this.magnetGoSaid) this.magnetGoSaid = true;
    });
    m.events.on('miss', ({ target }) => {
      if (this.phase === 'driving' && target.miss) this.ports.sayAsync(target.miss);
    });
    this.train.events.on('magnetBounce', (e) => {
      if (this.phase !== 'driving') return;
      const target = m.targets.find((t) => t.id === e.id);
      const text = this.lines.magnetBump ?? (target?.kind === 'gate' ? 'ぽよん！ とびらが しまってた〜' : DEFAULT_LINES.magnetBump);
      this.finishDrive({ kind: 'fail', reason: 'magnet', text, rewind: target?.rewind ?? { railId: e.railId, at: Math.max(0, e.s - MAGNET.rewindBefore) } });
    });
    this.iron?.events.on('biyon', () => {
      if (this.phase !== 'driving' || this.magnetPlaySaid) return;
      // Only in a quiet moment; if something else is being said, the next one says it.
      this.magnetPlaySaid = this.ports.sayIfQuiet(this.lines.magnetPlay ?? DEFAULT_LINES.magnetPlay);
    });
  }

  /** v1.11 (PR5): the target lines waiting for a quiet moment (dropped once the train is past the glow's first half). */
  private updateMagnetLines(): void {
    for (const [id, w] of this.magnetWaiting) {
      const d = this.train.routeDistance(w.railId, w.at);
      if (d === null || d < w.until) {
        this.magnetWaiting.delete(id);
        continue;
      }
      if (this.ports.sayIfQuiet(w.text)) this.magnetWaiting.delete(id);
    }
  }

  /** v1.11 (PR5): the station the train is driving to (the magnet's pick targets do not glow in its braking). */
  get stopLine(): { railId: string; at: number } | null {
    const st = this.phase === 'driving' ? this.stop?.station : null;
    return st ? { railId: st.railId, at: st.at } : null;
  }

  /** v1.10 (4-2): "ざざざ〜！ ずっと ゆきかき！" once in a mission, 20 m into clearing a buried stretch. */
  private updatePlowLines(): void {
    if (!this.train.plowing) {
      this.plowRunFrom = null;
      return;
    }
    const f = this.train.frontS;
    this.plowRunFrom ??= f;
    this.plowRun = f - this.plowRunFrom;
    if (this.plowRun >= 20 && !this.plowLongSaid) {
      this.plowLongSaid = true;
      if (this.lines.plowLong) this.ports.sayAsync(this.lines.plowLong);
    }
  }

  /**
   * v1.10 (4-2): with the light on, the swirl marks on the props with `trace` glow while the train front is within
   * LIGHT.revealDistance m of one; the first time in a stage run its `traceLine` is said.
   */
  private updateTraces(): void {
    const traces = this.stage.props.filter((p) => p.trace);
    if (traces.length === 0) return;
    const pos = this.train.getPose().position;
    let near: (typeof traces)[number] | null = null;
    if (this.lightOn) {
      for (const p of traces) {
        if (p.position.distanceTo(pos) <= LIGHT.revealDistance) {
          near = p;
          break;
        }
      }
    }
    const on = near !== null;
    if (on !== this.traceOn) {
      this.traceOn = on;
      this.events.post({ type: 'trace', on });
    }
    if (near && !this.traceSaid) {
      const line = traces.find((p) => p.traceLine)?.traceLine;
      if (line) {
        this.traceSaid = true;
        this.ports.sayNow(line);
      }
    }
  }

  /**
   * v1.11 (5-1): a night line: said once a try, a mission or a stage run (`scope`; `tag` keeps one per stretch or
   * fork): a stretch's own line (`own`), else the mission's, else the default. `now` drops what is queued (only useful
   * on time).
   */
  private sayNight(key: DefaultLine, scope: 'try' | 'mission' | 'stage', opts: { own?: string | null; now?: boolean; tag?: string } = {}): void {
    const set = scope === 'try' ? this.nightTry : scope === 'mission' ? this.nightMission : this.nightStage;
    const id = `${key}:${opts.tag ?? ''}`;
    if (set.has(id)) return;
    set.add(id);
    const text = opts.own ?? this.lines[key] ?? DEFAULT_LINES[key];
    if (!text) return;
    const lines = text.split('\n');
    if (opts.now) {
      this.ports.sayNow(lines[0]);
      for (const line of lines.slice(1)) this.ports.sayAsync(line);
    } else for (const line of lines) this.ports.sayAsync(line);
  }

  /**
   * v1.11 (5-3): a line of the mirror world (the caller wires the mirror-flip system's events here): the first time in
   * a mission into and out of "かがみの なか" (flipIn, flipOut; the stretch's own `line` / `lineOut` wins, null says
   * nothing), the whistle gate once a try (near, open, the bounce and what to do). Only while driving.
   */
  sayMirrorWorld(key: MirrorWorldLine, opts: { own?: string | null; tag?: string } = {}): void {
    if (this.phase !== 'driving' || opts.own === null) return;
    const scope = key === 'flipIn' || key === 'flipOut' ? 'mission' : 'try';
    const now = key !== 'mirrorGateAfter' && key !== 'flipOut';
    this.sayNight(key, scope, { own: opts.own, tag: opts.tag, now });
  }

  /**
   * v1.11 (5-3): the hook for the magnet light's "turn" target (PR5/PR6b): the pull turned the mirror of fork
   * `junctionId` round, so the fork is seen through at once (its phantom pops, the true way is taken, the true side
   * lights up). No "signRevealed" line: the target's own `done` says it.
   */
  revealTurn(junctionId: string): void {
    const j = this.stage.file.junctions.find((x) => x.id === junctionId);
    if (!j || this.revealed.has(j.id)) return;
    this.revealed.add(j.id);
    const truth: JunctionSide = j.default === 'left' ? 'right' : 'left';
    this.train.preferJunction(j.id, truth);
    this.events.post({ type: 'sign:reveal', junctionId: j.id });
  }

  /** v1.11 (5-1): the hush stretches' lines and the forks the train went wrong at. */
  private listenNight(): void {
    this.hush.events.on('near', (z) => {
      if (this.phase !== 'driving') return;
      this.events.post({ type: 'hush:near', id: z.id });
      this.sayNight('hushNear', 'try', { own: z.line, tag: z.id });
      if (this.lightOn) this.sayNight('hushLightOff', 'try', { tag: z.id });
    });
    this.hush.events.on('startle', (z) => {
      this.events.post({ type: 'hush:startle', id: z.id, railId: z.railId, from: z.from, to: z.to });
      if (this.phase === 'driving') this.sayNight('hushStartle', 'try', { now: true });
    });
    this.hush.events.on('quiet', (z) => {
      this.events.post({ type: 'hush:quiet', id: z.id });
      if (this.phase === 'driving') this.sayNight('hushQuiet', 'stage');
    });
    // Onto the false way of a firefly fork: remembered, so the partner asks for the whistle when it comes again.
    this.train.events.on('railChanged', ({ railId }) => {
      for (const f of this.fireflies.forks) if (f.junction[f.junction.default] === railId && railId !== f.railId) this.wrongForks.add(f.id);
    });
  }

  /**
   * v1.11 (5-1): per frame while driving: the hush stretches (the light's time), the fawns, the lure groups, the lines
   * of the whistle-reversed stretches and the firefly forks. Returns true when the drive ended (a soft fail).
   */
  private updateNight(dt: number): boolean {
    this.hush.update(dt, this.lightOn);
    const front = this.train.frontS;
    const rail = this.train.state.railId;
    for (const z of this.hush.zones) if (z.railId === rail && front > z.to + 5) this.glareFails.delete(z.id);

    for (const fawn of this.fawns) {
      const zone = this.hush.zoneAt(fawn.railId, fawn.at);
      fawn.lightOn = this.lightOn;
      fawn.mercy = zone !== null && (this.glareFails.get(zone.id) ?? 0) >= HUSH.mercyAfter;
      const o = fawn.step(dt);
      if (!o) continue;
      const id = fawn.actor.id;
      const lateral = fawn.params.lateral;
      const across = (to: number): Vector3 => this.lateralPosition(fawn.railId, fawn.at, -lateral + 2 * lateral * to);
      switch (o.kind) {
        case 'move':
          this.events.post({ type: 'actor:state', id, state: 'cross', position: across(o.to), seconds: o.seconds });
          break;
        case 'freeze':
          this.glareFreezes += 1;
          this.events.post({ type: 'actor:state', id, state: 'freeze', position: across(0.5), seconds: 0.2 });
          this.events.post({ type: 'glare:freeze', id });
          this.sayNight('glareFreeze', 'try', { now: true });
          this.sayNight('glareFreezeAfter', 'try');
          break;
        case 'blink':
          this.events.post({ type: 'actor:state', id, state: 'blink' });
          break;
        case 'hop':
          this.events.post({ type: 'actor:state', id, state: 'hop', position: across(1), seconds: o.seconds });
          this.events.post({ type: 'glare:free', id });
          this.sayNight('glareFree', 'try');
          break;
        case 'mercy':
          this.sayNight('glareMercy', 'try');
          break;
        case 'danger': {
          this.train.emergencyStop();
          this.events.post({ type: 'actor:state', id, state: 'bump', position: across(1.6), seconds: GLARE.bump });
          const rewind = zone?.rewind ?? { railId: fawn.railId, at: fawn.at - REWIND_DISTANCE };
          if (zone) this.glareFails.set(zone.id, (this.glareFails.get(zone.id) ?? 0) + 1);
          this.finishDrive({ kind: 'fail', reason: 'glare', soft: true, rewind });
          return true;
        }
      }
    }

    for (const g of this.reversed.groups) {
      const o = g.update(dt);
      if (!o) continue;
      const id = g.actor.id;
      if (o === 'dance') this.events.post({ type: 'lure', id, state: 'dance' });
      else if (o === 'idle') this.events.post({ type: 'lure', id, state: 'idle' });
      else if (o === 'back') {
        this.events.post({ type: 'lure', id, state: 'back', seconds: LURE.hop });
        if (Math.abs(this.train.state.speed) < LURE.stopSpeed) {
          this.events.post({ type: 'lure:bye', ids: [id] });
          this.sayNight('lureBye', 'try');
        }
      } else if (o === 'danger') {
        this.train.emergencyStop();
        this.events.post({ type: 'lure', id, state: 'bump', seconds: 0.5 });
        const zone = this.reversed.zoneAt(g.railId, g.at);
        if (zone) this.reversed.failed(zone);
        this.finishDrive({ kind: 'fail', reason: 'lure', soft: true, rewind: zone?.rewind ?? { railId: g.railId, at: g.at - REWIND_DISTANCE } });
        return true;
      }
    }

    for (const z of this.reversed.zones) {
      if (z.railId !== rail) continue;
      if (front >= z.from - LURE.nearBefore && front < z.from) this.sayNight('reversedNear', 'try', { own: z.line, tag: z.id });
      if (front >= z.from && front <= z.to) {
        this.reversedEntered.add(z.id);
        this.sayNight('reversedIn', 'try', { tag: z.id });
      }
      if (front > z.to && this.reversedEntered.delete(z.id)) {
        this.reversed.passed(z);
        if (!this.reversedCalled.has(z.id)) this.sayNight('reversedQuiet', 'mission');
      }
    }

    const fork = this.fireflies.callable;
    if (fork) {
      if (fork.fake) this.sayNight('fireflyFakeNear', 'mission');
      else this.sayNight('fireflyNear', 'mission');
      if (this.wrongForks.has(fork.id) && fork.state === 'sleep') this.sayNight('fireflyAgain', 'mission', { tag: fork.id });
    }
    for (const f of this.fireflies.forks) {
      if (f.state !== 'home' || this.fireflyAway.has(f.id)) continue;
      const d = this.fireflies.distance(f);
      if ((d !== null && d < -20) || rail !== f.railId) {
        this.fireflyAway.add(f.id);
        this.events.post({ type: 'fireflies:away', junctionId: f.id });
      }
    }
    return false;
  }

  /** v1.11 (5-1): a firefly fork's fireflies line its true way: its arrow lights and it becomes the way taken. */
  private fireflyHome(f: FireflyFork): void {
    this.train.preferJunction(f.id, f.trueSide);
    if (this.train.announcedJunction?.id === f.id) this.ports.revealJunction(f.trueSide);
    this.events.post({ type: 'fireflies:home', junctionId: f.id });
  }

  /** v1.11 (5-1): the true way a firefly fork's fireflies show now (for its arrows when they come), or null. */
  revealedSide(junctionId: string): 'left' | 'right' | null {
    const f = this.fireflies.forks.find((x) => x.id === junctionId);
    return f && f.state === 'home' ? f.trueSide : null;
  }

  /** v1.11 (5-1): a reversed whistle brought lure groups: they come onto the rail (or hop in their bushes). */
  private onReversedWhistle(came: LureGroup[], hopped: LureGroup[], mercy: boolean): void {
    for (const g of came) this.events.post({ type: 'lure', id: g.actor.id, state: 'come', seconds: LURE.hop });
    for (const g of hopped) this.events.post({ type: 'lure', id: g.actor.id, state: 'hop', seconds: mercy ? g.params.dance : LURE.hop * 2 });
    if (came.length > 0) {
      this.events.post({ type: 'lure:come', ids: came.map((g) => g.actor.id) });
      this.sayNight('lureCome', 'try', { now: true });
    } else if (mercy && hopped.length > 0) this.sayNight('lureMercy', 'try', { now: true });
  }

  // ---- v1.11 (5-1) test hooks and button marks ----

  /** "" | near | in | startled: the hush stretch at the train front. */
  get hushStatus(): string {
    return this.hush.status;
  }

  get hushStartles(): number {
    return this.hush.startles;
  }

  /** "kojika-1:wait,kojika-2:gone". */
  get fawnStates(): string {
    return this.fawns.map((f) => `${f.actor.id}:${f.shownState}`).join(',');
  }

  /** The train front is in a whistle-reversed stretch (the whistle sounds reversed). */
  get whistleReversed(): boolean {
    return this.reversed.current !== null;
  }

  /** "" | come | dance. */
  get lureStatus(): string {
    return this.reversed.status;
  }

  get lureCalls(): number {
    return this.reversed.calls;
  }

  get lureDances(): number {
    return this.reversed.dances;
  }

  /** "hotaru-1:home,hotaru-2:sleep". */
  get fireflyStates(): string {
    return this.fireflies.states;
  }

  get fireflyCalls(): number {
    return this.fireflies.calls;
  }

  /** The hush mark on the light button (near or in a hush stretch; a hint only). */
  get lightMark(): boolean {
    return this.hush.mark;
  }

  /** The hush mark on the whistle button (a hush or a whistle-reversed stretch; a hint only: it still sounds). */
  get whistleMark(): boolean {
    // v1.11 (6-1): and while the doors stand open for the guest ("なにも いわないで まとう").
    return this.hush.mark || this.reversed.current !== null || this.welcoming;
  }

  /** The light button glows "dim" (press = off): the light is on near or in a hush stretch. */
  get lightOffHint(): boolean {
    return this.phase === 'driving' && this.lightOn && this.hush.mark;
  }

  /** The lever's "とまる" glows: tanukis dance on the rail ahead of a moving train. */
  get lureStopHint(): boolean {
    if (this.phase !== 'driving' || Math.abs(this.train.state.speed) <= LURE.stopSpeed) return false;
    return this.reversed.groups.some((g) => {
      const d = g.onRail ? g.distance() : null;
      return d !== null && d > 0;
    });
  }


  // ---- v1.11 (5-2) the toy town: the band and the spinning forks ----

  /** The band nearest ahead that still walks on the rail (Train.setLeader), or null. */
  private leaderNow(): { railId: string; at: number; speed: number; gap: number } | null {
    let best: { railId: string; at: number; speed: number; gap: number } | null = null;
    let bestD = Infinity;
    for (const p of this.parades) {
      const l = p.leader();
      if (!l) continue;
      const d = this.train.routeDistance(l.railId, l.at);
      if (d === null || d < -TRAIN_HALF * 2) continue;
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  /** v1.11 (5-2): the spinning forks' lines and the view's events. */
  private listenToys(): void {
    this.spins.events.on('wake', ({ id, line }) => {
      this.events.post({ type: 'spin', id, state: 'wake' });
      if (this.phase !== 'driving' || !line) return;
      const key = `spin:${id}`;
      if (this.zoneLines.has(key)) return;
      this.zoneLines.add(key);
      this.ports.sayAsync(line);
    });
    this.spins.events.on('turn', ({ id, side }) => this.events.post({ type: 'spin', id, state: 'turn', side }));
    this.spins.events.on('good', ({ id }) => this.events.post({ type: 'spin', id, state: 'good' }));
    this.spins.events.on('fixed', ({ id }) => {
      this.events.post({ type: 'spin', id, state: 'fixed' });
      this.events.post({ type: 'windup', id, kind: 'spin' });
      if (this.phase === 'driving') this.ports.sayNow(this.lines.spinStop ?? DEFAULT_LINES.spinStop);
      this.events.post({ type: 'partner:emote', kind: 'jump' });
    });
    this.spins.events.on('taken', ({ id, side, good }) => {
      this.spinTaken.push(`${id}:${good ? 'good' : 'loop'}`);
      this.events.post({ type: 'spin:taken', id, side, good });
    });
  }

  /** Tells the view what band `p` does now (it moves the band between these). */
  private postParade(p: Parade): void {
    this.events.post({ type: 'parade', id: p.actor.id, state: p.state, railId: p.railId, tail: p.tail, speed: p.speed });
  }

  /**
   * v1.11 (5-2): per frame while driving: the band (its lines: pointed out, wind me, follow slowly, well matched, it is
   * waiting, bye) and the spinning forks (the call when one glows, once a try).
   */
  private updateToys(dt: number): void {
    const speed = Math.abs(this.train.state.speed);
    for (const p of this.parades) {
      for (const o of p.update(dt)) {
        if (o === 'near') this.sayNight('paradeNear', 'try', { tag: p.actor.id });
        else if (o === 'state') this.postParade(p);
        else if (o === 'bye') this.sayNight('paradeBye', 'try', { tag: p.actor.id });
      }
      if (p.callable) this.sayNight('paradeCall', 'try', { now: true, tag: p.actor.id });
      // Held standing behind the unwound band: asked again every PARADE.callAgain s.
      const unwound = p.state === 'idle' || p.state === 'back';
      if (unwound && this.train.leaderHolding && speed < 0.3) {
        this.paradeHeldFor += dt;
        if (this.paradeHeldFor >= PARADE.callAgain) {
          this.paradeHeldFor = 0;
          this.ports.sayNow(this.lines.paradeCall ?? DEFAULT_LINES.paradeCall);
        }
      } else this.paradeHeldFor = 0;
      const marching = p.state === 'march' || p.state === 'wait';
      const d = marching ? p.distance() : null;
      const close = d !== null && d <= PARADE.hintRange;
      if (close) this.sayNight('paradeFollow', 'try', { tag: p.actor.id });
      // At "ゆっくり" close behind for a while: "ぴったり！".
      if (close && this.train.state.notch === PARADE_NOTCH) {
        this.paradeMatchFor += dt;
        if (this.paradeMatchFor >= PARADE.matchSeconds) this.sayNight('paradeMatch', 'try', { tag: p.actor.id });
      } else this.paradeMatchFor = 0;
      // Standing behind the marching band: it marks time and waits ("がくたいさんが まってるよ！").
      if (marching && speed < 0.3) {
        this.paradeStandFor += dt;
        if (this.paradeStandFor >= PARADE.waitSay) this.sayNight('paradeWait', 'try', { tag: p.actor.id });
      } else this.paradeStandFor = 0;
    }
    this.spins.update(dt);
    const glowing = this.spins.glowing;
    if (glowing) this.sayNight('spinCall', 'try', { now: true, tag: glowing.id });
  }

  /** v1.11 (5-2): the first band's state ("" without one; a test hook). */
  get paradeState(): string {
    return this.parades[0]?.state ?? '';
  }

  /** v1.11 (5-2): metres from the train front to the first band's tail (rounded; "" when not ahead). */
  get paradeGap(): string {
    const p = this.parades[0];
    const d = p && p.state !== 'gone' ? p.distance() : null;
    return d === null ? '' : String(Math.round(d));
  }

  /** v1.11 (5-2): the band holds the train's speed down now. */
  get paradeHeld(): boolean {
    return this.parades.length > 0 && this.train.leaderHolding;
  }

  /** v1.11 (5-2): the lever notch that glows behind the marching band ("ゆっくり"), or null. */
  get paradeLeverHint(): number | null {
    if (this.phase !== 'driving') return null;
    for (const p of this.parades) {
      if (p.state !== 'march' && p.state !== 'wait') continue;
      const d = p.distance();
      if (d !== null && d <= PARADE.hintRange) return PARADE_NOTCH;
    }
    return null;
  }

  /** v1.11 (5-2): "kuru-1:sleep,kuru-2:stay-good". */
  get spinStates(): string {
    return this.spins.states;
  }

  /** v1.11 (5-2): the ways taken at spinning forks so far, "kuru-1:loop,kuru-1:good". */
  get spinTakenList(): string {
    return this.spinTaken.join(',');
  }

  /** v1.11 (5-2): how each spinning fork looks now (for the view). */
  get spinLooks(): { id: string; side: 'left' | 'right'; turning: boolean; good: boolean }[] {
    return this.spins.looks;
  }

  /** v1.11 (5-2): whether the stage has the band or spinning forks (their test hooks are written every frame). */
  get hasToys(): boolean {
    return this.parades.length > 0 || this.spins.forks.length > 0;
  }

  /** v1.10: water ahead, the dive button's hint started: the partner says so, the first time in a mission. */
  onDiveNear(): void {
    if (this.phase !== 'driving' || this.diveNearSaid) return;
    this.diveNearSaid = true;
    this.ports.sayNow(this.lines.diveNear ?? DEFAULT_LINES.diveNear);
  }

  /** '1' while the first large dinosaur's neck is down, '0' while up, '' when there is none (test hook). */
  get bigDinoNeck(): string {
    const big = this.dinos.find((d): d is LargeDino => d instanceof LargeDino);
    return big ? (big.neckDown ? '1' : '0') : '';
  }

  /** The light button was toggled (the train's speed cap is handled by the caller). */
  setLight(on: boolean): void {
    this.lightOn = on;
  }

  /** The jump button was pressed while stopped or otherwise refused. */
  onJumpRefused(reason: string): void {
    if (this.phase !== 'driving') return;
    if (reason === 'stopped') this.sayRefusal(this.lines.jumpStopped ?? DEFAULT_LINES.jumpStopped);
    if (reason === 'bough') this.sayRefusal(this.lines.boughJump ?? DEFAULT_LINES.boughJump);
  }

  /**
   * A "not now" line for a refused press. The same line again within REFUSE_COOLDOWN s of game time is dropped, so
   * mashing a grey button does not queue a copy per tap ahead of the lines that must come on time.
   */
  private sayRefusal(text: string): void {
    const last = this.lastRefusal;
    if (last && last.text === text && this.clock - last.at < REFUSE_COOLDOWN) return;
    this.lastRefusal = { text, at: this.clock };
    this.ports.sayAsync(text);
  }

  /** Test hooks and UI: the grasshopper riding on the roof (its id, or ""). */
  get hopperId(): string {
    return this.hoppers.find((h) => h.state === 'riding')?.actor.id ?? '';
  }

  /** Which flower bridges are open, "1,0,0" (test hook). */
  get bridgeFlags(): string {
    return this.bridges.openFlags;
  }

  /** The nearest butterfly's state (test hook). */
  get butterflyState(): string {
    return this.bridges.active?.state ?? '';
  }

  /** "" | near | on | shake: the silk bridge at the train (test hook). */
  get fragileStatus(): string {
    return this.fragiles.status;
  }

  /** The fastest speed the lever should show (a silk bridge ahead), or null. */
  get leverHintSpeed(): number | null {
    return this.phase === 'driving' ? this.fragiles.hintSpeed : null;
  }

  /**
   * The light button glows: a butterfly in reach is waiting for the light, or a reversed sign the train was
   * fooled by before comes up again.
   */
  get lightHint(): boolean {
    if (this.phase !== 'driving' || this.lightOn) return false;
    if (this.bridges.lightHint(this.lightOn)) return true;
    if (this.bubbleLightHint) return true;
    // v1.10 (3-3): a dark stretch that asks for the light (fog params.glow).
    const fog = zoneAt(this.stage.file.gimmicks, 'fog', this.train.state.railId, this.train.frontS);
    if (fog && (fog.params as { glow?: boolean } | undefined)?.glow === true) return true;
    // v1.10 (4-3): a tunnel close ahead, or the train in one.
    if (this.tunnel?.lightHint(false)) return true;
    // v1.11 (6-1): a reversed sign with `glow` glows from where its line is said (80 m) until it is seen through.
    for (const j of this.stage.file.junctions) {
      if (j.glow !== true || !j.signReversed || j.turn || this.revealed.has(j.id)) continue;
      const d = this.train.distanceAhead(j.railId, j.at);
      if (d !== null && d > 0 && d <= 80) return true;
    }
    for (const id of this.wrongTurns) {
      const j = this.stage.file.junctions.find((x) => x.id === id);
      // v1.11 (PR5/5-3): only the magnet helps at a turned-away mirror's fork (its glow is green): no yellow glow there.
      if (!j || j.turn || this.revealed.has(j.id)) continue;
      const d = this.train.distanceAhead(j.railId, j.at);
      if (d !== null && d > 0 && d <= 80) return true;
    }
    // v1.11 (5-1): a fake firefly fork, from FIREFLY_FORK.fakeGlow m before it until the light has seen through it.
    for (const f of this.fireflies.forks) {
      if (!f.fake || f.revealed || this.revealed.has(f.id)) continue;
      const d = this.fireflies.distance(f);
      if (d !== null && d > 0 && d <= FIREFLY_FORK.fakeGlow) return true;
    }
    // v1.10 (4-1): a mirror junction with lightHint, from MIRROR.hintDistance m before it until seen through.
    for (const j of this.mirrorHintJunctions()) {
      if (this.revealed.has(j.id)) continue;
      const d = this.train.distanceAhead(j.railId, j.at);
      if (d !== null && d > 0 && d <= MIRROR.hintDistance) return true;
    }
    return false;
  }

  /** v1.10 (4-1): the junctions of mirrors that light the light button (lightHint). */
  private mirrorHintJunctions(): JunctionDef[] {
    const ids = (this.mirrors?.mirrors ?? []).filter((m) => m.lightHint && m.junction).map((m) => m.junction);
    return this.stage.file.junctions.filter((j) => ids.includes(j.id) && !j.turn);
  }

  /**
   * v1.10 (4-1): ice, thin ice and mirror lines, and thin ice's "ぽちゃん" fail (PHASE8 第 7 部 §4). The lines with no
   * default are said only when the mission has them.
   */
  private listenIce(): void {
    const once = (key: string, text: string | undefined, now = false): void => {
      if (this.phase !== 'driving' || !text || this.iceSaid.has(key)) return;
      this.iceSaid.add(key);
      if (now) this.ports.sayNow(text);
      else this.ports.sayAsync(text);
    };
    this.ice?.events.on('enter', (zone) => {
      if (this.phase !== 'driving' || !zone.line) return;
      const key = `ice:${zone.index}`;
      if (this.zoneLines.has(key)) return;
      this.zoneLines.add(key);
      this.ports.sayAsync(zone.line);
    });
    this.ice?.events.on('brake', () => once('iceBrake', this.lines.iceBrake));
    // "ゆっくり" then "とまる": only useful on time, so they replace what is queued.
    this.ice?.events.on('hint', ({ kind }) => once(kind === 'slow' ? 'iceNear' : 'iceStop', kind === 'slow' ? this.lines.iceNear : this.lines.iceStop, true));
    const thin = this.thinIce;
    if (thin) {
      thin.events.on('warn', (zone) => {
        if (this.phase !== 'driving' || !zone.line) return;
        const key = `thin:${zone.index}`;
        if (this.zoneLines.has(key)) return;
        this.zoneLines.add(key);
        this.ports.sayAsync(zone.line);
      });
      thin.events.on('glow', ({ count }) => {
        if (this.phase !== 'driving') return;
        // "いまだ！" once per mission; the same stretch glowing again (its second press) is "もういっかい！".
        if (count >= 2) {
          if (this.lines.rocketAgain) this.ports.sayNow(this.lines.rocketAgain);
        } else if (!this.rocketReadySaid) {
          this.rocketReadySaid = true;
          if (this.lines.rocketReady) this.ports.sayNow(this.lines.rocketReady);
        }
      });
      thin.events.on('shake', () => {
        if (this.phase === 'driving') this.ports.sayNow(this.lines.crackShake ?? DEFAULT_LINES.crackShake);
      });
      thin.events.on('clear', () => {
        if (this.phase === 'driving' && this.lines.thinIceClear) this.ports.sayAsync(this.lines.thinIceClear);
      });
      thin.events.on('crack', (zone: ThinIceZone) => {
        if (this.phase !== 'driving') return;
        this.train.emergencyStop();
        this.ports.autoCamera('chase');
        const empty = this.rocket !== null && this.rocket.enabled && this.rocket.pips <= 0;
        this.finishDrive({ kind: 'fail', reason: 'crack', line: empty ? 'crackEmpty' : 'crackFall', rewind: zone.rewind });
      });
    }
    this.mirrors?.events.on('flash', () => {
      if (this.phase === 'driving') this.ports.sayNow(this.lines.mirrorFlash ?? DEFAULT_LINES.mirrorFlash);
    });
    this.mirrors?.events.on('fake', () => {
      if (this.phase === 'driving') this.ports.sayNow(this.lines.mirrorFake ?? DEFAULT_LINES.mirrorFake);
    });
  }

  /** v1.10 (4-1): "あれ？ むこうにも ワンダーごう…？" once per try, MIRROR.hintDistance m before a lightHint mirror's junction. */
  private updateMirrorLines(): void {
    const text = this.lines.mirrorNear;
    if (!text || this.lightOn) return;
    for (const j of this.mirrorHintJunctions()) {
      if (this.revealed.has(j.id) || this.mirrorNearSaid.has(j.id)) continue;
      const d = this.train.distanceAhead(j.railId, j.at);
      if (d === null || d <= 0 || d > MIRROR.hintDistance) continue;
      this.mirrorNearSaid.add(j.id);
      for (const line of text.split('\n')) this.ports.sayAsync(line);
    }
  }

  /** A nut or a dropped rock ahead can be jumped right now (the jump button glows). */
  get jumpHint(): boolean {
    return (
      this.phase === 'driving' &&
      (this.nuts.some((n) => n.jumpHint) || this.squirrels.some((s) => s.jumpHint) || this.droppingRocks.some((r) => r.jumpHint))
    );
  }

  /** v1.10 (4-3): the snow wave now (null: none out; still shown for a moment after "セーフ！"). */
  get snowWave(): SnowWaveView | null {
    const c = this.chase;
    if (!c || c.state === 'armed') return null;
    return c.view;
  }

  /** v1.10 (4-3): the snow wave panel (null = hidden): while it chases, and "セーフ！" for a moment after. */
  get chasePanel(): SnowWaveView | null {
    const c = this.chase;
    if (!c || c.state === 'armed' || (c.state === 'safe' && this.safeLeft <= 0)) return null;
    return c.view;
  }

  /** v1.10 (4-3): the "はやい" notch glows (the snow wave is close and the train slower than that). */
  get chaseLeverHint(): boolean {
    return this.phase === 'driving' && (this.chase?.leverHint ?? false);
  }

  /**
   * v1.10 (4-3): the snow wave is close enough for the rocket, and a flame is left over for the uphills still ahead
   * before the wave's end (the rocket system adds its own "not here" rules).
   */
  get chaseRocketGlow(): boolean {
    const c = this.chase;
    if (this.phase !== 'driving' || !c || !c.rocketNear || !this.rocket) return false;
    const front = this.train.frontS;
    const uphills = (this.slopes?.zones ?? []).filter(
      (z) => z.kind === 'up' && z.railId === c.def.railId && z.to > front && z.from < c.def.until.at,
    ).length;
    return this.rocket.pips > uphills;
  }

  /** v1.7: the countdown panel (null = hidden). */
  get timer(): CountdownView | null {
    const c = this.countdown;
    if (!c || (c.state === 'safe' && this.safeLeft <= 0)) return null;
    return c.view;
  }

  /** v1.7: the rocket button was pressed and did not fire: the partner says why (not for air / burning). */
  onRocketRefused(result: RocketPress): void {
    if (result.ok || this.phase !== 'driving') return;
    switch (result.why) {
      case 'empty':
        this.sayRefusal(this.lines.rocketEmpty ?? DEFAULT_LINES.rocketEmpty);
        break;
      case 'zone': {
        const text = result.zone?.pressLine ?? result.zone?.line;
        if (text) this.sayRefusal(text);
        break;
      }
      case 'slide':
        this.sayRefusal(this.lines.noBrakeLever ?? DEFAULT_LINES.noBrakeLever);
        break;
      case 'station':
        this.sayRefusal(this.lines.rocketQuiet ?? DEFAULT_LINES.rocketQuiet);
        break;
      case 'reverse':
        // v1.11 (PR8a, 第 3 部 A11): "ぷすっ" (the caller) and "うしろでは つかえないよ".
        this.sayRefusal(this.lines.refuseRocketBack ?? DEFAULT_LINES.refuseRocketBack);
        break;
      default:
        break;
    }
  }

  /**
   * v1.11 (PR8a, 第 3 部 A14): a line of うしろむき's (ReverseSystem): the stage's own words, else the mission's line of
   * that key, else the default. Only while driving or standing (not in a cutscene or a fail).
   */
  sayReverse(line: ReverseLine): void {
    if (this.phase !== 'driving' && this.phase !== 'stopped' && this.phase !== 'doors') return;
    if (line.own && line.own.length > 0) {
      for (const l of line.own) this.ports.sayAsync(typeof l === 'string' ? l : l.text, typeof l === 'string' ? undefined : l.who === 'amanojaku' ? 'amanojaku' : undefined);
      return;
    }
    const own = this.lines[line.key];
    // v1.11 (PR11b, A14): with Sakasa riding along (6-2) she says them in her words.
    const sakasa = own === undefined && (this.stage.file.crew ?? []).includes('sakasa') ? SAKASA_REVERSE_LINES[line.key] : undefined;
    if (sakasa) {
      this.ports.sayAsync(sakasa, 'amanojaku');
      return;
    }
    const text = line.key === 'needAbility' ? this.needLine('reverse') : (own ?? DEFAULT_LINES[line.key]);
    if (line.key === 'backUp') this.ports.sayNow(text);
    else this.ports.sayAsync(text);
  }

  /** v1.7: rocket and slope lines, and the slip fail. */
  private listenRocketAndSlopes(): void {
    this.train.events.on('rocketStarted', () => {
      this.rocketLeverSaid = false;
      if (this.phase !== 'driving' || this.rocketGoSaid) return;
      this.rocketGoSaid = true;
      if (this.lines.rocketGo) this.ports.sayAsync(this.lines.rocketGo);
    });
    this.train.events.on('slipped', ({ railId, s }) => {
      if (this.phase !== 'driving') return;
      const slope = this.slopes?.current ?? null;
      const empty = this.rocket !== null && this.rocket.enabled && this.rocket.pips <= 0;
      this.finishDrive({
        kind: 'fail',
        reason: 'slip',
        line: empty ? 'slipEmpty' : 'slip',
        rewind: slope?.rewind ?? { railId, at: s - SLOPE.rewindBefore },
      });
    });
    this.rocket?.events.on('glow', ({ slope }) => {
      if (this.phase !== 'driving' || !slope) return;
      const count = (this.slopeGlows.get(slope.index) ?? 0) + 1;
      this.slopeGlows.set(slope.index, count);
      // "いまだ！" is only useful now: it replaces what is queued (the slope's own line 20 m earlier included).
      if (count >= 2) {
        if (this.lines.rocketAgain) this.ports.sayNow(this.lines.rocketAgain);
      } else if (!this.rocketReadySaid) {
        this.rocketReadySaid = true;
        if (this.lines.rocketReady) this.ports.sayNow(this.lines.rocketReady);
      }
    });
    this.rocket?.events.on('zone', (zone) => {
      if (this.phase !== 'driving' || !zone.line) return;
      const key = `rocket:${zone.index}`;
      if (this.zoneLines.has(key)) return;
      this.zoneLines.add(key);
      this.ports.sayNow(zone.line);
    });
    this.slopes?.events.on('near', (zone: SlopeZone) => {
      if (this.phase !== 'driving') return;
      const text = zone.line ?? this.lines.steepNear;
      if (text) this.ports.sayAsync(text);
    });
    this.slopes?.events.on('enter', (zone: SlopeZone) => {
      if (zone.kind !== 'down') return;
      this.noBrakeLeverSaid = false;
      if (this.phase !== 'driving') return;
      const key = `slope:${zone.index}`;
      if (this.zoneLines.has(key)) return;
      this.zoneLines.add(key);
      if (this.lines.noBrake) this.ports.sayAsync(this.lines.noBrake);
    });
  }

  /** Abilities the player already has on entering the stage (saved, or inherited when opened directly). */
  knowAbilities(abilities: Iterable<AbilityId>): void {
    for (const a of abilities) this.abilities.add(a);
  }

  /** Grants an ability (cutscene step). The caller shows its button; this saves it. */
  grant(ability: AbilityId): void {
    this.abilities.add(ability);
    addToProgress('abilities', [ability]);
  }

  get currentMission(): MissionDef | null {
    return this.stage.file.missions[this.missionIndex] ?? null;
  }

  /** v1.11 (PR8a): the station the step being played drives to (the switch glows for a reverse platform), or null. */
  get stepStation(): StationDef | null {
    const step = this.currentMission?.steps[this.stepIndex];
    return step ? (this.stage.file.stations.find((st) => st.id === step.stationId) ?? null) : null;
  }

  /** A cutscene is playing and has not been skipped yet (the "▶▶" may show). */
  get canSkip(): boolean {
    return this.phase === 'cutscene' && this.skip !== null && !this.skip.requested;
  }

  /** "▶▶" (PHASE7_FINISH §4 item 7): the rest of the cutscene playing now is fast-forwarded. */
  skipCutscene(): boolean {
    if (!this.canSkip) return false;
    this.skip?.request();
    return true;
  }

  /**
   * Resume (PHASE7_FINISH §4 item 3): gets the stage ready to start at mission `from` (0-based, at least 1) as if
   * the missions before had just been played. The opening and the cutscenes after those missions are
   * fast-forwarded (cut rails, learned abilities, figures on and off); the train stands at the last station of the
   * mission before, stopped, with the passengers and the parcel it would carry; the flower bridges on the way there
   * are open (they stay open for the whole stage). Everything else waits as after a rewind to that station (a
   * woken cat or dinosaur behind the train is asleep again; nothing behind it matters any more). Call before
   * run(from), then snap the camera.
   */
  prepareResume(from: number, carried?: Pick<Resume, 'stops' | 'perfect' | 'found'>): void {
    const file = this.stage.file;
    if (from < 1 || from >= file.missions.length) throw new Error(`Cannot resume at mission ${from}`);
    // The clear card counts the whole playthrough: the stops and records of the missions before come along.
    this.stopsMade = carried?.stops ?? 0;
    this.perfectStops = Math.min(carried?.perfect ?? 0, this.stopsMade);
    for (const id of carried?.found ?? []) if (this.found.has(id)) this.foundBefore.delete(id);
    if (file.opening) this.fastForward(file.opening);
    let passengers = 0;
    let parcel = false;
    for (let i = 0; i < from; i++) {
      for (const step of file.missions[i].steps) {
        passengers = passengers - Math.min(step.alight ?? 0, passengers) + (step.board ?? 0);
        if (step.parcel) parcel = step.parcel === 'load';
        if (step.board) this.boarded.set(step.stationId, (this.boarded.get(step.stationId) ?? 0) + step.board);
      }
      // v1.11 (6-1): a lead's mid-step cutscene (its `learn`: the ability it teaches) and where the lead went home.
      for (const step of file.missions[i].steps) {
        if (step.lead?.learn) this.fastForward(step.lead.learn);
        if (step.lead) this.spawnLeadHome(step.lead);
      }
      const done = file.missions[i].onComplete;
      if (done) this.fastForward(done);
    }
    const steps = file.missions[from - 1].steps;
    const station = this.station(steps[steps.length - 1].stationId);
    const target = { railId: station.railId, at: station.at };
    this.train.rewindTo(station.at, station.railId);
    // v1.10 (4-2): the snow walls on the way here are burst; a buried stretch the station is in is cleared up to it.
    const passed = this.wayTo(target);
    this.train.preparePlowResume((sp) => passed.some((leg) => leg.railId === sp.railId && sp.from >= leg.from && sp.from <= leg.to));
    this.lastStop = target;
    this.lastStationId = station.id;
    this.passengers = passengers;
    this.parcel = parcel;
    this.ports.setCargo(passengers, parcel);
    this.resetActors(target);
    // v1.11 (5-2): the spinning forks on the way here were stopped the good way.
    this.spins.reset({ resumeAt: target });
    // v1.11 (PR5): the gaps, gates and mirrors on the way here are open (the rewind event puts the picks back).
    this.magnet?.reset({ passed: (t) => passed.some((leg) => leg.railId === t.railId && t.at >= leg.from && t.at <= leg.to) });
    // The flower bridges the way from the start to this station crosses must have bloomed.
    const way = this.wayTo(target);
    const crossed = (railId: string, from: number, to: number): boolean =>
      way.some((leg) => leg.railId === railId && from >= leg.from && to <= leg.to);
    for (const b of this.bridges.openWhere(crossed)) this.events.post({ type: 'bridge', index: b.index, open: true, instant: true });
    this.postButterflies();
    this.slopes?.reset();
    this.rocket?.reset();
    this.events.post({ type: 'rewind', boarded: Object.fromEntries(this.boarded) });
    this.ports.resetLever();
    this.ports.autoCamera(null);
    this.ports.fixedCamera(null);
    this.phase = 'stopped';
    this.train.lockInput('stopped');
  }

  /**
   * The rails the way from the stage start to `target` runs along, as legs [from, to] (fewest rail changes, through
   * junctions and merges). Empty when there is none.
   */
  private wayTo(target: { railId: string; at: number }): { railId: string; from: number; to: number }[] {
    type Leg = { railId: string; from: number; to: number };
    const file = this.stage.file;
    const start = file.start;
    const queue: { railId: string; enter: number; legs: Leg[] }[] = [{ railId: start.railId, enter: start.at, legs: [] }];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const { railId, enter, legs } = queue.shift() as (typeof queue)[number];
      const key = `${railId}@${enter}`;
      if (seen.has(key) || legs.length > 12) continue;
      seen.add(key);
      if (railId === target.railId && target.at >= enter) return [...legs, { railId, from: enter, to: target.at }];
      const rail = this.stage.network.getRail(railId);
      for (const j of file.junctions) {
        if (j.railId !== railId || j.at < enter) continue;
        for (const to of [j.left, j.right]) {
          if (to !== undefined && to !== railId) queue.push({ railId: to, enter: 0, legs: [...legs, { railId, from: enter, to: j.at }] });
        }
      }
      if (rail.end.type === 'merge') {
        queue.push({ railId: rail.end.railId, enter: rail.end.railId === railId ? 0 : rail.end.at, legs: [...legs, { railId, from: enter, to: rail.length }] });
      }
      // v1.11 (PR11a): through a gate (the way goes on from its arrival point).
      if (rail.end.type === 'portal') {
        queue.push({ railId: rail.end.railId, enter: rail.end.at, legs: [...legs, { railId, from: enter, to: rail.length }] });
      }
    }
    return [];
  }

  /** Runs the whole stage (from mission `from` after prepareResume). Resolves when the clear card was dismissed. */
  async run(from = 0): Promise<void> {
    const file = this.stage.file;
    if (from === 0) {
      this.resetActors();
      if (file.opening) await this.cutscene(file.opening);
    }

    for (let i = from; i < file.missions.length; i++) {
      const mission = file.missions[i];
      this.missionIndex = i;
      this.lines = mission.lines ?? {};
      this.movingSaid = false;
      this.diveNearSaid = false;
      this.diveGoSaid = false;
      this.diveReadySaid = false;
      this.plowNearSaid = false;
      this.plowGoSaid = false;
      this.plowLongSaid = false;
      this.magnetNearSaid = false;
      this.magnetGoSaid = false;
      this.bubbleNearSaid.clear();
      this.bubbleTrueSaid.clear();
      this.iceSaid.clear();
      this.hintsFired.clear();
      this.rocketReadySaid = false;
      this.rocketGoSaid = false;
      this.slopeGlows.clear();
      this.zoneLines.clear();
      this.nightMission.clear();
      this.reverse?.newMission();
      // v1.11 (6-1): this mission's own junction rules (a lock hides the arrows; a default is chosen from the start).
      this.train.setJunctionRules(mission.junctions ?? null);
      await this.ports.card(`ミッション ${i + 1}\n${mission.title}`, 'スタート');
      if (this.lines.start) for (const line of this.lines.start.split('\n')) await this.ports.say(line, 'partner');

      for (let j = 0; j < mission.steps.length; j++) {
        this.stepIndex = j;
        // v1.11 (PR11b, 6-2): a step's own junction rules over the mission's (a gate's fork on the way out, not home).
        const own = mission.steps[j].junctions;
        if (own) this.train.setJunctionRules({ ...mission.junctions, ...own });
        else if (j > 0 && mission.steps[j - 1].junctions) this.train.setJunctionRules(mission.junctions ?? null);
        await this.runStep(mission.steps[j]);
      }

      this.events.post({ type: 'goal', stationId: null });
      this.train.setJunctionRules(null);
      if (this.lines.complete) this.ports.sayAsync(this.lines.complete);
      this.events.post({ type: 'partner:emote', kind: 'cheer' });
      await this.ports.card('できた！', 'つぎへ');
      if (mission.onComplete) await this.cutscene(mission.onComplete);
      // From here on "つづきから" starts at the next mission (the last one's end is the stage clear). Only after the
      // cutscene: an ability it teaches (1-2's light) is not learned unseen by a resume.
      if (i + 1 < file.missions.length) {
        advanceResume({
          stage: file.id,
          mission: i + 1,
          stops: this.stopsMade,
          perfect: this.perfectStops,
          found: [...this.found].filter((id) => !this.foundBefore.has(id)),
        });
      }
    }

    if (file.ending) await this.cutscene(file.ending);
    this.phase = 'clear';
    this.ports.fanfare();
    // v1.11 (PR11b, 第 1 部 §5.5): the last stage's card says "やったね！" (`clearButton`).
    await this.ports.clearCard(`${file.title}\nクリア！`, file.clearButton ?? 'つづく', {
      stops: this.stopsMade,
      perfect: this.perfectStops,
      records: this.stage.records.map(({ def }) => ({
        id: def.id,
        name: def.name,
        found: this.found.has(def.id),
        fresh: this.found.has(def.id) && !this.foundBefore.has(def.id),
      })),
    });
  }

  /** Per-frame monitoring while driving. */
  update(dt: number): void {
    if (this.safeLeft > 0) this.safeLeft = Math.max(0, this.safeLeft - dt);
    if (this.phase === 'doors' && this.welcome) this.updateWelcome(dt);
    if (this.phase !== 'driving') return;
    this.clock += dt;
    if (this.updateCountdown(dt)) return;
    if (this.updateChase(dt)) return;
    if (this.updateLead(dt)) return;
    if (this.stop) this.ports.gauge(this.stop.gauge);
    if (!this.movingSaid && this.train.state.speed > 0) {
      this.movingSaid = true;
      if (this.lines.moving) this.ports.sayAsync(this.lines.moving);
    }
    // v1.11 (PR8a, 第 3 部 A7): reversing, and going forward again over the way reversed along, the gimmicks, animals
    // and hints passed already stay as they are (records are still found, the stop is still watched).
    if (this.train.stillGimmicks) {
      this.updateRecords();
      this.checkStop(dt);
      return;
    }
    const hints = this.currentMission?.hints ?? [];
    hints.forEach((h, i) => {
      if (this.hintsFired.has(i)) return;
      // v1.11: a riddle about a record for a later ability is not said once the player has that ability.
      if (h.unless && this.abilities.has(h.unless)) return;
      // v1.11 (PR11a, 第 3 部 B6.5): one said only while the mission is at that step (it may come up again later).
      if (h.whileStep !== undefined && h.whileStep !== this.stepIndex) return;
      const d = this.train.distanceAhead(h.railId, h.at);
      if (d !== null && d <= 0 && d > -30) {
        this.hintsFired.add(i);
        this.ports.sayAsync(h.text, h.who === 'amanojaku' ? 'amanojaku' : undefined);
      }
    });
    this.updateGapHints();
    this.updateWater();
    this.updateWhales(dt);
    this.updateBubbleForks();
    this.updatePads(dt);
    this.updateJunctionSigns();
    this.updateMirrorLines();
    this.updatePlowLines();
    this.updateTraces();
    this.updateRecords();
    this.updateMagnetLines();
    if (this.updateNight(dt)) return;
    this.updateToys(dt);
    if (this.checkDeadEnd() || this.checkSpur()) return;
    if (this.checkStop(dt)) return;
    for (const cat of this.cats) {
      const c = cat.update(dt);
      if (!c) continue;
      if (c.kind === 'walk') {
        // v1.11 (5-2): a reverse-wound toy walks back towards the train.
        const frame = this.stage.network.getRail(cat.railId).frameAt(c.to);
        this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'walk', position: frame.position.clone(), seconds: c.seconds });
        continue;
      }
      // v1.10 (3-3): an animal with its own lines (the sea turtle) says them, and at once (only useful now).
      const own = cat.lines;
      if (c.kind === 'near') {
        if (own.say) this.ports.sayNow(own.say);
        else if (this.lines.catNear) this.ports.sayAsync(this.lines.catNear);
      }
      if (c.kind === 'danger') {
        this.train.emergencyStop();
        this.ports.autoCamera('side');
        cat.flee();
        // v1.11 (5-2): a wind-up toy stays where it is, ticking (startled, its key rattles).
        if (cat.windup) {
          const here = this.stage.network.getRail(cat.railId).frameAt(cat.at).position.clone();
          this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'stopped', position: here, seconds: 0 });
        } else this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'flee', position: this.catFleePosition(cat), seconds: 0.6 });
        // v1.10 (4-3): a snowman on the rail is soft (it only wobbles).
        // v1.11 (5-1): so is the hedgehog (it curls up where it is); v1.11 (5-2) and the wind-up toys.
        const look = (cat.actor.params as { look?: string }).look;
        const soft = look === 'snowman' || look === 'hedgehog' || cat.windup;
        this.finishDrive({ kind: 'fail', reason: 'cat', soft, text: own.danger, after: own.after, rewind: { railId: cat.railId, at: cat.placedAt - REWIND_DISTANCE } });
        return;
      }
    }
    for (const dino of this.dinos) {
      const o = dino.update(dt);
      if (!o) continue;
      const id = dino.actor.id;
      if (o.kind === 'near') {
        const line = dino instanceof LargeDino ? this.lines.bigDinoNear : this.lines.dinoNear;
        if (line) this.ports.sayAsync(line);
      } else if (o.kind === 'cross') {
        if (this.lines.smallCrossing) this.ports.sayAsync(this.lines.smallCrossing);
        const lateral = (dino as SmallDino).params.lateral;
        this.events.post({ type: 'actor:state', id, state: 'cross', position: this.lateralPosition(dino.railId, dino.at, lateral), seconds: o.seconds });
      } else if (o.kind === 'neck') {
        this.events.post({ type: 'actor:state', id, state: o.down ? 'neck-down' : 'neck-up' });
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.ports.autoCamera('side');
        if (dino instanceof LargeDino) this.events.post({ type: 'actor:state', id, state: 'neck-down' });
        if (dino instanceof SmallDino) this.events.post({ type: 'actor:state', id, state: 'stop' });
        if (dino instanceof MidDino) {
          this.events.post({ type: 'actor:state', id, state: 'awake', position: this.lateralPosition(dino.railId, dino.at, dino.params.fleeLateral), seconds: 0.8 });
        }
        this.finishDrive({ kind: 'fail', reason: 'dino', rewind: { railId: dino.railId, at: dino.at - REWIND_DISTANCE } });
        return;
      }
    }
    for (const nut of this.nuts) {
      const o = nut.update(dt);
      if (!o) continue;
      const id = nut.actor.id;
      if (o.kind === 'roll') {
        this.events.post({ type: 'nut', id, state: 'roll', railId: nut.railId, at: nut.at, speed: o.speed });
        if (this.lines.nutNear) this.ports.sayAsync(this.lines.nutNear);
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.events.post({ type: 'nut', id, state: 'bonk', railId: nut.railId, at: nut.s });
        this.finishDrive({ kind: 'fail', reason: 'nut', rewind: { railId: nut.railId, at: nut.at - nut.params.trigger - 30 } });
        return;
      }
    }
    for (const squirrel of this.squirrels) {
      const o = squirrel.update();
      if (!o) continue;
      const id = squirrel.actor.id;
      if (o.kind === 'near') {
        if (this.lines.squirrelNear) this.ports.sayAsync(this.lines.squirrelNear);
      } else if (o.kind === 'drop-rail') {
        this.events.post({ type: 'squirrel', id, state: 'drop-rail' });
        this.events.post({ type: 'nut', id, state: 'rest', railId: squirrel.railId, at: squirrel.at });
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.events.post({ type: 'nut', id, state: 'bonk', railId: squirrel.railId, at: squirrel.at });
        this.finishDrive({ kind: 'fail', reason: 'nut', rewind: { railId: squirrel.railId, at: squirrel.at - REWIND_DISTANCE } });
        return;
      }
    }
    if (this.updateRocks(dt)) return;
    this.updateHoppers();
    this.updateBridges(dt);
    this.updateFragiles(dt);
  }

  /** The station's stop (the gauge, the grade). True when the drive ended. */
  private checkStop(dt: number): boolean {
    const outcome = this.stop?.update(dt) ?? null;
    if (!outcome) return false;
    switch (outcome.kind) {
      case 'gaugeShown':
        if (this.lines.gauge) this.ports.sayAsync(this.lines.gauge);
        return false;
      case 'near':
        // v1.10 (3-3): "{station}" is the station's name (a mission with two stations says each one's).
        if (this.lines.stationNear) this.ports.sayAsync(this.lines.stationNear.replace('{station}', this.stop?.station.name ?? ''));
        return false;
      case 'short':
        this.ports.sayAsync(this.lines.short ?? DEFAULT_LINES.short);
        return false;
      case 'backUp':
        // v1.11 (PR8a, 第 3 部 A9): past the line, and うしろむき is there: no fail; "うしろで もどって！", the switch glows.
        this.reverse?.setBackUp(outcome.stationId);
        this.events.post({ type: 'reverse:backup', stationId: outcome.stationId });
        if (this.backUpSaidFor !== outcome.stationId) {
          this.backUpSaidFor = outcome.stationId;
          this.backUpAt = this.clock;
          this.ports.sayNow(this.lines.backUp ?? DEFAULT_LINES.backUp);
        } else if (this.clock - this.backUpAt >= REVERSE.stopLineEvery && this.train.state.speed < 0.05 && !this.train.reversing) {
          // Standing there without backing up: again every REVERSE.stopLineEvery s (when nothing else is said).
          this.backUpAt = this.clock;
          this.ports.sayIfQuiet(this.lines.backUp ?? DEFAULT_LINES.backUp);
        }
        return false;
      case 'tooFast':
        this.finishDrive({ kind: 'fail', reason: 'tooFast' });
        return true;
      case 'overshoot':
        this.finishDrive({ kind: 'fail', reason: 'overshoot' });
        return true;
      case 'stopped':
        this.finishDrive({ kind: 'stopped', grade: outcome.grade });
        return true;
    }
    return false;
  }

  /** v1.7: the countdown of this step. Returns true when time ran out (the drive ended). */
  private updateCountdown(dt: number): boolean {
    const c = this.countdown;
    if (!c) return false;
    const o = c.update(dt, this.train);
    if (o === 'low') {
      this.events.post({ type: 'countdown', state: 'low' });
      if (this.lines.timeLow) this.ports.sayAsync(this.lines.timeLow);
    } else if (o === 'safe') {
      this.safeLeft = COUNTDOWN.safeShow;
      this.events.post({ type: 'countdown', state: 'safe' });
      this.events.post({ type: 'partner:emote', kind: 'cheer' });
      this.ports.sayAsync(this.lines.timeSafe ?? DEFAULT_LINES.timeSafe);
      if (c.def.music) this.ports.music(null);
    } else if (o === 'up') {
      this.events.post({ type: 'countdown', state: 'up' });
      // The train stops under the sneeze (and a burning rocket ends with its puff), as in the other on-track fails.
      this.train.emergencyStop();
      this.finishDrive({ kind: 'fail', reason: 'timeUp', rewind: c.origin });
      return true;
    }
    return false;
  }

  /**
   * v1.10 (4-3): the snow wave of this step. Returns true when it caught the train (the drive ended): the train stops,
   * the soft snow wraps it ("もふっ"), and it goes back to a retry place behind.
   */
  private updateChase(dt: number): boolean {
    const c = this.chase;
    if (!c) return false;
    const o = c.update(dt);
    if (o === 'start') {
      this.events.post({ type: 'chase', state: 'run' });
      if (c.def.music) this.ports.music(c.def.music);
      for (const line of (this.lines.chaseStart ?? DEFAULT_LINES.chaseStart).split('\n')) this.ports.sayAsync(line);
    } else if (o === 'near') {
      this.ports.sayNow(this.lines.chaseNear ?? DEFAULT_LINES.chaseNear);
    } else if (o === 'far') {
      this.ports.sayAsync(this.lines.chaseFar ?? DEFAULT_LINES.chaseFar);
    } else if (o === 'safe') {
      this.safeLeft = COUNTDOWN.safeShow;
      this.events.post({ type: 'chase', state: 'safe' });
      this.events.post({ type: 'partner:emote', kind: 'cheer' });
      this.ports.sayNow(this.lines.chaseSafe ?? DEFAULT_LINES.chaseSafe);
      if (c.def.music) this.ports.music(null);
    } else if (o === 'caught') {
      this.events.post({ type: 'chase', state: 'caught' });
      this.train.emergencyStop();
      this.ports.autoCamera('chase');
      this.finishDrive({ kind: 'fail', reason: 'snow', rewind: c.retryPlace() });
      return true;
    }
    // "もこもこが きた！ ロケット！" once a try, when the rocket glows for the wave.
    if (!this.chaseRocketSaid && this.chaseRocketGlow && this.rocket?.glow) {
      this.chaseRocketSaid = true;
      this.ports.sayNow(this.lines.chaseRocket ?? DEFAULT_LINES.chaseRocket);
    }
    return false;
  }

  /**
   * v1.7: rocks. A rolling one crosses like the young dinosaur (wait for it); a dropping one lands on the rail
   * and stays (jump over it). Returns true when one was bumped (the drive ended).
   */
  private updateRocks(dt: number): boolean {
    for (const rock of this.rollingRocks) {
      const o = rock.step(dt);
      if (!o) continue;
      const base = { type: 'rock', id: rock.actor.id, kind: 'roll', railId: rock.railId, at: rock.at, lateral: rock.params.lateral } as const;
      if (o.kind === 'near') {
        this.events.post({ ...base, state: 'wobble' });
        const text = rock.rock.say ?? this.lines.rockNear;
        if (text) this.ports.sayNow(text);
      } else if (o.kind === 'roll') {
        this.events.post({ ...base, state: 'roll', seconds: o.seconds });
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.events.post({ ...base, state: 'bonk' });
        this.finishDrive({
          kind: 'fail',
          reason: 'rock',
          after: rock.rock.hitAfter ?? ROCK_HIT_AFTER.roll,
          rewind: rock.rewind,
        });
        return true;
      }
    }
    for (const rock of this.droppingRocks) {
      const o = rock.update();
      if (!o) continue;
      const base = { type: 'rock', id: rock.actor.id, kind: 'drop', railId: rock.railId, at: rock.at } as const;
      if (o.kind === 'shadow') {
        this.events.post({ ...base, state: 'shadow' });
      } else if (o.kind === 'drop') {
        this.events.post({ ...base, state: 'drop' });
        const text = rock.rock.say ?? this.lines.rockDrop;
        if (text) this.ports.sayNow(text);
      } else if (o.kind === 'danger') {
        this.train.emergencyStop();
        this.events.post({ ...base, state: 'bonk' });
        this.finishDrive({
          kind: 'fail',
          reason: 'rock',
          after: rock.rock.hitAfter ?? ROCK_HIT_AFTER.drop,
          rewind: rock.rewind,
        });
        return true;
      }
    }
    return false;
  }

  /** Grasshoppers: one hops on (by itself or when whistled for), helps over its gap, and hops off. */
  private updateHoppers(): void {
    for (const hopper of this.hoppers) {
      const o = hopper.update(this.hopperFree);
      if (!o) continue;
      const id = hopper.actor.id;
      if (o.kind === 'near') this.ports.sayAsync(this.lines.hopperNear ?? DEFAULT_LINES.hopperNear);
      else if (o.kind === 'board') this.board(hopper);
      else if (o.kind === 'ready') {
        const hint = hopper.params.gapHint ?? hopper.gap?.hint ?? 'fast';
        const text = this.lines.hopperReady ?? DEFAULT_LINES.hopperReady;
        this.ports.sayAsync(text.replace('{speed}', LEVER_NOTCHES[HINT_NOTCH[hint]].label));
      } else if (o.kind === 'done') {
        this.train.jumpBoost = null;
        this.events.post({ type: 'hopper', id, state: 'off' });
        this.ports.sayAsync(this.lines.hopperDone ?? DEFAULT_LINES.hopperDone);
      }
    }
  }

  /** No grasshopper is riding (only one fits on the roof). */
  private get hopperFree(): boolean {
    return !this.hoppers.some((h) => h.state === 'riding');
  }

  private board(hopper: Grasshopper): void {
    this.train.jumpBoost = { power: hopper.params.power, height: hopper.params.height };
    this.events.post({ type: 'hopper', id: hopper.actor.id, state: 'board' });
    this.events.post({ type: 'partner:emote', kind: 'jump' });
    this.ports.sayAsync(this.lines.hopperOn ?? DEFAULT_LINES.hopperOn);
  }

  /** Butterflies follow the light to their bud; the flower opens a bridge over the stream. */
  private updateBridges(dt: number): void {
    for (const { bridge, outcome } of this.bridges.update(dt, this.lightOn)) {
      if (!outcome) continue;
      const key: DefaultLine = BRIDGE_LINES[outcome.kind];
      this.ports.sayAsync(this.lines[key] ?? DEFAULT_LINES[key]);
      if (outcome.kind === 'open') {
        this.events.post({ type: 'bridge', index: bridge.index, open: true });
        this.events.post({ type: 'partner:emote', kind: 'jump' });
      }
    }
    this.postButterflies();
  }

  /** Tells the view where each butterfly is, when that changed. */
  private postButterflies(): void {
    for (const b of this.bridges.bridges) {
      const key = `${b.state}:${b.s.toFixed(2)}:${b.flustered ? 1 : 0}`;
      if (this.butterflyPosted.get(b.index) === key) continue;
      this.butterflyPosted.set(b.index, key);
      this.events.post({ type: 'butterfly', index: b.index, state: b.state, s: b.s, flustered: b.flustered });
    }
  }

  /** Silk bridges: slow over them, or the silk bounces the train back. */
  private updateFragiles(dt: number): void {
    for (const { item, outcome } of this.fragiles.update(dt)) {
      if (!outcome) continue;
      switch (outcome.kind) {
        case 'near':
          this.ports.sayAsync(this.lines.fragileNear ?? DEFAULT_LINES.fragileNear);
          break;
        case 'shake':
          this.events.post({ type: 'fragile', index: item.index, state: 'shake' });
          this.ports.sayAsync(this.lines.fragileShake ?? DEFAULT_LINES.fragileShake);
          break;
        case 'calm':
          this.events.post({ type: 'fragile', index: item.index, state: 'calm' });
          break;
        case 'clear':
          this.events.post({ type: 'fragile', index: item.index, state: 'calm' });
          this.ports.sayAsync(this.lines.fragileClear ?? DEFAULT_LINES.fragileClear);
          break;
        case 'boing':
          this.train.emergencyStop();
          this.events.post({ type: 'fragile', index: item.index, state: 'boing' });
          this.finishDrive({ kind: 'fail', reason: 'fragile', rewind: { railId: item.railId, at: item.rewindAt } });
          return;
      }
    }
  }

  /**
   * Puts every actor back where it waits (start of the stage and after a rewind to `target`): grasshoppers
   * riding, or whose leaf is ahead of the train again, go back to their leaf.
   */
  private resetActors(target?: { railId: string; at: number }): void {
    // v1.11 (5-2): the band back where it waits (or gone, past it), the spinning forks asleep (fixed ones stay).
    for (const p of this.parades) {
      p.reset(target);
      this.postParade(p);
    }
    this.spins.reset();
    this.paradeHeldFor = 0;
    this.paradeStandFor = 0;
    this.paradeMatchFor = 0;
    // v1.11 (5-1): everyone asleep again, the tanukis in their bushes, the fireflies in the grass.
    this.hush.reset();
    this.reversed.reset();
    for (const g of this.reversed.groups) this.events.post({ type: 'lure', id: g.actor.id, state: 'idle' });
    this.fireflies.reset();
    this.train.clearPreferred();
    this.fireflyAway.clear();
    this.reversedEntered.clear();
    this.reversedCalled.clear();
    for (const fawn of this.fawns) {
      fawn.reset();
      this.events.post({ type: 'actor:state', id: fawn.actor.id, state: 'wait', position: this.lateralPosition(fawn.railId, fawn.at, -fawn.params.lateral), seconds: 0 });
    }
    for (const hopper of this.hoppers) {
      const behind = target !== undefined && hopper.state === 'done' && (hopper.railId !== target.railId || hopper.at <= target.at);
      if (behind) continue;
      if (hopper.state !== 'sit') this.events.post({ type: 'hopper', id: hopper.actor.id, state: 'sit' });
      hopper.reset();
    }
    this.train.jumpBoost = null;
    for (const whale of this.whales) this.events.post({ type: 'whale', id: whale.actor.id, state: whale.reset(target) });
    this.bubbleArmed.clear();
    if (this.bubbleShown.size > 0) this.events.post({ type: 'bubbles:reset' });
    this.bubbleShown.clear();
    this.bridges.reset();
    this.postButterflies();
    this.fragiles.reset();
    for (const f of this.fragiles.items) this.events.post({ type: 'fragile', index: f.index, state: 'calm' });
    for (const nut of this.nuts) {
      nut.reset();
      this.events.post({ type: 'nut', id: nut.actor.id, state: 'reset', railId: nut.railId, at: nut.at });
    }
    for (const squirrel of this.squirrels) {
      squirrel.reset();
      this.events.post({ type: 'squirrel', id: squirrel.actor.id, state: 'hold' });
      this.events.post({ type: 'nut', id: squirrel.actor.id, state: 'hide', railId: squirrel.railId, at: squirrel.at });
    }
    for (const rock of this.rollingRocks) {
      rock.reset();
      this.events.post({ type: 'rock', id: rock.actor.id, kind: 'roll', state: 'wait', railId: rock.railId, at: rock.at, lateral: rock.params.lateral });
    }
    for (const rock of this.droppingRocks) {
      rock.reset();
      this.events.post({ type: 'rock', id: rock.actor.id, kind: 'drop', state: 'hide', railId: rock.railId, at: rock.at });
    }
    for (const dino of this.dinos) {
      // A sleeping one already woken and left at or behind where the train is put back stays awake and aside: asleep
      // again it would lie under the cars (1-2: back from the cliff side track to 686, or from the young one to 680).
      const passed = target !== undefined && dino.railId === target.railId && dino.at <= target.at;
      if (dino instanceof MidDino && dino.state === 'awake' && passed) continue;
      dino.reset();
      const id = dino.actor.id;
      if (dino instanceof SmallDino) {
        this.events.post({ type: 'actor:state', id, state: 'wait', position: this.lateralPosition(dino.railId, dino.at, -dino.params.lateral), seconds: 0 });
      } else if (dino instanceof LargeDino) {
        this.events.post({ type: 'actor:state', id, state: 'neck-up' });
      } else {
        this.events.post({ type: 'actor:state', id, state: 'sleep', position: dino.actor.position, seconds: 0 });
      }
    }
  }

  /**
   * Jump pads: the partner points out the missing pad and the whistle button glows while it is in reach;
   * a shown pad counts down and launches the train when the lead bogie runs over it.
   */
  private updatePads(dt: number): void {
    let glow = false;
    for (const pad of this.pads) {
      const d = this.train.distanceAhead(pad.railId, pad.at);
      if (pad.left > 0) {
        pad.left = Math.max(0, pad.left - dt);
        if (pad.left === 0) this.events.post({ type: 'pad', index: pad.index, visible: false });
      }
      if (d === null) continue;
      if (!pad.hinted && d > 0 && d <= pad.range + 30) {
        pad.hinted = true;
        this.ports.sayAsync(this.lines.padGone ?? DEFAULT_LINES.padGone);
      }
      if (pad.left === 0 && d > -FALL.bogieLead && d <= pad.range) glow = true;
      // The lead bogie is FALL.bogieLead behind the front: launch when it reaches the pad.
      if (pad.left > 0 && d <= -FALL.bogieLead && d > -FALL.bogieLead - 4 && this.train.padJump()) {
        this.events.post({ type: 'jump' });
      }
    }
    if (this.squirrels.some((s) => s.inWhistleRange)) glow = true;
    if (this.whales.some((w) => w.callable)) glow = true;
    if (this.hopperFree && this.hoppers.some((h) => h.inWhistleRange)) glow = true;
    // v1.11 (5-1): the hedgehog (cat glow) in reach, and a firefly fork in calling reach.
    if (this.cats.some((c) => c.glows())) glow = true;
    if (this.fireflies.glow) glow = true;
    // v1.11 (5-2): the unwound band in calling reach, a spinning fork pointing the good way.
    if (this.parades.some((p) => p.callable)) glow = true;
    if (this.spins.glow) glow = true;
    // v1.11 (6-1): Sakasa teasing ahead, once the partner asked for the call.
    if (this.lead?.whistleGlow) glow = true;
    // Never in a whistle-reversed stretch (the hush mark says "しーっ" there instead).
    if (this.reversed.current) glow = false;
    this.ports.whistleHint(glow);
  }

  /**
   * v1.10 (3-1): the partner names each floater coming up (its own `say`, else floatNear) once per try, and says
   * diveReady the first time in a mission the "もぐる" button glows. Both only matter now: said at once.
   */
  private updateWater(): void {
    if (!this.abilities.has('dive')) return;
    for (const f of this.stage.file.floaters ?? []) {
      if (this.floaterLines.has(f.id)) continue;
      const d = this.train.distanceAhead(f.railId, f.at);
      if (d === null || d <= 0 || d > DIVE.hintDistance) continue;
      this.floaterLines.add(f.id);
      const text = f.say ?? this.lines.floatNear;
      if (text) this.ports.sayNow(text);
    }
    if (!this.diveReadySaid && this.dive?.glow) {
      this.diveReadySaid = true;
      if (this.lines.diveReady) this.ports.sayNow(this.lines.diveReady);
    }
  }

  /**
   * v1.10 (3-1): whales. The partner points one out, asks for the whistle (at once: it is only useful now) and names
   * its current as the train runs into it (pushing when the whale swims along, waiting for it otherwise).
   */
  private updateWhales(dt: number): void {
    for (const whale of this.whales) {
      for (const o of whale.update(dt)) {
        if (o.kind === 'near') {
          if (this.lines.whaleNear) this.ports.sayAsync(this.lines.whaleNear);
        } else if (o.kind === 'call') {
          this.ports.sayNow(this.lines.whaleCall ?? DEFAULT_LINES.whaleCall);
        } else this.events.post({ type: 'whale', id: whale.actor.id, state: o.state });
      }
    }
    const zone = zoneAt(this.stage.file.gimmicks, 'updraft', this.train.state.railId, this.train.frontS);
    const index = zone ? this.stage.file.gimmicks.indexOf(zone) : -1;
    if (index === this.inCurrent) return;
    this.inCurrent = index;
    if (!zone || typeof zone.params?.whale !== 'string') return;
    const key = `current:${index}`;
    if (this.zoneLines.has(key)) return;
    this.zoneLines.add(key);
    if (this.updraftOn(zone)) {
      if (this.lines.currentIn) this.ports.sayAsync(this.lines.currentIn);
    } else this.ports.sayNow(this.lines.currentWait ?? DEFAULT_LINES.currentWait);
  }

  /** v1.10 (3-1): an updraft pushes, unless it belongs to a whale that is not swimming along. */
  updraftOn(zone: { params?: Record<string, unknown> }): boolean {
    const id = zone.params?.whale;
    if (typeof id !== 'string') return true;
    return this.whales.some((w) => w.actor.id === id && w.following);
  }

  /** Test hook (v1.10, 3-3): every animal on the rail and its state, "umidori:sleep,kame:awake". */
  get actorStates(): string {
    return this.cats.map((c) => `${c.actor.id}:${c.shownState}`).join(',');
  }

  /** Test hook: every whale's state, "kujira:follow". */
  get whaleStates(): string {
    return this.whales.map((w) => `${w.actor.id}:${w.state}`).join(',');
  }

  /**
   * v1.10 (3-1) bubble forks: pointed out BUBBLE_FORK.nearDistance m before (once a mission), the light shows the
   * swirl on the sinking side within LIGHT.revealDistance m (the way is not chosen for the child), and taking the
   * rising way is "せいかい！" (once a mission per fork). Taking the sinking way is remembered: the light button glows
   * before that fork after (as after a reversed sign).
   */
  private updateBubbleForks(): void {
    const t = this.train;
    for (const j of this.stage.file.junctions) {
      const b = j.bubbles;
      if (!b) continue;
      const d = t.distanceAhead(j.railId, j.at);
      if (d !== null && d > 0 && d <= BUBBLE_FORK.nearDistance) {
        this.bubbleArmed.add(j.id);
        if (!this.bubbleNearSaid.has(j.id)) {
          this.bubbleNearSaid.add(j.id);
          this.ports.sayAsync(b.say ?? this.lines.bubbleNear ?? DEFAULT_LINES.bubbleNear);
        }
        if (this.lightOn && d <= LIGHT.revealDistance && !this.bubbleShown.has(j.id)) {
          this.bubbleShown.add(j.id);
          this.bubbleRevealedId = j.id;
          this.events.post({ type: 'bubbles:reveal', junctionId: j.id });
          if (!this.bubbleRevealedSaid) {
            this.bubbleRevealedSaid = true;
            this.ports.sayAsync(this.lines.bubbleRevealed ?? DEFAULT_LINES.bubbleRevealed);
          }
        }
        continue;
      }
      if (!this.bubbleArmed.has(j.id)) continue;
      // Passed: on along its own rail (the car centre past the fork), or onto the other way.
      const straight = t.state.railId === j.railId && d !== null && d < -TRAIN_HALF;
      const turned = t.state.railId !== j.railId && (t.state.railId === j.left || t.state.railId === j.right);
      if (!straight && !turned) continue;
      this.bubbleArmed.delete(j.id);
      if (this.bubbleShown.delete(j.id)) this.events.post({ type: 'bubbles:reset' });
      const side = j.left === t.state.railId ? 'left' : 'right';
      if (b[side] === 'sink') {
        this.bubbleWrong.add(j.id);
      } else if (!this.bubbleTrueSaid.has(j.id)) {
        this.bubbleTrueSaid.add(j.id);
        this.ports.sayAsync(this.lines.bubbleTrue ?? DEFAULT_LINES.bubbleTrue);
        this.events.post({ type: 'bubbles:true', junctionId: j.id });
        this.events.post({ type: 'partner:emote', kind: 'cheer' });
      }
    }
  }

  /** v1.10 (3-1): the light button glows for a bubble fork (in the dark, or one that fooled the train before). */
  private get bubbleLightHint(): boolean {
    const t = this.train;
    const dark = zoneAt(this.stage.file.gimmicks, 'fog', t.state.railId, t.frontS) !== null;
    for (const j of this.stage.file.junctions) {
      if (!j.bubbles || this.bubbleShown.has(j.id)) continue;
      const d = t.distanceAhead(j.railId, j.at);
      if (d === null || d <= 0) continue;
      if ((dark && d <= BUBBLE_FORK.lightGlow) || (this.bubbleWrong.has(j.id) && d <= BUBBLE_FORK.wrongGlow)) return true;
    }
    return false;
  }

  /** "つぎの きれめは ふつう で とべる！" once per gap and attempt. */
  private updateGapHints(): void {
    const gap = this.train.nextGap(JUMP.hintDistance);
    if (!gap || !gap.hint || this.gapHints.has(gap) || !this.lines.gapNear) return;
    this.gapHints.add(gap);
    this.ports.sayAsync(this.lines.gapNear.replace('{speed}', LEVER_NOTCHES[HINT_NOTCH[gap.hint]].label));
  }

  /** The junction ahead on the current rail, if it is within `range` m of the train front. */
  private junctionAhead(range: number): JunctionDef | null {
    for (const j of this.stage.file.junctions) {
      const d = this.train.distanceAhead(j.railId, j.at);
      if (d !== null && d > 0 && d <= range) return j;
    }
    return null;
  }

  /** Reversed signs: a line when one comes up; with the light on, the true way lights up and becomes the default. */
  private updateJunctionSigns(): void {
    const j = this.junctionAhead(80);
    // v1.11 (PR5/5-3): a turned-away mirror's fork: the light alone does not see through it (revealTurn does).
    if (!j || !j.signReversed || j.turn || this.revealed.has(j.id)) return;
    if (!this.signLines.has(j.id)) {
      this.signLines.add(j.id);
      if (this.lines.signNear && !this.lightOn) this.ports.sayAsync(this.lines.signNear);
    }
    const d = this.train.distanceAhead(j.railId, j.at);
    if (!this.lightOn || d === null || d > LIGHT.revealDistance) return;
    this.revealed.add(j.id);
    const truth: JunctionSide = j.default === 'left' ? 'right' : 'left';
    this.train.chooseJunction(truth);
    this.ports.revealJunction(truth);
    this.events.post({ type: 'sign:reveal', junctionId: j.id });
    if (j.fireflies?.fake) {
      // v1.11 (5-1): Sakasa's pink lanterns go out ("ぽしゅん"); lost fireflies find the true way.
      this.events.post({ type: 'fake:out', junctionId: j.id });
      const home = this.fireflies.reveal(j.id);
      if (home) this.fireflyHome(home);
      this.sayNight('fakeRevealed', 'try', { tag: j.id });
      return;
    }
    if (this.lines.signRevealed) this.ports.sayAsync(this.lines.signRevealed);
  }

  /**
   * Records (v1.8): found by passing within RECORD.distance m while using the ability the record needs — none, the
   * light on, in the air (jump), the rocket burning, its push still in the speed, or fired on this rail or the one
   * before (Train.rocketUsedHere). A record's hint is said once,
   * RECORD.hintDistance m before it, when it can be taken now.
   */
  private updateRecords(): void {
    for (const record of this.stage.records) {
      const def = record.def;
      if (this.found.has(def.id)) continue;
      // v1.11 (5-1): a sleeper startled this try has hidden: not to be found (nor pointed out) now.
      if (def.hush && record.onRail && this.hush.startledAt(record.onRail.railId, record.onRail.at)) continue;
      // v1.11 (PR5): a record needing the magnet light is found when it is pulled to the train (its hint: listenMagnet).
      if (def.requires === 'magnetLight') continue;
      const d = this.recordDistance(record);
      if (d === null) continue;
      const takeable = def.requires === null || this.abilities.has(def.requires);
      if (def.hint && takeable && d <= RECORD.hintDistance && !this.recordHints.has(def.id)) {
        this.recordHints.add(def.id);
        this.ports.sayAsync(def.hint);
      }
      if (d > RECORD.distance || !takeable || !this.usingAbility(def.requires)) continue;
      this.takeRecord(def);
    }
  }

  /** A record is found now (saved, the toast, "みつけた！"). v1.11 (PR5): also when the magnet pulled it to the train. */
  private takeRecord(def: RecordDef): void {
    this.found.add(def.id);
    addToProgress('records', [def.id]);
    this.events.post({ type: 'record:found', id: def.id });
    this.ports.recordFound(def);
    this.ports.sayAsync(this.lines.recordFound ?? DEFAULT_LINES.recordFound);
  }

  /** v1.8: the ability a record needs is in use right now (null: nothing needed). */
  private usingAbility(ability: AbilityId | null): boolean {
    return abilityInUse(ability, this.train, this.lightOn);
  }

  /** v1.8: the line for a junction side way that needs `ability`. */
  private needLine(ability: AbilityId): string {
    return this.lines.needAbility ?? NEED_LINES[ability] ?? NEED_LINE_OTHER;
  }

  /**
   * v1.8: the player tapped the arrow to a side way that needs an ability they do not have. Said only then, not on
   * the way up to the junction: 1-2's side track starts right after the sleeping dinosaur and 2-1's in the treetop
   * station's braking, where a line about an ability the child has never heard of would push the one that matters
   * (the whistle, "ゆっくり") later.
   */
  onJunctionRefused(junction: JunctionDef): void {
    if (this.phase !== 'driving' || !junction.needs) return;
    this.sayRefusal(this.needLine(junction.needs));
  }

  private recordDistance(record: ResolvedRecord): number | null {
    // v1.11 (PR8a, 第 3 部 A12.1): reversing, from the tail car (along the rails when it is on the record's rail).
    if (this.train.reversing) {
      const tail = this.train.tailFrame();
      if (record.onRail && record.onRail.railId === tail.railId) return Math.abs(record.onRail.at - tail.s);
      return record.position.distanceTo(this.train.getPose().tail.position);
    }
    if (record.onRail) {
      const d = this.train.distanceAhead(record.onRail.railId, record.onRail.at);
      return d === null ? null : Math.abs(d);
    }
    return record.position.distanceTo(this.train.getPose().position);
  }

  /** v1.8: stopped at the buffer of a record's side track: back to the way on (not a failure). */
  private checkSpur(): boolean {
    const rail = this.train.currentRail;
    const def = this.stage.file.rails.find((r) => r.id === rail.id);
    if (!def?.spur || this.train.state.speed > 0) return false;
    if (rail.length - this.train.frontS > 10) return false;
    this.finishDrive({ kind: 'fail', reason: 'spur', rewind: def.spur.back });
    return true;
  }

  /** Stopped at the buffer of a wrong turn: back before the junction. */
  private checkDeadEnd(): boolean {
    const rail = this.train.currentRail;
    const def = this.stage.file.rails.find((r) => r.id === rail.id);
    if (!def?.deadEnd || this.train.state.speed > 0) return false;
    if (rail.length - this.train.frontS > 10) return false;
    const feeder = this.stage.file.junctions.find((j) => j.left === rail.id || j.right === rail.id);
    if (!feeder) return false;
    this.finishDrive({ kind: 'fail', reason: 'deadEnd', rewind: { railId: feeder.railId, at: feeder.at - REWIND_DISTANCE } });
    return true;
  }

  private onFell(gap: GapDef, railId: string, short: boolean): void {
    if (this.phase !== 'driving') return;
    this.ports.autoCamera('chase');
    const same = (g: GapDef | null) => g !== null && g.from === gap.from && g.to === gap.to;
    let reason: FailReason = short ? 'fellShort' : 'fellNoJump';
    let line: DefaultLine | undefined;
    if (gap.bridge !== undefined) reason = 'bridge';
    else if (this.hoppers.some((h) => h.railId === railId && h.state === 'sit' && same(h.gap))) reason = 'hopper';
    // Short with the light on: the light caps the speed, which is what made the jump too short.
    else if (short && this.lightOn) line = 'fellLight';
    // v1.10 (4-2): a gap may have its own line (the snowy valley: "ジャンプだいは きてきで でるよ").
    const text = gap.bridge === undefined ? gap.line : undefined;
    // v1.11 (5-2): into a ball pit ("ぼよよん… ぽふっ") is soft.
    const soft = this.stage.file.environment.fall === 'balls' ? true : undefined;
    this.finishDrive({ kind: 'fail', reason, line, text, soft, rewind: gap.rewind ?? { railId, at: gap.from - REWIND_DISTANCE } });
  }

  /** Lever moved while locked: explain why. */
  onLeverRejected(): void {
    if (this.phase === 'driving') {
      // v1.7: the lever stays put while the rocket burns and on a slide; once per burn / slide.
      if (this.train.rocketBurning && !this.rocketLeverSaid) {
        this.rocketLeverSaid = true;
        this.ports.sayAsync(this.lines.rocketLever ?? DEFAULT_LINES.rocketLever);
      } else if (this.train.onSlide && !this.train.rocketBurning && !this.noBrakeLeverSaid) {
        this.noBrakeLeverSaid = true;
        this.ports.sayAsync(this.lines.noBrakeLever ?? DEFAULT_LINES.noBrakeLever);
      }
      return;
    }
    if (this.phase !== 'doors') return;
    if (this.doorsOpen) this.ports.sayAsync(this.lines.doorsOpenLever ?? DEFAULT_LINES.doorsOpenLever);
    else this.ports.sayAsync(this.lines.doorsClosedLever ?? DEFAULT_LINES.doorsClosedLever);
  }

  private onWhistle(): void {
    // v1.11 (6-1): calling out while the guest comes to the open door: she flinches back (or only giggles).
    if (this.phase === 'doors' && this.welcome) {
      this.onWelcomeWhistle();
      return;
    }
    if (this.phase !== 'driving') return;
    // v1.11 (6-1): "とまって〜！" to Sakasa teasing ahead: she runs off further.
    if (this.lead) {
      const r = this.lead.onWhistle();
      if (r === 'call' && this.lead.lastCall) this.onLeadOutcome(this.lead.lastCall);
      else if (r === 'hop') this.events.post({ type: 'lead:hop', id: this.lead.def.id });
    }
    // v1.11 (PR8a, 第 3 部 A7): the animals passed already do not stir (reversing, retracing).
    if (this.train.stillGimmicks) return;
    // v1.11 (5-1): in a whistle-reversed stretch the tanukis come (decided before anything else there reacts).
    const rev = this.reversed.onWhistle();
    if (rev) {
      this.reversedCalled.add(rev.zone.id);
      this.onReversedWhistle(rev.came, rev.hopped, this.reversed.mercy(rev.zone));
    }
    // In a hush stretch the whistle startles the sleepers.
    this.hush.onWhistle();
    // A firefly fork in reach: its fireflies fly (to the true way, or lost over a fake fork not seen through yet).
    const ff = this.fireflies.call();
    if (ff) {
      this.events.post({ type: 'fireflies:call', junctionId: ff.fork.id });
      if (ff.state === 'home') {
        this.fireflyHome(ff.fork);
        this.sayNight('fireflyCall', 'mission', { now: true });
        this.events.post({ type: 'partner:emote', kind: 'jump' });
      } else {
        this.events.post({ type: 'fireflies:lost', junctionId: ff.fork.id });
        this.sayNight(this.lightOn ? 'fireflyConfusedLit' : 'fireflyConfused', 'try', { now: true });
      }
    }
    for (const whale of this.whales) {
      if (!whale.onWhistle()) continue;
      this.events.post({ type: 'whale', id: whale.actor.id, state: 'sing' });
      this.ports.sayAsync(this.lines.whaleSang ?? DEFAULT_LINES.whaleSang);
      this.events.post({ type: 'partner:emote', kind: 'jump' });
    }
    for (const pad of this.pads) {
      const d = this.train.distanceAhead(pad.railId, pad.at);
      if (d === null || d > pad.range || d <= -FALL.bogieLead) continue;
      const fresh = pad.left === 0;
      pad.left = pad.seconds;
      this.events.post({ type: 'pad', index: pad.index, visible: true, seconds: pad.seconds });
      if (fresh) this.ports.sayAsync(this.lines.padAppear ?? DEFAULT_LINES.padAppear);
    }
    const woken = this.cats.filter((c) => c.onWhistle());
    // v1.11 (5-2): wind-up toys walking together are wound together (one whistle for the three chicks).
    for (const c of this.cats) {
      if (woken.includes(c) || !woken.some((w) => w.windup && w.railId === c.railId && Math.abs(w.at - c.at) <= WINDUP.group)) continue;
      if (c.windWithGroup()) woken.push(c);
    }
    for (const cat of this.cats) {
      if (woken.includes(cat)) {
        // v1.11 (5-2): a wind-up toy's key turns back first ("きりきり… くるりん！"), then it hops aside.
        const delay = cat.windup ? WINDUP.keySeconds : undefined;
        this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'awake', position: this.catFleePosition(cat), seconds: cat.params.fleeSeconds, delay });
        if (cat.windup) this.events.post({ type: 'windup', id: cat.actor.id, kind: 'toy' });
        const woke = cat.lines.woke ?? this.lines.catWoke;
        if (woke) this.ports.sayAsync(woke);
        this.events.post({ type: 'partner:emote', kind: 'jump' });
      }
    }
    // v1.11 (5-2): the band (wound: it turns and marches; marching: it answers), then the spinning forks.
    for (const p of this.parades) {
      const r = p.onWhistle();
      if (r === 'wound') {
        this.postParade(p);
        this.events.post({ type: 'windup', id: p.actor.id, kind: 'band' });
        this.ports.sayNow(this.lines.paradeTurn ?? DEFAULT_LINES.paradeTurn);
        this.events.post({ type: 'partner:emote', kind: 'jump' });
      } else if (r === 'fanfare') this.events.post({ type: 'parade:fanfare', id: p.actor.id });
    }
    this.spins.onWhistle();
    for (const hopper of this.hoppers) {
      if (hopper.onWhistle(this.hopperFree)) this.board(hopper);
    }
    for (const squirrel of this.squirrels) {
      if (!squirrel.onWhistle()) continue;
      this.events.post({ type: 'squirrel', id: squirrel.actor.id, state: 'drop-side' });
      this.ports.sayAsync(this.lines.squirrelDropped ?? DEFAULT_LINES.squirrelDropped);
      this.events.post({ type: 'partner:emote', kind: 'jump' });
    }
    for (const dino of this.dinos) {
      if (!dino.onWhistle() || !(dino instanceof MidDino)) continue;
      const position = this.lateralPosition(dino.railId, dino.at, dino.params.fleeLateral);
      this.events.post({ type: 'actor:state', id: dino.actor.id, state: 'awake', position, seconds: dino.params.fleeSeconds });
      if (this.lines.dinoWoke) this.ports.sayAsync(this.lines.dinoWoke);
      this.events.post({ type: 'partner:emote', kind: 'jump' });
    }
  }

  private catFleePosition(cat: CatActor): Vector3 {
    const look = (cat.actor.params as { look?: string }).look;
    if (look === 'turtle') {
      // v1.10 (3-3): the sea turtle swims off up and aside (it stays under water).
      const frame = this.stage.network.getRail(cat.railId).frameAt(cat.at);
      return frame.position.clone().addScaledVector(frame.right, cat.params.fleeLateral).addScaledVector(frame.up, 7);
    }
    if (look === 'seabird') {
      // v1.7: a seabird flaps off up into the sky instead of walking aside.
      const frame = this.stage.network.getRail(cat.railId).frameAt(cat.at);
      return frame.position.clone().addScaledVector(frame.right, cat.params.fleeLateral * 3).addScaledVector(frame.up, 22);
    }
    return this.lateralPosition(cat.railId, cat.at, cat.params.fleeLateral);
  }

  /** A point on the ground `lateral` m to the right of the rail at `at`. */
  private lateralPosition(railId: string, at: number, lateral: number): Vector3 {
    const frame = this.stage.network.getRail(railId).frameAt(at);
    const p = frame.position.clone().addScaledVector(frame.right, lateral);
    if (this.groundY !== null) p.y = this.groundY;
    return p;
  }

  private station(id: string): StationDef {
    const st = this.stage.file.stations.find((s) => s.id === id);
    if (!st) throw new Error(`Unknown station "${id}"`);
    return st;
  }

  private async runStep(step: MissionStep): Promise<void> {
    const station = this.station(step.stationId);
    // Already standing at this station (previous mission ended here): no driving, no grading.
    const alreadyHere =
      !station.reverse &&
      this.train.state.speed === 0 &&
      this.train.state.railId === station.railId &&
      Math.abs(this.train.offsetTo(station.at)) <= new StopMonitor(this.train, station).rule.ok;
    if (step.countdown && !alreadyHere) await this.startCountdown(step, station);
    // v1.10 (4-3): the snow wave comes out once the train front passes its `from`.
    if (step.chase && !alreadyHere) {
      this.chase = new SnowWave(step.chase, this.train);
      this.chaseRocketSaid = false;
    }
    // v1.11 (6-1): Sakasa comes out once the train front passes the lead's `from`.
    if (step.lead && !alreadyHere) {
      const rules = this.currentMission?.junctions;
      this.lead = new LeadRunner(step.lead, this.train, this.stage.network, this.stage.file.junctions, rules, this.reverse ?? NO_REVERSE);
      this.stationClosedSaid = false;
    }
    // Drive until a graded stop; fails rewind and retry the same step.
    while (!alreadyHere) {
      this.events.post({ type: 'goal', stationId: station.id });
      const outcome = await this.drive(station);
      if (outcome.kind === 'stopped') {
        this.stopsMade += 1;
        if (outcome.grade === 'perfect') this.perfectStops += 1;
        this.ports.toast(outcome.grade === 'perfect' ? 'ぴったり！' : 'とまれた！', outcome.grade);
        this.events.post({ type: 'stop', grade: outcome.grade });
        this.ports.sayAsync(this.lines[outcome.grade] ?? DEFAULT_LINES[outcome.grade]);
        if (outcome.grade === 'perfect') this.events.post({ type: 'partner:emote', kind: 'jump' });
        break;
      }
      await this.fail(outcome, station);
    }
    this.endCountdown();
    this.endChase();
    this.endLead();
    this.lastStop = { railId: station.railId, at: station.at };
    this.lastStationId = station.id;
    if (step.welcome) await this.welcomeDoors(step, station);
    else if ((step.board ?? 0) > 0 || (step.alight ?? 0) > 0 || step.parcel) await this.doors(step, station);
  }

  /** v1.7: "かざんが むずむず してる！" — then the time runs while driving to this step's station. */
  private async startCountdown(step: MissionStep, station: StationDef): Promise<void> {
    const def = step.countdown;
    if (!def) return;
    if (this.lines.timerStart) for (const line of this.lines.timerStart.split('\n')) await this.ports.say(line, 'partner');
    const origin = this.lastStop ?? { railId: this.train.state.railId, at: this.train.frontS };
    this.countdown = new Countdown(def, origin, station);
    this.safeLeft = 0;
    this.events.post({ type: 'countdown', state: 'run' });
    if (def.music) this.ports.music(def.music);
  }

  /** v1.10 (4-3): the step is done: the wave is put away (a beaten one keeps settling at the fence in the view). */
  private endChase(): void {
    const c = this.chase;
    if (!c) return;
    if (c.state !== 'safe') {
      this.events.post({ type: 'chase', state: 'off' });
      if (c.def.music && c.state !== 'armed') this.ports.music(null);
      this.chase = null;
    }
  }

  /** v1.7: the step is done: put the panel away (and the song back if it never got beaten). */
  private endCountdown(): void {
    const c = this.countdown;
    if (!c) return;
    if (c.state !== 'safe') {
      this.events.post({ type: 'countdown', state: 'off' });
      if (c.def.music) this.ports.music(null);
      this.countdown = null;
    }
  }

  private drive(station: StationDef): Promise<DriveOutcome> {
    // v1.11 (PR8a, B6.3): a reverse platform has no stop monitor (arriving is stopping at its siding's buffer); a
    // station overshot can be backed up to once うしろむき is learned (A9).
    this.reverseArrival = station.reverse ? station : null;
    this.stop = station.reverse ? null : new StopMonitor(this.train, station, 120, () => this.abilities.has('reverse'));
    this.backUpSaidFor = null;
    this.phase = 'driving';
    this.lastRefusal = null;
    if (this.rearm) {
      // The slopes and the rocket kept running through the fail's fade (announcing to no one while the phase was
      // 'failing'): forget that, so the slope just ahead and the zone the train stands in are named on this try.
      this.rearm = false;
      this.slopes?.reset();
      this.rocket?.reset();
      this.ice?.reset();
      this.thinIce?.reset();
    }
    // v1.7: the rocket fills up for every drive from a station, and rests near this one.
    if (this.rocket) {
      this.rocket.refill();
      this.rocket.goal = { railId: station.railId, at: station.at };
    }
    if (this.ice) this.ice.goal = station;
    this.train.unlockInput();
    return new Promise((resolve) => {
      this.resolveDrive = resolve;
    });
  }

  private finishDrive(outcome: DriveOutcome): void {
    this.phase = outcome.kind === 'fail' ? 'failing' : 'stopped';
    this.reverseArrival = null;
    this.reverse?.setBackUp(null);
    if (this.stop) this.ports.gauge(this.stop.gauge);
    this.train.lockInput(this.phase);
    const r = this.resolveDrive;
    this.resolveDrive = null;
    r?.(outcome);
  }

  private async fail(outcome: FailOutcome, station: StationDef): Promise<void> {
    const reason = outcome.reason;
    // The train is stopped and the lever is locked until the rewind: say why now, not after older lines.
    this.ports.hush();
    const scary = (reason === 'cat' && !outcome.soft) || reason === 'dino';
    // v1.8: back from a record's side track is no failure: no dip, no shake.
    const calm = reason === 'spur';
    // The silk, a rock, a slip, the sneeze, "ぽよん" off the water and a dead end are soft: a small dip, no shake.
    // v1.10 (4-1): past an ice station ("つるーん") and through thin ice ("ぽちゃん") are soft too.
    const iceStation = (reason === 'tooFast' || reason === 'overshoot') && this.ice !== null && this.ice.onIce(station);
    const soft =
      reason === 'fragile' ||
      reason === 'rock' ||
      reason === 'slip' ||
      reason === 'timeUp' ||
      reason === 'dive' ||
      reason === 'floater' ||
      reason === 'deadEnd' ||
      reason === 'crack' ||
      reason === 'plow' ||
      reason === 'snow' ||
      reason === 'glare' ||
      reason === 'lure' ||
      reason === 'magnet' ||
      outcome.soft === true ||
      iceStation;
    this.events.post({ type: 'fail', reason, soft });
    // v1.7: out of time, the volcano sneezes ("はっくしょーん！") and the steam wraps the train. v1.10 (3-3): how it looks
    // follows the countdown's picture (the moon comes up over the sea).
    if (reason === 'timeUp') {
      const icon = this.countdown?.def.icon ?? 'volcano';
      this.events.post({ type: 'timeUp', icon });
      if (icon === 'volcano') this.events.post({ type: 'sneeze' });
    }
    if (!calm) this.ports.cameraFx(scary ? 1 : soft ? 0.3 : 0.5, soft ? 0 : 1);
    const key: DefaultLine = outcome.line ?? (iceStation ? 'iceOvershoot' : undefined) ?? FAIL_LINES[reason] ?? (reason as DefaultLine);
    for (const line of (outcome.text ?? this.lines[key] ?? DEFAULT_LINES[key]).split('\n')) await this.ports.say(line, 'partner');
    // An animal with its own "after" line says only that one (below).
    if (reason === 'cat' && !outcome.after) await this.ports.say(this.lines.catDangerAfter ?? DEFAULT_LINES.catDangerAfter, 'partner');
    if (reason === 'dino') await this.ports.say(this.lines.dangerAfter ?? DEFAULT_LINES.dangerAfter, 'partner');
    if (reason === 'fragile') await this.ports.say(this.lines.fragileBoingAfter ?? DEFAULT_LINES.fragileBoingAfter, 'partner');
    if (reason === 'dive') await this.ports.say(this.lines.diveBoingAfter ?? DEFAULT_LINES.diveBoingAfter, 'partner');
    if (reason === 'floater') await this.ports.say(this.lines.floatHitAfter ?? DEFAULT_LINES.floatHitAfter, 'partner');
    if (reason === 'plow') await this.ports.say(this.lines.plowBumpAfter ?? DEFAULT_LINES.plowBumpAfter, 'partner');
    if (reason === 'glare') await this.ports.say(this.lines.glareBumpAfter ?? DEFAULT_LINES.glareBumpAfter, 'partner');
    if (reason === 'lure') await this.ports.say(this.lines.lureBumpAfter ?? DEFAULT_LINES.lureBumpAfter, 'partner');
    if (reason === 'magnet') await this.ports.say(this.lines.magnetBumpAfter ?? DEFAULT_LINES.magnetBumpAfter, 'partner');
    if (reason === 'snow') {
      // v1.10 (4-3): the catch that tires the wave out says so ("もこもこ、つかれてきた みたい").
      const tired = (this.chase?.catches ?? 0) + 1 >= SNOW_WAVE.giveUpAfter;
      const after: DefaultLine = tired ? 'chaseTired' : 'chaseCaughtAfter';
      await this.ports.say(this.lines[after] ?? DEFAULT_LINES[after], 'partner');
    }
    if (iceStation) await this.ports.say(this.lines.iceOvershootAfter ?? DEFAULT_LINES.iceOvershootAfter, 'partner');
    if (reason === 'crack') {
      const after: DefaultLine = outcome.line === 'crackEmpty' ? 'crackEmptyAfter' : 'crackAfter';
      await this.ports.say(this.lines[after] ?? DEFAULT_LINES[after], 'partner');
    }
    if (reason === 'slip') {
      // After an empty gauge: the mission's advice for that ("save them for the slope"); else "press when it glows".
      const after: DefaultLine = outcome.line === 'slipEmpty' ? 'slipEmptyAfter' : 'slipAfter';
      await this.ports.say(this.lines[after] ?? DEFAULT_LINES[after], 'partner');
    }
    if (outcome.after) await this.ports.say(outcome.after, 'partner');
    await this.ports.fade(true, 0.4);
    // Rewind to a bit before whatever we failed at (the station, a cat or dinosaur, a gap, a junction).
    const target = outcome.rewind ?? { railId: station.railId, at: station.at - REWIND_DISTANCE };
    this.train.rewindTo(target.at, target.railId);
    // v1.7: full flames again; the countdown goes back with the train (or starts over, with more time).
    this.rocket?.refill();
    this.rocket?.reset();
    this.slopes?.reset();
    this.ice?.reset();
    this.thinIce?.reset();
    this.mirrors?.reset();
    this.mirrorNearSaid.clear();
    this.rearm = true;
    this.slopeGlows.clear();
    this.zoneLines.clear();
    const c = this.countdown;
    if (c?.active) {
      if (reason === 'timeUp') c.restartAfterTimeUp();
      else c.restoreAt(target);
      this.events.post({ type: 'countdown', state: 'run' });
    }
    // v1.11 (6-1): Sakasa is put back before the train (waiting again where she was in the story).
    if (this.lead && this.lead.phase !== 'gone') {
      this.lead.afterRewind();
      this.train.setSpeedCap('lead-learn', null);
    }
    // v1.10 (4-3): the snow wave waits behind the train put back (slower after a catch).
    if (this.chase?.active) {
      this.chase.afterRewind(reason === 'snow');
      this.chaseRocketSaid = false;
      this.events.post({ type: 'chase', state: 'run' });
    }
    this.tunnel?.reset();
    this.reverse?.reset();
    for (const cat of this.cats) cat.reset();
    for (const cat of this.cats) this.events.post({ type: 'actor:state', id: cat.actor.id, state: 'sleep', position: cat.actor.position });
    this.resetActors(target);
    for (const pad of this.pads) {
      pad.left = 0;
      pad.hinted = false;
      this.events.post({ type: 'pad', index: pad.index, visible: false });
    }
    this.ports.whistleHint(false);
    this.floaterLines.clear();
    this.inCurrent = -1;
    this.gapHints.clear();
    this.signLines.clear();
    this.revealed.clear();
    this.nightTry.clear();
    this.magnetLines.clear();
    this.magnetWaiting.clear();
    this.events.post({ type: 'rewind', boarded: Object.fromEntries(this.boarded) });
    this.ports.resetLever();
    this.ports.autoCamera(null);
    await this.ports.wait(0.3);
    await this.ports.fade(false, 0.4);
  }

  private async doors(step: MissionStep, station: StationDef): Promise<void> {
    this.phase = 'doors';
    this.doorsOpen = false;
    this.train.lockInput('doors');
    // Nothing moves until the door button is tapped: ask for it, and keep asking.
    const ask = this.lines.doorAsk ?? DEFAULT_LINES.doorAsk;
    let pressed = false;
    const press = new Promise<void>((resolve) =>
      this.ports.showDoorButton(() => {
        pressed = true;
        resolve();
      }),
    );
    this.ports.sayAsync(ask);
    void (async () => {
      while (!pressed) {
        await this.ports.wait(DOOR_REMIND_SECONDS);
        if (!pressed) this.ports.sayAsync(ask);
      }
    })();
    await press;
    this.ports.hush();
    this.doorsOpen = true;
    this.ports.hideDoorButton();
    this.ports.autoCamera('side');
    this.events.post({ type: 'door', open: true, stationId: station.id });
    if (this.lines.doorOpen) this.ports.sayAsync(this.lines.doorOpen);
    await this.ports.wait(0.6);

    const alight = Math.min(step.alight ?? 0, this.passengers);
    const board = step.board ?? 0;
    this.events.post({ type: 'passengers', stationId: station.id, board, alight });
    if (board > 0) this.boarded.set(station.id, (this.boarded.get(station.id) ?? 0) + board);
    if (step.say) {
      this.ports.sayAsync(step.say, 'passenger');
      if (step.reply) this.ports.sayAsync(step.reply, 'partner');
    }
    for (let i = 0; i < alight; i++) {
      await this.ports.wait(PASSENGER_SECONDS);
      this.passengers -= 1;
      this.ports.setCargo(this.passengers, this.parcel);
    }
    for (let i = 0; i < board; i++) {
      await this.ports.wait(PASSENGER_SECONDS);
      this.passengers += 1;
      this.ports.setCargo(this.passengers, this.parcel);
    }
    if (step.parcel) {
      await this.ports.wait(PASSENGER_SECONDS);
      this.parcel = step.parcel === 'load';
      this.ports.setCargo(this.passengers, this.parcel);
    }

    await this.ports.wait(0.8);
    this.events.post({ type: 'door', open: false, stationId: station.id });
    if (this.lines.doorClosed) this.ports.sayAsync(this.lines.doorClosed);
    await this.ports.wait(0.4);
    this.ports.autoCamera(null);
    this.doorsOpen = false;
    // Stay put until the next drive() unlocks: a train rolling between missions has no one watching it.
    this.phase = 'stopped';
    this.train.lockInput('stopped');
  }

  // ---- v1.11 (6-1) おいかけっこ (steps[].lead) and ドアを あけて まつ (steps[].welcome) ----

  /** A lead or welcome line: the mission's own, else the default (one per "\n"). */
  private leadLines(key: LeadLine | WelcomeLine): string[] {
    return (this.lines[key] ?? DEFAULT_LINES[key]).split('\n');
  }

  /**
   * v1.11 (6-1): the lead of this step, each driving frame: its outcomes (lines, events, the learn cutscene), the train
   * braked to a stop for "ぎゃくだ！", and the step's station closed until Sakasa stopped before the train (then opened
   * when the train can still stop there: `openMargin` m or more before its stop zone, or standing on its stop line).
   */
  private updateLead(dt: number): boolean {
    const lead = this.lead;
    if (!lead || lead.phase === 'gone') return false;
    for (const o of lead.update(dt)) this.onLeadOutcome(o);
    this.train.setSpeedCap('lead-learn', lead.holdTrain ? { max: 0 } : null);
    const stop = this.stop;
    if (!stop || !lead.stationClosed) return false;
    if (lead.stationOpenWanted && this.canOpenStation(stop)) {
      lead.opened();
      stop.hold(false);
      this.events.post({ type: 'station:open', stationId: stop.station.id });
      return false;
    }
    stop.hold(true);
    // Standing at the closed station while she runs ahead (not the stop for "ぎゃくだ！"): "えきは あとで！ サカサを
    // おいかけよう" (once a lap).
    const st = stop.station;
    const chasing = lead.phase === 'tease' || lead.phase === 'dash' || lead.phase === 'follow';
    if (this.phase !== 'driving' || !chasing || this.train.state.railId !== st.railId) return false;
    const offset = this.train.offsetTo(st.at);
    if (Math.abs(offset) > 100) this.stationClosedSaid = false;
    else if (!this.stationClosedSaid && Math.abs(this.train.state.speed) < 0.05 && offset <= stop.rule.zone && offset >= -40) {
      this.stationClosedSaid = true;
      this.ports.sayNow(this.leadLines('stationClosed')[0]);
    }
    return false;
  }

  /** v1.11 (6-1): the closed station can open now (the train can still stop there, or stands at it, not past it). */
  private canOpenStation(stop: StopMonitor): boolean {
    const st = stop.station;
    if (this.train.state.railId !== st.railId) return false;
    const offset = this.train.offsetTo(st.at);
    if (offset > stop.rule.zone + LEAD.openMargin) return true;
    // Standing on its line (the stop counts at once), or short of it in its zone ("もうちょっと まえ！", then on to it).
    return Math.abs(this.train.state.speed) < 0.05 && offset >= -stop.rule.ok && offset <= stop.rule.zone + LEAD.openMargin;
  }

  /** v1.11 (6-1): what the lead did: its lines (Sakasa's own "さようなら〜！"), its events, the learn cutscene. */
  private onLeadOutcome(o: LeadOutcome): void {
    const lead = this.lead;
    if (!lead) return;
    const id = lead.def.id;
    switch (o.kind) {
      case 'start':
        this.events.post({ type: 'lead:start', id });
        for (const line of this.leadLines('leadStart')) this.ports.sayAsync(line, 'amanojaku');
        for (const line of this.leadLines('leadStartReply')) this.ports.sayAsync(line);
        if (lead.def.music) this.ports.music(lead.def.music);
        break;
      case 'prompt':
        this.ports.sayNow(this.leadLines('leadPrompt')[0]);
        break;
      case 'call':
        // "とまって〜！" with an open hand, the moment the whistle sounds (the partner's own call too: its whistle plays).
        this.events.post({ type: 'lead:call', id, n: o.n, auto: o.auto });
        this.ports.sayNow(this.leadLines(o.auto ? 'leadAutoCall' : 'leadCall')[0], 'hand-stop');
        break;
      case 'run':
        for (const line of this.leadLines(o.last ? 'leadFlip' : 'leadRun')) this.ports.sayAsync(line);
        if (o.last) this.events.post({ type: 'partner:emote', kind: 'jump' });
        break;
      case 'again':
        this.ports.sayAsync(this.leadLines('leadAgain')[0]);
        break;
      case 'learn':
        // Stood still: the lever back to "とまる" (nothing rolls in the cutscene), then "ぎゃくだ… にげる なら…".
        this.events.post({ type: 'lead:learn', id });
        this.train.setNotch(STOP_NOTCH);
        this.ports.resetLever();
        void this.runLeadLearn(lead);
        break;
      case 'remind':
        this.ports.sayNow(this.leadLines('leadBackRemind')[0]);
        break;
      case 'follow': {
        this.events.post({ type: 'lead:follow', id, auto: o.auto });
        const lines = this.leadLines(o.auto ? 'leadAutoFollow' : 'leadFollow');
        this.ports.sayNow(lines[0]);
        for (const line of lines.slice(1)) this.ports.sayAsync(line);
        this.events.post({ type: 'partner:emote', kind: o.auto ? 'tilt' : 'cheer' });
        break;
      }
      case 'met':
        this.events.post({ type: 'lead:met', id, auto: o.auto });
        // Back to "まえ" (the switch glows): said only when the train came back reversing.
        if (!o.auto) this.ports.sayAsync(this.leadLines('leadMet')[0]);
        if (lead.def.music) this.ports.music(null);
        break;
      case 'gone':
        this.events.post({ type: 'lead:gone', id });
        this.ports.sayAsync(this.leadLines('leadGone')[0]);
        this.spawnLeadHome(lead.def);
        break;
    }
  }

  /** v1.11 (6-1): the lead's `learn` cutscene (standing), then Sakasa waits for the train to back up. */
  private async runLeadLearn(lead: LeadRunner): Promise<void> {
    if (lead.def.learn) await this.playInlineCutscene(lead.def.learn);
    this.train.setSpeedCap('lead-learn', null);
    if (this.lead === lead) lead.learned();
  }

  /**
   * v1.11 (6-1, 第 7 部 §4.2): a cutscene in the middle of a step's drive (the train standing): the controls locked, the
   * cutscene's own cameras, then back to driving the same step. Its `unlock` is saved at once (runner.grant).
   */
  async playInlineCutscene(name: string): Promise<void> {
    if (this.phase !== 'driving') return;
    this.inlineCutscene = name;
    this.ports.hush();
    this.ports.whistleHint(false);
    this.ports.gauge({ ...(this.stop?.gauge ?? { offset: 0, range: 1, ok: 1, perfect: 1, tooFast: false }), visible: false });
    await this.cutscene(name);
    this.inlineCutscene = '';
    this.phase = 'driving';
    this.train.unlockInput();
  }

  /** v1.11 (6-1): the step is over: Sakasa goes home if she has not (before any cutscene), the song comes back. */
  private endLead(): void {
    const lead = this.lead;
    if (!lead) return;
    this.train.setSpeedCap('lead-learn', null);
    const running = lead.phase !== 'armed' && lead.phase !== 'met' && lead.phase !== 'gone';
    const out = lead.phase !== 'armed';
    const met = lead.phase === 'met';
    if (lead.finish() && out) {
      this.events.post({ type: 'lead:gone', id: lead.def.id });
      // The train stopped at the station before passing her: she goes home now, and Piko says so after the grade.
      if (met) this.ports.sayAsync(this.leadLines('leadGone')[0]);
      this.spawnLeadHome(lead.def);
    }
    if (running && lead.def.music) this.ports.music(null);
  }

  /** v1.11 (6-1): the lead at its `home` (sat on the bench), a figure cutscenes and a welcome know by its id. */
  private spawnLeadHome(def: LeadDef): void {
    const h = def.home;
    if (!h) return;
    const lateral = h.lateral ?? 0;
    const t = resolvePlacement(
      { onRail: { railId: h.railId, at: h.at, lateral, heightFromRail: h.heightFromRail ?? 0 }, rotationY: h.rotationY ?? (lateral < 0 ? -90 : 90) },
      this.stage.network,
      this.groundY,
    );
    this.events.post({ type: 'actor:spawn', id: def.id, model: h.model ?? 'amanojaku-sit', position: t.position, quaternion: t.quaternion });
  }

  /** v1.11 (6-1): a point on the platform `lateral` m right of `at` on `railId` (a station's platform height). */
  private platformPoint(railId: string, at: number, lateral: number): Vector3 {
    const frame = this.stage.network.getRail(railId).frameAt(at);
    return frame.position.clone().addScaledVector(frame.right, lateral).addScaledVector(frame.up, WELCOME.platformHeight);
  }

  /** v1.11 (6-1): the guest's look along the platform (towards the train when `lateral` is its side). */
  private guestQuaternion(railId: string, at: number, lateral: number): Quaternion {
    return resolvePlacement({ onRail: { railId, at, lateral, heightFromRail: 0 }, rotationY: lateral < 0 ? -90 : 90 }, this.stage.network, null).quaternion;
  }

  private resolveBoarded: (() => void) | null = null;

  /**
   * v1.11 (6-1, 第 7 部 §4.3): "ドアを あけて まつ" instead of the usual doors: the door button (its own line, no "のって
   * のって！"), then the doors stay open while the guest comes aboard by herself; the song softer, the whistle marked
   * "しーっ", no button glowing. One more rider; the doors close WELCOME.closeAfter s after she is in.
   */
  private async welcomeDoors(step: MissionStep, station: StationDef): Promise<void> {
    const def = step.welcome;
    if (!def) return;
    this.phase = 'doors';
    this.doorsOpen = false;
    this.train.lockInput('doors');
    this.ports.whistleHint(false);
    const w = new Welcome(def, station, (r, a, l) => this.platformPoint(r, a, l));
    this.welcome = w;
    this.welcomeCalmSaid = false;
    this.events.post({ type: 'welcome:beat', beat: 'ask' });
    // She sits on her bench (brought on there if a skipped cutscene or a resume left her out).
    if (!this.figures.has(def.actor)) {
      const q = this.guestQuaternion(def.seat.railId, def.seat.at, def.seat.lateral);
      this.events.post({ type: 'actor:spawn', id: def.actor, model: 'amanojaku-sit', position: w.seat, quaternion: q });
    }
    const ask = this.leadLines('welcomeAsk')[0];
    let pressed = false;
    const press = new Promise<void>((resolve) =>
      this.ports.showDoorButton(() => {
        pressed = true;
        resolve();
      }),
    );
    this.ports.sayAsync(ask);
    void (async () => {
      while (!pressed) {
        await this.ports.wait(DOOR_REMIND_SECONDS);
        if (!pressed) this.ports.sayAsync(ask);
      }
    })();
    await press;
    this.ports.hush();
    this.doorsOpen = true;
    this.ports.hideDoorButton();
    if (def.camera) this.ports.fixedCamera(def.camera.at, def.camera.lookAt, def.camera.reach);
    else this.ports.autoCamera('side');
    this.events.post({ type: 'door', open: true, stationId: station.id });
    this.ports.musicGain(w.musicGain, 0.8);
    const boarded = new Promise<void>((resolve) => {
      this.resolveBoarded = resolve;
    });
    for (const o of w.doorOpened()) this.onWelcomeOutcome(o);
    await boarded;
    this.resolveBoarded = null;
    this.passengers += 1;
    this.ports.setCargo(this.passengers, this.parcel);
    this.events.post({ type: 'partner:emote', kind: 'cheer' });
    await this.ports.wait(WELCOME.closeAfter);
    this.events.post({ type: 'door', open: false, stationId: station.id });
    this.ports.musicGain(1, 0.8);
    await this.ports.wait(0.4);
    this.ports.fixedCamera(null);
    this.ports.autoCamera(null);
    this.doorsOpen = false;
    this.phase = 'stopped';
    this.train.lockInput('stopped');
  }

  /** v1.11 (6-1): the guest's beats while the doors stand open. */
  private updateWelcome(dt: number): void {
    const w = this.welcome;
    if (!w || !this.doorsOpen) return;
    for (const o of w.update(dt)) this.onWelcomeOutcome(o);
  }

  /** v1.11 (6-1): the guest's model for a beat: sitting until she stands up, then with her lantern. */
  private guestModel(beat: string): string {
    const def = this.welcome?.def;
    if (beat === 'look' || beat === 'ask') return 'amanojaku-sit';
    return def?.model ?? 'amanojaku-lantern';
  }

  private onWelcomeOutcome(o: WelcomeOutcome): void {
    const w = this.welcome;
    if (!w) return;
    const def = w.def;
    if (o.kind === 'step') {
      this.events.post({ type: 'welcome:step' });
      return;
    }
    if (o.kind === 'board') {
      this.events.post({ type: 'actor:remove', id: def.actor });
      this.events.post({ type: 'welcome:board' });
      this.resolveBoarded?.();
      return;
    }
    this.events.post({ type: 'welcome:beat', beat: o.beat });
    const q = this.guestQuaternion(def.seat.railId, def.seat.at, def.seat.lateral);
    const model = this.guestModel(o.beat);
    if (this.figures.get(def.actor) !== model) this.events.post({ type: 'actor:spawn', id: def.actor, model, position: o.from, quaternion: q });
    // Standing up she takes her lantern off the bench.
    if (o.beat === 'stand' && def.pickup) this.events.post({ type: 'actor:remove', id: def.pickup });
    if (o.from.distanceTo(o.to) > 0.05) this.events.post({ type: 'actor:move', id: def.actor, position: o.to, seconds: o.seconds });
  }

  /** v1.11 (6-1): a whistle while the guest comes: she flinches one beat back ("ぴゃっ"), or only giggles. */
  private onWelcomeWhistle(): void {
    const w = this.welcome;
    if (!w || w.state === 'done') return;
    const r = w.onWhistle();
    const def = w.def;
    if (r.kind === 'flinch') {
      this.events.post({ type: 'welcome:flinch', n: r.n });
      const q = this.guestQuaternion(def.seat.railId, def.seat.at, def.seat.lateral);
      // Shy for a moment where the beat goes back to ("ぴょんと もどる"); the beat starting again puts her model back.
      this.events.post({ type: 'actor:spawn', id: def.actor, model: r.beat === 'look' ? 'amanojaku-sit' : 'amanojaku-shy', position: r.to, quaternion: q });
      this.ports.sayNow(this.leadLines(r.n === 1 ? 'welcomeFlinch' : 'welcomeFlinchAgain')[0]);
    } else if (r.kind === 'giggle') {
      this.events.post({ type: 'welcome:giggle', n: r.n });
      if (!this.welcomeCalmSaid) {
        this.welcomeCalmSaid = true;
        this.ports.sayNow(this.leadLines('welcomeCalm')[0]);
      }
    } else if (r.kind === 'shy') this.events.post({ type: 'welcome:shy' });
  }

  // ---- v1.11 (6-1) test hooks and the view ----

  /** "" | armed | tease | dash | learn | backup | follow | met | gone. */
  /**
   * v1.11 (PR8a × 6-1): the lead follows a train backing up (and then stands before it, "met", until it goes forward)
   * and wants the child's own view kept (`followCamera`, default "front"): the rear window would not show her, she is
   * in front of the train.
   */
  get leadHoldsFront(): boolean {
    const phase = this.lead?.phase;
    return (phase === 'follow' || phase === 'met') && (this.lead?.def.followCamera ?? 'front') === 'front';
  }

  get leadPhase(): LeadPhase | '' {
    return this.lead?.phase ?? '';
  }

  get leadCalls(): number {
    return this.lead?.calls ?? 0;
  }

  get leadAutoCalls(): number {
    return this.lead?.autoCalls ?? 0;
  }

  /** Metres from the train front to Sakasa (rounded; 0 when she is not out). */
  get leadGap(): number {
    return this.lead?.active ? Math.round(this.lead.gap) : 0;
  }

  /** Metres backed up while she followed (rounded). */
  get leadBack(): number {
    return Math.round(this.lead?.reversedBy ?? 0);
  }

  /** Where Sakasa runs now (the view), or null. */
  get leadPose(): LeadPose | null {
    return this.lead?.pose ?? null;
  }

  /** The closed station's id, or "". */
  get closedStation(): string {
    return this.phase === 'driving' && this.lead && this.lead.stationClosed && this.lead.phase !== 'gone' ? (this.stop?.station.id ?? '') : '';
  }

  /** The forward/back switch glows (a hint: back up to have Sakasa follow; met while reversing: forward again). */
  get switchGlow(): boolean {
    return this.phase === 'driving' && (this.lead?.switchGlow ?? false);
  }

  /** "" | ask | look | stand | walk | peek | board | done. */
  get welcomeState(): WelcomeState | '' {
    return this.welcome?.state ?? '';
  }

  get welcomeFlinches(): number {
    return this.welcome?.flinches ?? 0;
  }

  get welcomeGiggles(): number {
    return this.welcome?.giggles ?? 0;
  }

  /** The doors stand open for the guest (the whistle's "しーっ" mark). */
  get welcoming(): boolean {
    return this.phase === 'doors' && this.doorsOpen && this.welcome !== null && this.welcome.state !== 'done';
  }

  private async cutscene(id: string): Promise<void> {
    const steps = this.stage.file.cutscenes?.[id];
    if (!steps) throw new Error(`Unknown cutscene "${id}"`);
    const previous = this.phase;
    this.phase = 'cutscene';
    this.train.lockInput('cutscene');
    this.ports.autoCamera('chase');
    this.skip = new CutsceneSkip();
    // v1.10 (3-3): doors a cutscene opens close again when it ends.
    let doorOpen = false;
    const door = (open: boolean): void => {
      if (!this.lastStationId || open === doorOpen) return;
      doorOpen = open;
      this.events.post({ type: 'door', open, stationId: this.lastStationId });
    };
    await runCutscene(
      steps,
      this.stage.network,
      this.groundY,
      this.events,
      {
        ...this.ports,
        door,
        unlock: async (ability) => {
          this.grant(ability);
          await this.ports.unlock(ability);
        },
        learn: (ability) => {
          this.grant(ability);
          this.ports.learn(ability);
        },
      },
      this.skip,
    );
    this.skip = null;
    door(false);
    // v1.12: a shot, the letterbox and a drive end with their cutscene.
    void this.ports.shot(null);
    this.ports.letterbox(false);
    if (this.train.autoDriving) this.ports.drive(null);
    this.ports.autoCamera(null);
    this.ports.fixedCamera(null);
    this.phase = previous === 'driving' ? 'idle' : previous;
  }

  /** Applies at once what a cutscene leaves behind (a resume): see fastForwardCutscene. */
  private fastForward(id: string): void {
    const steps = this.stage.file.cutscenes?.[id];
    if (!steps) throw new Error(`Unknown cutscene "${id}"`);
    fastForwardCutscene(steps, this.stage.network, this.groundY, this.events, {
      learn: (ability) => {
        this.grant(ability);
        this.ports.learn(ability);
      },
    });
  }
}

type FailReason = Extract<StageEvent, { type: 'fail' }>['reason'];
/** Fail reasons whose line has another key. */
const FAIL_LINES: Partial<Record<FailReason, DefaultLine>> = {
  cat: 'catDanger',
  dino: 'dinoDanger',
  nut: 'nutHit',
  hopper: 'hopperFell',
  bridge: 'bridgeFell',
  fragile: 'fragileBoing',
  rock: 'rockHit',
  slip: 'slip',
  timeUp: 'timeUp',
  spur: 'spurBack',
  dive: 'diveBoing',
  floater: 'floatHit',
  crack: 'crackFall',
  plow: 'plowBump',
  snow: 'chaseCaught',
  glare: 'glareBump',
  lure: 'lureBump',
  magnet: 'magnetBump',
};
const BRIDGE_LINES: Record<NonNullable<BridgeOutcome>['kind'], DefaultLine> = {
  near: 'butterflyNear',
  follow: 'butterflyFollow',
  wait: 'butterflyWait',
  fast: 'butterflyFast',
  closed: 'budClosed',
  open: 'bridgeOpen',
};
interface FailOutcome {
  kind: 'fail';
  reason: FailReason;
  /** Say this instead of the reason's line. */
  line?: DefaultLine;
  /** Said after the reason's line (a rock's "hitAfter"; v1.10 an animal's own "after"). */
  after?: string;
  /** Say this text instead of the reason's line: v1.10 (3-3) an animal's own "danger", (4-2) a gap's own `line`. */
  text?: string;
  /** Where to put the train front back; default: REWIND_DISTANCE before the station. */
  rewind?: { railId: string; at: number };
  /** v1.10 (4-3): a soft fail whatever its reason (a snowman on the rail): a small dip, no shake. */
  soft?: boolean;
}
type DriveOutcome = { kind: 'stopped'; grade: StopGrade } | FailOutcome;
