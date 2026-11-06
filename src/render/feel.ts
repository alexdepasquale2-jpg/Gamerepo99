/**
 * Presentation-only feel numbers. Never import this from sim.
 * Tuned for cozy-grit: small shakes, short hit-stop, dual-cue spark.
 */

export const FEEL = {
  spark: {
    colorGold: 0xf2b84b,
    colorCyan: 0x5ec8c8,
    particleCount: 14,
    lifespanMs: 420,
    speedMin: 20,
    speedMax: 70,
    hitStopMs: 50,
    shakeIntensity: 0.004,
    shakeDurationMs: 90,
  },
  reignite: {
    colorWarm: 0xd97b3a,
    colorGold: 0xf2b84b,
    particleCount: 22,
    lifespanMs: 700,
    speedMin: 30,
    speedMax: 110,
    bloomRadius: 48,
    bloomAlpha: 0.35,
    bloomMs: 480,
    shakeIntensity: 0.003,
    shakeDurationMs: 70,
  },
  refusal: {
    colorDim: 0x6a6870,
    particleCount: 6,
    lifespanMs: 280,
    flashAlpha: 0.25,
    flashMs: 160,
  },
  burnout: {
    desatMs: 320,
    snuffMs: 200,
  },
} as const;

export type Feel = typeof FEEL;
