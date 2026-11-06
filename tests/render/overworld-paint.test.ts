import { describe, expect, it } from 'vitest';
import { lookupAsset } from '../../src/render/asset-manifest';
import {
  PROP_ASSET,
  biomeAccentFor,
  expandMeanderRoadKeys,
  grassFrameHashed,
  groundPaintFor,
  heroWalkAnim,
  isRoadBiome,
  roadMeanderOffset,
} from '../../src/render/painters/overworld-paint';

describe('overworld paint contracts', () => {
  it('maps field props to crop.crop_wheat (not crop.wheat)', () => {
    expect(PROP_ASSET.field).toBe('crop.crop_wheat');
    expect(lookupAsset(PROP_ASSET.field)?.sheet).toMatch(/crop/);
  });

  it('uses single calm grass base (no per-tile color variation)', () => {
    const a = grassFrameHashed(0, 0);
    const b = grassFrameHashed(1, 0);
    const c = grassFrameHashed(8, 0);
    expect(Number(a.frame)).toBeGreaterThanOrEqual(0);
    expect(Number(a.frame)).toBeLessThan(64);
    // hashed helper still breaks 8x8 alignment for any residual callers
    expect(c.frame).not.toBe(a.frame);
    const g = groundPaintFor({ q: 3, r: 5, biomeId: 'mill_heath', warmth: 0.5 });
    expect(g.kind).toBe('grass');
    if (g.kind === 'grass') {
      expect(g.key).toBe('grass-calm');
      expect(g.frame).toBe('0');
    }
    expect(typeof b.flipX).toBe('boolean');
  });

  it('offers biome accents for known biome ids', () => {
    let hit: { key: string; frame: string } | null = null;
    for (let q = 0; q < 40 && !hit; q++) {
      hit = biomeAccentFor({ q, r: 4, biomeId: 'ash_wood', warmth: 0.6 });
    }
    expect(hit).toBeTruthy();
    expect(hit!.key).toBe('sheet-biomes');
  });

  it('detects road biomes and meanders the ribbon', () => {
    expect(isRoadBiome('road')).toBe(true);
    const g = groundPaintFor({ q: 0, r: 0, biomeId: 'road', warmth: 0.5 });
    expect(g.kind).toBe('road');
    expect(roadMeanderOffset(10)).not.toBe(roadMeanderOffset(20));
    const expanded = expandMeanderRoadKeys(new Set(['10,5', '11,5', '12,5', '40,5', '41,5']));
    expect(expanded.size).toBeGreaterThanOrEqual(5);
  });

  it('picks hero walk anim + flip from input', () => {
    expect(heroWalkAnim(1, 0)).toEqual({ key: 'hero-walk-right', flipX: true });
    expect(heroWalkAnim(-1, 0)).toEqual({ key: 'hero-walk-left', flipX: false });
    expect(heroWalkAnim(0, -1)).toEqual({ key: 'hero-walk-up', flipX: false });
    expect(heroWalkAnim(0, 1)).toEqual({ key: 'hero-walk-down', flipX: false });
  });
});
