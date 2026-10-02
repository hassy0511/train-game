#!/usr/bin/env node
/**
 * Stage 1-3 "くものうえ", its うしろむき part only (docs/PHASE9_CHAPTER5_6.md 第 3 部 A12.2, PR9): record ③
 * `upside-island` "さかさじまの うら" hung from nowhere until now (57.7 m from the nearest rail). This script writes into
 * the hand-written src/stages/1-3.json what reaches it reversing:
 *   - the back siding `ura` (71 m): from flip 340, just past さかさのえき, out to the island's outside (+X), a right
 *     turn going backwards (R40, 90°) climbing 6 m, then 8 m straight to its buffer;
 *   - the back junction `ura-guchi` on flip 340 (as seen reversing, heading south, +X is on the right);
 *   - a small upside-down island over the siding's end (`island-c` turned over) and two islands under the siding;
 *   - the record moved under the upside-down island, with its new picture `upside-flower` and note.
 * Everything else in the file is left as it is. Its own elements (rail, junction, record by id; props by their
 * tag "ura-1-3") are replaced on every run, so running it again changes nothing.
 *
 *   node scripts/layout-1-3-ura.mjs         write src/stages/1-3.json and print the checks
 *   node scripts/layout-1-3-ura.mjs --dry   print the checks only
 *
 * Conventions (scripts/layout-lib.mjs): +Z north, y up, heading 0 = +Z, a left turn towards +X; `lateral` is positive
 * to the right of the direction of travel.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatmullRomCurve3, Vector3 } from 'three';
import { keyed, Line, pretty, RAD, round, walk } from './layout-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'src/stages/1-3.json');
const DRY = process.argv.includes('--dry');
const TAG = 'ura-1-3';

const report = [];
const problems = [];
const check = (ok, text) => {
  report.push(`${ok ? 'ok ' : 'NG '} ${text}`);
  if (!ok) problems.push(text);
};

const text = readFileSync(FILE, 'utf8');
const stage = JSON.parse(text);
const railDef = (id) => stage.rails.find((r) => r.id === id);

/** A rail as the game draws it: the centripetal Catmull-Rom through its points, by arc length (src/rail/rail.ts). */
function gameRail(def) {
  const curve = new CatmullRomCurve3(
    def.points.map(([x, y, z]) => new Vector3(x, y, z)),
    false,
    'centripetal',
  );
  curve.arcLengthDivisions = Math.ceil(curve.getLength() / 0.25);
  const length = curve.getLength();
  return {
    length,
    at(s) {
      const u = Math.min(1, Math.max(0, s / length));
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      return { x: p.x, y: p.y, z: p.z, h: Math.atan2(t.x, t.z), climb: t.y };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The siding (A12.2)
// ---------------------------------------------------------------------------------------------------------------

const MOUTH = 340;
const flip = gameRail(railDef('flip'));
const mouth = flip.at(MOUTH);
const RADIUS = 40;
const TURN = 90;
const STRAIGHT = 8;
const RISE = 6;
const ARC = RADIUS * TURN * RAD;
// Walked from the mouth backwards (heading south, a right turn towards +X), climbing over the arc, then turned round.
const back = walk(mouth.x, mouth.z, mouth.h / RAD + 180, [['R', RADIUS, TURN], ['S', STRAIGHT]], keyed([[0, 0], [ARC, RISE]]));
const length = back[back.length - 1].s;
const ura = new Line(
  'ura',
  back
    .slice()
    .reverse()
    .map((p) => ({ ...p, y: p.y + mouth.y, s: length - p.s })),
);

const BUFFER = ura.at(0);
const UPSIDE_ISLAND = [round(BUFFER.x - 4, 1), 17, round(BUFFER.z, 1)];
// The flower hangs right under the island's grass (A12.2 had it 3.5 m lower, in the air); its origin is the stem's root.
const RECORD = [UPSIDE_ISLAND[0], UPSIDE_ISLAND[1] - 0.1, UPSIDE_ISLAND[2]];
const UNDER = [ura.point(24, 0, -1.2), ura.point(6, 0, -1)].map((q) => [round(q.x), round(q.y, 1), round(q.z)]);

// ---------------------------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------------------------

check(Math.hypot(mouth.x - 6, mouth.z - 536) < 3 && Math.abs(mouth.y) < 0.1, `flip ${MOUTH} at [${mouth.x.toFixed(1)}, ${mouth.y.toFixed(1)}, ${mouth.z.toFixed(1)}] heading ${(mouth.h / RAD).toFixed(1)}° (A12.2: [6, 0, 536], north)`);
check(Math.abs(length - 71) < 1.5, `ura ${length.toFixed(1)} m (A12.2: about 71)`);
check(Math.hypot(BUFFER.x - 54, BUFFER.z - 496) < 3 && Math.abs(BUFFER.y - 6) < 0.1, `ura's buffer end at [${BUFFER.x.toFixed(1)}, ${BUFFER.y.toFixed(1)}, ${BUFFER.z.toFixed(1)}] (A12.2: [54, 6, 496])`);
{
  let steep = 0;
  for (let s = 1; s <= length; s++) steep = Math.max(steep, Math.abs(ura.at(s).y - ura.at(s - 1).y));
  check(steep <= 0.15, `ura's steepest metre ${(steep * 100).toFixed(1)}% (A12.2 about 12%; the climb is looks only, no slope)`);
}
{
  const end = ura.at(length);
  const d = Math.abs(((end.h - mouth.h + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) / RAD;
  check(d < 1, `the siding meets flip at ${d.toFixed(2)}° (A8.5: 30° at most)`);
}
{
  // The tail car's centre at the buffer (6.5 m in) to the record (25 m at most, RECORD).
  const tail = ura.at(6.5);
  const d = Math.hypot(tail.x - RECORD[0], tail.y - RECORD[1], tail.z - RECORD[2]);
  check(d <= 25, `from the tail car at the buffer to the record ${d.toFixed(1)} m (25 m at most; A12.2: about 8)`);
}
for (const st of stage.stations.filter((x) => x.railId === 'flip')) check(Math.abs(st.at - MOUTH) >= 40, `${st.id}'s stop line ${Math.abs(st.at - MOUTH)} m from the mouth (40 m at least)`);
{
  // The siding keeps clear of the rails it does not join (the flip's loop runs underneath at y −20).
  let near = Infinity;
  for (const def of stage.rails.filter((r) => r.id !== 'ura')) {
    const g = gameRail(def);
    for (let s = 0; s <= g.length; s += 1) {
      const q = g.at(s);
      for (let t = 0; t <= length - 25; t += 1) {
        const p = ura.at(t);
        near = Math.min(near, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
      }
    }
  }
  check(near >= 5, `the siding's far part keeps ${near.toFixed(1)} m from every other rail (5 m at least)`);
}

// ---------------------------------------------------------------------------------------------------------------
// What goes into 1-3.json
// ---------------------------------------------------------------------------------------------------------------

const RAIL = { id: 'ura', points: ura.points(), end: { type: 'merge', railId: 'flip', at: MOUTH } };
const JUNCTION = { id: 'ura-guchi', railId: 'flip', at: MOUTH, back: true, left: 'flip', right: 'ura', default: 'left', line: 'うしろに わきみちが ある！' };
const record = stage.records.find((r) => r.id === 'upside-island');
const RECORD_DEF = {
  id: 'upside-island',
  name: record?.name ?? 'さかさじまの うら',
  note: 'うしろむきに はしれたら いけるかも…',
  requires: 'reverse',
  model: 'upside-flower',
  position: RECORD,
};
const PROPS = [
  { model: 'island-c', position: UPSIDE_ISLAND, rotation: [0, 0, 180], tag: TAG },
  ...UNDER.map((position, i) => ({ model: 'island-c', position, ...(i ? { rotationY: 70 } : {}), tag: TAG })),
];

/** Spans [start, end) of the top-level elements of the JSON array that follows `"key": [` in `src`. */
function arrayElements(src, key) {
  const open = src.indexOf(`"${key}": [`);
  if (open < 0) throw new Error(`no "${key}" array`);
  let i = src.indexOf('[', open) + 1;
  const out = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      if (depth === 0 && start < 0) start = i;
      continue;
    }
    if (c === '{' || c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' || c === ']') {
      if (depth === 0) return { elements: out, close: i };
      depth--;
      if (depth === 0) {
        out.push([start, i + 1]);
        start = -1;
      }
    }
  }
  throw new Error(`"${key}" array not closed`);
}

/** Replaces the elements `mine` picks in array `key` with `items` (in place of the first, else at the end). */
function upsert(src, key, mine, items) {
  const { elements, close } = arrayElements(src, key);
  const indent = '    ';
  const body = items.map((v) => indent + pretty(v, indent)).join(',\n');
  const hits = elements.filter(([a, b]) => mine(JSON.parse(src.slice(a, b))));
  if (hits.length === 0) {
    const last = elements[elements.length - 1];
    if (!last) return `${src.slice(0, close)}\n${body}\n  ${src.slice(close)}`;
    return `${src.slice(0, last[1])},\n${body}${src.slice(last[1])}`;
  }
  let out = src;
  // Remove from the end so earlier spans stay valid; the first one takes the new body.
  for (let k = hits.length - 1; k >= 0; k--) {
    const [a, b] = hits[k];
    if (k === 0) {
      out = out.slice(0, a - indent.length) + body + out.slice(b);
    } else {
      // Drop the element with the comma and line before it.
      const before = out.lastIndexOf(',', a);
      out = out.slice(0, before) + out.slice(b);
    }
  }
  return out;
}

let next = text;
next = upsert(next, 'rails', (r) => r.id === 'ura', [RAIL]);
next = upsert(next, 'junctions', (j) => j.id === 'ura-guchi', [JUNCTION]);
next = upsert(next, 'records', (r) => r.id === 'upside-island', [RECORD_DEF]);
next = upsert(next, 'props', (p) => p.tag === TAG, PROPS);
// The result must still be the same stage everywhere else.
{
  const a = JSON.parse(next);
  const strip = (s) => ({
    ...s,
    rails: s.rails.filter((r) => r.id !== 'ura'),
    junctions: s.junctions.filter((j) => j.id !== 'ura-guchi'),
    records: s.records.filter((r) => r.id !== 'upside-island'),
    props: s.props.filter((p) => p.tag !== TAG),
  });
  check(JSON.stringify(strip(a)) === JSON.stringify(strip(stage)), 'nothing else in 1-3.json changed');
}
report.push(`ura points: ${JSON.stringify(RAIL.points)}`);
report.push(`record ${JSON.stringify(RECORD)}, upside-down island ${JSON.stringify(UPSIDE_ISLAND)}, under ${JSON.stringify(UNDER)}`);

console.log(report.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
if (!DRY && !problems.length && next !== text) {
  writeFileSync(FILE, next);
  console.log(`wrote ${FILE}`);
}
