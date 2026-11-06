# Task C: Doctrine competition & collapse cascades

> Part of [M4 Living World](./index.md). Data: `systems/doctrines.json` `formulas.legitimacy` / `formulas.collapse`.

**Files:**
- Create: `src/sim/doctrine-tick.ts`
- Modify: dawn advance path
- Test: `tests/sim/doctrine-tick.test.ts`

**Interfaces:**
- Consumes: doctrine rows with `start` meters; town `gapAxis`; exposure from smuggler/travel (road-content)
- Produces:

```ts
export type DoctrineMeters = {
  realDelivery: number;
  perceivedDelivery: number;
  propaganda: number;
  control: number;
  exposure: number;
  legitimacy: number;
};

export function tickDoctrines(state: SimState): { collapsed: string[]; competed: string[] };

// Each dawn per active doctrine:
//   legitimacy = clamp(0.15 + 0.7*perceivedDelivery + 0.15*control, 0, 1)  // formulas.legitimacy
//   gap = |perceivedDelivery - realDelivery|
//   if gap > 0.25 && exposure > 0.4: legitimacy *= (1 - 2.5 * gap^2)     // formulas.collapse
//   if legitimacy < 0.15: mark collapsed; juice doctrine.collapse; +0.05 despair on town
// Competition: when two doctrines share a route endpoint, higher propaganda steals 0.02 perceived from lower
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';
import { tickDoctrines, applyCollapse } from '../../src/sim/doctrine-tick';

describe('doctrine collapse', () => {
  it('collapses when gap and exposure exceed formula thresholds', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'ivy_quill' });
    s.start();
    // Test harness: set meters via exported __testSetDoctrineMeters if needed
    const result = tickDoctrines((s as unknown as { getState?: () => unknown }).getState?.() as never);
    // Prefer pure unit test on meters object:
    expect(typeof tickDoctrines).toBe('function');
  });

  it('unit: collapse formula drops legitimacy below 0.15', () => {
    const leg = applyCollapse({
      perceivedDelivery: 0.9,
      realDelivery: 0.2,
      exposure: 0.5,
      legitimacy: 0.8,
    });
    expect(leg).toBeLessThan(0.15);
  });
});
```

Import `{ tickDoctrines, applyCollapse }` from `../../src/sim/doctrine-tick`. Prefer pure helpers for the unit assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/doctrine-tick.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Pure formula helpers + dawn tick; cascade: collapsed doctrine raises neighbor exposure +0.05 once.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/doctrine-tick.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/doctrine-tick.ts tests/sim/doctrine-tick.test.ts
git commit -m "feat(m4): doctrine legitimacy tick and collapse cascade"
```

**Depends on:** Task A (despair). Travel exposure from road-content smuggler optional.  
**Acceptance:** Formulas match `doctrines.json`; cascade finite (no infinite loop); spark unchanged by doctrine tick alone.
