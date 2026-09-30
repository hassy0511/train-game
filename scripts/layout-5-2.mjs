#!/usr/bin/env node
/**
 * Stage 5-2 "おもちゃのまち": builds src/stages/5-2.json from docs/PHASE9_CHAPTER5_6.md 第 5 部 (§3, §5–§13), read with
 * §0 and docs/PHASE9_0_FREE_ABILITIES.md (the whistle's glow is a hint; every button works anywhere). A toy town on a big
 * play mat: M1 the reverse-wound chick and car (the whistle winds them), M2 the toy band (wind it, follow it slowly),
 * M3 the spinning forks (whistle when they point the good way), the screw hill (the rocket), the slide over the line
 * below, the dark toy box (the light), the castle and its big key.
 *
 *   node scripts/layout-5-2.mjs         write src/stages/5-2.json and print the checks
 *   node scripts/layout-5-2.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel (heading north, right is −X).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, keyed, Line, mulberry32, pretty, RAD, round, walk } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/5-2.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

// ---------------------------------------------------------------------------------------------------------------
// Rails (§5)
// ---------------------------------------------------------------------------------------------------------------

/** The rails run on toy-block bases 1 m over the play mat (ground y 0). */
const RAIL_Y = 1;
const BRIDGE = 6.5;
const TOP = 15;

/** §5.2 `main`: straights and arcs, 3,110 m. */
const MAIN_SEGMENTS = [
  ['S', 380],
  ['L', 200, 45],
  ['S', 320],
  ['R', 200, 45],
  ['S', 290],
  ['L', 250, 40],
  ['S', 380],
  ['R', 200, 40],
  ['S', 340],
  ['L', 30, 270],
  ['S', 630.3],
];
/** §5.1 heights: the three block bridges over the ball pits, the screw hill (the spiral) and the slide down. */
const MAIN_KEYS = [
  [0, RAIL_Y],
  [290, RAIL_Y],
  [318, BRIDGE],
  [354, BRIDGE],
  [382, RAIL_Y],
  [1135, RAIL_Y],
  [1161, BRIDGE],
  [1205, BRIDGE],
  [1231, RAIL_Y],
  [2160, RAIL_Y],
  [2188, BRIDGE],
  [2230, BRIDGE],
  [2258, RAIL_Y],
  [2360, RAIL_Y],
  [2430, TOP],
  [2498, TOP],
  [2582, RAIL_Y],
];
const main = new Line('main', walk(0, 0, 0, MAIN_SEGMENTS, keyed(MAIN_KEYS)));

/** §5.3 the loops at the spinning forks: a U-turn R25 to `side`, 60 m back, a U-turn onto main 60 m before the fork. */
const LOOPS = {
  'kuru-wa1': { at: 2080, side: 'R', back: 60 },
  'kuru-wa2': { at: 2900, side: 'L', back: 60 },
};
const loops = {};
for (const [id, l] of Object.entries(LOOPS)) {
  const p = main.at(l.at);
  loops[id] = new Line(id, walk(p.x, p.z, p.h / RAD, [[l.side, 25, 180], ['S', l.back], [l.side, 25, 180]], () => RAIL_Y));
}
/** §5.4 the side track to the third record: R80 to the right for 20°, then 172.1 m straight (200 m, a buffer). */
const TANA_AT = 1275;
const tanaStart = main.at(TANA_AT);
const tana = new Line('tana', walk(tanaStart.x, tanaStart.z, tanaStart.h / RAD, [['R', 80, 20], ['S', 172.1]], () => RAIL_Y));
const LINES = { main, ...loops, tana };

// ---------------------------------------------------------------------------------------------------------------
// Places (§3, §5.2)
// ---------------------------------------------------------------------------------------------------------------

