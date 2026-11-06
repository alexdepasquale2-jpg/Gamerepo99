# Task 6 tidy fixes + data regroup

**Agent:** Forge  
**Date:** 2026-11-05 (America/New_York)

## Commits

1. `a7cc06a` — `fix(sim): methods from DataTables; selector on state; split reactions`
2. `2dca344` — `refactor(data): move-only regroup into dialogue/people/world/economy/systems`

## Part 1 (Tidy Task 6 fixes)

- Dropped direct `methods.json` import from `methods.ts`; `rngFuzz` + `reigniteThreshold` now on `DataTables` via `loadData()`.
- Removed module-level `reactionLineSelector` singleton; `setReactionLineSelector(state, selector | null)` sets per-state only.
- Split refusal + reaction helpers into `src/sim/method-reactions.ts`; `commitMethod` stays in `methods.ts` (~205 lines, soft cap).
- Test: `parallel states do not share reaction line selectors` (3/3 methods tests).

## Part 2 (move-only)

- Loom §5 layout applied: `dialogue/`, `people/`, `world/`, `economy/`, `systems/`.
- `lines.json` kept at `src/data/lines.json` (not deleted).
- `hooks/` unchanged.
- Path updates: `load-data.ts`, `scripts/validate/load.mjs` (recurse subdirs, basename keys), `main.ts`, `wander-scene.ts`.
- Untracked `history-tables.json` placed under `world/` but **not** added in this commit.

## Verify (post both commits)

- `npm run validate` → OK
- `npm test` → 98/98
- `npm run build` → exit 0

## Out of scope / left alone

- Did not retire `lines.json`
- Did not implement Fabric Tasks B+ / full `generateWorld`
- Left other agents' dirty WIP uncommitted (Prism art, Probe bots, Loom validators content, etc.)
