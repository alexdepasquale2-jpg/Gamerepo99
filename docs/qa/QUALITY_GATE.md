# Probe quality gate

**Authority:** Alex via Niblet — quality outranks deadlines. Probe is the quality gate.  
**Rule:** Green unit/build tests are **necessary, not sufficient**.

## Milestone map (Alex replan)
| Milestone | Focus | Probe gate |
|-----------|-------|------------|
| **M2 Fabric** | Dynamism engine **+ world generation**, verified **headless** | Generator quality checks + verdict: *does the fabric make people/worlds feel unique and alive?* |
| **M3** | First **playable world** | Playthrough bot matrix + verdict: *is this worth playing?* |

## M2 ship gate — Fabric / worldgen (all required)

1. **Automated truth** — `npm test` + `npm run build` pass on candidate SHA.
2. **Generator quality bots** (live, not `API_PENDING`) across **many seeds**:
   - **World diversity** — pairwise world fingerprints distinct; **no two worlds feel the same**.
   - **History coherence** — coherence score / zero hard history breaks.
   - **Kin graph** — connectedness (e.g. largest component / edge density) above floor.
   - **Gap spread** — settlements/people span city↔village gap (not collapsed to one pole).
   - **Assertion violations** — interpolated behavior violation rate at/near **zero** on accepted outputs.
   - Supporting: people distinctness, seed **determinism**, low **repeat-line** rate.
3. **Written verdict** — `docs/qa/reports/m2-fabric-alive.md`:
   - **SHIP** / **NO-SHIP** / **SHIP-WITH-FIXES**
   - Answer: *Does the fabric make people (and worlds) feel unique and alive? Why or why not?*
   - Harsh. Samey worlds or templated lines = **NO-SHIP**.

## M3 ship gate — first playable world
Hybrid-C playthrough bots (`tests/bots/` play session matrix): stuck, boredom, method dominance, burnout, hollow vs reignited + `worth-playing` verdict. Not required to clear M2.

**Interaction-model re-gate:** when Forge lands `interactionCompat` default-ON (+ special-bar/ripple ports), follow **`docs/qa/M3_INTERACTION_REGATE.md`** (HOLD until Forge default-on green ping). Capture interaction event evidence via `scripts/m3-interaction-evidence.mts` in addition to the matrix.

## Process
Forge lands fabric/worldgen public API → Probe runs generator suite same turn → writes verdict → reports to Niblet. Overrides of **NO-SHIP** must be written.
