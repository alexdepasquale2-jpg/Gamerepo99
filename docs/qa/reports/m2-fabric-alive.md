# M2 Fabric alive — generator quality report

**Generated:** 2026-11-05 10:36 PM (America/New_York)  
**Harness:** `tests/bots/fabric/` via `connectFabricApi()` → `src/sim/fabric.ts`  
**Status:** `OK` (live matrix; API present)  
**Candidate HEAD:** `f40b89e` (includes Fabric C `75d3e45` / Loom frags `0eb7655` / D `99c1013`)

## Verdict
**Call: NO-SHIP**

**Question:** Does the fabric make people (and worlds) feel unique and alive?  
**Answer:** **No.** Tasks C+D landed in `src/sim/dyn/` (reaction line-select, coherence asserts, 1439 fragments on disk when present), but **`generateWorld` / `generatePeople` never call them**. The headless worldgen path Probe gates still emits scaffold voice.

### Concrete evidence (fresh `generateWorld`)
| Seed | Fingerprint | Sample line texts | assertVoice |
|------|-------------|-------------------|-------------|
| 1 | `wf-008231e5-8` | `stub-voice-1-0` … `stub-voice-1-3` (`source: fallback`) | all `scaffold_line` reject |
| 2 | `wf-00b04796-8` | `stub-voice-2-0` … | all reject |
| 7 | `wf-0072bf43-8` | `stub-voice-7-0` … | all reject |
| 17 | `wf-00bc3e35-8` | `stub-voice-17-0` … | all reject |

- `src/sim/gen/people.ts` still hard-codes `` `stub-voice-${seed}-${index}` `` — same as pre-C.
- Fingerprints match the pre-C matrix (`wf-008231e5-8`, `wf-00b04796-8`, …) — worldgen plumbing unchanged.
- History is still the fixed three-event stub (`founding`/`kin`/`rift`); gap sites still `{0, 0.5, 1}`; kin is chain+loop.
- Live `runFabricAssertions` → **`assertionViolationRate: 1`** (cap `0`). Honest fail; caps **not** retuned.
- Exact-text `repeatLineRate: 0` is meaningless here: every string differs by seed/index, pattern is pure template.

Green structural floors + green unit bots are **necessary**, not a ship. Samey scaffold worlds = **NO-SHIP**.

### Forge gap (for wire-up, not Probe)
`gen/` must stay pure per architecture notes — but the **public** `generateWorld` path Probe exercises needs baked lines somehow (thin dyn call from facade, or gen output that already carries real fragment text). Until worldgen lines stop being `stub-voice-*`, assertion floor cannot clear and the alive question stays **no**.

## Live matrix (12 seeds)
Seeds: `1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29` (`fabric-thresholds.json`)

| Metric | Threshold | Live aggregate | Pass? |
|--------|-----------|----------------|-------|
| world_diversity | ≥ 0.9 | **1** | yes |
| history_coherence | ≥ 0.95 | **1** | yes |
| kin_connectedness | ≥ 0.5 | **1** | yes |
| gap_spread | ≥ 0.55 | **1** | yes |
| assertion_violation_rate | ≤ 0 | **1** | **no (scaffolds)** |
| people_diversity | ≥ 0.75 | **1** | yes |
| determinism | true | **true** | yes |
| repeat_line_rate | ≤ 0.15 | **0** | yes (exact text only) |

Caps/floors **unchanged**. `assertionViolationRateCap` stays `0`.

## Automated truth (this turn)
| Command | Result |
|---------|--------|
| `npm run test:bots` | **54/54** pass |
| `npx vite-node scripts/run-fabric-suite.mts` | status OK; aggregates above |
| `npm test` | **88 pass / 1 fail** (+ 10 files fail collect) — see note |
| `npm run build` | **FAIL** — missing `src/data/dialogue/line-fragments.json` |

**Note (not Probe):** Working tree mid-split deleted monolithic `line-fragments.json` / `history-tables.json` / `assertions.json` into folders (`src/data/dialogue/fragments/`, etc.) while `src/sim/load-data.ts` and `scripts/validate/fabric-content.mjs` still expect the old single files. Fabric bots stay green because stub `generateWorld` does not load those JSONs. Fix is Forge/Loom load-data + validator — out of Probe scope.

## What would flip this to SHIP
1. `generateWorld` people lines = baked fragments (via dyn line-select or equivalent), **not** `stub-voice-*`.
2. Live assertion rate ≤ 0 on those real lines (still rejecting scaffolds/empty).
3. History/kin/gap that vary meaningfully by seed (not one hard-coded scaffold).
4. `npm test` + `npm run build` green on candidate SHA.
5. Probe re-run of this suite + feel pass answering the same alive question.

## Commands
```bash
npm run test:bots
npx vite-node scripts/run-fabric-suite.mts
npm test
npm run build
```

## Tidy (this turn, Probe)
- Split `fabric-run.ts` → `fabric-report.ts` (types/evaluate/aggregate) + `fabric-run.ts` (runner).
- Split `fabric-metrics-types.ts` out of `fabric-metrics.ts` (under soft cap).
- Move-only: all fabric-* (+ thresholds) → `tests/bots/fabric/`; `scripts/run-fabric-suite.mts` + PLAYTHROUGH_BOTS paths updated.
- `npm run test:bots` still **54/54** after move.

