import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/rng';

describe('seeded RNG', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('is deterministic for same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 4 }, () => a.next());
    const seqB = Array.from({ length: 4 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('nextInt returns values in [min, max)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const n = rng.nextInt(0, 5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('int matches plan API and stays in [min, max)', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.int(0, 10), a.int(0, 10)]).toEqual([b.int(0, 10), b.int(0, 10)]);
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const n = rng.int(0, 5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('does not use Math.random', () => {
    const original = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return 0.5;
    };
    try {
      const rng = createRng(99);
      for (let i = 0; i < 20; i++) rng.next();
      expect(called).toBe(false);
    } finally {
      Math.random = original;
    }
  });
});
