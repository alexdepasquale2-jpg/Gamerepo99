/** TileSource seam — stamp now, native gen later; renderer only sees this. */

import type { ChunkCoord, ChunkTiles } from './types';

export interface TileSource {
  readonly kind: 'stamp' | 'native';
  chunkSize: number;
  getChunk(coord: ChunkCoord): ChunkTiles;
  /** Stable hex fingerprint of layout + seed (for Probe / tests). */
  fingerprint(): string;
}

export type { ChunkCoord, ChunkTiles };
