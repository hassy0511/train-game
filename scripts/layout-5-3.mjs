#!/usr/bin/env node
/**
 * Stage 5-3 "かがみのせかい": builds src/stages/5-3.json from docs/PHASE9_CHAPTER5_6.md 第 6 部 (§3, §5–§13), read with
 * §0 and docs/PHASE9_0_FREE_ABILITIES.md (every learned ability works anywhere; a glow is only a hint; the magnet is the
 * light button's third step). The mirror world, lavender and white: "the one shown in a mirror is the real one".
 *
 *   M1 じしゃくで つなごう: the magnet light learned in the opening (a star pulled off a mirror shelf), two iron stars, the
 *      glass bridge (seen plain in a mirror), the parted rail (a bridge target), "かがみの なか" 1 (its gate opens by
 *      itself; record ① the sign readable inside).
 *   M2 まぼろしの みち: two phantom forks (the false way a pink phantom rail no mirror shows), the iron door, record ② the
 *      iron hand mirror on a tall shelf; the glimpse at めいろえき (Sakasa looking away, the mirror Sakasa waving).
 *   M3 かがみの なかへ: the whistle gate into "かがみの なか" 2 (two stars inside), the phantom bridge over a 6 m gap (a
 *      mirror shows the cut), the turned-away mirror the magnet turns round (its fork shows no arrows); the ending at
 *      the big mirror (the mirror Sakasa: "ほんとうは のりたい"; Sakasa turns the mirror over, never breaks it; the notes
 *      held up to a mirror read "のせて").
 *   Record ③ waits behind a glass side way `ura` (its backwards fork comes with PR9, 第 3 部 A12.3): PR6b lays the side
 *   way (it merges into main at 3250) and the record; its buffer stop is the rail mesh's (PR8a, §0.9 の 22).
 *
 *   node scripts/layout-5-3.mjs         write src/stages/5-3.json and print the checks
 *   node scripts/layout-5-3.mjs --dry   print the checks only
 *
 * The stage JSON is generated: change this script and run it again rather than editing the JSON by hand.
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel (heading north, right is −X). The rails lie at y 0 on a ground at −0.6 (as
 * the test stage 0-3); only the glass bridge climbs to 6 m.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameCurveCheck, keyed, Line, mulberry32, pretty, RAD, round, walk } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/stages/5-3.json');
const DRY = process.argv.includes('--dry');

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

// ---------------------------------------------------------------------------------------------------------------
// Rails (§5.1–§5.3)
// ---------------------------------------------------------------------------------------------------------------

const GROUND_Y = -0.6;
const GLASS = { from: 470, to: 530 };
const BRIDGE_Y = 6;
/** §5.1 main, 3,560 m (the table's straights and arcs). */
const MAIN_SEGMENTS = [
  ['S', 560],
  ['R', 250, 20],
  ['S', 760 - 647.27],
  ['L', 300, 15],
  ['S', 1080 - 838.54],
  ['R', 250, 25],
  ['S', 1500 - 1189.08],
  ['R', 200, 30],
  ['S', 1760 - 1604.72],
  ['L', 300, 16],
  ['S', 2000 - 1843.78],
  ['L', 200, 30],
  ['S', 2300 - 2104.72],
  ['R', 300, 16],
  ['S', 2660 - 2383.78],
  ['L', 300, 12],
  ['S', 3100 - 2722.83],
  ['R', 200, 30],
  ['S', 3560 - 3204.72],
];
/** The glass bridge: up to 6 m over 420–470, level 470–530, down 530–580 (looks only: not a slope). */
const MAIN_KEYS = [
  [0, 0],
  [420, 0],
  [470, BRIDGE_Y],
  [530, BRIDGE_Y],
  [580, 0],
];
const main = new Line('main', walk(0, 0, 0, MAIN_SEGMENTS, keyed(MAIN_KEYS)));

/** §5.2 the phantom ways: 86.9 m straight on from the fork, a cushion at the end (drawn by the mirror world). */
const FALSE_WAY = 86.9;
const J1 = 1500;
const J2 = 2000;
const J3 = 3100;
const falseWay = (id, at) => {
  const p = main.at(at);
  return new Line(id, walk(p.x, p.z, p.h / RAD, [['S', FALSE_WAY]], () => 0));
};
const kagami1 = falseWay('kagami1', J1);
const kagami2 = falseWay('kagami2', J2);
const kagami3 = falseWay('kagami3', J3);

/**
 * §5.3 the glass side way `ura` (record ③): from its buffer (s 0) to main 3250 (it merges there). Walked from the
 * mouth backwards (a left turn going backwards, R60 40°, then 25 m) and turned round.
 */
