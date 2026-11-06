# Living Wilderness & Economy Layer — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Source:** Alex — walking distance, life between settlements, simulated economy

---

## 1. Context

Need real distance between village/town/city with **life in between**: flora, minerals, fauna, trade roads, caravans, workers, facilities (mines, mills, farms, waystations, lumber camps). Economy must:

- Feed towns; broken supply → starve hope / feed despair  
- Work as meaning or exhaustion (spark + marks)  
- Show city–village gap (who extracts vs who receives)  
- Hook doctrines (supply promises → real vs perceived)  
- Roads carry people-encounters  

Constraints: data-driven; no archetype branches (body/size via embodiment hooks); Prism owns visuals (event ids only); **M2 Ashford unchanged**; half-day M3/M4 budgets.

Existing: `links.json` travel, gapAxis, doctrines, LOD, kinship packets.

---

## 2. Options

### A — Full continuous overworld sim in M3
Procgen every tile of flora/fauna AI. **−** Blow half-day; risk M2.

### B — Flavor roadside props only  
**−** No economy teeth; doctrines/despair unconnected.

### C — Route-graph economy + facility nodes + LOD *(recommended)*  
- Settlements already nodes; **routes** are edges with `days`, `biomeIds`, `facilitySlots`, `stockFlow`.  
- **Facilities** sit on routes or near towns; produce/consume resources.  
- **Stockpiles** per town; dawn LOD updates flows; broken route → despair / doctrine realDelivery hit.  
- **Road encounters** table keyed by biome + gapDelta.  
- Travel cost modified by embodiment `moveTicks` / size tags via generic hooks.  
- **M3:** 1–2 authored routes (ashford↔lowmere, ashford↔city_reach rumor already), biomes/resources/facilities schemas, stock + break formulas, 2–3 encounters, Prism event ids, Ashford stock optional.  
- **M4:** procgen route fill, caravans as moving packets, more facilities, work-shift marks, extraction politics.

---

## 3. Decision

**Choose C.**

### Core formulas

```
// daily flow along route R from producer facilities → consumer town
flow = sum(facility.output * facility.staffedMul * route.condition)
town.stock[resource] += flow * receiveShare(town)   // city receiveShare high on extractive routes
if route.broken:
  town.stock[food] decays; town.despair += 0.05
  if town.doctrine has supply promise: doctrine.realDelivery -= 0.05

// work shift at facility (player Carry or NPC LOD):
if meaningWork: chance genuine_growth stub / spark +1 witness
if exhaustWork: rest-like need N/A → apply mark fragile OR spark -2 (hook cost_road_labor)

// travel days:
daysEff = route.days * terrainMul * sizeMul   // sizeMul from embodiment tags large→1.2 via data
```

### City–village extraction
Routes tagged `extractive` with `fromGapHigh → toGapLow` or reverse: `receiveShare(city)=0.7`, `receiveShare(village)=0.3` on mineral flows cityward.

### Doctrine tie
Supply goals in doctrines reference `resourceId`; realDelivery += f(stock delta); perceived still propaganda-propped.

### Prism event ids
`route.caravan`, `route.break`, `facility.work`, `facility.idle`, `biome.ambience`, `encounter.spawn`, `stock.starve`, `stock.deliver`, `road.travel_step`

### M2
No required changes. Optional `towns.ashford.stock` defaults if missing → sim treats as infinite small buffer (no despair from economy).

---

## 4. Self-review

Ruthless: no fauna AI, no tactical combat on roads. Encounters are one-beat tables. Procgen rules M4. No `archetypeId` switches.


---

## 5. Travel & transport (Alex fold-in)

Walking is **real time**: embarking a route advances `daysEff` dawns; full/LOD ticks run for settlements while you travel. Meaning without tedium:

1. **Roadside encounters** (existing tables) fire each travel day.  
2. **Fast routes** unlock when relationship bonds / civic standing / kept doctrine promises meet thresholds (`route.unlockWhen`).  
3. **Travel trades** — hireable actors on roads (data `travel-trades.json`).

### Trades (good ↔ bad)

