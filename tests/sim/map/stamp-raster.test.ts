import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/gen/world';
import { CHUNK_SIZE } from '../../../src/sim/map/constants';
import { createStampRasterSource } from '../../../src/sim/map/stamp-raster';
import { layoutWorld } from '../../../src/sim/map/world-layout';

const SOFT_CAP = 200;
const PROP_TYPES = new Set(['field', 'mine', 'camp', 'waystation']);

function lineCount(rel: string): number {
  return readFileSync(rel, 'utf8').split('\n').length;
}

describe('StampRasterSource lazy getChunk + props', () => {
  it('fingerprint is stable for same seed and differs for seed+1', () => {
    const world = generateWorld({ seed: 7, peopleCount: 8 });
    const a = createStampRasterSource(world, 7);
    const b = createStampRasterSource(world, 7);
    const c = createStampRasterSource(world, 8);
    expect(a.kind).toBe('stamp');
    expect(a.chunkSize).toBe(CHUNK_SIZE);
    expect(a.fingerprint()).toBe(b.fingerprint());
    expect(a.fingerprint()).not.toBe(c.fingerprint());
  });

  it('getChunk far away returns empty-or-biome without throwing', () => {
    const world = generateWorld({ seed: 7, peopleCount: 8 });
    const source = createStampRasterSource(world, 7);
    const far = source.getChunk({ cx: 50_000, cy: -50_000 });
    expect(far.cx).toBe(50_000);
    expect(far.cy).toBe(-50_000);
    expect(Array.isArray(far.tiles)).toBe(true);
    expect(Array.isArray(far.props)).toBe(true);
    // Far from padded layout bbox → no materialization required
    expect(far.tiles.length + far.props.length).toBe(0);
  });

  it('corridor chunk between towns has a road tile and a wilderness prop', () => {
    const world = generateWorld({ seed: 7, peopleCount: 8 });
    const layout = layoutWorld(world, 7);
    const source = createStampRasterSource(world, 7);
    const [a, b] = layout.settlements;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const midQ = Math.floor((a!.q + b!.q) / 2);
    const midR = Math.floor((a!.r + b!.r) / 2);
    const cx = Math.floor(midQ / CHUNK_SIZE);
    const cy = Math.floor(midR / CHUNK_SIZE);
    const chunk = source.getChunk({ cx, cy });
    expect(chunk.tiles.length).toBeGreaterThan(0);
    const hasRoad = chunk.tiles.some(
      (t) => t.biomeId === 'road' || t.biomeId.startsWith('road'),
    );
    expect(hasRoad).toBe(true);
    const prop = chunk.props.find((p) => PROP_TYPES.has(p.type));
    expect(prop).toBeDefined();
  });

  it('stamp modules stay under soft line cap', () => {
    for (const rel of [
      'src/sim/map/corridor.ts',
      'src/sim/map/stamp-raster.ts',
    ]) {
      expect(lineCount(rel), rel).toBeLessThanOrEqual(SOFT_CAP);
    }
  });
});
