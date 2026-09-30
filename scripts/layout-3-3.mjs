#!/usr/bin/env node
/**
 * Stage 3-3 "ほしのうみ": builds src/stages/3-3.json from docs/PHASE8_CHAPTER3_4.md 第 5 部 (§5–§13), read with the
 * rules of §0.2 (a press on a stretch on the water surface dives; floaters are dived under; the red ring takes a
 * diving train down; a surface stretch running on under water is the way into a long dive). What changed from the
 * design's tables is listed in its 実装メモ (§19): the pier dips into the sea from a short floating stretch, the ring
 * sits on floating track, the festival rafts float over the track (dived under), さんばしえき is at 980.
 *
 *   node scripts/layout-3-3.mjs         write src/stages/3-3.json and print the checks
 *   node scripts/layout-3-3.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, keyed, Line, mulberry32, pretty, RAD, round, walk, waterSpans } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/3-3.json');
const DRY = process.argv.includes('--dry');

// Levels (§5.1).
const SEA_Y = 0;
const FLOOR = -30;
const PIER = 5;
const FLOAT = 0.4;
const SHELF = -9;
const LEDGE = -10;
const TRENCH = -26;
const SHALLOW = -12;
const WALL = 3;

/** §5.2 `main`: straights and arcs, 3,230 m. */
const MAIN_SEGMENTS = [
  ['S', 360],
  ['L', 200, 30],
  ['S', 360],
  ['L', 200, 45],
  ['S', 300],
  ['L', 250, 45],
  ['S', 300],
  ['L', 200, 30],
  ['S', 250],
  ['L', 200, 30],
  ['S', 60],
  ['R', 150, 50],
  ['L', 150, 50],
  ['S', 670.6],
];

/**
 * `main` heights (s, y). M1: the pier (5) goes down to a floating stretch (380–440) and on into the sea (the turtle's
 * shelf, −9), back up to the pier (690). M2: floating track at the ring (1085–1150), down to the ledge (−10) and the
 * trench (−26). M3: up the underwater slope (2010–2080) to the shallows (−12), up to the breakwater (3), the festival
 * rafts float over floating track (2950–3060), and back up to the breakwater.
 */
const MAIN_KEYS = [
  [0, PIER],
  [350, PIER],
  [380, FLOAT],
  [440, FLOAT],
  [490, SHELF],
  [620, SHELF],
  [690, PIER],
  [1055, PIER],
  [1085, FLOAT],
  [1150, FLOAT],
  [1230, LEDGE],
  [1350, LEDGE],
  [1450, TRENCH],
  [2010, TRENCH],
  [2080, SHALLOW],
  [2600, SHALLOW],
  [2670, WALL],
  [2925, WALL],
  [2950, FLOAT],
  [3060, FLOAT],
  [3085, WALL],
];

const main = new Line('main', walk(0, 0, 0, MAIN_SEGMENTS, keyed(MAIN_KEYS)));

/** §5.3 loops: U-turn R25 to `side`, `back` m back, U-turn onto the main line `back` m before the fork. Level. */
const LOOPS = {
  wa: { at: 1150, side: 'R', back: 60, y: FLOAT },
  uso: { at: 1560, side: 'L', back: 60, y: TRENCH },
};
const loops = {};
for (const [id, l] of Object.entries(LOOPS)) {
  const p = main.at(l.at);
  loops[id] = new Line(id, walk(p.x, p.z, p.h / RAD, [[l.side, 25, 180], ['S', l.back], [l.side, 25, 180]], () => l.y));
}
const LINES = { main, ...loops };
const WATERS = [{ y: SEA_Y, floor: FLOOR, look: 'sea', under: { color: '#27477c', far: 60, sparkle: '#9fe8ff' } }];

