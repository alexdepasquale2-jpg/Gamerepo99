import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';

describe('play methods × marks × spark', () => {
  it('resolving a method changes spark and person flame or marks', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    s.start();
    const before = s.snapshot().spark;
    const actions = s.listActions().filter((a) => a.id.includes('@'));
    expect(actions.length).toBeGreaterThan(0);
    s.act(actions[0].id);
    const after = s.snapshot();
    expect(after.spark).not.toBe(before);
    expect(s.events().some((e) => e.type === 'spark.spend' || e.methodId)).toBe(true);
  });
});
