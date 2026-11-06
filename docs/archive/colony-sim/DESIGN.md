# Hearthfall — Systems Design Spec

**Role:** Loom (systems design)  
**Stack:** TypeScript + Phaser (browser)  
**Repo:** `/workspace/hearthfall`  
**Audience:** Forge (implementation), Niblet (creative direction)  
**Status:** Prototype-first · Milestone 2 scoped for one push  

---

## 1. Pitch & Pillars

**Hearthfall** is a small colony sim: a handful of settlers keep a hearth alive through hunger, cold, exhaustion, and weather while the map slowly opens. The player assigns priorities and builds; colonists resolve jobs autonomously.

**Pillars**

1. **Needs drive action** — unmet needs raise job urgency; mood collapses when needs stack.
2. **Data over hardcode** — resources, recipes, buildings, weather, seasons, events, and job defs live in JSON.
3. **Readable feedback** — every tick change is attributable (need delta, weather modifier, event effect).
4. **Scoped depth** — M2 ships a closed loop; later milestones deepen content without changing core APIs.

**Non-goals for M2:** multiplayer, combat, tech tree UI polish, pathfinding sophistication beyond grid A*, audio, save-cloud.

---

## 2. Core Loop

```
Observe colony state
  → Adjust building / job priorities / stockpile goals
    → Colonists pick highest-urgency valid job
      → Work consumes time + may consume/produce resources
        → Needs tick down; weather/season/events modify rates
          → Mood & survival check
            → Map may unlock a new tile ring (growth)
              → Repeat
```

**Win (soft):** Survive N seasons with ≥1 living colonist and hearth lit.  
**Lose:** All colonists dead **or** hearth extinguished while outdoor temp < warmth threshold for T ticks (see §6).

---

## 3. Tick / Time Model

| Concept | Value | Notes |
|--------|-------|-------|
| **Tick** | 1 simulation step | All systems advance once per tick |
| **Ticks per Day** | `48` | 30 min game-time per tick |
| **Days per Season** | `12` | 4 seasons → 48-day year |
| **Real-time pacing** | ~200–400 ms / tick (tunable) | Pause / 1x / 2x / 4x |
| **Day phases** | Dawn `0–11`, Day `12–35`, Dusk `36–41`, Night `42–47` | Affects light, outdoor warmth bias |

**Ordering within a tick (fixed):**

1. Time / season / day-phase advance  
2. Weather sample (may change)  
3. Active event effects apply  
4. Needs decay (with environment modifiers)  
5. Job assignment / work progress  
6. Crafting / building completion hooks  
7. Mood recalculation  
8. Survival / death / hearth check  
9. Map-growth check  
10. Event roll (end of day only, or on trigger)

All rates below are **per tick** unless noted.

---

## 4. Colonists

### 4.1 Entity (runtime shape)

```ts
Colonist {
  id: string
  name: string
  traits: string[]          // ids → traits.json
  needs: {
    hunger: number          // 0..100 (100 = full)
    warmth: number          // 0..100
    rest: number            // 0..100
    mood: number            // 0..100 (derived + buffered)
  }
  position: { x: number, y: number }
  inventory: { resourceId: string, qty: number }[]  // carry cap from jobs/haul
  assignedJobId: string | null
  jobProgress: number       // 0..1 toward current work unit
  state: 'idle' | 'walking' | 'working' | 'sleeping' | 'fleeing' | 'dead'
}
```

**Starting colony (M2):** 3 colonists, each with 1 optional trait. Hearth building already placed.

### 4.2 Needs — formulas

Base decay (no modifiers), from `needs.json`:

| Need | Base decay / tick | Critical below | Satisfied by |
|------|-------------------|----------------|--------------|
| hunger | `0.35` | `20` | Eat food (`consume` job / auto-eat when idle + food in range) |
| warmth | `0.20` outdoor baseline | `15` | Be indoors / near hearth / wear (M3+) / season bias |
| rest | `0.25` while awake; restore `1.2` while sleeping | `15` | Sleep in bed / bedroll |
| mood | *derived* (see below) | `10` → work speed penalty | Positive events, full needs, recreation (M3) |

