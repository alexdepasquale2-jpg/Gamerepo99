# Ashford Tuning Protocol (post–createPlaySession)

**Date:** 2026-11-05  
**Owner:** Loom (knobs/bands) · Probe (matrix evidence) · Forge (lands data edits)  
**Status:** Doc only — **do not tune until** `createPlaySession` is live and matrix is not `API_PENDING`.

---

## 1. Preconditions

1. Forge exports `createPlaySession` matching Probe `BotSession` (+ scenario runner extras in `tests/scenarios/README.md`).  
2. `npm run test:bots` live matrix runs (not API_PENDING).  
3. Seeded scenarios in `src/data/scenarios.json` — ≥3 memorable moments green with `bakedDynamismLines: false`.  
4. Probe thresholds file: `tests/bots/thresholds.json`.

---

## 2. Probe matrix metrics (binding definitions)

From `docs/superpowers/specs/2026-11-05-playthrough-bots-design.md`, `docs/qa/PLAYTHROUGH_BOTS.md`, `docs/qa/QUALITY_GATE.md`, `tests/bots/thresholds.json`:

| Metric | Definition | Threshold / band (Ashford M2 target) |
|--------|------------|--------------------------------------|
| **stuck** | Fingerprint unchanged for `stuckTicks` (10) while actions empty/identical | Cell stuck-rate **≤ 15%** of runs; no style×archetype cell > 30% |
| **boredom** | `meaningfulChoices ≤ 1` for `boredomTicks` (10) | Cell boredom-rate **≤ 20%**; matrix mean **≤ 12%** |
| **method_dominance** | Max method pick-rate in a run vs `methodDominanceCap` **0.65** | Per-cell max pick-rate **≤ 0.65** unless DESIGN calls a signature opener (document in report) |
| **burnout_rate** | Fraction of runs ending burned out / succession open | Matrix mean **0.25–0.70**; reject near-0% or near-100% across all styles without written justification |
| **hollow_vs_reignited** | Hollow marks vs reignite-threshold crossings | Savage: hollow allowed but not exclusive; Kind: reignites > 0 and spark must move. Fail if savage-only-hollow **or** kind-never-costs-spark |

Quality gate also requires `docs/qa/reports/m2-worth-playing.md` after a live matrix.

---

## 3. Knobs (data only — no code forks)

Tune by editing JSON; re-run matrix + scenarios after each batch.

| Knob | File | Affects |
|------|------|---------|
| Method `sparkCost` / `basePower` | `methods.json` | burnout_rate, dominance, boredom |
| Wound×method matrix cells | `methods.json` effectiveness | hollow vs reignite, dominance |
| Mark weights / relapse mul | `marks.json`, `wounds.json` | chalk moment, hollow counts |
| Spark defaults / ember / burnoutAt | `player.json` | burnout_rate |
| Recovery / personal_cost values | `hooks/*.json` | loaf dusk tax, brood strain |
| Ripple / crossTown chances | `ripples.json` | nail packet frequency |
| Refusal stillShows / consumesAct | `hooks/refusal.json` | refusal coal readability |
| Link travel costs | `links.json` | Lowmere access pacing |
| Line fragments (only if flag on) | `line-fragments.json` | perceived variety — **do not** enable flag to “fix” matrix |

**Forbidden:** archetypeId branches; raising Brood `activeBodiesMax` above 1 in M2; changing succession copy.

---

## 4. Adjustment loop

```
1. Snapshot SHA + thresholds.json + current knob hashes
2. Run: npm run validate && npm test && npm run test:bots
3. Run scenario suite (flag off): vitest tests/scenarios (when runner exists)
4. Read matrix: stuck / boredom / dominance / burnout / hollow_vs_reignited
5. If breach:
   a. Identify ONE primary metric
   b. Change ≤3 knob fields aimed at that metric
   c. Re-run scenarios first (must stay green) then matrix
6. Stop when bands met OR two consecutive batches fail scenarios → revert batch, ping Loom
7. Probe writes / updates m2-worth-playing.md
```

**One metric per batch.** Do not simultaneous-nerf spark and matrix and ripples.

### Suggested first responses

| Breach | Try first |
|--------|-----------|
| boredom high | Lower one soft method sparkCost by 1; ensure ≥2 meaningful actions listed mid-day |
| dominance > 0.65 on Challenge | Nerf challenge basePower or raise sparkCost; buff inspire effectiveness on apathy slightly |
| burnout ~100% | +5 sparkStart or −1 on two method costs |
| burnout ~0% | +1 sparkCost on savage pair; confirm ember zone |
| hollow-only savage | Raise hollowness weight down slightly; buff genuine_growth on challenge×grief (Elias) |
| scenarios break | Revert last knob batch immediately |

---

## 5. Out of scope for this protocol

Hoarder notoriety, patrons, async import, bakedDynamism flag-on, Brood dual-active (M3 trait grant). Those have their own specs.

