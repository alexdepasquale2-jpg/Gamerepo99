> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 4: Cross-town ripples on generated kin

**Files:**
- Create/modify: `src/sim/packets.ts`, kinship helpers from Fabric
- Test: `tests/sim/ripple-play.test.ts`

**Interfaces:**
- Produces: emit after genuine_growth / hollowness; deliver after link.days

- [ ] **Step 1: Write the failing test**

```ts
it('genuine_growth can emit packet that delivers along a kin edge', () => {
  const s = createPlaySession({ mode: 'play', seed: 11, archetypeId: 'marrow' });
  s.start();
  // force or find person with kin edge; apply method that yields genuine_growth
  const target = findPersonWithKin(s);
  s.act(`challenge@${target}`);
  // advance days enough for link
  for (let i = 0; i < 5; i++) s.tick();
  expect(s.events().some((e) => e.type === 'packet.emit' || e.type === 'packet.deliver')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/ripple-play.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Wire Fabric kinship edges into emit/deliver; bus ids `packet.emit` / deliver toast.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/ripple-play.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/packets.ts src/sim tests/sim/ripple-play.test.ts
git commit -m "feat(m3): cross-town ripples on generated kin"
```

**HEAD:** Ripples follow `FabricWorld.kinEdges` (`kind`: kin|friend|pen_pal) across `settlements` / towns — not Ashford-only links.

**Depends on:** Task 2.  
**Acceptance:** Seed 11 (or documented seed) reproducible.

---