**Hunger restore:** eating `food_ration` restores `+40` hunger (data).  
**Warmth restore:** indoors with lit hearth: warmth approaches target via:

```
warmth += (targetWarmth - warmth) * 0.08   // per tick while in heated tile
targetWarmth = 85 under lit hearth influence; 60 indoors unheated; outdoor depends on weather
```

**Outdoor warmth pull:**

```
outdoorTarget = season.baseOutdoorWarmth + weather.warmthMod + dayPhase.warmthMod
warmth += (outdoorTarget - warmth) * 0.05
```

**Rest:** if `rest < 25` or night + no critical job, prefer `sleep` job. Sleep only on `bed` / `bedroll` tiles (bedroll = temporary).

### 4.3 Mood

```
moodRaw =
  50
  + hungerMood(hunger)      // piecewise: >=70 → +10; 40–69 → 0; 20–39 → -15; <20 → -30
  + warmthMood(warmth)      // same breakpoints
  + restMood(rest)          // same breakpoints
  + traitMods               // from traits.json
  + eventMods               // temporary
  + weather.moodMod
  + shelterBonus            // +5 if slept in bed last night

mood = clamp(lerp(mood, moodRaw, 0.15), 0, 100)  // soft follow
```

**Work speed multiplier:**

```
speed = 0.6 + 0.4 * (mood / 100)     // mood 0 → 0.6x; mood 100 → 1.0x
if hunger < 15 or warmth < 10 or rest < 10: speed *= 0.5
```

**Death:** if any of hunger/warmth stays at `0` for `24` consecutive ticks → dead. Mood at 0 does not kill; it only stalls work and can trigger despair event.

---

## 5. Jobs & Priority / Assignment

### 5.1 Job types (M2)

| Job id | Verb | Produces / effect | Requires |
|--------|------|-------------------|----------|
| `gather` | Harvest node | resource stack on ground / into carry | Tool optional (M3); adjacent to node |
| `haul` | Move item | stockpile / construction site filled | Carry capacity |
| `build` | Construct | building progresses | Haul materials delivered; blueprint placed |
| `craft` | Use station | recipe output | Station building; inputs in station or hauler |
| `eat` | Consume food | hunger restore | Food in inventory or stockpile in range |
| `sleep` | Rest | rest restore | Bed / bedroll |
| `tend_hearth` | Fuel hearth | keep hearth lit | Fuel resource hauled to hearth |

### 5.2 Priority model

Each job instance has:

```
urgency = basePriority(jobDef)
         + needDrive      // e.g. hunger critical → eat urgency +80
         + playerBias     // player-set colony priority 1..5 → ±20
         + deadlineBoost  // blueprint starvation, hearth fuel low
         - distancePenalty // tiles * 0.5
```

**Assignment (each tick, idle or re-evaluable colonists):**

1. Collect candidate job instances (world + personal need jobs).  
2. Filter by capability (not dead; has path; prerequisites).  
3. Score urgency; assign top job if `urgency >= currentJob.urgency + switchThreshold` (`switchThreshold = 15`) to avoid thrashing.  
4. Max 1 job per colonist. Reserved resources marked claimed.

**Player control (M2):** global priority sliders per job *type* (gather/build/craft/haul/tend), not per-pawn micromanagement. Click blueprint to place; cancel job on blueprint.

### 5.3 Work progress

```
jobProgress += (jobDef.workPerTick * colonist.speed) / jobDef.totalWork
on jobProgress >= 1: complete(); spawn next haul/craft as needed
```

Starting numbers in `jobs.json`.

---

## 6. Resources & Crafting

### 6.1 Resources (M2 set)

| id | Category | Stack | Notes |
|----|----------|-------|-------|
| `wood` | raw | 50 | Chop trees / debris |
| `stone` | raw | 50 | Rock nodes |
| `fiber` | raw | 40 | Bushes |
| `food_raw` | food | 20 | Berries / hunted (hunt = M3); spoils slowly |
| `food_ration` | food | 30 | Crafted; preferred eat |
| `fuel` | processed | 40 | From wood at craft stump |
| `plank` | processed | 40 | Wood → plank |
| `tool_basic` | gear | 10 | Craft; M3 boosts gather speed (stub in data) |

