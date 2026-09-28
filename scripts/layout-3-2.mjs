#!/usr/bin/env node
/**
 * Stage 3-2 "たきのかわ": builds src/stages/3-2.json from docs/PHASE8_CHAPTER3_4.md 第 4 部 (§5–§13), read with the
 * rules of §0.2 (diving is a press on a stretch on the water surface; floaters are dived under; a surface stretch
 * running on under water is the way into a long dive). What changed from the design's tables is listed in its
 * 実装メモ (§18): the dips under the raft and the lily pads became floating track with floaters over it, and the
 * plunge pool and the forest pond are reached from a floating stretch.
 *
 *   node scripts/layout-3-2.mjs         write src/stages/3-2.json and print the checks
 *   node scripts/layout-3-2.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, inArea, keyed, Line, mulberry32, pretty, RAD, round, walk, waterSpans } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/3-2.json');
const DRY = process.argv.includes('--dry');

// ---------------------------------------------------------------------------------------------------------------
// Levels (§5.1): the meadow is the ground (y 0); the valley's river 8 m down; the embankment 2.5 m over it.
// ---------------------------------------------------------------------------------------------------------------

const VALLEY_Y = -8;
const VALLEY_FLOOR = -24;
const EMB = -5.5;
/** Floating track: 0.4 m over the water (a stretch on the surface: "もぐる" dives from it). */
const FLOAT = VALLEY_Y + 0.4;
const POOL = -22.5;
const MEADOW = 0.4;
const UPPER_Y = -1;
const POND_Y = -1;
const POND_FLOAT = POND_Y + 0.4;
const POND_DEEP = -8.5;

/**
 * §5.2 `kawa`: straights and arcs, 3,016.5 m. The straight to the falls is 4.5 m longer than the table's 400: the
 * descents shorten the plan, and the track behind the falls must run 3.5 m in front of the cliff (the shower).
 */
const KAWA_SEGMENTS = [
  ['S', 360],
  ['L', 250, 15],
  ['S', 150],
  ['R', 250, 30],
  ['S', 453.7],
  ['L', 250, 15],
  ['S', 404.5],
  ['L', 30, 90],
  ['S', 110],
  ['R', 30, 90],
  ['S', 120],
  ['R', 200, 12],
  ['S', 120],
  ['L', 200, 12],
  ['S', 260],
  ['R', 100, 30],
  ['S', 40],
  ['L', 80, 60],
  ['S', 40],
  ['R', 100, 30],
  ['S', 330],
];

/**
 * `kawa` heights (s, y). The raft (302) and the three lily pads (767, 883, 999) float over floating track; the plunge
 * pool is entered from a floating stretch (1410–1460) and the rail goes down to the pool's floor, up the underwater
 * slope (1555.5–1625.5, the rocket), under the curtain and up behind the falls onto the meadow; the forest pond the
 * same way (a floating stretch 2428–2462, down to −8.5, up again 2632–2668).
 */
const KAWA_KEYS = [
  [0, EMB],
  [180, EMB],
  [215, FLOAT],
  [390, FLOAT],
  [425, EMB],
  [600, EMB],
  [635, FLOAT],
  [1045, FLOAT],
  [1080, EMB],
  [1380, EMB],
  [1410, FLOAT],
  [1460, FLOAT],
  [1520, POOL],
  [1555.5, POOL],
  [1625.5, -12.5],
  [1672.6, -12.5],
  [1700.5, EMB],
  [1782.5, MEADOW],
  [2413.5, MEADOW],
  [2428, POND_FLOAT],
  [2462, POND_FLOAT],
  [2497, POND_DEEP],
  [2632, POND_DEEP],
  [2668, MEADOW],
];

const kawa = new Line('kawa', walk(0, 0, 0, KAWA_SEGMENTS, keyed(KAWA_KEYS)));

/** A side track leaving `line` at `at` to `side` ('L'/'R'): its segments and heights (s from 0). */
function branch(id, line, at, segments, keys) {
  const p = line.at(at);
  return new Line(id, walk(p.x, p.z, p.h / RAD, segments, keyed(keys)));
}
/** §5.3: the jade's side track over the upper river (floating over it past its bank), the two dead ends in the pond, the snow's side track. */
const fuchi = branch('fuchi', kawa, 2170.5, [['R', 50, 50], ['S', 78]], [[0, MEADOW], [30, MEADOW], [42, UPPER_Y + 0.4]]);
const dead1 = branch('dead-1', kawa, 2500.9, [['R', 40, 30], ['S', 38]], [[0, POND_DEEP]]);
const dead2 = branch('dead-2', kawa, 2611.4, [['L', 40, 30], ['S', 38]], [[0, POND_DEEP]]);
const yukima = branch('yukima', kawa, 2780.4, [['L', 40, 60], ['S', 55]], [[0, MEADOW]]);
const LINES = { kawa, fuchi, 'dead-1': dead1, 'dead-2': dead2, yukima };

