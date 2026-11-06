# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 2: Seeded RNG + types

**Files:**
- Create: `src/sim/rng.ts`, `src/sim/types/data.ts`, `src/sim/types/runtime.ts`
- Test: `tests/sim/rng.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `createRng(seed: number): { next(): number; int(min: number, max: number): number }`
- Produces types: `ArchetypeDef`, `HookDef`, `Inhabitant`, `SimState`, `Effect`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sim/rng.test.ts
import { createRng } from '../../src/sim/rng';
import { describe, it, expect } from 'vitest';

it('is deterministic for same seed', () => {
  const a = createRng(42); const b = createRng(42);
  expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: FAIL cannot find module

- [ ] **Step 3: Write minimal implementation**

Mulberry32 in `rng.ts`. Types mirror JSON ids as string unions loosely (`string` ids OK for M2).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts src/sim/types tests/sim/rng.test.ts
git commit -m "feat(sim): seeded rng and core types"
```

---

