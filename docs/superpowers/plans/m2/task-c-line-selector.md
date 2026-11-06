> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Move-only split from `2026-11-05-m2-fabric.md`.

# Task C: Pluggable blend selector (wire setReactionLineSelector)

**Files:**
- Create: `src/sim/line-select.ts`
- Modify: boot/sim-context to `setReactionLineSelector(pickFabricReactionLine)` when feature on; default authored alone fragment even when “fixed”
- Test: `tests/sim/line-select.test.ts`

**Interfaces:**
- Produces: `pickFabricReactionLine(ctx): ReactionLineResult` matching Forge’s `ReactionLineResult`
- Consumes: `setReactionLineSelector` from `methods.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('default path returns authored alone fragment text for marta carry', () => {
  const data = loadData();
  const state = bootFabricState(data, 1);
  const r = pickFabricReactionLine({
    personId: 'marta_ellison', methodId: 'carry_burden', seed: 1, state,
    features: { bakedDynamismLines: false },
  });
  expect(r.source === 'fixed' || r.source === 'fallback').toBe(true);
  expect(r.text.length).toBeGreaterThan(0);
});

it('blend path is deterministic for same seed/state', () => {
  const data = loadData();
  const state = bootFabricState(data, 9);
  const a = pickFabricReactionLine({ personId: 'marta_ellison', methodId: 'carry_burden', seed: 9, state, features: { bakedDynamismLines: true } });
  const b = pickFabricReactionLine({ personId: 'marta_ellison', methodId: 'carry_burden', seed: 9, state, features: { bakedDynamismLines: true } });
  expect(a).toEqual(b);
});
```

- [ ] **Step 2: FAIL** — `npx vitest run tests/sim/line-select.test.ts`

- [ ] **Step 3: Implement** — weight fragments by tags+curves+vector; constraints; fallback to alone authored_anchor.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/sim/line-select.ts tests/sim/line-select.test.ts
git commit -m "feat(m2-fabric): fabric reaction selector on setReactionLineSelector"
```

**Depends on:** Task B, methods Task 6.  
**Acceptance:** No duplicate picker API; Probe can feature-detect.

---