// ---------------------------------------------------------------------------------------------------------------
// Water (§5.5)
// ---------------------------------------------------------------------------------------------------------------

/** The falls' lip (§4.2): the valley's north edge, z 1636.4. */
const LIP_Z = 1636.4;
const VALLEY = { center: [-10.1, (LIP_Z + -60) / 2], size: [227, LIP_Z + 60] };
const WATERS = [
  {
    y: VALLEY_Y,
    floor: VALLEY_FLOOR,
    look: 'lake',
    wall: 'cliff',
    flow: [0, -0.5],
    area: { rect: { center: [round(VALLEY.center[0]), round(VALLEY.center[1])], size: [VALLEY.size[0], round(VALLEY.size[1])], corner: 20 } },
    under: { color: '#3f9fbf', far: 60 },
  },
  { y: UPPER_Y, floor: -9, look: 'lake', flow: [0, -0.7], area: { rect: { center: [-8.6, 1899.4], size: [104, 520], corner: 20 } } },
  {
    y: POND_Y,
    floor: -12,
    look: 'lake',
    area: { rect: { center: [30, 2372], size: [134, 244], corner: 50 } },
    under: { color: '#2e6f78', far: 40 },
  },
  { y: -0.4, floor: -3, look: 'puddle', area: { circle: { center: [31.7, 2734.8], radius: 12 } } },
];

// ---------------------------------------------------------------------------------------------------------------
// Checks (§5.6)
// ---------------------------------------------------------------------------------------------------------------

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

