# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 3: Load data tables

**Files:**
- Create: `src/sim/load-data.ts`
- Test: `tests/sim/load-data.test.ts`

**Interfaces:**
- Consumes: `src/data/*.json`
- Produces: `loadData(): DataTables` with `archetypes`, `traits`, `hooks`, `methods`, `people`, `towns`, `links`, …

- [ ] **Step 1: Write the failing test**

```ts
import { loadData } from '../../src/sim/load-data';
it('loads three m2 archetypes and refusal_shame_child hook', () => {
  const d = loadData();
  expect(d.archetypes.filter(a => a.m2Playable)).toHaveLength(3);
  expect(d.hooksById.has('refusal_shame_child')).toBe(true);
  expect(d.hooksById.has('hook_does_not_exist')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/load-data.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Import JSON via Vite `assert { type: 'json' }` or `fs` in tests + vite plugin. Build `hooksById`, `traits` indexes. Throw if archetype references missing hook id (belt + `validate-data.mjs`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/load-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/load-data.ts tests/sim/load-data.test.ts
git commit -m "feat(sim): load and index locked data tables"
```

---

