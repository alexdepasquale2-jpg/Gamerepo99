# Task 2 Report — Seeded RNG + types

Status: **DONE** — STOPPING (no Task 3)

## Commit
- Message: `feat(sim): seeded rng and core types`
- Hash: see `git log -1 --oneline` (message `feat(sim): seeded rng and core types`)

## What changed
1. **`src/sim/rng.ts`** — Mulberry32 kept; added plan API `int(min, max)` (half-open). Kept `nextInt` as alias so M1 `world.ts` / `tick.ts` still work.
2. **`src/sim/types/data.ts`** — `ArchetypeDef`, `HookDef`, `Effect` (+ `EffectOp`, `HookWhen`); runtime marker `DATA_TYPES_MODULE`.
3. **`src/sim/types/runtime.ts`** — `Inhabitant`, `SimState` (+ small helpers `EmbodimentState`, `PersonState`, `PacketState`); marker `RUNTIME_TYPES_MODULE`.
4. **Tests** — plan deterministic `next()` case; `int` range/determinism; `tests/sim/types.test.ts` loads modules and smoke-shapes objects.

M1 `src/sim/types.ts` (Npc/Tile/WorldConfig) left alone so wander demo imports stay stable. New M2 types live under `src/sim/types/`.

## Verification (fresh this turn)
- `npm test` → **12 files / 49 tests passed**, exit 0
- `npm run build` → `tsc --noEmit && vite build` exit 0

## TDD notes
- RED: `a.int is not a function`; `Cannot find module .../types/data`
- GREEN: minimal `int` + type modules
- Type-only imports were a false green under Vitest; tests import runtime module markers.

## Skills used
- test-driven-development
- verification-before-completion
- (using-superpowers: skipped — dispatched as executor subagent for a single task)

## Out of scope / untouched
- Prism assets, `docs/SCHEDULE.xlsx`
- Loom/Probe commits already on main
- Task 3 (`load-data`) not started

## Next
Parent → Niblet: Task 2 green; await route to Tidy; do not start Task 3 from this worker.
