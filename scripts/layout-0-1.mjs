#!/usr/bin/env node
/**
 * Hidden test stage 0-1 "てすとの よる": builds src/stages/0-1.json (PHASE9_CHAPTER5_6 §0.8 and 第 4 部 §16: the night's
 * mechanisms of PR2c on one short line, with a mission, so the fails, the partner's lines and the save's abilities work
 * as in a real stage). Everything is on `main`, 100 m later than the design's list (a start station and a run-up):
 *
 *   hajime 45 (start) → hedgehog 130 (whistle glows) → hush 260–380 (sleeping rabbits, the hush record, the fawn 360)
 *   → whistle-reversed 500–620 (tanukis 560, 610) → firefly fork 780 (dead end "kurai") → fake firefly fork 960 (dead end
 *   "kurai2" with Sakasa's pink lanterns) → the riddle hints (`unless`) → owari 1150 (end).
 *
 * The opening turns day into night (a cutscene "environment" step) and the ending turns it back: day ⇄ night.
 * `unlock.requires` is 4-3 so opening it straight away (?stage=0-1) has every button of chapters 1–4 (it is hidden: the
 * map and the next-stage choice never show it).
 *
 *   node scripts/layout-0-1.mjs         write src/stages/0-1.json and print the checks
 *   node scripts/layout-0-1.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel (heading north, right is −X).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, Line, mulberry32, pretty, round, walk } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/0-1.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

const GROUND_Y = -0.6;
const flat = () => 0;

// ---- rails ----
const MAIN_LENGTH = 1230;
const main = new Line('main', walk(0, 0, 0, [['S', MAIN_LENGTH]], flat));
/** A dead end off `main` at `at`, bending right: a 30 m arc of 25°, then 30 m straight (60 m, a buffer). */
const deadEnd = (id, at) => {
  const p = main.at(at);
  const radius = 30 / ((25 * Math.PI) / 180);
  return new Line(id, walk(p.x, p.z, 0, [['R', radius, 25], ['S', 30]], flat));
};
const HOTARU = 780;
const NISE = 960;
const kurai = deadEnd('kurai', HOTARU);
const kurai2 = deadEnd('kurai2', NISE);

// ---- the pieces (main s) ----
const START = 45;
const OWARI = 1150;
const HEDGEHOG = 130;
const HUSH = { from: 260, to: 380 };
const FAWN = 360;
const BUNNY_RECORD = 320;
const REVERSED = { from: 500, to: 620 };
const TANUKI = [
  // Whistled 10 m into the stretch at "ふつう" (10 m/s) and not stopping, the train reaches group a while it dances
  // (it comes when 44.7 m or more ahead, and dances for 0.8 + 5 s = 58 m); group b, further, dances out of the way.
  { id: 'tanuki-a', at: 560, lateral: -6, count: 3 },
  { id: 'tanuki-b', at: 610, lateral: 6, count: 2 },
];

// ---- scenery: a few trees, well off the line and the dead ends ----
const random = mulberry32(0x0e01);
const trees = [];
for (let s = 70; s < MAIN_LENGTH - 20; s += 26) {
  for (const side of [-1, 1]) {
    if (random() < 0.35) continue;
    const lateral = side * (11 + random() * 16);
    // Keep the dead ends' side clear near the forks.
    if (side > 0 && ((s > HOTARU - 10 && s < HOTARU + 90) || (s > NISE - 10 && s < NISE + 90))) continue;
    // Keep the stations' platforms (left) and the hush meadow open.
    if (side < 0 && (Math.abs(s - START) < 50 || Math.abs(s - OWARI) < 50)) continue;
    if (s > HUSH.from - 20 && s < HUSH.to + 20 && Math.abs(lateral) < 22) continue;
    trees.push({ model: random() < 0.5 ? 'tree-a' : 'tree-b', onRail: { railId: 'main', at: s + round(random() * 10, 0), lateral: round(lateral, 1) }, rotationY: round(random() * 360, 0) });
  }
}

