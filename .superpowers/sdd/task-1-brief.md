# Global constraints (binding)
- Honor docs/STRUCTURE.md: sim pure; render/ui never import each other; kebab-case; soft 200 / hard 400 lines
- No if (archetypeId === …) — only traits/hooks/effects
- Succession copy exact: Your fire went out. Someone remembers it. / [Carry it on] / [Let it rest]
- Dependence bonds ×0.5; dependence successors get inherited_dependence
- Free toolchain; 32px tiles; npm run build && npm test must pass
- Quality bar: REAL game feel (responsive input, juicy feedback, satisfying pacing) — not a tech demo
- Work ONLY in /workspace/hearthfall; TDD; commit when green

### Task 1: Scaffold + data gate

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `README.md`
- Test: `tests/sim/validate-data.test.ts`
- Keep: `scripts/validate-data.mjs`, `src/data/*`

**Interfaces:**
- Consumes: none
- Produces: `npm test`, `npm run validate` scripts

- [ ] **Step 1: Write the failing test**

```ts
// tests/sim/validate-data.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('data gate', () => {
  it('validate-data.mjs exits 0', () => {
    const out = execFileSync('node', ['scripts/validate-data.mjs'], { encoding: 'utf8' });
    expect(out).toContain('OK');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/validate-data.test.ts`
Expected: FAIL (vitest/package missing)

- [ ] **Step 3: Write minimal implementation**

`package.json` scripts: `"test": "vitest run"`, `"validate": "node scripts/validate-data.mjs"`, `"dev": "vite"`, `"build": "tsc --noEmit && vite build"`. Dependencies: `phaser`, `typescript`, `vite`, `vitest`. Minimal `index.html` + `src/main.ts` console boot stub.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run validate`
Expected: PASS / OK

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html README.md tests/sim/validate-data.test.ts src/main.ts
git commit -m "chore: scaffold hearthfall tooling and data gate"
```

---

