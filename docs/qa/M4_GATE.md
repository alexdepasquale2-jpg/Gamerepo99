# M4 living-world gate checklist (GO)

**Authority:** Alex via Niblet — Probe is the quality gate.  
**Rubric:** `docs/qa/QUALITY_GATE.md` — green unit/build tests are **necessary, not sufficient**. M4 adds a conceptual **living-world** row to the milestone map (*does the world move when the player isn't looking?*).  
**Status:** **GO** @ `61ff35f` — Alex, 2026-11-07. Verdict: `docs/qa/reports/m4-living-world.md`.  
**HOLD:** Do **not** run the living-world gate until Forge → Probe lists **all four** modules (LOD, caravans, doctrine, letters) **and** cites `npm run validate && npm test && npm run build` green on that tip.  
**Inputs:** `docs/superpowers/plans/m4/index.md` (Approach **B** chosen: dawn LOD + schedule tables + formula ticks) · task files `task-a-economy-lod.md` … `task-d-letters-rumors.md` · `packet-01.md` (authoritative for Task A / LOD paths) · `docs/superpowers/specs/2026-11-05-last-spark-m4-design.md` (living-world sections only).

> **REPLAN note:** the M4 design spec header remaps scope. **Succession / generational play, history depth, new archetypes, relapse arcs → M5.** Doctrine competition/collapse and wilderness caravans → **M4 living world**. Do **not** gate M4 on succession.

> **Do not flip M3 SHIP.** M3 stays **SHIP @ `ddd546f`** (`docs/qa/reports/m3-worth-playing.md`). The M4 gate reads M3 as a baseline for regressions. It never rewrites the M3 verdict. **basilisk_brood × savage** remains an **open risk, not a re-HOLD** (M3 pocket; Loom data levers — packet-01 appendix).

---

## Go trigger (only)

Gate **only** after a Forge → Probe ping that lists all of:

1. **LOD** — `src/sim/economy/economy-lod.ts` (`tickEconomyLod`; types in `src/sim/economy/economy-lod-types.ts`) dawn stock/despair wired (Task A / **packet-01**), headless. _(code under test SHA: `131b68f`; headless evidence OK, see `_m4-living-world-evidence.json`)_
2. **Caravans** — `src/sim/caravans.ts` schedule spawn/move from `caravan-schedules.json` (Task B), headless. _(code under test SHA: `131b68f`; headless evidence OK, see `_m4-living-world-evidence.json`)_
3. **Doctrine** — `src/sim/doctrine-tick.ts` competition + collapse cascade (Task C), headless. _(code under test SHA: `131b68f`; headless evidence OK, see `_m4-living-world-evidence.json`)_
4. **Letters/rumors** — `src/sim/letters-scale.ts` batch letters/rumors (Task D), headless. _(code under test SHA: `131b68f`; headless evidence OK, see `_m4-living-world-evidence.json`)_
5. Forge cites `npm run validate && npm test && npm run build` green on that tip. _(cite: validate+370 tests+build green at `131b68f`, run by Probe)_

Ignore partial pings (e.g. LOD only). Phaser/render is **not** part of acceptance. SHA blanks fill at Forge ping time only.

---

## Preflight (after Forge go ping)

| Check | How | Expect |
|-------|-----|--------|
| Tip SHA | `git rev-parse --short HEAD` + `git log -1 --oneline` | Record exact SHA; tip ≥ `c7c36ed`; leave Forge/Loom dirt alone |
| Data present | `src/data/economy/{dawn-stock,economy-lod}.json`, `world/caravan-schedules.json`, `systems/doctrines.json`, `dialogue/letters.json` | Tables load; `npm run validate` green |
| Modules exist | `src/sim/economy/economy-lod.ts` (+ `economy-lod-types.ts`), `src/sim/caravans.ts`, `src/sim/doctrine-tick.ts`, `src/sim/letters-scale.ts` | All four present; wired into `advanceToDawn` / `tick` / travel day loop |
| Unit test files exist | `tests/sim/economy/economy-lod.test.ts`, `tests/sim/economy/caravans.test.ts`, `tests/sim/doctrine-tick.test.ts`, `tests/sim/letters-scale.test.ts` | All four present (LOD suite landed with packet-01; B/C/D land with their modules) |
| No archetype branching | `grep -rn "archetypeId ===" src/sim/` | **0 hits** |
| Public API unchanged | `createPlaySession({ mode:'play', seed, archetypeId })` → `PlaySession` | Same surface as the M4 index HEAD API lock; bots still boot |
| M3 interaction evidence | `npx vite-node scripts/m3-interaction-evidence.mts --mode all` | Exit 0; `packetEmit`, `refusalCoalFlicker` true; `sparkSpendCount` 0 |
| Unit suites green | Forge cite + the M4 vitest command below | All pass |

---

## Exact command order (Probe at go-time — conserve)

```bash
# 0) Record tip
git rev-parse HEAD && git log -1 --oneline && git status -sb

# 1) Data validate (fast)
npm run validate

# 2) M3 interaction evidence regression (fast; must stay ok)
npx vite-node scripts/m3-interaction-evidence.mts --mode all
# → docs/qa/reports/_m3-interaction-evidence.json

# 3) M4 living-world unit suites (plan-accurate paths; B/C/D files land with Forge modules)
npx vitest run tests/sim/economy tests/sim/economy/caravans.test.ts \
  tests/sim/doctrine-tick.test.ts tests/sim/letters-scale.test.ts

# 4) M4 living-world headless evidence (10+ dawns seed 42; determinism double-run)
# Stub name locked; Probe writes the script at go-time (or earlier prep) — do not invent now.
npx vite-node scripts/m4-living-world-evidence.mts
# → docs/qa/reports/_m4-living-world-evidence.json

# 5) Hybrid-C matrix still runnable (M3 regression baseline; keep _m3-matrix-raw.json)
npx vite-node scripts/run-playthrough-matrix.mts
# → docs/qa/reports/_m3-matrix-raw.json

# 6) Bot unit harness
npm run test:bots

# 7) Build
npm run build
```

**Conserve note:** skip full `npm test` / e2e on the first pass unless steps 1–7 disagree or Niblet escalates. Forge's `npm test` cite counts for conserve.

### Path notes (packet-01 vs older task files)

| Module | Gate follows (canonical) | Older index / task-a flat path | In tree now? |
|--------|--------------------------|--------------------------------|--------------|
| LOD | **packet-01:** `src/sim/economy/economy-lod.ts`, test `tests/sim/economy/economy-lod.test.ts`, run `npx vitest run tests/sim/economy` | `src/sim/economy-lod.ts` / `tests/sim/economy-lod.test.ts` | **Yes** (packet-01 landed; flat paths not used) |
| Caravans | **task-b:** `src/sim/caravans.ts`, `tests/sim/economy/caravans.test.ts` | — | **Yes** |
| Doctrine | **task-c:** `src/sim/doctrine-tick.ts`, `tests/sim/doctrine-tick.test.ts` | — | **Yes** |
| Letters | **task-d:** `src/sim/letters-scale.ts`, `tests/sim/letters-scale.test.ts` | — | **Yes** |
| Evidence | `scripts/m4-living-world-evidence.mts` → `docs/qa/reports/_m4-living-world-evidence.json` | (plans unnamed; locked here to mirror M3) | **Yes** |

task-b's "modify `src/sim/economy-lod.ts`" should be read as the nested packet-01 module under `src/sim/economy/`. Gate does **not** require the older flat LOD paths.

---

## Metrics table (living world)

| Metric | Pass | Harsh fail | Source / note |
|--------|------|------------|---------------|
| **Determinism** | Same seed + same advances ⇒ identical LOD stock/despair, caravan positions, doctrine meters, letter/rumor events (two runs, deep-equal) | Any drift between identical runs | M4 index global constraint |
| **LOD stock moves** | 10 dawns seed 42 change stock/despair, or emit `stock.deliver` / `stock.starve` | Stock frozen with economy on | Task A / M4 acceptance §2 |
| **LOD despair mild** | Starve/broken despair add ≤ **0.05/dawn**; kind median still dozens of ticks with dawn reachable; **no 3-tick fuse** | Pre-pacing fuse returns (burnout spikes from LOD drain) | packet-01 acceptance; `cost_town_despair` stays mild (−1) |
| **Opt-out inert** | Ashford `economyOptIn:false` → no despair from stock, no `stock.starve` | Opted-out town drains | packet-01 test 1 |
| **Caravan spawns** | ≥ 1 `route.caravan` within 10 dawns seed 42 | 0 caravans | Task B / M4 acceptance §2 |
| **Caravan reaches town** | At least one caravan arrives and delivers stock (Task A deliver helper) | Caravans spawn but never arrive | Design spec wilderness M4 test |
| **Doctrine challenger swap** | Challenger legitimacy > incumbent + 0.15 for **3** consecutive dawns ⇒ peaceful swap (unless `control > 0.5`, which suppresses and adds exposure risk) | Swap on 1–2 days, or never | Design spec "Competition" |
| **Doctrine collapse pressure** | Collapse ⇒ `doctrine.collapse` juice + local despair pulse + `relapse_pressure` packet to a kin town; cascade finite | Collapse without kin packet; infinite cascade | Design spec "Collapse cascade" / Task C |
| **City→village shock** | City (`city_reach`) collapse lowers village `perceivedDelivery` −0.1 on imported promises | No cross-gap effect | Design spec cascade §3 |
| **Doctrine spark-neutral** | Doctrine tick alone leaves spark unchanged | Doctrine tick spends spark | Task C acceptance |
| **Letters/rumors Probe-visible** | ≥ **3** `letter.deliver` / `rumor.spread` over 10–20 dawns; ≤ cap (5/dawn) | 0 packets, or cap blown | Task D / M4 acceptance §2 |
| **Hybrid-C matrix runnable** | `OK`, 0 `API_PENDING`, 0 `ERROR`; stuck / bored / dominance clean | Matrix fails to boot or regresses to stuck/bored | M4 index: "Probe matrix must stay runnable" |
| **burnout_rate** | Still under the **Loom bar**: &lt; 1.0, prefer ≤ 0.85; compare to the M3 baseline ≈ 0.111 (post-SHIP follow-up ≈ 0.074) | = 1.0, or LOD-driven jump | M3 baseline @ `ddd546f` / follow-up @ `4c841a0` |
| **basilisk_brood × savage** | Record cell outcomes | — | **Open risk, NOT a re-HOLD.** Known M3 pocket; data levers are Loom's (packet-01 appendix). Does not reopen M3 SHIP. |
| **M3 interaction evidence** | `--mode all` exit 0; `sparkSpendCount` 0 | Any `spark.spend` on method success | `scripts/m3-interaction-evidence.mts` |

**Living-world bar (draft):** determinism + LOD-mild + caravan arrives + doctrine swap/collapse-packet + letters visible **and** Hybrid-C matrix still clean under the Loom burnout bar. If the world is quiet off-screen (stock frozen, no caravans, no packets) while units pass, that is the **green ≠ sufficient** smell.

---

## Evidence to capture (at go-time)

| Signal | Expect |
|--------|--------|
| Evidence script | `npx vite-node scripts/m4-living-world-evidence.mts` → `docs/qa/reports/_m4-living-world-evidence.json` |
| Event histogram (10–20 dawns, seed 42) | `stock.deliver` / `stock.starve`, `route.caravan`, `doctrine.collapse` (when thresholds met), `letter.deliver` / `rumor.spread` |
| Determinism | Two identical runs → identical histogram + dump hash |
| Despair trace | Per-dawn despair delta ≤ 0.05 per town |
| M3 regression | `_m3-interaction-evidence.json` `ok: true` |
| Hybrid-C matrix | `_m3-matrix-raw.json` still runnable; record basilisk×savage cell (open risk, not re-HOLD) |

---

## Verdict outputs

**GO @ `61ff35f`** (Alex, 2026-11-07) — see `docs/qa/reports/m4-living-world.md`. Original instructions below kept for reference.

~~No verdict exists yet.~~ At go-time Probe writes `docs/qa/reports/m4-living-world.md`, updates the Probe row in `docs/SCHEDULE.xlsx`, and reports to Niblet + Forge (priority: false). **This file does not contain a SHIP verdict.** Status remains DRAFT until the go-trigger fires and Probe runs the gate.

---

## Hard stop rules

- **Do not flip M3 SHIP**, and do not reopen the M3 gate from M4 findings. File M4 regressions as M4 issues.
- Do not gate on succession / generational / relapse arcs (REPLAN → **M5**).
- Do not edit `src/sim/**`, `src/render/**`, or `src/data/**/interactions/*.json` (Forge / Loom own those; Loom WIP may be stashed).
- Commit **Probe-only** paths. Never stage Forge/Loom dirt.
- **basilisk × savage** burnout pocket is an **open risk**, not a re-HOLD trigger.
- **HOLD** the living-world gate until Forge lists all four modules + green validate/test/build cite.
