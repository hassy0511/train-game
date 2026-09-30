#!/usr/bin/env node
/**
 * Hidden test stage 0-4 "てすとの じしゃく": builds src/stages/0-4.json (PHASE9_CHAPTER5_6 §0.8 and 第 2 部 M20: the
 * magnet light's targets of PR5 on one straight line, with a mission, so the partner's lines, the soft "ぽよん", the
 * rewinds and the save's abilities work as in a real stage; the "能力 なし" play is the same stage with a save without
 * the magnet light). Everything is on `main` (north):
 *
 *   hajime 45 (start; the opening's first go: a little star flies to the train) → a side way "yoko" at 180 that needs
 *   the magnet light, with a record up high on it → star 420 (pick, no line: magnetNear) → rail gap 600–608 (bridge) →
 *   iron gate 780 (its own line) → a mirror looking away 980 (turn) with its fork 1012 (a reversed sign; the lie is the
 *   dead end "maboroshi") → owari 1330 (end). The iron odds and ends are scattered as everywhere (default).
 *
 * `chapter: 0` is left out of 第 2 部 M10's "before 5-3" rule, so the gap, the gate and the mirror are on the main line
 * (§0.8). `unlock.requires` is 4-3 so opening it straight away (?stage=0-4) has every button of chapters 1–4 (it is
 * hidden: the map and the next-stage choice never show it); the magnet light comes from the save.
 *
 *   node scripts/layout-0-4.mjs         write src/stages/0-4.json and print the checks
 *   node scripts/layout-0-4.mjs --dry   print the checks only
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
const OUT = resolve(ROOT, 'src/stages/0-4.json');
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
const MAIN_LENGTH = 1420;
const main = new Line('main', walk(0, 0, 0, [['S', MAIN_LENGTH]], flat));
// The lie at the mirror's fork: a dead end bending left (towards +X), 60 m.
const FORK = 1012;
const bend = (id, at, side, straight) => {
  const p = main.at(at);
  const radius = 30 / ((25 * Math.PI) / 180);
  return new Line(id, walk(p.x, p.z, 0, [[side, radius, 25], ['S', straight]], flat));
};
const maboroshi = bend('maboroshi', FORK, 'L', 30);
// The side way that needs the magnet light (first, so a save without the magnet reaches it before the gap): bending
// right (towards −X), 160 m; from its end the train is put back on main past the fork.
const YOKO = 180;
const yoko = bend('yoko', YOKO, 'R', 130);

// ---- the pieces (main s) ----
const START = 45;
const OWARI = 1330;
const STAR = 420;
const GAP = { from: 600, to: 608 };
const GATE = 780;
const MIRROR = { at: 980, lateral: -12, height: 4 };
const RECORD = { at: 110, lateral: 8, height: 4 };

// ---- scenery: a few trees, well off the line, the side ways and the targets ----
const random = mulberry32(0x0e04);
const trees = [];
for (let s = 70; s < MAIN_LENGTH - 20; s += 30) {
  for (const side of [-1, 1]) {
    if (random() < 0.4) continue;
    const lateral = side * (13 + random() * 16);
    if (side > 0 && s > YOKO - 10 && s < YOKO + 190) continue;
    if (side < 0 && s > GAP.from - 40 && s < GAP.to + 30) continue;
    if (side < 0 && s > FORK - 10 && s < FORK + 90) continue;
    if (side < 0 && (Math.abs(s - START) < 50 || Math.abs(s - OWARI) < 50)) continue;
    if (Math.abs(s - MIRROR.at) < 20) continue;
    trees.push({ model: random() < 0.5 ? 'tree-a' : 'tree-b', onRail: { railId: 'main', at: s + round(random() * 10, 0), lateral: round(lateral, 1) }, rotationY: round(random() * 360, 0) });
  }
}

const lines = {
  start: 'じしゃくの ためしだよ！\nみどりに ひかったら じしゃく',
  moving: 'そうそう、その ちょうし！',
  deadEnd: 'いきどまり… かがみを くるっと しよう',
  stationNear: 'おわりの えきだ。ゆっくり！',
  complete: 'じしゃくの ためし、できたね！',
};

const stage = {
  schemaVersion: 1,
  id: '0-4',
  title: 'てすとの じしゃく',
  chapter: 0,
  hidden: true,
  unlock: { requires: ['4-3'], purchase: null },
  unlocks: [],
  environment: {
    sky: { top: '#4f9dff', bottom: '#d9f1ff' },
    fog: { color: '#d9f1ff', near: 150, far: 450 },
    lighting: 'day',
    ground: { y: GROUND_Y, size: 3000, color: '#7fc96f' },
    bgm: null,
    ambience: 'town',
    surface: 'rail',
  },
  start: { railId: 'main', at: START, direction: 1 },
  rails: [
    { id: 'main', points: main.points(), end: { type: 'buffer' } },
    { id: 'maboroshi', points: maboroshi.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'yoko', points: yoko.points(), spur: { back: { railId: 'main', at: YOKO + 30 } }, end: { type: 'buffer' } },
  ],
  junctions: [
    { id: 'usono', railId: 'main', at: FORK, left: 'maboroshi', right: 'main', default: 'left', signReversed: true },
    { id: 'to-yoko', railId: 'main', at: YOKO, left: 'main', right: 'yoko', default: 'left', needs: 'magnetLight' },
  ],
  stations: [
    { id: 'hajime', name: 'はじまりのえき', railId: 'main', at: START, platformSide: 'left' },
    { id: 'owari', name: 'おわりのえき', railId: 'main', at: OWARI, platformSide: 'left' },
  ],
  props: [
    // A sign with a bell of its own on the way to the end (props[].iron), and the scattered odds and ends.
    { model: 'sign-bell', onRail: { railId: 'main', at: 1150, lateral: 5 }, iron: 'bell' },
    ...trees,
  ],
  actors: [],
  records: [
    {
      id: 'test-suzu',
      name: 'たかい すず（ためし）',
      note: 'じしゃくで ひきよせた すず',
      requires: 'magnetLight',
      model: 'ice-bell',
      onRail: { railId: 'yoko', at: RECORD.at, lateral: RECORD.lateral, heightFromRail: RECORD.height },
      hint: 'たかい ところに すず！',
    },
  ],
  missions: [
    {
      id: 'm1',
      type: 'pickup',
      title: 'じしゃくの ためし',
      steps: [{ stationId: 'owari', board: 1, say: 'じしゃくの でんしゃ、すごい！', reply: 'きゅいーん だよ！' }],
      lines,
    },
  ],
  gimmicks: [
    { type: 'magnet', railId: 'main', from: STAR, params: { id: 'hoshi', kind: 'pick', look: 'star', lateral: 7, height: 3 } },
    {
      type: 'magnet',
      railId: 'main',
      from: GAP.from,
      to: GAP.to,
      params: { id: 'hanare', kind: 'bridge', look: 'rail-piece', piece: { lateral: -9, height: 0, rotationY: 60 } },
    },
    {
      type: 'magnet',
      railId: 'main',
      from: GATE,
      params: { id: 'tobira', kind: 'gate', look: 'door', line: 'てつの とびら！ じしゃく！', done: 'あいた！' },
    },
    {
      type: 'magnet',
      railId: 'main',
      from: MIRROR.at,
      params: {
        id: 'kurutto',
        kind: 'turn',
        look: 'mirror',
        lateral: MIRROR.lateral,
        height: MIRROR.height,
        junction: 'usono',
        line: 'そっぽの かがみ！ じしゃくで くるっ！',
        done: 'くるっ！ ほんとうの みちが みえた！',
        miss: 'かがみが そっぽ… うその みち！',
      },
    },
  ],
  cutscenes: {
    opening: [
      { caption: 'てすとの じしゃく', seconds: 2 },
      { say: 'ライトの ボタンで じしゃくを ためそう', emote: 'tilt' },
      { spawn: 'tut-star', model: 'iron-star-small', onRail: { railId: 'main', at: START + 40, lateral: 7, heightFromRail: 3 } },
      { press: 'magnet', target: 'tut-star', say: 'もう いちど おすと じしゃく！' },
      { say: 'くっついた！ じしゃくライト！', emote: 'jump' },
    ],
  },
  opening: 'opening',
};

// ---- checks ----
for (const [line, at] of [
  [main, [FORK, YOKO, START, OWARI, STAR, GAP.from, GATE, MIRROR.at]],
  [maboroshi, [0, 30, 60]],
  [yoko, [0, RECORD.at, 160]],
]) {
  const { total, worst } = gameCurveCheck(line, at);
  check(worst.d < 0.05, `${line.id}: the game's curve is within ${worst.d.toFixed(3)} m of the script's (length ${total.toFixed(1)} m)`);
}
for (const [side, at] of [
  [maboroshi, FORK],
  [yoko, YOKO],
]) {
  const a = main.at(at);
  const b = side.at(0);
  check(Math.hypot(a.x - b.x, a.z - b.z) < 0.01, `${side.id} starts on main ${at}`);
  const end = side.at(side.length);
  check(Math.abs(end.x) > 8, `${side.id}'s end is ${Math.abs(end.x).toFixed(1)} m off main (≥ 8)`);
}
// The turn: its pull ends 40 m or more before its fork, and 30 m or more of it is left after the dead end's rewind.
const minAhead = Math.max(4, Math.hypot(MIRROR.lateral, MIRROR.height));
check(MIRROR.at - minAhead <= FORK - 40, `the mirror's pull ends ${(FORK - (MIRROR.at - minAhead)).toFixed(1)} m before its fork (≥ 40)`);
const left = MIRROR.at - minAhead - Math.max(FORK - 80, MIRROR.at - 50);
check(left >= 30, `after the dead end's rewind ${left.toFixed(1)} m of the mirror's pull is left (≥ 30)`);
check(STAR - 80 > START + 60, "the star's glow starts after the start station");
check(GAP.from - 120 > STAR + 30, "the gap's stretch starts after the star");
check(GATE - 120 > GAP.to + 40, "the gate's stretch starts after the gap's");
check(STAR - 80 > YOKO + 30, "the star's glow starts past the side way's fork");
check(OWARI - 80 > FORK + 30, "the end station is well past the mirror's fork");
const said = [
  ...Object.values(lines).flatMap((t) => t.split('\n')),
  ...stage.missions.flatMap((m) => m.steps.flatMap((s) => [s.say, s.reply])),
  ...Object.values(stage.cutscenes).flatMap((steps) => steps.flatMap((st) => (st.say ? [st.say] : st.caption ? [st.caption] : []))),
  ...stage.gimmicks.flatMap((g) => [g.params.line, g.params.done, g.params.miss].filter(Boolean)),
  ...stage.records.map((r) => r.hint),
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
