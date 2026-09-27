import type { AudioEngine } from './audio';

/** One sound effect as the sounds page (sounds.html) lists it: its id, a label for だいさん, and how to play it. */
export interface SoundEntry {
  id: string;
  label: string;
  group: string;
  play: (audio: AudioEngine) => void;
}

/** Every one-shot sound effect in the game, grouped the way they are heard. */
export const SOUNDS: SoundEntry[] = [
  { group: 'でんしゃ', id: 'whistle', label: 'きてき', play: (a) => a.playWhistle() },
  { group: 'でんしゃ', id: 'release', label: 'ぷしゅー（とまったあと）', play: (a) => a.playRelease() },
  { group: 'でんしゃ', id: 'door-open', label: 'ドア あく', play: (a) => a.playDoor(true) },
  { group: 'でんしゃ', id: 'door-close', label: 'ドア しまる', play: (a) => a.playDoor(false) },
  { group: 'でんしゃ', id: 'squeal', label: 'きゅうブレーキ', play: (a) => a.playSqueal() },
  { group: 'でんしゃ', id: 'light-on', label: 'ライト つける', play: (a) => a.playLight(true) },
  { group: 'でんしゃ', id: 'light-off', label: 'ライト けす', play: (a) => a.playLight(false) },
  { group: 'ジャンプ', id: 'jump', label: 'ジャンプ', play: (a) => a.playJump() },
  { group: 'ジャンプ', id: 'land', label: 'ちゃくち', play: (a) => a.playLand() },
  { group: 'ジャンプ', id: 'fall', label: 'おちる（ひゅ〜 ぽよん）', play: (a) => a.playFall() },
  { group: 'ジャンプ', id: 'hopper-board', label: 'バッタが のる', play: (a) => a.playHopperBoard() },
  { group: 'ジャンプ', id: 'hopper-jump', label: 'バッタ ジャンプ', play: (a) => a.playHopperJump() },
  { group: 'ロケット・さか', id: 'rocket', label: 'ロケット', play: (a) => a.playRocket() },
  { group: 'ロケット・さか', id: 'puff', label: 'ロケット おわり', play: (a) => a.playPuff() },
  { group: 'ロケット・さか', id: 'slip', label: 'ずるずる', play: (a) => a.playSlip() },
  { group: 'しま', id: 'bloom', label: 'はなが ひらく', play: (a) => a.playBloom() },
  { group: 'しま', id: 'butterfly', label: 'ちょうちょ', play: (a) => a.playButterfly() },
  { group: 'しま', id: 'silk-shake', label: 'いとが ゆれる', play: (a) => a.playSilkShake() },
  { group: 'しま', id: 'sneeze', label: 'かざんの くしゃみ', play: (a) => a.playSneeze() },
  { group: 'しま', id: 'volcano-puff', label: 'かざんの けむり', play: (a) => a.playVolcanoPuff() },
  { group: 'しま', id: 'rock-wobble', label: 'いわ ぐらぐら', play: (a) => a.playRockWobble() },
  { group: 'しま', id: 'rock-roll', label: 'いわ ごろごろ', play: (a) => a.playRockRoll(2) },
  { group: 'しま', id: 'rock-bonk', label: 'いわに ぶつかる', play: (a) => a.playRockBonk() },
  { group: 'しま', id: 'splash', label: 'ぽちゃん', play: (a) => a.playSplash() },
  { group: 'しま', id: 'bridge-fall', label: 'はしが おちる', play: (a) => a.playBridgeFall() },
  { group: 'しま', id: 'flap', label: 'とりが とぶ', play: (a) => a.playFlap() },
  { group: 'こおり', id: 'ice-crack', label: 'うすい こおり（ぴしぴし）', play: (a) => a.playIceCrack() },
  { group: 'こおり', id: 'ice-splash', label: 'こおりから ぽちゃん', play: (a) => a.playIceSplash() },
  { group: 'こおり', id: 'mirror', label: 'かがみ（きらーん）', play: (a) => a.playMirror() },
  { group: 'ゆき', id: 'plow', label: 'ゆきかき（ざざーっ）', play: (a) => a.playPlow() },
  { group: 'ゆき', id: 'plow-bump', label: 'ゆきに ぽすっ', play: (a) => a.playPlowBump() },
  { group: 'ゆき', id: 'snow-wave', label: 'ゆきの なみ（もこもこ）', play: (a) => a.playSnowWave() },
  { group: 'ゆき', id: 'snow-catch', label: 'つかまった（もふっ）', play: (a) => a.playSnowCatch() },
  { group: 'おしらせ', id: 'card', label: 'カード', play: (a) => a.playCard() },
  { group: 'おしらせ', id: 'stop-perfect', label: 'ぴったり', play: (a) => a.playStop('perfect') },
  { group: 'おしらせ', id: 'stop-ok', label: 'とまった', play: (a) => a.playStop('ok') },
  { group: 'おしらせ', id: 'boing', label: 'しっぱい（ぼよん）', play: (a) => a.playBoing() },
  { group: 'おしらせ', id: 'record', label: 'きろく みつけた', play: (a) => a.playRecord() },
  { group: 'おしらせ', id: 'fanfare', label: 'クリア', play: (a) => a.playFanfare() },
];
