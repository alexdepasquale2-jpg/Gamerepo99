/** Scatter/dress contexts for the ladder pass: biome, roads and towns seen from one layout. Pure. */
import { cellKey, type Cell } from '../corridor';
import type { TerrainAccess } from '../terrain-access';
import type { WorldLayout } from '../world-layout';
import type { ScatterCtx } from './scatter';
import type { DressCtx } from './dress';

export function ladderContexts(layout: WorldLayout, terrain: TerrainAccess, roads: Map<string, Cell>): { scatter: ScatterCtx; dress: DressCtx } {
  const roadCells = [...roads.values()];
  const scatter: ScatterCtx = {
    biome: terrain.biome,
    isRoad: (q, r) => roads.has(cellKey(q, r)),
    townDistance: (q, r) => Math.min(...layout.settlements.map((s) => Math.hypot(q - s.q, r - s.r))),
    roadDistance: (q, r, cap) => {
      let best = cap;
      for (const c of roadCells) { const d = Math.abs(c.q - q) + Math.abs(c.r - r); if (d < best) best = d; }
      return best;
    },
  };
  const dress: DressCtx = {
    biome: terrain.biome,
    isRoad: scatter.isRoad,
    townDistance: scatter.townDistance,
    towns: layout.settlements,
    nearestRoad: (q, r, cap) => {
      let best = cap, at: { q: number; r: number } | null = null;
      for (const c of roadCells) { const d = Math.abs(c.q - q) + Math.abs(c.r - r); if (d < best) { best = d; at = c; } }
      return at;
    },
  };
  return { scatter, dress };
}