check(Math.abs(kawa.length - 3016.5) < 1, `kawa length ${kawa.length.toFixed(1)} (table 3,012.0 + 4.5)`);
{
  const { total, worst } = gameCurveCheck(kawa, [45, 302, 470, 767, 883, 999, 1120, 1460, 1889.7, 2170.5, 2500.9, 2611.4, 2780.4, 2922]);
  check(Math.abs(total - kawa.length) < 0.6 && worst.d < 0.3, `kawa as the game's curve: ${total.toFixed(2)} m, key places at most ${worst.d.toFixed(2)} m off (kawa ${worst.s})`);
}
const SPANS = Object.fromEntries(Object.entries(LINES).map(([id, l]) => [id, waterSpans(l, WATERS)]));
const fmt = (sp) => sp.map((x) => `${x.from}–${x.to} (w${x.water})`).join(', ');
for (const [id, sp] of Object.entries(SPANS)) report.push(`${id}: surface ${fmt(sp.surfaces) || '—'}; under water ${fmt(sp.dives) || '—'}`);
const kawaSpans = SPANS.kawa;
// Nothing to jump from 120 m before a water stretch to 40 m after it (the gap at 470–482).
{
  const all = [...kawaSpans.surfaces, ...kawaSpans.dives];
  const clash = all.find((sp) => 482 >= sp.from - 120 && 470 <= sp.to + 40);
  check(!clash, `the gap (470–482) keeps 120 m before and 40 m after water${clash ? `: ${clash.from}–${clash.to}` : ''}`);
}
// Every under-water stretch goes 4.5 m under.
for (const [id, sp] of Object.entries(SPANS)) {
  for (const d of sp.dives) {
    let low = Infinity;
    for (let s = d.from; s <= d.to; s++) low = Math.min(low, LINES[id].at(s).y);
    check(WATERS[d.water].y - low >= 4.5, `${id} under water ${d.from}–${d.to}: ${(WATERS[d.water].y - low).toFixed(1)} m deep`);
  }
}
// Stations are not on or near water (the seat is not "もぐる" while standing there).
for (const [at, name] of [
  [45, 'ささぶねえき'],
  [1120, 'せせらぎえき'],
  [1889.7, 'しぶきえき'],
  [2922, 'わきみずえき'],
]) {
  const near = [...kawaSpans.surfaces, ...kawaSpans.dives].some((sp) => at >= sp.from - 50 && at <= sp.to + 20);
  check(!near, `${name} (kawa ${at}) keeps off the water`);
}
// Rails under ground: outside every water, a rail is not under the meadow.
for (const [id, l] of Object.entries(LINES)) {
  let worst = { y: Infinity, s: 0 };
  for (let s = 0; s <= l.length; s += 1) {
    const p = l.at(s);
    if (WATERS.some((w) => inArea(w.area, p.x, p.z, -3))) continue;
    if (p.y < worst.y) worst = { y: p.y, s };
  }
  check(worst.y >= -0.6, `${id}: lowest outside the water ${worst.y.toFixed(1)} at ${worst.s}`);
}
// The upper river stays clear of the main line (it only runs on the meadow beside it).
{
  const w = WATERS[1];
  let hit = null;
  for (let s = 1782; s < 2413; s += 2) {
    const p = kawa.at(s);
    if (inArea(w.area, p.x, p.z, 4)) hit = s;
  }
  check(hit === null, `kawa keeps 4 m off the upper river${hit ? ` (at ${hit})` : ''}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Stations, floaters, gimmicks, actors, records
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'sasabune', name: 'ささぶねえき', railId: 'kawa', at: 45, platformSide: 'left' },
  { id: 'seseragi', name: 'せせらぎえき', railId: 'kawa', at: 1120, platformSide: 'left' },
  { id: 'shibuki', name: 'しぶきえき', railId: 'kawa', at: 1889.7, platformSide: 'left' },
  { id: 'wakimizu', name: 'わきみずえき', railId: 'kawa', at: 2922, platformSide: 'left' },
];

// §3 M1: the log raft and the three lily pads, each dived under with a press (§0.2: many times).
const FLOATERS = [
  { id: 'raft', railId: 'kawa', at: 302, look: 'raft', length: 8, rewind: 230, say: 'いかだの したを くぐるよ！ もぐる！' },
  { id: 'lily-1', railId: 'kawa', at: 767, look: 'lily', length: 8, rewind: 690, say: 'はっぱの したを くぐるよ！' },
  { id: 'lily-2', railId: 'kawa', at: 883, look: 'lily', length: 8, rewind: 830, say: 'また はっぱ！ もういっかい！' },
  { id: 'lily-3', railId: 'kawa', at: 999, look: 'lily', length: 8, rewind: 945, say: 'さいごの はっぱ！ もぐる！' },
];

const FALLS = { from: [-68.6, LIP_Z], to: [51.4, LIP_Z], top: 0, bottom: VALLEY_Y, throw: 8.5, lip: 1.5, rainbow: true };

const GIMMICKS = [
  // §4.2 the curtain falls, M2's underwater slope (the rocket's "あわジェット").
  { type: 'waterfall', params: FALLS },
  { type: 'slope', railId: 'kawa', from: 1555.5, to: 1625.5, params: { pull: -6, rewind: { railId: 'kawa', at: 1500 }, line: 'のぼりざか！ ロケットで あわジェット' } },
  // §3 M3: the forest pond is dark (the light sees further).
  { type: 'fog', railId: 'kawa', from: 2466, to: 2640, params: { near: 2, far: 22, lightFar: 70, color: '#1f4d57' } },
  { type: 'fog', railId: 'dead-1', from: 0, to: Math.floor(dead1.length), params: { near: 2, far: 22, lightFar: 70, color: '#1f4d57' } },
  { type: 'fog', railId: 'dead-2', from: 0, to: Math.floor(dead2.length), params: { near: 2, far: 22, lightFar: 70, color: '#1f4d57' } },
  // §5.2 cameras.
  { type: 'camera', railId: 'kawa', from: 280, to: 330, params: { mode: 'chase' } },
  { type: 'camera', railId: 'kawa', from: 440, to: 500, params: { mode: 'side' } },
  { type: 'camera', railId: 'kawa', from: 1440, to: 1540, params: { mode: 'chase' } },
  { type: 'camera', railId: 'kawa', from: 1680, to: 1760, params: { mode: 'side' } },
  // §5.5: the spring's bubbles, the schools (leaping on the valley river and round the second leaf; swimming in the pool and the pond).
  { type: 'bubbles', params: { position: [31.7, -3, 2734.8], count: 16, height: 2.4, radius: 2 } },
  { type: 'flock', params: { model: 'fish-a', count: 10, center: [40, VALLEY_Y, 860], radius: 30, speed: 0.1, mode: 'leap', surface: VALLEY_Y } },
  { type: 'flock', params: { model: 'fish-a', count: 8, center: [-40, VALLEY_Y, 1330], radius: 22, speed: -0.1, mode: 'leap', surface: VALLEY_Y } },
  { type: 'flock', params: { model: 'frog', count: 6, center: [0, VALLEY_Y, 883], radius: 18, speed: 0.05, mode: 'leap', surface: VALLEY_Y } },
  { type: 'flock', params: { model: 'fish-b', count: 12, center: [-78.6, -17, 1520], radius: 16, speed: 0.12 } },
  { type: 'flock', params: { model: 'fish-a', count: 10, center: [30, -5, 2380], radius: 25, speed: -0.08 } },
];

const ACTORS = [
  // §4.3: the duck family crossing the meadow line (the young dinosaur's rule).
  {
    id: 'kamo',
    type: 'dino-small',
    reactsTo: 'none',
    onRail: { railId: 'kawa', at: 2060.6 },
    params: { startDistance: 60, crossSeconds: 5, dangerDistance: 6, lateral: 8, look: 'duck' },
  },
];

const RECORDS = [
  {
    id: 'kingfisher-feather',
    name: 'かわせみの あおい はね',
    note: 'あおい はね。かわせみ かな？',
    requires: null,
    model: 'blue-feather',
    hint: 'しまに あおい はねが ある！',
    onRail: { railId: 'kawa', at: 941, lateral: -7, heightFromRail: 3.8 },
  },
  {
    id: 'river-jade',
    name: 'かわぞこの ひすい',
    note: 'みずの そこで、みどりに きらっ',
    requires: 'dive',
    model: 'jade-stone',
    onRail: { railId: 'fuchi', at: 100, lateral: -2.5, heightFromRail: -6.4 },
  },
  {
    id: 'snow-bud',
    name: 'ゆきの したの ふきのとう',
    note: 'ゆきの した… どかせたら みえる？',
    requires: 'plow',
    model: 'fukinotou',
    onRail: { railId: 'yukima', at: round(yukima.length - 8), lateral: 3, heightFromRail: -0.4 },
  },
];

// §13. Keys equal to the built-in default (src/mission/runner.ts) are left out.
const MISSIONS = [
  {
    id: 'm1',
    type: 'pickup',
    title: 'ぴょこぴょこ もぐれ',
    steps: [{ stationId: 'seseragi', board: 2, say: 'たきの うえの かわを しらべたいの', reply: 'まかせて！ いっしょに いこう' }],
    lines: {
      start: 'せせらぎえきへ むかえに いこう！\nみずの うえでは もぐるが つかえる！',
      moving: 'そうそう、その ちょうし！',
      diveNear: 'ジャンプが もぐるに かわった！',
      diveReady: 'いまだ！ もぐる！',
      diveGo: 'ぶくぶく… あわの ドーム！',
      gapNear: 'しろい なみ！ {speed} で ジャンプ！',
      fellShort: 'ぽちゃん！ ジャンプで とびこえよう',
      fellNoJump: 'ぽちゃん！ ジャンプで とびこえよう',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'せせらぎえきだ。ゆっくり！',
      complete: 'なかまを のせたよ！',
    },
    hints: [
      { railId: 'kawa', at: 400, text: 'ぷかっ！ まるが ジャンプに もどった' },
      { railId: 'kawa', at: 800, text: 'ぴょこっ！ また もぐろう！' },
    ],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'たきのぼり',
    steps: [{ stationId: 'shibuki', alight: 2, say: 'ぐるぐる ぼうしの こを みたよ', reply: 'サカサかな？ さがしてみよう' }],
    lines: {
      start: 'しぶきえきへ とどけよう！\nたきを のぼって いくよ！',
      diveNear: 'たきつぼだ！ もぐるを おして！',
      rocketReady: 'いまだ！ ロケット！',
      rocketGo: 'ぼこぼこ ぐいーん！',
      stationNear: 'しぶきえきだ。ゆっくり！',
      complete: 'たきのぼり できたね！',
    },
    hints: [
      { railId: 'kawa', at: 1240, text: 'おおきな たきが みえてきた！' },
      { railId: 'kawa', at: 1300, text: 'あれ？ ピンクの ふねが ういてる' },
      { railId: 'kawa', at: 1692, text: 'ぷはっ！ たきの うらがわだ！' },
      { railId: 'kawa', at: 1712, text: 'ざーっ！ たきの シャワーだ〜！' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'repair',
    title: 'もりの いけの さかさ ふだ',
    steps: [{ stationId: 'wakimizu' }],
    lines: {
      start: 'けいじばんに おねがいが きてる！\nもりの いけの ふだが さかさまだって\nライトで なおしに いこう！',
      smallCrossing: 'かもの おやこだ！ まってあげて',
      dangerAfter: 'びっくりした〜。ゆっくり いこう',
      diveNear: 'もりの いけだ！ もぐるを おして！',
      signRevealed: 'なおった！ こっちが ほんとう！',
      deadEnd: 'みずくさで いきどまり！ ライト！',
      recordFound: 'みつけた！ ずかんに のせよう',
      needAbility: 'ゆきを どかせたら いけそう…',
      stationNear: 'わきみずえきだ。ゆっくり！',
      complete: 'なおった！ ……あれ？',
    },
    hints: [
      { railId: 'kawa', at: 2105, text: 'かわの そこで なにか ひかった！' },
      { railId: 'fuchi', at: 50, text: 'そこで ひかってる… もぐって みよう！' },
      { railId: 'kawa', at: 2440, text: 'くらい… ライトで ふだを てらそう' },
      { railId: 'kawa', at: 2672, text: 'ぷはっ！ わきみずの のはらだ' },
      { railId: 'kawa', at: 2712, text: 'むこうに ゆきの やまが みえる！' },
    ],
  },
];

const JUNCTIONS = [
  { id: 'to-fuchi', railId: 'kawa', at: 2170.5, left: 'kawa', right: 'fuchi', default: 'left', needs: 'dive' },
  { id: 'sakasa-1', railId: 'kawa', at: 2500.9, left: 'kawa', right: 'dead-1', default: 'right', signReversed: true },
  { id: 'sakasa-2', railId: 'kawa', at: 2611.4, left: 'dead-2', right: 'kawa', default: 'left', signReversed: true },
  { id: 'to-yukima', railId: 'kawa', at: 2780.4, left: 'yukima', right: 'kawa', default: 'right', needs: 'plow' },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

/** A close shot: it sees no further than the stage fog (`reach` 1), so the camera after it does not either. */
const cam = (line, s, lateral, up, ls, llat, lup) => {
  const at = line.point(s, lateral, up);
  const look = line.point(ls, llat, lup);
  return { camera: 'fixed', at: [round(at.x), round(at.y), round(at.z)], lookAt: [round(look.x), round(look.y), round(look.z)], reach: 1 };
};

const opening = [
  { caption: 'たきのかわ', seconds: 2.5 },
  { camera: 'chase' },
  { say: 'うみの つぎは、かわだ！', emote: 'jump' },
  { say: 'かわを さかのぼって、たきの うえへ！' },
  { say: 'あの ぐるぐるの かみ、まだ よめない…', emote: 'tilt' },
  { say: 'サカサ、どこかな？ …よし、いこう！', emote: 'cheer' },
  { camera: 'cab' },
];

// §12 glimpse: at しぶきえき, looking over the upper river (right of the train: the river is west of the meadow line,
// its bank some 47 m off the rail here). The camera stands on the meadow near the bank.
const GLIMPSE_AT = 1889.7;
const glimpse = [
  cam(kawa, GLIMPSE_AT + 22, 40, 3.5, GLIMPSE_AT + 39, 57, 0),
  // Sakasa on a flat rock in the upper river, three pink boats round him.
  { spawn: 'kawa-rock', model: 'kawa-rock', onRail: { railId: 'kawa', at: GLIMPSE_AT + 40, lateral: 58, heightFromRail: UPPER_Y - MEADOW - 0.7 } },
  { spawn: 'sakasa', model: 'amanojaku', onRail: { railId: 'kawa', at: GLIMPSE_AT + 40, lateral: 58, heightFromRail: UPPER_Y - MEADOW + 0.8 }, rotationY: -90 },
  ...[0, 1, 2].map((i) => ({ spawn: `boat-${i + 1}`, model: 'paper-boat', onRail: { railId: 'kawa', at: GLIMPSE_AT + 36 + i * 3, lateral: 54 - i * 1.5, heightFromRail: UPPER_Y - MEADOW } })),
  { say: 'さようなら！', who: 'amanojaku' },
  { say: 'サカサ！ なに してるの？', emote: 'jump' },
  ...[0, 1, 2].map((i) => ({ move: `boat-${i + 1}`, onRail: { railId: 'kawa', at: GLIMPSE_AT - 30 - i * 6, lateral: 50 + i * 2, heightFromRail: UPPER_Y - MEADOW }, seconds: 6, nowait: true })),
  { say: 'ピンクの かみの ふね…？', emote: 'tilt' },
  { say: 'こんにちは〜！', who: 'amanojaku' },
  { move: 'sakasa', onRail: { railId: 'kawa', at: GLIMPSE_AT + 60, lateral: 64, heightFromRail: UPPER_Y - MEADOW + 0.8 }, seconds: 0.8 },
  { move: 'sakasa', onRail: { railId: 'kawa', at: GLIMPSE_AT + 80, lateral: 70, heightFromRail: UPPER_Y - MEADOW + 0.4 }, seconds: 0.8 },
  { remove: 'sakasa' },
  { remove: 'boat-1' },
  { remove: 'boat-2' },
  { remove: 'boat-3' },
  { remove: 'kawa-rock' },
  { say: 'いっちゃった… ふね、だれにかな？', emote: 'tilt' },
];

// §12 ending at わきみずえき: the brook comes down on the right and runs under the track just ahead of the train.
const END_AT = 2922;
/** The brook's crossing under the track, and its water's top (m above the rail; the ground is 0.4 below it). */
const BROOK_AT = 2928;
const BROOK_H = -0.38;
const ending = [
  // From the train's right front: the front of the train and the brook (§12).
  cam(kawa, END_AT - 5, 17.6, 5.5, END_AT + 9, 4.3, 1.2),
  { spawn: 'boat', model: 'paper-boat', onRail: { railId: 'kawa', at: END_AT + 38, lateral: 9, heightFromRail: BROOK_H + 0.12 }, rotationY: 180 },
  { move: 'boat', onRail: { railId: 'kawa', at: BROOK_AT, lateral: 3.2, heightFromRail: BROOK_H + 0.12 }, seconds: 4, nowait: true },
  { say: 'あっ、かみの ふねが ながれてきた', emote: 'tilt' },
  { wait: 2 },
  { say: 'こつん！ でんしゃに とどいた！', emote: 'jump' },
  { card: { title: 'ふねに えが かいてある', button: '…！', icon: 'drawing' } },
  { say: 'ワンダーごうの え だ！', emote: 'jump' },
  { say: 'ぐるぐる もよう… サカサの え？', emote: 'tilt' },
  { say: 'うみの かみも、ぼくたちに…？', emote: 'tilt' },
  { camera: 'chase' },
  { spawn: 'sakasa', model: 'amanojaku', onRail: { railId: 'kawa', at: END_AT + 60, lateral: 16, heightFromRail: -1.6 }, rotationY: -120 },
  { move: 'sakasa', onRail: { railId: 'kawa', at: END_AT + 60, lateral: 16, heightFromRail: -0.4 }, seconds: 0.5 },
  { wait: 1 },
  { move: 'sakasa', onRail: { railId: 'kawa', at: END_AT + 60, lateral: 16, heightFromRail: -2 }, seconds: 0.4 },
  { remove: 'sakasa' },
  { say: 'いま、だれか いた？', emote: 'tilt' },
  { say: '…よし、いこう！ つぎの せかいへ！', emote: 'cheer' },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§5.5)
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(32);
const between = (a, b) => a + (b - a) * rand();
const props = [];

function addOnRail(model, railId, at, { lateral = 0, height, rotationY, scale = 1 } = {}) {
  const onRail = { railId, at: round(at) };
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
function nearRail(x, z) {
  let best = { d: Infinity };
  for (const q of SAMPLES) {
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < best.d) best = { d, q };
  }
  return best;
}
const STATION_ZONES = STATIONS.map((st) => ({ railId: st.railId, from: st.at - 50, to: st.at + 10 }));
const placed = [];
/** Keep-out circles for scattered things: the islets, the station banks, the falls' foot. */
const keepOut = [];
const blocked = (x, z, r) => keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + r);

/**
 * Scatters `count` of `models` beside `zones` ([rail, from, to]), `lat` [min, max] m either side, where `where(x, z)`
 * allows, not within `minRail` m of a track, 12 m of a platform, a keep-out or each other. Height from `y(x, z)`.
 */
function scatter(models, count, { zones, lat, scale: [s0, s1], footprint, minRail = 7, where, y, side = 0 }) {
  const total = zones.reduce((a, z) => a + (z[2] - z[1]), 0);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 400; tries++) {
    let pick = rand() * total;
    let zone = zones[0];
    for (const z of zones) {
      pick -= z[2] - z[1];
      if (pick <= 0) {
        zone = z;
        break;
      }
    }
    const [railId, from, to] = zone;
    const s = between(from, to);
    const sign = side || (rand() < 0.5 ? -1 : 1);
    const scale = round(between(s0, s1), 2);
    const r = footprint * scale;
    const q = LINES[railId].point(s, sign * between(lat[0], lat[1]));
    if (!where(q.x, q.z)) continue;
    const near = nearRail(q.x, q.z);
    if (near.d < Math.max(minRail, r + 3)) continue;
    if (near.d < 12 && STATION_ZONES.some((p) => p.railId === near.q.rail && near.q.s >= p.from && near.q.s <= p.to)) continue;
    if (blocked(q.x, q.z, r)) continue;
    if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < (o.r + r) * 0.8 + 0.6)) continue;
    placed.push({ x: q.x, z: q.z, r });
    addWorld(models[Math.floor(rand() * models.length)], [q.x, y(q.x, q.z), q.z], { scale, rotationY: round(rand() * 360) });
    n++;
  }
  if (n < count) problems.push(`${models.join('/')}: placed ${n} of ${count}`);
}

const inValley = (x, z) => inArea(WATERS[0].area, x, z);
const onMeadow = (x, z) => !WATERS.some((w) => inArea(w.area, x, z, 4));

// The islets: beside the lily pads (the kingfisher's feather on the second), and a few more in the valley.
for (const [s, lateral, scale] of [
  [825, -13, 1],
  [941, -13, 1],
  [560, 30, 0.8],
  [1180, -40, 0.9],
  [1300, 38, 0.8],
  [700, -45, 1.1],
]) {
  const q = kawa.point(s, lateral);
  addWorld('islet', [q.x, VALLEY_FLOOR, q.z], { scale, rotationY: (q.h / RAD) });
  keepOut.push({ x: q.x, z: q.z, r: 9 * scale });
}
// The stations' banks in the river, under their platforms (left).
for (const at of [45, 1120]) {
  const q = kawa.point(at - 15, -9);
  addWorld('river-bank', [q.x, VALLEY_FLOOR, q.z], { rotationY: q.h / RAD, scale: 0.7 });
  keepOut.push({ x: q.x, z: q.z, r: 16 });
}
// The rapids under the gap, the arch at the valley's south end (the sea beyond), the falls' lip.
addOnRail('rapids', 'kawa', 476, { height: VALLEY_Y - EMB - 0.6 });
addWorld('sea-arch', [-10, VALLEY_FLOOR, -58], { scale: 1.2 });
addWorld('falls-lip', [(FALLS.from[0] + FALLS.to[0]) / 2, -1.5, LIP_Z + 1.2]);
// The raft's lilies and a few more round leaves and flowers on the river (looks only).
for (const [s, lateral] of [
  [720, 14],
  [790, -20],
  [850, 16],
  [930, 22],
  [1010, -18],
  [1060, 15],
  [600, -24],
  [260, 18],
]) {
  const q = kawa.point(s, lateral);
  addWorld('lily-pad', [q.x, VALLEY_Y + 0.02, q.z], { scale: round(between(0.5, 0.8), 2), rotationY: rand() * 360 });
  addWorld('lily-flower', [q.x + 1.5, VALLEY_Y + 0.1, q.z + 1], { scale: 1 });
}
// The pink paper boats Sakasa floated (M2, a clue): right of the line near 1300.
for (let i = 0; i < 3; i++) {
  const q = kawa.point(1300 + i * 4, 14 + i * 1.5);
  addWorld('paper-boat', [q.x, VALLEY_Y + 0.02, q.z], { scale: 2, rotationY: 30 + i * 70 });
}
// The upper river: Sakasa's stepping stones; the spring: its vent and the patches of old snow; the far peaks.
{
  const q = kawa.point(1889.7 + 80, 70);
  addWorld('stepping-stones', [q.x, UPPER_Y - 0.4, q.z], { rotationY: 70 });
}
{
  addWorld('spring-vent', [31.7, -3, 2734.8], { scale: 0.6 });
  // The snowmelt brook (§5.5, the 2-2 water strip, small): 9 m right of the line from the north, then under the track
  // 6 m past わきみずえき (where the ending's paper boat bumps the train).
  for (let s = 2996; s >= 2933; s -= 2.2) addOnRail('water-strip', 'kawa', s, { lateral: 9, height: BROOK_H, rotationY: 90, scale: 0.06 });
  for (const [s, lateral] of [[2931.5, 8.2], [2930.2, 6.8], [2929, 5.2]]) addOnRail('water-strip', 'kawa', s, { lateral, height: BROOK_H, rotationY: 50, scale: 0.06 });
  for (let lateral = 3.6; lateral >= -9; lateral -= 2.1) addOnRail('water-strip', 'kawa', BROOK_AT, { lateral, height: BROOK_H, scale: 0.06 });
  const y = yukima.point(yukima.length - 8, 3);
  addWorld('snow-patch', [y.x, 0, y.z], { scale: 1 });
  for (const [s, lateral] of [
    [2960, 14],
    [2990, -16],
    [3005, 18],
  ]) {
    const q = kawa.point(s, lateral);
    addWorld('snow-patch', [q.x, 0, q.z], { scale: 0.6, rotationY: rand() * 360 });
  }
  addWorld('snow-peak', [-160, 0, 3150], { scale: 1 });
  addWorld('snow-peak', [220, 0, 3260], { scale: 0.8 });
}
// Water weeds in the forest pond, and a curtain of them at the end of each dead end (the soft stop).
for (const line of [dead1, dead2]) {
  for (let i = -2; i <= 2; i++) {
    const q = line.point(line.length - 1, i * 1.3);
    addWorld('water-weed', [q.x, -12, q.z], { scale: 1.3, rotationY: q.h / RAD });
  }
}
scatter(['water-weed'], 50, { zones: [['kawa', 2466, 2640]], lat: [7, 40], scale: [0.9, 1.3], footprint: 0.6, where: (x, z) => inArea(WATERS[2].area, x, z, -3), y: () => -12 });
// Reeds along the river's edges and on the islets' shores, river stones on the valley floor near the line.
scatter(['reed'], 160, { zones: [['kawa', 60, 1440]], lat: [6, 60], scale: [0.8, 1.3], footprint: 0.7, where: inValley, y: () => VALLEY_Y - 0.3 });
scatter(['reed'], 80, { zones: [['kawa', 1830, 2400]], lat: [10, 40], scale: [0.8, 1.2], footprint: 0.7, where: (x, z) => inArea(WATERS[1].area, x, z) && !inArea(WATERS[1].area, x, z, -6), y: () => UPPER_Y - 0.3 });
scatter(['river-rock'], 70, { zones: [['kawa', 60, 1440]], lat: [8, 70], scale: [0.8, 2], footprint: 1, where: inValley, y: () => VALLEY_FLOOR });
// Trees: on the cliff tops either side of the valley, round the meadow, and big ones round the forest pond (shade).
scatter(['tree-a', 'tree-b'], 70, { zones: [['kawa', 0, 1600]], lat: [100, 150], scale: [1, 1.6], footprint: 2.5, where: onMeadow, y: () => 0 });
scatter(['fern-a', 'fern-b'], 30, { zones: [['kawa', 0, 1600]], lat: [100, 130], scale: [1, 1.6], footprint: 1.2, where: onMeadow, y: () => 0 });
scatter(['tree-a', 'tree-b'], 90, { zones: [['kawa', 1830, 2420], ['kawa', 2680, 3012]], lat: [10, 90], scale: [1, 1.6], footprint: 2.5, where: onMeadow, y: () => 0, minRail: 9 });
scatter(['tree-a', 'tree-b'], 40, { zones: [['kawa', 2430, 2660]], lat: [60, 110], scale: [2, 2.4], footprint: 2.5, where: onMeadow, y: () => 0 });
// (2-2's meadow flowers are a tiny train's giant flowers: not here.)
scatter(['fern-a', 'fern-b'], 40, { zones: [['kawa', 1830, 2420], ['kawa', 2680, 3012]], lat: [6, 40], scale: [0.8, 1.3], footprint: 1, where: onMeadow, y: () => 0 });

// ---------------------------------------------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '3-2',
  title: 'たきのかわ',
  chapter: 3,
  unlock: { requires: ['3-1'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#5ab6ea', bottom: '#eaf7f0' },
    fog: { color: '#dff1ec', near: 180, far: 540 },
    lighting: 'day',
    ground: { y: 0, size: 6400, color: '#8cc46a' },
    water: WATERS,
    bgm: 'kawa',
    ambience: 'river',
    fall: 'water',
  },
  start: { railId: 'kawa', at: 45, direction: 1 },
  rails: [
    {
      id: 'kawa',
      points: kawa.points(),
      // The rock embankment in the valley (not over the rapids, nor on the meadow).
      base: { look: 'rock', depth: 19, skip: [{ from: 470, to: 482 }, { from: 1800, to: Math.floor(kawa.length) }] },
      gaps: [{ from: 470, to: 482, hint: 'normal', pit: false, rewind: { railId: 'kawa', at: 390 } }],
      end: { type: 'buffer' },
    },
    { id: 'fuchi', points: fuchi.points(), spur: { back: { railId: 'kawa', at: 2180 } }, end: { type: 'buffer' } },
    { id: 'dead-1', points: dead1.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'dead-2', points: dead2.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'yukima', points: yukima.points(), spur: { back: { railId: 'kawa', at: 2790 } }, end: { type: 'buffer' } },
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
  for (const r of RECORDS) if (r.hint) texts.push(r.hint);
  for (const steps of Object.values(stage.cutscenes)) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.map((t) => t.replace('{speed}', 'ふつう')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
  for (const [label, s] of [
    ['raft', 302],
    ['lily ②', 883],
    ['pool entry', 1470],
    ['behind the falls', 1690],
    ['behind the falls', 1705],
    ['しぶきえき', 1889.7],
    ['to-fuchi', 2170.5],
    ['pond entry', 2470],
    ['sakasa-1', 2500.9],
    ['わきみずえき', 2922],
  ]) {
    const p = kawa.at(s);
    report.push(`  ${label} (kawa ${s}): [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}]`);
  }
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
