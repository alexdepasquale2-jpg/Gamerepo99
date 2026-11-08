/**
 * Builds the social web + centrality for one world seed (03 §Order steps 2, 7, 8).
 * Pure and deterministic per seed. Two callers:
 *  - offline: bake/social-bake.ts writes social-web.json + social-centrality.json
 *    for DEFAULT_SOCIAL_SEED (`npm run bake:social`);
 *  - runtime: a new world (any other seed) builds its own web at boot via
 *    `socialTablesForSeed`, because the baked files only hold seed 42's people.
 * Cost: ~72 people, exact Brandes betweenness, ~15-40 ms in node, so no approximation.
 */

import peopleJson from '../../data/people/people.json';
import kinshipJson from '../../data/people/kinship.json';
import { createSocialGraph, normalizeSocialEdge, type SocialGraph } from './social-graph';
import { weaveSocialWeb } from './worldgen-weave';
import type { CentralityRow, CentralityTable, SocialWebTable } from './social-types';

export const DEFAULT_SOCIAL_SEED = 42;
/** Procedural people stubs per seed (`gen_p_<seed>_<i>`, matches gen/society/people). */
export const DEFAULT_GEN_COUNT = 60;
/** Top-decile betweenness ⇒ influential. */
export const INFLUENTIAL_QUANTILE = 0.9;

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Brandes betweenness on the unweighted undirected projection, normalized to [0,1]. */
export function betweenness(g: SocialGraph): Map<string, number> {
  const nodes = g.nodes();
  const cb = new Map(nodes.map((v) => [v, 0]));
  for (const s of nodes) {
    const stack: string[] = [];
    const preds = new Map<string, string[]>(nodes.map((v) => [v, []]));
    const sigma = new Map(nodes.map((v) => [v, 0]));
    const dist = new Map(nodes.map((v) => [v, -1]));
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const v = queue[qi]!;
      stack.push(v);
      const seenHere = new Set<string>();
      for (const { id: w } of g.neighbors(v)) {
        if (seenHere.has(w)) continue; // multi-edges count once
        seenHere.add(w);
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          preds.get(w)!.push(v);
        }
      }
    }
    const delta = new Map(nodes.map((v) => [v, 0]));
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of preds.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) cb.set(w, cb.get(w)! + delta.get(w)!);
    }
  }
  const n = nodes.length;
  // undirected: each pair counted twice; normalize by (n-1)(n-2)
  const norm = n > 2 ? (n - 1) * (n - 2) : 1;
  return new Map([...cb].map(([k, v]) => [k, v / norm]));
}

/** Weighted eigenvector centrality via power iteration (offline), max-normalized. */
export function eigenvector(g: SocialGraph, iters = 200): Map<string, number> {
  const nodes = g.nodes();
  let x = new Map(nodes.map((v) => [v, 1]));
  for (let it = 0; it < iters; it++) {
    const y = new Map<string, number>();
    for (const v of nodes) {
      let s = x.get(v)!; // +I shift keeps iteration stable on bipartite pieces
      for (const n of g.neighbors(v)) s += n.edge.weight * x.get(n.id)!;
      y.set(v, s);
    }
    const max = Math.max(...y.values()) || 1;
    x = new Map([...y].map(([k, v]) => [k, v / max]));
  }
  return x;
}

export function computeCentrality(g: SocialGraph, seed: number): CentralityTable {
  const bt = betweenness(g);
  const ev = eigenvector(g);
  const sorted = [...bt.values()].map(r4).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(INFLUENTIAL_QUANTILE * (sorted.length - 1))] ?? 0;
  const rows: CentralityRow[] = g.nodes().map((personId) => {
    const b = r4(bt.get(personId)!);
    return {
      personId,
      betweenness: b,
      eigenvector: r4(ev.get(personId)!),
      influential: b > 0 && b >= threshold,
    };
  });
  return { version: 1, seed, threshold, rows };
}

/**
 * `strict` (the default, used by the offline bake) keeps the weave's mean-hop
 * quality gate, which throws when a web lands outside [4, 6] hops. A world built
 * at boot passes `strict: false`: the same deterministic web, but an unusual seed
 * plays with a slightly denser or sparser web instead of failing to start.
 */
export function buildSocialWeb(
  seed = DEFAULT_SOCIAL_SEED,
  opts: { strict?: boolean } = {},
): {
  web: SocialWebTable;
  centrality: CentralityTable;
} {
  const gate = opts.strict === false ? { minMeanHops: 0, maxMeanHops: Number.POSITIVE_INFINITY } : {};
  const authored = (peopleJson.people ?? []) as Array<{ id: string; townId?: string }>;
  const byTown = new Map<string, string[]>();
  for (const p of authored) {
    const t = p.townId ?? 'unplaced';
    byTown.set(t, [...(byTown.get(t) ?? []), p.id]);
  }
  const genIds = Array.from({ length: DEFAULT_GEN_COUNT }, (_, i) => `gen_p_${seed}_${i}`);
  const seedEdges = ((kinshipJson.edges ?? []) as unknown as Record<string, unknown>[]).map(
    normalizeSocialEdge,
  );
  const woven = weaveSocialWeb({
    seed,
    personIds: [...authored.map((p) => p.id), ...genIds],
    clusters: [...byTown.values()],
    seedEdges,
    ...gate,
  });
  const web: SocialWebTable = {
    version: 1,
    seed,
    meanHops: r4(woven.meanHops),
    edges: woven.edges,
  };
  return { web, centrality: computeCentrality(createSocialGraph(woven.edges), seed) };
}

export type SocialTables = { socialWeb: SocialWebTable; socialCentrality: CentralityTable };

/**
 * The web for one world. The baked tables come back untouched when they were
 * baked for this seed (so the known world never changes); any other seed gets a
 * freshly built web over its own `gen_p_<seed>_*` people.
 */
export function socialTablesForSeed(seed: number, baked: SocialTables): SocialTables {
  if (baked.socialWeb.seed === seed && baked.socialCentrality.seed === seed) return baked;
  const { web, centrality } = buildSocialWeb(seed, { strict: false });
  return { socialWeb: web, socialCentrality: centrality };
}
