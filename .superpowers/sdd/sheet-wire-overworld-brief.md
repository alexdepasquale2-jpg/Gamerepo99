# Wire Prism sheets → OverworldScene (Niblet top priority 2026-11-06)

**Success:** screenshot looks like `docs/art/mockups/2.5d-world-target-v4.png` — variant grass, dirt road, buildings+trees at settlements, a cliff, animated hero (not rectangle), foot-Y depth. Forge must visually verify.

**Refs:** `docs/art/RENDER_WIRING_NOTES.md`, `src/render/world-view.ts`, `docs/art/OVERWORLD_ASSET_MAP.md`, manifest `assets/manifest/overworld-assets.json`.

## Current failure
`chunk-layer.ts` paints flat GROUND rect + road rects + town orange rects; props only try whole-sheet images without frames. Player is still a Rectangle (or was — check tip `eca43c2` walk polish; may still be rect).

## Implement

### 1. Atlas frame slicing (boot)
In `boot-scene.ts` (or helper `src/render/sheet-frames.ts`):
- After loading BAKED_SHEETS images, `textures.get(key).add(frameIndex, …)` OR load as `spritesheet` with correct frame sizes:
  - `sheet-ground` / ground: 32×32, sheet 192×96 → 6×3 frames
  - `sheet-biomes`: 32×32, 512×32 → 16 frames
  - `sheet-buildings`: determine cell size from sheet 640×300 — inspect/README/Prism notes; likely multi-cell facility stamps. If irregular, crop via manifest frame as grid index with documented cellW/cellH (try 64×100 or read assemble scripts / Prism docs). Prefer whatever makes facility frames look right vs mockup.
  - `sheet-cliff`: strips — lip/face/base rows; use as spritesheet with sensible cells
  - `sheet-crops`, ores, fauna, caravans: 32×32
- Load `assets/vendor/ansimuz-hero.png` as spritesheet 16×16 (3×4), texture key `hero-ansimuz`. Scale ×2 in scene.

### 2. Rewrite `paintChunk` / town markers
- **Ground:** every tile → grass variant from sheet-ground frames 0–2 (seeded by q,r hash) OR biome frame via `biome.<id>` → sheet-biomes when biomeId matches Fabric biomes; filler grass otherwise.
- **Road:** tiles with biomeId `road` / `road*` → `road.road` (frame 5) or track/highway; use sheet-ground frame, NOT tan rect.
- **Props:** field → `crop.crop_wheat` (fix PROP_ASSET key!); mine/camp/waystation → facility.* frames from sheet-buildings with origin SPRITE_SORT; display size appropriate (buildings may be >32px).
- **Towns:** replace orange rect with building stamp (facility.mill.idle or waystation) + **trees** (crop frames from buildings sheet / biome ash_wood trees — if no prop.tree key, stamp 1–2 tree-looking frames from sheet-buildings or sheet-biomes ash_wood).
- **Cliff:** paint at least one cliff strip near first settlement or map edge using sheet-cliff frames (lip/face/base stacked) so screenshot shows a cliff.
- All sprites: `applySpriteSort` / SPRITE_SORT origin; depth by foot Y. Prefer `Phaser.GameObjects.Image` with frame over Rectangle. Keep underlay optional only if needed for holes; prefer full tile coverage with grass frames (no flat green field).

### 3. Hero in OverworldScene
- Replace Rectangle player with Sprite from `hero-ansimuz` frames; walk anim 2–3 frames when moving; idle when still; scale 2; SPRITE_SORT; keep walkDelta movement from `eca43c2`.

### 4. Fix PROP_ASSET
`field: 'crop.wheat'` is wrong — use `crop.crop_wheat` per manifest.

### 5. Verify
- `npm test` + build
- Recapture `npx playwright test tests/e2e/m3-25d-screenshot.spec.ts`
- Tip screenshots under `artifacts/25d/`
- Commit: `feat(render): wire Prism sheets into overworld (ground/road/buildings/cliff/hero)`

## Don’t
- Spark economy / bots
- Loose-test further moves
- Touch Loom interaction-model.md / SCHEDULE.xlsx
- Wait forever for Prism — implement Forge-side wiring now; Prism can refine painters later

## Report
Status; SHA; what was painted; screenshot paths; tip; concerns (building cell size guesses, etc.).
