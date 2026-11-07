import { describe, it, expect } from 'vitest';
import { generateWorld } from '../../src/sim';
import { loadData } from '../../src/sim/load-data';
import { peopleFromWorld } from '../../src/sim/play-session/play-session-boot';

const names = (seed: number) => {
  const w = generateWorld({ seed, includeAnchors: true });
  return Object.fromEntries(Object.values(peopleFromWorld(w, loadData(), seed)).map((p) => [p.id, p.name]));
};

describe('generated person names', () => {
  it('same seed gives same names', () => {
    expect(names(7)).toEqual(names(7));
  });
  it('everyone has a non-empty name', () => {
    const n = names(7);
    expect(Object.keys(n).length).toBeGreaterThan(0);
    for (const v of Object.values(n)) expect(typeof v === 'string' && v.trim().length > 0).toBe(true);
  });
  it('different seeds vary', () => {
    expect(names(7)).not.toEqual(names(8));
  });
});