// ---------------------------------------------------------------------------------------------------------------
// Checks (§5.6)
// ---------------------------------------------------------------------------------------------------------------

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};
check(Math.abs(main.length - 3230) < 1.5, `main length ${main.length.toFixed(1)} (table 3,230.0)`);
for (const [id, l] of Object.entries(LOOPS)) {
  const line = loops[id];
  const end = line.at(line.length);
  const target = main.at(l.at - l.back);
  const off = Math.hypot(end.x - target.x, end.z - target.z, end.y - target.y);
  check(off < 0.3, `${id}: ${line.length.toFixed(1)} m, merges on main ${l.at - l.back} ${off.toFixed(2)} m off`);
}
{
  const { total, worst } = gameCurveCheck(main, [45, 150, 540, 980, 1090, 1150, 1500, 1560, 1930, 2200, 2710, 2985, 3035, 3180]);
  check(Math.abs(total - main.length) < 0.6 && worst.d < 0.3, `main as the game's curve: ${total.toFixed(2)} m, key places at most ${worst.d.toFixed(2)} m off (main ${worst.s})`);
}
const SPANS = Object.fromEntries(Object.entries(LINES).map(([id, l]) => [id, waterSpans(l, WATERS)]));
const fmt = (sp) => sp.map((x) => `${x.from}–${x.to}`).join(', ');
for (const [id, sp] of Object.entries(SPANS)) report.push(`${id}: surface ${fmt(sp.surfaces) || '—'}; under water ${fmt(sp.dives) || '—'}`);
const GAPS = [
  { from: 230, to: 240, hint: 'normal', pit: false, rewind: { railId: 'main', at: 170 } },
  { from: 770, to: 788, hint: 'fast', pit: false, rewind: { railId: 'main', at: 700 } },
  { from: 2790, to: 2806, hint: 'normal', pit: false, rewind: { railId: 'main', at: 2710 } },
];
{
  const all = [...SPANS.main.surfaces, ...SPANS.main.dives];
  for (const g of GAPS) {
    const clash = all.find((sp) => g.to >= sp.from - 120 && g.from <= sp.to + 40);
    check(!clash, `gap ${g.from}–${g.to} keeps 120 m before and 40 m after water${clash ? ` (water ${clash.from}–${clash.to})` : ''}`);
  }
  for (const d of SPANS.main.dives) {
    let low = Infinity;
    for (let s = d.from; s <= d.to; s++) low = Math.min(low, main.at(s).y);
    check(-low >= 4.5, `main under water ${d.from}–${d.to}: ${(-low).toFixed(1)} m deep`);
  }
}
const STATIONS = [
  { id: 'misaki', name: 'みさきえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'sanbashi', name: 'さんばしえき', railId: 'main', at: 980, platformSide: 'left' },
  { id: 'hoshizoko', name: 'ほしぞこえき', railId: 'main', at: 1930, platformSide: 'right' },
  { id: 'teibou', name: 'ていぼうえき', railId: 'main', at: 2710, platformSide: 'right' },
  { id: 'toudai', name: 'とうだいえき', railId: 'main', at: 3180, platformSide: 'left' },
];

// ---------------------------------------------------------------------------------------------------------------
// Gimmicks, actors, records, missions (§4, §7, §9, §13)
// ---------------------------------------------------------------------------------------------------------------

const FLOATERS = [
  { id: 'matsuri-1', railId: 'main', at: 2985, look: 'raft', length: 8, rewind: 2905, say: 'おまつりの いかだ！ もぐって くぐろう' },
  { id: 'matsuri-2', railId: 'main', at: 3035, look: 'raft', length: 8, rewind: 2955, say: 'もう ひとつ！ もぐる！' },
];

const FOG = { near: 2, far: 22, lightFar: 70, color: '#16305e', glow: true };
const GIMMICKS = [
  { type: 'sound', railId: 'main', from: 110, to: 360, params: { surface: 'wood' } },
  { type: 'sound', railId: 'main', from: 690, to: 1060, params: { surface: 'wood' } },
  { type: 'fog', railId: 'main', from: 1340, to: 1780, params: FOG },
  { type: 'fog', railId: 'uso', from: 0, to: Math.floor(loops.uso.length), params: FOG },
  { type: 'slope', railId: 'main', from: 2010, to: 2080, params: { pull: -6, rewind: { railId: 'main', at: 1950 }, line: 'うみの なかの さか！ ロケット！' } },
  { type: 'updraft', railId: 'main', from: 2240, to: 2540, params: { speed: 20, look: 'current', whale: 'kujira' } },
  { type: 'camera', railId: 'main', from: 420, to: 500, params: { mode: 'chase' } },
  { type: 'camera', railId: 'main', from: 630, to: 700, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 1140, to: 1240, params: { mode: 'chase' } },
  { type: 'camera', railId: 'wa', from: 10, to: round(loops.wa.length - 10), params: { mode: 'top' } },
  { type: 'camera', railId: 'uso', from: 10, to: round(loops.uso.length - 10), params: { mode: 'top' } },
  { type: 'camera', railId: 'main', from: 2000, to: 2090, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 2250, to: 2330, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 2590, to: 2680, params: { mode: 'chase' } },
  { type: 'camera', railId: 'main', from: 2940, to: 3000, params: { mode: 'chase' } },
];
const at = (s, lateral = 0, up = 0) => {
  const q = main.point(s, lateral, up);
  return [round(q.x), round(q.y), round(q.z)];
};
GIMMICKS.push(
  { type: 'flock', params: { model: 'fish-a', count: 12, center: at(560, -12, -3), radius: 20, speed: 0.12 } },
  { type: 'flock', params: { model: 'fish-b', count: 12, center: at(2350, 25, 7), radius: 25, speed: -0.1 } },
  { type: 'flock', params: { model: 'lantern-jelly', count: 16, center: at(3000, -30, -13), radius: 30, speed: 0.03 } },
  { type: 'flock', params: { model: 'seabird', count: 8, center: [-40, 18, 200], radius: 50, speed: 0.08 } },
);

const ACTORS = [
  {
    id: 'umidori',
    type: 'cat',
    reactsTo: 'whistle',
    onRail: { railId: 'main', at: 150, heightFromRail: 0 },
    params: { look: 'seabird', wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2 },
  },
  {
    id: 'kame',
    type: 'cat',
    reactsTo: 'whistle',
    onRail: { railId: 'main', at: 560, heightFromRail: 0 },
    params: {
      look: 'turtle',
      wakeDistance: 60,
      dangerDistance: 8,
      fleeLateral: 12,
      fleeSeconds: 2,
      say: 'かめさんが ねてる！ きてき！',
      woke: 'およいで いった〜！',
      danger: 'わわっ、かめさん！',
      after: 'びっくりした〜 きてきで おこそう',
    },
  },
  { id: 'kujira', type: 'whale', reactsTo: 'whistle', onRail: { railId: 'main', at: 2200, lateral: -16, heightFromRail: 5 }, params: { until: 2560 } },
];

const RECORDS = [
  {
    id: 'sunset-starfish',
    name: 'ゆうやけ ひとで',
    note: 'さんばしの はしらで ゆうやけ いろ',
    requires: null,
    model: 'starfish',
    onRail: { railId: 'main', at: 860, lateral: -2.6, heightFromRail: -0.3 },
  },
  {
    id: 'star-sand',
    name: 'ほしの すな',
    note: 'くらい うみの そこで、ほしの かたち',
    requires: 'light',
    model: 'star-sand',
    hint: 'いわの うえで なにか きらっ！',
    onRail: { railId: 'main', at: 1700, lateral: -7, heightFromRail: 1.5 },
  },
  {
    id: 'festival-bell',
    name: 'まつりの すず',
    note: 'すきまで ちりん… ひっぱれたら？',
    requires: 'magnetLight',
    model: 'festival-bell',
    onRail: { railId: 'main', at: 1440, lateral: 11, heightFromRail: 1 },
  },
];

const MISSIONS = [
  {
    id: 'm1',
    type: 'deliver',
    title: 'ジャンプと もぐる',
    steps: [{ stationId: 'sanbashi', board: 2, say: 'ほしまつりに いくの！', reply: 'いっしょに いこう！' }],
    lines: {
      start: 'みさきから さんばしを いくよ！\nさんばしえきまで いこう！',
      moving: 'そうそう、その ちょうし！',
      catNear: 'うみどりが せんろに いる！ きてき！',
      catWoke: 'とんでった！ ありがとう〜',
      gapNear: 'こわれてる！ {speed} で とぼう',
      diveNear: 'もぐるが ひかった！',
      diveReady: 'いまだ！ もぐる！',
      diveGo: 'ぶくぶく… あわの ドーム！',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'さんばしえきだ。ゆっくり！',
      complete: 'ジャンプも もぐるも ばっちり！',
    },
    hints: [{ railId: 'main', at: 676, text: 'ぷはっ！ つぎは ジャンプだよ' }],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'ほしの みぞ',
    steps: [{ stationId: 'hoshizoko', board: 1, say: 'とうだいまで のせて〜！', reply: 'どうぞ！ のって のって！' }],
    lines: {
      start: 'ほしの みぞへ しゅっぱつ！\nわっかで もぐって いこう！',
      signNear: 'ひょうしきだ… よく みてね',
      signRevealed: 'ぐるぐる もよう！ サカサの いたずらだ',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'ほしぞこえきだ。ゆっくり！',
      complete: 'ほしの みぞ、きれい だったね！',
    },
    hints: [
      { railId: 'main', at: 1075, text: 'あかい わっか！ もぐるを おして！' },
      { railId: 'wa', at: 20, text: 'あれれ、とおりすぎちゃった' },
      { railId: 'wa', at: 170, text: 'もういちど、わっかで もぐろう！' },
      { railId: 'main', at: 1345, text: 'くらい… ライトを つけよう！' },
      { railId: 'main', at: 1385, text: 'わあ… ほしぞら みたい！' },
      { railId: 'main', at: 1420, text: 'かべの すきまで なにか ちりん…' },
      { railId: 'uso', at: 20, text: 'あれれ？ ぐるっと まわってる…' },
      { railId: 'uso', at: 170, text: 'ライトで ひょうしきを みよう！' },
      { railId: 'main', at: 1790, text: 'ほしぞこえきが みえる！' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'ほしまつりに まにあえ',
    steps: [
      { stationId: 'teibou', board: 1, say: 'とうだいの ひを つけに いくの！', reply: 'まかせて！ いそごう！' },
      {
        stationId: 'toudai',
        alight: 4,
        countdown: { seconds: 75, assist: 10, assistMax: 30, icon: 'moon', music: 'hurry' },
        say: 'まにあった！ ありがとう！',
        reply: 'どういたしまして！',
      },
    ],
    lines: {
      start: 'ほしまつりは こんや！\nまずは ていぼうえきへ いこう！\nうみの さかは ロケット！',
      rocketReady: 'いまだ！ ロケット！',
      rocketGo: 'ぼこぼこ ぐいーん！',
      rocketAgain: 'おそく なってきた… もういっかい！',
      whaleNear: 'あっ、くじらさん！ また あえたね！',
      whaleCall: 'きてきで あいさつ しよう！',
      whaleSang: 'おへんじ してくれた！',
      currentIn: 'くじらさんの ながれだ！ のろう！',
      currentWait: 'くじらさんを よんでみよう！',
      timerStart: 'おつきさまが でたら おまつり！\nそれまでに とうだいへ いこう！',
      gapNear: 'ていぼうの すきま！ {speed} で とぼう',
      diveReady: 'いまだ！ もぐる！',
      timeLow: 'おつきさまが でてきそう！ いそげ〜',
      timeSafe: 'まにあった！ セーフ！',
      timeUp: 'あっ、おつきさまが でちゃった〜\n…もういっかい！ はやめに いこう',
      stationNear: '{station}だ。ゆっくり！',
      complete: 'ほしまつりに まにあった〜！',
    },
    hints: [
      { railId: 'main', at: 2400, text: 'ほしまつりへ びゅーん！' },
      { railId: 'main', at: 2990, text: 'したから みると ちょうちんが きれい' },
    ],
  },
];

const JUNCTIONS = [
  { id: 'ring', railId: 'main', at: 1150, left: 'main', right: 'wa', default: 'right', dive: true },
  { id: 'saka', railId: 'main', at: 1560, left: 'uso', right: 'main', default: 'left', signReversed: true },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

/** A close shot: it sees no further than the stage fog (`reach` 1), so the camera after it does not either. */
const cam = (s, lateral, up, ls, llat, lup) => ({ camera: 'fixed', at: at(s, lateral, up), lookAt: at(ls, llat, lup), reach: 1 });
const END = main.at(main.length);
/** The lighthouse: 30 m past the buffer, 4 m left (the rail runs south there). */
const LIGHTHOUSE = { x: END.x + Math.sin(END.h) * 30 + Math.cos(END.h) * 4, z: END.z + Math.cos(END.h) * 30 - Math.sin(END.h) * 4 };

const opening = [
  { caption: 'ほしのうみ', seconds: 2.5 },
  { camera: 'chase' },
  { say: 'わあ… ゆうやけの うみ！', emote: 'jump' },
  { say: 'けいじばんに おねがいが きてる！' },
  { say: 'こんやは うみの ほしまつり！' },
  { say: 'みんなを とうだいまで はこぼう！' },
  { camera: 'side' },
  { say: 'とうだいに ひが ついたら' },
  { say: 'おまつりの はじまり なんだって' },
  { say: 'ジャンプも もぐるも ぜんぶ つかうよ！', emote: 'cheer' },
  { camera: 'cab' },
];

const glimpse = [
  cam(1936, -12, 4, 1966, 12, -1),
  { spawn: 'sakasa', model: 'amanojaku', onRail: { railId: 'main', at: 1966, lateral: 12, heightFromRail: 0 }, rotationY: -90 },
  { spawn: 'awa', model: 'awa-big', onRail: { railId: 'main', at: 1966, lateral: 12, heightFromRail: -0.5 } },
  { say: '…あれ？ だれか みてる？', emote: 'tilt' },
  { wait: 1 },
  { move: 'sakasa', onRail: { railId: 'main', at: 1990, lateral: 30, heightFromRail: 14 }, seconds: 3, nowait: true },
  { move: 'awa', onRail: { railId: 'main', at: 1990, lateral: 30, heightFromRail: 13.5 }, seconds: 3, nowait: true },
  { say: 'ピンクの あわ… サカサ？', emote: 'tilt' },
  { say: 'でんしゃを じっと みてた…' },
  { remove: 'sakasa' },
  { remove: 'awa' },
];

const ending = [
  // The lighthouse, still dark, from behind the train and to its right.
  { camera: 'fixed', at: at(3180 + 12, 14, 12), lookAt: [round(LIGHTHOUSE.x), 23, round(LIGHTHOUSE.z)] },
  { say: 'とうだいが まっくら…', emote: 'tilt' },
  { say: 'でんしゃの ライトで てらして！', who: 'passenger' },
  { press: 'light', say: 'ライトを おして！', fx: 'beacon' },
  { say: 'ついた〜！ とうだいの ひ！', emote: 'jump' },
  { fx: 'festival' },
  { spawn: 'kujira', model: 'whale', onRail: { railId: 'main', at: 3100, lateral: 60, heightFromRail: -5 }, rotationY: 90 },
  { say: 'わあ… うみの ほしが いっぱい！', emote: 'cheer' },
  { say: 'くじらさんも きてくれた！', emote: 'jump' },
  { say: 'ほしまつりの はじまり〜！' },
  { door: 'open' },
  // From over the sea beside the platform (left): the last car's door and the platform.
  cam(3150, -24, 6, 3152, -2, 2),
  { spawn: 'sakasa', model: 'amanojaku', onRail: { railId: 'main', at: 3128, lateral: -7, heightFromRail: 1 }, rotationY: 150 },
  { move: 'sakasa', onRail: { railId: 'main', at: 3148, lateral: -4.2, heightFromRail: 1 }, seconds: 3 },
  { say: '…あれ？ うしろの ドアに…', emote: 'tilt' },
  { move: 'sakasa', onRail: { railId: 'main', at: 3150, lateral: -2.8, heightFromRail: 1 }, seconds: 0.8 },
  { say: 'サカサ！', emote: 'jump' },
  { say: 'さ、さようなら！', who: 'amanojaku' },
  { fx: 'pop', id: 'sakasa' },
  { say: 'こ、こんにちは〜！', who: 'amanojaku' },
  { move: 'sakasa', onRail: { railId: 'main', at: 3140, lateral: -14, heightFromRail: -3.5 }, seconds: 1.2 },
  { spawn: 'awa', model: 'awa-big', onRail: { railId: 'main', at: 3140, lateral: -14, heightFromRail: -4 } },
  { move: 'sakasa', onRail: { railId: 'main', at: 3120, lateral: -40, heightFromRail: -6 }, seconds: 4, nowait: true },
  { move: 'awa', onRail: { railId: 'main', at: 3120, lateral: -40, heightFromRail: -6.5 }, seconds: 4, nowait: true },
  { wait: 1.5 },
  { remove: 'sakasa' },
  { remove: 'awa' },
  { spawn: 'note', model: 'awa-note', onRail: { railId: 'main', at: 3150, lateral: -2.4, heightFromRail: 1.2 }, rotationY: 90 },
  { move: 'note', onRail: { railId: 'main', at: 3151, lateral: -1.8, heightFromRail: 2.6 }, seconds: 1.2 },
  { say: 'あっ、かみが おちてる…' },
  { card: { title: 'のせて', button: '…？', mirror: true } },
  { remove: 'note' },
  { say: 'うみの そこの かみと おなじ じ…', emote: 'tilt' },
  { say: 'サカサ、なにか いいたいのかな' },
  { say: 'こんど あったら、きいて みよう！' },
  { say: '…よし、いこう！ つぎの せかいへ！', emote: 'cheer' },
  { door: 'close' },
  { card: { title: '3しょう おしまい！', button: 'つぎへ', icon: 'badge' } },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§5.5)
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(33);
const between = (a, b) => a + (b - a) * rand();
const props = [];
function addOnRail(model, railId, s, { lateral = 0, height, rotationY, scale = 1 } = {}) {
  const onRail = { railId, at: round(s) };
  if (lateral) onRail.lateral = round(lateral, 2);
  if (height !== undefined) onRail.heightFromRail = round(height, 2);
  const p = { model, onRail };
  if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
}
function addWorld(model, [x, y, z], { rotationY, scale = 1 } = {}) {
  const p = { model, position: [round(x), round(y, 2), round(z)] };
  if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  props.push(p);
}
const SAMPLES = [];
for (const line of Object.values(LINES)) for (let s = 0; s <= line.length; s += 2) SAMPLES.push({ rail: line.id, s, ...line.at(s) });
const nearRail = (x, z) => SAMPLES.reduce((best, q) => Math.min(best, Math.hypot(q.x - x, q.z - z)), Infinity);
const placed = [];
function scatter(models, count, { zones, lat, scale: [s0, s1], footprint, minRail = 8, y = () => FLOOR }) {
  const total = zones.reduce((a, z) => a + (z[2] - z[1]), 0);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 300; tries++) {
    let pick = rand() * total;
    let zone = zones[0];
    for (const z of zones) {
      pick -= z[2] - z[1];
      if (pick <= 0) {
        zone = z;
        break;
      }
    }
    const s = between(zone[1], zone[2]);
    const scale = round(between(s0, s1), 2);
    const r = footprint * scale;
    const q = LINES[zone[0]].point(s, (rand() < 0.5 ? -1 : 1) * between(lat[0], lat[1]));
    if (nearRail(q.x, q.z) < Math.max(minRail, r + 3)) continue;
    if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < (o.r + r) * 0.8 + 0.6)) continue;
    placed.push({ x: q.x, z: q.z, r });
    addWorld(models[Math.floor(rand() * models.length)], [q.x, y(q), q.z], { scale, rotationY: round(rand() * 360) });
    n++;
  }
  if (n < count) problems.push(`${models.join('/')}: placed ${n} of ${count}`);
}

// The cape (its top 0.4 under the rail), the lighthouse's rocky point and the shore with the harbour houses.
{
  const q = main.at(55);
  addWorld('cape-rock', [q.x, PIER - 0.4 - 34.6, q.z], { rotationY: q.h / RAD });
  addWorld('cape-rock', [LIGHTHOUSE.x, WALL - 0.6 - 34.6, LIGHTHOUSE.z], { rotationY: END.h / RAD, scale: 1 });
  addWorld('lighthouse', [LIGHTHOUSE.x, WALL - 0.6, LIGHTHOUSE.z], { rotationY: END.h / RAD + 180 });
  const shore = main.point(3130, -110);
  addWorld('cape-rock', [shore.x, -0.4 - 34.6 + 2, shore.z], { rotationY: END.h / RAD, scale: 1 });
  for (let i = 0; i < 6; i++) {
    const h = main.point(3060 + i * 18, -98 - (i % 2) * 12);
    addWorld('harbour-house', [h.x, 1.6, h.z], { rotationY: 90 + (i % 3) * 15 });
  }
}
// The trench's walls (§5.5): both sides, every 40 m, facing the track.
for (let s = 1350; s <= 1900; s += 40) {
  const q = main.at(s);
  for (const side of [-1, 1]) {
    const lateral = side * between(20, 28);
    const p = main.point(s, lateral);
    // Its glowing face (+Z) turned to the track.
    const face = side > 0 ? Math.atan2(Math.cos(q.h), -Math.sin(q.h)) : Math.atan2(-Math.cos(q.h), Math.sin(q.h));
    addWorld('trench-wall', [p.x, FLOOR, p.z], { rotationY: face / RAD });
  }
}
// Glowing coral in the trench and most in the star garden before ほしぞこえき; kelp, coral and rocks in the shallows.
scatter(['glow-coral'], 20, { zones: [['main', 1360, 1690]], lat: [8, 17], scale: [0.8, 1.5], footprint: 1.5, y: () => TRENCH - 0.5 });
scatter(['glow-coral'], 40, { zones: [['main', 1700, 1900]], lat: [7, 30], scale: [0.8, 1.6], footprint: 1.5, y: () => TRENCH - 0.5 });
scatter(['kelp'], 140, { zones: [['main', 2090, 2240], ['main', 2330, 2600]], lat: [8, 40], scale: [0.8, 1.2], footprint: 0.8 });
scatter(['coral-a', 'coral-b', 'coral-c'], 50, { zones: [['main', 2090, 2600]], lat: [9, 45], scale: [0.8, 1.6], footprint: 1.8 });
scatter(['rock-a', 'rock-b'], 20, { zones: [['main', 400, 680], ['main', 2090, 2600]], lat: [10, 50], scale: [1.2, 2.4], footprint: 1.4 });
scatter(['kelp'], 20, { zones: [['main', 440, 680]], lat: [8, 30], scale: [0.8, 1.2], footprint: 0.8 });
// ほしぞこえき's shell roof (3-1's rainbow shell, big), the festival rafts beside the track, the lantern posts.
addOnRail('rainbow-shell', 'main', 1920, { lateral: 7, height: 6, scale: 6 });
for (const [s, lateral] of [
  [2968, -13],
  [2975, 14],
  [3000, -16],
  [3008, 13],
  [3022, -12],
  [3048, 15],
  [3055, -15],
  [3070, 12],
]) addOnRail('festival-raft', 'main', s, { lateral, height: -FLOAT, rotationY: (s * 13) % 30 });
for (const s of [2690, 2700, 2715, 2725]) addOnRail('lantern-post', 'main', s, { lateral: 2.8, height: -0.3 });
for (let i = 0; i < 8; i++) addOnRail('lantern-post', 'main', 3150 + i * 5, { lateral: 2.8, height: -0.3 });

// ---------------------------------------------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------------------------------------------

const BASE = [
  { look: 'rock', toGround: true, from: 0, to: 110 },
  { look: 'pier', from: 110, to: 365 },
  { look: 'rock', toGround: true, from: 445, to: 685 },
  { look: 'pier', from: 685, to: 1070 },
  { look: 'rock', toGround: true, from: 1165, to: 2940 },
  { look: 'rock', toGround: true, from: 3070, to: Math.floor(main.length) },
];

const stage = {
  schemaVersion: 1,
  id: '3-3',
  title: 'ほしのうみ',
  chapter: 3,
  unlock: { requires: ['3-2'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#2f3f86', bottom: '#f6b38a' },
    fog: { color: '#f0bca0', near: 180, far: 520 },
    lighting: 'evening',
    // A sea over the whole ground: the ground's colour is the surface seen from above; its y is the sea floor.
    ground: { y: FLOOR, size: 4000, color: '#46679f' },
    water: WATERS,
    stars: { count: 300 },
    festival: {
      bursts: [at(3175, -40, -9), at(3210, 30, -9), at(3240, -20, -9)],
      moon: { azimuth: 100, elevation: 14 },
    },
    bgm: 'hoshimatsuri',
    ambience: 'sea',
    fall: 'water',
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    { id: 'main', points: main.points(), base: BASE, gaps: GAPS, end: { type: 'buffer' } },
    ...Object.entries(LOOPS).map(([id, l]) => ({
      id,
      points: loops[id].points(),
      ...(id === 'uso' ? { base: { look: 'rock', toGround: true } } : {}),
      end: { type: 'merge', railId: 'main', at: l.at - l.back },
    })),
  ],
  junctions: JUNCTIONS,
  stations: STATIONS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  floaters: FLOATERS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: { opening, glimpse, ending },
};

{
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) texts.push(...[st.say, st.reply].filter(Boolean));
  }
  for (const f of FLOATERS) texts.push(f.say);
  for (const a of ACTORS) for (const k of ['say', 'woke', 'danger', 'after']) if (a.params?.[k]) texts.push(a.params[k]);
  for (const r of RECORDS) if (r.hint) texts.push(r.hint);
  for (const steps of Object.values(stage.cutscenes)) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.map((t) => t.replace('{speed}', 'ふつう').replace('{station}', 'ていぼうえき')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
  report.push(`lighthouse at [${LIGHTHOUSE.x.toFixed(1)}, ${LIGHTHOUSE.z.toFixed(1)}]`);
}

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}

export { LINES };
