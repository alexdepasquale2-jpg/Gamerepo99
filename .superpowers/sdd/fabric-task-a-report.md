# Fabric Probe Stub + Task A Status

**Status:** DONE_WITH_CONCERNS  
**Commit (Probe stub):** `feat(sim): fabric facade + generateWorld stub for Probe` (hash: run `git log -1 --oneline --grep=fabric.facade`)  
**Skills used:** test-driven-development, verification-before-completion  
**Stopped:** Loom Task A (load-data flat-or-dialogue/) deferred — parent/sibling doing data git-mv; steering forbade load-data / data path edits.

## Deliverables (Probe unblocker)
- `src/sim/gen/people.ts` — `generatePeople`, `generatePersonDraft` (seeded via `createRng`)
- `src/sim/gen/world.ts` — `generateWorld({ seed, peopleCount? })` → FabricWorld shape
- `src/sim/dyn/voice.ts` — stub `interpolateLine`, `assertVoice`, `runFabricAssertions` (ok:true)
- `src/sim/fabric.ts` — re-exports only (no logic) per STRUCTURE.md
- `src/sim/index.ts` — re-exports fabric surface (second `connectFabricApi` candidate)
- `tests/sim/gen/world.test.ts` — same-seed equal, distinct fingerprints, shape + connectFabricApi non-null

## Behavior
- Deterministic: same seed ⇒ deep-equal; distinct seeds ⇒ distinct fingerprints
- ≥3 people, kin chain (+ loop friend edge), gapSites at 0 / 0.5 / 1, ordered history, assertions all ok:true
- Pure sim; gen never imports dyn

## TDD
1. RED: world.test.ts — module missing
2. GREEN: minimal gen/dyn/fabric stubs
3. No Task A implementation this dispatch

## Verification (fresh, stub scope)
- `npx vitest run tests/sim/gen/world.test.ts` — 4/4 pass
- `npx tsc --noEmit` — exit 0
- Did not run full `npm test` as green gate: parent mid-flight on methods.ts Task 6 fixes; Probe uncommitted fabric-run/fabric-api tests expect null / missing module

## Concerns
- Loom Task A **not done** (load-data indexing + resolveDataFile) — blocked by data git-mv; parent owns that lane
- Probe `tests/bots/fabric-api.test.ts` (uncommitted) still asserts `connectFabricApi() === null` — will fail until Probe flips expectation
- Probe `fabric-run.test.ts` imports missing `./fabric-run` — Probe WIP
- `methods.test.ts` currently red mid-parent Task 6 fix (not touched by this work)
