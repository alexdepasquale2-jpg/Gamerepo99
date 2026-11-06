import { describe, expect, it } from 'vitest';
import { FEEL, feelHitStopMs, feelShakeIntensity } from '../../src/render/feel';

describe('FEEL render config', () => {
  it('keeps dual-cue spark colors', () => {
    expect(FEEL.spark.colorGold).toBe(0xf2b84b);
    expect(FEEL.spark.colorCyan).toBe(0x5ec8c8);
  });

  it('exposes hit-stop and shake for spark and reignite', () => {
    expect(FEEL.spark.hitStopMs).toBeGreaterThan(0);
    expect(FEEL.spark.shakeDurationMs).toBeGreaterThan(0);
    expect(FEEL.reignite.hitStopMs).toBeGreaterThan(0);
    expect(FEEL.reignite.shakeIntensity).toBeGreaterThan(0);
  });

  it('exposes color wash and cost-to-self tunables', () => {
    expect(FEEL.reignite.wash.endRadius).toBeGreaterThan(FEEL.reignite.wash.startRadius);
    expect(FEEL.reignite.wash.durationMs).toBeGreaterThan(0);
    expect(FEEL.spark.costSelf.flashMs).toBeGreaterThan(0);
    expect(FEEL.spark.costSelf.drainParticleCount).toBeGreaterThan(0);
  });

  it('exposes HUD spark bar layout', () => {
    expect(FEEL.hud.sparkBarWidth).toBeGreaterThan(0);
    expect(FEEL.hud.fillColor).toBe(FEEL.spark.colorGold);
    expect(FEEL.hud.outlineColor).toBe(FEEL.spark.colorCyan);
  });

  it('exposes reduced-motion tunables and helpers', () => {
    expect(FEEL.reducedMotion.enabled).toBe(false);
    expect(feelShakeIntensity(0.004)).toBeCloseTo(0.004);
    expect(feelHitStopMs(50)).toBe(50);
  });

  it('exposes overworld walk and camera feel', () => {
    expect(FEEL.overworld.walkTilesPerSec).toBe(2);
    expect(FEEL.overworld.camLerp).toBeGreaterThan(0);
    expect(FEEL.overworld.camDeadzoneX).toBeGreaterThan(0);
    expect(FEEL.overworld.camDeadzoneY).toBeGreaterThan(0);
  });

  it('exposes integer worldScale for Stardew proportions', () => {
    expect(FEEL.worldScale.tilePx).toBe(32);
    expect(FEEL.worldScale.camZoom).toBe(1);
    expect(FEEL.worldScale.artScale).toBe(2);
    expect(Number.isInteger(FEEL.worldScale.artScale)).toBe(true);
    // 16px ansimuz × artScale 2 → 32px = 1 tile ≈ door height
    expect(FEEL.worldScale.artScale * 16).toBe(FEEL.worldScale.tilePx);
    expect(FEEL.worldScale.cliffClearTiles).toBeGreaterThanOrEqual(2);
    expect(FEEL.worldScale.cliffClearTiles).toBeLessThanOrEqual(2.5);
    expect(FEEL.worldScale.scatterMinPx).toBeGreaterThanOrEqual(32);
    expect(FEEL.worldScale.poissonKeepA).toBeLessThanOrEqual(25);
    expect(FEEL.worldScale.poissonKeepA).toBeGreaterThanOrEqual(15);
    expect(FEEL.worldScale.treeExcludeQ).toBeGreaterThan(3);
  });
});