const URA_AT = 3250;
const uraMouth = main.at(URA_AT);
const uraBack = walk(uraMouth.x, uraMouth.z, uraMouth.h / RAD + 180, [['L', 60, 40], ['S', 25]], () => 0);
const uraLength = uraBack[uraBack.length - 1].s;
const ura = new Line(
  'ura',
  uraBack
    .slice()
    .reverse()
    .map((p) => ({ ...p, s: uraLength - p.s })),
);
const LINES = { main, kagami1, kagami2, kagami3, ura };

// ---------------------------------------------------------------------------------------------------------------
// Places (§3, §5.1, §5.4–§5.6)
// ---------------------------------------------------------------------------------------------------------------

const at = (s, lateral = 0, up = 0, line = main) => {
  const q = line.point(s, lateral, up);
  return [round(q.x), round(q.y), round(q.z)];
};
const onMain = (s, lateral = 0, heightFromRail) => ({ railId: 'main', at: s, ...(lateral ? { lateral } : {}), ...(heightFromRail !== undefined ? { heightFromRail } : {}) });

const STATIONS = [
  { id: 'kagamiguchi', name: 'かがみぐちえき', railId: 'main', at: 45, platformSide: 'left' },
  { id: 'kirakira', name: 'きらきらえき', railId: 'main', at: 1250, platformSide: 'right' },
  { id: 'meiro', name: 'めいろえき', railId: 'main', at: 2250, platformSide: 'left' },
  { id: 'oogagami', name: 'おおかがみえき', railId: 'main', at: 3500, platformSide: 'left' },
];
const FLIP1 = { from: 840, to: 1060 };
const FLIP2 = { from: 2400, to: 2640 };
const GAP = { from: 2800, to: 2806 };
const HANARE = { from: 690, to: 698 };
const TOBIRA = 1700;
const KURUTTO = { at: 3070, lateral: -14, height: 5 };

/** A mirror standing at world (x, z) whose glass faces the world point (tx, tz). */
function mirrorAt(id, [x, , z], [tx, , tz], extra = {}, y = 0) {
  const rot = Math.atan2(tx - x, tz - z) / RAD;
  return { type: 'mirror', params: { id, look: 'frame', position: [round(x, 1), y, round(z, 1)], rotationY: round(rot, 1), ...extra } };
}
/**
 * The cutscene mirrors stand on the ground with their glass down to it (their feet sunk): a figure standing in front
 * shows in the glass from head to toe (on its 1.2 m feet the glass would start above her head).
 */
const SUNK = round(GROUND_Y - 1.2, 1);
/** A false way's mirror: 16 m past its end, facing straight back up it (§5.2). */
function forkMirror(id, way, junction, extra = {}) {
  const end = way.at(way.length);
  const p = [end.x + Math.sin(end.h) * 16, 0, end.z + Math.cos(end.h) * 16];
  const t = [end.x - Math.sin(end.h) * 60, 0, end.z - Math.cos(end.h) * 60];
  return mirrorAt(id, p, t, { width: 22, height: 14, railId: way.id, junction, ...extra });
}
/**
 * The two cutscene mirrors (M2's m-meiro, the ending's big m-oo) stand beside the line just ahead of the stopped train,
 * `MIRROR_SHOT.lateral` m to the right, their glass facing the rail (a 20 m mirror turning round clears the rail). Sakasa
 * stands `front` m before the glass; the camera, low (a child's eye), `cam` m before it and `side` m further along,
 * looks at her reflection: the mirror Sakasa, with her hearts and stars, fills about a third of the screen height (a
 * 60° view, some 4 m off), Sakasa herself looking away at the left, the line's bubble below them both. (§5.5 and §12
 * put the mirrors further off: there the mirror Sakasa was a few pixels tall.)
 */
