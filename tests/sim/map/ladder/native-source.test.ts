import { afterEach, describe, expect, it } from 'vitest';
import { generateWorld } from '../../../../src/sim/gen/world';
import { createStampRasterSource } from '../../../../src/sim/map/stamp-raster';
import { biomeAt } from '../../../../src/sim/map/terrain';
import { useTerrain } from '../../../../src/sim/map/ladder/mode';

afterEach(() => useTerrain('noise'));

describe('native (ladder) tile source', () => {
  it('flag switches source kind, fingerprint and biomes; river stays a vector', () => {
    const world = generateWorld({ seed: 42, includeAnchors: true, peopleCount: 60 });
    const stamp = createStampRasterSource(world, 42);
    useTerrain('ladder');
    const native = createStampRasterSource(world, 42);
    expect(stamp.kind).toBe('stamp');
    expect(native.kind).toBe('native');
    expect(native.fingerprint()).not.toBe(stamp.fingerprint());
    expect(native.getChunk({ cx: 2, cy: 2 }).tiles.length).toBeGreaterThan(0);
    expect(biomeAt(42, 100, Math.round(Math.sin(100 / 86 + 0.042) * 34 + Math.sin(100 / 31) * 7))).toBe('water');
  });

  it('builds chunks within the frame budget (cold, avg < 4 ms)', () => {
    const world = generateWorld({ seed: 42, includeAnchors: true, peopleCount: 60 });
    useTerrain('ladder');
    const src = createStampRasterSource(world, 42);
    const t0 = performance.now();
    let n = 0;
    for (let cy = 0; cy < 6; cy++) for (let cx = 0; cx < 6; cx++) { src.getChunk({ cx, cy }); n++; }
    expect((performance.now() - t0) / n).toBeLessThan(4);
  });
});
