# M3 2.5D Continuous Overworld Foundation — Design

**Status:** LOCKED (Niblet 2026-11-05 ~11:46pm ET) · Approach **A** + adjustments  
**Owner:** Forge · Art keys: Prism `asset-manifest` · Style: `docs/art/STYLE_SPEC_2.5D.md`  
**Depends on:** M3 Tasks 1–6 (`createPlaySession`, dump, chip overworld), FabricWorld settlements/routes/biomes/facilities

## Goal

Replace separate overworld-chip + town screens with one **continuous scrolling** square-ortho walkable map: towns, roads, and wilderness between them. Depth-sort sprites by foot-Y. Camera follows the player. Chunked rendering so the map can be huge. Screenshots to Niblet (priority false).

## Non-negotiables (from Niblet + STYLE_SPEC)

1. **Pure deterministic sim rasterizer**, seeded from the **world seed**, with a **fingerprint test**.
2. **Real walking scale:** road travel between towns takes **minutes** of walking (not seconds), with wilderness props along corridors (fields, mines, camps, waystations).
3. **Lazy chunks by chunk coordinate** — do not bake the whole world up front.
4. **Seam for native gen tiles later (path B)** without touching the renderer.
5. Continuous map only — **no separate town scene** for exploration (method menu may open in-place).
6. Depth-sort by foot-Y; follow camera; Prism manifest keys (rects/placeholders OK until v3 sheets land).
7. Grid: square ortho `q=x`, `r=y` (wilderness-economy §6). Soft cap 200 / hard 400 lines per file.

## Architecture

```
FabricWorld (settlements, routes, biomes, facilities)
        │
        ▼
WorldLayout (assign world q,r to settlements; scale corridors)
        │
        ▼
TileSource seam ──► StampRasterSource (A, now)
                 └► NativeGenTileSource (B, later; same interface)
        │
        ▼
getChunk(cx, cy) → ChunkTiles { tiles, props, facilities }
        │
        ▼
getWorldRenderSnapshot / Phaser OverworldScene
  · load visible chunks only
  · terrain underlay + depth-sorted props/mobiles/player
  · camera follows player
```

### TileSource seam

```ts
export type ChunkCoord = { cx: number; cy: number };

export type ChunkTiles = {
  cx: number;
  cy: number;
  tiles: TileRenderView[];      // wilderness-economy shape
  props: FacilityRenderView[];  // trees, camps, waystations, etc. as facilities-or-props
};

export interface TileSource {
  readonly kind: 'stamp' | 'native';
  chunkSize: number;            // tiles per side, e.g. 32
  getChunk(coord: ChunkCoord): ChunkTiles;
  /** Stable hex fingerprint of layout + seed (for Probe / tests). */
  fingerprint(): string;
}
```

Renderer and snapshot consumers **only** call `TileSource`. Swapping stamp → native is a boot wiring change.

### Stamp rasterizer (A)

- Module: `src/sim/map/` (pure; **no** dyn/, **no** Phaser).
- Input: `FabricWorld` + `worldSeed` (+ optional layout constants).
- Steps (deterministic Mulberry32 from world seed):
  1. **Layout** — place settlements on the ortho plane so pairwise road distance ≈ **walkMinutes × tilesPerMinute** (defaults: `tilesPerMinute=120`, `walkMinutesBetween≈3` → ~360 tiles between neighbors on the spine). Use gap01 / route graph for order; jitter with seed.
  2. **Corridors** — Bresenham (or equivalent) road ribbons between route endpoints; stamp biome fill in a padded bbox around the layout (not infinite bake — only materialize via `getChunk`).
  3. **Props** — along roads at seeded intervals: field / mine / camp / waystation keyed for Prism manifest; denser near settlements.
  4. **`getChunk(cx,cy)`** — compute tiles/props whose `q,r` fall in that chunk’s AABB; never allocate the full map.
- Fingerprint: hash of `{ seed, layout positions, route id list, chunkSize, constants }` — same seed ⇒ same fingerprint; different seed ⇒ different.

### Walking scale defaults (tunable constants)

| Constant | Default | Meaning |
|----------|---------|---------|
| `CHUNK_SIZE` | 32 | tiles per chunk side |
| `TILE_PX` | 32 | matches STYLE_SPEC cell |
| `TILES_PER_MINUTE` | 120 | ~2 tiles/sec walk |
| `WALK_MINUTES_SPINE` | 3 | minutes between spine neighbors |
| Settlement footprint | ~12–24 tiles | by politySize tier |

### Phaser / render

- Rewrite `OverworldScene` into continuous world; **retire TownScene** from the play boot path (file may remain unused or thin wrapper that starts overworld at settlement).
- Chunk layer: mount/unmount chunk displays as camera moves (margin ≥1 chunk).
- Depth: set `depth = footY` (or Phaser depth sort) for props, buildings, player, mobiles.
- Assets: `resolve` via `asset-manifest`; missing → colored rect / stub frame (keys stable).
- Player spawn: first settlement center; WASD/arrows; near-settlement → method menu in-place (existing `createMethodMenu`).

### Snapshot

Expand `getWorldRenderSnapshot` to accept `TileSource` + camera AABB (or chunk set) and return wilderness-economy fields: `tiles`, `facilities`, `mobiles`, plus `towns` markers for HUD. Day/tick from session.

### Tests (TDD)

1. Fingerprint: same seed identical; seed+1 differs.
2. Chunk laziness: `getChunk` for far coords returns structure without building all chunks; calling N distinct chunks does not imply full-map allocation (assert via counter/hook or that fingerprint stable after many chunk pulls).
3. Walking scale: min Manhattan/road length between two spine settlements ≥ `WALK_MINUTES_SPINE * TILES_PER_MINUTE * 0.8`.
4. Props: corridor chunks contain ≥1 wilderness prop type on a multi-settlement seed.
5. Headless: snapshot for chunk (0,0) has tiles.length > 0 when layout covers origin (or relocate test to a known settlement chunk).
6. Soft caps; `validate` + `npm test` + `test:bots` green.

### Out of scope (this foundation)

- Full Prism v3 painted sheets (use manifest stubs/rects).
- Native gen tile emit (B) — interface only.
- Economy caravan AI polish; cliff elevation mesh beyond prop stamps.
- Fake Probe SHIP.

## Acceptance

- Boot play → continuous map, follow cam, walk toward another town takes clearly long (minutes at walk speed).
- Trees/buildings occlude player by foot-Y.
- Chunk streaming visible (no full-world bake).
- Fingerprint test green; screenshot(s) sent to Niblet priority false.