### 6.2 Crafting chains (M2)

```
wood ──► fuel          (craft_stump, 1 wood → 1 fuel)
wood ──► plank         (craft_stump, 2 wood → 1 plank)
food_raw ──► food_ration (campfire or kitchen_basic, 2 raw → 1 ration)
fiber + plank ──► bedroll (craft_stump)     // portable sleep
stone + plank ──► tool_basic (craft_stump)  // optional M2 stretch
```

Recipes in `recipes.json` with `station`, `inputs[]`, `outputs[]`, `work`.

### 6.3 Stockpiles

Zones tagged `stockpile` accept categories. Haulers prefer: construction claims > hearth fuel > general stockpile. Free tools only — no paid APIs.

---

## 7. Buildings

| id | Size | Cost | Effect |
|----|------|------|--------|
| `hearth` | 2×2 | start | Heated radius 4; needs fuel; colony lose-condition anchor |
| `bedroll` | 1×1 | fiber×2 + plank×1 | Sleep spot (poor: shelterBonus 0) |
| `bed` | 1×1 | plank×4 + fiber×2 | Sleep spot (shelterBonus +5) |
| `craft_stump` | 1×1 | wood×3 | Station for basic recipes |
| `stockpile` | zone | free | Storage footprint |
| `wall` | 1×1 | stone×1 or plank×2 | Blocks wind (warmth); M2 simple indoor detection |
| `roof` / enclosure | — | — | **M3** — for M2, “indoors” = tile in orthogonally enclosed wall ring OR within hearth building footprint |

**Build flow:** player places blueprint → system spawns haul jobs for missing mats → when mats delivered, `build` job → on complete, building entity active.

**Hearth fuel:**

```
fuelBuffer max 20
drain 0.05 / tick while lit
if fuelBuffer == 0: lit = false
tend_hearth: colonist delivers fuel, +5 per fuel unit
```

Unlit hearth: no heat aura; if outdoor cold season + unlit for `36` ticks and no colonist warmth > 30 → lose warning; full lose if all colonists warmth-dead or hearth rule in §2.

---

## 8. Weather & Seasons

### 8.1 Seasons (`seasons.json`)

| id | Order | baseOutdoorWarmth | gatherMod | notes |
|----|-------|-------------------|-----------|-------|
| `spring` | 0 | 55 | 1.0 | Mild |
| `summer` | 1 | 70 | 1.1 | Heat rarely harmful in M2 |
| `autumn` | 2 | 45 | 1.0 | Extra food_raw nodes |
| `winter` | 3 | 20 | 0.7 | Harsh; events lean cold |

Season length: `12` days. On season change: broadcast UI; rescale some node respawns.

### 8.2 Weather (`weather.json`)

States with weights per season:

| id | warmthMod | moodMod | gatherMod | moveMod | durationDays |
|----|-----------|---------|-----------|---------|--------------|
| `clear` | 0 | 0 | 1.0 | 1.0 | 1–3 |
| `rain` | -8 | -5 | 0.85 | 0.9 | 1–2 |
| `fog` | -3 | -2 | 0.9 | 0.95 | 1 |
| `storm` | -15 | -10 | 0.6 | 0.75 | 1 |
| `snow` | -20 | -8 | 0.5 | 0.7 | 1–3 (winter bias) |
| `heatwave` | +15 | -5 | 0.9 | 1.0 | 1–2 (summer) |

**Transition:** at most one weather change per day at dawn; weighted pick from season table; persist `durationDays`.

Day-phase warmth mods: Dawn `-5`, Day `0`, Dusk `-5`, Night `-12` (added to outdoor target).

---

## 9. Random Events

Rolled **once per day at dusk** if no event active:

```
if rand() < season.eventChance (default 0.35): pick weighted event from events.json
```

Events apply `effects[]` (shared effect schema — see §12). Duration in days; on expire, reverse removable modifiers.

**M2 event set (short):**

