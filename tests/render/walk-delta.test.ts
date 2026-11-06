import { describe, expect, it } from 'vitest';
import { walkDelta } from '../../src/render/walk-delta';

describe('walkDelta', () => {
  const tilePx = 32;
  const tilesPerSec = 2;

  it('moves ~2 tiles/sec on a cardinal axis', () => {
    // 500ms at 2 tiles/sec = 1 tile = 32px
    const d = walkDelta(1, 0, 500, tilesPerSec, tilePx);
    expect(d.dx).toBeCloseTo(32);
    expect(d.dy).toBeCloseTo(0);
  });

  it('normalizes diagonal so speed matches cardinal', () => {
    const card = walkDelta(1, 0, 1000, tilesPerSec, tilePx);
    const diag = walkDelta(1, 1, 1000, tilesPerSec, tilePx);
    const cardSpeed = Math.hypot(card.dx, card.dy);
    const diagSpeed = Math.hypot(diag.dx, diag.dy);
    expect(diagSpeed).toBeCloseTo(cardSpeed);
    expect(diag.dx).toBeCloseTo(diag.dy);
    expect(diag.dx).toBeGreaterThan(0);
  });

  it('returns zero when no input', () => {
    expect(walkDelta(0, 0, 16, tilesPerSec, tilePx)).toEqual({ dx: 0, dy: 0 });
  });

  it('scales with deltaMs', () => {
    const a = walkDelta(0, -1, 250, tilesPerSec, tilePx);
    const b = walkDelta(0, -1, 500, tilesPerSec, tilePx);
    expect(b.dy).toBeCloseTo(a.dy * 2);
    expect(a.dx).toBe(0);
    expect(a.dy).toBeLessThan(0);
  });
});
