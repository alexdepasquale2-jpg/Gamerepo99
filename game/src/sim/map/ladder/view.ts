/** ASCII view of any ladder level over a tile window, with roads, river and towns stamped. Pure. */
import { bresenhamLine } from '../corridor';
import { isRiverAt } from '../terrain';
import type { WorldLayout } from '../world-layout';
import { AREA_GLYPH, ROAD, TOWN } from './glyphs';
import type { AsciiGrid } from './grid';
import { levelCell, type Ladder } from './refine';

export function ladderView(ladder: Ladder, layout: WorldLayout, seed: number, k: number, q0: number, r0: number, w: number, h: number): AsciiGrid {
  const cell = levelCell(k), cx0 = Math.floor(q0 / cell), cy0 = Math.floor(r0 / cell);
  const cells: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      const q = (cx0 + x) * cell + (cell >> 1), r = (cy0 + y) * cell + (cell >> 1);
      row.push(isRiverAt(seed, q, r) ? '~' : AREA_GLYPH[ladder.area(k, cx0 + x, cy0 + y)]);
    }
    cells.push(row);
  }
  const put = (x: number, y: number, c: string) => { const row = cells[y - cy0]; if (row && row[x - cx0] !== undefined) row[x - cx0] = c; };
  const at = (v: number) => Math.floor(v / cell);
  for (const route of layout.routes) for (let i = 1; i < route.path.length; i++) {
    const a = route.path[i - 1]!, b = route.path[i]!;
    for (const c of bresenhamLine(at(a.q), at(a.r), at(b.q), at(b.r))) put(c.q, c.r, ROAD);
  }
  for (const s of layout.settlements) put(at(s.q), at(s.r), TOWN);
  return { cellTiles: cell, q0: cx0 * cell, r0: cy0 * cell, w, h, rows: cells.map((r) => r.join('')) };
}
