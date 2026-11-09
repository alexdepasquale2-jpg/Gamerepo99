import { deriveRng } from '../sim/rng';
import type { GroundTile, HomeMap } from './types';

export const MAP_COLS = 42;
export const MAP_ROWS = 32;
export const TILE = 32;

function hash(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createLaMancha(seed: number): HomeMap {
  const cols = MAP_COLS;
  const rows = MAP_ROWS;
  const tiles: GroundTile[] = new Array(cols * rows).fill('dust');
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const rng = deriveRng(seed, 'mancha');

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const n = hash(seed, c, r);
      const nearCenter = Math.abs(c - cx) <= 4 && Math.abs(r - cy) <= 3;
      const onRoad = Math.abs(c - cx) <= 1 || Math.abs(r - cy) <= 0;
      if (nearCenter) {
        const edge = Math.abs(c - cx) === 4 || Math.abs(r - cy) === 3;
        tiles[i] = edge ? 'trim' : 'plaza';
        continue;
      }
      if (onRoad) {
        tiles[i] = 'path';
        continue;
      }
      if (n > 0.93 && Math.abs(c - cx) > 6) tiles[i] = 'olive';
      else if (n > 0.9 && Math.abs(c - cx) > 5) tiles[i] = 'stone';
      else if (n > 0.72) tiles[i] = 'scrub';
      else tiles[i] = rng.next() > 0.85 ? 'scrub' : 'dust';
    }
  }

  return { cols, rows, tile: TILE, tiles, width: cols * TILE, height: rows * TILE };
}

export function tileAt(map: HomeMap, x: number, y: number): GroundTile | null {
  const c = Math.floor(x / map.tile);
  const r = Math.floor(y / map.tile);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return null;
  return map.tiles[r * map.cols + c] ?? null;
}

export function tileBlocks(tile: GroundTile | null): boolean {
  return tile === null || tile === 'olive' || tile === 'stone';
}

export function circleBlocked(map: HomeMap, x: number, y: number, radius: number): boolean {
  const samples: Array<[number, number]> = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [-radius * 0.7, radius * 0.7],
    [radius * 0.7, -radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ];
  for (const [ox, oy] of samples) {
    if (tileBlocks(tileAt(map, x + ox, y + oy))) return true;
  }
  return false;
}

export function tryMove(map: HomeMap, body: { x: number; y: number }, radius: number, dx: number, dy: number): void {
  const nx = body.x + dx;
  if (!circleBlocked(map, nx, body.y, radius)) body.x = nx;
  const ny = body.y + dy;
  if (!circleBlocked(map, body.x, ny, radius)) body.y = ny;
}