| id | Weight | Summary |
|----|--------|---------|
| `traveler_trade` | 10 | +few food_ration or wood; mood +5 |
| `wolves_howl` | 8 | mood -10 for 1 day; optional flee idle |
| `good_omen` | 10 | mood +8; gatherMod +0.1 for 2 days |
| `cold_snap` | 12 | weather forced snow/storm fragment; warmth decay +0.15 |
| `tool_break` | 6 | lose 1 tool_basic if any |
| `migrant` | 4 | +1 colonist (cap 5 in M2) — stretch goal |

---

## 10. Map Growth

**Start:** 24×24 walkable tiles; fog on exterior.  
**Growth:** every `growthIntervalDays` (default `6`), unlock a 1-tile-thick ring (or +8×8 chunk on a random edge) revealing new resource nodes.

```
nodesOnReveal = sample(nodeTable by season)
```

**M2:** ring unlock; camera can pan to new area; no enemies. Cap map `48×48`.

Pathfinding: grid A* 4-connected; unwalkable = walls / void / unrevealed.

---

## 11. Cross-System Interaction Matrix

Rows *affect* columns. Symbols: `++` strong boost, `+` mild, `0` none, `−` mild penalty, `−−` strong, `→` triggers/spawns.

| ↓ \ → | Needs | Jobs | Resources | Buildings | Weather | Seasons | Events | Map |
|-------|-------|------|-----------|-----------|---------|---------|--------|-----|
| **Needs** | mood←others | → eat/sleep/tend urgency | food consume | beds/hearth used | 0 | 0 | despair if mood 0 | 0 |
| **Jobs** | restore via eat/sleep | priority competition | gather/craft/haul I/O | build completes | slower in storm | season gatherMod | events spawn jobs | unlock → new gather |
| **Resources** | food→hunger; fuel→warmth | enable craft/build/tend | chains | costs | spoil rate (rain) | autumn food bias | trade/gift | nodes on growth |
| **Buildings** | warmth/rest/shelter | stations create craft jobs | stored / claimed | adjacency indoors | walls blunt wind | winter needs hearth | migrant needs bed | place on revealed tiles |
| **Weather** | warmth/mood mods | gather/move mods | rain spoil +0.01 raw/day | hearth drain +10% in storm | self duration | weights by season | cold_snap forces weather | 0 |
| **Seasons** | outdoor warmth baseline | gatherMod | node tables | winter pressure on hearth | weather weights | advance calendar | eventChance / pools | growth cadence |
| **Events** | mood/need deltas | interrupt / new jobs | grant/remove | may require capacity | force weather | 0 | exclusivity | rare reveal |
| **Map** | travel time → need pressure | new gather targets | new nodes | buildable area | 0 | 0 | 0 | ring unlock |

**Notable loops**

1. **Winter survival:** season↓warmth → jobs↑tend_hearth + haul fuel → resources↓wood → gather → weather may−−gather → mood↓ → speed↓.  
2. **Food pipeline:** gather food_raw → haul → craft ration → eat → hunger↑ → mood↑ → speed↑.  
3. **Expansion:** survive days → map growth → more nodes → surplus → better buildings → softer needs.

---

## 12. Shared Effect Schema

All content modifiers use one shape so deepening is additive:

```json
{
  "id": "effect_cold_snap_decay",
  "target": "need.warmth | need.mood | job.gather.speed | weather.force | resource.grant | colonist.add",
  "op": "add | mul | set | grant",
  "value": -0.15,
  "durationTicks": 48,
  "tags": ["cold"]
}
```

Applied via an `EffectStack` on colony / colonist / job systems. JSON content only references effect ids or inlines this shape.

---

## 13. Data File Schemas

Paths under `src/data/`. All ids are `snake_case` strings. Unknown refs fail validation script.

### `needs.json`
```json
{
  "version": 1,
  "needs": [
    {
      "id": "hunger",
      "min": 0, "max": 100, "start": 80,
      "decayPerTick": 0.35,
      "criticalBelow": 20,
      "moodCurve": [[70, 10], [40, 0], [20, -15], [0, -30]]
    }
  ],
  "mood": {
    "base": 50,
    "lerp": 0.15,
    "workSpeed": { "min": 0.6, "max": 1.0 },
    "crisisSpeedMul": 0.5,
    "crisisBelow": 10
  }
}
```

