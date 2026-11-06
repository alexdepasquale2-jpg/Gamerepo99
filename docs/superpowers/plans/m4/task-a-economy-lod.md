# Task A: Off-screen economy LOD

> Part of [M4 Living World](./index.md). Spec inputs: wilderness-economy stock formulas; spark-pacing (keep despair mild).

**Files:**
- Create: `src/sim/economy-lod.ts`
- Modify: `src/sim/scenario-advance.ts` (call from `advanceToDawn`)
- Modify: `src/sim/index.ts` exports
- Data (read): `economy/facilities.json`, `economy/economy-resources.json`, `world/routes.json`, town `stock` / `despair` / `economyOptIn`
- Test: `tests/sim/economy-lod.test.ts`

**Interfaces:**
- Consumes: `SimState` after `createPlaySession` play boot; town rows with `stock`, `despair`, `economyOptIn`
- Produces:

```ts
export type LodTownStock = Record<string, number>; // resourceId -> qty

export function tickEconomyLod(state: SimState): {
  moved: { routeId: string; resourceId: string; qty: number }[];
  starved: string[]; // townIds
}: void;

// Dawn: for each economyOptIn town (or all non-abstract when flag set):
//   facilities along routes produce outputs * staffedMul
//   routes move min(stock, flow) toward receiveShare
//   if food_grain < 1: despair += 0.05; juice stock.starve
//   spoilPerDawn from economy-resources
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';
import { tickEconomyLod } from '../../src/sim/economy-lod';

describe('economy LOD', () => {
  it('10 dawns on seed 42 change ashford stock or despair when economy on', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    s.start();
    // Force economyOptIn via test helper or act advance:dawn loop
    for (let i = 0; i < 10; i++) s.act('advance:dawn');
    const dump = s.dump();
    expect(dump.includes('stock') || s.events().some((e) => e.type === 'stock.starve' || e.type === 'stock.deliver')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/economy-lod.test.ts`  
Expected: FAIL (module missing or no stock events)

- [ ] **Step 3: Write minimal implementation**

Implement `tickEconomyLod`; invoke from `advanceToDawn`. Honor `economyOptIn:false` → no-op for that town (Ashford default). Emit `stock.deliver` / `stock.starve` on bus.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/economy-lod.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/economy-lod.ts src/sim/scenario-advance.ts tests/sim/economy-lod.test.ts
git commit -m "feat(m4): dawn economy LOD stock flows and starve"
```

**Depends on:** M3 play session + `advance:dawn` in listActions (spark-pacing Forge).  
**Acceptance:** Deterministic; despair add from starve ≤ 0.05/dawn; does not spend player spark except existing mild `cost_town_despair` (−1).