| id | Role | Lean | Notes |
|----|------|------|-------|
| `carter_honest` | Carter | good | Fair grain/timber haul |
| `caravaner_guild` | Caravaner | good | Reliable, slow |
| `ferryman_briggs` | Ferryman | good | Ties Tom / Nora |
| `mount_stable` | Mounts/stables | good | Cuts daysEff |
| `guide_local` | Guide | good | Fewer bad encounters |
| `courier_letter` | Courier | good | Speeds packets |
| `smuggler_gap` | Smuggler | mixed | Cross-gap fast; +exposure risk |
| `gouger_cart` | Gouger | bad | High coin/spark price |
| `scammer_shortcut` | Scammer | bad | Lies about days; may break |
| `highwayman` | Highwayman | bad | Spark/stock loss encounter |

### Simulation-driven trust / price / reliability

```
trust = clamp(0.3 + 0.4*(1 - town.despair) + 0.2*doctrine.legitimacy + 0.1*route.condition, 0, 1)
priceSpark = baseSpark * (1.4 - 0.6*trust) * sizeMul
priceCoin = baseCoin * (1.5 - 0.7*trust)   // coin optional meter; if absent, spark only
reliability = trust * route.condition
// on hire success: daysEff *= hire.speedMul; each day failChance = (1-reliability)*0.2
```

Body/size: `routes.sizeTravelMuls` + hooks (`cost_road_labor`) — **no archetypeId branches**.

Hiring **trades time for risk**: lower `daysEff` but encounter table may swap to `enc_hire_risk` when reliability &lt; 0.45.

---

## 6. Render view contract (Prism)

`src/sim` exposes a **read-only** snapshot each frame/tick. Phaser/`src/render` never mutates it.

```typescript
/** Warmth = 1 - despair (clamped). */
export type Warmth01 = number; // 0..1

export type FacilityRenderState = 'idle' | 'working' | 'abandoned';
export type AgentRenderState = 'idle' | 'traveling' | 'working' | 'fleeing' | 'broken';

export interface Vec2 {
  x: number;
  y: number;
}

/** Prefer degrees clockwise from north, or unit vector — pick ONE and keep it. */
export type Heading =
  | { kind: 'deg'; deg: number } // 0 = north, 90 = east
  | { kind: 'vec'; x: number; y: number }; // unit vector

export interface TileRenderView {
  q: number; // tile column
  r: number; // tile row
  biomeId: string; // → asset biome.<biomeId>
  warmth: Warmth01; // inverse of local despair / void
}

export interface FacilityRenderView {
  id: string;
  type: string; // mill | lumber_camp | waystation | mine | farm | …
  state: FacilityRenderState;
  warmth: Warmth01;
  position: Vec2;
  // asset: facility.<type>.<state>
}

export interface MobileRenderView {
  id: string;
  type: string; // worker | caravan | traveler | carter | ferryman | highwayman | …
  state: AgentRenderState;
  heading: Heading;
  position: Vec2;
  // assets: fauna.<id> | caravan.<type> | ore.<id> as applicable
}

export interface WorldRenderSnapshot {
  day: number;
  tick: number;
  tiles: TileRenderView[];
  facilities: FacilityRenderView[];
  mobiles: MobileRenderView[]; // workers, caravans, travelers, hired trades
}

// Asset key conventions (Prism):
//   biome.<id>
//   facility.<type>.<state>
//   fauna.<id>
//   ore.<id>
//   caravan.<type>
```

Event ids (bus → juice): `route.caravan`, `route.break`, `route.travel_step`, `facility.work`, `facility.idle`, `facility.abandoned`, `biome.ambience`, `encounter.spawn`, `stock.starve`, `stock.deliver`, `travel.hire`, `travel.betray`.

---

## 7. Staging (ruthless)

| Milestone | Ship |
|-----------|------|
| **M3** | Schemas + authored ashford↔lowmere route/facilities/encounters; stock LOD opt-in; travel days tick world; hire 3 trades (carter, courier, gouger); render snapshot fields even if stubs; Ashford `economyOptIn:false` default |
| **M4** | Procgen route fill, caravans as mobiles, more trades (smuggler/highwayman), extractive politics, mount/ferry unlocks via bonds |

**M2:** no required code; missing economy files → skip layer.
