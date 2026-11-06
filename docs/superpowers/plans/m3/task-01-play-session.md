> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 1: createPlaySession play mode on generated world

**Files:**
- Create: `src/sim/play-session.ts`
- Modify: `src/sim/index.ts` exports
- Test: `tests/sim/play-session.test.ts`

**Interfaces:**
- Consumes: `generateWorld`, `assembleInhabitant`, `createRng`, Fabric dump
- Produces:

```ts
createPlaySession(opts: {
  mode: 'play' | 'inspect';
  seed: number;
  archetypeId?: string;
}): PlaySession;

type PlaySession = {
  start(opts?: { seed?: number; archetypeId?: string }): void;
  listActions(): { id: string; family?: string }[];
  act(actionId: string): void;
  tick(): void;
  snapshot(): {
    tick: number; day: number; spark: number; burnedOut: boolean;
    townId: string; townCount: number; fingerprint: string;
    reignitedCount: number; hollowCount: number;
  };
  events(): { type: string; methodId?: string }[];
  travel?(routeId: string): void;
  dump(): string;
};
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';

describe('createPlaySession play', () => {
  it('boots generated world for marrow seed 42', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    s.start();
    const snap = s.snapshot();
    expect(snap.spark).toBeGreaterThan(0);
    expect(snap.burnedOut).toBe(false);
    expect(snap.townCount).toBeGreaterThanOrEqual(3);
    expect(s.listActions().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/play-session.test.ts`  
Expected: FAIL (export missing or mode unimplemented)

- [ ] **Step 3: Write minimal implementation**

`generateWorld(seed, { includeAnchors: true })` → bind people/towns into `SimState`; place player in anchor town if any else first village; implement BotSession surface.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/play-session.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/play-session.ts src/sim/index.ts tests/sim/play-session.test.ts
git commit -m "feat(m3): createPlaySession play mode on generated world"
```

**Depends on:** M2 Fabric Tasks E–F.  
**Acceptance:** Probe `connectBotSession()` no longer null when this export lands.

---

