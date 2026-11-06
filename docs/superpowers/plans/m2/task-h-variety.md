# Task H: Fabric variety (Probe NO-SHIP follow-up)

> Part of [M2 Dynamic Fabric Implementation Plan](./index.md). Spec: `docs/superpowers/specs/2026-11-05-fabric-variety-fix.md`.

**Goal:** Worlds from different seeds stop feeling clone-shaped on history topology, gap placement, kin graph, doctrines, and routes — while staying deterministic.

**Files (Forge):**
- Modify: `src/sim/gen/settlements-gen.ts`, `gap-sites.ts`, `history-gen.ts`, `kin-gen.ts`, `doctrines-gen.ts`, `routes-gen.ts`, `biomes-gen.ts`, `load-world-tables.ts` (merge `world/towns/gap-poles.json`, load `world-shapes.json`, `kin-patterns.json`, `fauna.json` as needed)
- Test: `tests/sim/fabric/fabric-variety.test.ts` (new)

**Data already landed (Loom):** gap-pole towns, doctrines, branching history beats (by kind), world-shapes, kin-patterns, biomes+, fauna, crops, ores, extra routes/links. Validator merges `world/towns/`.

---

## Step 1: Failing variety test

```ts
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/sim/gen/world';

const SEEDS = [7, 11, 42, 99, 256, 1024, 4096, 7777];

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

describe('fabric variety thresholds', () => {
  it('keeps pairwise settlement Jaccard mean ≤ 0.55 across audit seeds', () => {
    const sets = SEEDS.map((seed) =>
      (generateWorld({ seed, peopleCount: 8 }).settlements ?? []).map((s) => s.id),
    );
    const scores: number[] = [];
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++)
        scores.push(jaccard(sets[i]!, sets[j]!));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeLessThanOrEqual(0.55);
  });

  it('history id Jaccard mean ≤ 0.22 and some chained beats appear', () => {
    const worlds = SEEDS.map((seed) => generateWorld({ seed, peopleCount: 8 }));
    const sets = worlds.map((w) => (w.history ?? []).map((h) => h.id));
    const scores: number[] = [];
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++)
        scores.push(jaccard(sets[i]!, sets[j]!));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeLessThanOrEqual(0.22);
    // At least one seed yields ≥4 history events (arc depth signal)
    expect(worlds.some((w) => (w.history?.length ?? 0) >= 4)).toBe(true);
  });

  it('gap-mean variance across seeds ≥ 0.02', () => {
    const means = SEEDS.map((seed) => {
      const gaps = (generateWorld({ seed, peopleCount: 8 }).gapSites ?? []).map((g) => g.gap01);
      return gaps.reduce((a, b) => a + b, 0) / gaps.length;
    });
    const m = means.reduce((a, b) => a + b, 0) / means.length;
    const v = means.reduce((s, x) => s + (x - m) ** 2, 0) / means.length;
    expect(v).toBeGreaterThanOrEqual(0.02);
  });

  it('route diameter mean ≥ 2.0 when settlement count ≥ 5 on average', () => {
    // Implement diameter helper as in variety audit; assert band from fix brief §5.5
  });
});
```

Run: `npx vitest run tests/sim/fabric/fabric-variety.test.ts` — **expect FAIL** on HEAD before formula wiring.

---

## Step 2: Wire tables (minimal)

1. `loadWorldTables`: concat `towns.json` + `world/towns/gap-poles.json` towns; export shapes/kin loaders.  
2. Settlements: draw shape → gapBands → leave ≥2 towns out when catalog ≥6.  
3. Gap: apply `gapBias`.  
4. History: prefer `chainsFrom`; optional rival arc.  
5. Kin: build from `kin-patterns` template.  
6. Routes/biomes: honor `routePolicy` / `biomeTags`.

---

## Step 3: Re-run variety test + Fabric suite

- `npx vitest run tests/sim/fabric/fabric-variety.test.ts` PASS  
- Full `npm test` stays green (186+).  
- Probe: re-run fabric bots; history/gap/kin should no longer read as clones.

---

## Step 4: Commit (Forge)

```bash
git add src/sim/gen tests/sim/fabric/fabric-variety.test.ts
git commit -m "feat(m2-fabric): variety shapes, kin patterns, branching history"
```
