# Spark Pacing Balance (M3)

**Date:** 2026-11-06  
**Trigger:** Probe `m3-worth-playing.md` — burnoutRate=1.0, runs die in 3–10 ticks (~14–16 spark/act).  
**Forge note:** Confirming his knobs with exact numbers below; ship today.

---

## Edit table (Loom data — apply now)

| File | Field | Old | New |
|------|-------|----:|----:|
| `systems/methods.json` | `challenge.sparkCost` | 14 | **6** |
| `systems/methods.json` | `shame.sparkCost` | 8 | **4** |
| `systems/methods.json` | `inspire.sparkCost` | 22 | **4** |
| `systems/methods.json` | `carry_burden.sparkCost` | 18 | **4** |
| `systems/methods.json` | `lie.sparkCost` | 10 | **5** |
| `systems/player.json` | `defaults.sparkStart` | 70 | **88** |
| `people/traits.json` | `spark_den_ogre.sparkStart` | 70 | **88** |
| `people/traits.json` | `spark_clerk_ink.sparkStart` | 75 | **90** |
| `people/traits.json` | `spark_brood_shared.sparkStart` | 65 | **85** |
| `hooks/spark-recovery.json` | `recovery_base_dawn` add | +8 | **+12** |
| `hooks/spark-recovery.json` | `recovery_den_hearth` add | +8 | **+10** |
| `hooks/personal-cost.json` | `cost_town_despair` add | −3 | **−1** |

**Confirming Forge:** (1) cut costs ~45% overall, **harder cut on kind** (inspire/carry → 4). (2) sparkStart **85–90** band + stronger dawn regen (not per-tick). (3) travel = net recovery (Forge). (4) succession before hard zero (Forge).

---

## Targets (matrix @ maxTicks 200, with dawn/rest wired)

| Style | Median ticks | burnout_rate | near-death (spark&lt;20) |
|-------|-------------:|-------------:|------------------------:|
| kind (careful) | **≥ 80** (aim ~150–200) | **0.40–0.80** | **≥ 0.70** |
| mixed | **≥ 60** | **0.70–1.0** | **≥ 0.85** |
| savage | **40–90** | **≥ 0.90** | **≥ 0.90** |
| Aggregate burnout_rate | — | **≤ 0.85** (not 1.0) | — |

Without dawn/rest (today’s bot path): floor ~**18–22** acts — still short; **Forge must expose `advance:dawn` / rest in `listActions`**.

---

## Headless math (why these numbers)

Probe: start ~70, kind acts cost ~18–22 → **~3–5 ticks**.  

After edits, kind avg cost ≈ **4**, start **88**:
- **No dawn:** 88/4 ≈ **22 acts** (floor until rest exists).
- **Dawn every 3 acts, +12 base (−1 despair):** day net ≈ 3×4 − 12 = **0**; dusk noise → kind median **~180**, burnout **~0.75**, near-death **~1.0**.
- **Savage** avg ≈ 5–6: day net negative → median **~60–70**, still mortal.

---

## Forge src changes (required today)

1. **Expose** `advance:dawn` and/or `rest` (+10 spark, 1 tick, once/day) in bot `listActions` so regen is reachable.  
2. **Travel:** each `route.travel_step` day apply `player.spark += 2` (net recovery vs sitting still burning acts); optional data later.  
3. **Succession:** open when `spark ≤ emberZoneBelow` (20) **or** after first act at spark≤20 — do not wait for 0. Keep `burnoutAt: 0` as hard lock after succession declined/ignored.  
4. Re-run `npx vite-node scripts/run-playthrough-matrix.mts`; expect burnout_rate **&lt; 1.0** and kind med ticks **≫ 10**.

---

## Road-content data state

Left as authored earlier (trades/density/workers/caravans + `validate/road-content.mjs`); not part of this balance pass.

## Out of scope

M4 plan; changing method *power*; hex; archetypeId branches.
