import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fingerprintHex } from '../../../src/sim/map/fingerprint';
import type { ChunkCoord, ChunkTiles, FacilityRenderView, TileRenderView } from '../../../src/sim/map/types';
import type { TileSource } from '../../../src/sim/map/tile-source';

const SOFT_CAP = 200;

function lineCount(rel: string): number {
  return readFileSync(rel, 'utf8').split('\n').length;
}

describe('TileSource types + fingerprint', () => {
  it('fingerprintHex is stable and seed-sensitive', () => {
    expect(fingerprintHex(['42', 'stamp'])).toBe(fingerprintHex(['42', 'stamp']));
    expect(fingerprintHex(['42', 'stamp'])).not.toBe(fingerprintHex(['43', 'stamp']));
  });

  it('fingerprintHex returns lowercase hex', () => {
    const hex = fingerprintHex(['42', 'stamp']);
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(hex.length).toBeGreaterThanOrEqual(8);
  });

  it('exports shapes assignable as plain objects', () => {
    const coord: ChunkCoord = { cx: 1, cy: -2 };
    const tile: TileRenderView = { q: 0, r: 0, biomeId: 'grass', warmth: 0.5 };
    const prop: FacilityRenderView = {
      id: 'p1',
      type: 'waystation',
      state: 'idle',
      warmth: 0,
      position: { x: 3, y: 4 },
    };
    const chunk: ChunkTiles = { cx: 0, cy: 0, tiles: [tile], props: [prop] };
    const source: TileSource = {
      kind: 'stamp',
      chunkSize: 32,
      getChunk: () => chunk,
      fingerprint: () => fingerprintHex(['7', 'stamp']),
    };
    expect(coord.cx).toBe(1);
    expect(source.kind).toBe('stamp');
    expect(source.getChunk(coord).tiles[0]?.biomeId).toBe('grass');
    expect(source.fingerprint()).toMatch(/^[0-9a-f]+$/);
  });

  it('map foundation modules stay under soft line cap', () => {
    for (const rel of [
      'src/sim/map/types.ts',
      'src/sim/map/tile-source.ts',
      'src/sim/map/fingerprint.ts',
    ]) {
      expect(lineCount(rel), rel).toBeLessThanOrEqual(SOFT_CAP);
    }
  });
});
