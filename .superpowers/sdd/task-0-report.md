# Task 0 Report — M1 purity / STRUCTURE / tests

Status: DONE — STOPPING for Niblet ping before any M2 plan task

## Commit
- **461d264** `chore(m1): Task 0 purity — colors, hooks split, save I/O, tests`
- Full: `461d26449716ad8cc2ba60dcbe44a982331ad13e`

## What changed
1. **NPC_COLORS out of sim** — removed from `src/sim/world.ts` / `Npc.color`; palette + `npcColor()` live in `src/render/wander-scene.ts`
2. **localStorage out of sim** — `src/sim/save.ts` is pure `serializeSave` / `parseSave` only; persistence adapter is `src/ui/local-storage-save.ts`
3. **hooks.json split** — deleted monolithic `src/data/hooks.json` (447 lines); added `src/data/hooks/{index,spark-recovery,personal-cost,refusal,legacy}.json` (all ≤140 lines). `scripts/validate-data.mjs` loads the folder and synthesizes the logical `hooks.json` table
4. **Tests** — `tests/sim/world.test.ts`, `tests/sim/save.test.ts`, `tests/ui/local-storage-save.test.ts`
5. **STRUCTURE.md** — Tidy’s uncommitted edits included + clarified `hooks/` split and “Browser I/O never in sim”
6. **@types/node** — so `tsc --noEmit` accepts Node imports in tests

## Verification (fresh after commit)
- `npm test` — **7 files / 22 tests passed**
- `npm run build` — **exit 0** (`tsc --noEmit && vite build`)
- `npm run validate` — **OK** (17 hooks, 3 m2 archetypes)

## Concerns
- Working tree still has unrelated uncommitted Loom/Prism/Tidy docs & data (`kinship.json`, `letters.json`, art plans, e2e, etc.) — left out of this commit on purpose
- Prior Task 1 commit `9b80c2a` (data gate) remains on main ahead of M1 base; Task 0 is the next purity gate before M2 Tasks 1–5 resume

## Next
Await parent → Niblet ping before starting M2 plan Task 1.
