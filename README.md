# hardtech-db-models

The model library of the Hardtech-CAD app (cloudy-u-android `ad_Hardtech-CAD`, MCAD section). Public, files in Git LFS.

## Layout
- `boats/<format>/`: marine engineering and naval architecture (STEP, IGES, 3DM, X_T, DXF).
- `mechanics/<format>/`: mechanical assemblies (STEP), with `photos/`.
- `architecture/<format>/`: buildings, BIM and ArchViz (IFC, RVT, SKP, DWG/DXF, FBX/OBJ, glTF/GLB).
- `models.json`: the manifest the app reads (name, format, source, licence, size, sha256, optional derived `view`).
- `tools/`: the offline converters that make the derived views.

## Derived views
A phone cannot triangulate a 60 MB B-rep quickly, so a model may carry a `view`: a GLB made offline from the original.
The original stays the source of truth.
- STEP/IGES: `node tools/brep2glb.mjs <occt-import-js.js> <in> <out.glb> [deflection]` (occt-import-js, LGPL-2.1).
- OBJ: `node tools/obj2glb.mjs <in.obj> <out.glb> [scale] [colours.json]` (pure Node; colours.json when the .mtl is missing).
- STEP from SolidWorks is Y-up: pass `y` as the 5th argument of brep2glb.mjs.
- SKP: no open-source reader exists. Export with SketchUp's own exporter (SketchUp Free or Pro) to GLB, plus IFC when possible; keep the .skp.
- RVT, X_T: closed formats with no open reader. Export to IFC (RVT) or STEP (X_T) from the authoring tool; otherwise store-only.

## Adding a model
Put the file under `<library>/<format>/`, then add an entry to `models.json` with `sha256sum` and `stat -c%s` values.

## Licence
See `LICENSE`: each model keeps its own licence, recorded per entry in `models.json`.
