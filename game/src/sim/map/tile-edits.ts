/** Per-chunk tile edits: the only terrain state that is saved (generated tiles never are). Pure. */
import { CHUNK_SIZE, TILE_PX } from './constants';
import { placeSettlements, placeSettlementsBase } from './world-layout';
import type { SettlementGen } from '../gen/places/settlements-gen';

export type TileEdits = Record<string, Record<string, string>>;
const chunkKey = (q: number, r: number) => `${Math.floor(q / CHUNK_SIZE)},${Math.floor(r / CHUNK_SIZE)}`;

export function setTileEdit(state: { tileEdits?: TileEdits }, q: number, r: number, biomeId: string): void {
  ((state.tileEdits ??= {})[chunkKey(q, r)] ??= {})[`${q},${r}`] = biomeId;
}

/** The edited biome id of one tile, if the land there was changed. */
export function editAt(edits: TileEdits | undefined, q: number, r: number): string | undefined {
  return edits?.[chunkKey(q, r)]?.[`${q},${r}`];
}

export function chunkEdits(edits: TileEdits | undefined, cx: number, cy: number): Record<string, string> | undefined {
  return edits?.[`${cx},${cy}`];
}

/** v2 -> v3: move a pixel point from the old map scale so it keeps its offset from the nearest town. */
export function rescalePoint(settlements: SettlementGen[], seed: number, x: number, y: number): { x: number; y: number } {
  const base = placeSettlementsBase(settlements, seed), now = placeSettlements(settlements, seed);
  if (!base.length) return { x, y };
  const q = x / TILE_PX, r = y / TILE_PX;
  let i = 0;
  base.forEach((b, j) => { if (Math.hypot(b.q - q, b.r - r) < Math.hypot(base[i]!.q - q, base[i]!.r - r)) i = j; });
  return { x: x + (now[i]!.q - base[i]!.q) * TILE_PX, y: y + (now[i]!.r - base[i]!.r) * TILE_PX };
}
