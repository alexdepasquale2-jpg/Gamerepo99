# Task 5 Report — Inhabitant assembly + tile access

**Status:** DONE_WITH_CONCERNS  
**Commit:** 595d722  
**Skills used:** test-driven-development, verification-before-completion  
**Stopped:** no Task 6; createPlaySession not started

## Deliverables
- `src/sim/inhabitant.ts` — `assembleInhabitant(data, archetypeId)`, `canEnterTile(inh, tileTags)` (traits/hooks only; no archetypeId ===)
- `src/sim/world.ts` — kept M1 `createWorld`; added `loadTownGrid` / `TownGrid` / `TownSite` (partial grid + sites)
- `tests/sim/inhabitant.test.ts` — brief tests + hook/spark copy + ashford sites
- `src/data/traits.json` — `body_basilisk_brood.activeBodiesMax` 2→1 (M2 lock; see concerns)

## TDD
1. **RED:** Wrote inhabitant tests; `npx vitest run tests/sim/inhabitant.test.ts` failed (module missing).
2. **GREEN:** Minimal assembly from trait blobs + blockedTileTags access; town grid loader from towns.json.
3. **REFACTOR:** Under soft 200 (inhabitant 101, world 131).

## Verification (fresh)
- `npx vitest run tests/sim/inhabitant.test.ts` — 4/4 pass
- `npm test` — 61/61 pass
- `npm run build` — exit 0
- `node scripts/validate-data.mjs` — OK

## Concerns
- Loom had left `body_basilisk_brood.activeBodiesMax: 2` with a note that dual control is M3. Locked M2 design + Task 5 brief require **1**. Corrected in traits.json so assembly copies data truthfully (no archetype branch / soft-cap hack). Flag for Loom if they intended a different M2 encoding.
- `loadTownGrid` is dimensions + sites only — no walkability tilemap yet (Task 6+/render).
- Did not export from `src/sim/index.ts` (matches Task 4 pattern); callers import modules directly.