// ---- looks ----
const DAY = {
  sky: { top: '#4f9dff', bottom: '#d9f1ff' },
  fog: { color: '#d9f1ff', near: 150, far: 450 },
  lighting: 'day',
  ground: { y: GROUND_Y, size: 2600, color: '#7fc96f' },
  bgm: null,
  ambience: 'forest',
  fall: 'leaf',
  surface: 'rail',
};
/** The night of 5-1 (第 4 部 §4.1), the moon low enough to be seen from the cab. */
const NIGHT = {
  sky: { top: '#141c46', bottom: '#3d3f7e' },
  fog: { color: '#2a3566', near: 60, far: 260 },
  lighting: 'night',
  ground: { y: GROUND_Y, size: 2600, color: '#2f4a3a' },
  stars: { count: 400 },
  moon: { azimuth: 340, elevation: 16, size: 1 },
  fireflies: { count: 160, radius: 60 },
  ambience: 'night',
};

const lines = {
  start: 'よるの ためしだよ！\nしーっ・たぬき・ほたるを ためそう',
  moving: 'そうそう、その ちょうし！',
  deadEnd: 'くらい いきどまり… ほたるに きこう',
  stationNear: 'おわりの えきだ。ゆっくり！',
  complete: 'よるの ためし、できたね！',
};

const stage = {
  schemaVersion: 1,
  id: '0-1',
  title: 'てすとの よる',
  chapter: 0,
  hidden: true,
  unlock: { requires: ['4-3'], purchase: null },
  unlocks: [],
  environment: DAY,
  start: { railId: 'main', at: START, direction: 1 },
  rails: [
    { id: 'main', points: main.points(), end: { type: 'buffer' } },
    { id: 'kurai', points: kurai.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'kurai2', points: kurai2.points(), deadEnd: true, end: { type: 'buffer' } },
  ],
  junctions: [
    { id: 'hotaru', railId: 'main', at: HOTARU, left: 'main', right: 'kurai', default: 'right', fireflies: { callFrom: 100, callTo: 15 } },
    { id: 'nise', railId: 'main', at: NISE, left: 'main', right: 'kurai2', default: 'right', signReversed: true, fireflies: { fake: true } },
  ],
  stations: [
    { id: 'hajime', name: 'はじまりのえき', railId: 'main', at: START, platformSide: 'left' },
    { id: 'owari', name: 'おわりのえき', railId: 'main', at: OWARI, platformSide: 'left' },
  ],
  props: [
    { model: 'bunny-sleep', onRail: { railId: 'main', at: 285, lateral: -8 }, sleeper: true },
    { model: 'bunny-sleep', onRail: { railId: 'main', at: 340, lateral: 9 }, rotationY: 150, sleeper: true },
    { model: 'fake-lantern', onRail: { railId: 'kurai2', at: 15, lateral: -3, heightFromRail: 0 }, reveal: 'nise' },
    { model: 'fake-lantern', onRail: { railId: 'kurai2', at: 35, lateral: 3, heightFromRail: 0 }, rotationY: 180, reveal: 'nise' },
    { model: 'fake-lantern', onRail: { railId: 'kurai2', at: 55, lateral: -3, heightFromRail: 0 }, reveal: 'nise' },
    ...trees,
  ],
  actors: [
    {
      id: 'harinezumi',
      type: 'cat',
      reactsTo: 'whistle',
      onRail: { railId: 'main', at: HEDGEHOG, heightFromRail: 0 },
      params: {
        look: 'hedgehog',
        glow: true,
        wakeDistance: 60,
        dangerDistance: 8,
        fleeLateral: 5,
        fleeSeconds: 1.6,
        say: 'はりねずみさん、どいて〜！ きてき！',
        woke: 'ころころ〜 よけて くれた！',
      },
    },
    {
      id: 'kojika',
      type: 'dino-small',
      reactsTo: 'light',
      onRail: { railId: 'main', at: FAWN },
      rotationY: -90,
      params: { look: 'fawn', glare: true, startDistance: 90, crossSeconds: 2.5, dangerDistance: 12, lateral: 7 },
    },
    ...TANUKI.map((t) => ({ id: t.id, type: 'lure', reactsTo: 'whistle', onRail: { railId: 'main', at: t.at, lateral: t.lateral }, params: { look: 'tanuki', count: t.count } })),
  ],
  records: [
    {
      id: 'test-bunny',
      name: 'ねむる うさぎ（ためし）',
      note: 'しーっ。ライトを けしたら あえた',
      requires: null,
      hush: true,
      model: 'bunny-family',
      onRail: { railId: 'main', at: BUNNY_RECORD, lateral: 7 },
      hint: 'しーっ… うさぎの おやこが ねてる',
    },
  ],
  missions: [
    {
      id: 'm1',
      type: 'pickup',
      title: 'よるの ためし',
      steps: [{ stationId: 'owari', board: 1, say: 'よるの でんしゃ、すてき！', reply: 'しーっ だよ！' }],
      lines,
      hints: [
        { railId: 'main', at: 1000, text: 'たかい えだで なにか ちりん…', unless: 'magnetLight' },
        { railId: 'main', at: 1040, text: 'ライトが あれば みえそう…', unless: 'light' },
      ],
    },
  ],
  gimmicks: [
    { type: 'hush', railId: 'main', from: HUSH.from, to: HUSH.to, params: { id: 'harappa' } },
    { type: 'rocket', railId: 'main', from: HUSH.from, to: HUSH.to, params: { allow: false, icon: 'sleep', pressLine: 'ねてる みんなが おきちゃう。おやすみ' } },
    { type: 'whistle-reversed', railId: 'main', from: REVERSED.from, to: REVERSED.to, params: { id: 'tanuki-mori' } },
  ],
  cutscenes: {
    opening: [
      { caption: 'てすとの よる', seconds: 2 },
      { say: 'ためしの せんろだよ', emote: 'tilt' },
      { environment: NIGHT, seconds: 1.2 },
      { say: 'よるに なった！ しずかに いこう', emote: 'jump' },
    ],
    ending: [
      { say: 'ためし おしまい！' },
      { environment: {}, seconds: 1.2 },
      { say: 'あさに なった！', emote: 'cheer' },
    ],
  },
  opening: 'opening',
  ending: 'ending',
};

