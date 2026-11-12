// obj2glb: Wavefront OBJ -> GLB view file, offline, pure Node (no dependency).
// Usage: node obj2glb.mjs <in.obj> <out.glb> [scale] [colours.json]
// scale: multiplies every position (0.001 for an OBJ in millimetres, glTF is metres).
// colours.json: optional {"<usemtl name>": [r, g, b]} (0..1) for an OBJ shipped without its .mtl; unnamed materials are light grey.
// One primitive per material, flat normals when the OBJ has none (they are recomputed per face). Polygons are fanned into triangles.
// The original stays the source of truth; the GLB is a derived, triangulated view for phones.
import { readFileSync, writeFileSync } from 'node:fs';
const [, , input, output, scaleArg, coloursPath] = process.argv;
if (!input || !output) { console.error('usage: node obj2glb.mjs <in.obj> <out.glb> [scale] [colours.json]'); process.exit(2); }
const scale = Number(scaleArg || 1);
const colours = coloursPath ? JSON.parse(readFileSync(coloursPath, 'utf8')) : {};
const V = [], N = [];
const groups = new Map(); let cur = null;
function group(name) { if (!groups.has(name)) groups.set(name, { name, p: [], n: [] }); return groups.get(name); }
cur = group('default');
const idx = (s, len) => { const i = parseInt(s, 10); return i < 0 ? len + i : i - 1; };
for (const line of readFileSync(input, 'utf8').split(/\r?\n/)) {
  const t = line.trim().split(/\s+/); const k = t[0];
  if (k === 'v') V.push([+t[1] * scale, +t[2] * scale, +t[3] * scale]);
  else if (k === 'vn') N.push([+t[1], +t[2], +t[3]]);
  else if (k === 'usemtl') cur = group(line.trim().slice(7).trim());
  else if (k === 'f') {
    const c = t.slice(1).map((s) => { const r = s.split('/'); return { v: idx(r[0], V.length), n: r[2] ? idx(r[2], N.length) : -1 }; });
    for (let i = 1; i + 1 < c.length; i++) {
      const tri = [c[0], c[i], c[i + 1]]; const P = tri.map((x) => V[x.v]);
      if (P.some((x) => !x)) continue;
      const u = P[1].map((x, j) => x - P[0][j]), w = P[2].map((x, j) => x - P[0][j]);
      let fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...fn) || 1; fn = fn.map((x) => x / l);
      for (let j = 0; j < 3; j++) { cur.p.push(...P[j]); cur.n.push(...(tri[j].n >= 0 && N[tri[j].n] ? N[tri[j].n] : fn)); }
    }
  }
}
const bin = []; let off = 0; const views = [], accessors = [], meshes = [], nodes = [], materials = [];
function push(arr, target) {
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bin.push(b);
  views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target }); off += b.length;
  const pad = (4 - (off % 4)) % 4; if (pad) { bin.push(Buffer.alloc(pad)); off += pad; }
  return views.length - 1;
}
let tris = 0;
for (const g of groups.values()) {
  if (!g.p.length) continue;
  const p = new Float32Array(g.p);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) { const a = i % 3; if (p[i] < min[a]) min[a] = p[i]; if (p[i] > max[a]) max[a] = p[i]; }
  const c = colours[g.name] || [0.8, 0.82, 0.86];
  materials.push({ name: g.name, pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0.1, roughnessFactor: 0.6 }, doubleSided: true });
  const attrs = { POSITION: accessors.push({ bufferView: push(p, 34962), componentType: 5126, count: p.length / 3, type: 'VEC3', min, max }) - 1 };
  attrs.NORMAL = accessors.push({ bufferView: push(new Float32Array(g.n), 34962), componentType: 5126, count: p.length / 3, type: 'VEC3' }) - 1;
  meshes.push({ name: g.name, primitives: [{ attributes: attrs, material: materials.length - 1 }] });
  nodes.push({ name: g.name, mesh: meshes.length - 1 }); tris += p.length / 9;
}
nodes.push({ name: 'root', children: nodes.map((_, i) => i) });
const gltf = { asset: { version: '2.0', generator: 'obj2glb' }, scene: 0, scenes: [{ nodes: [nodes.length - 1] }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: off }] };
let json = Buffer.from(JSON.stringify(gltf)); const jp = (4 - (json.length % 4)) % 4; json = Buffer.concat([json, Buffer.alloc(jp, 0x20)]);
const body = Buffer.concat(bin); const total = 12 + 8 + json.length + 8 + body.length;
const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
const c1 = Buffer.alloc(8); c1.writeUInt32LE(json.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
const c2 = Buffer.alloc(8); c2.writeUInt32LE(body.length, 0); c2.writeUInt32LE(0x004e4942, 4);
writeFileSync(output, Buffer.concat([h, c1, json, c2, body]));
console.log(JSON.stringify({ meshes: meshes.length, triangles: tris, bytes: total }));
