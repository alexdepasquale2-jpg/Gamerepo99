# M2 Fabric alive — generator quality report

**Generated:** 2026-11-05 ~10:26 PM (America/New_York)  
**Harness:** `tests/bots/fabric-*` via `connectFabricApi()` → `src/sim/fabric.ts`  
**Status:** `OK` (live matrix)  
**Candidate:** Forge thin stub (`generateWorld` / `generatePeople` / dyn voice stubs)

## Verdict
**Call: NO-SHIP**

**Question:** Does the fabric make people (and worlds) feel unique and alive?  
**Answer:** **No.** Automated floors clear on the current stub, but the output does not feel unique or alive.

- Every person line is `stub-voice-{seed}-{index}` (source:`fallback`) — exact-text anti-template metric passes because strings differ, yet the **pattern is pure template**.
- `interpolateLine` always returns `'stub interpolated line'`; `assertVoice` always `{ ok: true }` — assertions cannot fail, so violation rate is meaningless until real constraints exist.
- Kin is a chain+optional loop; gap sites are hard-coded `{0, 0.5, 1}`; history is a fixed ascending stub. Structure is correct for the harness, not expressive.
- Worlds have distinct fingerprints and people have distinct vectors — good seed plumbing — but there is **no voice, memory echo, or settlement character** yet.

Green numbers on stubs are **necessary progress**, not a ship. Re-run after Loom/Forge replace stub lines with baked anchors/fragments and real assertion failures can fire.

## Live matrix (12 seeds)
Seeds: `1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29` (`fabric-thresholds.json`)

| Metric | Threshold | Live aggregate | Pass? |
|--------|-----------|----------------|-------|
| world_diversity | ≥ 0.9 | **1** | yes |
| history_coherence | ≥ 0.95 | **1** | yes |
| kin_connectedness | ≥ 0.5 | **1** | yes |
| gap_spread | ≥ 0.55 | **1** | yes |
| assertion_violation_rate | ≤ 0 | **0** | yes (vacuous) |
| people_diversity | ≥ 0.75 | **1** | yes |
| determinism | true | **true** | yes |
| repeat_line_rate | ≤ 0.15 | **0** | yes (exact text only) |

Sample world fingerprints: `wf-008231e5-8`, `wf-00b04796-8`, `wf-005128af-8`, `wf-00518768-8`, `wf-00e52f3d-8`.

## What would flip this to SHIP
1. Non-templated lines from baked anchors/fragments (state-aware, not `stub-voice-*`).
2. Assertions that can actually fail (memory/tag contradictions) with measured rate.
3. History/kin/gap that vary meaningfully by seed (not one hard-coded scaffold).
4. Probe re-run of this suite + a second human/Probe feel pass answering the same question.

## Commands
```bash
npm run test:bots
npx vite-node scripts/run-fabric-suite.mts   # optional live dump
npm test
npm run build
```
