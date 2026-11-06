/** Foot-Y depth helpers — Prism SPRITE_SORT (origin 0.5,1). */

import { SPRITE_SORT } from './asset-manifest';
import { TILE_PX } from '../sim/map/constants';

/** World pixel Y of the foot/contact point (= sprite origin after placement). */
export function footY(worldY: number): number {
  return worldY;
}

/** Apply bottom-center origin and depth = footY. */
export function applySpriteSort(obj: {
  setOrigin: (x: number, y: number) => unknown;
  setDepth: (d: number) => unknown;
  y: number;
}): void {
  obj.setOrigin(SPRITE_SORT.originX, SPRITE_SORT.originY);
  obj.setDepth(footY(obj.y));
}

/** Tile q,r → world pixel top-left. */
export function tileToWorld(q: number, r: number, tilePx = TILE_PX): { x: number; y: number } {
  return { x: q * tilePx, y: r * tilePx };
}

/** Tile q,r → foot contact at bottom-center of the cell. */
export function tileFootWorld(
  q: number,
  r: number,
  tilePx = TILE_PX,
): { x: number; y: number } {
  return { x: q * tilePx + tilePx / 2, y: r * tilePx + tilePx };
}
