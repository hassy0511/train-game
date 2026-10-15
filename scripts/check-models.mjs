// Checks every GLB in public/models against assets/models.json (no Blender needed, runs in CI):
// listed both ways, generator script present, triangles and file size within budget, origin on the floor,
// no closed part inside out (the game culls back faces; tests/smoke/model-culling.spec.ts covers decals and
// other open parts), and every model named in a stage JSON exists.
// v1.13 (みための くらべっこ): the same for every other look, public/looks/<look>/ against assets/looks/<look>.json.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { analyse } from './check-winding.mjs';

const manifest = JSON.parse(readFileSync('assets/models.json', 'utf8'));
delete manifest._doc;
// Models a stage may use before they are built: the game draws a stand-in for them in code.
const pending = new Set(manifest._pending?.models ?? []);
delete manifest._pending;
const glbs = readdirSync('public/models').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
const errors = [];

/** Checks the GLBs of one folder against their list (`label` names the list in messages). */
function checkFolder(dir, listed, label) {
  const found = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)) : [];
  for (const name of found) if (!listed[name]) errors.push(`${dir}/${name}.glb is not listed in ${label}`);
  for (const [name, spec] of Object.entries(listed)) {
    if (!found.includes(name)) { errors.push(`${name}: listed in ${label} but ${dir}/${name}.glb is missing`); continue; }
    if (!existsSync(`assets/blender/${spec.script}`)) errors.push(`${name}: generator assets/blender/${spec.script} is missing`);
    const path = `${dir}/${name}.glb`;
    const buf = readFileSync(path);
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
    let tris = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        const pos = json.accessors[prim.attributes.POSITION];
        minY = Math.min(minY, pos.min[1]);
        maxY = Math.max(maxY, pos.max[1]);
        tris += prim.indices != null ? json.accessors[prim.indices].count / 3 : pos.count / 3;
      }
    }
    const kb = statSync(path).size / 1024;
    if (tris > spec.triangles) errors.push(`${name}: ${tris} triangles > budget ${spec.triangles}`);
    if (kb > spec.kb) errors.push(`${name}: ${kb.toFixed(0)} KB > ${spec.kb} KB`);
    // "origin": "joint" = a part the game rotates about its origin (the big dinosaur's neck), not placed on the floor.
    // v1.13: "top" = the top surface at the origin (1-3's floating islands: the rail runs on the top, the rock hangs below;
    // grass tufts and flowers off the line may stand up to 2 m above it).
    if (spec.origin === 'top') {
      if (maxY < -0.02 || maxY > 2) errors.push(`${name}: highest point y=${maxY.toFixed(3)} (the top must be at the origin)`);
      if (minY > -0.02) errors.push(`${name}: lowest point y=${minY.toFixed(3)} (the rock hangs below the top)`);
    } else if (spec.origin !== 'joint' && Math.abs(minY) > 0.02) {
      errors.push(`${name}: lowest point y=${minY.toFixed(3)} (origin must be on the floor)`);
    }
    for (const node of json.nodes ?? []) {
      if ((node.scale ?? []).filter((v) => v < 0).length % 2) errors.push(`${name}: node "${node.name}" is mirrored (negative scale flips its faces)`);
    }
    for (const problem of analyse(path)) errors.push(`${name}: ${problem}`);
  }
  return found.length;
}

for (const name of pending) if (glbs.includes(name)) errors.push(`${name}: built now, remove it from "_pending" in assets/models.json`);
checkFolder('public/models', manifest, 'assets/models.json');
const looks = existsSync('public/looks') ? readdirSync('public/looks', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
const lookLists = existsSync('assets/looks') ? readdirSync('assets/looks').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
let lookCount = 0;
for (const look of new Set([...looks, ...lookLists])) {
  const list = existsSync(`assets/looks/${look}.json`) ? JSON.parse(readFileSync(`assets/looks/${look}.json`, 'utf8')) : {};
  // "_stages": the stages the look was made for (the check list's 「みための くらべっこ」 offers those).
  const stages = list._stages ?? [];
  delete list._stages;
  if (stages.length === 0) errors.push(`assets/looks/${look}.json: "_stages" names no stage`);
  for (const id of stages) if (!existsSync(`src/stages/${id}.json`)) errors.push(`assets/looks/${look}.json: stage ${id} has no file`);
  lookCount += checkFolder(`public/looks/${look}`, list, `assets/looks/${look}.json`);
}

// The stages and (v1.12) the movies.
for (const file of ['src/stages', 'src/movies'].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => `${dir}/${f}`))) {
  const text = readFileSync(file, 'utf8');
  for (const [, model] of text.matchAll(/"model":\s*"([^"]+)"/g)) {
    if (!glbs.includes(model) && !pending.has(model)) errors.push(`${file}: model "${model}" has no GLB`);
  }
}

if (errors.length) {
  console.error(`check-models: ${errors.length} problem(s)\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`check-models: ${glbs.length} models OK${lookCount ? ` (and ${lookCount} of other looks)` : ''}`);
