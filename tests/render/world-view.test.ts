import { describe, expect, it } from 'vitest';
import {
  biomeAssetKey,
  facilityAssetKey,
  mobileAssetKey,
} from '../../src/render/world-view';
import { lookupAsset, SPRITE_SORT } from '../../src/render/asset-manifest';

describe('world-view key helpers', () => {
  it('builds biome / facility / mobile keys Forge can look up', () => {
    expect(biomeAssetKey('mill_heath')).toBe('biome.mill_heath');
    expect(facilityAssetKey('mill', 'working')).toBe('facility.mill.working');
    expect(mobileAssetKey('carter')).toBe('caravan.carter');
    expect(mobileAssetKey('fauna.rabbit')).toBe('fauna.rabbit');
    expect(lookupAsset(biomeAssetKey('ash_wood'))).toBeTruthy();
    expect(lookupAsset(facilityAssetKey('mine', 'idle'))?.status).toBe('ready');
  });

  it('keeps bottom-center sort contract', () => {
    expect(SPRITE_SORT.originX).toBe(0.5);
    expect(SPRITE_SORT.originY).toBe(1.0);
  });
});
