import { describe, expect, it } from 'vitest';
import { handoffPath, FEEL } from '../../src/render/feel';

describe('handoffPath', () => {
  const a = { x: 0, y: 0 }, b = { x: 100, y: 40 };
  it('starts at from and ends at to', () => {
    expect(handoffPath(a, b, 0)).toEqual({ x: 0, y: 0 });
    const e = handoffPath(a, b, 1);
    expect(e.x).toBeCloseTo(100); expect(e.y).toBeCloseTo(40);
  });
  it('arcs above the straight line mid-flight and eases in x', () => {
    const m = handoffPath(a, b, 0.5);
    expect(m.y).toBeLessThan(20);
    expect(m.x).toBeGreaterThan(0); expect(m.x).toBeLessThan(100);
  });
  it('clamps t', () => {
    expect(handoffPath(a, b, -1)).toEqual({ x: 0, y: 0 });
    expect(handoffPath(a, b, 2).x).toBeCloseTo(100);
  });
  it('has a duration', () => expect(FEEL.handoff.ms).toBeGreaterThan(0));
});
