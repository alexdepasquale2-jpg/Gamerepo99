> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Move-only split from `2026-11-05-m2-fabric.md`.

# Task A: Loader + validator ready for subfolder data (coordinate Tidy/Forge git-mv)

**Files:**
- Modify: `src/sim/load-data.ts`, `scripts/validate/load.mjs`
- Keep flat working until move lands; add helper `dataPath(...parts)`

**Interfaces:**
- Produces: `resolveDataFile('dialogue', 'line-fragments.json')` falling back to flat `line-fragments.json`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sim/load-data-paths.test.ts
it('loads line-fragments from flat or dialogue/ subfolder', () => {
  const data = loadData();
  expect(data.lineFragments?.fragments?.length).toBeGreaterThan(50);
  expect(data.lines?.deprecated === true || data.lineFragments?.canonical === true).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/load-data-paths.test.ts`  
Expected: FAIL (lineFragments not on DataTables yet)

- [ ] **Step 3: Minimal implementation**

Index `line-fragments`, `voice-anchors`, `reaction-curves`, `voice-constraints` on `DataTables`. Prefer `data/dialogue/*` if present else flat.

- [ ] **Step 4: Pass + validate**

Run: `npx vitest run tests/sim/load-data-paths.test.ts && npm run validate`  
Expected: PASS / OK

- [ ] **Step 5: Commit**

```bash
git add src/sim/load-data.ts scripts/validate/load.mjs tests/sim/load-data-paths.test.ts
git commit -m "feat(m2-fabric): load fabric dialogue tables (flat or dialogue/)"
```

**Depends on:** Task 6 methods merged.  
**Acceptance:** Fragments load; deprecated lines still load for shim.

---

