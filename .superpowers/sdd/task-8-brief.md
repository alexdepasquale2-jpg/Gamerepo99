# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 8: Succession stub + inherited_dependence

**Files:**
- Create: `src/sim/succession.ts`
- Test: `tests/sim/succession.test.ts`

**Interfaces:**
- Consumes: `archetypes.succession`, statusTraits
- Produces: `buildSuccessionScreen(state): { copy, buttons, defaultChoice, candidates }`
- Produces: `chooseContinue(state, personId)`, `chooseQuit(state)`

- [ ] **Step 1: Write the failing test**

```ts
it('uses locked copy and default continue', () => {
  const ui = buildSuccessionScreen(burnedOutState());
  expect(ui.copy).toBe('Your fire went out. Someone remembers it.');
  expect(ui.buttons.continue).toBe('Carry it on');
  expect(ui.buttons.quit).toBe('Let it rest');
  expect(ui.defaultChoice).toBe('continue');
  expect(ui.quitNeverShamed).toBe(true);
});

it('dependence-chosen successor gains inherited_dependence', () => {
  const state = burnedOutStateWithDependenceBondOn('harold_finch');
  chooseContinue(state, 'harold_finch');
  expect(state.player.statusTraits).toContain('inherited_dependence');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/succession.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Score bonds; apply legacy hooks; if dependence path → run `apply_inherited_dependence`. Quit sets `state.ended = 'let_it_rest'` with no shame flavor flags.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/succession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/succession.ts tests/sim/succession.test.ts
git commit -m "feat(sim): succession screen contract and inherited_dependence"
```

---

