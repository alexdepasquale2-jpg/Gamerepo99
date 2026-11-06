# 2.5D Tasks 2–6 report (Forge)

**When:** 2026-11-06 ~8:05–8:10am America/New_York  
**Tip at report:** (see SHAs below; tip after Task 6 docs commit)

## Task SHAs

| Task | SHA | Subject |
|------|-----|---------|
| 2 (prior) | `1d51a7b` | feat(map): world layout at minutes-scale spacing |
| travel+2 (Phase A) | `1db4736` | fix(m3): travel days net +2 spark per Loom pacing |
| 3 | `5e1bea1` | feat(map): stamp raster TileSource with lazy chunks |
| 4 | `5763a74` | feat(map): snapshot from TileSource chunks |
| 5 | `b84e385` | feat(m3): continuous chunked 2.5D overworld |
| 6 | (this docs commit) | verify + progress/report |

## Tests at boundaries

- Task 3 focused: `tests/sim/map/stamp-raster.test.ts` — 4/4
- Task 4 focused: `snapshot-chunks` + `play-boot` — 3/3
- Task 5 focused: `chunks-around` + map suite + play-boot — 9/9; `npm run build` OK; Playwright screenshots OK
- Task 6 full: `npm run validate` OK; `npm test` **256/256**; `npm run test:bots` **54/54**; `npm run build` OK
- Grep: no `new Array(width*height)` (or similar full-grid) under `src/sim/map/`

## Screenshots

- `artifacts/25d/overworld-boot.png`
- `artifacts/25d/overworld-walk-east.png`
- `artifacts/25d/overworld-canvas.png`
- Helper: `tests/e2e/m3-25d-screenshot.spec.ts`

## TileSource keys / prop types (for Prism)

- Stamp tiles: biome ids from FabricWorld (`mill_heath`, `ash_wood`, …) + `biomeId: 'road'` for corridors
- Manifest keys used when textures load: `crop.wheat` (field), `facility.mine.idle`, `facility.lumber_camp.idle` (camp), `facility.waystation.idle`
- Prop `type` strings on ChunkTiles: `field` | `mine` | `camp` | `waystation`
- Sheets: `BAKED_SHEETS` via BootScene preload; `SPRITE_SORT` origin (0.5, 1); depth = footY

## Concerns

- Visual is still rect-heavy (roads + underlay + prop rects); sheet frames need atlas frame slicing for painted look.
- Town markers use layout coords (minutes-scale); dump-based `townsFromDump` chips remain for legacy snapshot path only.
- Loom dirty unstaged data (`travel-trades`, `road-encounters`, untracked caravan/facility/encounter files) left alone.
- sim `play-session/` / `travel/` / `scenario/` folder split still skipped per Niblet.
- Enter no longer boots TownScene (method menu in-place); e2e m3-overworld-smoke Enter assertion still only checks no console errors.
