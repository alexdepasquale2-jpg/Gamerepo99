import Phaser from 'phaser';
/** Mount/unmount stamp chunks into a Phaser scene. Presentation only. */

import type { ChunkCoord, TileSource } from '../sim';
import { CHUNK_SIZE } from '../sim/map/constants';
import {
  paintChunkContents,
  paintProp,
  paintTownCliff,
  paintTownMarker,
  type PaintHost,
} from './painters/overworld-paint';

export type ChunkLayerHost = PaintHost & { tweens?: Phaser.Tweens.TweenManager };

/** New chunks built per streamed sync (cold build ~2-3 ms each); the rest follow next frames. */
const BUILDS_PER_SYNC = 1;

export type ChunkLayer = {
  /** Mount `coords` (nearest first); returns true while some are still pending. `all` skips the budget. */
  sync: (coords: ChunkCoord[], all?: boolean) => boolean;
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
  /** Props are scene children (foot-Y sort), owned by their chunk so they unmount with it. */
  const chunkProps = new Map<string, Phaser.GameObjects.GameObject[]>();

  // Scene-level stamps (null container → foot-Y depth joins player sort)
  for (const town of townMarkers) {
    paintTownMarker(host, null, town);
  }
  if (townMarkers[0]) {
    paintTownCliff(host, townMarkers[0]);
  }

  return {
    sync(coords: ChunkCoord[], all = false) {
      const want = new Set(coords.map(keyOf));
      for (const [k, container] of mounted) {
        if (!want.has(k)) {
          container.destroy(true);
          mounted.delete(k);
          for (const o of chunkProps.get(k) ?? []) o.destroy();
          chunkProps.delete(k);
        }
      }
      const mid = coords[coords.length >> 1];
      const todo = coords.filter((c) => !mounted.has(keyOf(c)))
        .sort((a, b) => (mid ? Math.hypot(a.cx - mid.cx, a.cy - mid.cy) - Math.hypot(b.cx - mid.cx, b.cy - mid.cy) : 0));
      const budget = all ? todo.length : BUILDS_PER_SYNC;
      for (const coord of todo.slice(0, budget)) {
        const k = keyOf(coord);
        const chunk = source.getChunk(coord);
        const painted = paintChunkContents(host, ensureFullChunkTiles(chunk));
        painted.setDepth(0);
        mounted.set(k, painted);
        if (!all && host.tweens) {
          painted.setAlpha(0);
          host.tweens.add({ targets: painted, alpha: 1, duration: 160 });
        }

        chunkProps.set(k, chunk.props.flatMap((prop) => paintProp(host, null, prop)));
      }
      return todo.length > budget;
    },
    destroy() {
      for (const c of mounted.values()) c.destroy(true);
      mounted.clear();
      for (const objs of chunkProps.values()) for (const o of objs) o.destroy();
      chunkProps.clear();
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
