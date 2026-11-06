# M2 Fabric alive — generator quality report

**Generated:** 2026-11-05 10:43 PM (America/New_York)  
**Harness:** `tests/bots/fabric/` via `connectFabricApi()` → `src/sim/fabric.ts` (+ `fabric-bake.ts`)  
**Status:** `OK` (live matrix; API present; 0 stub-voice on public path)  
**Candidate HEAD:** `079d119` (includes bake `3595ccc` + zero-stub tests `079d119`; C/D + Loom frags underneath)

## Verdict
**Call: NO-SHIP**

**Question:** Does the fabric make people (and worlds) feel unique and alive?  
**Answer:** **No.** Stub-voice is gone and lines are real baked fragments — that unblocks the assertion floor — but the matrix still reads as a **small shared catchphrase deck** pasted onto scaffold-identical worlds.

### Concrete evidence (fresh `generateWorld`, peopleCount 8)
| Seed | Fingerprint | Sample line texts | Notes |
|------|-------------|-------------------|-------|
| 1 | `wf-008231e5-8` | `Light the lamp. One more night.` / `One more sack. Morning needs bread.` / `Rain's coming. Always is.` / `Midships. I'll balance.` (×2 in first 6) | in-world exact dup |
| 4 | `wf-00518768-8` | `Stack the files here. I'll walk them.` (×3 in 8) / `Don't rock the boat for pride.` (×2) | `repeatLineRate: 0.375` |
| 7 | `wf-0072bf43-8` | `Light the lamp. One more night.` (×2) / `Don't rock the boat for pride.` / `He's traveling. Leave it.` | parent-noted dup |
| 23 | `wf-006bb70f-8` | `Crossing was quiet. Quiet's a story.` (×2) / `Don't raise your voice in a quiet house.` (×2) | `repeatLineRate: 0.25` |

**Cross-matrix (12×8 = 96 lines):** only **24 unique** texts. Top repeats: `Light the lamp. One more night.` ×9, `Don't rock the boat for pride.` ×8, `Crossing was quiet. Quiet's a story.` ×7, `Midships. I'll balance.` ×6. Exact-text reuse across the Probe seed set ≈ **0.75**.

**World structure still scaffold** (same as pre-bake fingerprints hex):
- History: always three events `founding` → `kin` → `rift` (ids only change by seed).
- Gap sites: always `{0, 0.5, 1}`.
- Kin: chain (+ loop) — connectedness metric maxes out without feeling varied.
- Fingerprints match pre-bake (`wf-008231e5-8`, `wf-00b04796-8`, …) — bake changed line *text*, not world identity plumbing.

**Assertions:** live `runFabricAssertions` / `assertVoice` on line objects → **`assertionViolationRate: 0`** (cap `0`). Honest clear: no empty/scaffold/`stub-voice-*` left on the public path. Coherence-deep asserts only fire when person+fragment+constraints are all passed; the bake path supplies `{id,text,source}` and passes the voice gate as designed.

Green structural floors + green unit/build are **necessary, not a ship**. Recycled catchphrases on clone-shaped towns = **NO-SHIP**. Caps **not** retuned.

## Live matrix (12 seeds)
Seeds: `1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29` (`fabric-thresholds.json` — **unchanged**)

| Metric | Threshold | Live aggregate | Pass? |
|--------|-----------|----------------|-------|
| world_diversity | ≥ 0.9 | **1** | yes |
| history_coherence | ≥ 0.95 | **1** | yes |
| kin_connectedness | ≥ 0.5 | **1** | yes |
| gap_spread | ≥ 0.55 | **1** | yes |
| assertion_violation_rate | ≤ 0 | **0** | yes (real lines; no scaffolds) |
| people_diversity | ≥ 0.75 | **1** | yes |
| determinism | true | **true** | yes |
| repeat_line_rate | ≤ 0.15 | **0.15625** | **no** |

Per-seed `repeatLineRate` over cap: seed **1** 0.25, **3** 0.25, **4** 0.375, **5** 0.25, **23** 0.25. (2/7/11/13/17/19/29 at or under 0.15.)

## Automated truth (this turn)
| Command | Result |
|---------|--------|
| `npm run test:bots` | **54/54** pass |
| `npx vite-node scripts/run-fabric-suite.mts` | status OK; aggregates above |
| `npm test` | **136/136** pass |
| `npm run build` | **OK** (`tsc --noEmit` + vite build) |

Stub-voice sample check on default seeds: **0** matches in 96 lines.

## What would flip this to SHIP
1. Within-world and cross-seed **repeat line rate** under cap (mean ≤ 0.15; no seed at 0.25+), without shrinking the fragment pool into a handful of favorites.
2. Worlds that **feel** distinct — history / gap / kin that vary by seed, not only fingerprint hex + swapped catchphrases.
3. Alive voice: people within one town don't echo the same 2–3 lines; blend selection spreads across the 1439-frag library.
4. Probe re-run of this suite + feel pass answering the same alive question. Caps stay unless Forge/Niblet explicitly retune.

## Caps
`tests/bots/fabric/fabric-thresholds.json` **unchanged** this turn. Failures are product (bake selection / world scaffold), not Probe harness shape breaks. No harness edit required for connectFabricApi / assertVoice / evaluateWorld.

## Commands
```bash
npm run test:bots
npx vite-node scripts/run-fabric-suite.mts
npm test
npm run build
```
