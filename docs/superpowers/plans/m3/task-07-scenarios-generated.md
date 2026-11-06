> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 7: What makes this special — retargeted scenarios on generated world

**Files:**
- Modify: `src/data/systems/scenarios/` (one file per scenario + `index.json`) — add `worldSeed` + `resolvePerson` by tag/wound
- Modify: `tests/scenarios/README.md`; create `tests/scenarios/special-bar-gen.test.ts`
- Spec: M3 design §5

**Interfaces:**
- Person resolution: `{ preferAnchorId?, woundId?, tagsAny? }` → personId from generated world

- [ ] **Step 1: Write the failing test**

```ts
it('warm-loaf path finds bakery-capable person on seed with anchors', () => {
  const s = createPlaySession({ mode: 'play', seed: 7, archetypeId: 'marrow' });
  s.start();
  const personId = resolveScenarioPerson(s, {
    preferAnchorId: 'marta_ellison',
    siteKind: 'bakery',
    woundId: 'apathy',
  });
  expect(personId).toBeTruthy();
  s.act(`carry_burden@${personId}`);
  // advance to dusk…
  expect(s.events().some((e) => e.type === 'site.kindle' || e.type === 'spark.spend')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scenarios/special-bar-gen.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Resolver + dusk advance helpers; ≥3 of 5 moments implementable; first-10-min metrics flags on session.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scenarios/special-bar-gen.test.ts`  
Expected: PASS (≥3 moments)

- [ ] **Step 5: Commit**

```bash
git add src/data/systems/scenarios/ tests/scenarios src/sim
git commit -m "feat(m3): special-bar scenarios on generated world"
```

**Depends on:** Tasks 2, 5.  
**Acceptance:** Moments do not hard-require sole Ashford loop; anchors preferred when present.

---

