// Picks the smoke specs a change needs (CI). Prints the spec paths to run, space separated, or nothing for "all".
//
// Every spec that is not a stage's full run always runs (they are quick). A stage's full run
// (tests/smoke/stage-<id>-full.spec.ts) runs when that stage's own files changed. Everything runs when a file shared
// by all stages changed (the game code, models, the test helpers, the build), or when FULL=true (main, or a PR whose
// title has "[full]").
//
// Usage: node scripts/select-smoke.mjs [base-ref]   (default origin/main)
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = 'tests/smoke';
const FULL_RUN = /^stage-(\d+-\d+)-full\.spec\.ts$/;

if (process.env.FULL === 'true') process.exit(0);

const base = process.argv[2] ?? 'origin/main';
let changed;
try {
  changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  // No common base to compare with: be safe and run everything.
  process.exit(0);
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
  process.exit(0);
}

const stages = new Set(changed.map(stageOf).filter(Boolean));
const specs = readdirSync(resolve(root, SPECS))
  .filter((f) => f.endsWith('.spec.ts'))
  .filter((f) => {
    const m = FULL_RUN.exec(f);
    return !m || stages.has(m[1]);
  })
  .sort()
  .map((f) => `${SPECS}/${f}`);
console.error(`select-smoke: full runs for ${stages.size ? [...stages].join(', ') : 'no stage'}`);
console.log(specs.join(' '));
