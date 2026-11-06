# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 5: Inhabitant assembly + embodiment move

**Files:**
- Create: `src/sim/inhabitant.ts`, `src/sim/world.ts` (partial: grid + sites)
- Test: `tests/sim/inhabitant.test.ts`

**Interfaces:**
- Consumes: `loadData`, archetype id
- Produces: `assembleInhabitant(data, archetypeId): Inhabitant`
- Produces: `canEnterTile(inh, tileTags): boolean`

- [ ] **Step 1: Write the failing test**

```ts
it('marrow blocked on door_front, ivy not', () => {
  const d = loadData();
  const m = assembleInhabitant(d, 'marrow');
  const i = assembleInhabitant(d, 'ivy_quill');
  expect(canEnterTile(m, ['door_front'])).toBe(false);
  expect(canEnterTile(i, ['door_front'])).toBe(true);
});

it('brood has bodySlots 3 and activeBodiesMax 1', () => {
  const b = assembleInhabitant(loadData(), 'basilisk_brood');
  expect(b.embodiment.bodySlots).toBe(3);
  expect(b.embodiment.activeBodiesMax).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/inhabitant.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Copy trait blobs onto inhabitant; list hook ids from archetype + spark profile. No archetype switches.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/inhabitant.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/inhabitant.ts src/sim/world.ts tests/sim/inhabitant.test.ts
git commit -m "feat(sim): assemble inhabitants from traits"
```

---

