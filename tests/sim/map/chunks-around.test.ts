import { describe, expect, it } from 'vitest';
import { chunksAround } from '../../../src/sim/map/chunks-around';

describe('chunksAround', () => {
  it('returns expected coords for camera tile + margin', () => {
    // camera at tile (40, 10), chunkSize 32 → chunk (1, 0); margin 1 → 3×3
    const coords = chunksAround(40, 10, 32, 1);
    expect(coords).toEqual([
      { cx: 0, cy: -1 },
      { cx: 1, cy: -1 },
      { cx: 2, cy: -1 },
      { cx: 0, cy: 0 },
      { cx: 1, cy: 0 },
      { cx: 2, cy: 0 },
      { cx: 0, cy: 1 },
      { cx: 1, cy: 1 },
      { cx: 2, cy: 1 },
    ]);
  });

  it('margin 0 returns only the camera chunk', () => {
    expect(chunksAround(0, 0, 32, 0)).toEqual([{ cx: 0, cy: 0 }]);
  });
});
