# M2 Fabric alive — generator quality report

**Generated:** 2026-11-05 10:46 PM (America/New_York)  
**Harness:** `tests/bots/fabric/` via `connectFabricApi()` → `src/sim/fabric.ts` (+ `fabric-bake.ts`)  
**Status:** `OK` (live matrix; API present; all metric floors green)  
**Candidate HEAD:** `faa9ff2` (`fix(sim): widen fabric-bake pool + within-world anti-dup`; alone corpus ~1184 + refuse text/id reuse inside one world)

## Verdict
**Call: NO-SHIP**

**Question:** Does the fabric make people (and worlds) feel unique and alive?  
**Answer:** **People: mostly yes. Worlds: no.** Line vitality cleared the prior catchphrase fail. History / gap / kin are still Task E scaffolds — every seed is the same town shape with different dialogue pasted on. QUALITY_GATE: samey worlds = **NO-SHIP**. Caps unchanged.

### Weighing line vitality vs Task E scaffolds
| Layer | At `faa9ff2` | Alive? |
|-------|--------------|--------|
| Baked lines (public path) | 96/96 unique texts across 12×8; stub-voice **0**; within-world exact dup **0**; `repeatLineRate` **0** (was 0.156 @ `079d119`) | **Yes** — real alone-corpus voice, anti-dup works |
| Assertions | live `assertVoice` → `assertionViolationRate` **0** | Pass |
| History | always `founding → kin → rift` (id seed digit only) | **Scaffold** |
| Gap sites | always poles `{0, 0.5, 1}` (id seed suffix only) | **Scaffold** |
| Kin | always **8** edges / chain-shaped connectedness that maxes the metric | **Scaffold** |
| Fingerprints | still `wf-008231e5-8`, `wf-00b04796-8`, … — bake changed text, not world identity plumbing | Unchanged structure |

Automated floors are necessary and now all green. They are **not** sufficient: `worldDiversity` / `historyCoherence` / `kinConnectedness` / `gapSpread` score 1 on clone-shaped stubs. Feel pass still fails the written bar (“no two worlds feel the same”).

### Concrete evidence (fresh `generateWorld`, peopleCount 8)
| Seed | Fingerprint | Sample line texts | Notes |
|------|-------------|-------------------|-------|
| 1 | `wf-008231e5-8` | `Shame the organizer… Stay. I'll say the true version.` / `Set it mid-boat. I'll balance the rest.` / `Call me a bad father…` / two lines share prefix `One more seed. Tomorrow is a crop if we bother.` + different tails | 8/8 unique exact; mild prefix echo |
| 4 | `wf-00518768-8` | `River's calm. I'm not…` / `Light the lamp. One more night. Family makes it heavier.` / `…I don't want that word. Please pick another.` / `It's`-adjacent grit + `Call me a washed-up tune…` | was worst seed @ 0.375 repeat; now **0** |
| 7 | `wf-0072bf43-8` | `Give me the sack of almost-given-up…` / `You used my absence as a sermon.` / `It's crooked. I'm keeping it.` | short blunt lines sit next to blends — feels peopled |
| 23 | `wf-006bb70f-8` | `Correct me properly or sit down…` / `Famous hands get watched. Keep them off my jars.` / `One more beat. Not hope—tempo…` | 8/8 unique; no prior quiet-house catchphrase stack |

**Cross-matrix (12×8 = 96 lines):** **96 unique** texts (was 24 @ `079d119`). Exact-text reuse rate **0**. Stub hits **0**. Within-world exact-dup seeds: **none**.

**Harsh feel caveats (not metric fails):** blend tails still recur as *phrases* across people (`Lean once. Then find your own feet.`, `Family makes it heavier.`, `Stay. I'll say the true version.`, `I've got heat left—use it carefully.`). Exact-line anti-dup is honest; clause-level chorus is still audible. Prefix twins inside one town (seed 1 “One more seed…”) are noticeable. Neither reopens the repeat-line cap; both keep the voice from feeling fully distinct person-to-person.

**World structure still scaffold** (Task E not landed):
- History: three events `founding → kin → rift` every seed.
- Gap: always village/mid/city at `0 / 0.5 / 1`.
- Kin: edge count 8 everywhere; connectedness metric maxes without varied topology.
- Fingerprints match pre-bake hex family — identity plumbing unchanged by bake.

## Live matrix (12 seeds)
Seeds: `1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29` (`fabric-thresholds.json` — **unchanged**)

| Metric | Threshold | Live aggregate | Pass? |
|--------|-----------|----------------|-------|
| world_diversity | ≥ 0.9 | **1** | yes |
| history_coherence | ≥ 0.95 | **1** | yes |
| kin_connectedness | ≥ 0.5 | **1** | yes |
| gap_spread | ≥ 0.55 | **1** | yes |
| assertion_violation_rate | ≤ 0 | **0** | yes |
| people_diversity | ≥ 0.75 | **1** | yes |
| determinism | true | **true** | yes |
| repeat_line_rate | ≤ 0.15 | **0** | **yes** (was fail 0.15625) |

Per-seed `repeatLineRate`: all **0**. Per-seed `assertionViolationRate`: all **0**. All 12 cells `OK`.

## Automated truth (this turn)
| Command | Result |
|---------|--------|
| `npm run test:bots` | **54/54** pass |
| `npx vite-node scripts/run-fabric-suite.mts` | status OK; aggregates above |
| `npm test` | **139/139** pass |
| `npm run build` | **OK** (`tsc --noEmit` + vite build) |

## What would flip this to SHIP
1. **Task E worldgen** — history / gap / kin (and settlements/doctrines/biomes/routes as planned) that actually vary by seed so two fingerprints are not the same town with different dialogue. Metric floors staying green on scaffolds does **not** count.
2. Optional polish (not the kill): reduce blend-tail chorus / within-town prefix twins so people feel distinct beyond exact-text uniqueness.
3. Probe re-run of this suite + feel pass answering the same alive question after E. Caps stay unless Forge/Niblet explicitly retune.

## Caps
`tests/bots/fabric/fabric-thresholds.json` **unchanged** this turn. Prior NO-SHIP product gap (tiny generic_blend deck → high repeat) is fixed at `faa9ff2`. Remaining product gap is Task E scaffolds, not harness shape. No harness / cap edit.

## Delta vs prior report (`079d119` / `3002ef5`)
| | `079d119` | `faa9ff2` |
|-|-----------|-----------|
| stub-voice | 0 | 0 |
| AVR | 0 | 0 |
| repeatLineRate | **0.15625 FAIL** | **0 PASS** |
| unique / 96 | 24 | **96** |
| history/gap/kin | scaffold | **still scaffold** |
| Verdict | NO-SHIP (catchphrases) | **NO-SHIP (samey worlds; lines cleared)** |

## Commands
```bash
npm run test:bots
npx vite-node scripts/run-fabric-suite.mts
npm test
npm run build
```
