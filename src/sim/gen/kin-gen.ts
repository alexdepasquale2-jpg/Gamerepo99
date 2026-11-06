/** Seeded kin/friend/pen_pal graph from kin-patterns. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { KinPattern } from './load-world-tables';
import type { PersonDraft } from './people';
import type { KinEdge } from './world-types';

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function pickFromBag(rng: Rng, bag: string[], fallback: string): string {
  if (bag.length === 0) return fallback;
  return bag[rng.int(0, bag.length)]!;
}

/** Cover bag uniques first so kind-mix entropy stays high across templates. */
function assignKinds(rng: Rng, bag: string[], count: number): string[] {
  if (count <= 0) return [];
  const unique = [...new Set(bag.length ? bag : ['kin'])];
  const out: string[] = [];
  for (const k of shuffle(rng, unique)) {
    if (out.length >= count) break;
    out.push(k);
  }
  while (out.length < count) out.push(pickFromBag(rng, bag, unique[0]!));
  return shuffle(rng, out);
}

/**
 * Connected graph shaped by a kin-patterns template (attach + kind bags).
 */
export function generateKinEdges(
  rng: Rng,
  people: PersonDraft[],
  pattern?: KinPattern,
): KinEdge[] {
  const ids = people.map((p) => p.id);
  if (ids.length <= 1) return [];

  const attach = pattern?.treeAttach ?? 'random_earlier';
  const kindBag = pattern?.kindBag ?? ['kin', 'kin', 'friend', 'pen_pal'];
  const chordKinds = pattern?.chordKinds ?? ['friend', 'pen_pal'];
  const chordMul = pattern?.extraChordMul ?? 0.5;

  const edges: KinEdge[] = [];
  const seen = new Set<string>();
  const treePairs: Array<[string, string]> = [];

  for (let i = 1; i < ids.length; i++) {
    let parentIdx: number;
    if (attach === 'hub') parentIdx = 0;
    else if (attach === 'previous') parentIdx = i - 1;
    else parentIdx = rng.int(0, i);
    const from = ids[i]!;
    const to = ids[parentIdx]!;
    const key = edgeKey(from, to);
    if (seen.has(key)) continue;
    seen.add(key);
    treePairs.push([from, to]);
  }

  const treeKinds = assignKinds(rng, kindBag, treePairs.length);
  for (let i = 0; i < treePairs.length; i++) {
    const [from, to] = treePairs[i]!;
    edges.push({ from, to, kind: treeKinds[i] ?? 'kin' });
  }

  // Extra chords: scale by pattern so hub/diaspora diverge in degree variance.
  const maxExtras = Math.max(2, Math.floor((ids.length - 1) * Math.max(chordMul, 0.45)) + 1);
  const extras = rng.int(1, maxExtras + 1); // at least one chord for kind diversity
  const chordBag = chordKinds.length
    ? [...chordKinds, ...[...new Set(kindBag)].filter((k) => !chordKinds.includes(k))]
    : kindBag;
  const chordKindList = assignKinds(rng, chordBag, extras);
  for (let e = 0; e < extras; e++) {
    let i: number;
    let j: number;
    if (attach === 'hub' && ids.length > 2 && rng.next() < 0.6) {
      i = 1 + rng.int(0, ids.length - 1);
      j = 1 + rng.int(0, ids.length - 1);
      if (j === i) j = 1 + ((j - 1 + 1) % (ids.length - 1));
    } else if (attach === 'hub' && rng.next() < 0.35) {
      // Occasional spoke duplicate avoided; attach a leaf to hub already exists — skip
      i = rng.int(0, ids.length);
      j = rng.int(0, ids.length);
      if (j === i) j = (j + 1) % ids.length;
    } else {
      i = rng.int(0, ids.length);
      j = rng.int(0, ids.length);
      if (j === i) j = (j + 1) % ids.length;
    }
    const from = ids[i]!;
    const to = ids[j]!;
    const key = edgeKey(from, to);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to, kind: chordKindList[e] ?? pickFromBag(rng, chordKinds, 'friend') });
  }

  return edges;
}