const MIRROR_SHOT = { lateral: 11, front: 1, cam: 2.2, side: 2.2, eye: 0.4, look: 0.15 };
const shot = (sMirror) => {
  const L = MIRROR_SHOT.lateral;
  return {
    mirror: at(sMirror, L),
    faces: at(sMirror, 0),
    sakasa: { at: sMirror, lateral: L - MIRROR_SHOT.front },
    camera: at(sMirror + MIRROR_SHOT.side, L - MIRROR_SHOT.cam, MIRROR_SHOT.eye),
    // Her reflection's middle (as far behind the glass as she stands before it).
    image: at(sMirror, L + MIRROR_SHOT.front, MIRROR_SHOT.look),
  };
};
const MEIRO = shot(2270);
const OO_SHOT = shot(3538);
const OO = OO_SHOT.mirror;
const MIRRORS = {
  'm-start': mirrorAt('m-start', at(150, 22), at(55), { width: 16, height: 11 }),
  'm-glass': mirrorAt('m-glass', at(560, 16), at(495), { width: 20, height: 13, reflectRadius: 100 }),
  'm-fork1': forkMirror('m-fork1', kagami1, 'j-kagami1', { lightHint: true }),
  'm-fork2': forkMirror('m-fork2', kagami2, 'j-kagami2'),
  'm-meiro': mirrorAt('m-meiro', MEIRO.mirror, MEIRO.faces, { width: 20, height: 14, reflect: ['train', 'cutscene'] }, SUNK),
  'm-bridge': mirrorAt('m-bridge', at(2850, -18), at(2790), { width: 20, height: 13 }),
  'm-turn': mirrorAt('m-turn', at(KURUTTO.at, KURUTTO.lateral), at(2985), { width: 12, height: 9, facing: false, turnFrom: 180, back: 'swirl' }),
  'm-ura': mirrorAt('m-ura', at(3270, 26), at(33, 0, 0, ura), { width: 22, height: 14, reflectRadius: 90 }),
  'm-oo': mirrorAt('m-oo', OO, OO_SHOT.faces, { width: 20, height: 16, reflect: ['train', 'cutscene'] }, SUNK),
};

const GIMMICKS = [
  MIRRORS['m-start'],
  MIRRORS['m-glass'],
  { type: 'letter-sign', params: { onRail: { railId: 'main', at: 800, lateral: -5 }, rotationY: 180, text: 'ようこそ', mirror: true } },
  { type: 'mirror-flip', railId: 'main', from: FLIP1.from, to: FLIP1.to, params: { id: 'kagami-1', gate: 'open' } },
  MIRRORS['m-fork1'],
  MIRRORS['m-fork2'],
  MIRRORS['m-meiro'],
  // M3's way in says nothing (the gate's own lines said it: §6.7).
  { type: 'mirror-flip', railId: 'main', from: FLIP2.from, to: FLIP2.to, params: { id: 'kagami-2', gate: 'whistle', line: null } },
  MIRRORS['m-bridge'],
  MIRRORS['m-turn'],
  MIRRORS['m-ura'],
  MIRRORS['m-oo'],
  { type: 'magnet', railId: 'main', from: 195, params: { id: 'hoshi-1', kind: 'pick', look: 'star', lateral: 6, height: 2, line: 'また てつの ほし！' } },
  { type: 'magnet', railId: 'main', from: 395, params: { id: 'hoshi-2', kind: 'pick', look: 'star', lateral: -8, height: 4, line: null } },
  {
    type: 'magnet',
    railId: 'main',
    from: HANARE.from,
    to: HANARE.to,
    params: {
      id: 'hanare-1',
      kind: 'bridge',
      look: 'rail-piece',
      piece: { lateral: -9, height: 0, rotationY: 60 },
      line: 'レールが はなれてる！ ひっぱろう！',
      done: 'つながった！',
      rewind: { railId: 'main', at: 630 },
    },
  },
  { type: 'magnet', railId: 'main', from: TOBIRA, params: { id: 'tobira-1', kind: 'gate', look: 'door', line: 'てつの とびら！ ひっぱろう！', done: 'あいた！' } },
  { type: 'magnet', railId: 'main', from: 2540, params: { id: 'hoshi-3', kind: 'pick', look: 'star', lateral: 5, height: 2, line: 'かがみの なかにも ほし！' } },
  { type: 'magnet', railId: 'main', from: 2600, params: { id: 'hoshi-4', kind: 'pick', look: 'star', lateral: -5, height: 3, line: null } },
  {
    type: 'magnet',
    railId: 'main',
    from: KURUTTO.at,
    params: {
      id: 'kurutto',
      kind: 'turn',
      look: 'mirror',
      lateral: KURUTTO.lateral,
      height: KURUTTO.height,
      junction: 'j-kagami3',
      mirror: 'm-turn',
      line: 'そっぽの かがみ！ じしゃくで くるっ！',
      done: 'くるっ！ ほんとうの みちが みえた！',
    },
  },
  { type: 'camera', railId: 'main', from: 630, to: 718, params: { mode: 'chase' } },
];

const JUNCTIONS = [
  { id: 'j-kagami1', railId: 'main', at: J1, left: 'kagami1', right: 'main', default: 'left', signReversed: true, phantom: true },
  { id: 'j-kagami2', railId: 'main', at: J2, left: 'main', right: 'kagami2', default: 'right', signReversed: true, phantom: true },
  { id: 'j-kagami3', railId: 'main', at: J3, left: 'kagami3', right: 'main', default: 'left', signReversed: true, phantom: true },
];

