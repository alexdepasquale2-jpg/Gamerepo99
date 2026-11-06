# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 6: Method resolve + diegetic refusals

**Files:**
- Create: `src/sim/methods.ts`
- Modify: `src/sim/world.ts` (people flame)
- Test: `tests/sim/methods.test.ts`

**Interfaces:**
- Consumes: hooks `refusal`, methodMods, wound matrix
- Produces: `commitMethod(state, personId, methodId): CommitResult`  
  (`{ kind:'refused', line, tells } | { kind:'resolved', flameDelta, marks }`)

- [ ] **Step 1: Write the failing test**

```ts
it('shame on jonah refuses with visible menu semantics', () => {
  const state = bootAshford('marrow');
  const r = commitMethod(state, 'jonah_pike', 'shame');
  expect(r.kind).toBe('refused');
  expect(r.line.length).toBeGreaterThan(0);
  expect(state.player.spark).toBeLessThan(70); // coal flicker -1
  expect(state.people.jonah_pike.flame).toBe(state.people.jonah_pike.flameStart ?? 18);
});

it('challenge on marta raises flame using matrix', () => {
  const state = bootAshford('marrow');
  const before = state.people.marta_ellison.flame;
  const r = commitMethod(state, 'marta_ellison', 'challenge');
  expect(r.kind).toBe('resolved');
  expect(state.people.marta_ellison.flame).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/methods.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Match refusal hooks by `methodId` + `when`; pick line by `lineVoiceFrom` archetypeId fallback `default`. Else compute flameDelta; roll markWeights; spend spark; pick `lines.json` reaction for method; if witnesses present adjust mark weights per DESIGN §3.5; push juice events.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/methods.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/methods.ts src/sim/world.ts tests/sim/methods.test.ts
git commit -m "feat(sim): method resolve and diegetic refusals"
```

---

