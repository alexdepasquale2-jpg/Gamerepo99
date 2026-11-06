import { describe, expect, it } from 'vitest';
import { generatePeople, generatePersonDraft } from '../../../../src/sim/gen/society/people';

describe('generatePeople / generatePersonDraft', () => {
  it('same seed+index yields identical drafts', () => {
    const a = generatePersonDraft({ seed: 11, index: 2 });
    const b = generatePersonDraft({ seed: 11, index: 2 });
    expect(a).toEqual(b);
  });

  it('generatePeople is deterministic for a seed', () => {
    const a = generatePeople({ seed: 5, count: 4 });
    const b = generatePeople({ seed: 5, count: 4 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
    expect(new Set(a.map((p) => p.fingerprint)).size).toBe(4);
  });
});
