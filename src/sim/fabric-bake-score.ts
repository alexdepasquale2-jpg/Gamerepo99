/** Scoring + alone/generic_blend pool helpers for fabric bake (soft-cap extract). */

import { loadData, type DataTables } from './load-data';
import { createRng } from './rng';

type Frag = DataTables['lineFragments']['fragments'][number];

let cachedAlone: Frag[] | null = null;

function alonePool(): Frag[] {
  if (cachedAlone) return cachedAlone;
  const frags = loadData().lineFragments.fragments ?? [];
  cachedAlone = frags.filter((f) => {
    if (!f.text?.trim()) return false;
    if (f.slot === 'alone') return true;
    return (f.tags ?? []).includes('slot:alone');
  });
  return cachedAlone;
}

/** Prefer full alone corpus; generic_blend only if alone pool empty. */
export function pickPool(): Frag[] {
  const alone = alonePool();
  if (alone.length) return alone;
  const frags = loadData().lineFragments.fragments ?? [];
  return frags.filter((f) => f.text?.trim() && (f.tags ?? []).includes('generic_blend'));
}

function circDist(a: number, b: number, n: number): number {
  if (n <= 0) return 0;
  const d = Math.abs(a - b) % n;
  return Math.min(d, n - d);
}

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Leading N words, lowercased; null if the line is shorter than N. */
export function leadingWordPrefix(text: string, n = 5): string | null {
  const w = text.trim().split(/\s+/).filter(Boolean);
  if (w.length < n) return null;
  return w.slice(0, n).join(' ').toLowerCase();
}

/**
 * Higher is better. Deterministic from seed + personIndex + used set + fragId.
 * Rotation pulls toward a per-person band; novelty penalizes sitting near recent picks.
 * Optional leading-prefix penalty reduces audible chorus when fresh-prefix options exist.
 */
export function scoreBakeCandidate(args: {
  poolIndex: number;
  poolLength: number;
  personIndex: number;
  seed: number;
  usedPoolIndices: readonly number[];
  fragId: string;
  candidateText?: string;
  usedLeadingPrefixes?: ReadonlySet<string>;
  prefixWords?: number;
}): number {
  const {
    poolIndex,
    poolLength,
    personIndex,
    seed,
    usedPoolIndices,
    fragId,
    candidateText,
    usedLeadingPrefixes,
    prefixWords = 5,
  } = args;
  if (poolLength <= 0) return 0;

  const stride = Math.max(1, Math.floor(poolLength / 16));
  const base = (Math.imul(seed, 0x9e3779b9) >>> 0) % poolLength;
  const ideal = (base + personIndex * stride) % poolLength;
  const rotationBonus = -circDist(poolIndex, ideal, poolLength);

  let noveltyPenalty = 0;
  for (const up of usedPoolIndices) {
    const d = circDist(poolIndex, up, poolLength);
    if (d < stride * 2) noveltyPenalty += stride * 2 - d;
  }

  // Jitter breaks equal-score ties so low pool indices are not perpetual favorites.
  const jitter =
    createRng((seed ^ Math.imul(personIndex + 1, 0x85ebca6b) ^ hashId(fragId)) >>> 0).next() *
    (stride * 0.5);

  let prefixPenalty = 0;
  if (candidateText && usedLeadingPrefixes && usedLeadingPrefixes.size > 0) {
    const prefix = leadingWordPrefix(candidateText, prefixWords);
    if (prefix && usedLeadingPrefixes.has(prefix)) prefixPenalty = 1e6;
  }

  return rotationBonus * 4 - noveltyPenalty * 8 + jitter - prefixPenalty;
}
