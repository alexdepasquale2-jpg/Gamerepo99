/** Fords: shallow, sandy-bottomed crossings with stepping stones, visibly distinct from deep water and plank bridges. */
import { TILE_PX } from '../../sim/map/constants';
import { terrainHash } from '../../sim/map/terrain';

export const FORD_BIOME = 'ford';
export const FORD_SHALLOW = 0x78b9ae;
export const FORD_SAND = 0xd2bd86;
const STONE = [0x9a9a8c, 0xb1ae9c, 0x84857a];

type Gfx = {
  fillStyle: (color: number, alpha?: number) => Gfx;
  fillRect: (x: number, y: number, w: number, h: number) => Gfx;
  fillEllipse: (x: number, y: number, w: number, h: number) => Gfx;
};

/** Seeded stepping-stone layout for a ford tile (tile-local px). Pure, deterministic. */
export function fordStones(q: number, r: number): { x: number; y: number; w: number; h: number; color: number }[] {
  const n = 2 + Math.floor(terrainHash(0xf04d, q, r) * 2);
  return Array.from({ length: n }, (_, i) => ({
    x: 6 + terrainHash(0xa1, q * 7 + i, r) * (TILE_PX - 12),
    y: 6 + terrainHash(0xb2, q, r * 7 + i) * (TILE_PX - 12),
    w: 7 + Math.floor(terrainHash(0xc3, q + i, r) * 4),
    h: 5 + Math.floor(terrainHash(0xd4, q, r + i) * 3),
    color: STONE[Math.floor(terrainHash(0xe5, q + i, r + i) * STONE.length)]!,
  }));
}

export function paintFordTile(g: Gfx, q: number, r: number): void {
  const x = q * TILE_PX, y = r * TILE_PX;
  g.fillStyle(FORD_SHALLOW, 0.96).fillRect(x, y, TILE_PX, TILE_PX);
  // Sandy bed shows through the shallows.
  g.fillStyle(FORD_SAND, 0.55).fillEllipse(x + TILE_PX / 2, y + TILE_PX / 2, TILE_PX * 0.9, TILE_PX * 0.6);
  g.fillStyle(0xe9f4ee, 0.5).fillRect(x + 4, y + 9, 10, 2).fillRect(x + 17, y + 22, 9, 2);
  for (const s of fordStones(q, r)) {
    g.fillStyle(0x50625c, 0.5).fillEllipse(x + s.x, y + s.y + 2, s.w + 2, s.h);
    g.fillStyle(s.color, 1).fillEllipse(x + s.x, y + s.y, s.w, s.h);
  }
}
