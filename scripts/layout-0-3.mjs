#!/usr/bin/env node
/**
 * Hidden test stage 0-3 "てすとの かがみ": builds src/stages/0-3.json (PHASE9_CHAPTER5_6 §0.8 and 第 6 部 §17: the mirror
 * world's mechanisms of PR6a on one line, with missions, so the fails, the partner's lines and the save work as in a real
 * stage). Everything is on `main`, 100 m later than the design's list (a start station and a run-up); the design's side
 * track `kagami` (behind a `needs: "magnetLight"` fork) is left out: the magnet light is PR5's, and a hidden chapter 0
 * stage needs no such fork (第 2 部 M10 leaves chapter 0 out). The magnet's "turn" part (the turned-away mirror k-m-turn
 * and its fork) comes with PR6b, once the magnet light is in.
 *
 *   m1: hajime 45 (start) → glass 140–200 (mirror k-m-glass shows plain rails) → letter sign 230 (mirror-wise) →
 *       "かがみの なか" k-flip1 260–440 (open gate; the record test-kanban at 350 inside) → phantom fork k-j1 540 (the
 *       false way k-maboroshi1 straight on, the true way curving right; mirror k-m-fork1 at the false way's end) →
 *       false bridge over the gap 700–706 (hint "fast"; mirror k-m-gap shows the cut) → naka 900.
 *   m2: naka 900 → phantom fork k-j2 1000 (the false way straight on, the true way curving left; mirror k-m-fork2) →
 *       "かがみの なか" k-flip2 1200–1380 (a whistle gate) → owari 1560; the ending at the big mirror m-oo past the
 *       buffer: Sakasa with her back to it and the mirror Sakasa waving in it, the mirror turned over (never broken), and
 *       the notes held up to a mirror ("のせて").
 *
 * Two missions so the whistle gate can be tried from "つづき" (a resume at naka) without the first half.
 * `unlock.requires` is 4-3 so opening it straight away (?stage=0-3) has every button of chapters 1–4 (it is hidden: the
 * map and the next-stage choice never show it).
 *
 *   node scripts/layout-0-3.mjs         write src/stages/0-3.json and print the checks
 *   node scripts/layout-0-3.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel (heading north, right is −X).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, Line, pretty, RAD, round, walk } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/0-3.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

const level = () => 0;

// ---- the pieces (main s) ----
const START = 45;
const GLASS = { from: 140, to: 200 };
const FLIP1 = { from: 260, to: 440 };
const KANBAN = 350;
const J1 = 540;
const GAP = { from: 700, to: 706 };
const NAKA = 900;
const J2 = 1000;
const FLIP2 = { from: 1200, to: 1380 };
const OWARI = 1560;
const MAIN_LENGTH = 1650;
/** The false ways (as 4-1's and 5-3's: 86.9 m straight on, a cushion at the end). */
const FALSE_WAY = 86.9;
const R = 200;
const TURN = 30;

// ---- rails ----
const main = new Line(
  'main',
  walk(0, 0, 0, [['S', J1], ['R', R, TURN], ['S', J2 - J1 - R * TURN * RAD], ['L', R, TURN], ['S', MAIN_LENGTH - J2 - R * TURN * RAD]], level),
);
const j1 = main.at(J1);
const j2 = main.at(J2);
const maboroshi1 = new Line('k-maboroshi1', walk(j1.x, j1.z, j1.h / RAD, [['S', FALSE_WAY]], level));
const maboroshi2 = new Line('k-maboroshi2', walk(j2.x, j2.z, j2.h / RAD, [['S', FALSE_WAY]], level));

