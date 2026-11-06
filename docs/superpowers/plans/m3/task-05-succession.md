> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 5: Succession stub on burnout

**Files:**
- Create: `src/sim/succession.ts`
- Test: `tests/sim/succession-play.test.ts`

**Interfaces:**
- Produces: succession payload with exact copy strings from `archetypes.json` succession.ui

- [ ] **Step 1: Write the failing test**

```ts
it('burnout opens succession with locked copy', () => {
  const s = createPlaySession({ mode: 'play', seed: 3, archetypeId: 'ivy_quill' });
  s.start();
  forceSpark(s, 0);
  s.tick();
  expect(s.snapshot().burnedOut).toBe(true);
  expect(s.events().some((e) => e.type === 'succession.open')).toBe(true);
  const ui = getSuccessionUi(s);
  expect(ui.screenCopy).toBe('Your fire went out. Someone remembers it.');
  expect(ui.buttons.continue).toBe('Carry it on');
  expect(ui.buttons.quit).toBe('Let it rest');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/succession-play.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

On spark ≤ burnoutAt emit succession; dependence weight ×0.5 when scoring bonds.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/succession-play.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/succession.ts tests/sim/succession-play.test.ts
git commit -m "feat(m3): succession stub on fabric run"
```

**Depends on:** Task 2.  
**Acceptance:** Quit never shamed.

---

