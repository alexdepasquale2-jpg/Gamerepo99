# M4 Packet 01 — Dawn economy LOD (Task 1)

**For:** Forge  
**HEAD APIs:** `c58142c`+ (`advanceToDawn`, `pushJuice`, `createPlaySession`)  
**Plans:** [index](./index.md) · [Task A](./task-a-economy-lod.md) · [B caravans](./task-b-caravans.md) · [C doctrine](./task-c-doctrine-collapse.md)  
**Specs:** [wilderness-economy](../../specs/2026-11-05-wilderness-economy-design.md) · [M4 design](../../specs/2026-11-05-last-spark-m4-design.md)  
**Data (Loom, already in tree):** `src/data/economy/dawn-stock.json`, `economy-lod.json` (+ existing `facilities.json`, `economy-resources.json`, `world/routes.json`, town `stock`/`despair`/`economyOptIn`)

---

## Goal

One implementable slice: **off-screen dawn stock flows + despair/starve**, driven only by authored tables. Stub hooks so Tasks B/C plug in without rewriting the dawn path.

---

## Files (create / change)

| Action | Path |
|--------|------|
| **Create** | `src/sim/economy/economy-lod.ts` — `tickEconomyLod(state)` |
| **Create** | `src/sim/economy/economy-lod-types.ts` — result + stub interfaces below |
| **Create** | `tests/sim/economy/economy-lod.test.ts` |
| **Modify** | `src/sim/scenario/scenario-advance.ts` — call `tickEconomyLod` inside `advanceToDawn` after dawn hooks / before spark clamp |
| **Modify** | `src/sim/load-data.ts` — import + expose `economyLod` + `dawnStock` on `DataTables` |
| **Modify** | `src/sim/index.ts` — export `tickEconomyLod` |
| Optional | `src/sim/economy/index.ts` barrel |

Do **not** edit Phaser/`src/render`. Do **not** retune interaction strain here.

---

## Stub interfaces (B/C slots)

```ts
/** Task B fills later — dawn may call no-op. */
export type CaravanDawnHook = (state: SimState) => void;

/** Task C fills later — broken-route / starve may notify. */
export type DoctrineSupplyHook = (state: SimState, args: {
  townId: string; reason: 'route_broken' | 'starve'; deltaRealDelivery: number;
}) => void;

export type EconomyLodResult = {
  moved: { routeId: string; resourceId: string; qty: number; toTownId: string }[];
  starved: string[];
};
```

Wire optional hooks via params or `state`-hanging registries; default no-ops. Juice ids from data: `stock.deliver`, `stock.starve` (`pushJuice`).

---

## Behavior (data-driven)

For each town with `economyOptIn === true` (Ashford **false** → noop):

1. **Produce/flow:** for each non-broken route touching the town,  
   `qty = Σ facility.outputs.qtyPerDawn * staffedMul * route.condition * receiveShare[townId]`; add to `town.stock[resource]`; emit `stock.deliver` when qty &gt; 0.
2. **Broken route:** `despair += economy-lod.despair.onRouteBroken` (0.05), clamp; call doctrine stub with `deltaRealDelivery` from table.
3. **Spoil:** apply `economy-resources.spoilPerDawn` per `dawn-stock.spoil.order`.
4. **Starve:** if `stock[food_grain] < starveWhenFoodBelow` (1): `despair += onStarve` (≤ `maxAddPerDawn` 0.05); juice `stock.starve`.
5. Seed missing stock from `dawn-stock.seedStockByTown` when first opted in.

Deterministic; no `Math.random`; no player spark spend beyond existing `cost_town_despair`.

---

## Failing tests first

`tests/sim/economy/economy-lod.test.ts`:

1. **opt-out:** ashford `economyOptIn:false` → 10× `advance:dawn` does not raise despair from stock / no `stock.starve`.
2. **opt-in flow:** force one town opt-in (test helper mutate or seed) + seed 42 → after dawns, stock changes and/or `stock.deliver` on bus.
3. **starve cap:** food_grain forced &lt; 1 → despair delta ≤ 0.05 per dawn; `stock.starve` emitted.
4. **broken route:** mark a route `broken` → despair += 0.05 when opt-in; doctrine stub invoked (spy).

Run: `npx vitest run tests/sim/economy` — expect FAIL until implemented.

---

## Acceptance

- [ ] Tables loaded; Ashford stays inert.
- [ ] Despair add from starve/broken ≤ 0.05/dawn.
- [ ] `stock.deliver` / `stock.starve` via `pushJuice`.
- [ ] Caravan + doctrine hooks exist as no-ops; B/C can replace without changing `advanceToDawn` signature.
- [ ] Hybrid-C burnout not regressed by LOD (no new spark fuse).

## Out of scope

Caravan schedules (B), doctrine collapse math (C), letters (D), interaction strain retune, social-graph worldgen, Phaser, commits by Loom.

---

## Appendix — burnout pocket (data-only, later)

Hybrid-C middle-ground: **burnoutRate ≈ 0.074** (2/27), both **`basilisk_brood` × `savage`**. Optional later levers (Loom catalog only): nudge `stand_up` sparkGain +1, or `talk_hard_shame` baseStrain 1→2 only if Probe wants more savage mortality—not this packet.
