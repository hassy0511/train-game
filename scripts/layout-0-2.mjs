#!/usr/bin/env node
/**
 * Hidden test stage 0-2 "てすとの おもちゃ": builds src/stages/0-2.json (PHASE9_CHAPTER5_6 §0.8 and 第 5 部 §15: the toy
 * town's mechanisms of PR4 on one short line, with a mission, so the fails, the partner's lines and the save work as in
 * a real stage). Everything is on `main`, 100 m later than the design's list (a start station and a run-up):
 *
 *   hajime 45 (start) → a plain cat 150 (the whistle does not glow for it) → a wind-up chick 240 (walks back 8 m, the
 *   whistle glows) → the spinning fork t-kuru 400 (good = left, main; right = the loop t-kuru-wa back to 340) → the band
 *   (three players, tail 570, walks back from 120 m to 550, leaves the rail at 660) → owari 800 (end).
 *
 * The opening winds a chick with the whistle (a cutscene press with fx "windup"); the ending winds the town's big key
 * (its decorations turn round: #app[data-town="wound"]). `unlock.requires` is 4-3 so opening it straight away
 * (?stage=0-2) has every button of chapters 1–4 (it is hidden: the map and the next-stage choice never show it).
 *
 *   node scripts/layout-0-2.mjs         write src/stages/0-2.json and print the checks
 *   node scripts/layout-0-2.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel (heading north, right is −X).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, Line, pretty, RAD, walk } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/0-2.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

/** The rails run on toy-block bases 1 m over the play mat. */
const RAIL_Y = 1;
const level = () => RAIL_Y;

// ---- rails ----
const MAIN_LENGTH = 880;
const main = new Line('main', walk(0, 0, 0, [['S', MAIN_LENGTH]], level));
const KURU = 400;
const BACK = 60;
const forkAt = main.at(KURU);
/** The loop (as 3-3's `wa`): a U-turn R25 to the right, 60 m back, a U-turn onto main 60 m before the fork. */
const loop = new Line('t-kuru-wa', walk(forkAt.x, forkAt.z, forkAt.h / RAD, [['R', 25, 180], ['S', BACK], ['R', 25, 180]], level));

// ---- the pieces (main s) ----
const START = 45;
const OWARI = 800;
const NEKO = 150;
const HIYOKO = 240;
const PARADE = { tail: 570, min: 550, from: 120, exit: 660 };

const lines = {
  start: 'おもちゃの ためしだよ！\nひかったら きてき！',
  moving: 'そうそう、その ちょうし！',
  catNear: 'ねこさんだ！ きてきで おこそう',
  catWoke: 'ねこさん、ありがとう！',
  paradeNear: 'がくたいさんが うしろあるき〜！',
  stationNear: 'おわりの えきだ。ゆっくり！',
  complete: 'おもちゃの ためし、できたね！',
};

