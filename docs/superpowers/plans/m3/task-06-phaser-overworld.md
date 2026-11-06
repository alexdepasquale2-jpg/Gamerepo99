> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 6: Minimal Phaser overworld + town view

**Files:**
- Create/modify: `src/render/overworld-scene.ts`, `src/render/town-scene.ts`, `src/ui/hud.ts`, `src/ui/method-menu.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/play-boot.test.ts` or e2e smoke

**Interfaces:**
- Consumes: `getWorldRenderSnapshot(state)` if present; else town list from session dump

- [ ] **Step 1: Write the failing test**

```ts
it('boot exposes overworld town markers from session', async () => {
  // headless: createPlaySession dump parsed by a pure helper used by scene
  const towns = townsFromDump(createPlaySession({ mode: 'inspect', seed: 42 }).dump());
  expect(towns.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/play-boot.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Colored rects OK (32px); enter settlement → method menu; spark lerp on spend.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/play-boot.test.ts && npm run build`  
Expected: PASS / build OK

- [ ] **Step 5: Commit**

```bash
git add src/render src/ui src/main.ts tests/ui
git commit -m "feat(m3): phaser walk generated overworld and town"
```

**Depends on:** Tasks 1–3.  
**Acceptance:** Manual/Playwright: boot → see ≥3 towns → enter one → commit method.

---

