# Fabric Variety Fix Brief (additive)

**Date:** 2026-11-05  
**Author:** Loom (overnight / Niblet)  
**Trigger:** Probe NO-SHIP — history / gap / kin felt clone-shaped despite green Fabric metrics and 186/186 tests.  
**Constraint:** Loom edits data + plans only; Forge owns formula tweaks in `src/sim/gen/*`.

---

## 1. Audit method

Ran `createPlaySession({ mode:'inspect', seed, peopleCount:8 })` + `dumpWorld(generateWorld(...))` for seeds  
`7, 11, 42, 99, 256, 1024, 4096, 7777` (read-only; no `src` edits). Compared dumps to `specs/2026-11-05-m2-dynamic-fabric-design.md` pillars (gap axis, history topology, kin graph, doctrines, routes).

## 2. Metrics table (pre-fix HEAD ~2f545d0 / audit on current)

| Metric | Value | Read |
|--------|-------|------|
| Unique fingerprints / hashes (8 seeds) | 8 / 8 | Determinism OK; not bit-identical clones |
| Settlement-id Jaccard (pairwise mean) | **0.875** | **Samey** — only 4 towns; almost always the full set |
| Doctrine-id Jaccard mean | **0.738** | **Samey** — only 3 doctrines |
| History-id Jaccard mean | 0.293 | Moderate; still narrow beat pool / shallow chains |
| Biome-id Jaccard mean | 0.318 | Moderate; 4 biomes, often 1 per world |
| Town-count variance | 0.69 | Weak spread (3–5) |
| Gap-mean variance | **0.005** | **Samey** — means cluster ~0.4 |
| Kin-count variance | 1.36 | Mild |
| Route-diameter variance | 0.23 | Weak (diameters 1–2 only; 2 authored routes) |

**Verdict: SAMEY** on settlement set, doctrine mix, gap centering, and route topology. History/kin vary a little but not enough for Probe’s “alive world” bar.

### Spec mismatches called out by Probe

| Spec expect | Observed |
|-------------|----------|
| Settlements along gap with distinct profiles | Same 3–4 authored IDs nearly every seed |
| History as short **event list with topology** | Mostly flat picks from ≤17 procedural beats; few deep `chainsFrom` arcs |
| Kin/friend/pen-pal **shape** variety | Always spanning tree + random chords — no village-clan / diaspora / hub templates |
| Doctrines / routes as world flavor | Tiny catalogs → high Jaccard |

## 3. Approaches considered

| | Approach | Trade-off |
|---|----------|-----------|
| A | Forge-only RNG formula retune | Faster code change; still starved by 4 towns / 3 doctrines / thin beats |
| B | **Data-first catalogs + precise Forge hooks** *(chosen)* | Loom ships tables now; Forge wires selectors; measurable Jaccard bands |
| C | Full procgen placenames | Too large for overnight; risks nondeterminism / Probe churn |

## 4. Data additions (Loom — this change)

All files &lt;400 lines, **grouped by topic** (not mechanical paging):

| Path | Purpose |
|------|---------|
| `world/towns.json` | +4 settlements across gap (brine_hitch, chalk_warren, peat_ladder, glare_spur) |
| `systems/doctrines.json` | +3 doctrine seeds tied to new towns |
| `world/history/historyBeats-*.json` | Re-group by kind; +branching arcs (`chainsFrom`, rival branches) |
| `world/world-shapes.json` | Archetypes: `ridge_string`, `delta_fan`, `single_spine`, `twin_poles` (gap/site count priors) |
| `world/kin-patterns.json` | Templates: `village_clan`, `road_friends`, `diaspora_penpal`, `hub_and_spokes` |
| `world/biomes.json` | +4 biomes (peat_fen, chalk_downs, brine_marsh, slag_verge) |
| `world/fauna.json` | Fauna ids tied to biomes (Prism `fauna.<id>`) |
| `economy/crops.json` | Crop ids for farms/heath (Prism `crop.<id>`) |
| `economy/economy-resources.json` | +ores (`ore_copper`, `ore_slag_tin`) |

Routes: +2 authored edges so diameter can exceed 2 once Forge samples them.

## 5. Formula tweaks for Forge (precise)

