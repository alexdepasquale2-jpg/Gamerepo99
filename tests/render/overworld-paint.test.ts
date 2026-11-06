import { describe, expect, it } from 'vitest';
import { lookupAsset } from '../../src/render/asset-manifest';
import {
  PROP_ASSET,
  biomeAccentFor,
  expandMeanderRoadKeys,
  groundPaintFor,
  heroWalkAnim,
  isRoadBiome,
  roadMeanderOffset,
} from '../../src/render/painters/overworld-paint';
import { grassWorldFrame } from '../../src/render/sheet-frames';

describe('overworld paint contracts', () => {
  it('maps field props to crop.crop_wheat (not crop.wheat)', () => {
    expect(PROP_ASSET.field).toBe('crop.crop_wheat');
    expect(lookupAsset(PROP_ASSET.field)?.sheet).toMatch(/crop/);
  });

  it('picks world-space grass frames (seamless across neighbors)', () => {
    const a = groundPaintFor({ q: 0, r: 0, biomeId: 'mill_heath', warmth: 0.5 });
    const b = groundPaintFor({ q: 1, r: 0, biomeId: 'mill_heath', warmth: 0.5 });
    expect(a.kind).toBe('grass');
    expect(b.kind).toBe('grass');
    if (a.kind === 'grass' && b.kind === 'grass') {
      expect(a.key).toBe('grass-world');
      expect(a.frame).toBe(grassWorldFrame(0, 0));
      expect(b.frame).toBe(grassWorldFrame(1, 0));
      // adjacent tiles get adjacent atlas cells (col differs by 1)
      expect(Number(a.frame) % 8).toBe(0);
      expect(Number(b.frame) % 8).toBe(1);
    }
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

  it('detects road biomes and meanders the ribbon', () => {
    expect(isRoadBiome('road')).toBe(true);
    expect(isRoadBiome('road_highway')).toBe(true);
    expect(isRoadBiome('mill_heath')).toBe(false);
    const g = groundPaintFor({ q: 0, r: 0, biomeId: 'road', warmth: 0.5 });
    expect(g.kind).toBe('road');
    if (g.kind === 'road') {
      expect(g.key).toBe('sheet-ground');
      expect(['4', '5', '6']).toContain(g.frame);
    }
    expect(typeof roadMeanderOffset(10)).toBe('number');
    const expanded = expandMeanderRoadKeys(new Set(['10,5', '11,5', '12,5', '40,5', '41,5']));
    expect(expanded.size).toBeGreaterThanOrEqual(5);
    // Offsets vary along q so the ribbon is not a flat bar
    expect(roadMeanderOffset(10)).not.toBe(roadMeanderOffset(40));
  });

  it('picks hero walk anim + flip from input', () => {
    expect(heroWalkAnim(1, 0)).toEqual({ key: 'hero-walk-right', flipX: true });
    expect(heroWalkAnim(-1, 0)).toEqual({ key: 'hero-walk-left', flipX: false });
    expect(heroWalkAnim(0, -1)).toEqual({ key: 'hero-walk-up', flipX: false });
    expect(heroWalkAnim(0, 1)).toEqual({ key: 'hero-walk-down', flipX: false });
  });
});
