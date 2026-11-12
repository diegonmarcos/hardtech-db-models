// brep2glb: STEP/IGES -> GLB view file, offline, with occt-import-js (LGPL-2.1, Open CASCADE inside).
// Usage: node brep2glb.mjs <occt-import-js.js> <in.igs|in.stp> <out.glb> [linear-deflection] [up-axis z|y]
// up-axis: z (default; Rhino/IGES exports) rotates -90 deg about X to glTF Y-up; y (SolidWorks STEP) keeps the axes.
// The original stays the source of truth; the GLB is a derived, triangulated view for phones.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [, , occtJs, input, output, defl, up] = process.argv;
const occt = await createRequire(import.meta.url)(occtJs)();
const buf = new Uint8Array(readFileSync(input));
const params = { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: Number(defl || 0.001), angularDeflection: 0.5 };
const ext = input.toLowerCase().split('.').pop();
const res = ext === 'igs' || ext === 'iges' ? occt.ReadIgesFile(buf, params) : occt.ReadStepFile(buf, params);
if (!res.success) { console.error('occt could not read', input); process.exit(1); }

const bin = []; let off = 0; const views = [], accessors = [], meshes = [], nodes = [], materials = [], matIdx = new Map();
function push(arr, target) {
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bin.push(b);
  views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target }); off += b.length;
  const pad = (4 - (off % 4)) % 4; if (pad) { bin.push(Buffer.alloc(pad)); off += pad; }
  return views.length - 1;
}
function material(c) {
  const k = c ? c.join(',') : 'default';
  if (!matIdx.has(k)) { matIdx.set(k, materials.length); materials.push({ pbrMetallicRoughness: { baseColorFactor: c ? [...c, 1] : [0.8, 0.82, 0.86, 1], metallicFactor: 0.1, roughnessFactor: 0.6 }, doubleSided: true }); }
  return matIdx.get(k);
}
let tris = 0; const groups = new Map();
// One primitive per colour: thousands of B-rep faces become a handful of draw calls.
for (const m of res.meshes) {
  const p = m.attributes.position.array; if (!p.length) continue;
  const k = m.color ? m.color.join(',') : 'default';
  if (!groups.has(k)) groups.set(k, { color: m.color, p: [], n: [], i: [], base: 0 });
  const g = groups.get(k); const nrm = m.attributes.normal ? m.attributes.normal.array : null;
  for (let i = 0; i < p.length; i++) { g.p.push(p[i]); g.n.push(nrm ? nrm[i] : 0); }
  for (const x of m.index.array) g.i.push(x + g.base);
  g.base += p.length / 3; tris += m.index.array.length / 3;
}
for (const g of groups.values()) {
  const p = new Float32Array(g.p), idx = new Uint32Array(g.i);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) { const a = i % 3; if (p[i] < min[a]) min[a] = p[i]; if (p[i] > max[a]) max[a] = p[i]; }
  const attrs = { POSITION: accessors.push({ bufferView: push(p, 34962), componentType: 5126, count: p.length / 3, type: 'VEC3', min, max }) - 1 };
  attrs.NORMAL = accessors.push({ bufferView: push(new Float32Array(g.n), 34962), componentType: 5126, count: p.length / 3, type: 'VEC3' }) - 1;
  const ia = accessors.push({ bufferView: push(idx, 34963), componentType: 5125, count: idx.length, type: 'SCALAR' }) - 1;
  meshes.push({ primitives: [{ attributes: attrs, indices: ia, material: material(g.color) }] });
  nodes.push({ mesh: meshes.length - 1 });
}
// IGES/STEP are Z-up; glTF is Y-up: one root rotation of -90 deg about X.
nodes.push({ name: 'root', children: nodes.map((_, i) => i), ...(up === 'y' ? {} : { rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] }) });
const gltf = { asset: { version: '2.0', generator: 'brep2glb (occt-import-js)' }, scene: 0, scenes: [{ nodes: [nodes.length - 1] }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: off }] };
let json = Buffer.from(JSON.stringify(gltf)); const jp = (4 - (json.length % 4)) % 4; json = Buffer.concat([json, Buffer.alloc(jp, 0x20)]);
const body = Buffer.concat(bin); const total = 12 + 8 + json.length + 8 + body.length;
const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
const c1 = Buffer.alloc(8); c1.writeUInt32LE(json.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
const c2 = Buffer.alloc(8); c2.writeUInt32LE(body.length, 0); c2.writeUInt32LE(0x004e4942, 4);
writeFileSync(output, Buffer.concat([h, c1, json, c2, body]));
console.log(JSON.stringify({ meshes: meshes.length, triangles: tris, bytes: total }));
