> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Move-only split from `2026-11-05-m2-fabric.md`.

# Task F: World inspector dump + createPlaySession inspect mode

**Files:**
- Create: `src/sim/world-dump.ts` (if not inside worldgen)
- Modify: `src/sim/index.ts` export `generateWorld`, `dumpWorld`, `createPlaySession` (or `createWorldSession`)
- Test: `tests/sim/fabric/world-dump.test.ts`

**Interfaces:**
- `createPlaySession({ mode: 'inspect', seed })` returns session with `dump(): string` / `snapshot()` including town count

- [ ] **Step 1: Failing test**

```ts
it('inspect session dump contains seed and town ids', () => {
  const s = createPlaySession({ mode: 'inspect', seed: 42 });
  const text = s.dump();
  expect(text).toContain('seed:42');
  expect(text).toMatch(/ashford|town_/);
});
```

- [ ] **Step 2–5:** TDD + commit `feat(m2-fabric): world dump and inspect session for Probe`

**Depends on:** Task E.  
**Acceptance:** Probe can call without Phaser; headless.

---

