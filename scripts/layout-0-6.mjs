#!/usr/bin/env node
/**
 * Hidden test stage 0-6 "てすとの おいかけっこ": builds src/stages/0-6.json (PHASE9_CHAPTER5_6 第 7 部 §16.1, PR8b): the
 * mechanisms of 6-1 on a small ring, with missions, so the lines, the save, the resume and the tests work as in a
 * real stage (0-0 has no missions).
 *
 *   t-wa: a stadium ring (100 m straights, R40 half circles, 451.3 m), turning right (its inside is on the right).
 *     The train starts at t-wa 45. Sakasa runs 6 m out on the left (outside the ring).
 *   t-eki: the ring's station at t-wa 310 (on the second straight, platform on the right: inside the ring).
 *   t-wakare: a junction at t-wa 20, left = t-shima (outside), default right (the ring).
 *   t-shima: left R20 90°, then 120 m straight to a buffer (151.4 m); its station t-shima-eki at 100 (platform left).
 *
 *   m1 "おいかけっこ": to t-eki with a lead (from 60, keep 40, dash 80, 2 calls, learn "t-gyaku", the helpers quicker
 *     than 6-1's: an automatic call after 14 s, a reminder every 5 s, she comes back after 12 s, 15 m backing up) and
 *     t-wakare locked to the ring. Her home: the bench of t-shima-eki. (The automatic call waits 14 s, not the design's
 *     8: time enough to stop at the closed station before it comes, for the tests.)
 *   m2 "ドアを あけて まつ": to t-shima-eki (t-wakare's default is the siding for this mission: its arrow is chosen from
 *     the start) and wait with the door open (every beat 1 s).
 *   The ending: Sakasa says "…こんにちは", sits behind the driver (crew) and the train rolls to t-shima 135 (depart).
 *
 * `unlock.requires` is 5-3, so opening it straight away (?stage=0-6) has every ability of chapters 1–5 (not うしろむき:
 * m1 teaches it). It is hidden: the map and the next-stage choice never show it.
 *
 *   node scripts/layout-0-6.mjs         write src/stages/0-6.json and print the checks
 *   node scripts/layout-0-6.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, Line, pretty, RAD, walk } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/0-6.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};
const level = () => 0;

// ---- rails ----
const STRAIGHT = 100;
const R = 40;
const wa = new Line('t-wa', walk(0, 0, 0, [['S', STRAIGHT], ['R', R, 180], ['S', STRAIGHT], ['R', R, 180]], level));
const WAKARE = 20;
const forkAt = wa.at(WAKARE);
const SHIMA_STRAIGHT = 120;
const shima = new Line('t-shima', walk(forkAt.x, forkAt.z, forkAt.h / RAD, [['L', 20, 90], ['S', SHIMA_STRAIGHT]], level));

// ---- the pieces ----
const START = 45;
const EKI = 310;
const SHIMA_EKI = 100;
const SEAT = { railId: 't-shima', at: 78, lateral: -5.5 };
const DEPART_TO = 135;
const LEAD = { id: 'sakasa', railId: 't-wa', from: 60, keep: 40, dash: 80, calls: 2, learn: 't-gyaku', autoCallAfter: 14, remindEvery: 5, autoFollowAfter: 12, followBack: 15 };

const m1Lines = {
  start: 'おいかけっこの ためしだよ！',
  stationNear: 'えきだ。ゆっくり！',
  complete: 'おいかけっこ、できたね！',
};
const m2Lines = {
  start: 'こんどは しずかに まって あげよう\nサカサが じぶんで くるよ',
  stationNear: 'しまの えきだ。そーっと とまろう',
  perfect: 'ぴたっ… しーっ',
  ok: 'ぴたっ… しーっ',
};

const stage = {
  schemaVersion: 1,
  id: '0-6',
  title: 'てすとの おいかけっこ',
  chapter: 0,
  hidden: true,
  unlock: { requires: ['5-3'], purchase: null },
  unlocks: ['reverse'],
  environment: {
    sky: { top: '#f7b7a3', bottom: '#8fc8f4' },
    fog: { color: '#e6ecf8', near: 180, far: 520 },
    lighting: 'day',
    ground: { y: -0.6, size: 1400, color: '#bfe3a6' },
    bgm: 'kagami',
    fall: 'cloud',
  },
  start: { railId: 't-wa', at: START, direction: 1 },
  rails: [
    { id: 't-wa', points: wa.points(), end: { type: 'merge', railId: 't-wa', at: 0 } },
    { id: 't-shima', points: shima.points(), end: { type: 'buffer' } },
  ],
  junctions: [{ id: 't-wakare', railId: 't-wa', at: WAKARE, left: 't-shima', right: 't-wa', default: 'right' }],
  stations: [
    { id: 't-eki', name: 'わの えき', railId: 't-wa', at: EKI, platformSide: 'right' },
    { id: 't-shima-eki', name: 'しまの えき', railId: 't-shima', at: SHIMA_EKI, platformSide: 'left' },
  ],
  props: [
    // A few trees outside the ring, away from Sakasa's path (6 m out) and the siding.
    { model: 'tree-a', onRail: { railId: 't-wa', at: 150, lateral: -22 } },
    { model: 'tree-b', onRail: { railId: 't-wa', at: 260, lateral: -24 } },
    { model: 'tree-a', onRail: { railId: 't-wa', at: 380, lateral: -20 } },
    { model: 'tree-b', onRail: { railId: 't-shima', at: 60, lateral: 18 } },
  ],
  actors: [],
  records: [],
  missions: [
    {
      id: 'm1',
      type: 'pickup',
      title: 'おいかけっこの ためし',
      steps: [
        {
          stationId: 't-eki',
          lead: { ...LEAD, home: { railId: SEAT.railId, at: SEAT.at, lateral: SEAT.lateral, heightFromRail: 1, model: 'amanojaku-sit' } },
        },
      ],
      junctions: { 't-wakare': { lock: 'right' } },
      lines: m1Lines,
    },
    {
      id: 'm2',
      type: 'pickup',
      title: 'ドアを あけて まつ ためし',
      steps: [
        {
          stationId: 't-shima-eki',
          welcome: {
            actor: 'sakasa',
            model: 'amanojaku-lantern',
            seat: SEAT,
            beats: ['look', 'stand', 'walk', 'peek', 'board'].map((beat) => ({ beat, seconds: 1 })),
          },
        },
      ],
      junctions: { 't-wakare': { default: 'left' } },
      lines: m2Lines,
    },
  ],
  gimmicks: [],
  cutscenes: {
    opening: [{ caption: 'てすとの おいかけっこ', seconds: 2 }],
    't-gyaku': [
      { say: 'ぎゃくだ… にげる なら…', emote: 'tilt' },
      { say: 'こっちが うしろへ いったら…？', icon: 'run-swirl' },
      { unlock: 'reverse' },
      { say: 'きりかえを うしろに して みて！' },
    ],
    ending: [
      { say: '…こんにちは', who: 'amanojaku' },
      { say: 'ちゃんと こんにちは だ！', emote: 'jump' },
      { crew: ['sakasa'] },
      { say: 'いっしょに いこう！', emote: 'cheer' },
      { depart: { to: DEPART_TO, seconds: 5 } },
    ],
  },
  opening: 'opening',
  ending: 'ending',
};

// ---- checks ----
{
  const { total, worst } = gameCurveCheck(wa, [0, WAKARE, START, EKI, 200, 400]);
  check(worst.d < 0.05, `t-wa: the game's curve is within ${worst.d.toFixed(3)} m of the script's (length ${total.toFixed(1)} m)`);
  check(Math.abs(wa.length - 451.3) < 0.2, `t-wa is ${wa.length.toFixed(1)} m (451.3)`);
  const end = wa.at(wa.length);
  check(Math.hypot(end.x, end.z) < 0.05, `t-wa closes on itself (off by ${Math.hypot(end.x, end.z).toFixed(3)} m)`);
}
{
  const { total, worst } = gameCurveCheck(shima, [0, SEAT.at, SHIMA_EKI, DEPART_TO]);
  check(worst.d < 0.05, `t-shima: the game's curve is within ${worst.d.toFixed(3)} m of the script's (length ${total.toFixed(1)} m)`);
  check(DEPART_TO < shima.length - 6.5 - 1, `the ending rolls to ${DEPART_TO}, before the buffer's stop (${(shima.length - 7.5).toFixed(1)})`);
}
// The siding (outside the ring) keeps away from the ring's far side.
{
  let near = Infinity;
  for (let s = 40; s <= shima.length; s += 2) {
    const p = shima.at(s);
    for (let t = 0; t <= wa.length; t += 2) {
      const q = wa.at(t);
      near = Math.min(near, Math.hypot(p.x - q.x, p.z - q.z));
    }
  }
  check(near > 12, `t-shima past 40 m keeps ${near.toFixed(1)} m from the ring`);
}
check(EKI - LEAD.from >= LEAD.calls * 60 + 60, `from the lead's start to t-eki: ${EKI - LEAD.from} m (room for the calls and the stop)`);
const said = [
  ...Object.values(m1Lines).flatMap((t) => t.split('\n')),
  ...Object.values(m2Lines).flatMap((t) => t.split('\n')),
  ...Object.values(stage.cutscenes).flatMap((steps) => steps.flatMap((st) => (st.say ? [st.say] : st.caption ? [st.caption] : []))),
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