const STATIONS = [
  { id: 'tsumiki', name: 'つみきえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'nejimaki', name: 'ねじまきえき', railId: 'main', at: 1090, platformSide: 'right' },
  { id: 'hiroba', name: 'ひろばえき', railId: 'main', at: 1790, platformSide: 'left' },
  { id: 'oshiro', name: 'おしろえき', railId: 'main', at: 3060, platformSide: 'left' },
];
const BALLS_LINE = 'ぼよよん… ボールに ぽふっ！';
const GAPS = [
  { from: 330, to: 342, hint: 'normal', pit: false, rewind: { railId: 'main', at: 270 }, line: BALLS_LINE },
  { from: 1175, to: 1191, hint: 'normal', pit: false, rewind: { railId: 'main', at: 1115 }, line: BALLS_LINE },
  { from: 2200, to: 2218, hint: 'fast', pit: false, rewind: { railId: 'main', at: 2130 }, line: BALLS_LINE },
];
const SLIDE = { from: 2498, to: 2582 };
const TOYBOX = { from: 2640, to: 2780 };
/** Where the slide runs over the line below (its block base is left out there). */
const OVER = { from: 2503, to: 2516 };

const at = (s, lateral = 0, up = 0, line = main) => {
  const q = line.point(s, lateral, up);
  return [round(q.x), round(q.y), round(q.z)];
};

const GIMMICKS = [
  { type: 'slope', railId: 'main', from: 2360, to: 2430, params: { pull: -6, rewind: { railId: 'main', at: 2300 }, line: 'ねじねじ さか！ ロケット！' } },
  { type: 'slope', railId: 'main', from: SLIDE.from, to: SLIDE.to, params: { pull: 3, max: 14, look: 'slide' } },
  { type: 'tunnel', railId: 'main', from: TOYBOX.from, to: TOYBOX.to, params: { look: 'toybox', dim: 0.45, fogColor: '#2a2342' } },
  { type: 'sound', railId: 'main', from: TOYBOX.from, to: TOYBOX.to, params: { surface: 'tunnel' } },
  { type: 'sound', railId: 'main', from: SLIDE.from, to: SLIDE.to, params: { surface: 'soft' } },
  { type: 'camera', railId: 'main', from: 318, to: 352, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 1163, to: 1199, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 1500, to: 1660, params: { mode: 'chase' } },
  { type: 'camera', railId: 'kuru-wa1', from: 10, to: 207, params: { mode: 'top' } },
  { type: 'camera', railId: 'main', from: 2190, to: 2226, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 2350, to: 2440, params: { mode: 'side' } },
  { type: 'camera', railId: 'main', from: 2490, to: 2590, params: { mode: 'chase' } },
  { type: 'camera', railId: 'kuru-wa2', from: 10, to: 207, params: { mode: 'top' } },
  { type: 'flock', params: { model: 'toy-plane', count: 8, center: at(1745, -45, 17), radius: 45, speed: 0.08 } },
];

const toy = (id, s, look, params) => ({ id, type: 'cat', reactsTo: 'whistle', onRail: { railId: 'main', at: s, heightFromRail: 0 }, params: { look, ...params } });
const AFTER = 'ひかったら きてきで まきなおそう';
const ACTORS = [
  toy('hiyoko', 220, 'windup-chick', {
    wakeDistance: 70,
    dangerDistance: 8,
    fleeLateral: 5,
    fleeSeconds: 1.5,
    walk: { speed: 0.8, max: 10 },
    glow: true,
    say: 'ひよこさんが うしろあるき！ きてき！',
    woke: 'くるりん！ まえむきに なった！',
    danger: 'わわっ、ひよこさん！',
    after: AFTER,
  }),
  toy('kuruma', 640, 'windup-car', {
    wakeDistance: 70,
    dangerDistance: 8,
    fleeLateral: 10,
    fleeSeconds: 1.2,
    glow: true,
    say: 'くるまが いったり きたり！ きてき！',
    woke: 'ぶーん！ いって らっしゃい〜',
    danger: 'わわっ、くるまさん！',
    after: AFTER,
  }),
  toy('hiyoko-2', 830, 'windup-chick', {
    wakeDistance: 70,
    dangerDistance: 8,
    fleeLateral: 5,
    fleeSeconds: 1.5,
    walk: { speed: 0.6, max: 6 },
    glow: true,
    say: 'ひよこさんが 3ばも！ きてき！',
    woke: '3ば いっぺんに くるりん！',
    danger: 'わわっ、ひよこさん！',
    after: AFTER,
  }),
  toy('hiyoko-3', 836, 'windup-chick', { wakeDistance: 70, dangerDistance: 8, fleeLateral: -5, fleeSeconds: 1.5, walk: { speed: 0.6, max: 6 }, glow: true, danger: 'わわっ、ひよこさん！', after: AFTER }),
  toy('hiyoko-4', 842, 'windup-chick', { wakeDistance: 70, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 1.5, walk: { speed: 0.6, max: 6 }, glow: true, danger: 'わわっ、ひよこさん！', after: AFTER }),
  {
    id: 'gakutai',
    type: 'parade',
    reactsTo: 'whistle',
    onRail: { railId: 'main', at: 1540, heightFromRail: 0 },
    params: {
      members: ['band-drum', 'band-cymbal', 'band-glock', 'band-trumpet', 'band-flag'],
      back: { from: 150, speed: 1.0, min: 1500 },
      speed: 5,
      gap: 14,
      exit: 1660,
      exitSide: 'left',
    },
  },
];

const RECORDS = [
  {
    id: 'gold-screw',
    name: 'きんいろの ねじ',
    note: 'ねじの はしらの てっぺんで ぴかぴか',
    requires: null,
    model: 'gold-screw',
    onRail: { railId: 'main', at: 720, lateral: -6, heightFromRail: 3 },
  },
  {
    id: 'glow-marble',
    name: 'ひかる ビーだま',
    note: 'おもちゃばこの すみで ほしみたい',
    requires: 'light',
    model: 'glow-marble',
    hint: 'すみっこで なにか きらっ！',
    onRail: { railId: 'main', at: 2730, lateral: -3, heightFromRail: 0.6 },
  },
  {
    id: 'tin-key',
    name: 'ブリキの ねじまき',
    note: 'たなの うえから ひっぱった ねじまき',
    requires: 'magnetLight',
    model: 'tin-key',
    onRail: { railId: 'tana', at: 150, lateral: -7, heightFromRail: 6 },
  },
];

const GAP_NEAR = 'つみきの すきま！ {speed} で とぼう';
const MISSIONS = [
  {
    id: 'm1',
    type: 'repair',
    title: 'ぎゃくまきを なおせ',
    steps: [{ stationId: 'nejimaki', board: 2, say: 'パレード みに いくの！', reply: 'いっしょに いこう！' }],
    lines: {
      start: 'ねじまきえきまで いこう！\nぎゃくまきを さがそう！',
      moving: 'そうそう、その ちょうし！',
      gapNear: GAP_NEAR,
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'ねじまきえきだ。ゆっくり！',
      complete: 'ぜんまい まきなおし、じょうず！',
    },
    hints: [],
  },
  {
    id: 'm2',
    type: 'deliver',
    title: 'がくたいの パレード',
    steps: [{ stationId: 'hiroba', alight: 2, parcel: 'load', say: 'おしろに この カギを おねがい！', reply: 'まかせて！' }],
    lines: {
      start: 'ひろばえきへ しゅっぱつ！\nパレードを みに いこう！',
      gapNear: GAP_NEAR,
      paradeNear: 'がくたいさんが うしろあるき〜！',
      stationNear: 'ひろばえきだ。ゆっくり！',
      complete: 'パレード、たのしかったね！',
    },
    hints: [
      { railId: 'main', at: 1245, text: 'みぎの ほうで なにか きらっ…', unless: 'magnetLight' },
      { railId: 'main', at: 1580, text: 'みんな てを ふってる！' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'くるくる ポイント',
    steps: [{ stationId: 'oshiro', parcel: 'unload', say: 'カギが とどいた！ ありがとう！', reply: 'どういたしまして！' }],
    lines: {
      start: 'カギを おしろへ とどけよう！\nくるくる ポイントが あるよ\nいい ほうを むいたら きてき！',
      gapNear: GAP_NEAR,
      rocketReady: 'いまだ！ ロケット！',
      rocketGo: 'ぐいーん！ ねじを のぼれ〜',
      rocketAgain: 'おそく なってきた… もういっかい！',
      // Said on entering the slide (a down slope's own `line` is not said: its line is noBrake).
      noBrake: 'すべりだい〜！ しゅーっ！',
      noBrakeLever: 'すべりだいは レバー おやすみ',
      tunnelNear: 'おもちゃばこだ！ ライトを つけよう',
      recordFound: 'みつけた！ ずかんに のせよう',
      stationNear: 'おしろえきだ。ゆっくり！',
      complete: 'おしろに ついた〜！',
    },
    hints: [
      { railId: 'kuru-wa1', at: 20, text: 'あれれ、ぐるっと まわってる…' },
      { railId: 'kuru-wa1', at: 190, text: 'ポイントが まってて くれるよ！' },
      { railId: 'kuru-wa2', at: 20, text: 'あれれ、ぐるっと まわってる…' },
      { railId: 'kuru-wa2', at: 190, text: 'ポイントが まってて くれるよ！' },
    ],
  },
];

const JUNCTIONS = [
  { id: 'to-tana', railId: 'main', at: TANA_AT, left: 'main', right: 'tana', default: 'left', needs: 'magnetLight' },
  {
    id: 'kuru-1',
    railId: 'main',
    at: 2080,
    left: 'main',
    right: 'kuru-wa1',
    default: 'left',
    spin: { good: 'left', stay: 4, turn: 1, range: 120, line: 'くるくる ポイント！ よく みてね' },
  },
  {
    id: 'kuru-2',
    railId: 'main',
    at: 2900,
    left: 'kuru-wa2',
    right: 'main',
    default: 'right',
    spin: { good: 'right', stay: 3, turn: 1, range: 120, line: 'また くるくる ポイント！' },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

/** A close shot: it sees no further than the stage fog (`reach` 1), so the camera after it does not either. */
const cam = (s, lateral, up, ls, llat, lup) => ({ camera: 'fixed', at: at(s, lateral, up), lookAt: at(ls, llat, lup), reach: 1 });
const onMain = (s, lateral, heightFromRail = 0) => ({ railId: 'main', at: s, lateral, heightFromRail });
const RAPPA = 'おもちゃの ラッパふき';
const BAND = ['band-drum', 'band-cymbal', 'band-glock', 'band-trumpet', 'band-flag'];

const opening = [
  { caption: 'おもちゃのまち', seconds: 2.5 },
  { camera: 'chase' },
  { say: 'わあ… おもちゃの まちだ！', emote: 'jump' },
  { say: 'あれれ？ みんな うしろに…', emote: 'tilt' },
  { say: 'ぜんまい、ぜんぶ ぎゃくまき！' },
  { say: 'おもちゃが うしろに あるいてる〜' },
  // On the platform (left, a metre up): a reverse-wound chick with Sakasa's swirl on its key.
  { camera: 'fixed', at: at(14, -10, 3.5), lookAt: at(31, -4.5, 0.8), reach: 1 },
  { spawn: 'tut-chick', model: 'windup-chick-back', onRail: onMain(30, -4.5, 1) },
  { say: 'ぐるぐる もよう… サカサの いたずらだ', emote: 'tilt' },
  { say: 'ぜんまいは きてきで まきなおせる！' },
  { press: 'whistle', say: 'きてきを ならして みて！', fx: 'windup', target: 'tut-chick' },
  { move: 'tut-chick', onRail: onMain(34, -4.5, 1), seconds: 1.2, nowait: true },
  { say: 'やったね！ ひかったら きてき だよ', emote: 'cheer' },
  { camera: 'cab' },
  { say: 'けいじばんに おねがいが きてる' },
  { say: 'おしろの パレードが できないんだって' },
  { say: 'ぎゃくまきを まきなおしに いこう！' },
];

const glimpse = [
  // From the edge of the square, behind a block house: Sakasa alone, pushing a little block train to and fro.
  cam(1801, -13, 3.5, 1816, -28, 1),
  { spawn: 'sakasa', model: 'amanojaku', onRail: onMain(1815, -28), rotationY: 0 },
  { spawn: 'block-train', model: 'toy-block-train', onRail: onMain(1817, -28) },
  { move: 'sakasa', onRail: onMain(1822, -28), seconds: 3, nowait: true },
  { move: 'block-train', onRail: onMain(1824, -28), seconds: 3 },
  { move: 'sakasa', onRail: onMain(1812, -28), seconds: 3, nowait: true },
  { move: 'block-train', onRail: onMain(1814, -28), seconds: 3 },
  { say: '…あれ？ サカサ？', emote: 'tilt' },
  { say: 'サカサも、でんしゃ ごっこ？' },
  { wait: 0.6 },
  { say: 'こ、こんにちは〜！', who: 'amanojaku' },
  { move: 'sakasa', onRail: onMain(1840, -60), seconds: 1.5 },
  { remove: 'sakasa' },
  { say: '…ひとりで あそんでたのかな' },
];

const ending = [
  // The castle's big key, turning backwards on its wall.
  cam(3034, 4, 7, 3076, -23, 11),
  { spawn: 'big-key', model: 'castle-key-back', onRail: onMain(3076, -23, 8) },
  { say: 'おしろの おおぜんまいも ぎゃくまき！', emote: 'tilt' },
  { say: 'さいごの ひとまき、いっしょに いこう！' },
  { press: 'whistle', say: 'きてきを ならして！', fx: 'windup', target: 'big-key' },
  { say: 'ぜんまい、ぜんぶ もとどおり！', emote: 'cheer' },
  // The band marches out in front of the castle.
  ...BAND.map((model, i) => ({ spawn: `band-${i + 1}`, model, onRail: onMain(3025 + i * 3, -16) })),
  ...BAND.map((_, i) => ({ move: `band-${i + 1}`, onRail: onMain(3052 + i * 3, -16), seconds: 6, nowait: true })),
  { say: 'パレードだ〜！', emote: 'jump' },
  { wait: 3.5 },
  { move: 'band-4', onRail: onMain(3066, -6), seconds: 2 },
  { spawn: 'held-train', model: 'toy-block-train', onRail: onMain(3066.8, -6, 1.2) },
  { say: 'あれ？ その でんしゃ…', emote: 'tilt' },
  { say: 'あの こは、みんなと あそびたい だけ', who: 'passenger', name: RAPPA },
  cam(3052, 1, 3, 3066, -6, 1.4),
  { say: 'みんなと… あそびたい だけ' },
  { say: 'サカサ、ずっと ひとり だったんだ' },
  // On a tower of the castle: Sakasa, for a moment (no words).
  { spawn: 'sakasa-far', model: 'amanojaku', onRail: onMain(3095, -40, 18), rotationY: -90 },
  { wait: 1.2 },
  { remove: 'sakasa-far' },
  { say: '…こんど いっしょに あそべたら いいね' },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§5.6)
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(52);
const between = (a, b) => a + (b - a) * rand();
const props = [];
function addOnRail(model, railId, s, { lateral = 0, height, rotationY, scale = 1, windup } = {}) {
  const onRail = { railId, at: round(s) };
  if (lateral) onRail.lateral = round(lateral, 2);
  if (height !== undefined) onRail.heightFromRail = round(height, 2);
  const p = { model, onRail };
  if (rotationY) p.rotationY = round(rotationY);
  if (scale !== 1) p.scale = round(scale, 2);
  if (windup) p.windup = true;
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
/** Keeps the square (left of main 1660–1830), the castle's front and the stations' platforms clear. */
const reserved = [
  { x: at(1745, -45)[0], z: at(1745, -45)[2], r: 38 },
  { x: at(3080, -42)[0], z: at(3080, -42)[2], r: 34 },
  { x: at(2095, -30)[0], z: at(2095, -30)[2], r: 22 },
];
function scatter(models, count, { zones, lat, footprint, minRail = 12, side = 0 }) {
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
    const sign = side || (rand() < 0.5 ? -1 : 1);
    const q = LINES[zone[0]].point(s, sign * between(lat[0], lat[1]));
    if (nearRail(q.x, q.z) < Math.max(minRail, footprint + 4)) continue;
    if (reserved.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + footprint)) continue;
    if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + footprint + 2)) continue;
    placed.push({ x: q.x, z: q.z, r: footprint });
    // Turned to face the rail (the model's front is +Z).
    const face = Math.atan2(-Math.sin(q.h) * sign, -Math.cos(q.h) * sign) / RAD;
    addWorld(models[Math.floor(rand() * models.length)], [q.x, 0, q.z], { rotationY: round(face + 90 * sign) });
    n++;
  }
  if (n < count) problems.push(`${models.join('/')}: placed ${n} of ${count}`);
}

// The block houses: the town of M1, round ねじまきえき, along the parade street, before the castle.
scatter(['block-house-a', 'block-house-b', 'block-house-c'], 26, { zones: [['main', 90, 1010]], lat: [14, 55], footprint: 6 });
scatter(['block-house-a', 'block-house-b', 'block-house-c'], 8, { zones: [['main', 1030, 1140]], lat: [14, 45], footprint: 6 });
scatter(['block-house-a', 'block-house-b', 'block-house-c'], 12, { zones: [['main', 1480, 1860]], lat: [14, 40], footprint: 6, side: 1 });
scatter(['block-house-a', 'block-house-b', 'block-house-c'], 8, { zones: [['main', 1860, 2060]], lat: [16, 45], footprint: 6 });
scatter(['block-house-a', 'block-house-b'], 8, { zones: [['main', 2800, 3040]], lat: [16, 40], footprint: 6, side: 1 });
// Screw lamp posts: on the platforms' far side and along the parade street; the short one with the gold screw on it.
for (const st of STATIONS) {
  const side = st.platformSide === 'left' ? -1 : 1;
  for (const d of [-30, -12, 6]) addOnRail('screw-post', 'main', st.at + d, { lateral: side * 6.6, height: -RAIL_Y });
}
for (let s = 1490; s <= 1650; s += 32) for (const side of [-1, 1]) addOnRail('screw-post', 'main', s, { lateral: side * 6, height: -RAIL_Y });
addOnRail('screw-post', 'main', 720, { lateral: -6, height: -RAIL_Y, scale: 0.42 });
// The ball pits under the three block bridges.
for (const g of GAPS) addOnRail('ball-pit', 'main', (g.from + g.to) / 2, { height: -main.at((g.from + g.to) / 2).y });
// The big screw in the middle of the spiral.
{
  const c = main.point(2338.3, -30);
  addWorld('screw-tower', [c.x, 0, c.z]);
}
// The square: block folk watching, flags (screw posts), and along the parade street folk on both sides.
for (let i = 0; i < 24; i++) {
  const s = 1670 + (i % 12) * 13 + (i < 12 ? 0 : 6);
  const lateral = -(22 + (i < 12 ? 0 : 14) + (i % 3) * 3);
  addOnRail(i % 2 ? 'block-folk-a' : 'block-folk-b', 'main', s, { lateral, height: -RAIL_Y, rotationY: -90 });
}
for (let i = 0; i < 20; i++) {
  const s = 1495 + i * 8;
  const side = i % 2 ? 1 : -1;
  addOnRail(i % 3 ? 'block-folk-a' : 'block-folk-b', 'main', s, { lateral: side * (9 + (i % 4)), height: -RAIL_Y, rotationY: side > 0 ? -90 : 90 });
}
// The castle (its door towards the rail) and the reverse-wound decorations of the town (they turn round in the ending).
addOnRail('toy-castle', 'main', 3080, { lateral: -42, height: -RAIL_Y, rotationY: -90 });
for (const [s, lateral, model] of [
  [3040, -14, 'windup-chick-back'],
  [3048, -12, 'windup-car-back'],
  [3090, -13, 'windup-chick-back'],
  [60, -12, 'windup-car-back'],
  [1100, 12, 'windup-chick-back'],
]) addOnRail(model, 'main', s, { lateral, height: -RAIL_Y, rotationY: 90, windup: true });
// In the toy box: toys against its walls (reverse-wound too).
for (let i = 0; i < 8; i++) {
  const s = TOYBOX.from + 12 + i * 15;
  const side = i % 2 ? 1 : -1;
  addOnRail(i % 3 ? 'windup-chick-back' : 'windup-car-back', 'main', s, { lateral: side * 4.2, height: -0.8, rotationY: side > 0 ? -90 : 90, windup: true });
}
// The side track's shelf (the tin key waits on top) and the heap of loose blocks (the bridge comes with PR6).
addOnRail('toy-shelf', 'tana', 150, { lateral: -7, height: -RAIL_Y, rotationY: 90 });
addOnRail('toy-blocks-loose', 'tana', 85, { lateral: 9, height: -RAIL_Y });

// ---------------------------------------------------------------------------------------------------------------
// Checks (§5.7)
// ---------------------------------------------------------------------------------------------------------------

check(Math.abs(main.length - 3110) < 0.5, `main length ${main.length.toFixed(1)} (table 3,110.0)`);
{
  const { total, worst } = gameCurveCheck(main, [45, 220, 336, 640, 720, 1090, 1183, 1275, 1540, 1660, 1790, 2080, 2209, 2308, 2510, 2640, 2730, 2780, 2900, 3060]);
  check(Math.abs(total - main.length) < 0.6 && worst.d < 0.3, `main as the game's curve: ${total.toFixed(2)} m, key places at most ${worst.d.toFixed(2)} m off (main ${worst.s})`);
}
for (const [id, l] of Object.entries(LOOPS)) {
  const line = loops[id];
  const end = line.at(line.length);
  const target = main.at(l.at - l.back);
  const off = Math.hypot(end.x - target.x, end.z - target.z, end.y - target.y);
  check(off < 0.5 && Math.abs(line.length - 217.1) < 0.3, `${id}: ${line.length.toFixed(1)} m, merges on main ${l.at - l.back} ${off.toFixed(2)} m off`);
  const { worst } = gameCurveCheck(line, [0, 100, line.length]);
  check(worst.d < 0.3, `${id} as the game's curve: ${worst.d.toFixed(2)} m off`);
}
check(Math.abs(tana.length - 200) < 0.5, `tana ${tana.length.toFixed(1)} m (200)`);
/** Closest two lines come horizontally, away from their shared stretch. */
function closest(a, b, skip) {
  let best = { d: Infinity, sa: 0, sb: 0, dy: 0 };
  for (const p of SAMPLES.filter((q) => q.rail === a)) {
    if (skip(p.s, 'a')) continue;
    for (const q of SAMPLES.filter((r) => r.rail === b)) {
      if (skip(q.s, 'b')) continue;
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < best.d) best = { d, sa: p.s, sb: q.s, dy: Math.abs(p.y - q.y) };
    }
  }
  return best;
}
{
  const t = closest('tana', 'main', (s, w) => (w === 'a' ? s < 40 : Math.abs(s - TANA_AT) < 60));
  check(t.d > 12, `tana stays ${t.d.toFixed(1)} m off main (tana ${t.sa}, main ${t.sb})`);
  for (const id of Object.keys(LOOPS)) {
    const l = LOOPS[id];
    const c = closest(id, 'main', (s, w) => (w === 'a' ? s < 30 || s > loops[id].length - 30 : Math.abs(s - l.at) < 100 || Math.abs(s - (l.at - l.back)) < 40));
    check(c.d > 15, `${id} stays ${c.d.toFixed(1)} m off main (${id} ${c.sa}, main ${c.sb})`);
  }
}
{
  // The slide over the line below: the one place main crosses itself, well above it.
  let worst = { d: Infinity, dy: 0, a: 0, b: 0 };
  for (let a = 0; a <= main.length; a += 1) {
    for (let b = a + 60; b <= main.length; b += 1) {
      const p = main.at(a);
      const q = main.at(b);
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < 12 && d < worst.d) worst = { d, dy: Math.abs(p.y - q.y), a, b };
    }
  }
  check(worst.dy >= 8 && worst.b > OVER.from - 10 && worst.b < OVER.to + 10, `main crosses itself only at main ${worst.a} under main ${worst.b}: ${worst.dy.toFixed(1)} m apart in height`);
}
{
  const p = main.at(2479.7);
  report.push(`spiral top exit at [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}], heading ${(p.h / RAD).toFixed(1)}°`);
  const e = main.at(main.length);
  report.push(`end at [${e.x.toFixed(1)}, ${e.z.toFixed(1)}]`);
}

