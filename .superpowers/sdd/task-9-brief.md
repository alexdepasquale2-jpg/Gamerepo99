# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 9: Minimal Phaser view + UI commands + debug overlay

**Files:**
- Create: `src/render/boot-scene.ts`, `src/render/town-scene.ts`, `src/ui/hud.ts`, `src/ui/method-menu.ts`, `src/ui/succession-ui.ts`, `src/ui/debug-overlay.ts`, `src/sim/events-bus.ts`
- Modify: `src/main.ts`
- Test: `tests/sim/commands.test.ts` (headless command API; no Phaser in tests)

**Interfaces:**
- Consumes: `SimState` readonly from render; commands via `dispatch(state, cmd)`
- Produces: commands `move`, `selectPerson`, `commitMethod`, `travel`, `successionContinue`, `successionQuit`
- Debug overlay fields: spark, day, town vitality, selected person flame/marks, active hooks, archetype id (display only)

- [ ] **Step 1: Write the failing test**

```ts
it('dispatch commitMethod mutates sim without phaser', () => {
  const state = bootM2World(loadData(), 'marrow', 0);
  dispatch(state, { type: 'selectPerson', personId: 'marta_ellison' });
  dispatch(state, { type: 'commitMethod', methodId: 'challenge' });
  expect(state.people.marta_ellison.flame).toBeGreaterThan(12);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Colored rects OK (32px). Method menu always lists shame; on refuse show line + coal flicker tint. On resolve show reaction line + spark lerp. Site kindle tint when flame crosses threshold. Succession UI uses locked strings. Debug toggle `D`. Wire Prism hooks via event bus names in DESIGN §3.5.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run build`
Expected: all PASS / build OK

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/render src/ui src/sim/events-bus.ts src/sim/sim-context.ts tests/sim/commands.test.ts
git commit -m "feat: minimal phaser view, ui commands, debug overlay"
```

---

