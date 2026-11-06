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

  const rng = createRng((seed ^ Math.imul(index + 1, 0x85ebca6b) ^ 0xb10b10b1) >>> 0);

  const fresh = pool.filter((f) => !usedTexts.has(f.text) && !usedIds.has(f.id));
  const candidates = fresh.length > 0 ? fresh : pool;

  // Weighted shuffle pick: walk a few tries from rng to reduce collisions when fresh empties.
  let frag = candidates[rng.int(0, candidates.length)]!;
  for (let attempt = 0; attempt < 8 && usedTexts.has(frag.text) && fresh.length === 0; attempt++) {
    frag = candidates[rng.int(0, candidates.length)]!;
  }

  usedTexts.add(frag.text);
  usedIds.add(frag.id);
  return { id: frag.id, text: frag.text, source: 'blend' };
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
