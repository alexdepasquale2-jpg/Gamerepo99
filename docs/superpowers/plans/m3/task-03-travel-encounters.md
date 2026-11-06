> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 3: Travel time + roadside encounters

**Files:**
- Create: `src/sim/travel.ts` (if absent)
- Data: `world/routes.json`, `world/road-encounters.json` (or flat)
- Test: `tests/sim/travel-play.test.ts`

**Interfaces:**
- Produces: `startTravel(state, routeId): { daysEff: number }`; session `travel(routeId)`

- [ ] **Step 1: Write the failing test**

```ts
it('travel advances day by daysEff and may emit encounter', () => {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
  s.start();
  const day0 = s.snapshot().day;
  const routes = listRoutesFrom(s.snapshot().townId); // helper from session dump/state
  expect(routes.length).toBeGreaterThan(0);
  s.travel!(routes[0]);
  expect(s.snapshot().day).toBeGreaterThanOrEqual(day0 + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/travel-play.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Advance day/ticks by route days; roll encounter table; bus `encounter.spawn` / `route.travel_step`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/travel-play.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/travel.ts src/sim/play-session.ts tests/sim/travel-play.test.ts
git commit -m "feat(m3): travel days and roadside encounters"
```

**Depends on:** Task 1.  
**Acceptance:** World continues ticking during travel (LOD/despair hooks may no-op if economy off).

---