// ---------------------------------------------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------------------------------------------

const BLOCKS = { look: 'blocks', toGround: true };
const stage = {
  schemaVersion: 1,
  id: '5-2',
  title: 'おもちゃのまち',
  chapter: 5,
  unlock: { requires: ['5-1'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#9fd8ff', bottom: '#ffe6f2' },
    fog: { color: '#ffeaf4', near: 200, far: 520 },
    lighting: 'day',
    ground: { y: 0, size: 5400, color: '#f6e7c8', look: 'playmat' },
    bgm: 'omocha',
    ambience: 'toy',
    surface: 'wood',
    fall: 'balls',
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    { id: 'main', points: main.points(), base: [{ ...BLOCKS, skip: [OVER] }], gaps: GAPS, end: { type: 'buffer' } },
    ...Object.entries(LOOPS).map(([id, l]) => ({ id, points: loops[id].points(), base: BLOCKS, end: { type: 'merge', railId: 'main', at: l.at - l.back } })),
    { id: 'tana', points: tana.points(), base: BLOCKS, spur: { back: { railId: 'main', at: 1300 } }, end: { type: 'buffer' } },
  ],
  junctions: JUNCTIONS,
  stations: STATIONS,
  props,
  actors: ACTORS,
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: { opening, glimpse, ending },
};
// A single base (not a list): its skip leaves out the stretch over the line below.
stage.rails[0].base = { ...BLOCKS, skip: [OVER] };

{
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) texts.push(...[st.say, st.reply].filter(Boolean));
  }
  for (const g of GAPS) texts.push(g.line);
  for (const g of GIMMICKS) if (g.params?.line) texts.push(g.params.line);
  for (const j of JUNCTIONS) if (j.spin?.line) texts.push(j.spin.line);
  for (const a of ACTORS) for (const k of ['say', 'woke', 'danger', 'after']) if (a.params?.[k]) texts.push(a.params[k]);
  for (const r of RECORDS) texts.push(r.name, r.note, ...(r.hint ? [r.hint] : []));
  for (const steps of Object.values(stage.cutscenes)) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.map((t) => t.replace('{speed}', 'ふつう')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
  for (const [name, s, lat, up] of [
    ['station tsumiki', 45, 0, 0],
    ['hiroba', 1790, 0, 0],
    ['sakasa (glimpse)', 1815, -28, 0],
    ['kuru-1', 2080, 0, 0],
    ['oshiro', 3060, 0, 0],
    ['castle', 3080, -42, 0],
  ]) report.push(`${name}: [${at(s, lat, up).join(', ')}]`);
}

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY && !problems.length) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}
