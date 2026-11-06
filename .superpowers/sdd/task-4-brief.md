# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 4: Effects + hook runner

**Files:**
- Create: `src/sim/effects.ts`, `src/sim/hooks.ts`
- Test: `tests/sim/hooks.test.ts`

**Interfaces:**
- Consumes: `DataTables`, `SimState`, `createRng`
- Produces: `applyEffect(state, effect, ctx)`, `runHooks(state, trigger, ctx): void`
- **Forbidden:** branching on `state.player.archetypeId`

- [ ] **Step 1: Write the failing test**

```ts
it('runs cost_loneliness_tax only when when{} matches', () => {
  const state = makeStateWithHookIds(['cost_loneliness_tax']);
  state.flags.kindSuccessToday = true;
  state.flags.noBurningAdjacent = true;
  runHooks(state, 'dusk', { data, rng });
  expect(state.player.spark).toBe(68); // 70-2
});

it('does not special-case marrow id', () => {
  const src = readFileSync('src/sim/hooks.ts', 'utf8');
  expect(src).not.toMatch(/archetypeId\s*===\s*['\"]marrow['\"]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/hooks.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Evaluate `when` predicates generically. Apply `op` add/mul/set/grant_mark/emit_packet for M2 subset.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/hooks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/effects.ts src/sim/hooks.ts tests/sim/hooks.test.ts
git commit -m "feat(sim): generic effects and hook runner"
```

---