### 5.1 Settlements (`settlements-gen.ts`)
**Before:** `target = min(n, max(3, rng.int(3, n+1)))` over 4 towns → almost always 3–4 of the same IDs (Jaccard ~0.88).  
**After:**  
1. Draw `shapeId` from `world-shapes.json` weights for `seed`.  
2. `targetCount = clamp(shape.settlementCount, 3, towns.length)`.  
3. Prefer towns whose `gapAxis` falls in shape’s `gapBands` (each band contributes ≥1 when available).  
4. Never force the full catalog when `towns.length ≥ 6` — leave ≥2 out on average.  
**Expected band:** settlement-id Jaccard mean **≤ 0.55** across the 8 audit seeds.

### 5.2 Gap sites (`gap-sites.ts`)
**Before:** poles + uniform mids → gap-mean variance ~0.005.  
**After:** apply shape’s `gapBias` (`low`|`mid`|`high`|`bimodal`): bimodal pulls two mids toward 0.25±j and 0.75±j; low/high skew mid draws.  
**Expected band:** gap-mean variance **≥ 0.02** across 8 seeds.

### 5.3 History (`history-gen.ts`)
**Before:** pick eligible beats until `targetCount`; weak use of branching.  
**After:**  
1. Pick a **root arc** tagged `arc:<name>` from beats with empty `chainsFrom`.  
2. Prefer beats whose `chainsFrom` intersects selected IDs (weight ×3).  
3. With probability `shape.rivalArcChance` (default 0.35), start a second root from a disjoint arc tag.  
**Expected band:** history-id Jaccard mean **≤ 0.22**; ≥30% of dumps include a beat with satisfied non-empty `chainsFrom`.

### 5.4 Kin (`kin-gen.ts`)
**Before:** random recursive tree + chords.  
**After:** pick `kin-patterns.json` template by seed; build edges from template slots (`attach: previous|hub|random_earlier`, `kindBag`). Keep connectivity.  
**Expected band:** kin kind-mix entropy mean **≥ 1.2 bits**; degree variance mean **≥ 1.5**.

### 5.5 Doctrines / routes / biomes
Weight doctrine pick by settlement subset (already); ensure ≥1 doctrine per shape’s `doctrinePressure`.  
Route pick: include shape’s `routePolicy` (`spine`|`mesh_light`) so diameter mean **≥ 2.0** when ≥5 settlements.  
Biome pick: union of route biomes **plus** 1–2 from shape `biomeTags` so biome Jaccard **≤ 0.45**.

## 6. Example dump expectations (seed 42, after Forge wires tables)

| Field | Before (audit) | After (target) |
|-------|----------------|----------------|
| settlements | ashford, city_reach, lowmere, marrow_den | e.g. ashford, brine_hitch, peat_ladder, city_reach (≠ full set) |
| history | founding_desk→ferry→losses… flat | founding_mill → mill_fire → doctrine_mill_bread **or** rival feud arc |
| kin | mixed random | matches one template label in dump comment / fingerprint mix |
| biomes | often `{glare_approach}` alone | ≥2 ids including a new biome when shape asks |

## 7. Acceptance (Task H)

See `plans/m2/task-h-variety.md`. Variety test thresholds mirror §5 expected bands. Data validates via `npm run validate-data`. Probe re-runs fabric bots after Forge lands formulas.

## 8. Out of scope

No `src/` edits from Loom. No hex grid (wilderness §6 locked square ortho). No runtime LLM.


## 9. Prism asset id lists (final after this change)

| Kind | Prefix | Ids |
|------|--------|-----|
| **Biome** | `biome.` | `river_margin`, `ash_wood`, `mill_heath`, `glare_approach`, `peat_fen`, `chalk_downs`, `brine_marsh`, `slag_verge` |
| **Fauna** | `fauna.` | `rabbit`, `deer`, `bird`, `pig`, `fox`, `fish`, `heron`, `rat` |
| **Crop** | `crop.` | `crop_wheat`, `crop_barley`, `crop_root`, `crop_reed`, `crop_flax` |
| **Ore** | `ore.` | `ore_iron`, `ore_copper`, `ore_slag_tin` |

Grid: square orthogonal (`q=x`, `r=y`) — wilderness-economy §6.
