import { describe, expect, it } from 'vitest';
import { JOBS, jobOf } from '../../src/sim/goods/jobs';
import { ITEM_BY_ID } from '../../src/sim/goods/inventory';
import type { SimState } from '../../src/sim/types/runtime';

describe('jobs', () => {
  it('yield only known items', () => {
    for (const j of JOBS) for (const y of j.yield) expect(ITEM_BY_ID.has(y.itemId), `${j.id}:${y.itemId}`).toBe(true);
  });
  it('are deterministic per seed and person, and vary across people', () => {
    const s = { seed: 7 } as SimState;
    expect(jobOf(s, 'marta').id).toBe(jobOf(s, 'marta').id);
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((p) => jobOf(s, p).id)).size).toBeGreaterThan(2);
  });
});
