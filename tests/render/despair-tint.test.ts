import { describe, expect, it } from 'vitest';
import { DESPAIR_SAT_FLOOR, createTintAnimator, despairTint } from '../../src/render/despair-tint';

describe('despairTint', () => {
  it('full color at 0, monotone down, never below the 0.25 floor', () => {
    expect(despairTint(0)).toBe(1);
    let prev = 1;
    for (let d = 0.1; d <= 1.0001; d += 0.1) {
      const v = despairTint(d);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(despairTint(5)).toBe(DESPAIR_SAT_FLOOR);
    expect(DESPAIR_SAT_FLOOR).toBeGreaterThanOrEqual(0.25);
  });
  it('is per-town: animators are independent', () => {
    const a = createTintAnimator(1000);
    const b = createTintAnimator(1000);
    a.setDespair(0.9, false);
    expect(a.value).toBeLessThan(b.value);
  });
  it('eases back toward new despair over the duration (fake clock)', () => {
    const a = createTintAnimator(1000);
    a.setDespair(0.9, false);
    const low = a.value;
    a.setDespair(0.1);
    a.update(500);
    expect(a.value).toBeGreaterThan(low);
    expect(a.value).toBeLessThan(despairTint(0.1));
    a.update(600);
    expect(a.value).toBeCloseTo(despairTint(0.1));
  });
});
