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
  /** Continuous overworld walk + follow cam (presentation only) */
  overworld: {
    /** Matches TILES_PER_MINUTE / 60 ≈ 2 tiles/sec */
    walkTilesPerSec: 2,
    camLerp: 0.18,
    camDeadzoneX: 28,
    camDeadzoneY: 20,
  },

  /**
   * Uniform world scale — one integer for the whole ansimuz pack.
   * Giants pass root cause: scaling characters alone (heroScale 4) while
   * buildings stayed tile-stamped. Fix: every pack sprite uses artScale.
   *
   *   tilePx     32  — sim TILE_PX; 16px source × artScale 2 → 1 tile on screen
   *   artScale    2  — hero/villager/trees/props share this integer scale
   *   camZoom     1  — “more zoom” from artScale↔tilePx, not fractional zoom
   *   Hero 16×2 = 32px ≈ 1 tile ≈ 1.1–1.3× inn door; shorter than a house
   *   Buildings keep near-native stamp pixels (same density as 16×2 chars)
   *   Trees: setScale(artScale) — native aspect, fuller via clusters
   */
  worldScale: {
    tilePx: 32,
    artScale: 2,
    camZoom: 1,
    /** Min tiles south of cliff row (town.r+4) for NPC feet */
    cliffClearTiles: 2.0,
    /** Keep tree feet outside this AABB around settlement stamp (tiles) */
    treeExcludeQ: 4.2,
    treeExcludeR: 2.2,
    cratePx: 14,
    fencePostH: 14,
    fenceRailH: 2,
    tuftH: 6,
    flowerPx: 3,
    /** Meadow scatter min gap — dense but non-overlapping */
    scatterMinPx: 36,
    /** Poisson grass detail — Stardew meadow density */
    poissonCellA: 18,
    poissonKeepA: 22,
    poissonCellB: 26,
    poissonKeepB: 14,
    poissonCellC: 32,
    poissonKeepC: 10,
    bushR: 8,
    rockR: 6,
    logW: 22,
    logH: 7,
    stumpR: 8,
    signH: 22,
    hayW: 18,
    hayH: 12,
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

  /**
   * When true (settings), skip shake/hit-stop; keep soft wash/alpha only.
   * Wired by UI later — render checks FEEL.reducedMotion.enabled.
   */
  reducedMotion: {
    enabled: false,
    /** Multiply shake intensity when reduced motion off; ignored when enabled */
    shakeScale: 1,
    suppressHitStop: false,
    /** If enabled: force these */
    whenEnabled: {
      shakeIntensity: 0,
      hitStopMs: 0,
      washDurationMul: 1.4,
      particleCountMul: 0.35,
    },
  },
} as const;

export type Feel = typeof FEEL;

/** Effective shake intensity honoring reduced-motion flag. */
export function feelShakeIntensity(base: number): number {
  if (FEEL.reducedMotion.enabled) return FEEL.reducedMotion.whenEnabled.shakeIntensity;
  return base * FEEL.reducedMotion.shakeScale;
}

/** Effective hit-stop ms honoring reduced-motion flag. */
export function feelHitStopMs(base: number): number {
  if (FEEL.reducedMotion.enabled || FEEL.reducedMotion.suppressHitStop) {
    return FEEL.reducedMotion.enabled ? FEEL.reducedMotion.whenEnabled.hitStopMs : 0;
  }
  return base;
}
