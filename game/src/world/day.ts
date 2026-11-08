/**
 * The day clock (0 dawn, 0.5 noon, 0.75 dusk) and the light it casts. The clock runs while the player is
 * out and holds in the deep night until a rest at a hearth brings the next dawn (the sim's day only turns
 * there). Light is a per-pixel multiply in the light FX, never an overlay.
 */

/** Real seconds for dawn to deep night. */
export const DAY_SECONDS = 300;
/** The clock stops here (late night) until the player rests. */
export const NIGHT_HOLD = 0.97;

type Stop = [at: number, rgb: [number, number, number]];
const STOPS: Stop[] = [
  [0.0, [1.0, 0.86, 0.76]],
  [0.1, [1.0, 0.97, 0.93]],
  [0.18, [1.0, 1.0, 1.0]],
  [0.6, [1.0, 1.0, 1.0]],
  [0.7, [1.04, 0.86, 0.7]],
  [0.77, [0.72, 0.66, 0.8]],
  [0.84, [0.42, 0.46, 0.7]],
  [1.0, [0.38, 0.42, 0.66]],
];

/** Light multiplier (r, g, b) at a clock value. */
export function lightAt(phase: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, phase));
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i]!;
    if (t > b) continue;
    const [a, ca] = STOPS[i - 1]!;
    const k = (t - a) / (b - a || 1);
    return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
  }
  return STOPS[STOPS.length - 1]![1];
}

/** 0 by day, 1 in full night (how strongly fires and windows glow). */
export function nightAt(phase: number): number {
  const [r, g, b] = lightAt(phase);
  return Math.max(0, Math.min(1, (1 - (r + g + b) / 3) / 0.48));
}

export type DayClock = { phase(): number; set(p01: number): void; advance(dt: number): void };

export function createDayClock(start = 0.3): DayClock {
  let p = start;
  return {
    phase: () => p,
    set: (v) => { p = Math.min(NIGHT_HOLD, Math.max(0, ((v % 1) + 1) % 1)); },
    advance: (dt) => { if (p < NIGHT_HOLD) p = Math.min(NIGHT_HOLD, p + dt / DAY_SECONDS); },
  };
}
