import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_BIOME_IDS,
  DATA_CARAVAN_ROLES,
  DATA_FACILITY_KINDS,
  DATA_ORE_IDS,
  DATA_RESOURCE_IDS,
  GRID,
  headingToFrame4,
  headingToFrame8,
  listMissingKeys,
  listPlaceholderKeys,
  lookupAsset,
  OVERWORLD_ASSETS,
  PROPOSED_FACILITY_KINDS,
  resolveHeadingFrame,
} from '../../src/render/asset-manifest';

describe('GRID ortho bridge', () => {
  it('maps Loom-locked square ortho q=x, r=y', () => {
    expect(GRID.kind).toBe('square_ortho');
    expect(GRID.pendingLoomLock).toBe(false);
    expect(GRID.qrToCell(3, 5)).toEqual({ x: 3, y: 5 });
  });
});

describe('heading frames', () => {
  it('maps cardinals for 8-way', () => {
    expect(headingToFrame8(0)).toBe(0); // N
    expect(headingToFrame8(90)).toBe(2); // E
    expect(headingToFrame8(180)).toBe(4); // S
    expect(headingToFrame8(270)).toBe(6); // W
    expect(headingToFrame8(-45)).toBe(7); // NW
  });

  it('maps cardinals for 4-way', () => {
    expect(headingToFrame4(0)).toBe(0);
    expect(headingToFrame4(90)).toBe(1);
    expect(headingToFrame4(180)).toBe(2);
    expect(headingToFrame4(270)).toBe(3);
  });

  it('resolveHeadingFrame uses entry mode', () => {
    const carter = lookupAsset('caravan.carter')!;
    expect(resolveHeadingFrame(carter, 90)).toBe(headingToFrame8(90));
  });
});

describe('data id coverage', () => {
  it('covers every biomes.json id', () => {
    for (const id of DATA_BIOME_IDS) {
      expect(lookupAsset(`biome.${id}`)?.status).not.toBe('missing');
      expect(OVERWORLD_ASSETS[`biome.${id}`]).toBeTruthy();
    }
  });

  it('covers every facilities.json kind × state', () => {
    for (const kind of DATA_FACILITY_KINDS) {
      for (const state of ['idle', 'working', 'abandoned'] as const) {
        const e = lookupAsset(`facility.${kind}.${state}`);
        expect(e).toBeTruthy();
        expect(e!.status).toBe('ready');
      }
    }
  });

  it('covers travel-trades roles as caravan.*', () => {
    for (const role of DATA_CARAVAN_ROLES) {
      expect(lookupAsset(`caravan.${role}`)).toBeTruthy();
    }
  });

  it('covers mineral ore ids', () => {
    for (const id of DATA_ORE_IDS) {
      expect(lookupAsset(`ore.${id}`)).toBeTruthy();
    }
  });

  it('covers Loom-locked resource ids as cargo/ore', () => {
    expect([...DATA_RESOURCE_IDS]).toEqual([
      'food_grain',
      'timber',
      'ore_iron',
      'wool',
      'fuel_cord',
      'coin',
    ]);
    expect(lookupAsset('cargo.food_grain')).toBeTruthy();
    expect(lookupAsset('cargo.timber')).toBeTruthy();
    expect(lookupAsset('ore.ore_iron')).toBeTruthy();
    expect(lookupAsset('cargo.wool')).toBeTruthy();
    expect(lookupAsset('cargo.fuel_cord')).toBeTruthy();
    expect(lookupAsset('cargo.coin')).toBeTruthy();
  });

  it('keeps farm as proposed, not in OVERWORLD_ASSETS', () => {
    expect(PROPOSED_FACILITY_KINDS.farm.cropResourceId).toBe('food_grain');
    expect(OVERWORLD_ASSETS['facility.farm.idle']).toBeUndefined();
  });

  it('resolves aliases', () => {
    expect(lookupAsset('caravan.guild')?.key).toBe('caravan.caravaner');
    expect(lookupAsset('caravan.ferry')?.key).toBe('caravan.ferryman');
  });
});

describe('gaps', () => {
  it('lists only art-import gaps as missing (not farm/fauna)', () => {
    const missing = listMissingKeys();
    expect(missing).not.toContain('facility.farm.idle');
    expect(missing).not.toContain('fauna.rabbit');
    expect(missing).toContain('caravan.mount');
    expect(missing).toContain('caravan.ferryman');
  });

  it('lists fauna as placeholders', () => {
    const ph = listPlaceholderKeys();
    expect(ph).toContain('fauna.rabbit');
    expect(ph).toContain('fauna.deer');
  });
});

describe('JSON mirror', () => {
  it('exists and shares biome keys', () => {
    const raw = readFileSync(
      resolve(__dirname, '../../assets/manifest/overworld-assets.json'),
      'utf8',
    );
    const doc = JSON.parse(raw) as { assets: Record<string, unknown>; grid: { kind: string } };
    expect(doc.grid.kind).toBe('square_ortho');
    expect((doc.grid as { pendingLoomLock: boolean }).pendingLoomLock).toBe(false);
    for (const id of DATA_BIOME_IDS) {
      expect(doc.assets[`biome.${id}`]).toBeTruthy();
    }
  });
});
