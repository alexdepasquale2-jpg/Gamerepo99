> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Move-only split from `2026-11-05-m2-fabric.md`.

# Task B: Person state vector + authored anchors

**Files:**
- Modify: `src/sim/types/runtime.ts`, `src/sim/inhabitant.ts` or `src/sim/person-vector.ts` (new)
- Data: `people/people.json` (or flat) — ensure `authored`/`anchor` flags on Ashford cast
- Test: `tests/sim/person-vector.test.ts`

**Interfaces:**
- Produces: `buildStateVector(person, worldCtx): PersonStateVector`
- Produces: `isAuthoredAnchor(person): boolean`

```ts
export type PersonStateVector = {
  warmth: number; bite: number; piety: number; secrecy: number; weariness: number;
  flame01: number; trust: number; hollowness: number; notoriety: number; kinStrain: number;
};
```

- [ ] **Step 1: Write the failing test**

```ts
it('authored ashford marta is anchor and has finite vector', () => {
  const data = loadData();
  const v = buildStateVector(data.peopleById.marta_ellison, { trust: 0.5, notoriety: 0 });
  expect(isAuthoredAnchor(data.peopleById.marta_ellison)).toBe(true);
  expect(v.warmth).toBeGreaterThanOrEqual(0);
  expect(v.warmth).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `npx vitest run tests/sim/person-vector.test.ts`

- [ ] **Step 3: Implement**

Derive vector from voice-anchors row for personId else defaults from wound tags; mark hollowness from stacks.

- [ ] **Step 4: Pass**

Run: `npx vitest run tests/sim/person-vector.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/sim/person-vector.ts src/sim/types src/data/people.json tests/sim/person-vector.test.ts
git commit -m "feat(m2-fabric): per-person state vector and authored anchors"
```

**Depends on:** Task A.

---

