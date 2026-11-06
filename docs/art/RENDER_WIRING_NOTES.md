# Render wiring notes (Forge)

Prism · Art & Feel — how to wire Loom `WorldRenderSnapshot` keys to committed sheets.

## Contract (render-side)

Sim emits plain views; render never asks sim for colors.

| View | Fields used by render |
|------|------------------------|
| `TileRenderView` | `q`, `r`, `biomeId`, `warmth` (0..1) |
| `FacilityRenderView` | `id`, `type`, `state` (`idle`\|`working`\|`abandoned`), `warmth`, `position` |
| `MobileRenderView` | `id`, `type`, `state`, `heading` (deg CW from north), `position` |

Lookup: `lookupAsset(key)` from `src/render/asset-manifest.ts` (data in `assets/manifest/overworld-assets.json`).

Typed helpers: `src/render/world-view.ts` (`biomeAssetKey`, `facilityAssetKey`, `mobileAssetKey`, view types).

Anchor every sprite at **bottom-center** (`SPRITE_SORT.originX/Y = 0.5, 1`). Depth-sort by foot `sortY`.

Grid: square ortho, `q = x`, `r = y` (`GRID.pendingLoomLock === false`).

Despair / alive: **palette shift / desaturation of RGB only** from `warmth`. Never overlays.

## Baked sheets (committed, fresh-clone safe)

| Sheet key | Path | Cell | Notes |
|-----------|------|------|-------|
| `sheet-ground` | `assets/sprites/sheet-ground.png` | 32×32 | grass row0, dirt row2; `road.*` frames 4–6 |
| `sheet-cliff` | `assets/sprites/sheet-cliff.png` | strips | lip / face / base |
| `sheet-buildings` | `assets/sprites/sheet-buildings.png` | facility cells | `facility.<kind>.<state>` |
| `sheet-buildings-side` | `assets/sprites/sheet-buildings-side.png` | side stamps | optional 2.5D wall read |
| `sheet-biomes` | `assets/sprites/sheet-biomes.png` | 32×32 | `biome.<id>` |
| `sheet-fauna` | `assets/sprites/sheet-fauna.png` | 32×32 | `fauna.<id>` (stub polish OK) |
| `sheet-crops` | `assets/sprites/sheet-crops.png` | 32×32 | `crop.<id>` |
| `sheet-ores` | `assets/sprites/sheet-ores.png` | 32×32 | `ore.<id>` |
| `sheet-caravans` | `assets/sprites/sheet-caravans.png` | 32×32 | `caravan.ferryman` frames 0–3 (4-way); `caravan.mount` frames 8–15 (8-way) |

`BAKED_SHEETS` in the manifest mirrors these paths.

## Key → sheet quick map

- Ground / biome: `biome.<id>` → `sheet-biomes`; filler grass → `sheet-ground` frames 0–2
- Roads: `road.track|road|highway` → `sheet-ground` 4–6
- Facilities: `facility.mill|lumber_camp|waystation|mine.<idle|working|abandoned>` → `sheet-buildings`
- Fauna / crops / ores: `fauna.*` / `crop.*` / `ore.*` → matching sheets
- Caravans: `caravan.<role>` — ferryman/mount on `sheet-caravans`; other roles Tiny Town/Dungeon until rebaked
- Farm is **proposed only** (`PROPOSED_FACILITY_KINDS.farm`) — not a data gap

## Heading

- 8-way: `headingToFrame8` / `resolveHeadingFrame` — N,NE,E,SE,S,SW,W,NW
- 4-way: `headingToFrame4` — N,E,S,W

## Safe now vs placeholders

**Use now:** ground, cliff, buildings, biomes, roads, `caravan.ferryman`, `caravan.mount`.

**Colored rect / stub OK:** fauna/crop polish, cargo piles, remaining caravan roles on Tiny Town/Dungeon frames.

## Target mockup

`docs/art/mockups/2.5d-world-target-v4.png` — despair | reignited split; compositing reference for alpha, single-frame stamps, one character per spot, variant grass. Reproducible via `scripts/art/assemble-world-target-v4.py`.

## World scale (Pass scale — uniform pack scale)

Single source of truth: `FEEL.worldScale` in `src/render/feel.ts`.

**Root cause of giants pass:** scaling characters alone (`heroScale` 4 → 64px) while buildings stayed tile-stamped. Fix: one integer `artScale` for the whole ansimuz pack.

| Knob | Value | Meaning |
|------|-------|---------|
| `tilePx` | 32 | Must match sim `TILE_PX`; 16px source × `artScale` 2 → 1 tile on screen |
| `artScale` | 2 | **Uniform** integer scale for hero, villagers, trees, props |
| `camZoom` | 1 | Integer only — “more zoom” comes from artScale↔tilePx, not fractional zoom |
| `pixelArt` (main.ts) | true | Nearest-neighbor under Scale.FIT — no blur |
| `cliffClearTiles` | 4.0 | Min tiles south of cliff row (`town.r+4`) for NPC feet / scatter |
| `cratePx` / `fencePostH` | 14 / 14 | Props at same visual density as artScale 2 |
| `tuftH` / `flowerPx` | 6 / 3 | Readable grass detail |
| `scatterMinPx` | 36 | Min gap between bushes/rocks/logs/stumps/sign/hay/flower patches |

- Hero / villagers: `setScale(artScale)` → 16×2 = **32px ≈ 1 tile ≈ 1.1–1.3× inn door**, clearly shorter than a house.
- Trees: never stretch (`setScale(s)` with identical x/y; no non-uniform `setDisplaySize`). Prefer ansimuz **Trees & Bushes** CC0 (`tree-oak`/`tree-pine`/`tree-fir`) at **scale 1** (already authored ~building height); fuller via **clusters**. Skinny buildings-sheet crops only as fallback at `artScale`.
- Hero vs door: ~**1.2–1.3×** inn door, clearly under house height (artScale 2 → 32px).
- Buildings / settlement stamps: keep tile-based `setDisplaySize` so stamp density matches 16×2 characters (v4 char:building height ≈ 1:4.5).
- Camera `setRoundPixels(true)` + `camZoom: 1`. Integer scales only.

**Meadow density:** poisson layers A/B/C (`poissonCell*` / `poissonKeep*`) plus expanded scatter candidates with `scatterMinPx` gap and cliff-band skip — open grass reads Stardew-dense, not empty.

Target mockup: `docs/art/mockups/2.5d-world-target-v4.png`. Before/after: `artifacts/25d/prism-scale-{before,after}.png`.

## Credits (this pass)

- ansimuz — Trees & Bushes (CC0) https://opengameart.org/content/trees-bushes
- ansimuz — RPG town / hero (CC0) already in vendor
