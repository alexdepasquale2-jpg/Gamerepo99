/** AsciiGrid: one ladder level as rows of glyphs. Pure. */
export type AsciiGrid = {
  /** Tiles per cell side at this level. */
  cellTiles: number;
  /** Tile coords of cell (0,0)'s top-left corner. */
  q0: number;
  r0: number;
  w: number;
  h: number;
  rows: string[];
};

export const toAscii = (g: AsciiGrid): string => g.rows.join('\n');

export function glyphAt(g: AsciiGrid, x: number, y: number): string | undefined {
  return g.rows[y]?.[x];
}

/** Cell coords containing tile (q, r). */
export const cellOf = (g: AsciiGrid, q: number, r: number) => ({
  x: Math.floor((q - g.q0) / g.cellTiles),
  y: Math.floor((r - g.r0) / g.cellTiles),
});