const RECORDS = [
  {
    id: 'kagami-kanban',
    name: 'かがみの なかの かんばん',
    note: 'かがみの なかで よめた かんばん',
    requires: null,
    model: 'mirror-board',
    hint: 'あっ！ かんばんが よめる！',
    onRail: { railId: 'main', at: 965, lateral: -4 },
    rotationY: 180,
  },
  {
    id: 'hand-mirror',
    name: 'てつの てかがみ',
    note: 'たかい たなから ひきよせた',
    requires: 'magnetLight',
    model: 'hand-mirror',
    hint: 'たなに てかがみ！ ひっぱろう！',
    onRail: { railId: 'main', at: 1830, lateral: 14, heightFromRail: 9.3 },
  },
  {
    id: 'sakasa-doodle',
    name: 'かがみの うらの らくがき',
    note: 'かがみの うらに かくして あった え',
    requires: 'reverse',
    model: 'sakasa-doodle',
    hint: 'うしろに らくがき！',
    onRail: { railId: 'ura', at: 12, lateral: -2, heightFromRail: 0.8 },
  },
];

const MISSIONS = [
  {
    id: 'm1',
    type: 'repair',
    title: 'じしゃくで つなごう',
    steps: [{ stationId: 'kirakira' }],
    lines: {
      start: 'かがみの せかいの せんろを\nじしゃくで なおそう！',
      flipIn: 'かがみの なかに はいった！\nぜんぶ はんたい！',
      stationNear: 'きらきらえきだ。ゆっくり！',
      complete: 'つなげた！ じしゃく じょうず！',
    },
    hints: [
      { railId: 'main', at: 430, text: 'あれ？ せんろが すけてる…' },
      { railId: 'main', at: 470, text: 'かがみを みて！ ちゃんと ある！' },
      { railId: 'main', at: 540, text: 'かがみに うつる せんろが ほんもの！' },
      { railId: 'main', at: 760, text: 'あれ？ よめない じ…' },
      { railId: 'main', at: 805, text: 'かがみに はいっちゃう〜！' },
    ],
  },
  {
    id: 'm2',
    type: 'pickup',
    title: 'まぼろしの みち',
    steps: [{ stationId: 'meiro', board: 2, say: 'かがみの めいろで まよったの', reply: 'どうぞ！ のって のって！' }],
    lines: {
      start: 'めいろえきで まいごの こが\nまってるって！',
      mirrorNear: 'まっすぐの せんろ、ピンク…？\nライトで てらして みよう！',
      mirrorFlash: 'きらーん！ かがみを みて！',
      mirrorFake: 'あれ？ かがみに せんろが ない！',
      signRevealed: 'まぼろし だった！ こっちが ほんもの！',
      deadEnd: 'まぼろし だった〜！\nかがみを みてね',
      stationNear: 'めいろえきだ。ゆっくり！',
      complete: 'ふたりとも のせた！',
    },
    hints: [
      { railId: 'main', at: 1560, text: 'ピンクの せんろは まぼろし！' },
      { railId: 'main', at: 1900, text: 'また まぼろし かも…？' },
    ],
    onComplete: 'glimpse',
  },
  {
    id: 'm3',
    type: 'deliver',
    title: 'かがみの なかへ',
    steps: [{ stationId: 'oogagami', alight: 2, say: 'ありがとう！ たのしかった！' }],
    lines: {
      start: 'おおかがみえきまで\nふたりを とどけよう！',
      gapNear: '{speed}で ジャンプ！',
      deadEnd: 'まぼろし だった〜！\nかがみを じしゃくで くるっ！',
      stationNear: 'おおかがみえきだ。ゆっくり！',
      complete: 'とどいた！',
    },
    hints: [
      { railId: 'main', at: 2700, text: 'かがみを みて！ きれてる！' },
      { railId: 'main', at: 3200, text: 'かがみに ひみつの せんろ…？', unless: 'reverse' },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Cutscenes (§12)
// ---------------------------------------------------------------------------------------------------------------

const MIRROR_SAKASA = 'かがみの サカサ';
const stand = GROUND_Y;
const cam = (from, to, reach = 1) => ({ camera: 'fixed', at: from, lookAt: to, reach });
const up = ([x, y, z], dy) => [x, round(y + dy), z];
const opening = [
  { caption: 'かがみのせかい', seconds: 2.5 },
  // From the platform: the mirror m-start, the Wonder train standing in it.
  cam(at(30, -8, 5), up(MIRRORS['m-start'].params.position, 6)),
  { say: 'わあ… かがみの せかいだ！', emote: 'jump' },
  { say: 'どこを みても ワンダーごう！', emote: 'cheer' },
  { camera: 'cab' },
  { say: 'ライトに じしゃくを つけた！', emote: 'jump' },
  { unlock: 'magnetLight' },
  // On the mirror shelf 40 m ahead (right 7, on its board).
  { spawn: 'tut-star', model: 'iron-star-small', onRail: onMain(85, 7, 3.4) },
  { say: 'おす たびに ライト、じしゃく、けす' },
  { press: 'magnet', target: 'tut-star', say: 'もう いちど おすと じしゃく！' },
  { say: 'くっついた！ じしゃくライト！', emote: 'cheer' },
  { say: 'みどりに ひかったら じしゃくだよ' },
];

/** The glimpse: at めいろえき, from the platform towards m-meiro. Sakasa looks away; the one in the mirror waves. */
const G = MEIRO.sakasa;
const glimpse = [
  cam(MEIRO.camera, MEIRO.image),
  { spawn: 'sakasa', model: 'amanojaku', onRail: onMain(G.at, G.lateral, stand), rotationY: 180, mirror: 'hide' },
  { spawn: 'sakasa-mirror', model: 'amanojaku-wave', onRail: onMain(G.at, G.lateral, stand), rotationY: -90, mirror: 'only' },
  { say: 'あれ？ サカサ だ！', emote: 'jump' },
  { say: 'わあ！ かがみの サカサ、にこにこ！', emote: 'jump' },
  { fx: 'hearts', id: 'sakasa-mirror' },
  // She looks at her reflection for a moment and blushes.
  { remove: 'sakasa' },
  { spawn: 'sakasa', model: 'amanojaku-blush', onRail: onMain(G.at, G.lateral, stand), rotationY: -60, mirror: 'hide' },
  { wait: 0.6 },
  { remove: 'sakasa' },
  { spawn: 'sakasa', model: 'amanojaku', onRail: onMain(G.at, G.lateral, stand), rotationY: 180, mirror: 'hide' },
  { move: 'sakasa', onRail: onMain(G.at, G.lateral, stand + 0.4), seconds: 0.2 },
  { move: 'sakasa', onRail: onMain(G.at, G.lateral, stand), seconds: 0.2 },
  { say: 'こ、こんにちは〜！', who: 'amanojaku' },
  { remove: 'sakasa-mirror' },
  // Off along the mirror's front first (never through the glass), then away from the line.
  { move: 'sakasa', onRail: onMain(G.at - 14, G.lateral, stand), seconds: 1.2 },
  { move: 'sakasa', onRail: onMain(G.at - 20, 60, stand), seconds: 2.5 },
  { remove: 'sakasa' },
  { say: 'サカサ、てれてる みたい', emote: 'tilt' },
];

/** The ending at おおかがみえき: the mirror Sakasa's true wish, the big mirror turned over, the notes in a mirror. */
const E = OO_SHOT.sakasa;
const PICO = { at: 3481, lateral: -5, height: 1.1 };
const STAND = { at: 3478, lateral: -6.5, height: 1.1 };
const ending = [
  // Scene 1: from the platform towards the big mirror m-oo.
  cam(OO_SHOT.camera, OO_SHOT.image),
  { spawn: 'sakasa', model: 'amanojaku', onRail: onMain(E.at, E.lateral, stand), rotationY: 180, mirror: 'hide' },
  { spawn: 'sakasa-mirror', model: 'amanojaku-shy', onRail: onMain(E.at, E.lateral, stand), rotationY: -90, mirror: 'only' },
  { say: 'あれ？ かがみに サカサ…', emote: 'tilt' },
  { fx: 'hearts', id: 'sakasa-mirror' },
  { say: 'ほんとうは のりたい', who: 'amanojaku', name: MIRROR_SAKASA, icon: 'ride' },
  { say: 'サカサの きもち…！', emote: 'jump' },
  // Scene 2: closer. She starts, says goodbye (her hello), and turns the big mirror over (never breaks it).
  cam(at(3512, -4, 3), up(OO, 4)),
  { move: 'sakasa', onRail: onMain(E.at, E.lateral, stand + 0.4), seconds: 0.2 },
  { move: 'sakasa', onRail: onMain(E.at, E.lateral, stand), seconds: 0.2 },
  { say: 'さ、さようなら！', who: 'amanojaku' },
  { remove: 'sakasa-mirror' },
  { fx: 'mirrorTurn', mirror: 'm-oo', to: 'back' },
  { say: 'こ、こんにちは〜！', who: 'amanojaku' },
  { move: 'sakasa', onRail: onMain(E.at - 14, E.lateral, stand), seconds: 1.2 },
  { move: 'sakasa', onRail: onMain(E.at - 20, 60, stand), seconds: 2.5 },
  { remove: 'sakasa' },
  // Scene 3: the partner gets off and holds 3-1's and 3-3's notes up to the platform's little mirror.
  { door: 'open' },
  cam(at(3471, -13, 3.2), at(STAND.at + 1.5, -5.6, 1.8)),
  { spawn: 'pico', model: 'partner', onRail: onMain(PICO.at, PICO.lateral, PICO.height), rotationY: 180 },
  { spawn: 'notes', model: 'note-pink', onRail: onMain(PICO.at - 0.7, PICO.lateral, PICO.height + 0.9), rotationY: 180 },
  { say: 'そうだ！ あの てがみ！', emote: 'jump' },
  { card: { title: 'のせて', button: 'うん', mirror: 'reflect', notes: 2 } },
  { remove: 'notes' },
  { say: 'のせて… だったんだ！', emote: 'jump' },
  { say: 'サカサ、でんしゃに のりたかったんだね' },
  { say: 'たんけんたいに はいりたかったんだね', emote: 'jump' },
  { remove: 'pico' },
  { door: 'close' },
  { card: { title: '5しょう おしまい！', button: 'つぎへ', icon: 'badge' } },
];

// ---------------------------------------------------------------------------------------------------------------
// Props (§5.1, §8)
// ---------------------------------------------------------------------------------------------------------------

const rand = mulberry32(53);
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
/** Keeps the mirrors, the gates' fronts, the glass lake and the platforms' far sides clear. */
const reserved = [
  ...Object.values(MIRRORS).map((m) => ({ x: m.params.position[0], z: m.params.position[2], r: (m.params.width ?? 22) / 2 + 4 })),
  ...[FLIP1.from, FLIP1.to, FLIP2.from, FLIP2.to].map((s) => {
    const q = main.at(s);
    return { x: q.x, z: q.z, r: 16 };
  }),
  { x: main.at(500).x, z: main.at(500).z, r: 55 },
  ...STATIONS.map((st) => {
    const q = main.point(st.at - 20, st.platformSide === 'left' ? -10 : 10);
    return { x: q.x, z: q.z, r: 18 };
  }),
  // The shelves, and where the cutscenes' figures walk off.
  { ...(() => { const q = main.point(85, 7); return { x: q.x, z: q.z }; })(), r: 4 },
  { ...(() => { const q = main.point(1830, 14); return { x: q.x, z: q.z }; })(), r: 5 },
  { ...(() => { const q = main.point(2280, 45); return { x: q.x, z: q.z }; })(), r: 30 },
  { ...(() => { const q = main.point(3540, 30); return { x: q.x, z: q.z }; })(), r: 30 },
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
    if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + footprint + 1)) continue;
    placed.push({ x: q.x, z: q.z, r: footprint });
    addWorld(models[Math.floor(rand() * models.length)], [q.x, GROUND_Y, q.z], { rotationY: round(rand() * 360) });
    n++;
  }
  if (n < count) problems.push(`${models.join('/')}: placed ${n} of ${count}`);
}

