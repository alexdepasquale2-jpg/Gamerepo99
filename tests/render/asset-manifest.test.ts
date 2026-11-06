import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_BIOME_IDS,
  DATA_CARAVAN_ROLES,
  DATA_CROP_IDS,
  DATA_FACILITY_KINDS,
  DATA_FAUNA_IDS,
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

const root = resolve(__dirname, '../..');

function readJsonIds(rel: string, listKey: string, idField = 'id'): string[] | null {
  const path = resolve(root, rel);
  if (!existsSync(path)) return null;
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const list = doc[listKey];
  if (!Array.isArray(list)) return null;
  return list.map((row) => (row as Record<string, string>)[idField]).filter(Boolean);
}

describe('GRID ortho bridge', () => {
  it('maps Loom-locked square ortho q=x, r=y', () => {
    expect(GRID.kind).toBe('square_ortho');
    expect(GRID.pendingLoomLock).toBe(false);
    expect(GRID.qrToCell(3, 5)).toEqual({ x: 3, y: 5 });
  });
});

describe('heading frames', () => {
  it('maps cardinals for 8-way', () => {
    expect(headingToFrame8(0)).toBe(0);
    expect(headingToFrame8(90)).toBe(2);
    expect(headingToFrame8(180)).toBe(4);
    expect(headingToFrame8(270)).toBe(6);
    expect(headingToFrame8(-45)).toBe(7);
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
  it('covers every biomes.json id when present', () => {
    const fromFile = readJsonIds('src/data/world/biomes.json', 'biomes');
    const ids = fromFile ?? [...DATA_BIOME_IDS];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const e = lookupAsset(`biome.${id}`);
      expect(e, `missing biome.${id}`).toBeTruthy();
      expect(e!.status).not.toBe('missing');
      expect(e!.despairHint || e!.aliveHint || e!.notes).toBeTruthy();
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

  it('covers fauna.json ids when present', () => {
    const fromFile = readJsonIds('src/data/world/fauna.json', 'fauna');
    const ids = fromFile ?? [...DATA_FAUNA_IDS];
    for (const id of ids) {
      const e = lookupAsset(`fauna.${id}`);
      expect(e, `missing fauna.${id}`).toBeTruthy();
      expect(e!.status).not.toBe('missing');
      expect(e!.status).not.toBe('placeholder');
    }
  });

  it('covers crops.json ids when present', () => {
    const fromFile = readJsonIds('src/data/economy/crops.json', 'crops');
    const ids = fromFile ?? [...DATA_CROP_IDS];
    for (const id of ids) {
      const e = lookupAsset(`crop.${id}`);
      expect(e, `missing crop.${id}`).toBeTruthy();
      expect(e!.status).not.toBe('missing');
    }
  });

  it('covers mineral ore ids from economy-resources when present', () => {
    const path = resolve(root, 'src/data/economy/economy-resources.json');
    let oreIds = [...DATA_ORE_IDS];
    if (existsSync(path)) {
      const doc = JSON.parse(readFileSync(path, 'utf8')) as {
        resources: { id: string; category?: string }[];
      };
      const fromFile = doc.resources
        .map((r) => r.id)
        .filter((id) => id.startsWith('ore_'));
      if (fromFile.length) oreIds = fromFile;
    }
    for (const id of oreIds) {
      expect(lookupAsset(`ore.${id}`), `missing ore.${id}`).toBeTruthy();
    }
  });

  it('covers travel-trades roles as caravan.*', () => {
    for (const role of DATA_CARAVAN_ROLES) {
      expect(lookupAsset(`caravan.${role}`)).toBeTruthy();
    }
  });

  it('covers resource cargo/ore mapping', () => {
    expect(DATA_RESOURCE_IDS).toContain('ore_copper');
    expect(lookupAsset('cargo.food_grain')).toBeTruthy();
    expect(lookupAsset('ore.ore_iron')).toBeTruthy();
  });

  it('keeps farm as proposed, not in OVERWORLD_ASSETS', () => {
    expect(PROPOSED_FACILITY_KINDS.farm).toBeTruthy();
    expect(OVERWORLD_ASSETS['facility.farm.idle']).toBeUndefined();
  });

  it('resolves aliases', () => {
    expect(lookupAsset('caravan.guild')?.key).toBe('caravan.caravaner');
    expect(lookupAsset('caravan.ferry')?.key).toBe('caravan.ferryman');
  });
});

describe('gaps', () => {
  it('lists only art-import gaps as missing', () => {
    const missing = listMissingKeys();
    expect(missing).not.toContain('facility.farm.idle');
    expect(missing).not.toContain('fauna.rabbit');
    expect(missing).toContain('caravan.mount');
    expect(missing).toContain('caravan.ferryman');
  });

  it('does not leave fauna as placeholders once data exists', () => {
    const faunaPath = resolve(root, 'src/data/world/fauna.json');
    if (!existsSync(faunaPath)) return;
    expect(listPlaceholderKeys().filter((k) => k.startsWith('fauna.'))).toEqual([]);
  });
});

describe('JSON mirror', () => {
  it('exists and shares biome + fauna + crop keys', () => {
    const raw = readFileSync(
      resolve(__dirname, '../../assets/manifest/overworld-assets.json'),
      'utf8',
    );
    const doc = JSON.parse(raw) as {
      assets: Record<string, unknown>;
      grid: { kind: string; pendingLoomLock: boolean };
    };
    expect(doc.grid.kind).toBe('square_ortho');
    expect(doc.grid.pendingLoomLock).toBe(false);
    for (const id of DATA_BIOME_IDS) {
      expect(doc.assets[`biome.${id}`]).toBeTruthy();
    }
    for (const id of DATA_FAUNA_IDS) {
      expect(doc.assets[`fauna.${id}`]).toBeTruthy();
    }
    for (const id of DATA_CROP_IDS) {
      expect(doc.assets[`crop.${id}`]).toBeTruthy();
    }
  });
});
