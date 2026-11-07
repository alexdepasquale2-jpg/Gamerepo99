/** StampRasterSource — lazy chunk tiles/props over WorldLayout. Pure. */

import type { FabricWorld } from '../gen/world-types';
import { createRng } from '../rng';
import {
  CHUNK_SIZE,
  LAYOUT_JITTER,
  SPINE_SPACING,
  TILES_PER_MINUTE,
  WALK_MINUTES_SPINE,
} from './constants';
import { bresenhamLine, cellKey, type Cell } from './corridor';
import { fingerprintHex } from './fingerprint';
import type { TileSource } from './tile-source';
import type {
  ChunkCoord,
  ChunkTiles,
  FacilityRenderView,
  TileRenderView,
} from './types';
import { layoutWorld, type WorldLayout } from './world-layout';
import { createTerrainAccess } from './terrain-access';
import { terrainMode } from './terrain';
import { scatterProps, type ScatterCtx } from './ladder/scatter';
import { chunkEdits, type TileEdits } from './tile-edits';

const PROP_TYPES = ['field', 'mine', 'camp', 'waystation'] as const;
/** Tiles between wilderness props along a corridor. */
const PROP_INTERVAL = 48;
/** Extra padding around layout AABB for biome fill. */
const LAYOUT_PAD = 40;

type SparseRoad = Map<string, Cell>;

function layoutBBox(layout: WorldLayout): {
  q0: number;
  r0: number;
  q1: number;
  r1: number;
} {
  let q0 = Infinity;
  let r0 = Infinity;
  let q1 = -Infinity;
  let r1 = -Infinity;
  for (const s of layout.settlements) {
    q0 = Math.min(q0, s.q);
    r0 = Math.min(r0, s.r);
    q1 = Math.max(q1, s.q);
    r1 = Math.max(r1, s.r);
  }
  if (!Number.isFinite(q0)) return { q0: 0, r0: 0, q1: 0, r1: 0 };
  return {
    q0: q0 - LAYOUT_PAD,
    r0: r0 - LAYOUT_PAD,
    q1: q1 + LAYOUT_PAD,
    r1: r1 + LAYOUT_PAD,
  };
}

export function buildRoads(layout: WorldLayout): SparseRoad {
  const byId = new Map(layout.settlements.map((s) => [s.id, s]));
  const roads: SparseRoad = new Map();
  for (const route of layout.routes) {
    const from = byId.get(route.from);
    const to = byId.get(route.to);
    if (!from || !to) continue;
    for (let i = 1; i < route.path.length; i++) {
      const a = route.path[i - 1]!, b = route.path[i]!;
      for (const cell of bresenhamLine(Math.round(a.q), Math.round(a.r), Math.round(b.q), Math.round(b.r))) {
        roads.set(cellKey(cell.q, cell.r), cell);
      }
    }
  }
  return roads;
}

function buildProps(
  roads: SparseRoad,
  seed: number,
): FacilityRenderView[] {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const cells = [...roads.values()].sort(
    (a, b) => a.q - b.q || a.r - b.r,
  );
  const props: FacilityRenderView[] = [];
  for (let i = PROP_INTERVAL; i < cells.length; i += PROP_INTERVAL) {
    const cell = cells[i]!;
    const type = PROP_TYPES[rng.int(0, PROP_TYPES.length)]!;
    // Nudge one tile off the road so prop does not bury the ribbon.
    const side = rng.next() < 0.5 ? 1 : -1;
    const onQ = rng.next() < 0.5;
    const pq = onQ ? cell.q : cell.q + side;
    const pr = onQ ? cell.r + side : cell.r;
    props.push({
      id: `prop_${type}_${pq}_${pr}`,
      type,
      state: 'idle',
      warmth: 0.4,
      position: { x: pq, y: pr },
    });
  }
  return props;
}

/**
 * Seeded stamp TileSource: Bresenham corridors, lazy biome fill, road props.
 * Never allocates a full-world grid.
 */
export function createStampRasterSource(
  world: FabricWorld,
  seed: number,
  /** Live per-chunk tile edits (from SimState), applied over generated tiles. */
  edits?: () => TileEdits | undefined,
): TileSource {
  const layout = layoutWorld(world, seed);
  const roads = buildRoads(layout);
  const terrain = createTerrainAccess(layout, seed, roads);
  const props = buildProps(roads, seed);
  const bbox = layoutBBox(layout);
  const roadCells = [...roads.values()];
  const scatterCtx: ScatterCtx = {
    biome: terrain.biome,
    isRoad: (q, r) => roads.has(cellKey(q, r)),
    townDistance: (q, r) => Math.min(...layout.settlements.map((s) => Math.hypot(q - s.q, r - s.r))),
    roadDistance: (q, r, cap) => {
      let best = cap;
      for (const c of roadCells) { const d = Math.abs(c.q - q) + Math.abs(c.r - r); if (d < best) best = d; }
      return best;
    },
  };
  const fp = fingerprintHex([
    String(seed >>> 0),
    terrainMode(),
    String(CHUNK_SIZE),
    String(SPINE_SPACING),
    String(WALK_MINUTES_SPINE),
    String(TILES_PER_MINUTE),
    String(LAYOUT_JITTER),
    ...layout.settlements.map((s) => `${s.id}:${s.q},${s.r}`),
    ...layout.routes.map((r) => r.id),
  ]);

  return {
    kind: terrainMode() === 'ladder' ? 'native' : 'stamp',
    chunkSize: CHUNK_SIZE,
    fingerprint: () => fp,
    getChunk(coord: ChunkCoord): ChunkTiles {
      const { cx, cy } = coord;
      const tq0 = cx * CHUNK_SIZE;
      const tr0 = cy * CHUNK_SIZE;
      const tq1 = tq0 + CHUNK_SIZE;
      const tr1 = tr0 + CHUNK_SIZE;

      // Empty when chunk misses padded layout AABB.
      if (tq1 <= bbox.q0 || tq0 >= bbox.q1 || tr1 <= bbox.r0 || tr0 >= bbox.r1) {
        return { cx, cy, tiles: [], props: [] };
      }

      const qLo = Math.max(tq0, bbox.q0);
      const rLo = Math.max(tr0, bbox.r0);
      const qHi = Math.min(tq1, bbox.q1);
      const rHi = Math.min(tr1, bbox.r1);

      const tiles: TileRenderView[] = [];
      for (let r = rLo; r < rHi; r++) {
        for (let q = qLo; q < qHi; q++) {
          const key = cellKey(q, r);
          if (roads.has(key)) {
            tiles.push({ q, r, biomeId: terrain.isBridge(q, r) ? 'road_bridge' : 'road', warmth: 0.55 });
          } else {
            tiles.push({
              q,
              r,
              biomeId: terrain.isDeck(q, r) ? 'bridge_deck' : terrain.isFord(q, r) ? 'ford' : terrain.biome(q, r),
              warmth: 0.35,
            });
          }
        }
      }

      const chunkProps = props.filter(
        (p) =>
          p.position.x >= tq0 &&
          p.position.x < tq1 &&
          p.position.y >= tr0 &&
          p.position.y < tr1,
      );

      const edited = chunkEdits(edits?.(), cx, cy);
      if (edited) for (const t of tiles) { const b = edited[`${t.q},${t.r}`]; if (b) t.biomeId = b; }
      if (terrainMode() === 'ladder') chunkProps.push(...scatterProps(seed, tq0, tr0, CHUNK_SIZE, scatterCtx));
      return { cx, cy, tiles, props: chunkProps };
    },
  };
}
