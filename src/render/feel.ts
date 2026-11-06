/**
 * Presentation-only feel numbers. Never import this from sim.
 * Tuned for cozy-grit: small shakes, short hit-stop, dual-cue spark.
 * All spark / reignite / refusal / burnout juice lives here.
 */

export const FEEL = {
  spark: {
    /** Dual-cue gold (fill) */
    colorGold: 0xf2b84b,
    /** Dual-cue cyan (outline / gather) */
    colorCyan: 0x5ec8c8,
    particleCount: 14,
    lifespanMs: 420,
    speedMin: 20,
    speedMax: 70,
    hitStopMs: 50,
    shakeIntensity: 0.004,
    shakeDurationMs: 90,
    /** Cost-to-self feedback on the player when spark is spent */
    costSelf: {
      flashColor: 0x5ec8c8,
      flashAlpha: 0.45,
      flashMs: 220,
      drainParticleCount: 10,
      afterimageMs: 280,
      afterimageAlpha: 0.55,
      vignetteAlpha: 0.22,
      vignetteMs: 240,
    },
  },
  reignite: {
    colorWarm: 0xd97b3a,
    colorGold: 0xf2b84b,
    particleCount: 22,
    lifespanMs: 700,
    speedMin: 30,
    speedMax: 110,
    bloomRadius: 64,
    bloomAlpha: 0.4,
    bloomMs: 520,
    hitStopMs: 40,
    shakeIntensity: 0.003,
    shakeDurationMs: 70,
    /** Color wash: expanding warm tint that reveals alive palette over despair */
    wash: {
      startRadius: 12,
      endRadius: 160,
      durationMs: 900,
      startAlpha: 0.55,
      endAlpha: 0,
      /** Warm wash tint (multiplied feel — not a green overlay band) */
      color: 0xf2b84b,
      /** Secondary soft warm ring */
      ringColor: 0xd97b3a,
      ringWidth: 3,
    },
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
  /** HUD spark bar (presentation only) */
  hud: {
    sparkBarWidth: 120,
    sparkBarHeight: 10,
    sparkBarX: 12,
    sparkBarY: 52,
    outlineColor: 0x5ec8c8,
    fillColor: 0xf2b84b,
    emptyColor: 0x2a2620,
  },
} as const;

export type Feel = typeof FEEL;
