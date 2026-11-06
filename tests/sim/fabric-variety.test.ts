import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/sim/gen/world';

const SEEDS = [7, 11, 42, 99, 256, 1024, 4096, 7777];

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a),
    B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

function pairwiseMean(sets: string[][]): number {
  const scores: number[] = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      scores.push(jaccard(sets[i]!, sets[j]!));
    }
  }
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Undirected hop diameter of the settlement graph induced by routes. */
function routeDiameter(
  settlementIds: string[],
  routes: Array<{ fromId: string; toId: string }>,
): number {
  if (settlementIds.length <= 1) return 0;
  const adj = new Map<string, Set<string>>();
  for (const id of settlementIds) adj.set(id, new Set());
  for (const r of routes) {
    if (!adj.has(r.fromId) || !adj.has(r.toId)) continue;
    adj.get(r.fromId)!.add(r.toId);
    adj.get(r.toId)!.add(r.fromId);
  }
  let maxDist = 0;
  for (const start of settlementIds) {
    const dist = new Map<string, number>([[start, 0]]);
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi]!;
      for (const nxt of adj.get(cur) ?? []) {
        if (dist.has(nxt)) continue;
        dist.set(nxt, (dist.get(cur) ?? 0) + 1);
        q.push(nxt);
      }
    }
    for (const d of dist.values()) maxDist = Math.max(maxDist, d);
  }
  return maxDist;
}

function kindEntropy(kinds: string[]): number {
  if (kinds.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / kinds.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function degreeVariance(ids: string[], edges: Array<{ from: string; to: string }>): number {
  const deg = new Map<string, number>();
  for (const id of ids) deg.set(id, 0);
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  const vals = [...deg.values()];
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((s, x) => s + (x - m) ** 2, 0) / vals.length;
}

describe('fabric variety thresholds', () => {
  it('keeps pairwise settlement Jaccard mean ≤ 0.55 across audit seeds', () => {
    const sets = SEEDS.map((seed) =>
      (generateWorld({ seed, peopleCount: 8 }).settlements ?? []).map((s) => s.id),
    );
    expect(pairwiseMean(sets)).toBeLessThanOrEqual(0.55);
  });

  it('history id Jaccard mean ≤ 0.22 and some chained beats appear', () => {
    const worlds = SEEDS.map((seed) => generateWorld({ seed, peopleCount: 8 }));
    const sets = worlds.map((w) => (w.history ?? []).map((h) => h.id));
    expect(pairwiseMean(sets)).toBeLessThanOrEqual(0.22);
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
    const worlds = SEEDS.map((seed) => generateWorld({ seed, peopleCount: 8 }));
    const avgSettlements =
      worlds.reduce((n, w) => n + (w.settlements?.length ?? 0), 0) / worlds.length;
    if (avgSettlements < 5) {
      // Shape catalog may keep mean below 5; still require diameter ≥ 1.5 as a soft floor.
      const diams = worlds.map((w) =>
        routeDiameter(
          (w.settlements ?? []).map((s) => s.id),
          w.routes ?? [],
        ),
      );
      const mean = diams.reduce((a, b) => a + b, 0) / diams.length;
      expect(mean).toBeGreaterThanOrEqual(1.5);
      return;
    }
    const diams = worlds.map((w) =>
      routeDiameter(
        (w.settlements ?? []).map((s) => s.id),
        w.routes ?? [],
      ),
    );
    const mean = diams.reduce((a, b) => a + b, 0) / diams.length;
    expect(mean).toBeGreaterThanOrEqual(2.0);
  });

  it('biome-id Jaccard mean ≤ 0.45', () => {
    const sets = SEEDS.map((seed) =>
      (generateWorld({ seed, peopleCount: 8 }).biomes ?? []).map((b) => b.id),
    );
    expect(pairwiseMean(sets)).toBeLessThanOrEqual(0.45);
  });

  it('kin kind-mix entropy mean ≥ 1.2 and degree variance mean ≥ 1.5', () => {
    const entropies: number[] = [];
    const degVars: number[] = [];
    for (const seed of SEEDS) {
      const w = generateWorld({ seed, peopleCount: 8 });
      const kinds = (w.kinEdges ?? []).map((e) => e.kind ?? 'kin');
      entropies.push(kindEntropy(kinds));
      degVars.push(
        degreeVariance(
          w.people.map((p) => p.id),
          w.kinEdges ?? [],
        ),
      );
    }
    const eMean = entropies.reduce((a, b) => a + b, 0) / entropies.length;
    const dMean = degVars.reduce((a, b) => a + b, 0) / degVars.length;
    expect(eMean).toBeGreaterThanOrEqual(1.2);
    expect(dMean).toBeGreaterThanOrEqual(1.5);
  });
});
