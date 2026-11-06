/** Seeded kin/friend/pen_pal graph. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { PersonDraft } from './people';
import type { KinEdge } from './world-types';

const KIND_BAG = ['kin', 'kin', 'kin', 'friend', 'friend', 'pen_pal'] as const;

function pickKind(rng: Rng): string {
  return KIND_BAG[rng.int(0, KIND_BAG.length)]!;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Connected graph with seed-varying parents and edge kinds.
 * Not a fixed linear chain — attachment targets and kinds vary by rng.
 */
export function generateKinEdges(rng: Rng, people: PersonDraft[]): KinEdge[] {
  const ids = people.map((p) => p.id);
  if (ids.length <= 1) return [];

  const edges: KinEdge[] = [];
  const seen = new Set<string>();

  // Spanning tree: each node attaches to a random earlier node (varies by seed).
  for (let i = 1; i < ids.length; i++) {
    const parentIdx = rng.int(0, i);
    const from = ids[i]!;
    const to = ids[parentIdx]!;
    const key = edgeKey(from, to);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to, kind: pickKind(rng) });
  }

  // Extra chords: 0..(n-2) friend/pen_pal links so edge count/kinds diverge by seed.
  const extras = rng.int(0, Math.max(1, ids.length - 1));
  for (let e = 0; e < extras; e++) {
    const i = rng.int(0, ids.length);
    let j = rng.int(0, ids.length);
    if (j === i) j = (j + 1) % ids.length;
    const from = ids[i]!;
    const to = ids[j]!;
    const key = edgeKey(from, to);
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = rng.next() < 0.55 ? 'friend' : 'pen_pal';
    edges.push({ from, to, kind });
  }

  return edges;
}
