/**
 * Web-first weave (03 §Order step 2 + 8): seeded small-world SocialEdge[].
 *
 *  1. Authored seed edges (kinship.json, legacy kinds mapped).
 *  2. Each cluster (town / household) woven by gen/ generateKinEdges + a kin-pattern.
 *  3. Clusters joined in a ring by trade/debt bridges (sparse → long paths).
 *  4. Seeded long-range shortcuts added one at a time until mean hops ≤ target.
 *  5. Assert mean hops ∈ [minMeanHops, maxMeanHops] (default 4–6).
 *
 * Pure + deterministic per seed. No ML.
 */

import { createRng, type Rng } from '../rng';
import { generateKinEdges } from '../gen/society/kin-gen';
import { loadWorldTables, pickKinPattern, type KinPattern } from '../gen/load/load-world-tables';
import { createSocialGraph, mapLegacyKind, meanHopDistance, pairKey } from './social-graph';
import type { SocialEdge, SocialEdgeKind } from './social-types';

export type WeaveOpts = {
  seed: number;
  /** All people in the web. Ids not in `clusters` are chunked by clusterSize. */
  personIds: readonly string[];
  /** Explicit groups (e.g. by town); woven densely inside, bridged between. */
  clusters?: readonly (readonly string[])[];
  /** Authored edges kept verbatim (already normalized). */
  seedEdges?: readonly SocialEdge[];
  patterns?: readonly KinPattern[];
  clusterSize?: number;
  /** Stop adding shortcuts once mean ≤ this. */
  targetMeanHops?: number;
  minMeanHops?: number;
  maxMeanHops?: number;
  maxShortcuts?: number;
};

export type WeaveResult = {
  edges: SocialEdge[];
  meanHops: number;
  shortcuts: number;
  clusters: string[][];
};

/** 01 typical weight bands. */
const WEIGHT_BAND: Record<SocialEdgeKind, [number, number]> = {
  kin: [0.6, 1.0],
  trade: [0.3, 0.7],
  debt: [0.4, 0.9],
  friendship: [0.4, 0.8],
  rival: [0.5, 1.0],
};

const BRIDGE_KINDS: SocialEdgeKind[] = ['trade', 'trade', 'trade', 'debt'];
const SHORTCUT_KINDS: SocialEdgeKind[] = ['trade', 'friendship', 'friendship', 'debt', 'rival'];

function weightFor(rng: Rng, kind: SocialEdgeKind): number {
  const [lo, hi] = WEIGHT_BAND[kind];
  return Math.round((lo + rng.next() * (hi - lo)) * 100) / 100;
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[rng.int(0, arr.length)]!;
}

function buildClusters(opts: WeaveOpts): string[][] {
  const size = Math.max(2, opts.clusterSize ?? 6);
  const placed = new Set<string>();
  const out: string[][] = [];
  for (const c of opts.clusters ?? []) {
    const members = c.filter((id) => !placed.has(id));
    for (const id of members) placed.add(id);
    if (members.length) out.push([...members]);
  }
  const rest = opts.personIds.filter((id) => !placed.has(id));
  for (let i = 0; i < rest.length; i += size) out.push(rest.slice(i, i + size));
  return out;
}

export function weaveSocialWeb(opts: WeaveOpts): WeaveResult {
  const rng = createRng((opts.seed ^ 0x50c1a1ed) >>> 0);
  const patterns = opts.patterns ?? loadWorldTables().kinPatterns;
  const target = opts.targetMeanHops ?? 5.5;
  const minMean = opts.minMeanHops ?? 4;
  const maxMean = opts.maxMeanHops ?? 6;
  const maxShortcuts = opts.maxShortcuts ?? 200;
  const clusters = buildClusters(opts);
  const clusterOf = new Map<string, number>();
  clusters.forEach((c, i) => c.forEach((id) => clusterOf.set(id, i)));

  const edges: SocialEdge[] = [];
  const seen = new Set<string>();
  let n = 0;
  const add = (a: string, b: string, kind: SocialEdgeKind, tags?: string[]): boolean => {
    if (a === b || seen.has(pairKey(a, b))) return false;
    seen.add(pairKey(a, b));
    const e: SocialEdge = { id: `sw${opts.seed}_${n++}`, a, b, kind, weight: weightFor(rng, kind) };
    if (tags?.length) e.tags = tags;
    edges.push(e);
    return true;
  };

  for (const e of opts.seedEdges ?? []) {
    seen.add(pairKey(e.a, e.b));
    const copy: SocialEdge = { ...e };
    if (e.tags) copy.tags = [...e.tags];
    edges.push(copy);
  }

  // 2. intra-cluster: reuse gen/ kin weave (tree + chords per pattern).
  for (const c of clusters) {
    const pattern = pickKinPattern(rng, [...patterns]);
    const drafts = c.map((id) => ({ id, fingerprint: '' }));
    for (const ke of generateKinEdges(rng, drafts, pattern)) {
      const { kind, tag } = mapLegacyKind(ke.kind ?? 'kin');
      add(ke.from, ke.to, kind, tag ? [tag] : undefined);
    }
  }

  // 3. ring of bridges between adjacent clusters.
  if (clusters.length > 1) {
    const ringLen = clusters.length === 2 ? 1 : clusters.length;
    for (let i = 0; i < ringLen; i++) {
      const from = clusters[i]!;
      const to = clusters[(i + 1) % clusters.length]!;
      add(pick(rng, from), pick(rng, to), pick(rng, BRIDGE_KINDS), ['bridge']);
    }
  }

  // 4. shortcuts until within target (each recompute is O(N·E); webs are small).
  let mean = meanHopDistance(createSocialGraph(edges));
  let shortcuts = 0;
  const ids = clusters.flat();
  let guard = 0;
  while (mean > target && shortcuts < maxShortcuts && guard++ < maxShortcuts * 20) {
    const a = pick(rng, ids);
    const b = pick(rng, ids);
    if (clusters.length > 1 && clusterOf.get(a) === clusterOf.get(b)) continue;
    if (!add(a, b, pick(rng, SHORTCUT_KINDS), ['shortcut'])) continue;
    shortcuts++;
    mean = meanHopDistance(createSocialGraph(edges));
  }

  if (mean < minMean || mean > maxMean) {
    throw new Error(
      `weaveSocialWeb seed ${opts.seed}: mean hops ${mean.toFixed(3)} outside [${minMean}, ${maxMean}]`,
    );
  }
  return { edges, meanHops: mean, shortcuts, clusters };
}
