# M2 Fabric alive — generator quality report

**Generated:** 2026-11-05 ~10:30 PM (America/New_York)  
**Harness:** `tests/bots/fabric-*` via `connectFabricApi()` → `src/sim/fabric.ts`  
**Status:** `OK` (live matrix)  
**Candidate:** Forge thin stub (`generateWorld` / `generatePeople` / dyn voice stubs with assertVoice reject paths)

## Verdict
**Call: NO-SHIP**

**Question:** Does the fabric make people (and worlds) feel unique and alive?  
**Answer:** **No.** Structural floors still clear on the stub, but voice is scaffold and the assertion floor now **fails honestly**.

- Every person line is `stub-voice-{seed}-{index}` (source:`fallback`) — exact-text anti-template metric passes because strings differ, yet the **pattern is pure template**.
- Harness now prefers live `runFabricAssertions` / `assertVoice` over baked `world.assertions`. Stub scaffolds (`stub-voice-*`, `stub interpolated line`) are rejected → **`assertionViolationRate: 1`** (cap is `0`). This is no longer vacuous.
- Kin is a chain+optional loop; gap sites are hard-coded `{0, 0.5, 1}`; history is a fixed ascending stub. Structure is correct for the harness, not expressive.
- Worlds have distinct fingerprints and people have distinct vectors — good seed plumbing — but there is **no voice, memory echo, or settlement character** yet.

Green structural numbers on stubs are **necessary progress**, not a ship. Assertion floor failing on scaffolds is the intended gate until Loom/Forge bake real lines.

## Live matrix (12 seeds)
Seeds: `1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29` (`fabric-thresholds.json`)

| Metric | Threshold | Live aggregate | Pass? |
|--------|-----------|----------------|-------|
| world_diversity | ≥ 0.9 | **1** | yes |
| history_coherence | ≥ 0.95 | **1** | yes |
| kin_connectedness | ≥ 0.5 | **1** | yes |
| gap_spread | ≥ 0.55 | **1** | yes |
| assertion_violation_rate | ≤ 0 | **1** | **no (honest — scaffolds)** |
| people_diversity | ≥ 0.75 | **1** | yes |
| determinism | true | **true** | yes |
| repeat_line_rate | ≤ 0.15 | **0** | yes (exact text only) |

**Before → after (assertion_violation_rate):** `0` (vacuous baked `[{ok:true}]`) → **`1`** (live `assertVoice` on stub lines). Cap unchanged at `0`.

Sample world fingerprints: `wf-008231e5-8`, `wf-00b04796-8`, `wf-005128af-8`, `wf-00518768-8`, `wf-00e52f3d-8`.

## What would flip this to SHIP
1. Non-templated lines from baked anchors/fragments (state-aware, not `stub-voice-*`).
2. Live assertions that pass on real voice (rate ≤ 0) while still rejecting scaffolds/empty.
3. History/kin/gap that vary meaningfully by seed (not one hard-coded scaffold).
4. Probe re-run of this suite + a second human/Probe feel pass answering the same question.

## Commands
```bash
npm run test:bots
npx vite-node scripts/run-fabric-suite.mts   # optional live dump
npm test
npm run build
```
