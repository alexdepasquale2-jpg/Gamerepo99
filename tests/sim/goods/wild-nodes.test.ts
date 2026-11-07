import { describe, expect, it } from 'vitest';
import { wildNodesIn } from '../../../src/sim/goods/nodes';

const towns = [{ id: 'a', q: 100, r: 100 }, { id: 'b', q: 2000, r: 1500 }];

describe('wild nodes collapse on observation', () => {
  it('same rect gives the same nodes; split rects union to the whole', () => {
    const whole = wildNodesIn(42, towns, 200, 200, 264, 264);
    expect(wildNodesIn(42, towns, 200, 200, 264, 264)).toEqual(whole);
    const parts = [...wildNodesIn(42, towns, 200, 200, 232, 264), ...wildNodesIn(42, towns, 232, 200, 264, 264)];
    expect(parts.map((n) => n.id).sort()).toEqual(whole.map((n) => n.id).sort());
    expect(whole.length).toBeGreaterThan(20);
  });

  it('only collapses what is looked at, never outside the world or inside towns', () => {
    expect(wildNodesIn(42, towns, 50_000, 50_000, 50_032, 50_032)).toEqual([]);
    for (const n of wildNodesIn(42, towns, 68, 68, 132, 132)) expect(Math.hypot(n.q - 100, n.r - 100)).toBeGreaterThanOrEqual(10);
  });
});
