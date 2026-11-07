import { describe, expect, it } from 'vitest';
import { ARCHETYPES, PLAYSTYLES, aggregate, runCell, runMatrix } from '../../scripts/balance-bots.mts';

describe('balance-bots harness', () => {
  it('is deterministic on a tiny matrix (1 seed, 5 dawns)', () => {
    const opts = { seeds: [1], dawns: 5 };
    const a = runMatrix(opts);
    const b = runMatrix(opts);
    expect(a).toEqual(b);
    expect(a).toHaveLength(PLAYSTYLES.length * ARCHETYPES.length);
    expect(aggregate(a)).toEqual(aggregate(b));
  }, 60_000);

  it('ash_hoard needs a real stash: kind bots never end ash_hoard, hoarder bots can', () => {
    for (const a of ARCHETYPES) expect(runCell('kind', a, 1, 60).ending).not.toBe('ash_hoard');
    expect(ARCHETYPES.some((a) => runCell('hoarder', a, 1, 60).ending === 'ash_hoard')).toBe(true);
  }, 120_000);
});
