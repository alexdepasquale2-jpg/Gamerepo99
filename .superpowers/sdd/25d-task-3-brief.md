# 2.5D Task 3 brief — StampRasterSource lazy getChunk + props

Plan Task 3: docs/superpowers/plans/2026-11-05-m3-25d-overworld-foundation.md
Depends on: Task 2 layout @ 1d51a7b; tip c7c36ed

## Global constraints
- Pure sim map/; no Phaser; no dyn/
- CHUNK_SIZE=32, TILES_PER_MINUTE=120, WALK_MINUTES_SPINE=3
- Soft 200 / hard 400 lines
- No full-world `new Array(width*height)` — lazy chunks only
- Do not touch Loom dirty data files (travel-trades, road-encounters, untracked economy/world json) or SCHEDULE.xlsx
- Skip sim play-session/travel/scenario split
- No SendToAgent

### Task 3
**Files:** Create `src/sim/map/stamp-raster.ts`, `src/sim/map/corridor.ts`; Test `tests/sim/map/stamp-raster.test.ts`

**Produces:** `createStampRasterSource(world, seed): TileSource` (`kind:'stamp'`)
- `getChunk({cx,cy})` returns only that chunk’s tiles/props
- `fingerprint()` stable same seed

**Tests:** (1) same seed fingerprint equal (2) getChunk far away returns empty-or-biome without throwing (3) a corridor chunk between two towns includes a road tile and ≥1 prop with type in `field|mine|camp|waystation`

**Implement:** Bresenham corridors, biome fill per chunk AABB ∩ padded layout bbox, prop stamps at seeded intervals along roads.

**Commit:** `feat(map): stamp raster TileSource with lazy chunks`

Then STOP and report — do not start Task 4.
