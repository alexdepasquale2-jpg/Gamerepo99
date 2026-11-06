# Road Content — Design (Travel Trades, Workers, Encounter Density)

**Date:** 2026-11-06  
**Skill:** brainstorming → design  
**Builds on:** `2026-11-05-wilderness-economy-design.md` §5; data `travel-trades.json`, `road-encounters.json`  
**Milestone:** M3 Task 3 numbers; M4 schedules/LOD deepen caravans  
**Plan touch:** `plans/m3/task-03-travel-encounters.md`; Living world `plans/m4/`

---

## 1. Context

Walking between settlements is **minutes of real play**, not a fade. Roads need:
1. Hireable **travel trades** (good and bad) with readable trust/price and consequences.
2. **Workers** at facilities and **caravans** with schedules (mobile flavor + stock flow hooks).
3. **Encounter density** tuned so quiet stretches exist on purpose — not a roll every step.

HEAD already has `startTravel(state, routeId)`, per-day `encounter.spawn`, and a cast of trades. This spec locks formulas, tells, density, and data shape so Forge can finish Task 3 without inventing numbers.

---

## 2. Options

| | Approach | Trade-off |
|---|----------|-----------|
| A | Keep stub weights; soft narrative only | Cheap; Probe will call roads empty/samey |
| B | **Data-driven formulas + density table + tells** *(chosen)* | Deterministic; validator-checkable; M3 numbers concrete |
| C | Full procedural roadside AI | M4+ scope bomb; nondeterministic feel |

**Decision: B.**

---

## 3. Travel trades — trust, price, tells, consequences

### 3.1 Roles (good → bad)

| id | Role | Lean | Pose-as | Notes |
|----|------|------|---------|-------|
| `carter_honest` | carter | good | — | Fair haul |
| `caravaner_guild` | caravaner | good | — | Slow, reliable |
| `ferryman_briggs` | ferryman | good | — | Needs Tom burning |
| `mount_stable` | mount | good | — | Cuts daysEff |
| `guide_local` | guide | good | — | Rerolls bad encounters |
| `escort_watch` | escort | good | — | Lowers highwayman weight |
| `courier_letter` | courier | good | — | Packet daysMul |
| `smuggler_gap` | smuggler | mixed | — | Fast; +exposure |
| `gouger_cart` | gouger | bad | carter | Overpriced “carter” |
| `false_guide` | false_guide | bad | guide | Lies path; +days or break |
| `scammer_shortcut` | scammer | bad | guide | `lieDays` |
| `highwayman` | highwayman | bad | — | Hostile open |
| `highwayman_as_carter` | highwayman | bad | carter | Soft tell; ambush after hire |

### 3.2 Formulas (Forge — pure, seeded)

Inputs per hire offer on route `R` at town `T` with doctrine `D` (if any) and player notoriety `N` ∈ [0,1]:

```
despair = clamp(T.despair, 0, 1)
legit   = clamp(D?.legitimacy ?? 0.4, 0, 1)
cond    = clamp(R.condition, 0, 1)
noto    = clamp(N, 0, 1)

trust = clamp(
  0.25
  + trade.trustBias
  + 0.35 * (1 - despair)
  + 0.20 * legit
  + 0.15 * cond
  - 0.20 * noto * (trade.lean === 'bad' ? 0.5 : 1),
  0, 1)

priceSpark = ceil(trade.baseSpark * (1.45 - 0.70 * trust) * sizeMul)
priceCoin  = ceil(trade.baseCoin  * (1.55 - 0.80 * trust))   // if coin meter absent → spark only
reliability = clamp(trust * cond * (trade.lean === 'good' ? 1.0 : 0.75), 0, 1)

// Hire:
daysEff' = max(1, ceil(daysEff * trade.speedMul))
each travel day: failChance = (1 - reliability) * 0.22
  if fail && trade.hostile → encounter force highwayman table
  if fail && trade.lieDays → +1 day secretly
  if fail && trade.exposureAdd → doctrine.exposure += exposureAdd
```

**Escort:** while hired, multiply `highwayman` / `highwayman_as_carter` encounter weights by `0.35`.  
**Guide (`encounterRerollBad`):** on bad-lean encounter, one reroll.  
**False guide:** presents as guide; after hire, `daysEff' *= 1.25` and `route.condition -= 0.05` on fail.

### 3.3 Tells (UI / blurb tags — data)

Each trade lists `tells: string[]` (player-visible when trust insight ≥ threshold OR after first betrayal):

