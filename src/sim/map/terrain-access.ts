/** Shared collision/ground classification. Roads are safe crossings, settlements dry land. */
import { biomeAt, type Biome } from './terrain';
import { bresenhamLine, cellKey } from './corridor';
import type { WorldLayout } from './world-layout';

export function createTerrainAccess(layout: WorldLayout, seed: number, raster?: Map<string, unknown>) {
  const roads = new Set(raster?.keys());
  if (!raster) for (const route of layout.routes) for (let i = 1; i < route.path.length; i++) {
    const a = route.path[i - 1]!, b = route.path[i]!;
    for (const c of bresenhamLine(Math.round(a.q), Math.round(a.r), Math.round(b.q), Math.round(b.r))) roads.add(cellKey(c.q, c.r));
  }
  const inTown = (q: number, r: number) => layout.settlements.some((t) => Math.abs(q - t.q) <= 13 && Math.abs(r - t.r) <= 13);
  const biome = (q: number, r: number): Biome => inTown(q, r) ? 'meadow' : biomeAt(seed, q, r);
  const isBridge = (q: number, r: number) => roads.has(cellKey(q, r)) && biome(q, r) === 'water';
  // Two-cell deck accommodates diagonal road joins and the character's feet.
  const passable = (q: number, r: number): boolean => {
    if (biome(q, r) !== 'water') return true;
    for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) if (roads.has(cellKey(q + dq, r + dr))) return true;
    return false;
  };
  return { biome, isBridge, passable };
}
