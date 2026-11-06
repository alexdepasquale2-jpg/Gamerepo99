# M4 Packet 02 — Caravans from schedules (Task B)

**For:** Forge (commits this packet)  
**HEAD APIs:** `b6d2681`+ (`tickEconomyLod`, `CaravanDawnHook`, `ensureEconomyState`, `advanceToDawn`, `pushJuice`, `createPlaySession`)  
**Depends on:** Task A merged @ `b6d2681` (Vitest economy-lod 10/10). Social-graph **05** on main @ `986c26f`.  
**Sequencing:** Implement **after** social-graph **06 Blessings and Burdens** runtime/handoff work; then Forge commits packet-02. Do not start caravan sim before 06 is in flight / landed per Niblet queue.  
**Plans:** [index](./index.md) · [Task A](./task-a-economy-lod.md) · [Task B](./task-b-caravans.md) · [packet-01](./packet-01.md) · [C doctrine](./task-c-doctrine-collapse.md)  
**Specs:** [road-content](../../specs/2026-11-06-road-content-design.md) · [wilderness-economy](../../specs/2026-11-05-wilderness-economy-design.md) · social-graph [05](../../specs/2026-11-06-social-graph/05-forge-handoff.md) · [06 Blessings and Burdens](../../specs/2026-11-06-social-graph/06-blessings-and-burdens.md)  
**Data (in tree; `scripts/validate/road-content.mjs`):** `world/caravan-schedules.json` (5 schedules — add optional `maxConcurrent`, default **2**), `world/routes.json` (`days`/`condition`/`broken`), `encounter-density.json` (**do not retune**), `economy/travel-trades.json`, `dawn-stock.json`, `economy-lod.json`

---

## Goal

One implementable slice: **scheduled off-screen caravans** that spawn, progress both ways on a living trade route, slow on damaged roads, and deliver cargo into town stock on dawn — filling Task A’s `CaravanDawnHook`. No Phaser; no encounter-density / travel-trades edits; no `archetypeId` branching.

---

## Files (create / change)

| Action | Path |
|--------|------|
| **Create** | `src/sim/caravans.ts` — `loadCaravanSchedules`, `tickCaravans`, default `CaravanDawnHook` |
| **Create** | `src/sim/caravans-types.ts` — `CaravanMobile`, schedule row (+ `maxConcurrent`) |
| **Create** | `tests/sim/caravans.test.ts` |
| **Modify** | `src/sim/load-data.ts` — expose `caravanSchedules` on `DataTables` |
| **Modify** | `src/sim/index.ts` — export `tickCaravans` / types |
| **Modify** | Boot / play-session — register `state.economyHooks.caravan = (s) => { tickCaravans(s, s.day); }` once (`economy-lod.ts:79–81`). Prefer registry over changing `advanceToDawn` signature. |
| **Modify** | `caravan-schedules.json` + `road-content.mjs` — optional `maxConcurrent` (≥1; default 2 when omitted) |
| Optional | `dump` / `snapshot` include `state.caravans` + per-route `breakJuiced` / broken flags |

Do **not** edit Phaser/`src/render`. Do **not** retune LOD despair, interaction strain, or encounter-density.

---

## Hook into Task A (already landed)

```ts
// economy-lod.ts — caravan runs first each dawn, before facility flow / spoil / starve
const caravan = hooks?.caravan ?? state.economyHooks?.caravan ?? noop;
caravan(state); // ← fill this; do not change advanceToDawn's call site
```

- `advanceToDawn` (`scenario-advance.ts:74–84`): `state.day += 1` → dawn hooks → `tickEconomyLod(state)` → spark clamp.  
- **Dawn index** = `state.day` at hook time (post-increment).  
- Deliveries mutate `state.towns[dest].stock` via `ensureEconomyState` so same-dawn spoil/starve see cargo.  
- Juice: schedule `prism` on move/arrive; cargo land also emits `stock.deliver`.

---

## Behavior (data-driven; Niblet-resolved)

From `caravan-schedules.json` (`cav_strand_grain`, `cav_strand_timber`, `cav_glare_ore`, `cav_glare_wool`, `cav_brine_fish`):

1. **Spawn:** when `dawnIndex % periodDays === departDawnMod` **and** live mobiles with that `scheduleId` &lt; `maxConcurrent` (default **2**), create `CaravanMobile` at outbound origin (`progress01 = 0`, `heading: 'outbound'`). Skip spawn if route `broken === true` (persistent). Overlap allowed up to the cap.
2. **Advance (condition-scaled):** each dawn  
   `progress01 += (1 / max(1, route.days)) * clamp(route.condition, 0, 1)`  
   Damaged roads **slow** caravans before break; `condition === 1` ⇒ full speed; lower condition ⇒ longer travel. When `broken`, mobiles already en-route freeze or are culled (pick freeze-in-place until repaired — document in commit); no new spawns.
