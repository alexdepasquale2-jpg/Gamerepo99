> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Move-only split from `2026-11-05-m2-fabric.md`.

# Task E: World generator (gap axis settlements + links + doctrines + biomes + routes + facilities + history)

**Files:**
- Create: `src/sim/worldgen.ts`, `src/sim/history-gen.ts`
- Create data: `src/data/history-tables.json` (flat) → later `world/history-tables.json`
- Modify: towns/kinship as outputs of gen (anchors merged)
- Test: `tests/sim/worldgen-determinism.test.ts`, `tests/sim/worldgen-coherence.test.ts`

**Interfaces:**
- Produces: `generateWorld(seed: number, opts?: { includeAnchors?: boolean }): GeneratedWorld`
- Produces: `dumpWorld(world: GeneratedWorld): { text: string; hash: string }`

```ts
export type GeneratedWorld = {
  seed: number;
  towns: Record<string, TownGen>;
  people: Record<string, PersonGen>;
  kinshipEdges: KinEdge[];
  routes: RouteGen[];
  facilities: FacilityGen[];
  doctrines: DoctrineGen[];
  history: { townId: string; beatId: string; summary: string }[];
};
```

- [ ] **Step 1: Failing determinism test**

```ts
it('same seed yields identical dump hash', () => {
  const a = generateWorld(42, { includeAnchors: true });
  const b = generateWorld(42, { includeAnchors: true });
  expect(dumpWorld(a).hash).toBe(dumpWorld(b).hash);
  expect(Object.keys(a.towns).length).toBeGreaterThanOrEqual(3);
});

it('includes authored ashford anchors when includeAnchors true', () => {
  const w = generateWorld(7, { includeAnchors: true });
  expect(w.people.marta_ellison?.anchor || w.people.marta_ellison?.authored).toBeTruthy();
});

it('coherence ok for seed 42', () => {
  expect(assertWorldCoherence(generateWorld(42, { includeAnchors: true })).ok).toBe(true);
});
```

- [ ] **Step 2: FAIL** — `npx vitest run tests/sim/worldgen-determinism.test.ts tests/sim/worldgen-coherence.test.ts`

- [ ] **Step 3: Implement** — place N settlements on gapAxis 0..1; attach biomes/routes/facilities from tables; spawn non-anchor people via history-tables; wire kin/friend/pen_pal; merge Ashford anchors; doctrines per polity size.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/sim/worldgen.ts src/sim/history-gen.ts src/data/history-tables.json tests/sim/worldgen-determinism.test.ts tests/sim/worldgen-coherence.test.ts
git commit -m "feat(m2-fabric): seeded worldgen with determinism and coherence"
```

**Depends on:** Task A, B, D (world assert).  
**Acceptance:** ≥3 settlements; anchors preserved; hash stable; `npm run validate` OK.

---

