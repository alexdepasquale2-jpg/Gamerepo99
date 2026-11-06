/**
 * Runtime social web: load edges, BFS hops, falloff cascade walk, introductions.
 * Spec: docs/superpowers/specs/2026-11-06-social-graph/01-model.md, 02-propagation.md.
 * Pure + deterministic (sorted neighbor order); no RNG, no ML.
 */

import {
  SOCIAL_EDGE_KINDS,
  type CascadeHit,
  type CascadePayload,
  type SocialEdge,
  type SocialEdgeKind,
  type SocialPropagation,
} from './social-types';

export type Neighbor = { id: string; edge: SocialEdge };

export type SocialGraph = {
  /** Sorted node ids. */
  nodes: () => string[];
  /** Edges in insertion order. */
  edges: () => SocialEdge[];
  /** Neighbors sorted by (id, edge.id); one entry per edge. */
  neighbors: (id: string) => Neighbor[];
  edgesBetween: (a: string, b: string) => SocialEdge[];
  /** @internal use addEdge(). */
  _add: (e: SocialEdge) => void;
};

const KIND_SET = new Set<string>(SOCIAL_EDGE_KINDS);

/** Legacy kinship.json / kin-patterns kinds → 01 enum (+ subtype tag). */
const LEGACY_KINDS: Record<string, { kind: SocialEdgeKind; tag?: string }> = {
  cousin: { kind: 'kin' },
  friend: { kind: 'friendship' },
  coworker: { kind: 'friendship', tag: 'coworker' },
  pen_pal: { kind: 'friendship', tag: 'pen_pal' },
  teacher_student: { kind: 'friendship', tag: 'teacher_student' },
  owes_favor: { kind: 'debt', tag: 'owes_favor' },
  ferry_debt: { kind: 'debt', tag: 'ferry_debt' },
};

export function mapLegacyKind(raw: string): { kind: SocialEdgeKind; tag?: string } {
  if (KIND_SET.has(raw)) return { kind: raw as SocialEdgeKind };
  const hit = LEGACY_KINDS[raw];
  if (!hit) throw new Error(`unknown social edge kind: ${raw}`);
  return hit.tag ? { kind: hit.kind, tag: hit.tag } : { kind: hit.kind };
}

/** Normalize a loaded row (new or legacy kind; kinship.json from/to field names). */
export function normalizeSocialEdge(row: Record<string, unknown>): SocialEdge {
  const a = (row.a ?? row.fromPersonId) as string;
  const b = (row.b ?? row.toPersonId) as string;
  const { kind, tag } = mapLegacyKind(String(row.kind));
  const tags = Array.isArray(row.tags) ? [...(row.tags as string[])] : [];
  if (tag && !tags.includes(tag)) tags.push(tag);
  const out: SocialEdge = { id: String(row.id), a, b, kind, weight: Number(row.weight) };
  if (tags.length) out.tags = tags;
  if (typeof row.townBias === 'string') out.townBias = row.townBias;
  return out;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function byNeighbor(x: Neighbor, y: Neighbor): number {
  if (x.id !== y.id) return x.id < y.id ? -1 : 1;
  return x.edge.id < y.edge.id ? -1 : x.edge.id > y.edge.id ? 1 : 0;
}

export function createSocialGraph(edges: readonly SocialEdge[]): SocialGraph {
  const list: SocialEdge[] = [];
  const ids = new Set<string>();
  const adj = new Map<string, Neighbor[]>();
  let nodeCache: string[] | null = null;

  const push = (from: string, n: Neighbor) => {
    const arr = adj.get(from);
    if (!arr) {
      adj.set(from, [n]);
      return;
    }
    // keep sorted (insertion sort; adds are rare at runtime)
    let i = arr.length;
    arr.push(n);
    while (i > 0 && byNeighbor(arr[i - 1]!, n) > 0) {
      arr[i] = arr[i - 1]!;
      i--;
    }
    arr[i] = n;
  };

  const g: SocialGraph = {
    nodes: () => (nodeCache ??= [...adj.keys()].sort()),
    edges: () => list.slice(),
    neighbors: (id) => adj.get(id) ?? [],
    edgesBetween: (a, b) => (adj.get(a) ?? []).filter((n) => n.id === b).map((n) => n.edge),
    _add: (e) => {
      if (e.a === e.b) throw new Error(`social edge ${e.id}: self loop`);
      if (ids.has(e.id)) throw new Error(`duplicate social edge id: ${e.id}`);
      if (!KIND_SET.has(e.kind)) throw new Error(`social edge ${e.id}: bad kind ${e.kind}`);
      ids.add(e.id);
      list.push(e);
      push(e.a, { id: e.b, edge: e });
      push(e.b, { id: e.a, edge: e });
      nodeCache = null;
    },
  };
  for (const e of edges) {
    const copy: SocialEdge = { ...e };
    if (e.tags) copy.tags = [...e.tags];
    g._add(copy);
  }
  return g;
}

export function addEdge(g: SocialGraph, e: SocialEdge): SocialEdge {
  g._add(e);
  return e;
}

/** BFS hop distances on the undirected projection (debt counts both ways). */
export function hopDistancesFrom(g: SocialGraph, src: string): Map<string, number> {
  const dist = new Map<string, number>([[src, 0]]);
  const queue = [src];
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]!;
    const d = dist.get(u)!;
    for (const n of g.neighbors(u)) {
      if (dist.has(n.id)) continue;
      dist.set(n.id, d + 1);
      queue.push(n.id);
    }
  }
  return dist;
}

