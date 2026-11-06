import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_BIOME_IDS,
  DATA_CARAVAN_ROLES,
  DATA_FACILITY_KINDS,
  DATA_ORE_IDS,
  GRID,
  headingToFrame4,
  headingToFrame8,
  listMissingKeys,
  lookupAsset,
  OVERWORLD_ASSETS,
  resolveHeadingFrame,
} from '../../src/render/asset-manifest';

describe('GRID ortho bridge', () => {
  it('maps q,r to x,y and flags pending Loom lock', () => {
    expect(GRID.kind).toBe('square_ortho');
    expect(GRID.pendingLoomLock).toBe(true);
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

  it('resolves aliases', () => {
    expect(lookupAsset('caravan.guild')?.key).toBe('caravan.caravaner');
    expect(lookupAsset('caravan.ferry')?.key).toBe('caravan.ferryman');
  });
});

describe('gaps', () => {
  it('lists farm + fauna as missing', () => {
    const missing = listMissingKeys();
    expect(missing).toContain('facility.farm.idle');
    expect(missing).toContain('fauna.rabbit');
    expect(missing).toContain('caravan.mount');
    expect(missing).toContain('caravan.ferryman');
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
    for (const id of DATA_BIOME_IDS) {
      expect(doc.assets[`biome.${id}`]).toBeTruthy();
    }
  });
});
