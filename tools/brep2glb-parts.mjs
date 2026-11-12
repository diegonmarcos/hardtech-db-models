// brep2glb-parts (#1695): STEP/IGES -> GLB view with ONE NODE PER SOLID (name and colour from the file), for the viewer's parts tree.
// The packer is tools/tess.js, a copy of cloudy-u-android libs:cad-brep tess.js (the same code the app's STEP worker runs).
// Usage: node brep2glb-parts.mjs <occt-import-js.js> <in.step|in.igs> <out.glb> [linear-deflection] [up-axis z|y]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const [, , occtJs, input, output, defl, up] = process.argv;
const ctx = { TextEncoder, Float32Array, Uint32Array, Uint8Array, DataView, Math, JSON, Error, String }; ctx.self = ctx;
vm.runInNewContext(readFileSync(new URL('./tess.js', import.meta.url), 'utf8'), ctx);
const occt = await createRequire(import.meta.url)(occtJs)();
const p = { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: Number(defl || 0.004), angularDeflection: 0.5 };
const ext = input.toLowerCase().split('.').pop();
const res = ext === 'igs' || ext === 'iges' ? occt.ReadIgesFile(new Uint8Array(readFileSync(input)), p) : occt.ReadStepFile(new Uint8Array(readFileSync(input)), p);
if (!res.success) { console.error('occt could not read', input); process.exit(1); }
const r = ctx.brepTess.toGlb(res, up !== 'y');
writeFileSync(output, r.glb);
console.log(JSON.stringify({ parts: r.parts.length, triangles: r.triangles, bytes: r.glb.length }));
