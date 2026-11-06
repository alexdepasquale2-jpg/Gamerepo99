# Task 6 Report — Method resolve + diegetic refusals

**Status:** DONE_WITH_CONCERNS  
**Commit:** (see git after commit)  
**Skills used:** test-driven-development, verification-before-completion  
**Stopped:** no Task 7; createPlaySession not started

## Deliverables
- `src/sim/methods.ts` — `commitMethod`, `CommitResult`, pluggable `setReactionLineSelector` / `pickFixedReactionLine` (fixed `lines.json` default)
- `src/sim/world.ts` — `seedPeopleFlame(data, townId?)` seeds flame/flameStart/tags/age/xy from people + town sites
- `src/sim/types/runtime.ts` — PersonState `age`/`x`/`y`; SimState optional `data`/`rng`/bus.emit for resolve boot
- `tests/sim/methods.test.ts` — brief tests + `bootAshford` helper

## Behavior
1. Refusal hooks on player `hookIds` (`kind=refusal`, `on_method_commit`, methodId + when) → apply effects, pick line by `lineVoiceFrom` archetypeId→default, juice `refusal.coal_flicker` + `spark.spend`; flame unchanged.
2. Else flameDelta = floor(basePower × woundMul × markMul × powerMul × rngFuzz); spend sparkCost × sparkCostMul × emberMul; roll markWeights (witness ±25% hollowness/genuine_growth); reaction via selector; juice events.

## TDD
1. **RED:** methods.test.ts — module missing.
2. **GREEN:** minimal commitMethod + seedPeopleFlame.
3. **REFACTOR:** compact helpers; pluggable reaction selector.

## Verification (fresh)
- `npx vitest run tests/sim/methods.test.ts` — 2/2 pass
- `npm test` — 63/63 pass
- `npm run build` — exit 0
- `node scripts/validate-data.mjs` — OK

## Concerns
- `methods.ts` is **243 lines** (soft 200 / hard 400) — under hard cap; may want split later.
- Witness mul is hardcoded ×1.25 (DESIGN §3.5); no data table yet.
- `markMul` uses mark effectiveness effects / `sameMethodFamilyMul` without gating on method family match (resentment always softens while stacked).
- `rngFuzz` / `reigniteThreshold` read from `methods.json` import (not `DataTables` root) because load-data only indexes the methods array.
- Left Loom WIP dirty files untouched (`scripts/validate/*`, `scenarios.json`, etc.).
