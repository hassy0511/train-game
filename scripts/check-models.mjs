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

/** A glTF node's local matrix (column-major). */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const multiply = (a, b) =>
  Array.from({ length: 16 }, (_, i) => {
    const c = Math.floor(i / 4);
    const r = i % 4;
    return a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  });

/**
 * Lowest and highest point of a model in its own space: every mesh where its node (and the node's parents) put it, so
 * a model of moving parts (2-2's grasshopper: head and legs are nodes at their joints) is measured as it stands.
 */
function heightRange(json) {
  let minY = Infinity;
  let maxY = -Infinity;
  const nodes = json.nodes ?? [];
  const children = new Set(nodes.flatMap((n) => n.children ?? []));
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i).filter((i) => !children.has(i));
  const visit = (index, parent) => {
    const node = nodes[index];
    const world = multiply(parent, nodeMatrix(node));
    for (const prim of node.mesh != null ? json.meshes[node.mesh].primitives : []) {
      const { min, max } = json.accessors[prim.attributes.POSITION];
      for (let corner = 0; corner < 8; corner++) {
        const [x, y, z] = [corner & 1 ? max[0] : min[0], corner & 2 ? max[1] : min[1], corner & 4 ? max[2] : min[2]];
        const height = world[1] * x + world[5] * y + world[9] * z + world[13];
        minY = Math.min(minY, height);
        maxY = Math.max(maxY, height);
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of roots) visit(root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return [minY, maxY];
}

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
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        const pos = json.accessors[prim.attributes.POSITION];
        tris += prim.indices != null ? json.accessors[prim.indices].count / 3 : pos.count / 3;
      }
    }
    const [minY, maxY] = heightRange(json);
    const kb = statSync(path).size / 1024;
    if (tris > spec.triangles) errors.push(`${name}: ${tris} triangles > budget ${spec.triangles}`);
    if (kb > spec.kb) errors.push(`${name}: ${kb.toFixed(0)} KB > ${spec.kb} KB`);
    // "origin": "joint" = a part the game rotates about its origin (the big dinosaur's neck), not placed on the floor.
    // v1.13: "top" = the top surface at the origin (1-3's floating islands: the rail runs on the top, the rock hangs below;
    // grass tufts and flowers off the line may stand up to 2 m above it; and 1-3's upside-down flower, hanging from the
    // root of its stem).
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
