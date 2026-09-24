// Checks every GLB in public/models against assets/models.json (no Blender needed, runs in CI):
// listed both ways, generator script present, triangles and file size within budget, origin on the floor,
// and every model named in a stage JSON exists.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('assets/models.json', 'utf8'));
delete manifest._doc;
const glbs = readdirSync('public/models').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
const errors = [];

for (const name of glbs) if (!manifest[name]) errors.push(`${name}.glb is not listed in assets/models.json`);
for (const [name, spec] of Object.entries(manifest)) {
  if (!glbs.includes(name)) { errors.push(`${name}: listed but public/models/${name}.glb is missing`); continue; }
  if (!existsSync(`assets/blender/${spec.script}`)) errors.push(`${name}: generator assets/blender/${spec.script} is missing`);
  const path = `public/models/${name}.glb`;
  const buf = readFileSync(path);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
  let tris = 0;
  let minY = Infinity;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const pos = json.accessors[prim.attributes.POSITION];
      minY = Math.min(minY, pos.min[1]);
      tris += prim.indices != null ? json.accessors[prim.indices].count / 3 : pos.count / 3;
    }
  }
  const kb = statSync(path).size / 1024;
  if (tris > spec.triangles) errors.push(`${name}: ${tris} triangles > budget ${spec.triangles}`);
  if (kb > spec.kb) errors.push(`${name}: ${kb.toFixed(0)} KB > ${spec.kb} KB`);
  if (Math.abs(minY) > 0.02) errors.push(`${name}: lowest point y=${minY.toFixed(3)} (origin must be on the floor)`);
}

for (const file of readdirSync('src/stages').filter((f) => f.endsWith('.json'))) {
  const text = readFileSync(`src/stages/${file}`, 'utf8');
  for (const [, model] of text.matchAll(/"model":\s*"([^"]+)"/g)) {
    if (!glbs.includes(model)) errors.push(`${file}: model "${model}" has no GLB`);
  }
}

if (errors.length) {
  console.error(`check-models: ${errors.length} problem(s)\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`check-models: ${glbs.length} models OK`);