// Glass trees and sparkly rocks all along (§2, §16: about 220 trees, drawn together).
scatter(['crystal-tree-a', 'crystal-tree-b', 'crystal-tree-a'], 200, { zones: [['main', 0, 3560]], lat: [9, 70], footprint: 2.5 });
scatter(['crystal-rock'], 45, { zones: [['main', 0, 3560]], lat: [7, 40], footprint: 1.5, minRail: 7 });
// Mirror pillars (they shine, they reflect nothing) by the gates and along the way.
for (const [s, lat] of [
  [FLIP1.from - 30, 9],
  [FLIP1.to + 30, -9],
  [FLIP2.from - 30, -9],
  [FLIP2.to + 30, 9],
  [1300, 12],
  [1780, -12],
  [1830, 20],
  [2150, 12],
  [2900, 12],
  [3350, -12],
]) addOnRail('mirror-pillar', 'main', s, { lateral: lat, height: GROUND_Y });
// The mirror shelves: the opening's star waits on the first; record ② on the tall one (9 m).
addOnRail('mirror-shelf', 'main', 85, { lateral: 7, height: GROUND_Y, rotationY: -90 });
addOnRail('mirror-shelf', 'main', 1830, { lateral: 14, height: GROUND_Y, rotationY: -90, scale: 3.05 });
// Clouds under the phantom bridge (1-3's).
addOnRail('cloud-a', 'main', (GAP.from + GAP.to) / 2, { height: -7 });
addOnRail('cloud-b', 'main', GAP.from - 8, { lateral: 6, height: -9 });
// The platform's little mirror at おおかがみえき (the ending's scene 3).
addOnRail('mirror-stand-small', 'main', STAND.at, { lateral: STAND.lateral, height: STAND.height });
// The glass side way's end stop: since PR8a rail-mesh.ts draws a buffer at the start of a rail that joins nothing
// (§0.9 の 22), so no prop here any more.