/** A mirror standing at world (x, z) whose glass faces the world point (tx, tz). */
function mirrorAt(id, x, z, tx, tz, extra = {}) {
  const rot = Math.atan2(tx - x, tz - z) / RAD;
  return { type: 'mirror', params: { id, look: 'frame', position: [round(x, 1), 0, round(z, 1)], rotationY: round(rot, 1), ...extra } };
}
/** A false way's mirror: 8 m past its end, facing back up it. */
function forkMirror(id, way, junction) {
  const end = way.at(way.length);
  const x = end.x + Math.sin(end.h) * 8;
  const z = end.z + Math.cos(end.h) * 8;
  return mirrorAt(id, x, z, end.x - Math.sin(end.h) * 50, end.z - Math.cos(end.h) * 50, { width: 22, height: 14, railId: way.id, junction });
}
const glassMirrorAt = main.point(230, 14);
const glassTarget = main.point((GLASS.from + GLASS.to) / 2);
const gapMirrorAt = main.point(750, -16);
const gapTarget = main.point(GAP.from - 15);
const endAt = main.at(MAIN_LENGTH);
const ooAt = { x: endAt.x + Math.sin(endAt.h) * 22, z: endAt.z + Math.cos(endAt.h) * 22 };

const mirrors = [
  mirrorAt('k-m-glass', glassMirrorAt.x, glassMirrorAt.z, glassTarget.x, glassTarget.z, { width: 20, height: 13, reflectRadius: 100 }),
  forkMirror('k-m-fork1', maboroshi1, 'k-j1'),
  mirrorAt('k-m-gap', gapMirrorAt.x, gapMirrorAt.z, gapTarget.x, gapTarget.z, { width: 20, height: 13 }),
  forkMirror('k-m-fork2', maboroshi2, 'k-j2'),
  mirrorAt('m-oo', ooAt.x, ooAt.z, endAt.x - Math.sin(endAt.h) * 40, endAt.z - Math.cos(endAt.h) * 40, { width: 24, height: 14, reflect: ['train', 'cutscene'] }),
];

// Sakasa by the big mirror (right of the rail, 10 m before the buffer), and the camera on the platform looking at it.
const SAKASA = { at: MAIN_LENGTH - 10, lateral: 5 };
const sakasaAt = main.point(SAKASA.at, SAKASA.lateral);
const camAt = main.point(OWARI + 5, -6);

const lines1 = {
  start: 'かがみの せかいの ためしだよ！',
  flipIn: 'かがみの なかに はいった！\nぜんぶ はんたい！',
  mirrorFake: 'あれ？ かがみに せんろが ない！',
  signRevealed: 'まぼろし だった！ こっちが ほんもの！',
  deadEnd: 'まぼろし だった〜！\nかがみを みてね',
  gapNear: '{speed}で ジャンプ！',
  stationNear: 'なかの えきだ。ゆっくり！',
  complete: 'かがみの ためし、できたね！',
};
const lines2 = {
  start: 'おわりの えきまで いこう！',
  deadEnd: 'まぼろし だった〜！\nかがみを みてね',
  stationNear: 'おわりの えきだ。ゆっくり！',
  complete: 'とどいた！',
};

const props = [];
// Glass trees and sparkly rocks along the way (clear of the gates and the forks' mirrors).
for (const [s, lat, model] of [
  [80, -14, 'crystal-tree-a'],
  [110, 16, 'crystal-tree-b'],
  [250, -18, 'crystal-rock'],
  [470, 15, 'crystal-tree-a'],
  [600, -20, 'crystal-tree-b'],
  [820, 18, 'crystal-rock'],
  [860, -16, 'crystal-tree-a'],
  [1150, 18, 'crystal-tree-b'],
  [1480, -15, 'crystal-tree-a'],
  [1520, 17, 'crystal-rock'],
]) props.push({ model, onRail: { railId: 'main', at: s, lateral: lat } });
props.push({ model: 'mirror-pillar', onRail: { railId: 'main', at: FLIP1.from - 30, lateral: 9 } });
props.push({ model: 'mirror-pillar', onRail: { railId: 'main', at: FLIP2.from - 30, lateral: -9 } });
// The cloud under the false bridge (1-3's).
props.push({ model: 'cloud-a', onRail: { railId: 'main', at: (GAP.from + GAP.to) / 2, lateral: 0, heightFromRail: -7 } });