| Lean | Example tells |
|------|----------------|
| good | `steady_hands`, `named_by_kin`, `fair_scale` |
| mixed | `eyes_on_gap`, `asks_no_names` |
| bad pose | `cart_too_clean`, `name_wont_stick`, `laughs_at_despair`, `badge_wrong_town` |

`revealAtTrustBelow: 0.4` — if computed trust &lt; 0.4, show one tell automatically.

### 3.4 Consequences (on resolve)

| Outcome | Effect |
|---------|--------|
| Honest complete | `bond` hint +0; optional stock +1 grain on carter routes |
| Gouger complete | pay price; no bond; town despair +0.01 |
| False guide fail | +1 day; `route.condition -0.05`; mark temptation toward shame if spark spent angry |
| Highwayman (open or posed) | spark −2..−4; optional stock loss; juice `encounter.spawn.highwayman` |
| Smuggler success | days fast; `exposure += exposureAdd`; notoriety +0.05 |

---

## 4. Workers & caravans

### 4.1 Facility workers (`economy/facility-workers.json`)

Per facility kind: staff roles with `shiftHours`, `sparkDrainIfHelp`, `meaningTag` (`meaning`|`exhaustion`).  
M3: when player `Carry`/`work` near facility, apply `cost_road_labor` / meaning hooks already in data.  
M4: LOD dawn tick uses `staffedMul` × schedule presence.

### 4.2 Caravan schedules (`world/caravan-schedules.json`)

```
{ id, routeId, departDawnMod, periodDays, cargoResourceId, qty, lean }
```

M3: dump/snapshot may list active caravans as mobiles (`type: caravan`).  
M4: LOD moves cargo along route; broken route → `stock.starve` pressure.

---

## 5. Encounter density (minutes of walking)

**Design target:** walking a 2-day route should feel like **~2–4 minutes** of real play if the player does not pause. Encounters must not fire every second.

| Constant | Value | Meaning |
|----------|------:|---------|
| `realMinutesPerTravelDay` | **1.25** | UI/Pacer: one sim day of road ≈ 75s of walk presentation (tunable) |
| `targetEncountersPerRealMinute` | **0.35** | ≈ one meaningful beat every ~3 minutes |
| ⇒ `targetEncountersPerTravelDay` | **0.44** | soft mean per day roll |
| `minQuietWeight` | **35** | every table must keep a quiet/empty entry ≥ this weight share (%) |
| `cooldownTravelDays` | **1** | after a non-quiet encounter, next day skips hostile/posed (quiet still ok) |
| `biomeWeightMul` | see data | ash_wood +0.1 hostility, mill_heath −0.05, glare +0.15, brine_marsh +0.05 |
| `conditionWeightMul` | `(1.15 - 0.5*condition)` on bad entries | broken roads get more trouble |

**Roll model (Forge Task 3):**

```
pSpawn = clamp(density.targetPerDay * biomeMul * conditionMul, 0.05, 0.85)
if rng.next() > pSpawn → force quiet entry (or skip spawn)
else → weighted pick among non-quiet (respect cooldown)
```

Quiet stretches are **authored** (`enc_quiet_*` / `enc_empty_*`) and required by validator (`quietWeightShare ≥ 0.35`).

---

## 6. Data layout (Loom)

| Path | Topic |
|------|-------|
| `economy/travel-trades.json` | trades + tells + pose + formula params |
| `world/road-encounters.json` | tables (existing) |
| `world/encounter-density.json` | density constants + biome/condition muls |
| `economy/facility-workers.json` | workers by facility kind |
| `world/caravan-schedules.json` | caravan timetable stubs |

All files &lt;400 lines, grouped by topic.

---

## 7. M3 Task 3 concrete numbers (copy into plan)

- `daysEff` ≥ 1; ashford↔lowmere base days **2** → typically daysEff **2–3** with terrain.
- Hire `carter_honest` at despair 0.2, legit 0.5, cond 1.0, noto 0 → trust ≈ **0.72**, priceSpark ≈ **ceil(4×0.95)=4**.
- Encounter: mean **≤ 1** non-quiet spawn per 2 travel days on healthy route; quiet share ≥ **35%**.
- Cooldown: after `enc_broken_axle`, next day cannot roll another break/hostile.
- Tests: see Task 3 plan update.

---

## 8. Out of scope

Tactical combat; fauna AI; full M4 LOD stock math (plan only). No `archetypeId` branches. No hex grid.

## 9. Self-review

Formulas closed-form. Density numeric. Tells enumerable. Quiet enforced. HEAD APIs: `startTravel`, `listRoutes`, `createPlaySession({mode:'play'})`.