3. **Arrive outbound** (`progress01 >= 1`, heading outbound): deliver `qty` of `cargoResourceId` into **`toTownId`** stock (incl. **Ashford** even when `economyOptIn:false`); juice prism + `stock.deliver`; **turn around** — set `heading: 'return'`, `progress01 = 0` (return measures progress back toward `fromTownId`).
4. **Arrive return:** deliver again into **`fromTownId`** (same qty/cargo unless data adds a return cargo later — MVP same row); juice; **remove** mobile (next period may spawn fresh under cap). Living trade route = continuous outbound/return legs, not one-shot delete on first arrive.
5. **Route break transition:** track prior `broken` per route on sim state. On edge `false → true`, emit `route.break` **once**; afterward only persistent `broken` (no repeat juice each dawn). Repair `true → false` clears the one-shot latch so a future break can juice again.

Deterministic: same seed + same dawn sequence ⇒ same mobiles + stock deltas. No `Math.random`. No `archetypeId ===`.

```ts
export type CaravanHeading = 'outbound' | 'return';

export type CaravanMobile = {
  id: string;              // stable: `${scheduleId}@${dawnSpawned}` (+ suffix if concurrent)
  scheduleId: string;
  routeId: string;
  progress01: number;      // 0 at current leg start, 1 at leg end
  heading: CaravanHeading;
  cargoResourceId: string;
  qty: number;
  dawnSpawned: number;
};

export type CaravanScheduleRow = {
  id: string;
  routeId: string;
  departDawnMod: number;
  periodDays: number;
  cargoResourceId: string;
  qty: number;
  lean: string;
  prism?: string;
  maxConcurrent?: number;  // default 2
};

export function tickCaravans(state: SimState, dawnIndex: number): CaravanMobile[];
```

---

## Failing tests first

`tests/sim/caravans.test.ts`:

1. **loads schedules:** includes `cav_strand_grain`; omitted `maxConcurrent` reads as **2**.
2. **fires in window:** seed 7, ≤6× `advance:dawn` ⇒ ≥1 schedule prism / `route.caravan` on bus.
3. **deterministic:** seed 7, 6 dawns twice ⇒ identical mobile ids + stock deltas.
4. **turn-around / return leg:** after outbound arrive, mobile remains with `heading:'return'` and `progress01` reset; later dawn delivers into `fromTownId` then removes.
5. **condition slows:** same route `days`, `condition:0.5` takes ~2× dawns to arrive vs `condition:1` (progress step halves).
6. **break once:** flip `broken false→true` ⇒ exactly one `route.break` juice; further dawns while broken ⇒ no extra `route.break`; no new spawns on that route.
7. **Ashford receives:** arrive into ashford stock while `economyOptIn:false` ⇒ `stock[cargo]` += qty; despair unchanged by delivery alone.
8. **overlap cap:** force period shorter than travel so two mobiles can coexist; third spawn blocked while `maxConcurrent:2`; with `maxConcurrent:1` only one live.
9. **grep guard:** no `archetypeId ===` under `src/sim/caravans*.ts`.

Run: `npx vitest run tests/sim/caravans.test.ts` — expect FAIL until implemented. Keep `tests/sim/economy` green.

---

## Acceptance

- [ ] Schedules on `DataTables`; `maxConcurrent` default 2; validator accepts optional field.
- [ ] ≥1 schedule fires within 6 dawns on seed 7.
- [ ] Outbound arrive → return leg → return arrive delivers both ends; Ashford may receive cargo.
- [ ] Progress scales with `route.condition`; broken blocks new spawns; `route.break` juices once per transition.
- [ ] Concurrent mobiles allowed up to per-schedule cap.
- [ ] Hook fills Task A no-op; `advanceToDawn` signature unchanged; same seed ⇒ same outcomes; no spark fuse regression.

## Out of scope

Doctrine collapse (C), letters (D), Blessings-Burdens **runtime** (sequenced before this packet but not implemented here), encounter-density retune, travel-trades combat, player `startTravel` rewrite, Phaser, Loom commits.

---

## Resolved decisions (Niblet)

1. **Turn-around:** caravans reverse and run a **return leg** (living trade route); remove only after return arrive.
2. **Damaged roads:** speed scales with `route.condition` (`progress01` step × condition); slow before break — do not treat soft damage as hard skip.
3. **`route.break` juice:** **once** on `broken` false→true transition; then persistent broken state (no per-dawn repeat).
4. **Ashford stock:** **yes** — opt-out towns still receive cargo; starve/despair stay opt-in-gated in LOD.
5. **Overlap:** concurrent mobiles **allowed**, capped by schedule `maxConcurrent` (data; **default 2**).
