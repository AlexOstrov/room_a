# AGENTS.md

## Repository facts
- This is a plain-files workspace tracked by git: branch `room_a` (the GitHub default branch), remote `origin` at https://github.com/AlexOstrov/room_a (public). There is no `package.json`, CI, test runner, or dev server. Do not invent `npm run …` commands.
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
  - the “Максимум” pegboard is 4 columns × 3 rows of 30 × 42 cm cells (120 × 126 cm), centered over the desk, shifted down one cell (42 cm), and forces the picture and its LED off. The smaller variants are 3 × 2 cells (90 × 84 cm): “Над столом” sits right of the picture above the monitor and keeps its LED frame clear of the picture frame; “По центру” is centered on the wall and hides the picture, because a 90 × 84 cm board does not fit above the 160 cm picture.
  - the “Световое панно” variants (4 squares, mountains, Russia map) replace the picture, are centered on the wall, force the picture LED off, and remove the picture cutout from the MDF panels; the “4 квадрата” variant is 38.5 × 38.5 cm overall (four 18 cm tiles with a 2.5 cm central gap), not 38.5 cm per tile;
  - “По центру” and a panno cannot both occupy the central zone: `sanitize` keeps the panno and falls the pegboard back to variant 1. The UI resolves the conflict by the latest user action. “Максимум” sits to the right of the panno and can be shown together with any of the three panno variants.
- MDF textures use world-coordinate UVs (`Core.uvAt`) with per-decor tile widths from the manifest. Do not switch to per-mesh 0…1 UVs; the slat pattern will jump at panel seams. The source tiles are not seamless along V, so `Core.decorTile` stretches the vertical repeat to at least the wall height; shrinking it back causes visible horizontal bands.
- Preserve the state flow: UI → `sanitize` → one scene update path, and restore the pre-AI snapshot when the AI preset is switched off.
- `_work/` is disposable analysis output and is not a source of truth. `panels/*.png` and the root reference/catalog images are sources, not runtime files.

## Git workflow
- Work on `room_a`, which tracks `origin/room_a`; `main` is the original local history and is not pushed. Keep the checkout on `room_a` unless asked otherwise.
- Commit after every completed task, without waiting for a reminder: stage the intended source, test, doc, and deliverable changes, write a concise descriptive message, create the commit, and verify `git status` shows a clean tree (only ignored output such as `_work/` may remain).
- Push after every commit with `git push` (same as `git push origin room_a`) and confirm `origin/room_a` points at the new commit before reporting the task as done.
- Keep generated/analysis output (`_work/`, screenshots) out of commits. Curated documentation images in `docs/` that are referenced by `README.md` are the exception; raw test screenshots stay in `_work/`. Do not amend, rebase, or force-push published history unless explicitly asked.
- Never commit credentials, tokens, or `.secrets` files. Authentication lives outside the repository, `origin` must stay a clean `https://github.com/…` URL, and tokens must not appear in sources, docs, commit messages, or logs.
- Keep the GitHub repository public unless the user explicitly asks to change visibility; do not create additional remotes or repositories without being asked.

## Verification
- Build: `python build.py` (regenerates the board-only pegboard crop, downscales textures, inserts `panno_rings.json`, writes `3droom.html`). The map PNG and rings come from `python _work/panno_gen.py`.
- Unit tests: `node tests/core.test.js` extracts/evaluates the marked CORE block and checks state and geometry invariants (18 tests).
- Browser test: `node _work/visual/run.js` uses Chrome at 2560×1600 via `file://` and `puppeteer-core` from `C:\Users\ostrov\AppData\Local\Temp\opencode\room_a_visual\node_modules`; headless WebGL needs `--enable-unsafe-swiftshader`. It checks every LED, light preset, decor, peg placement (the 3×2 variants and the shifted-down 4×3-cell “Максимум”), all three panno variants, all three “Максимум”+panno combinations, panno/“По центру” conflict resolution, panno AI restore, corner toggle, AI restore, plus console/page/runtime errors and a non-blank canvas.
- Open `file:///D:/projects/room_a/3droom.html` manually for final visual QA. The three Three.js CDN scripts still need network access.

## Current gaps
- No known functional gaps. `3droom.html` is assembled and tested, and includes the board-only `peg_final.jpg`, the procedural 4×3 “Максимум” pegboard, and the three wooden light-panel variants.
