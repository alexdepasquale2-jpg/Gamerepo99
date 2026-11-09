import { describe, expect, it } from 'vitest';
import { resolveTug, struggleScale, TUG_SWALLOW_MS } from '../../src/home/tug';
import type { TugSide } from '../../src/home/tug';

const strong: TugSide = { id: 'a', kind: 'farmhouse', x: 30, y: 0, strength: 20 };
const weak: TugSide = { id: 'b', kind: 'outhouse', x: -80, y: 0, strength: 10 };
const twinA: TugSide = { id: 'a', kind: 'tavern', x: 40, y: 30, strength: 10 };
const twinB: TugSide = { id: 'b', kind: 'bakery', x: -70, y: 0, strength: 10 };

describe('tug-of-war', () => {
  it('lets a clear stronger pull swallow when it has held on', () => {
    const early = resolveTug([strong, weak], 0, 0, TUG_SWALLOW_MS - 1);
    expect(early.swallow).toBe(false);
    expect(early.winnerId).toBe('a');
    expect(early.pullX).toBeGreaterThan(0);
    const held = resolveTug([strong, weak], 0, 0, TUG_SWALLOW_MS);
    expect(held.swallow).toBe(true);
    expect(held.stalemate).toBe(false);
    expect(held.winnerId).toBe('a');
  });

  it('refuses to swallow a near-tie and yanks the other way a moment later', () => {
    const first = resolveTug([twinA, twinB], 0, 0, 0);
    const later = resolveTug([twinA, twinB], 0, 0, 180);
    expect(first.stalemate).toBe(true);
    expect(first.swallow).toBe(false);
    expect(first.winnerId).toBeNull();
    expect(later.stalemate).toBe(true);
    expect(Math.sign(first.pullX)).not.toBe(Math.sign(later.pullX));
  });

  it('does not swallow a single side', () => {
    const alone = resolveTug([strong], 0, 0, 5_000);
    expect(alone.swallow).toBe(false);
    expect(alone.winnerId).toBe('a');
    expect(alone.pullX).toBeGreaterThan(0);
  });

  it('weakens the rope when you pull against it', () => {
    expect(struggleScale(-1, 0, 10, 0)).toBeLessThan(1);
    expect(struggleScale(1, 0, 10, 0)).toBe(1);
    expect(struggleScale(0, 0, 10, 0)).toBe(1);
  });
});
