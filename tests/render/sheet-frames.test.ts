import { describe, expect, it } from 'vitest';
import { BAKED_SHEETS, lookupAsset } from '../../src/render/asset-manifest';
import { sheetTextureKey, SHEET_FRAME_CONFIGS } from '../../src/render/sheet-frames';
import { toPublicUrl } from '../../src/render/sheet-url';

describe('sheet urls + frames', () => {
  it('maps assets/ paths to Vite public URLs', () => {
    expect(toPublicUrl('assets/sprites/sheet-ground.png')).toBe('/sprites/sheet-ground.png');
    expect(toPublicUrl(BAKED_SHEETS.ground)).toBe('/sprites/sheet-ground.png');
  });

  it('lists configs for every baked sheet we paint', () => {
    const keys = SHEET_FRAME_CONFIGS.map((c) => c.key);
    expect(keys).toContain('sheet-ground');
    expect(keys).toContain('sheet-buildings');
    expect(keys).toContain('sheet-cliff');
    expect(keys).toContain('sheet-crops');
  });

  it('resolves manifest sheet ids to texture keys', () => {
    expect(sheetTextureKey('sheet-buildings')).toBe('sheet-buildings');
    expect(sheetTextureKey('buildings')).toBe('sheet-buildings');
    const wheat = lookupAsset('crop.crop_wheat');
    expect(wheat).toBeTruthy();
    expect(sheetTextureKey(wheat!.sheet)).toBe('sheet-crops');
  });

  it('maps Forge prop types to valid asset keys', () => {
    expect(lookupAsset('crop.crop_wheat')?.status).not.toBe('missing');
    expect(lookupAsset('facility.mine.idle')?.status).toBe('ready');
    expect(lookupAsset('facility.lumber_camp.idle')?.status).toBe('ready');
    expect(lookupAsset('facility.waystation.idle')?.status).toBe('ready');
  });
});
