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
//  3. The あいことば versions in src/core/progress.ts: bits add up (5 + items + padBits + checkBits = 5 x letters,
//     check >= 16 bits), no id is listed twice, a version keeps the lists of the one before it in the same order, a
//     version without rails says up to which map page it rebuilds them (`pages`, from version 2 on), and every
//     clear, ability (also the ones records require) and record of every playable (non-hidden) stage has a place in
//     the latest version. And the other way round (PR12): every id of every version is in a playable stage file, the
//     latest version is exactly the playable stages' clears, given abilities and records in stage order (but for the
//     ids listed in AHEAD, of stages not built yet), and every ability a record needs is given by some playable stage
//     (with every ability, no "？" is out of reach).
//     The pictures: a playable record with a `model` has public/zukan/<id>.png, an island with a `diorama` has
//     public/map/<id>.png.
//  4. src/world/world.json (src/world/pages.ts validateWorld): the world's end's trail runs along links (or its long rail
//     home), its islands are there, the islands' sizes are 0.8–1.4 (PHASE9_CHAPTER5_6 第 1 部 §3.7).
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
  const pages = await server.ssrLoadModule('/src/world/pages.ts');
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

  // 1b. v1.12 (えんしゅつ): the movies (src/movies/*.json): stage files that must say what they play ("movie").
  for (const name of jsonFiles('src/movies')) {
    const raw = readJson(resolve(root, 'src/movies', name));
    const why = rejection(raw);
    if (why !== null) fail(`src/movies/${name}: ${why}`);
    if (raw.id !== basename(name, '.json')) fail(`src/movies/${name}: "id" is "${raw.id}" (the file name must be the id)`);
    if (!raw.movie) fail(`src/movies/${name}: a movie file needs "movie" (what it plays and its card)`);
    if (stages.some((s) => s.id === raw.id)) fail(`src/movies/${name}: "${raw.id}" is also a stage id`);
    // v1.12 (the opening): the stage a movie comes before is a playable one.
    const before = raw.movie?.before;
    if (before !== undefined && !stages.some((s) => s.id === before && !s.hidden && !s._movie)) fail(`src/movies/${name}: "movie.before" "${before}" is not a playable stage`);
    stages.push({ ...raw, _movie: true });
  }
  for (const s of stages) if (!s._movie && s.movie) fail(`src/stages/${s.id}.json: "movie" belongs in src/movies/`);

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
    const pad = v.padBits ?? 0;
    const bits = 5 + items + pad + v.checkBits;
    if (bits !== 5 * v.letters) {
      fail(`${label}: 5 + ${items} items + ${pad} padding + ${v.checkBits} check = ${bits} bits, but ${v.letters} letters are ${5 * v.letters}`);
    }
    if (v.checkBits < 16) fail(`${label}: only ${v.checkBits} check bits (at least 16)`);
    if (!Number.isInteger(pad) || pad < 0) fail(`${label}: padBits must be a whole number, 0 or more`);
    // Without rails, the rails are rebuilt from the clears up to the pages the map had then (v1 carries its rails).
    if (!v.mapLinks && v.version > 1 && !(Number.isInteger(v.pages) && v.pages >= 1)) fail(`${label}: carries no rails, so it needs \`pages\` (the map pages when it came out)`);
    if (v.version > 1 && versions[i - 1]?.pages !== undefined && v.pages < versions[i - 1].pages) fail(`${label}: pages ${v.pages} is fewer than version ${v.version - 1}'s`);
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
    // A record's `requires` too: every ability a record waits for (chapter 5's magnetLight, chapter 6's reverse) has
    // had a place since version 3, so a record naming an ability the あいことば cannot carry is caught here.
    for (const r of s.records ?? []) if (typeof r.requires === 'string') abilities.add(r.requires);
    for (const steps of Object.values(s.cutscenes ?? {})) {
      for (const step of steps) for (const key of ['unlock', 'learn']) if (typeof step[key] === 'string') abilities.add(step[key]);
    }
    for (const a of abilities) place('abilities', a, `${at} ability`);
    for (const r of s.records ?? []) place('records', r.id, `${at} record`);
  }

  // 3b. (PHASE9_CHAPTER5_6 §0.6, PR12) The other way round, now that every stage of version 3 is built: every id of
  //     every version is in a playable stage file (an id renamed in a stage would quietly drop it from the codes
  //     already written down), and the latest version lists exactly the playable stages' clears, given abilities and
  //     records in stage order (its clear order; a stage's records in the file's order). And every record's
  //     `requires` is an ability some playable stage gives: with every ability no "？" is out of reach (the picture
  //     book can reach みつけた n/n).
  //     AHEAD: ids of a version published before its stages are built (as version 3 was from PR3 to PR11b, so that
  //     a child's clears are not lost meanwhile). List them here while their stage is not there yet; empty since 6-2.
  const AHEAD = new Set([]);
  const playable = stages.filter((s) => !s.hidden && !s._movie);
  const byId = new Map(playable.map((s) => [s.id, s]));
  /** The abilities a stage gives: its `unlocks`, then its cutscenes' `unlock`/`learn`. */
  const given = (s) => {
    const out = [...(s.unlocks ?? [])];
    for (const steps of Object.values(s.cutscenes ?? {})) {
      for (const step of steps) for (const key of ['unlock', 'learn']) if (typeof step[key] === 'string') out.push(step[key]);
    }
    return out;
  };
  const stageLists = {
    cleared: playable.map((s) => s.id),
    abilities: [...new Set(playable.flatMap(given))],
    records: playable.flatMap((s) => (s.records ?? []).map((r) => r.id)),
  };
  for (const v of versions) {
    for (const f of ['cleared', 'abilities', 'records']) {
      for (const id of v[f]) {
        if (!AHEAD.has(id) && !stageLists[f].includes(id)) fail(`passcode v${v.version}: ${f} "${id}" is in no playable stage file (the stages keep every published version's ids)`);
      }
    }
  }
  const inOrder = {
    cleared: latest.cleared.filter((id) => byId.has(id)),
    abilities: [...new Set(latest.cleared.flatMap((id) => (byId.has(id) ? given(byId.get(id)) : [])))],
    records: latest.cleared.flatMap((id) => (byId.get(id)?.records ?? []).map((r) => r.id)),
  };
  for (const f of ['cleared', 'abilities', 'records']) {
    const want = inOrder[f];
    const listed = latest[f].filter((id) => !AHEAD.has(id));
    if (want.length !== stageLists[f].length || listed.join() !== want.join()) {
      fail(`passcode v${latest.version}: ${f} is not the playable stages' own in stage order.\n    stages:  ${want.join(' ')}\n    version: ${listed.join(' ')}`);
    }
  }
  const learnable = new Set(stageLists.abilities);
  for (const s of playable) {
    for (const r of s.records ?? []) {
      if (typeof r.requires === 'string' && !learnable.has(r.requires)) {
        fail(`stage ${s.id} record "${r.id}": needs "${r.requires}", which no playable stage gives (its "？" could never be found)`);
      }
    }
  }

  // 3c. (PR12) The pictures: every record of a playable stage with a `model` has its picture-book picture
  //     (public/zukan/<id>.png, scripts/render-zukan.mjs), every island with a `diorama` its map picture
  //     (public/map/<id>.png, scripts/render-map.mjs).
  const pngs = (dir) => new Set(readdirSync(resolve(root, dir)).filter((f) => f.endsWith('.png')).map((f) => basename(f, '.png')));
  const zukanPictures = pngs('public/zukan');
  for (const s of playable) {
    for (const r of s.records ?? []) {
      if (r.model && !zukanPictures.has(r.id)) fail(`stage ${s.id} record "${r.id}": no picture public/zukan/${r.id}.png (node scripts/render-zukan.mjs ${r.id})`);
    }
  }
  const mapPictures = pngs('public/map');
  for (const island of readJson(resolve(root, 'src/world/world.json')).islands) {
    if (island.diorama && !mapPictures.has(island.id)) fail(`src/world/world.json island ${island.id}: no picture public/map/${island.id}.png (node scripts/render-map.mjs ${island.id})`);
  }

  // 4. The world map.
  for (const why of pages.validateWorld(readJson(resolve(root, 'src/world/world.json')))) fail(`src/world/world.json: ${why}`);

  console.log(`check-stages: ${stages.length} stages, ${bad} broken fixtures, ${versions.length} passcode versions (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} finally {
  await server.close();
}

if (errors.length > 0) {
  console.error(`check-stages: ${errors.length} problem${errors.length > 1 ? 's' : ''}\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
