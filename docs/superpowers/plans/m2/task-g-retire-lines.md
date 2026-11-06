> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Move-only split from `2026-11-05-m2-fabric.md`.

# Task G: Retire lines.json consumers (fragments only)

**Files:**
- Modify: `pickFixedReactionLine` / fabric selector to read alone fragments by `person:`+`method:` tags
- Modify: `scripts/validate/lines.mjs` — migration check (already logs `MIGRATION lines→fragments: X/Y`)
- Test: `tests/sim/lines-migration.test.ts`
- **Do not delete `lines.json` in this task’s prep** — Forge deletes in its own commit only after migration prints OK

**Interfaces:**
- Validator + test prove every `lines.json` person×method and person×mark text has an alone-slot fragment with matching `person:` + `method:`/`mark:` tags and **verbatim** text (or explicit anchor tags carrying the same keys)

- [ ] **Step 1: Write the failing test**

```ts
// tests/sim/lines-migration.test.ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('lines.json → line-fragments migration', () => {
  it('covers every person method and mark text verbatim', () => {
    const lines = loadJson('src/data/lines.json');
    const frags = loadJson('src/data/line-fragments.json').fragments as any[];
    const alone = frags.filter((f) => f.slot === 'alone');
    let total = 0;
    let covered = 0;
    const missing: string[] = [];
    for (const [pid, person] of Object.entries(lines.people as Record<string, any>)) {
      for (const [mid, text] of Object.entries(person.methods || {})) {
        total++;
        const hit = alone.find(
          (f) =>
            (f.tags || []).includes(`person:${pid}`) &&
            (f.tags || []).includes(`method:${mid}`) &&
            f.text === text,
        );
        if (hit) covered++;
        else missing.push(`method:${pid}.${mid}`);
      }
      for (const [mk, text] of Object.entries(person.marks || {})) {
        total++;
        const hit = alone.find(
          (f) =>
            (f.tags || []).includes(`person:${pid}`) &&
            (f.tags || []).includes(`mark:${mk}`) &&
            f.text === text,
        );
        if (hit) covered++;
        else missing.push(`mark:${pid}.${mk}`);
      }
    }
    expect(missing, `missing ${missing.join(', ')}`).toEqual([]);
    expect(covered).toBe(total);
    // eslint-disable-next-line no-console
    console.log(`MIGRATION test: ${covered}/${total} covered verbatim`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (only if coverage incomplete)

Run: `npx vitest run tests/sim/lines-migration.test.ts`  
Expected: PASS once migration complete (Loom already migrated; test locks it)

- [ ] **Step 3: Migrate any missing entries into `line-fragments.json`** as `slot:"alone"` with tags `person:`, `method:`/`mark:`, `authored_anchor` — **do not delete lines.json**

- [ ] **Step 4: Run test + validate**

Run: `npx vitest run tests/sim/lines-migration.test.ts && npm run validate`  
Expected: PASS; console `MIGRATION lines→fragments: N/N covered verbatim — OK`

- [ ] **Step 5: Commit** (Forge: deletion of lines.json is a **separate** commit after consumers switched)

```bash
git add src/data/line-fragments.json scripts/validate/lines.mjs tests/sim/lines-migration.test.ts src/sim
git commit -m "feat(m2-fabric): lines→fragments migration check; consumers use fragments"
# later, separate commit:
# git rm src/data/lines.json && git commit -m "chore(data): retire lines.json after migration OK"
```



