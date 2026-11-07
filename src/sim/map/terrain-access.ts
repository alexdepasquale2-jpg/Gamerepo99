/** Shared collision/ground classification. Roads are safe crossings, settlements dry land. */
import { biomeAt, riverRow, terrainHash, type Biome } from './terrain';
import { bresenhamLine, cellKey } from './corridor';
import type { WorldLayout } from './world-layout';

/** River fords: one candidate per FORD_SLOT columns, FORD_WIDTH columns wide. */
export const FORD_SLOT = 40;
export const FORD_WIDTH = 3;
const FORD_CHANCE = 0.7;
/** A ford is only laid where the whole wet run is this short (a true shallow). */
const FORD_MAX_RUN = 12;

export function createTerrainAccess(layout: WorldLayout, seed: number, raster?: Map<string, unknown>) {
  const roads = new Set(raster?.keys());
  if (!raster) for (const route of layout.routes) for (let i = 1; i < route.path.length; i++) {
    const a = route.path[i - 1]!, b = route.path[i]!;
    for (const c of bresenhamLine(Math.round(a.q), Math.round(a.r), Math.round(b.q), Math.round(b.r))) roads.add(cellKey(c.q, c.r));
  }
  const inTown = (q: number, r: number) => layout.settlements.some((t) => Math.abs(q - t.q) <= 13 && Math.abs(r - t.r) <= 13);
  const biome = (q: number, r: number): Biome => inTown(q, r) ? 'meadow' : biomeAt(seed, q, r);
  const isBridge = (q: number, r: number) => roads.has(cellKey(q, r)) && biome(q, r) === 'water';
  const isDeck = (q: number, r: number): boolean => {
    if (biome(q, r) !== 'water') return false;
    for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) if (roads.has(cellKey(q + dq, r + dr))) return true;
    return false;
  };
  // Fords: shallow crossings laid across the river where it is narrow enough to wade.
  // Each slot yields at most one strip; every wet cell of its columns (bank to bank) is ford.
  const slots = new Map<number, Set<string>>();
  const fordSlot = (slot: number): Set<string> => {
    const cached = slots.get(slot);
    if (cached) return cached;
    const cells = new Set<string>();
    slots.set(slot, cells);
    if (terrainHash(seed ^ 0xf04d, slot, 1) >= FORD_CHANCE) return cells;
    const q0 = slot * FORD_SLOT + 6 + Math.floor(terrainHash(seed ^ 0xf04d, slot, 2) * (FORD_SLOT - 12 - FORD_WIDTH));
    const strip: string[] = [];
    for (let q = q0; q < q0 + FORD_WIDTH; q++) {
      const mid = Math.round(riverRow(seed, q));
      if (biome(q, mid) !== 'water') return cells;
      let top = mid, bottom = mid;
      while (biome(q, top - 1) === 'water' && mid - top < FORD_MAX_RUN) top--;
      while (biome(q, bottom + 1) === 'water' && bottom - mid < FORD_MAX_RUN) bottom++;
      if (biome(q, top - 1) === 'water' || biome(q, bottom + 1) === 'water' || bottom - top + 1 > FORD_MAX_RUN) return cells;
      for (let r = top; r <= bottom; r++) strip.push(cellKey(q, r));
    }
    for (const k of strip) cells.add(k);
    return cells;
  };
  const isFord = (q: number, r: number): boolean =>
    biome(q, r) === 'water' && !isDeck(q, r) && fordSlot(Math.floor(q / FORD_SLOT)).has(cellKey(q, r));
  // Broad deck accommodates diagonal road joins and the character's feet.
  const passable = (q: number, r: number): boolean => {
    if (biome(q, r) !== 'water') return true;
    return isDeck(q, r) || isFord(q, r);
  };
  return { biome, isBridge, isDeck, isFord, passable };
}

export type TerrainAccess = ReturnType<typeof createTerrainAccess>;
