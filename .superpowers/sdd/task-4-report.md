# Task 4 Report — Effects + hook runner

**Status:** DONE  
**Commit:** cc48d22  
**Skills used:** test-driven-development, verification-before-completion  
**Stopped:** no Task 5

## Deliverables
- `src/sim/effects.ts` — `applyEffect(state, effect, ctx)` (add/mul/set/grant_mark/remove_mark/emit_packet; M2 targets)
- `src/sim/hooks.ts` — `runHooks(state, trigger, ctx)`, `matchesWhen` (generic when{} predicates; no archetypeId branches)
- `tests/sim/hooks.test.ts` — dusk `cost_loneliness_tax` → spark 68; source scan forbids marrow special-case

## TDD
1. **RED:** Wrote brief tests importing `runHooks`; `npx vitest run tests/sim/hooks.test.ts` failed (module missing).
2. **GREEN:** Minimal effects applicator + hook runner over `player.hookIds` / `data.hooksById` / trigger + when.
3. **REFACTOR:** Kept both files under soft 200 lines (effects 160, hooks 94); exported `matchesWhen` for later method/refusal tasks.

## Design notes
- When clauses: empty `{}` matches; `any[]` OR; named predicates (`playerHasStatusTrait`, `methodId`, tag/age/id checks, `townDespairAbove`, …); other keys compared via `state.flags` (covers `kindSuccessToday` / `noBurningAdjacent`).
- Did not rewrite `load-data` / types; Effect `value` may be string at runtime for `set` statusTrait.
- Did not touch Prism assets, CREDITS, SCHEDULE, Loom WIP, or Task 5 files.

## Verification (fresh)
- `npx vitest run tests/sim/hooks.test.ts` — 2/2 pass
- `npm test` — 52/52 pass
- `npm run build` — exit 0

## Concerns
- None blocking. Town/successor/perception targets mutate via ctx stubs until world wiring lands; grant_mark needs `ctx.targetId` + `state.people` entry.