// ---- checks ----
for (const [line, forks] of [
  [main, [HOTARU, NISE, START, OWARI]],
  [kurai, [0, 30, 60]],
  [kurai2, [0, 30, 60]],
]) {
  const { total, worst } = gameCurveCheck(line, forks);
  check(worst.d < 0.05, `${line.id}: the game's curve is within ${worst.d.toFixed(3)} m of the script's (length ${total.toFixed(1)} m)`);
}
for (const [id, at] of [
  ['kurai', HOTARU],
  ['kurai2', NISE],
]) {
  const a = main.at(at);
  const b = (id === 'kurai' ? kurai : kurai2).at(0);
  check(Math.hypot(a.x - b.x, a.z - b.z) < 0.01, `${id} starts on main ${at}`);
  const end = (id === 'kurai' ? kurai : kurai2).at(60);
  const gap = Math.abs(end.x);
  check(gap > 8, `${id}'s end is ${gap.toFixed(1)} m off main (≥ 8)`);
}
const said = [
  ...Object.values(lines).flatMap((t) => t.split('\n')),
  ...stage.missions.flatMap((m) => [...m.hints.map((h) => h.text), ...m.steps.flatMap((s) => [s.say, s.reply])]),
  ...Object.values(stage.cutscenes).flatMap((steps) => steps.flatMap((st) => (st.say ? [st.say] : st.caption ? [st.caption] : []))),
  ...stage.actors.flatMap((a) => [a.params.say, a.params.woke].filter(Boolean)),
  ...stage.records.map((r) => r.hint),
  stage.gimmicks[1].params.pressLine,
];
for (const t of said) check([...t].length <= 20, `line within 20 letters: ${t}`);
check(HUSH.from - 70 - 20 > START + 20, 'the hush stretch (from its moon mark) is clear of the start station');
check(TANUKI.every((t) => t.at >= REVERSED.from + 40 && t.at <= REVERSED.to), 'the tanukis stand in the whistle-reversed stretch, 40 m or more in');
check(HOTARU - 100 > REVERSED.to + 10, "the firefly fork's calling reach is past the whistle-reversed stretch");
check(NISE - 100 > HOTARU - 15, "the two firefly forks' calling reaches do not overlap");
check(OWARI - 30 > NISE + 20, 'the end station is well past the fake fork');

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`\nwrote ${OUT}`);
}
