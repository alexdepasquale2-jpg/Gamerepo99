import { describe, expect, it } from 'vitest';
import { FEEL } from '../../src/render/feel';

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
});
