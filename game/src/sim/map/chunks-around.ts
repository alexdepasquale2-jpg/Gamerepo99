/** Pure camera → chunk coord helper for streaming. */

import type { ChunkCoord } from './types';

/**
 * Chunk coordinates covering the camera tile with a Chebyshev margin.
 * cameraQ/R are world tile coords (q=x, r=y).
 */
export function chunksAround(
  cameraQ: number,
  cameraR: number,
  chunkSize: number,
  margin: number,
): ChunkCoord[] {
  const size = Math.max(1, chunkSize | 0);
  const m = Math.max(0, margin | 0);
  const cx0 = Math.floor(cameraQ / size);
  const cy0 = Math.floor(cameraR / size);
  const out: ChunkCoord[] = [];
  for (let cy = cy0 - m; cy <= cy0 + m; cy++) {
    for (let cx = cx0 - m; cx <= cx0 + m; cx++) {
      out.push({ cx, cy });
    }
  }
  return out;
}
