/** Ferry pontoon lanes: a floating plank deck with rope rails, distinct from fords (shallows) and plank bridges. */
import { TILE_PX } from '../../sim/map/constants';
import { terrainHash } from '../../sim/map/terrain';

export const FERRY_BIOME = 'ferry';
export const FERRY_WATER = 0x407b91;
export const FERRY_DECK = 0x9b7448;
export const FERRY_PLANK = 0x7c5a36;
export const FERRY_ROPE = 0xd9c9a0;

type Gfx = {
  fillStyle: (color: number, alpha?: number) => Gfx;
  fillRect: (x: number, y: number, w: number, h: number) => Gfx;
};

/** Seeded plank seams for a ferry tile (tile-local px). Pure, deterministic. */
export function ferryPlanks(q: number, r: number): { x: number; y: number; w: number; h: number }[] {
  const horizontal = terrainHash(0xfe44, q >> 2, r >> 2) < 0.5;
  return Array.from({ length: 4 }, (_, i) => horizontal
    ? { x: 0, y: 2 + i * 8, w: TILE_PX, h: 1 }
    : { x: 2 + i * 8, y: 0, w: 1, h: TILE_PX });
}

export function paintFerryTile(g: Gfx, q: number, r: number): void {
  const x = q * TILE_PX, y = r * TILE_PX;
  g.fillStyle(FERRY_WATER, 0.94).fillRect(x, y, TILE_PX, TILE_PX);
  g.fillStyle(FERRY_DECK, 1).fillRect(x + 1, y + 1, TILE_PX - 2, TILE_PX - 2);
  for (const p of ferryPlanks(q, r)) g.fillStyle(FERRY_PLANK, 0.8).fillRect(x + p.x, y + p.y, p.w, p.h);
  // Rope lashings at the tile corners so adjoining tiles read as one pontoon.
  g.fillStyle(FERRY_ROPE, 0.9).fillRect(x + 1, y + 1, 4, 2).fillRect(x + TILE_PX - 5, y + 1, 4, 2).fillRect(x + 1, y + TILE_PX - 3, 4, 2).fillRect(x + TILE_PX - 5, y + TILE_PX - 3, 4, 2);
}
