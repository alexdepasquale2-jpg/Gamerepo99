/** Facade-only: attach baked fragment lines onto gen drafts. gen/ never imports this. */

import { assertVoice, type FabricLine } from './dyn/voice';
import type { PersonDraft } from './gen/people';
import type { FabricWorld, GenerateWorldOpts } from './gen/world';
import { generateWorld as generateWorldGen } from './gen/world';
import {
  generatePersonDraft as generatePersonDraftGen,
  type GeneratePeopleOpts,
  type GeneratePersonDraftOpts,
} from './gen/people';
import { leadingWordPrefix, pickPool, scoreBakeCandidate } from './fabric-bake-score';

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

  const usedLeadingPrefixes = new Set<string>();
  for (const t of usedTexts) {
    const prefix = leadingWordPrefix(t, 5);
    if (prefix) usedLeadingPrefixes.add(prefix);
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
      candidateText: frag.text,
      usedLeadingPrefixes,
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
