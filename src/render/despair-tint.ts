/** Pure: town despair 0..1 -> saturation multiplier, plus an eased animator. No Phaser. */

import { FEEL } from './feel';

export const DESPAIR_SAT_FLOOR = FEEL.tint.satFloor;

/** 1 = full color at despair 0; monotone down to the floor at despair 1. */
export function despairTint(despair: number): number {
  const d = Math.min(1, Math.max(0, Number.isFinite(despair) ? despair : 0));
  return 1 - (1 - DESPAIR_SAT_FLOOR) * d;
}

/** Eases a town's saturation toward its despair target over `durationMs` (linear). */
export function createTintAnimator(durationMs: number = FEEL.tint.reigniteMs, initial = 1) {
  let value = initial;
  let target = initial;
  let rate = 0;
  return {
    setDespair(despair: number, animate = true): void {
      target = despairTint(despair);
      if (!animate) value = target;
      rate = Math.abs(target - value) / Math.max(1, durationMs);
    },
    update(dtMs: number): number {
      const step = rate * dtMs;
      value = value < target ? Math.min(target, value + step) : Math.max(target, value - step);
      return value;
    },
    get value(): number {
      return value;
    },
  };
}
