# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 10: Feel wiring + lines data + memorable-moment tests

**Files:**
- Create: `src/data/lines.json` (if not present), `tests/sim/feel.test.ts`
- Modify: `src/sim/methods.ts`, `src/sim/events-bus.ts`, `src/ui/hud.ts`, `src/render/town-scene.ts`
- Test: `tests/sim/feel.test.ts`

**Interfaces:**
- Consumes: `lines.json`, DESIGN §3.5
- Produces: seeded tests for "warm loaf cold hill" and "nail across the water"

- [ ] **Step 1: Write the failing test**

```ts
it('warm loaf cold hill: kind marta then dusk loneliness', () => {
  const state = bootM2World(loadData(), 'marrow', 7);
  // force carry success on marta, no witnesses, advance to dusk hooks
  expect(state.bus.lastIds).toContain('site.kindle');
  expect(state.bus.lastIds).toContain('spark.spend');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/feel.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Emit juice events; show reaction lines; dusk loneliness path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/feel.test.ts && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/lines.json src/sim tests/sim/feel.test.ts src/ui src/render
git commit -m "feat: moment-to-moment feel events and memorable-moment tests"
```

---

## M2 acceptance (Fri 8 AM)

1. `npm run validate && npm test && npm run build` green.  
2. Play: pick Marrow/Ivy/Brood → Ashford method loop → Lowmere via clear or costly fear-road → burnout shows exact succession copy.  
3. Repo grep: no `archetypeId ===` in `src/sim/`.  
4. Brood: body swap only (`activeBodiesMax` 1).  
5. Feel: spark lerps on spend; reaction lines show; at least one memorable-moment path (bakery loneliness OR forge packet) reproducible in a seeded test.  
6. Event bus emits §3.5 juice ids for Prism.  

## Plan self-review

- Spec coverage: hooks, refusals, packets, succession, 3 archetypes, debug, §3.5 feel — tasked.  
- Deferred explicitly: simultaneous multi-body, full LOD, letter UI, procgen — M3+.  
- No TBD placeholders in tasks.  
- Paths align with `STRUCTURE.md`.

