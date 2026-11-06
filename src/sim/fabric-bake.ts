/** Facade-only: attach baked fragment lines onto gen drafts. gen/ never imports this. */

import { loadData, type DataTables } from './load-data';
import { createRng } from './rng';
import { assertVoice, type FabricLine } from './dyn/voice';
import type { PersonDraft } from './gen/people';
import type { FabricWorld, GenerateWorldOpts } from './gen/world';
import {
  generateWorld as generateWorldGen,
} from './gen/world';
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

function pickBakedLine(seed: number, index: number): FabricLine {
  const pool = alonePool();
  if (!pool.length) {
    return { id: `empty-${seed}-${index}`, text: '…', source: 'fallback' };
  }
  const generic = pool.filter((f) => (f.tags ?? []).includes('generic_blend'));
  const use = generic.length > 0 ? generic : pool;
  // Distinct mix from gen fingerprint so lines diversify independently.
  const rng = createRng((seed ^ Math.imul(index + 1, 0x85ebca6b) ^ 0xb10b10b1) >>> 0);
  const frag = use[rng.int(0, use.length)]!;
  return { id: frag.id, text: frag.text, source: 'blend' };
}

function withBakedLines(person: PersonDraft, seed: number, index: number): PersonDraft {
  const line = pickBakedLine(seed, index);
  return { ...person, lines: [line] };
}

/** Public facade: draft one person with a real corpus line. */
export function generatePersonDraft(opts: GeneratePersonDraftOpts): PersonDraft {
  const index = opts.index ?? 0;
  const draft = generatePersonDraftGen(opts);
  return withBakedLines(draft, opts.seed, index);
}

/** Public facade: N people with baked lines. */
export function generatePeople(opts: GeneratePeopleOpts): PersonDraft[] {
  const count = Math.max(1, opts.count ?? 3);
  const people: PersonDraft[] = [];
  for (let i = 0; i < count; i++) {
    people.push(generatePersonDraft({ seed: opts.seed, index: i }));
  }
  return people;
}

/** Public facade: world stub shape + baked fragment lines (Probe seam). */
export function generateWorld(opts: GenerateWorldOpts): FabricWorld {
  const base = generateWorldGen(opts);
  const people = base.people.map((p, i) => withBakedLines(p, opts.seed, i));
  const lines = people.flatMap((p) => p.lines ?? []);
  const assertions = lines.map((line) => assertVoice(line));
  return {
    ...base,
    people,
    lines,
    assertions: assertions.length ? assertions : [{ ok: true }],
  };
}
