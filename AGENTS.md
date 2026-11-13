# AGENTS.md

## Repository facts
- This is a plain-files workspace tracked by git (branch `main`): no `package.json`, CI, test runner, or dev server. Do not invent `npm run …` commands.
- The deliverable is `3droom.html`: one HTML file with inline CSS/JS that must open directly via `file://`. Three.js is pinned to r147 UMD plus `examples/js` helpers from jsDelivr; all image assets must be embedded.
- `panels/` is the approved texture deliverable. `panels/manifest.json` and `panels/README_panels.md` are authoritative for decor names, slat pitch (39.67 mm), and per-decor UV tile sizes. Do not edit or regenerate those PNGs unless asked.
- The app source is split into ordered fragments in `_build/`: `part1_head.html` … `part7_app4.html`, including `part5b_panno.html`. They are not standalone pages; `part4`…`part7` continue one JS IIFE. `build.py` concatenates them, embeds the seven textures as data URIs, inserts the generated `panno_rings.json` into the panno fragment, and writes the deliverable `3droom.html`.
- Real scene dimensions: wall 490 × 270 cm, picture 270 × 160 cm, desk 125 × 75 cm, nightstand 45 × 54 cm (left of the desk), pegboard cell 30 × 42 cm.

## Constraints that are easy to break
- Never load runtime textures from relative `file://` paths: Chrome blocks XHR and taints WebGL textures. Embed data URIs; downscale the 1024×4096 panel PNGs to approximately 512×2048 JPEG q≈88.
- Keep Three r147 APIs and global scripts: `THREE.sRGBEncoding`, `renderer.outputEncoding`, `OrbitControls`, `RoomEnvironment`. Do not migrate to ESM/latest Three without a full rewrite.
- Keep `/*==CORE-BEGIN==*/ … /*==CORE-END==*/` free of DOM and THREE. That block is the Node unit-test seam and owns state normalization and geometry invariants:
  - coverage A hides the picture and forces the picture LED off;
  - pegboard `0` forces the pegboard LED off;
  - coverage B uses four non-overlapping panel regions around the picture.
  - the “Максимум” pegboard is 4 columns × 3 rows of 30 × 42 cm cells (120 × 126 cm), centered over the desk, and forces the picture and its LED off. The smaller variants are 3 × 1 cells (90 × 42 cm): “Над столом” sits right of the picture above the monitor, “По центру” sits above the picture; both keep their LED frames clear of the picture frame.
  - the “Световое панно” variants (4 squares, mountains, Russia map) replace the picture, are centered on the wall, force the picture LED off, and remove the picture cutout from the MDF panels; the “4 квадрата” variant is 38.5 × 38.5 cm overall (four 18 cm tiles with a 2.5 cm central gap), not 38.5 cm per tile;
  - “Максимум” and a panno cannot both occupy the central zone: `sanitize` keeps the panno and falls the pegboard back to variant 1. The UI resolves the conflict by the latest user action.
- MDF textures use world-coordinate UVs (`Core.uvAt`) with per-decor tile widths from the manifest. Do not switch to per-mesh 0…1 UVs; the slat pattern will jump at panel seams. The source tiles are not seamless along V, so `Core.decorTile` stretches the vertical repeat to at least the wall height; shrinking it back causes visible horizontal bands.
- Preserve the state flow: UI → `sanitize` → one scene update path, and restore the pre-AI snapshot when the AI preset is switched off.
- `_work/` is disposable analysis output and is not a source of truth. `panels/*.png` and the root reference/catalog images are sources, not runtime files.

## Git workflow
- Commit after every completed task, without waiting for a reminder: stage the intended source, test, doc, and deliverable changes, write a concise descriptive message, create the commit, and verify `git status` leaves only ignored output such as `_work/`.
- Keep generated/analysis output (`_work/`, screenshots) out of commits. Do not amend or rewrite existing commits unless explicitly asked.

## Verification
- Build: `python build.py` (regenerates the board-only pegboard crop, downscales textures, inserts `panno_rings.json`, writes `3droom.html`). The map PNG and rings come from `python _work/panno_gen.py`.
- Unit tests: `node tests/core.test.js` extracts/evaluates the marked CORE block and checks state and geometry invariants (17 tests).
- Browser test: `node _work/visual/run.js` uses Chrome at 2560×1600 via `file://` and `puppeteer-core` from `C:\Users\ostrov\AppData\Local\Temp\opencode\room_a_visual\node_modules`; headless WebGL needs `--enable-unsafe-swiftshader`. It checks every LED, light preset, decor, peg placement (including the 4×3-cell “Максимум”), all three panno variants, panno/“Максимум” conflict resolution, panno AI restore, corner toggle, AI restore, plus console/page/runtime errors and a non-blank canvas.
- Open `file:///D:/projects/room_a/3droom.html` manually for final visual QA. The three Three.js CDN scripts still need network access.

## Current gaps
- No known functional gaps. `3droom.html` is assembled and tested, and includes the board-only `peg_final.jpg`, the procedural desk-width 4×3 “Максимум” pegboard, and the three wooden light-panel variants.
