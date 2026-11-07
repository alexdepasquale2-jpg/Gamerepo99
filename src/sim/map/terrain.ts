/** Continuous seeded value noise; identical biomes for tiles, map and resources. */
import { WORLD_SCALE as S } from './constants';
import { createLadder, type Ladder } from './ladder/refine';
export type Biome = 'forest' | 'hills' | 'water' | 'fields' | 'meadow';
export const BIOME_COLOR: Record<Biome, number> = {
  forest: 0x304e32, hills: 0x777557, water: 0x407b91, fields: 0x999152, meadow: 0x69834a,
};
function hash(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(seed: number, q: number, r: number, scale: number): number {
  const x = q / scale, y = r / scale, ix = Math.floor(x), iy = Math.floor(y);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(seed, ix, iy) * (1 - fx) + hash(seed, ix + 1, iy) * fx;
  const b = hash(seed, ix, iy + 1) * (1 - fx) + hash(seed, ix + 1, iy + 1) * fx;
  return a * (1 - fy) + b * fy;
}
/** Row (tile r) of the river centre line at column q. */
export function riverRow(seed: number, q: number): number {
  return (Math.sin(q / (86 * S) + seed * 0.001) * 34 + Math.sin(q / (31 * S)) * 7) * S;
}
/** Seeded hash in [0,1) for terrain features such as fords. */
export function terrainHash(seed: number, x: number, y: number): number {
  return hash(seed, x, y);
}
/** Area biome without the river (lakes, hills, forest, fields, meadow). */
export function areaBiomeAt(seed: number, q: number, r: number): Biome {
  const wet = noise(seed ^ 0x19ab, q, r, 72);
  const elevation = noise(seed ^ 0x772f, q, r, 94) * 0.75 + noise(seed, q, r, 26) * 0.25;
  if (wet < 0.23) return 'water';
  if (elevation > 0.64) return 'hills';
  if (wet > 0.53) return 'forest';
  return elevation < 0.39 ? 'fields' : 'meadow';
}
export const isRiverAt = (seed: number, q: number, r: number): boolean => Math.abs(r - riverRow(seed, q)) < 2.6;
/** 'ladder' (default) = refined from the L0 grid (see ladder/); 'noise' = stretched noise per tile. */
export type TerrainMode = 'noise' | 'ladder';
let mode: TerrainMode = 'ladder';
export const terrainMode = (): TerrainMode => mode;
/** Set once at boot, before any terrain query. */
export function setTerrainMode(next: TerrainMode): void { mode = next; }
const ladders = new Map<number, Ladder>();
export function ladderFor(seed: number): Ladder {
  let l = ladders.get(seed);
  if (!l) { l = createLadder(seed); ladders.set(seed, l); }
  return l;
}
/** Cheap overview biome for maps: river + L1 (16-tile) ladder cells. */
export function coarseBiomeAt(seed: number, q: number, r: number): Biome {
  if (mode !== 'ladder') return biomeAt(seed, q, r);
  if (Math.abs(r - riverRow(seed, q)) < 8) return 'water';
  return ladderFor(seed).area(1, Math.floor(q / 16), Math.floor(r / 16));
}
export function biomeAt(seed: number, q: number, r: number): Biome {
  if (isRiverAt(seed, q, r)) return 'water';
  return mode === 'ladder' ? ladderFor(seed).tileArea(q, r) : areaBiomeAt(seed, q / S, r / S);
}
