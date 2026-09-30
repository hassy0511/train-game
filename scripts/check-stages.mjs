// Build-time check of every stage file and of the あいことば layout (PHASE9_CHAPTER5_6 §0.8 の 2, §0.6). It runs in
// `npm run build`, next to check-models, so a broken stage or passcode list fails in seconds, not after the 2-hour CI.
//
//  1. Every src/stages/*.json goes through prepareStage() (src/stage/loader.ts: the validators, the rail network and
//     the ranges, the water, ice and snow layouts, the resolved props and actors) and must pass.
//  2. Every tests/stages-bad/*.json must be REJECTED, and with the message its "_expect" names. A stage that got a
//     mistake would not open, so the mistakes the validators know are kept here one by one. A fixture is either a
//     whole stage file, or a copy of a real one with edits:
//       { "_expect": "text of the error", "_base": "1-1", "_edit": [ { "path": "start.at", "value": 99999 } ] }
//     ("path" walks keys and array indexes; "delete": true removes the key instead of setting a value).
//  3. The あいことば versions in src/core/progress.ts: bits add up (5 + items + checkBits = 5 x letters, check >= 16
//     bits), no id is listed twice, a version keeps the lists of the one before it in the same order, and every clear,
//     ability and record of every playable (non-hidden) stage has a place in the latest version.
//
// The TypeScript is loaded with Vite's SSR loader (Vite is a dependency; Node cannot import .ts). A `throw` while a
// module loads does not fail `vite build`, which is why the checks are made here, on the loaded values.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const fail = (message) => errors.push(message);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const jsonFiles = (dir) => readdirSync(resolve(root, dir)).filter((f) => f.endsWith('.json')).sort();

const started = Date.now();
const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const loader = await server.ssrLoadModule('/src/stage/loader.ts');
  const progress = await server.ssrLoadModule('/src/core/progress.ts');
  const prepareStage = loader.prepareStage;

  /** The message of what prepareStage throws for `raw`, or null when it passes. */
  const rejection = (raw) => {
    try {
      prepareStage(raw);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  // 1. The stage files.
  const stages = [];
  for (const name of jsonFiles('src/stages')) {
    const raw = readJson(resolve(root, 'src/stages', name));
    const why = rejection(raw);
    if (why !== null) fail(`src/stages/${name}: ${why}`);
    if (raw.id !== basename(name, '.json')) fail(`src/stages/${name}: "id" is "${raw.id}" (the file name must be the id)`);
    stages.push(raw);
  }

  // 2. The deliberately broken ones.
  const setPath = (target, path, value, remove) => {
    const keys = path.split('.');
    const last = keys.pop();
    let node = target;
    for (const key of keys) {
      node = node?.[key];
      if (node === undefined || node === null) throw new Error(`path "${path}" does not exist in the base stage`);
    }
    if (remove) delete node[last];
    else node[last] = value;
  };
  let bad = 0;
  for (const name of jsonFiles('tests/stages-bad')) {
    bad++;
    const file = `tests/stages-bad/${name}`;
    const fixture = readJson(resolve(root, file));
    const expect = fixture._expect;
    if (typeof expect !== 'string' || expect === '') {
      fail(`${file}: "_expect" (a part of the error message) is required`);
      continue;
    }
    let raw = fixture;
    if (fixture._base !== undefined) {
      const base = stages.find((s) => s.id === fixture._base);
      if (!base) {
        fail(`${file}: "_base" "${fixture._base}" is not a stage file`);
        continue;
      }
      raw = structuredClone(base);
      try {
        for (const edit of fixture._edit ?? []) setPath(raw, edit.path, edit.value, edit.delete === true);
      } catch (e) {
        fail(`${file}: ${e.message}`);
        continue;
      }
    }
    const why = rejection(raw);
    if (why === null) fail(`${file}: passes, but it is meant to be rejected (${expect})`);
    else if (!why.includes(expect)) fail(`${file}: rejected for another reason.\n    wanted: ${expect}\n    got:    ${why}`);
  }

  // 3. The あいことば layout.
  const FIELDS = ['cleared', 'abilities', 'records', 'mapLinks'];
  const versions = progress.PASSCODE_VERSIONS;
  const latest = progress.PASSCODE_LATEST;
  versions.forEach((v, i) => {
    const label = `passcode v${v.version}`;
    if (v.version !== i + 1) fail(`${label}: versions must be 1, 2, 3 ... in order (this is number ${i + 1})`);
    const items = FIELDS.reduce((sum, f) => sum + (v[f]?.length ?? 0), 0);
    const bits = 5 + items + v.checkBits;
    if (bits !== 5 * v.letters) fail(`${label}: 5 + ${items} items + ${v.checkBits} check = ${bits} bits, but ${v.letters} letters are ${5 * v.letters}`);
    if (v.checkBits < 16) fail(`${label}: only ${v.checkBits} check bits (at least 16)`);
    for (const f of FIELDS) {
      const list = v[f] ?? [];
      const dup = list.find((id, j) => list.indexOf(id) !== j);
      if (dup !== undefined) fail(`${label}: "${dup}" is listed twice in ${f}`);
      // A published version's order never changes, and the next version only adds after it (rails are the exception:
      // from v2 they are rebuilt from the clears).
      const before = versions[i - 1]?.[f];
      if (f !== 'mapLinks' && before && !before.every((id, j) => v[f][j] === id)) fail(`${label}: ${f} must start with version ${v.version - 1}'s list, in the same order`);
    }
  });

  const have = (field) => new Set(latest[field] ?? []);
  const place = (field, id, what) => {
    if (!have(field).has(id)) fail(`${what}: "${id}" has no place in the あいことば (latest is v${latest.version}, ${field}); add it in a new version in src/core/progress.ts`);
  };
  for (const s of stages) {
    if (s.hidden) continue; // test courses (0-x) are not in the あいことば
    const at = `stage ${s.id}`;
    place('cleared', s.id, `${at} clear`);
    const abilities = new Set(s.unlocks ?? []);
    // (A record's `requires` is not counted: chapters 1 to 4 have records that wait for chapter 5 and 6 abilities.)
    for (const steps of Object.values(s.cutscenes ?? {})) {
      for (const step of steps) for (const key of ['unlock', 'learn']) if (typeof step[key] === 'string') abilities.add(step[key]);
    }
    for (const a of abilities) place('abilities', a, `${at} ability`);
    for (const r of s.records ?? []) place('records', r.id, `${at} record`);
  }

  console.log(`check-stages: ${stages.length} stages, ${bad} broken fixtures, ${versions.length} passcode versions (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} finally {
  await server.close();
}

if (errors.length > 0) {
  console.error(`check-stages: ${errors.length} problem${errors.length > 1 ? 's' : ''}\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
