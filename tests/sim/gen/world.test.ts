import { describe, expect, it } from 'vitest';
import { generateWorld as generateWorldFacade } from '../../../src/sim/fabric';
import { generateWorld } from '../../../src/sim/gen/world';

describe('generateWorld stub', () => {
  it('same seed yields deep-equal worlds', () => {
    const a = generateWorld({ seed: 42 });
    const b = generateWorld({ seed: 42 });
    expect(a).toEqual(b);
  });

  it('different seeds yield different fingerprints', () => {
    const a = generateWorld({ seed: 1 });
    const b = generateWorld({ seed: 2 });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('returns non-trivial fabric world shape', () => {
    const w = generateWorld({ seed: 7, peopleCount: 4 });
    expect(w.seed).toBe(7);
    expect(typeof w.fingerprint).toBe('string');
    expect(w.fingerprint.length).toBeGreaterThan(0);
    expect(w.people.length).toBeGreaterThanOrEqual(3);
    for (const p of w.people) {
      expect(p.id).toBeTruthy();
      expect(p.fingerprint).toBeTruthy();
    }
    expect(w.kinEdges?.length ?? 0).toBeGreaterThanOrEqual(w.people.length - 1);
    const gaps = (w.gapSites ?? []).map((s) => s.gap01);
    expect(Math.min(...gaps)).toBeLessThanOrEqual(0.05);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(0.95);
    const history = w.history ?? [];
    expect(history.length).toBeGreaterThanOrEqual(2);
    const ats = history.map((h) => h.at ?? 0);
    expect(ats).toEqual([...ats].sort((x, y) => x - y));
    expect((w.assertions ?? []).every((a) => a.ok === true)).toBe(true);
  });
});

describe('fabric facade generateWorld', () => {
  it('re-exports generateWorld from gen/world', () => {
    expect(typeof generateWorldFacade).toBe('function');
    const w = generateWorldFacade({ seed: 11 });
    expect(w.seed).toBe(11);
    expect(w.people.length).toBeGreaterThanOrEqual(3);
  });
});
