# Task B: Caravans from schedules

> Part of [M4 Living World](./index.md). Data: `world/caravan-schedules.json` (road-content).

**Files:**
- Create: `src/sim/caravans.ts`
- Modify: `src/sim/economy-lod.ts` or `scenario-advance.ts` (dawn tick)
- Modify: dump/snapshot optional mobiles list
- Test: `tests/sim/caravans.test.ts`

**Interfaces:**
- Consumes: `caravan-schedules.json` via loader; `FabricWorld.routes` / session routes; `tickEconomyLod` day index
- Produces:

```ts
export type CaravanMobile = {
  id: string;
  scheduleId: string;
  routeId: string;
  progress01: number; // 0 at from, 1 at to
  cargoResourceId: string;
  qty: number;
};

export function loadCaravanSchedules(): { id: string; routeId: string; departDawnMod: number; periodDays: number; cargoResourceId: string; qty: number; lean: string }[];

export function tickCaravans(state: SimState, dawnIndex: number): CaravanMobile[];
// Spawn when dawnIndex % periodDays === departDawnMod
// Each dawn: progress01 += 1 / max(1, route.days)
// On arrive: deliver qty into dest stock; juice route.caravan; remove or turn around
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';
import { tickCaravans, loadCaravanSchedules } from '../../src/sim/caravans';

describe('caravans', () => {
  it('loads schedules and spawns strand grain caravan within period', () => {
    const schedules = loadCaravanSchedules();
    expect(schedules.some((s) => s.id === 'cav_strand_grain')).toBe(true);
    const s = createPlaySession({ mode: 'play', seed: 7, archetypeId: 'marrow' });
    s.start();
    let seen = false;
    for (let d = 0; d < 6; d++) {
      s.act('advance:dawn');
      const ev = s.events().filter((e) => e.type === 'route.caravan');
      if (ev.length) seen = true;
    }
    expect(seen).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/caravans.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Read schedules (import JSON like `travel-tables.ts`). Tick on dawn; emit `route.caravan`; on arrival call into stock deliver helper from Task A.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/caravans.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/caravans.ts tests/sim/caravans.test.ts
git commit -m "feat(m4): caravans from caravan-schedules.json"
```

**Depends on:** Task A (stock deliver). Road-content density/trades unchanged.  
**Acceptance:** ≥1 schedule fires in 6 dawns on seed 7; broken route (`condition` low) skips or juice `route.break` once.