/** The lavender mirror lake under the glass bridge. */
const lake = [];
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const c = main.at(500);
  lake.push([round(c.x + Math.cos(a) * 46 * (1 + 0.12 * Math.sin(i * 1.7))), round(c.z + Math.sin(a) * 70 * (1 + 0.1 * Math.cos(i * 1.3)))]);
}
GIMMICKS.push({ type: 'ice-sheet', params: { outline: lake, y: round(GROUND_Y + 0.05, 2), color: '#e8e0fb' } });

// ---------------------------------------------------------------------------------------------------------------
// Checks (§5.7, §6)
// ---------------------------------------------------------------------------------------------------------------

check(Math.abs(main.length - 3560) < 0.5, `main length ${main.length.toFixed(1)} (table 3,560.0)`);
{
  const { total, worst } = gameCurveCheck(main, [45, 195, 470, 530, 690, 840, 965, 1060, 1250, J1, TOBIRA, 1830, J2, 2250, 2400, 2640, GAP.from, KURUTTO.at, J3, URA_AT, 3500]);
  check(Math.abs(total - main.length) < 0.6 && worst.d < 0.3, `main as the game's curve: ${total.toFixed(2)} m, key places at most ${worst.d.toFixed(2)} m off (main ${worst.s})`);
}
for (const [s, x, z, name] of [
  [560, 0, 560, 'straight end'],
  [1500, -279.6, 1440.9, 'fork 1'],
  [2000, -661.6, 1755.5, 'fork 2'],
  [2300, -759.1, 2035.6, 'meiro straight end'],
  [3100, -1070.5, 2768.2, 'fork 3'],
  [3560, -1390.9, 3092.8, 'end'],
]) {
  const q = main.at(s);
  check(Math.hypot(q.x - x, q.z - z) < 1.5, `main ${s} (${name}) at [${q.x.toFixed(1)}, ${q.z.toFixed(1)}] (table [${x}, ${z}])`);
}
for (const way of [kagami1, kagami2, kagami3]) {
  check(Math.abs(way.length - FALSE_WAY) < 0.3, `${way.id} ${way.length.toFixed(1)} m (86.9)`);
  const end = way.at(way.length);
  let near = Infinity;
  for (let s = 0; s <= main.length; s += 1) {
    const q = main.at(s);
    near = Math.min(near, Math.hypot(q.x - end.x, q.z - end.z));
  }
  check(near > 15, `${way.id} ends ${near.toFixed(1)} m from main (§5.2: 18)`);
}
{
  check(Math.abs(ura.length - 66.9) < 0.3, `ura ${ura.length.toFixed(1)} m (66.9)`);
  const back = ura.at(0);
  check(Math.hypot(back.x + 1137.8, back.z - 2824.3) < 1.5, `ura's buffer end at [${back.x.toFixed(1)}, ${back.z.toFixed(1)}] (table [-1137.8, 2824.3])`);
  const mouth = ura.at(ura.length);
  const m = main.at(URA_AT);
  check(Math.hypot(mouth.x - m.x, mouth.z - m.z) < 0.5, `ura merges on main ${URA_AT} ${Math.hypot(mouth.x - m.x, mouth.z - m.z).toFixed(2)} m off`);
  const { worst } = gameCurveCheck(ura, [0, 12, ura.length]);
  check(worst.d < 0.3, `ura as the game's curve: ${worst.d.toFixed(2)} m off`);
  const mu = MIRRORS['m-ura'].params.position;
  check(Math.hypot(mu[0] - back.x, mu[2] - back.z) <= 90, `m-ura sees ura's far end (${Math.hypot(mu[0] - back.x, mu[2] - back.z).toFixed(1)} m, radius 90)`);
}
{
  const g = MIRRORS['m-glass'].params.position;
  const d = [GLASS.from, GLASS.to].map((s) => Math.hypot(main.at(s).x - g[0], main.at(s).z - g[2]));
  check(Math.max(...d) <= 100, `m-glass to the glass: ${d.map((v) => v.toFixed(1)).join('–')} m (radius 100)`);
  const b = MIRRORS['m-bridge'].params.position;
  const e = [GAP.from, GAP.to].map((s) => Math.hypot(main.at(s).x - b[0], main.at(s).z - b[2]));
  check(Math.max(...e) <= 80, `m-bridge to the cut: ${e.map((v) => v.toFixed(1)).join('–')} m (radius 80)`);
}
// §6.1 the magnet windows: every target's pull ends clear of a station's braking (80 m before its stop line).
for (const g of GIMMICKS.filter((x) => x.type === 'magnet')) {
  const s = g.from;
  for (const st of STATIONS) check(!(s - 80 < st.at && s > st.at - 80) || st.at > s + 40, `${g.params.id} (${s}) is clear of ${st.id}'s braking`);
}
check(KURUTTO.at + 5 <= J3 - 40 + 15, `kurutto's pull ends before fork 3 − 40 m (§6.1)`);
check(GAP.from - 80 > FLIP2.to, 'a fall at the phantom bridge puts the train back outside the mirror world (§6.4)');
check(J1 - 80 > FLIP1.to && J2 - 80 > FLIP1.to, 'a wrong turn puts the train back outside the mirror world');
check(FLIP2.from - 2250 >= 150, 'the whistle gate is 150 m after めいろえき (§6.2)');

