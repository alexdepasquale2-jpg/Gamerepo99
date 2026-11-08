/** WorldRenderSnapshot — towns + TileSource chunk tiles/props. Pure. */

import type { TileSource, ChunkCoord } from './map/tile-source';
import type { FacilityRenderView, TileRenderView } from './map/types';
import type { WorldLayout } from './map/world-layout';
import { townsFromDump, type TownMarker } from './towns-from-dump';

export type WorldRenderSnapshot = {
  day: number;
  tick: number;
  towns: TownMarker[];
  tiles: TileRenderView[];
  facilities: FacilityRenderView[];
  mobiles: unknown[];
};

export type SnapshotFromDump = {
  dump: string;
  day?: number;
  tick?: number;
};

export type SnapshotFromChunks = {
  source: TileSource;
  chunks: ChunkCoord[];
  layout?: WorldLayout;
  day?: number;
  tick?: number;
  dump?: string;
};

export type SnapshotOpts = SnapshotFromDump | SnapshotFromChunks;

function townsFromLayout(layout: WorldLayout): TownMarker[] {
  return layout.settlements.map((s) => ({
    id: s.id,
    q: s.q,
    r: s.r,
  }));
}

function isChunkOpts(opts: SnapshotOpts): opts is SnapshotFromChunks {
  return 'source' in opts && Array.isArray((opts as SnapshotFromChunks).chunks);
}

/** Build snapshot from dump (legacy) and/or TileSource chunk set. */
export function getWorldRenderSnapshot(opts: SnapshotOpts): WorldRenderSnapshot {
  const day = opts.day ?? 1;
  const tick = opts.tick ?? 0;

  if (isChunkOpts(opts)) {
    const tiles: TileRenderView[] = [];
    const facilities: FacilityRenderView[] = [];
    for (const coord of opts.chunks) {
      const chunk = opts.source.getChunk(coord);
      tiles.push(...chunk.tiles);
      facilities.push(...chunk.props);
    }
    const towns = opts.layout
      ? townsFromLayout(opts.layout)
      : opts.dump
        ? townsFromDump(opts.dump)
        : [];
    return { day, tick, towns, tiles, facilities, mobiles: [] };
  }

  return {
    day,
    tick,
    towns: townsFromDump(opts.dump),
    tiles: [],
    facilities: [],
    mobiles: [],
  };
}
