import Phaser from 'phaser';
/** Mount/unmount stamp chunks into a Phaser scene. Presentation only. */

import type { ChunkCoord, TileSource } from '../sim';
import { CHUNK_SIZE } from '../sim/map/constants';
import {
  paintChunkContents,
  paintCliffStrip,
  paintLowerTerraceShade,
  paintProp,
  paintTownMarker,
  type PaintHost,
} from './painters/overworld-paint';

export type ChunkLayerHost = PaintHost;

export type ChunkLayer = {
  sync: (coords: ChunkCoord[]) => void;
  destroy: () => void;
};

/**
 * Stream TileSource chunks.
 * Ground tiles live in per-chunk containers (depth 0).
 * Towns / props / cliffs are scene children with foot-Y depth so they
 * sort correctly against the player (SPRITE_SORT).
 */
export function createChunkLayer(
  host: ChunkLayerHost,
  source: TileSource,
  townMarkers: { id: string; q: number; r: number }[],
): ChunkLayer {
  const mounted = new Map<string, Phaser.GameObjects.Container>();
  const keyOf = (c: ChunkCoord) => `${c.cx},${c.cy}`;
  const paintedPropIds = new Set<string>();

  // Scene-level stamps (null container → foot-Y depth joins player sort)
  for (const town of townMarkers) {
    paintTownMarker(host, null, town);
  }
  if (townMarkers[0]) {
    const t = townMarkers[0];
    const cq = t.q - 5;
    const cr = t.r + 4;
    paintCliffStrip(host, null, cq, cr, 18);
    paintLowerTerraceShade(host, null, cq, cr, 18, 7);
  }

  return {
    sync(coords: ChunkCoord[]) {
      const want = new Set(coords.map(keyOf));
      for (const [k, container] of mounted) {
        if (!want.has(k)) {
          container.destroy(true);
          mounted.delete(k);
        }
      }
      for (const coord of coords) {
        const k = keyOf(coord);
        if (mounted.has(k)) continue;
        const chunk = source.getChunk(coord);
        const painted = paintChunkContents(host, ensureFullChunkTiles(chunk));
        painted.setDepth(0);
        mounted.set(k, painted);

        for (const prop of chunk.props) {
          if (paintedPropIds.has(prop.id)) continue;
          paintedPropIds.add(prop.id);
          paintProp(host, null, prop);
        }
      }
    },
    destroy() {
      for (const c of mounted.values()) c.destroy(true);
      mounted.clear();
      paintedPropIds.clear();
    },
  };
}

function ensureFullChunkTiles(chunk: ReturnType<TileSource['getChunk']>) {
  const byKey = new Map(chunk.tiles.map((t) => [`${t.q},${t.r}`, t]));
  const baseQ = chunk.cx * CHUNK_SIZE;
  const baseR = chunk.cy * CHUNK_SIZE;
  const tiles = [...chunk.tiles];
  for (let r = 0; r < CHUNK_SIZE; r++) {
    for (let q = 0; q < CHUNK_SIZE; q++) {
      const qq = baseQ + q;
      const rr = baseR + r;
      const k = `${qq},${rr}`;
      if (!byKey.has(k)) {
        tiles.push({ q: qq, r: rr, biomeId: 'grass_fill', warmth: 0.45 });
      }
    }
  }
  return { ...chunk, tiles };
}
