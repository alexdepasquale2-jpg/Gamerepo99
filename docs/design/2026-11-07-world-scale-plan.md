# World scale + density plan (draft 1)

Goal: a world about 40x larger in area (about 6.3x per side), with more space and detail between places. Tiles only exist near the player. The economy and logistics layer always runs, on abstract data.

## Core idea: a refinement ladder
The map is data first and pixels last. Each level is an ASCII grid made from the level above it.

| Level | Cell size | Contents | When |
|---|---|---|---|
| L0 world | 1 char = 256x256 tiles | biome, height band, river, town, road | worldgen, always in memory |
| L1 region | 1 char = 64 tiles | coastlines, forests, hills, road bends | on demand, cached |
| L2 district | 1 char = 16 tiles | fields, groves, ponds, farmsteads | on demand |
| L3 local | 1 char = 4 tiles | paths, fences, rock clusters, building footprints | on demand |
| L4 tiles | 1 char = 1 tile | final tiles and props (TileSource chunk) | inside the render radius only |

ASCII legend (shared, data-driven in `data/world/glyphs.json`): `~` water, `^` mountain, `n` hills, `T` forest, `.` plain, `,` field, `#` town, `=` road, `:` ford/bridge.

## "Diffusion-style" refinement (no ML, deterministic)
To refine a parent cell into a 4x4 block of children:
1. **Seed**: copy the parent glyph into every child, then add noise with `deriveRng(seed, level, x, y)`.
2. **Denoise passes** (2–3 cellular-automaton steps): each child moves toward its neighbours and its parent's class. Rules live in a data table, for example forest edges thin to plain and water stays connected.
3. **Constraints**: every child must still agree with its parent. The child must contain the parent's class, roads and rivers stay continuous across block edges, and town footprints are pinned.
4. **Seams**: a block reads its neighbouring parents (a one-cell halo), so edges match no matter what order blocks are made in.

Same seed + same coords = same result every time. Revisiting a place gives the same land, so only player-made changes need saving.

## What always runs vs. what is lazy
- **Always (L0 graph)**: towns, road graph (lengths in tiles at the new scale), ledgers, carts, companies, households, borders, polity. This already works on abstract data. Only distances and travel days get rescaled.
- **Lazy**: L1–L4 grids and Phaser chunks, built inside a radius around the player and dropped by an LRU cache. Villagers out of view keep using the abstract schedule (LOD).
- **Saved deltas**: only player and NPC edits to tiles, per chunk (claims, built plots, felled trees). Unchanged chunks are never stored.

## Phases (one per session, each tested and deterministic)
1. **L0 as data + ASCII dump.** Turn today's worldgen into an L0 grid. Add `npm run map:ascii` and a golden ASCII snapshot test. No change to gameplay.
2. **Refine function.** Add `refine(parent, halo, level, seed) -> child`, with tests for determinism, parent agreement, seam match and road/river continuity. Print L0→L2 as ASCII to review by eye.
3. **Native TileSource.** Add `kind: 'native'`, built from L4 and behind a flag next to `stamp`. Add a chunk cache and a radius budget (target: no chunk generation over 4 ms per frame).
4. **Scale up 40x.** Raise L0 dimensions and town spacing. Rescale road lengths, travel days, cart haul limits and courier odds in data. Rerun the economy probes (30/240/400 dawns) so the balance stays the same.
5. **Density pass.** Add data tables for farmsteads, waystones, groves and hamlets between towns at L2/L3. Plots and claims map onto L3 footprints.
6. **Deltas + save v3.** Add per-chunk edit logs and migrate from save v2.
7. **Render polish.** Add an M-map drawn from L0/L1, streamed chunk fade-in and a perf check on a phone.

## Risks
- Coordinates elsewhere assume the current size. Find every caller of `SPINE_SPACING`, `TILES_PER_MINUTE` and `biomeAt` before phase 4.
- Negative coordinates hide sprites, so keep the world origin at 0,0 and all coordinates >= 0.
- Economy distances drive balance. Phase 4 must keep the probe results within today's bands.
- Golden hashes (letters, fingerprint) will change in phase 4. Update them on purpose, in one commit.