const stage = {
  schemaVersion: 1,
  id: '0-3',
  title: 'てすとの かがみ',
  chapter: 0,
  hidden: true,
  unlock: { requires: ['4-3'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#b9b4f0', bottom: '#fbeefd' },
    fog: { color: '#f1ebfb', near: 220, far: 700 },
    lighting: 'day',
    ground: { y: -0.6, size: 3000, color: '#e4def4' },
    bgm: 'koori',
    ambience: 'mirror',
    fall: 'cloud',
    surface: 'ice',
  },
  start: { railId: 'main', at: START, direction: 1 },
  rails: [
    {
      id: 'main',
      points: main.points(),
      glass: [GLASS],
      gaps: [{ from: GAP.from, to: GAP.to, hint: 'fast', pit: false, phantom: true, line: 'まぼろしの はし だった〜！' }],
      end: { type: 'buffer' },
    },
    { id: 'k-maboroshi1', points: maboroshi1.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'k-maboroshi2', points: maboroshi2.points(), deadEnd: true, end: { type: 'buffer' } },
  ],
  junctions: [
    { id: 'k-j1', railId: 'main', at: J1, left: 'k-maboroshi1', right: 'main', default: 'left', signReversed: true, phantom: true },
    { id: 'k-j2', railId: 'main', at: J2, left: 'main', right: 'k-maboroshi2', default: 'right', signReversed: true, phantom: true },
  ],
  stations: [
    { id: 'hajime', name: 'はじまりのえき', railId: 'main', at: START, platformSide: 'left' },
    { id: 'naka', name: 'なかのえき', railId: 'main', at: NAKA, platformSide: 'right' },
    { id: 'owari', name: 'おわりのえき', railId: 'main', at: OWARI, platformSide: 'left' },
  ],
  props,
  actors: [],
  records: [
    {
      id: 'test-kanban',
      name: 'かがみの なかの かんばん',
      requires: null,
      model: 'mirror-board',
      onRail: { railId: 'main', at: KANBAN, lateral: -4 },
      rotationY: 180,
      hint: 'あっ！ かんばんが よめる！',
      note: 'かがみの なかで よめた かんばん',
    },
  ],
  missions: [
    {
      id: 'm1',
      type: 'repair',
      title: 'かがみの ためし',
      steps: [{ stationId: 'naka' }],
      lines: lines1,
      hints: [
        { railId: 'main', at: GLASS.from - 20, text: 'あれ？ せんろが すけてる…' },
        { railId: 'main', at: GLASS.from + 10, text: 'かがみを みて！ ちゃんと ある！' },
        { railId: 'main', at: FLIP1.from - 35, text: 'かがみに はいっちゃう〜！' },
        { railId: 'main', at: J1 - 70, text: 'まっすぐの せんろ、ピンク…？' },
        { railId: 'main', at: GAP.from - 40, text: 'かがみを みて！ きれてる！' },
      ],
    },
    {
      id: 'm2',
      type: 'deliver',
      title: 'かがみの もん',
      steps: [{ stationId: 'owari' }],
      lines: lines2,
      hints: [{ railId: 'main', at: J2 - 60, text: 'また まぼろし かも…？' }],
    },
  ],
  gimmicks: [
    ...mirrors,
    { type: 'letter-sign', params: { onRail: { railId: 'main', at: 230, lateral: -5 }, rotationY: 180, text: 'ようこそ', mirror: true } },
    { type: 'mirror-flip', railId: 'main', from: FLIP1.from, to: FLIP1.to, params: { id: 'k-flip1', gate: 'open' } },
    { type: 'mirror-flip', railId: 'main', from: FLIP2.from, to: FLIP2.to, params: { id: 'k-flip2', gate: 'whistle' } },
  ],
  cutscenes: {
    opening: [
      { caption: 'てすとの かがみ', seconds: 2 },
      { say: 'かがみに うつる ほうが ほんもの！', emote: 'jump' },
    ],
    ending: [
      { camera: 'fixed', at: [round(camAt.x, 1), 5, round(camAt.z, 1)], lookAt: [round(ooAt.x, 1), 7, round(ooAt.z, 1)], reach: 1 },
      { spawn: 'sakasa', model: 'amanojaku', onRail: { railId: 'main', at: SAKASA.at, lateral: SAKASA.lateral, heightFromRail: -0.6 }, rotationY: 90, mirror: 'hide' },
      { spawn: 'sakasa-mirror', model: 'amanojaku-wave', onRail: { railId: 'main', at: SAKASA.at, lateral: SAKASA.lateral, heightFromRail: -0.6 }, rotationY: 0, mirror: 'only' },
      { say: 'あれ？ かがみに サカサ…', emote: 'tilt' },
      { say: 'わあ！ かがみの サカサ、にこにこ！', emote: 'jump' },
      { say: 'こ、こんにちは〜！', who: 'amanojaku' },
      { remove: 'sakasa-mirror' },
      { fx: 'mirrorTurn', mirror: 'm-oo', to: 'back' },
      { move: 'sakasa', onRail: { railId: 'main', at: SAKASA.at, lateral: 40, heightFromRail: -0.6 }, seconds: 2 },
      { remove: 'sakasa' },
      { say: 'そうだ！ あの てがみ！', emote: 'jump' },
      { card: { title: 'のせて', button: 'うん', mirror: 'reflect', notes: 2 } },
      { say: 'のせて… だったんだ！', emote: 'jump' },
    ],
  },
  opening: 'opening',
  ending: 'ending',
};

// ---- checks ----
{
  const { total, worst } = gameCurveCheck(main, [START, J1, GAP.from, NAKA, J2, FLIP2.from, OWARI]);
  check(worst.d < 0.05, `main: the game's curve is within ${worst.d.toFixed(3)} m of the script's (length ${total.toFixed(1)} m)`);
}
check(Math.abs(maboroshi1.length - FALSE_WAY) < 0.3 && Math.abs(maboroshi2.length - FALSE_WAY) < 0.3, 'the false ways are 86.9 m');
{
  const end1 = maboroshi1.at(maboroshi1.length);
  let near = Infinity;
  for (let s = J1; s < J1 + 200; s += 1) {
    const q = main.at(s);
    near = Math.min(near, Math.hypot(q.x - end1.x, q.z - end1.z));
  }
  check(near > 12, `the false way k-maboroshi1 ends ${near.toFixed(1)} m from main (clear of the true way)`);
}
check(FLIP1.from - 20 > GLASS.to, 'the glass is before the first gate');
check(J1 - 80 > FLIP1.to, 'a wrong turn at k-j1 puts the train back outside the mirror world');
check(GAP.from - 80 > FLIP1.to + 60, 'a fall at the false bridge puts the train back outside the mirror world');
check(FLIP2.from - NAKA >= 150, 'the whistle gate is 150 m or more after naka');
check(OWARI - 30 > FLIP2.to + 60, 'owari stops clear of the mirror world');
const said = [
  ...Object.values(lines1).flatMap((t) => t.split('\n')),
  ...Object.values(lines2).flatMap((t) => t.split('\n')),
  ...stage.missions.flatMap((m) => m.hints.map((h) => h.text)),
  ...Object.values(stage.cutscenes).flatMap((steps) => steps.flatMap((st) => (st.say ? [st.say] : st.caption ? [st.caption] : []))),
  stage.rails[0].gaps[0].line,
  stage.records[0].hint,
];
for (const t of said) check([...t.replace('{speed}', 'はやい')].length <= 20, `line within 20 letters: ${t}`);

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
if (!DRY) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`\nwrote ${OUT}`);
}
