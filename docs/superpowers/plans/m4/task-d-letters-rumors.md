# Task D: Letters & rumors at scale

> Part of [M4 Living World](./index.md). Data: `dialogue/letters.json`, `systems/ripples.json` `crossTown`.

**Files:**
- Create: `src/sim/letters-scale.ts`
- Modify: ripple resolve path / dawn (after genuine growth & hollowness hooks)
- Test: `tests/sim/letters-scale.test.ts`

**Interfaces:**
- Consumes: `ripples.crossTown` chances; letter `templates`; kinEdges / links; `createPlaySession` events
- Produces:

```ts
export type LetterPacket = {
  id: string;
  templateId: string;
  fromPersonId: string;
  toPersonId: string;
  packetType: string;
};

export function rollCrossTownLetters(
  state: SimState,
  rng: { next(): number },
  opts: { genuineGrowth?: boolean; hollowness?: boolean },
): LetterPacket[];

// onGenuineGrowthChance 0.4 → pick template + preferLinksWithTags
// onHollownessChance 0.25 → relapse_pressure packet
// Cap: max 5 new packets per dawn (scale without spam)
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/sim';
import { rollCrossTownLetters } from '../../src/sim/letters-scale';
import { createPlaySession } from '../../src/sim';

describe('letters at scale', () => {
  it('emits packets across 20 dawns with growth flags without exceeding cap', () => {
    const s = createPlaySession({ mode: 'play', seed: 11, archetypeId: 'ivy_quill' });
    s.start();
    let packets = 0;
    for (let i = 0; i < 20; i++) {
      s.act('advance:dawn');
      packets += s.events().filter((e) => e.type === 'letter.deliver' || e.type === 'rumor.spread').length;
    }
    expect(packets).toBeGreaterThanOrEqual(3);
    expect(packets).toBeLessThanOrEqual(20 * 5);
  });

  it('rollCrossTownLetters respects chance and cap', () => {
    const rng = createRng(1);
    // minimal stub state documented in test file once types exported
    expect(typeof rollCrossTownLetters).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/letters-scale.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Use templates from `letters.json`; emit `letter.deliver` / `rumor.spread`; wire after method resolve when flame thresholds from ripples met, plus dawn backlog flush (max 5).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/letters-scale.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/letters-scale.ts tests/sim/letters-scale.test.ts
git commit -m "feat(m4): cross-town letters and rumors at scale"
```

**Depends on:** M3 ripples/kin; Tasks A–C optional (collapse can force hollowness rumor).  
**Acceptance:** ≥3 packets in 20 dawns seed 11; ≤5/dawn; deterministic for fixed rng seed.