const stage = {
  schemaVersion: 1,
  id: '0-2',
  title: 'てすとの おもちゃ',
  chapter: 0,
  hidden: true,
  unlock: { requires: ['4-3'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#9fd8ff', bottom: '#ffe6f2' },
    fog: { color: '#ffeaf4', near: 150, far: 420 },
    lighting: 'day',
    ground: { y: 0, size: 2000, color: '#f6e7c8', look: 'playmat' },
    bgm: 'omocha',
    ambience: 'toy',
    surface: 'wood',
    fall: 'balls',
  },
  start: { railId: 'main', at: START, direction: 1 },
  rails: [
    { id: 'main', points: main.points(), base: { look: 'blocks', toGround: true }, end: { type: 'buffer' } },
    { id: 't-kuru-wa', points: loop.points(), base: { look: 'blocks', toGround: true }, end: { type: 'merge', railId: 'main', at: KURU - BACK } },
  ],
  junctions: [
    {
      id: 't-kuru',
      railId: 'main',
      at: KURU,
      left: 'main',
      right: 't-kuru-wa',
      default: 'left',
      spin: { good: 'left', stay: 4, turn: 1, range: 120, line: 'くるくる ポイント！ よく みてね' },
    },
  ],
  stations: [
    { id: 'hajime', name: 'はじまりのえき', railId: 'main', at: START, platformSide: 'left' },
    { id: 'owari', name: 'おわりのえき', railId: 'main', at: OWARI, platformSide: 'left' },
  ],
  props: [
    { model: 'block-house-a', onRail: { railId: 'main', at: 110, lateral: -16 }, rotationY: 90 },
    { model: 'block-house-b', onRail: { railId: 'main', at: 200, lateral: 18 } },
    { model: 'screw-post', onRail: { railId: 'main', at: 60, lateral: -5 } },
    { model: 'screw-post', onRail: { railId: 'main', at: OWARI + 10, lateral: -5 } },
    { model: 'block-house-c', onRail: { railId: 'main', at: 620, lateral: -20 }, rotationY: 90 },
    { model: 'windup-car-back', onRail: { railId: 'main', at: OWARI - 5, lateral: -9 }, rotationY: 90, windup: true },
    { model: 'windup-chick-back', onRail: { railId: 'main', at: OWARI + 15, lateral: -8 }, rotationY: 90, windup: true },
  ],
  actors: [
    { id: 'neko', type: 'cat', reactsTo: 'whistle', onRail: { railId: 'main', at: NEKO, heightFromRail: 0 }, params: { wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2 } },
    {
      id: 'hiyoko',
      type: 'cat',
      reactsTo: 'whistle',
      onRail: { railId: 'main', at: HIYOKO, heightFromRail: 0 },
      params: {
        look: 'windup-chick',
        wakeDistance: 70,
        dangerDistance: 8,
        fleeLateral: 5,
        fleeSeconds: 1.5,
        walk: { speed: 0.8, max: 8 },
        glow: true,
        say: 'ひよこさんが うしろあるき！ きてき！',
        woke: 'くるりん！ まえむきに なった！',
        danger: 'わわっ、ひよこさん！',
        after: 'ひかったら きてきで まきなおそう',
      },
    },
    {
      id: 'gakutai',
      type: 'parade',
      reactsTo: 'whistle',
      onRail: { railId: 'main', at: PARADE.tail, heightFromRail: 0 },
      params: { members: ['band-drum', 'band-trumpet', 'band-flag'], back: { from: PARADE.from, speed: 1.0, min: PARADE.min }, speed: 5, gap: 14, exit: PARADE.exit, exitSide: 'left' },
    },
  ],
  records: [],
  missions: [
    {
      id: 'm1',
      type: 'pickup',
      title: 'おもちゃの ためし',
      steps: [{ stationId: 'owari', board: 1, say: 'パレード みたよ！', reply: 'たのしかったね！' }],
      lines,
      hints: [
        { railId: 't-kuru-wa', at: 20, text: 'あれれ、ぐるっと まわってる…' },
        { railId: 't-kuru-wa', at: 190, text: 'ポイントが まってて くれるよ！' },
      ],
    },
  ],
  gimmicks: [{ type: 'camera', railId: 't-kuru-wa', from: 10, to: 207, params: { mode: 'top' } }],
  cutscenes: {
    opening: [
      { caption: 'てすとの おもちゃ', seconds: 2 },
      { spawn: 'tut-chick', model: 'windup-chick-back', onRail: { railId: 'main', at: 32, lateral: -4.5, heightFromRail: 0 } },
      { say: 'ぜんまいは きてきで まきなおせる！', emote: 'tilt' },
      { press: 'whistle', say: 'きてきを ならして みて！', fx: 'windup', target: 'tut-chick' },
      { say: 'やったね！ ひかったら きてき だよ', emote: 'cheer' },
      { remove: 'tut-chick' },
    ],
    ending: [
      { spawn: 'big-key', model: 'castle-key-back', onRail: { railId: 'main', at: OWARI + 20, lateral: -12, heightFromRail: 4 } },
      { say: 'おおきな ねじも ぎゃくまき！', emote: 'tilt' },
      { press: 'whistle', say: 'きてきを ならして！', fx: 'windup', target: 'big-key' },
      { say: 'ぜんまい、ぜんぶ もとどおり！', emote: 'cheer' },
    ],
  },
  opening: 'opening',
  ending: 'ending',
};

// ---- checks ----
for (const [line, at] of [
  [main, [KURU - BACK, KURU, START, OWARI]],
  [loop, [0, 100, loop.length]],
]) {
  const { total, worst } = gameCurveCheck(line, at);
  check(worst.d < 0.05, `${line.id}: the game's curve is within ${worst.d.toFixed(3)} m of the script's (length ${total.toFixed(1)} m)`);
}
{
  const end = loop.at(loop.length);
  const back = main.at(KURU - BACK);
  const gap = Math.hypot(end.x - back.x, end.z - back.z);
  check(gap < 0.5, `t-kuru-wa merges onto main ${KURU - BACK} (off by ${gap.toFixed(2)} m)`);
  check(Math.abs(loop.length - 217.1) < 0.3, `t-kuru-wa is ${loop.length.toFixed(1)} m (217.1)`);
}
check(HIYOKO - 8 - 70 > NEKO - 8 + 12, "the cat's and the chick's whistle windows are apart");
check(KURU - 120 > HIYOKO - 8 + 10, "the spinning fork wakes after the chick's window");
check(PARADE.min - 90 > KURU + 20, "the band's calling reach starts past the spinning fork");
check(PARADE.min - 14 - 60 > KURU + 70, "the band's way starts past the spinning fork's room");
check(OWARI - 30 > PARADE.exit + 40, 'the end station is past the band’s way');
const said = [
  ...Object.values(lines).flatMap((t) => t.split('\n')),
  ...stage.missions.flatMap((m) => [...m.hints.map((h) => h.text), ...m.steps.flatMap((s) => [s.say, s.reply])]),
  ...Object.values(stage.cutscenes).flatMap((steps) => steps.flatMap((st) => (st.say ? [st.say] : st.caption ? [st.caption] : []))),
  ...stage.actors.flatMap((a) => ['say', 'woke', 'danger', 'after'].map((k) => a.params?.[k]).filter(Boolean)),
  stage.junctions[0].spin.line,
];
for (const t of said) check([...t].length <= 20, `line within 20 letters: ${t}`);

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`\nwrote ${OUT}`);
}
