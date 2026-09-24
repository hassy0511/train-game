// Finds inside-out geometry in GLBs. The game culls back faces, so a closed part whose faces point
// inward (or a part with mixed winding) shows holes / see-through roofs. Blender's previews render both
// sides and hide this. For every connected closed part: winding must be consistent and volume positive.
// Node transforms are ignored: exports apply them (check-models rejects mirrored nodes).
// Usage: node scripts/check-winding.mjs [dir]   (default public/models; used by check-models.mjs)
import { readFileSync, readdirSync } from 'node:fs';

export function analyse(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const read = (accIndex) => {
    const acc = json.accessors[accIndex];
    const view = json.bufferViews[acc.bufferView];
    const offset = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
    const n = acc.count * comps;
    if (acc.componentType === 5126) return new Float32Array(buf.buffer.slice(buf.byteOffset + offset, buf.byteOffset + offset + n * 4));
    if (acc.componentType === 5123) return new Uint16Array(buf.buffer.slice(buf.byteOffset + offset, buf.byteOffset + offset + n * 2));
    if (acc.componentType === 5125) return new Uint32Array(buf.buffer.slice(buf.byteOffset + offset, buf.byteOffset + offset + n * 4));
    if (acc.componentType === 5121) return new Uint8Array(buf.buffer.slice(buf.byteOffset + offset, buf.byteOffset + offset + n));
    throw new Error('component type ' + acc.componentType);
  };
  // Weld vertices by position across all primitives (materials split one solid into several primitives).
  const ids = new Map();
  const pts = [];
  const tris = [];
  const triMat = [];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const pos = read(prim.attributes.POSITION);
      const local = [];
      for (let i = 0; i < pos.length; i += 3) {
        const key = `${Math.round(pos[i] * 1e4)},${Math.round(pos[i + 1] * 1e4)},${Math.round(pos[i + 2] * 1e4)}`;
        let id = ids.get(key);
        if (id === undefined) { id = pts.length; ids.set(key, id); pts.push([pos[i], pos[i + 1], pos[i + 2]]); }
        local.push(id);
      }
      const idx = prim.indices != null ? read(prim.indices) : [...Array(local.length).keys()];
      const matName = prim.material != null ? json.materials[prim.material].name : '?';
      for (let i = 0; i < idx.length; i += 3) {
        const t = [local[idx[i]], local[idx[i + 1]], local[idx[i + 2]]];
        if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) continue;
        tris.push(t);
        triMat.push(matName);
      }
    }
  }
  // Components over shared edges.
  const parent = tris.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges = new Map();
  tris.forEach((t, i) => {
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const rec = edges.get(key) ?? { tris: [], dirs: [] };
      rec.tris.push(i);
      rec.dirs.push(a < b ? 1 : -1);
      edges.set(key, rec);
    }
  });
  for (const rec of edges.values()) for (const t of rec.tris.slice(1)) parent[find(t)] = find(rec.tris[0]);
  const comps = new Map();
  tris.forEach((_, i) => { const r = find(i); (comps.get(r) ?? comps.set(r, []).get(r)).push(i); });
  const problems = [];
  for (const members of comps.values()) {
    const set = new Set(members);
    let open = false, mixed = false;
    for (const rec of edges.values()) {
      if (!set.has(rec.tris[0])) continue;
      if (rec.tris.length !== 2) { open = true; continue; }
      if (rec.dirs[0] === rec.dirs[1]) mixed = true;
    }
    if (open) continue; // decals, flags, glass panes: checked by their own rules
    let vol = 0;
    for (const i of members) {
      const [a, b, c] = tris[i].map((j) => pts[j]);
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    if (mixed || vol < 0) {
      const mats = [...new Set(members.map((i) => triMat[i]))].join(', ');
      problems.push(`${mixed ? 'mixed winding' : 'inside-out'} part (${members.length} tris, materials: ${mats})`);
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'public/models';
  let bad = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.glb')).sort()) {
    const problems = analyse(`${dir}/${f}`);
    if (problems.length) { bad++; console.log(`${f}:\n  ` + problems.slice(0, 8).join('\n  ') + (problems.length > 8 ? `\n  … ${problems.length - 8} more` : '')); }
  }
  console.log(bad ? `${bad} file(s) with inside-out parts in ${dir}` : `no inside-out parts in ${dir}`);
}