{
  const texts = [];
  for (const m of MISSIONS) {
    for (const v of Object.values(m.lines)) texts.push(...v.split('\n'));
    for (const h of m.hints) texts.push(h.text);
    for (const st of m.steps) texts.push(...[st.say, st.reply].filter(Boolean));
  }
  for (const g of GIMMICKS) for (const k of ['line', 'done']) if (g.params?.[k]) texts.push(g.params[k]);
  for (const r of RECORDS) texts.push(r.name, r.note, ...(r.hint ? [r.hint] : []));
  for (const steps of [opening, glimpse, ending]) for (const st of steps) if (st.say) texts.push(st.say);
  const long = texts.map((t) => t.replace('{speed}', 'はやい')).filter((t) => [...t].length > 20);
  check(long.length === 0, `lines over 20 characters: ${long.length ? long.join(' / ') : 'none'} (${texts.length} lines)`);
  const counts = {};
  for (const p of props) counts[p.model] = (counts[p.model] ?? 0) + 1;
  report.push(`props ${props.length}: ${Object.entries(counts).map(([m, n]) => `${m} ${n}`).join(', ')}`);
  report.push(`lengths: ${Object.values(LINES).map((l) => `${l.id} ${l.length.toFixed(1)}`).join(', ')}`);
  for (const [id, m] of Object.entries(MIRRORS)) report.push(`${id}: [${m.params.position.join(', ')}] ${m.params.rotationY}°`);
}

