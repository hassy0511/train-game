// Picks the smoke specs a change needs (CI). Prints the spec paths to run, space separated, or nothing for "all".
//
// Every spec that is not a stage's full run always runs (they are quick). A stage's full run
// (tests/smoke/stage-<id>-full.spec.ts) runs when that stage's own files changed. Everything runs when a file shared
// by all stages changed (the game code, models, the test helpers, the build), or when FULL=true (main, or a PR whose
// title has "[full]").
//
// With SHARD=i/n (CI's four parallel jobs, PHASE9 §0.11) it prints only the specs of shard i (1-based) of n: every spec
// picked above, spread so each shard gets about the same running time (a stage's full run weighs ~10 quick specs, a
// quick spec with several drives more than one: SLOW_QUICK). A
// shard left with nothing prints "none" (the job then skips the run; an empty list would make Playwright run all).
//
// Usage: node scripts/select-smoke.mjs [base-ref]   (default origin/main)
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = 'tests/smoke';
const FULL_RUN = /^stage-(\d+-\d+)-full\.spec\.ts$/;
/** Quick specs that run several drives (weights for the shards; a stage's full run weighs 10). */
const SLOW_QUICK = { 'night.spec.ts': 4, 'toy.spec.ts': 3, 'magnet.spec.ts': 3, 'mirror-world.spec.ts': 4, 'movie.spec.ts': 5, 'portal.spec.ts': 3 };

const allSpecs = () =>
  readdirSync(resolve(root, SPECS))
    .filter((f) => f.endsWith('.spec.ts'))
    .sort()
    .map((f) => `${SPECS}/${f}`);

/** Prints `specs` (all of them when null), or only this job's shard of them with SHARD=i/n. */
function print(specs) {
  const shard = /^(\d+)\/(\d+)$/.exec(process.env.SHARD ?? '');
  if (!shard) {
    if (specs) console.log(specs.join(' '));
    process.exit(0);
  }
  const [index, count] = [Number(shard[1]), Number(shard[2])];
  const name = (spec) => spec.slice(SPECS.length + 1);
  const weight = (spec) => (FULL_RUN.test(name(spec)) ? 10 : (SLOW_QUICK[name(spec)] ?? 1));
  // Longest first, each to the lightest shard so far (ties: the lower shard), so the four jobs end about together.
  const loads = Array.from({ length: count }, () => ({ total: 0, specs: [] }));
  for (const spec of [...(specs ?? allSpecs())].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const lightest = loads.reduce((best, l) => (l.total < best.total ? l : best));
    lightest.total += weight(spec);
    lightest.specs.push(spec);
  }
  const mine = loads[index - 1]?.specs ?? [];
  console.error(`select-smoke: shard ${index}/${count}: ${mine.length} specs`);
  console.log(mine.length ? mine.sort().join(' ') : 'none');
  process.exit(0);
}

if (process.env.FULL === 'true') print(null);

const base = process.argv[2] ?? 'origin/main';
let changed;
try {
  changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  // No common base to compare with: be safe and run everything.
  print(null);
}

/** The stage a file belongs to alone (its JSON, layout script, full run, map picture), or null. */
function stageOf(file) {
  const m =
    /^src\/stages\/(\d+-\d+)\.json$/.exec(file) ??
    /^scripts\/layout-(\d+-\d+)\.mjs$/.exec(file) ??
    /^tests\/smoke\/stage-(\d+-\d+)-full\.spec\.ts$/.exec(file) ??
    /^public\/map\/(\d+-\d+)\.png$/.exec(file);
  return m ? m[1] : null;
}

/** A file every stage depends on: a change there runs every full run. */
function shared(file) {
  if (stageOf(file)) return false;
  if (file.startsWith('src/viewer/')) return false; // the model page only
  // v1.12: a movie's own file (its layout script, its JSON) is no stage's: movie.spec.ts (always run) covers it.
  if (file.startsWith('src/movies/') || file === 'scripts/layout-ending.mjs') return false;
  return (
    file.startsWith('src/') ||
    file.startsWith('public/models/') ||
    file.startsWith('.github/') ||
    file === 'index.html' ||
    file === 'package.json' ||
    file === 'package-lock.json' ||
    file === 'vite.config.ts' ||
    file.startsWith('tsconfig') ||
    file === 'scripts/layout-lib.mjs' ||
    file === `${SPECS}/drive.ts` ||
    file === `${SPECS}/playwright.config.ts`
  );
}

const hit = changed.find(shared);
if (hit) {
  console.error(`select-smoke: ${hit} is shared by every stage, running everything`);
  print(null);
}

const stages = new Set(changed.map(stageOf).filter(Boolean));
const specs = allSpecs().filter((spec) => {
  const m = FULL_RUN.exec(spec.slice(SPECS.length + 1));
  return !m || stages.has(m[1]);
});
console.error(`select-smoke: full runs for ${stages.size ? [...stages].join(', ') : 'no stage'}`);
print(specs);
