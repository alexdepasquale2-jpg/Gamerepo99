import { describe, expect, it } from 'vitest';
import { FORD_BIOME, FORD_SAND, FORD_SHALLOW, fordStones } from '../../src/render/painters/ford-paint';
import { BIOME_COLOR } from '../../src/sim/map/terrain';

describe('ford look', () => {
  it('is a distinct biome id with its own colour, not deep-water blue', () => {
    expect(FORD_BIOME).toBe('ford');
    expect(FORD_SHALLOW).not.toBe(BIOME_COLOR.water);
    expect(FORD_SAND).not.toBe(FORD_SHALLOW);
  });
  it('stepping stones are deterministic and stay inside the tile', () => {
    expect(fordStones(12, 34)).toEqual(fordStones(12, 34));
    for (let q = 0; q < 20; q++) for (const s of fordStones(q, 3)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(32);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(32);
    }
  });
});