// ---------------------------------------------------------------------------------------------------------------
// The stage (§7)
// ---------------------------------------------------------------------------------------------------------------

const stage = {
  schemaVersion: 1,
  id: '5-3',
  title: 'かがみのせかい',
  chapter: 5,
  unlock: { requires: ['5-2'], purchase: null },
  unlocks: ['magnetLight'],
  environment: {
    sky: { top: '#b9b4f0', bottom: '#fbeefd' },
    fog: { color: '#f1ebfb', near: 220, far: 700 },
    lighting: 'day',
    ground: { y: GROUND_Y, size: 4200, color: '#e4def4' },
    bgm: 'kagami',
    ambience: 'mirror',
    fall: 'cloud',
    surface: 'ice',
  },
  start: { railId: 'main', at: 45, direction: 1 },
  rails: [
    {
      id: 'main',
      points: main.points(),
      glass: [GLASS],
      gaps: [{ from: GAP.from, to: GAP.to, hint: 'fast', pit: false, phantom: true, line: 'まぼろしの はし だった〜！' }],
      // The glass bridge's ramps stand on rock; the glass stretch itself floats (the loader leaves it out).
      base: [{ look: 'rock', toGround: true, from: 410, to: 590 }],
      end: { type: 'buffer' },
    },
    { id: 'kagami1', points: kagami1.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'kagami2', points: kagami2.points(), deadEnd: true, end: { type: 'buffer' } },
    { id: 'kagami3', points: kagami3.points(), deadEnd: true, end: { type: 'buffer' } },
    // The glass runs its whole length (to just short of the game's curve's end).
    { id: 'ura', points: ura.points(), glass: [{ from: 0, to: Math.floor(gameCurveCheck(ura, [0]).total * 10 - 1) / 10 }], end: { type: 'merge', railId: 'main', at: URA_AT } },
  ],
  junctions: JUNCTIONS,
  stations: STATIONS,
  props,
  actors: [],
  records: RECORDS,
  missions: MISSIONS,
  gimmicks: GIMMICKS,
  opening: 'opening',
  ending: 'ending',
  cutscenes: { opening, glimpse, ending },
};

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY && !problems.length) {
  writeFileSync(OUT, `${pretty(stage)}\n`);
  console.log(`wrote ${OUT}`);
}
