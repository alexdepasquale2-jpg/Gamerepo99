import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/gen/world';
import { CHUNK_SIZE } from '../../../src/sim/map/constants';
import { createStampRasterSource } from '../../../src/sim/map/stamp-raster';
import { layoutWorld } from '../../../src/sim/map/world-layout';
import { getWorldRenderSnapshot } from '../../../src/sim/world-render-snapshot';

describe('snapshot from TileSource chunks', () => {
  it('settlement chunk snapshot has tiles and ≥3 towns', () => {
    const world = generateWorld({ seed: 7, peopleCount: 8 });
    const layout = layoutWorld(world, 7);
    const source = createStampRasterSource(world, 7);
    const first = layout.settlements[0];
    expect(first).toBeDefined();
    const cx = Math.floor(first!.q / CHUNK_SIZE);
    const cy = Math.floor(first!.r / CHUNK_SIZE);
    const snap = getWorldRenderSnapshot({
      source,
      chunks: [{ cx, cy }],
      day: 1,
      tick: 0,
      layout,
    });
    expect(snap.tiles.length).toBeGreaterThan(0);
    expect(snap.towns.length).toBeGreaterThanOrEqual(3);
    expect(snap.day).toBe(1);
    expect(snap.tick).toBe(0);
  });

  it('legacy dump opts still yield town markers', () => {
    const dump = [
      'settlement:ashford gap01=0.15',
      'settlement:lowmere gap01=0.25',
      'settlement:peat_ladder gap01=0.55',
    ].join('\n');
    const snap = getWorldRenderSnapshot({ dump, day: 2, tick: 3 });
    expect(snap.towns.length).toBeGreaterThanOrEqual(3);
    expect(snap.tiles).toEqual([]);
    expect(snap.day).toBe(2);
    expect(snap.tick).toBe(3);
  });
});