/** Shortest node path a→b (inclusive), deterministic by sorted neighbors; null if unreachable. */
export function shortestPath(g: SocialGraph, a: string, b: string): string[] | null {
  if (a === b) return [a];
  const prev = new Map<string, string>([[a, a]]);
  const queue = [a];
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]!;
    for (const n of g.neighbors(u)) {
      if (prev.has(n.id)) continue;
      prev.set(n.id, u);
      if (n.id === b) {
        const path = [b];
        let cur = b;
        while (cur !== a) {
          cur = prev.get(cur)!;
          path.push(cur);
        }
        return path.reverse();
      }
      queue.push(n.id);
    }
  }
  return null;
}

/** Mean shortest-path hops over all reachable ordered pairs (01 hop budget). */
export function meanHopDistance(g: SocialGraph): number {
  let sum = 0;
  let pairs = 0;
  for (const id of g.nodes()) {
    for (const [other, d] of hopDistancesFrom(g, id)) {
      if (other === id) continue;
      sum += d;
      pairs++;
    }
  }
  return pairs ? sum / pairs : 0;
}

/**
 * Shared good/bad walker (02 §Falloff):
 *   reach(h) = baseStrength * falloff^h * Π edgeWeight  (best path, h ≤ maxHops)
 * stops when h > maxHops or reach < epsilon. Source excluded. Sign by polarity.
 */
export function walkCascade(
  g: SocialGraph,
  source: string,
  payload: CascadePayload,
  prop: Pick<SocialPropagation, 'falloff' | 'maxHops' | 'epsilon'>,
): CascadeHit[] {
  const allow = payload.kinds ? new Set<SocialEdgeKind>(payload.kinds) : null;
  const best = new Map<string, { s: number; hop: number; via: string }>();
  let frontier: Array<[string, number]> = [[source, Math.abs(payload.baseStrength)]];

  for (let h = 1; h <= prop.maxHops && frontier.length; h++) {
    const next = new Map<string, number>();
    for (const [u, su] of frontier) {
      for (const n of g.neighbors(u)) {
        if (n.id === source) continue;
        if (allow && !allow.has(n.edge.kind)) continue;
        const s = su * prop.falloff * n.edge.weight;
        if (s < prop.epsilon) continue;
        const prior = best.get(n.id);
        if (prior && prior.s >= s) continue;
        best.set(n.id, { s, hop: h, via: u });
        next.set(n.id, s);
      }
    }
    frontier = [...next.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
  }

  const sign = payload.polarity === 'bad' ? -1 : 1;
  return [...best.entries()]
    .map(([personId, v]) => ({ personId, hop: v.hop, strength: sign * v.s, via: v.via }))
    .sort((x, y) => {
      if (x.hop !== y.hop) return x.hop - y.hop;
      const dx = Math.abs(y.strength) - Math.abs(x.strength);
      if (dx !== 0) return dx;
      return x.personId < y.personId ? -1 : x.personId > y.personId ? 1 : 0;
    });
}

/**
 * `introduce` (02 §Introductions): ensure a non-rival A↔B edge exists; else add a
 * weak friendship. Returns the existing or new edge. Mutates g only.
 */
export function introduce(
  g: SocialGraph,
  a: string,
  b: string,
  prop: Pick<SocialPropagation, 'introduceWeight'> = { introduceWeight: 0.3 },
): SocialEdge {
  if (a === b) throw new Error('introduce: same person');
  const existing = g.edgesBetween(a, b).find((e) => e.kind !== 'rival');
  if (existing) return existing;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return addEdge(g, {
    id: `intro_${lo}__${hi}`,
    a: lo,
    b: hi,
    kind: 'friendship',
    weight: prop.introduceWeight,
    tags: ['introduced'],
  });
}
