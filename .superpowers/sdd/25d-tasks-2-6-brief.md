# 2.5D Tasks 2–6 (budget mode) — single batch

Plan: docs/superpowers/plans/2026-11-05-m3-25d-overworld-foundation.md
Spec: docs/superpowers/specs/2026-11-05-m3-25d-overworld-foundation-design.md
Tip base: c91755e (Task 1 @ 40c6b73 + Prism sheets)

## Budget constraints (Niblet 2026-11-06)
- No cloud agents.
- One worker only; do all Tasks 2–6 yourself sequentially.
- Full `npm test` (and bots/build as Task 6 says) ONLY at each task commit boundary — focused vitest while iterating.
- Skip src/sim play-session/travel/scenario subfolder split entirely.
- Do NOT message Niblet/Prism mid-batch; Forge will send one report at the end. Still save screenshots under artifacts/25d/.

## Global constraints
- Pure sim: src/sim/map/** no Phaser, no dyn/.
- Square ortho q=x, r=y.
- Soft 200 / hard 400 lines; split before merge.
- No archetypeId === in src/sim/.
- Do not touch docs/art/ or assets/vendor/.
- Defaults: CHUNK_SIZE=32, TILES_PER_MINUTE=120, WALK_MINUTES_SPINE=3.
- Prism locked: SPRITE_SORT origin (0.5, 1); sortY = foot/contact world y. Use BAKED_SHEETS + OVERWORLD_ASSETS from src/render/asset-manifest.ts. Safe keys: biome.*, road.* (dirt row), facility.* + sheet-buildings, trees=ansimuz stamps, cliff=sheet-cliff. Rects only for caravan.ferryman/mount.

## Task 2: WorldLayout
Create src/sim/map/constants.ts, world-layout.ts; tests/sim/map/world-layout.test.ts
layoutWorld(world, seed) → { settlements:{id,q,r}[], routes:{id,from,to}[] }
Place along gap01 axis spacing WALK_MINUTES_SPINE*TILES_PER_MINUTE + light seeded jitter.
Test: Manhattan between spine neighbors ≥ floor(0.8*3*120); determinism; ≥3 settlements.
Commit: feat(map): world layout at minutes-scale spacing
Boundary: focused vitest + that file green; optional quick map suite.

## Task 3: StampRasterSource
Create stamp-raster.ts, corridor.ts; tests/sim/map/stamp-raster.test.ts
createStampRasterSource(world, seed): TileSource kind:'stamp'
Lazy getChunk only; Bresenham corridors; biome fill by AABB; props field|mine|camp|waystation along roads; fingerprint stable; NO full-grid array.
Commit: feat(map): stamp raster TileSource with lazy chunks

## Task 4: Snapshot + retire town boot
Wire getWorldRenderSnapshot from TileSource chunks; update play-session* as needed; main.ts / boot-scene — remove TownScene from boot (stub file OK).
Test: tests/sim/map/snapshot-chunks.test.ts; update play-boot if chip assumptions break.
Commit: feat(map): snapshot from TileSource chunks

## Task 5: Continuous OverworldScene
Modify overworld-scene.ts (split chunk-layer/depth-sort if >200); hud/method-menu in-place; player depth=footY; camera.startFollow; WASD; near town opens method menu; use SPRITE_SORT (0.5,1).
Test chunksAround helper; npm run build + unit tests for touched areas.
Screenshots → artifacts/25d/ (headed playwright or texture export).
Commit: feat(m3): continuous chunked 2.5D overworld

## Task 6: Verify + leftover Forge docs only
npm run validate && npm test && npm run test:bots && npm run build
Grep: no full-world new Array(width*height) in map/
Commit leftover Forge-only docs fixes if any.
Do not SendToAgent — list hashes, screenshot paths, TileSource keys/prop types in your report file for Forge to relay once.

## Report
Write `/workspace/hearthfall/.superpowers/sdd/25d-tasks-2-6-report.md` with: each task SHA+subject, test commands+counts at boundaries, screenshot paths, TileSource keys used, concerns.
Return ≤15 lines: Status; tip SHA; task SHAs; test summary; report path; concerns.
