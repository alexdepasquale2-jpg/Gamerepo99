/**
 * Loom fabric variety audit — run: npx vitest run scripts/audit/fabric-variety.test.ts
 * See scripts/audit/README.md
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../../src/sim/gen/world';
import { dumpWorld, createPlaySession } from '../../src/sim/fabric/world-dump';

const SEEDS = [7, 11, 42, 99, 256, 1024, 4096, 7777];
const OUT = '/tmp/fabric-variety-audit';

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a),
    B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

function degreeStats(edges: { from: string; to: string }[], nPeople: number) {
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  const vals = [...deg.values()];
  while (vals.length < nPeople) vals.push(0);
  const mean = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length);
  return { mean, variance, max: Math.max(0, ...vals), min: Math.min(...vals, 0) };
}

function routeDiameter(
  routes: { fromId: string; toId: string }[],
  nodeIds: string[],
): number {
  if (nodeIds.length === 0) return 0;
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const r of routes) {
    if (!adj.has(r.fromId)) adj.set(r.fromId, new Set());
    if (!adj.has(r.toId)) adj.set(r.toId, new Set());
    adj.get(r.fromId)!.add(r.toId);
    adj.get(r.toId)!.add(r.fromId);
  }
  let diam = 0;
  for (const start of adj.keys()) {
    const dist = new Map<string, number>([[start, 0]]);
    const q = [start];
    while (q.length) {
      const u = q.shift()!;
      for (const v of adj.get(u) ?? []) {
        if (!dist.has(v)) {
          dist.set(v, (dist.get(u) ?? 0) + 1);
          q.push(v);
        }
      }
    }
    for (const d of dist.values()) diam = Math.max(diam, d);
  }
  return diam;
}

describe('fabric variety audit (scripts/audit)', () => {
  it('dumps ≥6 seeds and writes metrics.json', () => {
    mkdirSync(OUT, { recursive: true });
    const rows: Record<string, unknown>[] = [];
    for (const seed of SEEDS) {
      const session = createPlaySession({ mode: 'inspect', seed, peopleCount: 8 });
      expect(session).not.toBeNull();
      const dumpText = session!.dump();
      writeFileSync(`${OUT}/dump-seed-${seed}.txt`, dumpText);

      const world = generateWorld({ seed, peopleCount: 8 });
      const { text, hash } = dumpWorld(world);
      expect(text).toBe(dumpText);

      const histIds = (world.history ?? []).map((h) => h.id);
      const gaps = (world.gapSites ?? []).map((g) => g.gap01);
      const settlements = world.settlements ?? [];
      const routes = world.routes ?? [];
      const doctrines = world.doctrines ?? [];
      const kin = world.kinEdges ?? [];
      const kindMix: Record<string, number> = {};
      for (const e of kin) kindMix[e.kind ?? 'kin'] = (kindMix[e.kind ?? 'kin'] ?? 0) + 1;
      const deg = degreeStats(kin, world.people.length);

      rows.push({
        seed,
        hash,
        fingerprint: world.fingerprint,
        townCount: world.gapSites?.length ?? 0,
        settlementCount: settlements.length,
        gapMean: gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length),
        gapPositions: gaps,
        historyCount: histIds.length,
        historyIds: histIds,
        kinCount: kin.length,
        kinKindMix: kindMix,
        kinDegreeVar: deg.variance,
        doctrineIds: doctrines.map((d) => d.id).sort(),
        settlementIds: settlements.map((s) => s.id).sort(),
        routeCount: routes.length,
        routeDiameter: routeDiameter(routes, settlements.map((s) => s.id)),
        biomeIds: (world.biomes ?? []).map((b) => b.id).sort(),
      });
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const variance = (xs: number[]) => {
      const m = mean(xs);
      return xs.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, xs.length);
    };
    const pair = (key: string) => {
      const scores: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          scores.push(
            jaccard(
              (rows[i]![key] as string[]) ?? [],
              (rows[j]![key] as string[]) ?? [],
            ),
          );
        }
      }
      return { mean: mean(scores), values: scores };
    };

    const summary = {
      seeds: SEEDS,
      uniqueFingerprints: new Set(rows.map((r) => r.fingerprint)).size,
      uniqueHashes: new Set(rows.map((r) => r.hash)).size,
      settlementIdJaccard: pair('settlementIds'),
      doctrineIdJaccard: pair('doctrineIds'),
      historyIdJaccard: pair('historyIds'),
      biomeIdJaccard: pair('biomeIds'),
      townCountVar: variance(rows.map((r) => r.townCount as number)),
      gapMeanVar: variance(rows.map((r) => r.gapMean as number)),
      kinCountVar: variance(rows.map((r) => r.kinCount as number)),
      routeDiameterVar: variance(rows.map((r) => r.routeDiameter as number)),
      rows,
    };
    writeFileSync(`${OUT}/metrics.json`, JSON.stringify(summary, null, 2));
    // eslint-disable-next-line no-console
    console.log(
      'VARIETY_SUMMARY',
      JSON.stringify({
        uniqueFingerprints: summary.uniqueFingerprints,
        settlementJ: summary.settlementIdJaccard.mean,
        doctrineJ: summary.doctrineIdJaccard.mean,
        historyJ: summary.historyIdJaccard.mean,
        gapMeanVar: summary.gapMeanVar,
      }),
    );
  });
});
