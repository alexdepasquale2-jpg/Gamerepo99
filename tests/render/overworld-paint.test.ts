import { describe, expect, it } from 'vitest';
import { lookupAsset } from '../../src/render/asset-manifest';
import {
  PROP_ASSET,
  biomeAccentFor,
  groundPaintFor,
  heroWalkAnim,
  isRoadBiome,
} from '../../src/render/painters/overworld-paint';

describe('overworld paint contracts', () => {
  it('maps field props to crop.crop_wheat (not crop.wheat)', () => {
    expect(PROP_ASSET.field).toBe('crop.crop_wheat');
    expect(lookupAsset(PROP_ASSET.field)?.sheet).toMatch(/crop/);
  });

  it('picks calm grass variants by tile hash (no sheet-ground checkerboard)', () => {
    const a = groundPaintFor({ q: 0, r: 0, biomeId: 'mill_heath', warmth: 0.5 });
    const b = groundPaintFor({ q: 1, r: 0, biomeId: 'mill_heath', warmth: 0.5 });
    const c = groundPaintFor({ q: 2, r: 0, biomeId: 'mill_heath', warmth: 0.5 });
    for (const g of [a, b, c]) {
      expect(g.kind).toBe('grass');
      if (g.kind === 'grass') {
        expect(g.key).toMatch(/^grass-calm/);
      }
    }
    expect(groundPaintFor({ q: 0, r: 0, biomeId: 'mill_heath', warmth: 0.5 })).toEqual(a);
  });

  it('offers biome accents for known biome ids (helper; live paint skips squares)', () => {
    let hit: { key: string; frame: string } | null = null;
    for (let q = 0; q < 40 && !hit; q++) {
      hit = biomeAccentFor({ q, r: 4, biomeId: 'ash_wood', warmth: 0.6 });
    }
    expect(hit).toBeTruthy();
    expect(hit!.key).toBe('sheet-biomes');
    expect(hit!.frame).toBe(String(lookupAsset('biome.ash_wood')!.frame));
  });

  it('detects road biomes for dirt ribbon', () => {
    expect(isRoadBiome('road')).toBe(true);
    expect(isRoadBiome('road_highway')).toBe(true);
    expect(isRoadBiome('mill_heath')).toBe(false);
    const g = groundPaintFor({ q: 0, r: 0, biomeId: 'road', warmth: 0.5 });
    expect(g.kind).toBe('road');
    if (g.kind === 'road') {
      expect(g.key).toBe('sheet-ground');
      expect(['4', '5', '6']).toContain(g.frame);
    }
  });

  it('picks hero walk anim + flip from input', () => {
    expect(heroWalkAnim(1, 0)).toEqual({ key: 'hero-walk-right', flipX: true });
    expect(heroWalkAnim(-1, 0)).toEqual({ key: 'hero-walk-left', flipX: false });
    expect(heroWalkAnim(0, -1)).toEqual({ key: 'hero-walk-up', flipX: false });
    expect(heroWalkAnim(0, 1)).toEqual({ key: 'hero-walk-down', flipX: false });
  });
});
