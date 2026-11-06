# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 7: Ripples + cross-town packets + M2 region boot

**Files:**
- Create: `src/sim/ripples.ts`, expand `src/sim/world.ts`, `src/sim/sim-context.ts`
- Test: `tests/sim/propagation.test.ts`

**Interfaces:**
- Consumes: `links.json`, `ripples.json`
- Produces: `bootM2World(data, archetypeId, seed): SimState`, `tickDay(state)`, `advancePackets(state)`

- [ ] **Step 1: Write the failing test**

```ts
it('genuine_growth can emit proof packet along rumor link', () => {
  const state = bootM2World(loadData(), 'ivy_quill', 1);
  // force mark + ripple
  state.people.ruth_calder.flame = 60;
  state.people.ruth_calder.marks = [{ markId: 'genuine_growth', stacks: 1 }];
  afterResolveRipple(state, 'ruth_calder');
  expect(state.packets.length + state.deliveredProofs.length).toBeGreaterThan(0);
});

it('fear-road early unlock stays costly', () => {
  const state = bootM2World(loadData(), 'marrow', 2);
  state.day = 4; state.player.spark = 40;
  const cost = travelCost(state, 'den_lowmere_fear_road');
  expect(cost).toBeGreaterThanOrEqual(6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/propagation.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Authored Ashford+Lowmere+den from JSON (no procgen). Packets decrement `days` at dawn. Vitality formula from DESIGN.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/propagation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/ripples.ts src/sim/world.ts src/sim/sim-context.ts tests/sim/propagation.test.ts
git commit -m "feat(sim): m2 region, ripples, cross-town packets"
```

---

