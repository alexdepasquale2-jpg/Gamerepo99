import { describe, expect, it } from 'vitest';
import { ARCHETYPES, PLAYSTYLES, aggregate, runMatrix } from '../../scripts/balance-bots.mts';

describe('balance-bots harness', () => {
  it('is deterministic on a tiny matrix (1 seed, 5 dawns)', () => {
    const opts = { seeds: [1], dawns: 5 };
    const a = runMatrix(opts);
    const b = runMatrix(opts);
    expect(a).toEqual(b);
    expect(a).toHaveLength(PLAYSTYLES.length * ARCHETYPES.length);
    expect(aggregate(a)).toEqual(aggregate(b));
  }, 60_000);
});
