/**
 * Map ladder refinement: L0 (64-tile cells) -> L1 (16) -> L2 (4) -> L3 (1 tile).
 * "Diffusion-style", deterministic: each child starts from its nearest parents
 * (bilinear weight) plus seeded noise, then a majority pass denoises it.
 * Every cell is a pure function of (seed, level, x, y), so blocks match at seams
 * whatever order they are built in. Blocks are cached (LRU) per level.
 */
import { areaBiomeAt, type Biome } from '../terrain';
import { AREA_ORDER } from './glyphs';
import { WORLD_SCALE as S } from '../constants';
import { cellArea, L0_CELL } from './l0';

export const LADDER_FACTOR = 4;
export const LADDER_LEVELS = 3;
/** Tiles per cell side at level k. */
export const levelCell = (k: number): number => L0_CELL / LADDER_FACTOR ** k;

/** Noise added to bilinear parent weights (0 = pure blend, 1 = very ragged). */
const JITTER = 0.55;
const BLOCK = 32;
const MAX_BLOCKS = 512;

export type L0Area = (seed: number, X: number, Y: number) => Biome;
/** Default L0: the original area noise stretched by WORLD_SCALE, majority per 64-tile cell. */
export const sampledL0: L0Area = (seed, X, Y) => cellArea(seed, (X * L0_CELL) / S, (Y * L0_CELL) / S, L0_CELL / S, areaBiomeAt);

function hash(seed: number, k: number, x: number, y: number, i: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k * 31 + i, 2246822519) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export type Ladder = {
  /** Area index (into AREA_ORDER) of cell (x, y) at level k; cell coords are global (q / levelCell(k)). */
  areaIndex(k: number, x: number, y: number): number;
  area(k: number, x: number, y: number): Biome;
  /** Area biome of tile (q, r) at the finest level. */
  tileArea(q: number, r: number): Biome;
};

export function createLadder(seed: number, l0: L0Area = sampledL0): Ladder {
  const caches: Map<string, Uint8Array>[] = Array.from({ length: LADDER_LEVELS + 1 }, () => new Map());
  const l0Cache = new Map<string, number>();
  const lastBlock = caches.map(() => ({ bx: 0, by: 0, block: null as Uint8Array | null }));

  const level0 = (X: number, Y: number): number => {
    const key = `${X},${Y}`;
    let v = l0Cache.get(key);
    if (v === undefined) { v = AREA_ORDER.indexOf(l0(seed, X, Y)); l0Cache.set(key, v); }
    return v;
  };

  /** Seed + noise step: pick among the 4 nearest parents by jittered bilinear weight. */
  const raw = (k: number, x: number, y: number): number => {
    const u = (x + 0.5) / LADDER_FACTOR - 0.5, v = (y + 0.5) / LADDER_FACTOR - 0.5;
    const px = Math.floor(u), py = Math.floor(v), fx = u - px, fy = v - py;
    const cand = [
      [px, py, (1 - fx) * (1 - fy)], [px + 1, py, fx * (1 - fy)],
      [px, py + 1, (1 - fx) * fy], [px + 1, py + 1, fx * fy],
    ] as const;
    let best = 0, score = -Infinity;
    for (let i = 0; i < 4; i++) {
      const [cx, cy, w] = cand[i]!;
      const s = w + JITTER * (hash(seed, k, x, y, i) - 0.5);
      if (s > score) { score = s; best = areaIndex(k - 1, cx, cy); }
    }
    return best;
  };

  const buildBlock = (k: number, bx: number, by: number): Uint8Array => {
    const x0 = bx * BLOCK, y0 = by * BLOCK, W = BLOCK + 2;
    const pre = new Uint8Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) pre[j * W + i] = raw(k, x0 + i - 1, y0 + j - 1);
    // Denoise: 3x3 majority, centre counts double; ties keep the centre.
    const out = new Uint8Array(BLOCK * BLOCK);
    const votes = new Uint8Array(AREA_ORDER.length);
    for (let j = 0; j < BLOCK; j++) for (let i = 0; i < BLOCK; i++) {
      votes.fill(0);
      for (let dj = 0; dj < 3; dj++) for (let di = 0; di < 3; di++) votes[pre[(j + dj) * W + i + di]!]! += 1;
      const centre = pre[(j + 1) * W + i + 1]!;
      votes[centre]! += 1;
      let best = centre;
      for (let a = 0; a < votes.length; a++) if (votes[a]! > votes[best]!) best = a;
      out[j * BLOCK + i] = best;
    }
    return out;
  };

  function areaIndex(k: number, x: number, y: number): number {
    if (k <= 0) return level0(x, y);
    const bx = Math.floor(x / BLOCK), by = Math.floor(y / BLOCK);
    const last = lastBlock[k]!;
    if (last.block && last.bx === bx && last.by === by) return last.block[(y - by * BLOCK) * BLOCK + (x - bx * BLOCK)]!;
    const key = `${bx},${by}`;
    const cache = caches[k]!;
    let block = cache.get(key);
    if (block) { cache.delete(key); cache.set(key, block); }
    else {
      block = buildBlock(k, bx, by);
      cache.set(key, block);
      if (cache.size > MAX_BLOCKS) cache.delete(cache.keys().next().value!);
    }
    last.bx = bx; last.by = by; last.block = block;
    return block[(y - by * BLOCK) * BLOCK + (x - bx * BLOCK)]!;
  }

  return {
    areaIndex,
    area: (k, x, y) => AREA_ORDER[areaIndex(k, x, y)]!,
    tileArea: (q, r) => AREA_ORDER[areaIndex(LADDER_LEVELS, Math.floor(q), Math.floor(r))]!,
  };
}
