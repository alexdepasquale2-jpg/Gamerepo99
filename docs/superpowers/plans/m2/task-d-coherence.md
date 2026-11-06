> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Move-only split from `2026-11-05-m2-fabric.md`.

# Task D: Coherence / assertion layer

**Files:**
- Create: `src/sim/coherence.ts`
- Data: `voice-constraints.json` (+ world rules in code/data)
- Test: `tests/sim/coherence.test.ts`

**Interfaces:**
- Produces: `assertLineCandidate(person, fragment, memory): boolean`
- Produces: `assertWorldCoherence(world): { ok: boolean; violations: string[] }`

- [ ] **Step 1: Failing test**

```ts
it('rejects fragment that contradicts hollowness memory', () => {
  expect(assertLineCandidate(
    { id: 'ruth', marks: [{ markId: 'hollowness', stacks: 1 }] },
    { tags: ['mood:naive_hope'] },
    loadData().voiceConstraints,
  )).toBe(false);
});

it('flags orphan facility without town or route', () => {
  const bad = { facilities: [{ id: 'x', townId: 'nope' }], towns: {}, routes: [] };
  expect(assertWorldCoherence(bad as any).ok).toBe(false);
});
```

- [ ] **Step 2–5:** TDD implement + commit `feat(m2-fabric): coherence assertions`

**Depends on:** Task C (line) / Task E (world) can parallelize world asserts after E.

---

