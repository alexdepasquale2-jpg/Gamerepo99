> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 2: Methods × marks × spark on fabric people

**Files:**
- Modify: `src/sim/play-session.ts` `act` → `commitMethod`
- Keep: `src/sim/methods.ts` + `setReactionLineSelector`
- Test: `tests/sim/play-methods.test.ts`

**Interfaces:**
- Consumes: `commitMethod` / method resolve from Task 6
- Action ids: `methodId@personId` (same as scenarios README)

- [ ] **Step 1: Write the failing test**

```ts
it('resolving a method changes spark and person flame or marks', () => {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
  s.start();
  const before = s.snapshot().spark;
  const actions = s.listActions().filter((a) => a.id.includes('@'));
  expect(actions.length).toBeGreaterThan(0);
  s.act(actions[0].id);
  const after = s.snapshot();
  expect(after.spark).not.toBe(before);
  expect(s.events().some((e) => e.type === 'spark.spend' || e.methodId)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/play-methods.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Parse `methodId@personId`; call method resolve; emit juice events; reaction via fabric selector.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/play-methods.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/play-session.ts tests/sim/play-methods.test.ts
git commit -m "feat(m3): method resolve against fabric people"
```

**Depends on:** Task 1.  
**Acceptance:** Works on generated people and anchors alike.

---

