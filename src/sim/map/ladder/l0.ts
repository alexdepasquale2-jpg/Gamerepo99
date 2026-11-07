/** L0 world grid: today's terrain down-sampled to 64-tile cells, with roads and towns. Pure. */
import { bresenhamLine } from '../corridor';
import { biomeAt, type Biome } from '../terrain';
import type { WorldLayout } from '../world-layout';
import { AREA_GLYPH, AREA_ORDER, ROAD, TOWN } from './glyphs';
import { cellOf, type AsciiGrid } from './grid';

export const L0_CELL = 64;
const SAMPLES = 4;
const PAD_CELLS = 1;

/** Majority biome over a SAMPLES x SAMPLES lattice inside the cell (ties: AREA_ORDER). */
export function cellArea(seed: number, q0: number, r0: number, size: number, biome = biomeAt): Biome {
  const count = new Map<Biome, number>();
  const step = size / SAMPLES;
  for (let j = 0; j < SAMPLES; j++) for (let i = 0; i < SAMPLES; i++) {
    const b = biome(seed, Math.floor(q0 + (i + 0.5) * step), Math.floor(r0 + (j + 0.5) * step));
    count.set(b, (count.get(b) ?? 0) + 1);
  }
  let best: Biome = 'meadow', n = -1;
  for (const b of AREA_ORDER) if ((count.get(b) ?? 0) > n) { best = b; n = count.get(b) ?? 0; }
  return best;
}

export function buildL0(layout: WorldLayout, seed: number, cellTiles = L0_CELL): AsciiGrid {
  const qs = layout.settlements.map((s) => s.q), rs = layout.settlements.map((s) => s.r);
  const cq0 = Math.floor(Math.min(0, ...qs) / cellTiles) - PAD_CELLS;
  const cr0 = Math.floor(Math.min(0, ...rs) / cellTiles) - PAD_CELLS;
  const cq1 = Math.floor(Math.max(0, ...qs) / cellTiles) + PAD_CELLS;
  const cr1 = Math.floor(Math.max(0, ...rs) / cellTiles) + PAD_CELLS;
  const w = cq1 - cq0 + 1, h = cr1 - cr0 + 1;
  const g: AsciiGrid = { cellTiles, q0: cq0 * cellTiles, r0: cr0 * cellTiles, w, h, rows: [] };
  const cells: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) row.push(AREA_GLYPH[cellArea(seed, g.q0 + x * cellTiles, g.r0 + y * cellTiles, cellTiles)]);
    cells.push(row);
  }
  const put = (x: number, y: number, c: string) => { if (cells[y]?.[x] !== undefined) cells[y]![x] = c; };
  for (const route of layout.routes) for (let i = 1; i < route.path.length; i++) {
    const a = cellOf(g, route.path[i - 1]!.q, route.path[i - 1]!.r), b = cellOf(g, route.path[i]!.q, route.path[i]!.r);
    for (const c of bresenhamLine(a.x, a.y, b.x, b.y)) put(c.q, c.r, ROAD);
  }
  for (const s of layout.settlements) { const c = cellOf(g, s.q, s.r); put(c.x, c.y, TOWN); }
  g.rows = cells.map((r) => r.join(''));
  return g;
}
