import { afterEach, describe, expect, it } from 'vitest';
import { generateWorld } from '../../../../src/sim/gen/world';
import { createStampRasterSource } from '../../../../src/sim/map/stamp-raster';
import { layoutWorld } from '../../../../src/sim/map/world-layout';
import { biomeAt, riverRow, setTerrainMode } from '../../../../src/sim/map/terrain';

afterEach(() => setTerrainMode('ladder'));

describe('native (ladder) tile source', () => {
  it('flag switches source kind, fingerprint and biomes; river stays a vector', () => {
    const world = generateWorld({ seed: 42, includeAnchors: true, peopleCount: 60 });
    setTerrainMode('noise');
    const stamp = createStampRasterSource(world, 42);
    setTerrainMode('ladder');
    const native = createStampRasterSource(world, 42);
    expect(stamp.kind).toBe('stamp');
    expect(native.kind).toBe('native');
    expect(native.fingerprint()).not.toBe(stamp.fingerprint());
    const s0 = layoutWorld(world, 42).settlements[0]!;
    expect(native.getChunk({ cx: Math.floor(s0.q / 32), cy: Math.floor(s0.r / 32) }).tiles.length).toBeGreaterThan(0);
    expect(biomeAt(42, 100, Math.round(riverRow(42, 100)))).toBe('water');
  });

  // ~3 ms alone; the full suite runs one worker per core (vitest 5), which pushes it to ~14 ms on a 16-core PC.
  it('builds chunks within the frame budget (cold, avg < 20 ms under full-suite load; ~3 ms alone)', () => {
    const world = generateWorld({ seed: 42, includeAnchors: true, peopleCount: 60 });
    const src = createStampRasterSource(world, 42);
    const t0 = performance.now();
    let n = 0;
    const s0 = layoutWorld(world, 42).settlements[0]!, c0 = Math.floor(s0.q / 32), r0 = Math.floor(s0.r / 32);
    for (let cy = r0 - 3; cy < r0 + 3; cy++) for (let cx = c0 - 3; cx < c0 + 3; cx++) { src.getChunk({ cx, cy }); n++; }
    expect((performance.now() - t0) / n).toBeLessThan(20);
  });
});
