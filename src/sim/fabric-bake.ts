/** Facade-only: attach baked fragment lines onto gen drafts. gen/ never imports this. */

import { loadData, type DataTables } from './load-data';
import { createRng } from './rng';
import { assertVoice, type FabricLine } from './dyn/voice';
import type { PersonDraft } from './gen/people';
import type { FabricWorld, GenerateWorldOpts } from './gen/world';
import { generateWorld as generateWorldGen } from './gen/world';
import {
  generatePersonDraft as generatePersonDraftGen,
  type GeneratePeopleOpts,
  type GeneratePersonDraftOpts,
} from './gen/people';

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
function pickPool(): Frag[] {
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

/**
 * Higher is better. Deterministic from seed + personIndex + used set + fragId.
 * Rotation pulls toward a per-person band; novelty penalizes sitting near recent picks.
 */
export function scoreBakeCandidate(args: {
  poolIndex: number;
  poolLength: number;
  personIndex: number;
  seed: number;
  usedPoolIndices: readonly number[];
  fragId: string;
}): number {
  const { poolIndex, poolLength, personIndex, seed, usedPoolIndices, fragId } = args;
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

  return rotationBonus * 4 - noveltyPenalty * 8 + jitter;
}

function pickBakedLine(
  seed: number,
  index: number,
  usedTexts: Set<string>,
  usedIds: Set<string>,
): FabricLine {
  const pool = pickPool();
  if (!pool.length) {
    return { id: `empty-${seed}-${index}`, text: '…', source: 'fallback' };
  }

  const fresh = pool.filter((f) => !usedTexts.has(f.text) && !usedIds.has(f.id));
  const candidates = fresh.length > 0 ? fresh : pool;

  const usedPoolIndices: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    const f = pool[i]!;
    if (usedTexts.has(f.text) || usedIds.has(f.id)) usedPoolIndices.push(i);
  }

  const poolIndexById = new Map<string, number>();
  for (let i = 0; i < pool.length; i++) {
    poolIndexById.set(pool[i]!.id, i);
  }

  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const frag of candidates) {
    const poolIndex = poolIndexById.get(frag.id) ?? 0;
    let score = scoreBakeCandidate({
      poolIndex,
      poolLength: pool.length,
      personIndex: index,
      seed,
      usedPoolIndices,
      fragId: frag.id,
    });
    // When fresh is empty, keep used texts as last resort.
    if (usedTexts.has(frag.text) || usedIds.has(frag.id)) score -= 1e9;
    if (score > bestScore) {
      bestScore = score;
      best = frag;
    }
  }

  usedTexts.add(best.text);
  usedIds.add(best.id);
  return { id: best.id, text: best.text, source: 'blend' };
}

function withBakedLines(
  person: PersonDraft,
  seed: number,
  index: number,
  usedTexts: Set<string>,
  usedIds: Set<string>,
): PersonDraft {
  const line = pickBakedLine(seed, index, usedTexts, usedIds);
  return { ...person, lines: [line] };
}

/** Public facade: draft one person with a real corpus line. */
export function generatePersonDraft(opts: GeneratePersonDraftOpts): PersonDraft {
  const index = opts.index ?? 0;
  const draft = generatePersonDraftGen(opts);
  return withBakedLines(draft, opts.seed, index, new Set(), new Set());
}

/** Public facade: N people with baked lines (anti-dup within the batch). */
export function generatePeople(opts: GeneratePeopleOpts): PersonDraft[] {
  const count = Math.max(1, opts.count ?? 3);
  const usedTexts = new Set<string>();
  const usedIds = new Set<string>();
  const people: PersonDraft[] = [];
  for (let i = 0; i < count; i++) {
    const draft = generatePersonDraftGen({ seed: opts.seed, index: i });
    people.push(withBakedLines(draft, opts.seed, i, usedTexts, usedIds));
  }
  return people;
}

/** Public facade: world stub shape + baked fragment lines (Probe seam). */
export function generateWorld(opts: GenerateWorldOpts): FabricWorld {
  const base = generateWorldGen(opts);
  const usedTexts = new Set<string>();
  const usedIds = new Set<string>();
  const people = base.people.map((p, i) => withBakedLines(p, opts.seed, i, usedTexts, usedIds));
  const lines = people.flatMap((p) => p.lines ?? []);
  const assertions = lines.map((line) => assertVoice(line));
  return {
    ...base,
    people,
    lines,
    assertions: assertions.length ? assertions : [{ ok: true }],
  };
}
