/** New Game world step: the rolled and typed world numbers. */
import { describe, expect, it } from 'vitest';
import { KNOWN_WORLD, MAX_WORLD, parseWorldNumber, rollWorldSeed } from '../../src/ui/menus/world-menu';

describe('world menu numbers', () => {
  it('the known world is the baked one', () => {
    expect(KNOWN_WORLD).toBe(42);
  });

  it('a rolled world is in [1, 99999] and never the known world', () => {
    for (const r of [0, 0.25, 0.5, 0.999999999, 41 / 99_999, 41.5 / 99_999]) {
      const n = rollWorldSeed(r);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99_999);
      expect(n).not.toBe(KNOWN_WORLD);
    }
  });

  it('parses what a player would type, refuses the rest', () => {
    expect(parseWorldNumber('73104')).toBe(73104);
    expect(parseWorldNumber('  World 73104 ')).toBe(73104);
    expect(parseWorldNumber('#42')).toBe(42);
    expect(parseWorldNumber('0')).toBe(0);
    expect(parseWorldNumber(String(MAX_WORLD))).toBe(MAX_WORLD);
    for (const bad of ['', 'abc', '-3', '1.5', '1e5', '1234567890', '12 34']) expect(parseWorldNumber(bad), bad).toBeNull();
  });
});
