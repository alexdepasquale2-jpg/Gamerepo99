/** Seeded person drafts for Fabric worldgen. Pure; no dyn/ imports. */

import { createRng, type Rng } from '../../rng';

export type PersonDraft = {
  id: string;
  fingerprint: string;
  vector?: Record<string, number>;
  lines?: { id: string; text: string; source?: 'fixed' | 'blend' | 'fallback' }[];
  /** Authored Ashford (etc.) fabric anchor from people.json. */
  anchor?: boolean;
  authored?: boolean;
};

export type GeneratePeopleOpts = {
  seed: number;
  count?: number;
};

export type GeneratePersonDraftOpts = {
  seed: number;
  index?: number;
};

function fpHex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/** Draft one person from seed + index (deterministic). */
export function generatePersonDraft(opts: GeneratePersonDraftOpts): PersonDraft {
  const index = opts.index ?? 0;
  const rng = createRng((opts.seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
  return draftFromRng(rng, opts.seed, index);
}

function draftFromRng(rng: Rng, seed: number, index: number): PersonDraft {
  const warmth = rng.next();
  const bite = rng.next();
  const piety = rng.next();
  const secrecy = rng.next();
  const weariness = rng.next();
  const id = `gen_p_${seed}_${index}`;
  const fingerprint = `pf-${fpHex((seed << 8) ^ index ^ Math.imul(Math.floor(warmth * 1e6), 0x85ebca6b))}`;
  return {
    id,
    fingerprint,
    vector: { warmth, bite, piety, secrecy, weariness },
    lines: [
      {
        id: `line-${id}`,
        text: `stub-voice-${seed}-${index}`,
        source: 'fallback',
      },
    ],
  };
}

/** Draft N people from a seed (deterministic). */
export function generatePeople(opts: GeneratePeopleOpts): PersonDraft[] {
  const count = Math.max(1, opts.count ?? 3);
  const people: PersonDraft[] = [];
  for (let i = 0; i < count; i++) {
    people.push(generatePersonDraft({ seed: opts.seed, index: i }));
  }
  return people;
}