### `jobs.json`
Job defs: `id`, `category`, `basePriority`, `totalWork`, `workPerTick`, `needDrives[]`, `inputs`, `outputs`, `requiresBuilding`.

### `resources.json`
`id`, `category`, `maxStack`, `spoilPerDay`, `tags[]`.

### `recipes.json`
`id`, `station`, `work`, `inputs[{resourceId, qty}]`, `outputs[{resourceId, qty}]`.

### `buildings.json`
`id`, `size`, `cost[]`, `heatRadius`, `fuelCapacity`, `fuelDrainPerTick`, `isStation`, `stationRecipes[]`, `sleepQuality`.

### `weather.json`
`id`, `warmthMod`, `moodMod`, `gatherMod`, `moveMod`, `hearthDrainMul`, `spoilMul`.

### `seasons.json`
`id`, `order`, `days`, `baseOutdoorWarmth`, `gatherMod`, `eventChance`, `weatherWeights{weatherId: number}`.

### `events.json`
`id`, `weight`, `durationDays`, `effects[]`, `seasonBias[]`.

### `traits.json`
`id`, `effects[]` (e.g. hardy: warmth decay mul 0.85).

### `map.json`
`startWidth`, `startHeight`, `maxWidth`, `maxHeight`, `growthIntervalDays`, `nodeTables` by season.

### `day_phases.json`
`id`, `tickStart`, `tickEnd`, `warmthMod`, `light`.

---

## 14. Milestones

### M1 — Minimal skeleton (bootable)
- Phaser boot + 24×24 tilemap stub  
- 3 colonists rendered; needs tick with hunger decay only  
- One gatherable wood node; one gather job; haul to stockpile zone  
- Hearth sprite + fuel drain stub (no lose yet)  
- JSON loaders for `needs`, `resources`, `jobs`  
- Pause / 1x time  

### M2 — Closed prototype loop (**one push**)
- All four needs + mood speed  
- Jobs: gather, haul, build, craft, eat, sleep, tend_hearth with priority assignment  
- Resources + recipes in §6; buildings: hearth, bedroll, bed, craft_stump, stockpile, wall  
- Seasons + weather affecting warmth/gather  
- 4–6 events  
- Map growth one ring  
- Soft win/lose  
- Data validation script green  
- Debug overlay: needs, current job, weather, season day  

**Explicitly out of M2:** combat, research tree, furniture variety, advanced path costs, sound design, mobile layout polish.

### M3 — Deepen (hooks only)
- Traits matter in UI; tool durability; roofs / true indoors; hunting; recreation need; save/load; more events; migrant balancing.

### M4 — Showcase polish
- Juice, tutorials, seeded scenarios, accessibility.

---

## 15. Implementation Notes for Forge

1. **Pure sim core** (`src/sim/`) independent of Phaser; Phaser is a view. Enables headless tests.  
2. **Single `SimContext`** per tick; systems are functions `(ctx) => void` registered in order §3.  
3. **Never hardcode content ids in logic** — read from data; logic keys off categories/tags.  
4. **Claim tokens** on resources/job targets to stop double-assignment.  
5. **Deterministic mode:** seeded RNG for events/weather (debug + tests).  
6. Free toolchain only: Vite / esbuild, Phaser 3, TypeScript. No paid assets required for M2 (colored rects OK).

---

## 16. Open Questions

See report-back to Niblet/Forge; tracked here:

1. Exact art direction (top-down tile size 32 vs 16)? Default **32px**.  
2. Colonist names/traits authored by Niblet or generative lists?  
3. Should M2 include `migrant` event or defer to M3? Recommend **defer** if push is tight.  
4. Indoor detection: enclosed walls vs hearth-radius-only for M2 warmth? Spec assumes **enclosed OR hearth footprint**; confirm.

---

*End of DESIGN.md — Loom*
