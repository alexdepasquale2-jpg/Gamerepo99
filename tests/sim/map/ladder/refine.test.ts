import { describe, expect, it } from 'vitest';
import { createLadder, LADDER_FACTOR, LADDER_LEVELS } from '../../../../src/sim/map/ladder/refine';

const F = LADDER_FACTOR;

describe('map ladder refine', () => {
  it('is deterministic and independent of query order (seams match)', () => {
    const a = createLadder(42), b = createLadder(42);
    const pts: [number, number][] = [];
    for (let i = 0; i < 400; i++) pts.push([(i * 7919) % 900 - 100, (i * 104729) % 700 - 50]);
    const forward = pts.map(([q, r]) => a.tileArea(q, r));
    const backward = pts.slice().reverse().map(([q, r]) => b.tileArea(q, r)).reverse();
    expect(backward).toEqual(forward);
    expect(createLadder(43).tileArea(5, 5)).toBeDefined();
  });

  it('cells across block edges agree with fresh ladders', () => {
    for (const [q, r] of [[31, 5], [32, 5], [-1, -1], [0, 0], [63, 64], [64, 63]] as const) {
      const fresh = createLadder(7).tileArea(q, r);
      const warm = createLadder(7);
      warm.tileArea(q + 40, r - 40);
      expect(warm.tileArea(q, r)).toBe(fresh);
    }
  });

  it('children mostly agree with their parent', () => {
    const ladder = createLadder(42);
    for (let k = 1; k <= LADDER_LEVELS; k++) {
      let agree = 0, total = 0;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        const parent = ladder.areaIndex(k - 1, x, y);
        let same = 0;
        for (let j = 0; j < F; j++) for (let i = 0; i < F; i++) if (ladder.areaIndex(k, x * F + i, y * F + j) === parent) same++;
        agree += same; total += F * F;
      }
      expect(agree / total).toBeGreaterThan(0.75);
    }
  });
});
