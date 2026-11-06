# M4 Packet 02 — Caravans from schedules (Task B)

**For:** Forge  
**HEAD APIs:** `b6d2681`+ (`tickEconomyLod`, `CaravanDawnHook`, `ensureEconomyState`, `advanceToDawn`, `pushJuice`, `createPlaySession`)  
**Depends on:** Task A merged @ `b6d2681` (Vitest economy-lod 10/10; suite 316/316).  
**Plans:** [index](./index.md) · [Task A](./task-a-economy-lod.md) · [Task B](./task-b-caravans.md) · [packet-01](./packet-01.md) · [C doctrine](./task-c-doctrine-collapse.md)  
**Specs:** [road-content](../../specs/2026-11-06-road-content-design.md) · [wilderness-economy](../../specs/2026-11-05-wilderness-economy-design.md) · [M4 design](../../specs/2026-11-05-last-spark-m4-design.md)  
**Data (already in tree, validated by `scripts/validate/road-content.mjs`):** `src/data/world/caravan-schedules.json` (5 schedules), `world/routes.json` (`days`/`condition`/`broken`), `world/encounter-density.json` (travel only — **do not retune**), `economy/travel-trades.json`, `economy/dawn-stock.json`, `economy/economy-lod.json`

---

## Goal

One implementable slice: **scheduled off-screen caravans** that spawn, progress, and deliver cargo into town stock on dawn — filling the Task A `CaravanDawnHook` slot. No Phaser; no encounter-density / travel-trades edits; no `archetypeId` branching.

---

## Files (create / change)

| Action | Path |
|--------|------|
| **Create** | `src/sim/caravans.ts` — `loadCaravanSchedules`, `tickCaravans`, default `CaravanDawnHook` |
| **Create** | `src/sim/caravans-types.ts` — `CaravanMobile`, schedule row type (keep `caravans.ts` focused) |
| **Create** | `tests/sim/caravans.test.ts` |
| **Modify** | `src/sim/load-data.ts` — import + expose `caravanSchedules` on `DataTables` |
| **Modify** | `src/sim/index.ts` — export `tickCaravans` / types |
| **Modify** | Boot / play-session attach path — register `state.economyHooks.caravan = (s) => { tickCaravans(s, s.day); }` once (so `tickEconomyLod` → existing hook call at `economy-lod.ts:79–81` runs it). Prefer registry over editing `advanceToDawn` signature. |
| Optional | `dump` / `snapshot` include `state.caravans` mobiles list (Probe-visible) |

Do **not** edit Phaser/`src/render`. Do **not** retune LOD despair, interaction strain, or encounter-density.

---

## Hook into Task A (already landed)

```ts
// economy-lod.ts — caravan runs first each dawn, before facility flow / spoil / starve
const caravan = hooks?.caravan ?? state.economyHooks?.caravan ?? noop;
caravan(state); // ← fill this; do not change advanceToDawn's call site
```

- `advanceToDawn` (`scenario-advance.ts:74–84`): `state.day += 1` → dawn hooks → `tickEconomyLod(state)` → spark clamp.  
- **Dawn index** for schedules = `state.day` at hook time (post-increment).  
- Deliveries mutate `state.towns[dest].stock` via `ensureEconomyState` so same-dawn spoil/starve see the cargo.  
- Juice: schedule `prism` (e.g. `route.caravan`, `caravan.carter`) on move/arrive; cargo land also emits `stock.deliver` (LOD table id) so Probe/bus stays consistent with Task A.

---

## Behavior (data-driven)

From `caravan-schedules.json` schedules (ids: `cav_strand_grain`, `cav_strand_timber`, `cav_glare_ore`, `cav_glare_wool`, `cav_brine_fish`):

1. **Spawn:** when `dawnIndex % periodDays === departDawnMod` and no live mobile already owns that `scheduleId`, create `CaravanMobile` on `routeId` at `progress01 = 0`, cargo from row. Skip if route `broken === true` (optionally juice `route.break` once — see open Q).
2. **Advance:** each dawn `progress01 += 1 / max(1, route.days)` using `economyRoutes`/`routes.json` `days` (strand 2, glare 3, brine 1).
3. **Arrive** (`progress01 >= 1`): add `qty` of `cargoResourceId` to **destination** town stock (`toTownId`); `pushJuice` schedule prism + `stock.deliver`; remove mobile (turn-around = later packet / open Q).
4. **Low condition:** if `route.condition` below a data threshold (default: treat only `broken`, not soft condition — open Q), skip spawn/progress; do not invent RNG.

Deterministic: same seed + same dawn sequence ⇒ same mobiles + stock deltas. No `Math.random`. No `archetypeId ===` / brood branches — schedules are global tables.

```ts
export type CaravanMobile = {
  id: string;           // `${scheduleId}@${dawnSpawned}` or stable counter from day+id
  scheduleId: string;
  routeId: string;
  progress01: number;   // 0 at from, 1 at to
  cargoResourceId: string;
  qty: number;
  dawnSpawned: number;
};

export function tickCaravans(state: SimState, dawnIndex: number): CaravanMobile[];
```

---

## Failing tests first

`tests/sim/caravans.test.ts`:

1. **loads schedules:** `loadCaravanSchedules()` includes `cav_strand_grain` (period 3, mod 0, `food_grain`×4 on `route_ashford_lowmere`).
2. **fires in window:** `createPlaySession({ mode:'play', seed:7, archetypeId:'marrow' })` → `start` → ≤6× `act('advance:dawn')` ⇒ ≥1 `route.caravan` (or schedule prism) on bus / events.
3. **deterministic:** seed 7, 6 dawns twice ⇒ identical mobile ids + stock deltas.
4. **broken skips:** mark `route_ashford_lowmere` `broken` → no strand spawn; glare/brine may still move; optional single `route.break` juice.
5. **delivery:** force arrive (short route / progress stub) ⇒ dest `stock[cargo]` += qty and `stock.deliver` present; Ashford `economyOptIn:false` still receives cargo into stock (starve/despair remain opt-in-gated in LOD).
6. **grep guard:** no `archetypeId ===` introduced under `src/sim/caravans*.ts`.

Run: `npx vitest run tests/sim/caravans.test.ts` — expect FAIL until implemented. Keep `tests/sim/economy` green.

---

## Acceptance

- [ ] Schedules loaded on `DataTables`; validator still green (`road-content.mjs` ≥3 schedules, route+cargo ids).
- [ ] ≥1 schedule fires within 6 dawns on seed 7.
- [ ] Arrival writes dest stock + juice; caravan hook replaces Task A no-op without changing `advanceToDawn` signature.
- [ ] Broken route skips (or one `route.break`); no soft-RNG from encounter-density.
- [ ] Same seed ⇒ same outcomes; hybrid-C burnout not regressed (no new spark fuse).

## Out of scope

Doctrine collapse (C), letters (D), social-graph / Blessings-Burdens runtime, encounter-density retune, travel-trades combat, player `startTravel` rewrite, Phaser, Loom commits.

---

## Open questions (Forge may pick defaults; note in commit)

1. **Turn-around:** remove on arrive (MVP) vs reverse `from`/`to` next period?
2. **Soft condition:** skip only when `broken`, or also when `condition < 0.5`?
3. **`route.break` juice:** once per broken dawn per route, or only on transition into broken?
4. **Ashford stock:** confirm cargo may land on opt-out towns (recommended: yes; despair still inert).
5. **Parallel mobiles:** one live mobile per `scheduleId`, or allow overlap if period &lt; travel days?
